import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildShortsTrack2V3Candidates } from "../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js";

function evidence(rawText, id = "ev:ocr:0", overrides = {}) {
  return {
    id,
    source: "google_vision_text",
    sourceType: "ocr_frame_full",
    frameIndex: 0,
    timestampSeconds: 0,
    rawText,
    normalizedText: rawText,
    confidence: 0.9,
    ...overrides,
  };
}

function build(rawText, intent = {}) {
  return buildShortsTrack2V3Candidates({
    evidence: [evidence(rawText)],
    intent: {
      mustNotResolve: false,
      ...intent,
    },
  });
}

function allCandidates(result) {
  return Array.isArray(result?.candidates) ? result.candidates : [];
}

function findCandidate(result, type, includes = []) {
  return allCandidates(result).find((candidate) => {
    if (candidate?.type !== type) return false;
    const text = [
      candidate.displayText,
      candidate.addressFragment,
      candidate.placeName,
    ]
      .filter(Boolean)
      .join(" ");
    return includes.every((part) => text.includes(part));
  });
}

describe("Track 2 V3 candidate builder", () => {
  it("builds a noisy OCR address fragment candidate", () => {
    const result = build("360 ). Phạm Văn Chí, Phường 4, Quận 6");
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", [
      "Phạm Văn Chí",
      "Phường 4",
      "Quận 6",
    ]);

    assert.ok(candidate, "expected OCR_ADDRESS_FRAGMENT candidate");
    assert.ok(candidate.riskFlags.includes("NOISY_OCR"));
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("builds a place plus partial address candidate", () => {
    const result = build("Xe xôi đêm\n1433/2 Phường 6 Quận 10");
    const candidate = findCandidate(result, "OCR_PLACE_PLUS_PARTIAL_ADDRESS", [
      "Xe xôi đêm",
      "1433/2",
      "Phường 6",
      "Quận 10",
    ]);

    assert.ok(candidate, "expected OCR_PLACE_PLUS_PARTIAL_ADDRESS candidate");
    assert.ok(candidate.riskFlags.includes("PARTIAL_ADDRESS"));
    assert.ok(candidate.riskFlags.includes("MISSING_STREET_NAME"));
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("builds a clean full address candidate as verify eligible", () => {
    const result = build("92C Cao Thắng, Phường 4, Quận 3, TP. HCM");
    const candidate = findCandidate(result, "FULL_ADDRESS_VERBATIM", [
      "92C",
      "Cao Thắng",
      "Phường 4",
      "Quận 3",
    ]);

    assert.ok(candidate, "expected FULL_ADDRESS_VERBATIM candidate");
    assert.ok(candidate.riskFlags.includes("VERIFY_ELIGIBLE"));
    assert.equal(candidate.canAutoResolve, true);
    assert.equal(candidate.qualityTier, "TIER_B");
  });

  it("downgrades clean full addresses to review-only OCR fragments when mustNotResolve", () => {
    const result = build(
      "92C Cao Thắng, Phường 4, Quận 3, TP. HCM",
      { mustNotResolve: true },
    );

    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", [
      "92C",
      "Cao Thắng",
      "Phường 4",
      "Quận 3",
    ]);

    assert.ok(candidate, "expected review-only OCR_ADDRESS_FRAGMENT candidate");
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
  });

  for (const [label, rawText] of [
    [
      "spaced place prefix",
      "QUÁN CHÁO 1K 221 Phan Văn Khe, Quận 6, TP HCM",
    ],
    [
      "joined place prefix",
      "QUÁNCHÁO 1K 221 Phan Văn Khe, Quận 6, TP HCM",
    ],
  ]) {
    it(`strips a ${label} from a strong embedded address`, () => {
      const result = build(rawText);
      const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", [
        "221 Phan Văn Khe",
        "Quận 6",
        "TP HCM",
      ]);

      assert.ok(candidate, "expected stripped OCR_ADDRESS_FRAGMENT candidate");
      assert.equal(candidate.addressFragment, "221 Phan Văn Khe, Quận 6, TP HCM");
      assert.doesNotMatch(candidate.addressFragment, /QUÁN|1K/u);
      assert.ok(candidate.riskFlags.includes("OCR_ADDRESS_FRAGMENT"));
      assert.ok(candidate.riskFlags.includes("OCR_PLACE_PREFIX_STRIPPED"));
      assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
      assert.equal(candidate.canAutoResolve, false);
    });
  }

  it("keeps a semicolon-delimited full address review-only in list context", () => {
    const result = build(
      "221 Phan Văn Khe; Quận 6; TP HCM",
      { mustNotResolve: true },
    );
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", [
      "221 Phan Văn Khe",
      "Quận 6",
      "TP HCM",
    ]);

    assert.ok(candidate);
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
  });

  for (const [label, rawText, expectedAddress] of [
    [
      "clean named ward and district",
      "242 Độc Lập, P. Tân Thành, Q. Tân Phú",
      "242 Độc Lập, Phường Tân Thành, Quận Tân Phú",
    ],
    [
      "F ward-marker OCR noise with hours",
      "242 Dc Lâp, F.Tân Thành, Q.Tân Phú 10:00-21:00",
      "242 Dc Lâp, Phường Tân Thành, Quận Tân Phú",
    ],
    [
      "F ward-marker OCR noise with trailing food title",
      "242 Dôc Lâp, F.Tân Thành, Q.Tân Phú 10:00-21:00 COM GÀ QUÝ DẦU",
      "242 Dôc Lâp, Phường Tân Thành, Quận Tân Phú",
    ],
    [
      "attached ward and district marker OCR noise",
      "242 Dộc Lập ETân Thành; @Tân Phú 1000-2100",
      "242 Dộc Lập, Tân Thành, Quận Tân Phú",
    ],
  ]) {
    it(`builds a review-only named-admin OCR candidate from ${label}`, () => {
      const result = build(rawText, { mustNotResolve: true });
      const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["242", "Tân Thành", "Tân Phú"]);

      assert.ok(candidate, "expected named-admin OCR_ADDRESS_FRAGMENT candidate");
      assert.equal(candidate.addressFragment, expectedAddress);
      assert.equal(candidate.extractionRule, "OCR_HOUSE_STREET_NAMED_ADMIN_REVIEW_ONLY");
      assert.ok(candidate.riskFlags.includes("OCR_NAMED_ADMIN_ADDRESS"));
      assert.ok(candidate.riskFlags.includes("OCR_NORMALIZED_ADMIN"));
      assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
      assert.equal(candidate.canAutoResolve, false);
      assert.doesNotMatch(candidate.addressFragment, /10:00|21:00|1000-2100|COM GÀ/u);
    });
  }

  it("accepts a strong named-admin address split across OCR lines", () => {
    const result = build("242 Dc Lâp, F.Tân Thành,\nQ.Tân Phú 10:00-21:00 COM GÀ QUÝ DẦU", {
      mustNotResolve: true,
    });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["242", "Tân Thành", "Tân Phú"]);

    assert.ok(candidate);
    assert.equal(candidate.addressFragment, "242 Dc Lâp, Phường Tân Thành, Quận Tân Phú");
    assert.equal(candidate.canAutoResolve, false);
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
  });

  for (const [label, rawText, expectedAddress] of [
    [
      "numeric district with a noisy ward marker and hours",
      "122 Vinh Khánh, E. Khánh Hôi (Quân 4 Cū) 16:00-24:00",
      "122 Vinh Khánh, Khánh Hôi, Quận 4",
    ],
    [
      "food title before a separated house and street",
      "TRẠM NƯỚNG BBQ 122 Vinh Khánh, E. Khánh Hội, Quận 4 16:00-24:00",
      "122 Vinh Khánh, Khánh Hội, Quận 4",
    ],
    [
      "joined house and camel-case street words",
      "56TrinhDinhTrong QuânTân Phú",
      "56 Trinh Dinh Trong, Quận Tân Phú",
    ],
    [
      "food prefix before a joined house and street",
      "Xôigà56 56TrinhDinhTrong QuânTân Phú",
      "56 Trinh Dinh Trong, Quận Tân Phú",
    ],
    [
      "separated house with joined named district",
      "56 Trinh Dinh Trong QuânTân Phú",
      "56 Trinh Dinh Trong, Quận Tân Phú",
    ],
    [
      "noisy ward marker with a joined named district",
      "122 Vinh Khánh, E. Khánh Hội, QuânTân Phú",
      "122 Vinh Khánh, Khánh Hội, Quận Tân Phú",
    ],
    [
      "numbered street with named ward and numeric district",
      "14 đường 63, P. Thạnh Mỹ Lợi, Q.2",
      "14 đường 63, Phường Thạnh Mỹ Lợi, Quận 2",
    ],
    [
      "compact OCR numbered street with compact named ward",
      "Ső14đuong63 P.Thanhmyloi-Q.2",
      "14 đuong 63, Phường Thanhmyloi, Quận 2",
    ],
  ]) {
    it(`builds a generalized noisy address from ${label}`, () => {
      const result = build(rawText, { mustNotResolve: true });
      const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", [expectedAddress]);

      assert.ok(candidate, "expected generalized named-admin OCR candidate");
      assert.equal(candidate.addressFragment, expectedAddress);
      assert.equal(candidate.extractionRule, "OCR_HOUSE_STREET_NAMED_ADMIN_REVIEW_ONLY");
      assert.ok(candidate.riskFlags.includes("OCR_NAMED_ADMIN_ADDRESS"));
      assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
      assert.equal(candidate.canAutoResolve, false);
      assert.doesNotMatch(candidate.addressFragment, /16:00|24:00|TRẠM NƯỚNG|Xôigà56/u);
    });
  }

  for (const rawText of [
    "TOP NHỮNG QUÁN ĂN BÁN GIÁ RẺ",
    "QUÁN CHÁO 1K",
    "Giá chỉ từ 25 ngàn",
    "1K",
    "Hotline 0901234567",
    "Mở cửa 10:00 - 22:00",
    "Ngày 12/06/2026",
    "Top quán ăn 6",
    "10:00-21:00",
    "15K",
    "CƠM GÀ QUÝ DẦU",
    "Tân Phú",
    "Q.Tân Phú",
    "0901234567",
    "TOP 10 QUÁN ĂN NGON",
    "56 món ngon Quận Tân Phú",
    "122K Vinh Khánh",
    "16:00-24:00 Quận 4",
    "Quận Tân Phú",
    "Top 56 món ngon",
    "56. Trinh Dinh Trong",
    "5GTrinhDinhTrong QuânTân Phú",
    "S6TrinhDinhTrong QuânTân Phú",
    "Số14đường63",
    "Số14đường63 P.Thanhmyloi",
  ]) {
    it(`rejects non-address OCR text: ${rawText}`, () => {
      const result = build(rawText, { mustNotResolve: true });
      assert.equal(result.candidateCount, 0);
      assert.deepEqual(result.candidates, []);
    });
  }

  it("does not build candidates from empty or useless evidence", () => {
    const result = build("ngon quá\năn liền");
    assert.equal(result.candidateCount, 0);
    assert.deepEqual(result.candidates, []);
  });
  it("preserves a house plus street partial as review-only composable evidence", () => {
    const result = build("242 Độc Lap,");
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["242", "Độc Lap"]);

    assert.ok(candidate, "expected house-street partial candidate to survive candidate emission");
    assert.ok(candidate.riskFlags.includes("PARTIAL_ADDRESS"));
    assert.ok(candidate.riskFlags.includes("MISSING_ADMIN_COMPONENT"));
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
    assert.ok(result.diagnostics.some((item) =>
      item.candidateText.includes("242 Độc Lap") && item.emitted === true
    ));
  });

  it("drops a one-off leading-digit OCR partial when a stronger full address supports the same street core", () => {
    const result = buildShortsTrack2V3Candidates({
      evidence: [
        evidence("4242 Dọc Lapy", "ev:ocr:4242", { timestampSeconds: 96.375, frameIndex: 57 }),
        evidence("/\n242 Doc Lap,\n[E.Tân Thành Q .Tân Phu\nl", "ev:ocr:242", { timestampSeconds: 99.375, frameIndex: 59 }),
      ],
      intent: { mustNotResolve: false },
    });

    assert.equal(result.candidateCount, 1);
    assert.equal(result.candidates[0].addressFragment, "242 Doc Lap, Tân Thành, Quận Tân Phu");
    assert.equal(result.candidates[0].canAutoResolve, false);
    assert.ok(result.candidates[0].riskFlags.includes("REVIEW_ONLY"));
  });

  it("does not subsume a distant partial from another listicle item with a different house number", () => {
    const result = buildShortsTrack2V3Candidates({
      evidence: [
        evidence("242 Doc Lap", "ev:listicle:partial", {
          episodeId: "episode-001",
          segmentId: "segment-001",
          frameIndex: 1,
          timestampSeconds: 1,
        }),
        evidence("1242 Doc Lap, Phường Tân Thành, Quận Tân Phú", "ev:listicle:full", {
          episodeId: "episode-001",
          segmentId: "segment-001",
          frameIndex: 90,
          timestampSeconds: 90,
        }),
      ],
      intent: { mustNotResolve: false },
    });

    assert.equal(result.candidateCount, 2);
    assert.ok(result.candidates.some((candidate) => candidate.addressFragment === "242 Doc Lap"));
    assert.ok(result.candidates.some((candidate) => candidate.addressFragment?.startsWith("1242 Doc Lap")));
  });

  it("does not create a multi-place aggregate from OCR variants of the same frame", () => {
    const result = buildShortsTrack2V3Candidates({
      evidence: [
        evidence("25 Duong Rgô)Thì NhậmXPhưỡng 4104 Lat, Phường 4", "ev:tesseract", {
          timestampSeconds: 34.125,
          source: "local_tesseract",
        }),
        evidence("25 Dudny NGO Thi Nhậm, Phưrông 4, a Lat", "ev:tesseract:variant", {
          timestampSeconds: 34.125,
          source: "local_tesseract",
        }),
      ],
      intent: { mustNotResolve: true, intent: "MULTI_PLACE_OR_LIST" },
    });

    assert.ok(!result.candidates.some((candidate) => candidate.type === "MULTI_PLACE_REVIEW"));
  });

  it("treats a bounded phusng OCR typo as admin evidence instead of house number 3", () => {
    const result = build("aPhusng,3 Binh, thant");

    assert.equal(result.candidateCount, 0);
    assert.ok(result.diagnostics.some((item) =>
      item.candidateText === "aPhusng,3 Binh, thant" &&
      item.signalClass === "ADMIN_PARTIAL" &&
      item.emitted === false
    ));
  });

  it("rejects a one-off implicit street fragment with an extra ambiguous numeric token", () => {
    const result = build("1100 ban tam 30 hấm");

    assert.equal(result.candidateCount, 0);
    assert.ok(result.diagnostics.some((item) =>
      item.candidateText === "1100 ban tam 30 hấm" && item.emitted === false
    ));
  });

  it("normalizes bracket and spaced OCR admin markers from the observed 242 Độc Lập crop", () => {
    const result = build("/\n242 Doc Lap,\n[E.Tân Thành Q .Tân Phu\nl", { mustNotResolve: true });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["242 Doc Lap", "Tân Thành", "Tân Phu"]);

    assert.ok(candidate, "expected noisy named-admin address candidate");
    assert.equal(candidate.addressFragment, "242 Doc Lap, Tân Thành, Quận Tân Phu");
    assert.ok(candidate.riskFlags.includes("OCR_NOISY_ADMIN_MARKER"));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("normalizes a bounded colon before a noisy E. admin marker", () => {
    const result = build("242 Doc Lap,\n:E.Tân Thành Q .Tân Phu", { mustNotResolve: true });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["242 Doc Lap", "Tân Thành", "Tân Phu"]);

    assert.ok(candidate, "expected colon-prefixed noisy named-admin address candidate");
    assert.equal(candidate.addressFragment, "242 Doc Lap, Tân Thành, Quận Tân Phu");
    assert.ok(candidate.riskFlags.includes("OCR_NOISY_ADMIN_MARKER"));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("does not promote a trailing OCR digit after an admin marker to house number", () => {
    const result = build("ms\nPhư\nong\n3: Binh\nT\nhanh\n3");

    assert.equal(result.candidateCount, 0);
    assert.ok(result.diagnostics.some((item) =>
      item.signalClass === "ADMIN_PARTIAL" &&
      item.features?.hasHouseNumber === false &&
      item.features?.wardValue === "3"
    ));
  });

  it("treats a colon after a split numeric ward marker as bounded admin delimiter", () => {
    const result = build("136 Van Kiet\nPhư\nong\n3: Binh\nT\nhanh\n3", { mustNotResolve: true });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["136 Van Kiet"]);

    assert.ok(candidate, "expected the observed split ward marker to preserve the address candidate");
    assert.ok(result.diagnostics.some((item) =>
      item.strongAddressAnchor === true && item.features?.wardValue === "3"
    ));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("normalizes a bounded phirong numeric ward typo from same-frame overlay evidence", () => {
    const result = build("45/9 Han Hai Nguyen\nPhirong16 Quan 11", { mustNotResolve: true });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["45/9 Han Hai Nguyen", "Phường 16", "Quận 11"]);

    assert.ok(candidate, "expected bounded phirong marker repair to preserve the observed address");
    assert.equal(candidate.addressFragment, "45/9 Han Hai Nguyen, Phường 16, Quận 11");
    assert.equal(candidate.canAutoResolve, false);
  });

  it("recognizes a bounded apostrophe after the phirong OCR ward marker", () => {
    const result = build("45/9 Han Hai Nguyen\nPhirong'16 Quan 11", { mustNotResolve: true });
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["45/9 Han Hai Nguyen", "Phirong'16", "Quan 11"]);

    assert.ok(candidate, "expected bounded phirong apostrophe marker repair");
    assert.ok(result.diagnostics.some((item) =>
      item.signalClass === "STRONG_ADDRESS_ANCHOR" &&
      item.features?.wardValue === "16" &&
      item.features?.districtValue === "11"
    ));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("keeps a bounded apostrophe-separated OCR slash house street partial review-only", () => {
    const result = build("45/9'Han Hai Nguyen");
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["45/9", "Han Hai Nguyen"]);

    assert.ok(candidate, "expected the bounded OCR separator to preserve house + street evidence");
    assert.equal(candidate.addressFragment, "45/9'Han Hai Nguyen");
    assert.ok(candidate.riskFlags.includes("PARTIAL_ADDRESS"));
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.equal(candidate.canAutoResolve, false);
  });

  it("subsumes a noisy same-frame house street partial when semantic fusion produced the stronger address", () => {
    const result = buildShortsTrack2V3Candidates({
      evidence: [
        evidence("| 18/8 Wàn Hai Nguyên „|", "ev:band:street", {
          frameIndex: 56,
          timestampSeconds: 54.375,
        }),
        evidence("18/8 Wàn Hai Nguyên, Phường 16, Quận 11", "ev:fused:0", {
          frameIndex: 56,
          timestampSeconds: 54.375,
          forceReviewOnly: true,
        }),
      ],
      intent: { mustNotResolve: true },
    });

    assert.ok(result.candidates.some((candidate) =>
      candidate.addressFragment === "18/8 Wàn Hai Nguyên, Phường 16, Quận 11"
    ));
    assert.ok(!result.candidates.some((candidate) =>
      candidate.addressFragment === "| 18/8 Wàn Hai Nguyên „|"
    ));
  });

  it("extracts a quoted OCR range address with a compact street token as review-only", () => {
    const result = build('Ls "95-97 AulCo, Quan 11 (gan quan 10)"');
    const candidate = findCandidate(result, "OCR_ADDRESS_FRAGMENT", ["95-97", "AulCo", "Quận 11"]);

    assert.ok(candidate, "expected the observed range address to survive a short junk prefix");
    assert.equal(candidate.canAutoResolve, false);
    assert.ok(candidate.riskFlags.includes("REVIEW_ONLY"));
    assert.ok(candidate.riskFlags.includes("OCR_PLACE_PREFIX_STRIPPED"));
  });

});
