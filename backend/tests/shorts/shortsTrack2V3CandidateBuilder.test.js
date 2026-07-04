import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildShortsTrack2V3Candidates } from "../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js";

function evidence(rawText, id = "ev:ocr:0") {
  return {
    id,
    source: "google_vision_text",
    sourceType: "ocr_frame_full",
    frameIndex: 0,
    timestampSeconds: 0,
    rawText,
    normalizedText: rawText,
    confidence: 0.9,
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
});
