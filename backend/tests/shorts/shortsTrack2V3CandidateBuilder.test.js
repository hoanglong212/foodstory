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

  it("honors mustNotResolve lock for clean full addresses", () => {
    const result = build(
      "92C Cao Thắng, Phường 4, Quận 3, TP. HCM",
      { mustNotResolve: true },
    );

    const candidate = findCandidate(result, "FULL_ADDRESS_VERBATIM", [
      "92C",
      "Cao Thắng",
      "Phường 4",
      "Quận 3",
    ]);

    assert.ok(candidate, "expected FULL_ADDRESS_VERBATIM candidate");
    assert.equal(candidate.canAutoResolve, false);
  });

  it("does not build candidates from empty or useless evidence", () => {
    const result = build("ngon quá\năn liền");
    assert.equal(result.candidateCount, 0);
    assert.deepEqual(result.candidates, []);
  });
});
