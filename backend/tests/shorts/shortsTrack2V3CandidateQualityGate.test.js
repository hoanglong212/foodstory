import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import {
  applyShortsTrack2V3CandidateQualityGate,
  evaluateShortsTrack2V3CandidateQuality,
  SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS,
  SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'

function evidence(rawText, id = 'ev:ocr:0') {
  return {
    id,
    source: 'google_vision_text',
    sourceType: 'ocr_frame_full',
    frameIndex: 0,
    timestampSeconds: 0,
    rawText,
    normalizedText: rawText,
    confidence: 0.9,
  }
}

function candidate(overrides = {}) {
  return {
    id: 'cand:test:0',
    type: 'OCR_ADDRESS_FRAGMENT',
    displayText: '',
    evidenceIds: ['ev:ocr:0'],
    riskFlags: ['REVIEW_ONLY'],
    canAutoResolve: false,
    ...overrides,
  }
}

function evaluate(displayText, overrides = {}) {
  const item = candidate({
    displayText,
    ...overrides,
  })

  return evaluateShortsTrack2V3CandidateQuality({
    candidate: item,
    evidence: [evidence(displayText)],
    intent: {
      mustNotResolve: false,
      intent: 'UNKNOWN',
    },
  })
}

describe('Track 2 V3 candidate quality gate', () => {
  it('keeps address-anchored OCR fragments', () => {
    const decision = evaluate('350 D. Phạm Văn chí, Phường 4, Quận 6')

    assert.equal(decision.keep, true)
    assert.equal(decision.reason, SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED)
  })

  it('keeps place plus partial address candidates with review-only risk flags', () => {
    const rawEvidence = evidence('Xe xôi đêm\n1433/2 Phường 6 Quận 10')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: {
        mustNotResolve: false,
      },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: {
        mustNotResolve: false,
        intent: 'UNKNOWN',
      },
    })
    const kept = gateResult.candidates.find((item) => item.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS')

    assert.ok(kept)
    assert.equal(kept.qualityGateReason, SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PLACE_PLUS_ADDRESS)
    assert.ok(kept.displayText.includes('Xe xôi đêm'))
    assert.ok(kept.displayText.includes('1433/2'))
    assert.ok(kept.riskFlags.includes('PARTIAL_ADDRESS'))
    assert.ok(kept.riskFlags.includes('MISSING_STREET_NAME'))
    assert.ok(kept.riskFlags.includes('REVIEW_ONLY'))
  })

  it('drops generic food intro text', () => {
    const decision = evaluate('QUÁN BÁNH CANH NÊN THỬ 1 LẦN')

    assert.equal(decision.keep, false)
    assert.ok([
      SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.GENERIC_FOOD_TEXT_ONLY,
      SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.INTRO_OR_CAPTION_ONLY,
    ].includes(decision.reason))
  })

  it('drops menu, price, and time text without address anchors', () => {
    const decision = evaluate('1. Bánh canh 350K 17:00-21:00')

    assert.equal(decision.keep, false)
    assert.equal(decision.reason, SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.MENU_PRICE_TIME_ONLY)
  })

  it('drops intro/caption-only OCR text', () => {
    const decision = evaluate('Sài Gòn Về Đêm Thường sẽ thêm gì nhất?')

    assert.equal(decision.keep, false)
    assert.equal(decision.reason, SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.INTRO_OR_CAPTION_ONLY)
  })

  it('drops standalone place names without address evidence', () => {
    const decision = evaluate('Phở Dậu', {
      type: 'PLACE_NAME_ONLY',
      placeName: 'Phở Dậu',
      addressFragment: null,
      riskFlags: ['PLACE_NAME_ONLY', 'REVIEW_ONLY'],
    })

    assert.equal(decision.keep, false)
    assert.equal(decision.reason, SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.PLACE_NAME_ONLY_WITHOUT_ADDRESS)
  })
})
