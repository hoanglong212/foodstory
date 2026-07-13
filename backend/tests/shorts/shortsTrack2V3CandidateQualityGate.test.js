import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import {
  applyShortsTrack2V3CandidateQualityGate,
  evaluateShortsTrack2V3CandidateQuality,
  rankShortsTrack2V3CandidatesForReview,
  SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS,
  SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'
import { analyzeShortsTrack2V3HouseNumberCandidate } from '../../src/services/shorts/track2-v3/shortsTrack2V3OcrHouseNumberSafetyService.js'

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
  it('does not assign one place house number to an aggregate multi-place review candidate', () => {
    const review = {
      id: 'cand:multi:0',
      type: 'MULTI_PLACE_REVIEW',
      displayText: '136 Van Kiet | 45/9 Han Hai Nguyen',
      addressFragment: null,
      evidenceIds: ['ev:136', 'ev:45'],
      riskFlags: ['MULTI_PLACE', 'REVIEW_ONLY'],
      canAutoResolve: false,
    }
    const analysis = analyzeShortsTrack2V3HouseNumberCandidate(review, [
      { ...evidence('136 Van Kiet', 'ev:136'), source: 'local_tesseract' },
      { ...evidence('45/9 Han Hai Nguyen', 'ev:45'), source: 'local_tesseract' },
    ])

    assert.equal(analysis.houseNumberToken, null)
    assert.deepEqual(analysis.houseNumberAlternatives, [])
    assert.equal(analysis.houseNumberConflict, false)
  })

  it('keeps address-anchored OCR fragments', () => {
    const decision = evaluate('350 D. Phạm Văn chí, Phường 4, Quận 6')

    assert.equal(decision.keep, true)
    assert.equal(decision.reason, SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED)
  })

  it('forces a strong address to review-only under a list safety lock', () => {
    const rawEvidence = evidence('221 Phan Văn Khe, Quận 6, TP HCM')
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: [candidate({
        type: 'FULL_ADDRESS_VERBATIM',
        displayText: rawEvidence.rawText,
        addressFragment: rawEvidence.rawText,
        riskFlags: ['VERIFY_ELIGIBLE'],
        canAutoResolve: true,
      })],
      evidence: [rawEvidence],
      intent: { mustNotResolve: true, intent: 'MULTI_PLACE_OR_LIST' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.equal(gateResult.candidates[0].canAutoResolve, false)
    assert.ok(gateResult.candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('keeps a source-validated noisy named-admin address review-only', () => {
    const rawEvidence = evidence('242 Dộc Lập ETân Thành; @Tân Phú 1000-2100')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: true },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: true, intent: 'MULTI_PLACE_OR_LIST' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.equal(
      gateResult.candidates[0].qualityGateReason,
      SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.NOISY_NAMED_ADMIN_ADDRESS,
    )
    assert.equal(gateResult.candidates[0].canAutoResolve, false)
    assert.ok(gateResult.candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  for (const rawText of [
    '122 Vinh Khánh, E. Khánh Hôi (Quân 4 Cū) 16:00-24:00 TRẠM NƯỚNG BBQ',
    'Xôigà56 56TrinhDinhTrong QuânTân Phú',
  ]) {
    it(`keeps generalized noisy address evidence review-only: ${rawText}`, () => {
      const rawEvidence = evidence(rawText)
      const rawCandidateResult = buildShortsTrack2V3Candidates({
        evidence: [rawEvidence],
        intent: { mustNotResolve: true },
      })
      const gateResult = applyShortsTrack2V3CandidateQualityGate({
        candidates: rawCandidateResult.candidates,
        evidence: [rawEvidence],
        intent: { mustNotResolve: true },
      })

      assert.equal(gateResult.keptCandidateCount, 1)
      assert.equal(
        gateResult.candidates[0].qualityGateReason,
        SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.NOISY_NAMED_ADMIN_ADDRESS,
      )
      assert.equal(gateResult.candidates[0].canAutoResolve, false)
      assert.ok(gateResult.candidates[0].riskFlags.includes('REVIEW_ONLY'))
    })
  }

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

  it('drops a garbage-flagged implicit street made from generic caption words', () => {
    const rawText = '_ 100 nha moi người'
    const item = evidence(rawText)
    item.confidence = 0.71
    item.providerMetadata = {
      bestAddressLine: rawText,
      qualityFlags: ['OCR_GARBAGE_TOKENS'],
    }
    const decision = evaluateShortsTrack2V3CandidateQuality({
      candidate: candidate({
        displayText: rawText,
        addressFragment: rawText,
      }),
      evidence: [item],
      intent: { mustNotResolve: false, intent: 'UNKNOWN' },
    })

    assert.equal(decision.keep, false)
    assert.equal(
      decision.reason,
      SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.WEAK_IMPLICIT_STREET_PARTIAL,
    )
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

  for (const fixture of [
    {
      text: 'Goi ngay met full topping va..xin 161 mol người,mình',
      flags: [],
      confidence: 0.84,
    },
    {
      text: '_ 100 nha moi người',
      flags: ['OCR_GARBAGE_TOKENS'],
      confidence: 0.71,
    },
    {
      text: '6 nuối i clip nha',
      flags: [],
      confidence: 0.64,
    },
    {
      text: '- 000 sốtttng MUG',
      flags: ['LOW_PROVIDER_CONFIDENCE'],
      confidence: 0.29,
    },
  ]) {
    it(`drops weak caption-shaped implicit street partials: ${fixture.text}`, () => {
      const rawEvidence = {
        ...evidence(fixture.text),
        confidence: fixture.confidence,
        providerMetadata: {
          lowConfidence: true,
          qualityFlags: fixture.flags,
        },
      }
      const rawCandidateResult = buildShortsTrack2V3Candidates({
        evidence: [rawEvidence],
        intent: { mustNotResolve: false },
      })
      const gateResult = applyShortsTrack2V3CandidateQualityGate({
        candidates: rawCandidateResult.candidates,
        evidence: [rawEvidence],
        intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
      })

      assert.equal(gateResult.keptCandidateCount, 0)
      assert.ok(gateResult.decisions.some((decision) =>
        decision.reason === SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.WEAK_IMPLICIT_STREET_PARTIAL
      ))
    })
  }

  for (const recipeText of [
    '2m đường',
    '1/2m hat nêm',
    '1/2m hat nêm\n3m đường\n2m nước mắm\n2m nước tương',
  ]) {
    it(`drops measurement and ingredient OCR context before it becomes an address partial: ${recipeText}`, () => {
      const rawEvidence = evidence(recipeText)
      const rawCandidateResult = buildShortsTrack2V3Candidates({
        evidence: [rawEvidence],
        intent: { mustNotResolve: false },
      })
      const gateResult = applyShortsTrack2V3CandidateQualityGate({
        candidates: rawCandidateResult.candidates,
        evidence: [rawEvidence],
        intent: { mustNotResolve: false, intent: 'NO_ADDRESS_INTENT' },
      })

      assert.equal(rawCandidateResult.candidates.length, 0)
      assert.equal(gateResult.keptCandidateCount, 0)
    })
  }

  it('preserves an alphanumeric house followed by a real named street and admin context', () => {
    const rawEvidence = evidence('2M đường Nguyễn Văn Cừ, Phường 4, Quận 5')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.match(gateResult.candidates[0].displayText, /2M đường Nguyễn Văn Cừ/u)
  })

  it('drops weak OCR address partials under a relevant negative intent', () => {
    const rawEvidence = evidence('n 4\nHN\na St\nX #\nTe')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: {
        mustNotResolve: false,
        intent: 'NO_ADDRESS_INTENT',
        inputClass: 'RELEVANT_NEGATIVE',
      },
    })

    assert.equal(gateResult.keptCandidateCount, 0)
    assert.ok(gateResult.decisions.some((decision) =>
      decision.reason === SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NON_FOOD_NEGATIVE
    ))
  })

  it('preserves a strong full address even when metadata initially suggested a negative intent', () => {
    const rawEvidence = evidence('105 Nguyễn Văn Cừ, Phường 4, Quận 5')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: {
        mustNotResolve: false,
        intent: 'NO_ADDRESS_INTENT',
        inputClass: 'RELEVANT_NEGATIVE',
      },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.equal(gateResult.candidates[0].qualityGateReason, 'CLEAN_FULL_ADDRESS')
  })

  it('keeps a clean observed house-street partial after weak-caption filtering', () => {
    const rawEvidence = evidence('242 Độc Lap')
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.equal(gateResult.candidates[0].qualityGateReason, 'PARTIAL_HOUSE_STREET_REVIEW')
  })

  it('drops a low-confidence one-off single-digit implicit-street OCR partial', () => {
    const rawEvidence = evidence('9 Phướế Hale -')
    rawEvidence.source = 'local_tesseract'
    rawEvidence.sourceType = 'smart_overlay_dynamic_text_region'
    rawEvidence.confidence = 0.2628
    rawEvidence.supportCount = 1
    rawEvidence.providerMetadata = { qualityFlags: ['LOW_PROVIDER_CONFIDENCE'] }
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
    })

    assert.equal(gateResult.keptCandidateCount, 0)
    assert.equal(gateResult.droppedCandidates[0].reason, 'WEAK_IMPLICIT_STREET_PARTIAL')
  })

  it('keeps a noisy multi-frame Vietnamese house-street partial for review only', () => {
    const rawEvidence = evidence('775-97 Âu Cơ, Quận (gần Quận 10)')
    rawEvidence.source = 'local_tesseract'
    rawEvidence.sourceType = 'smart_overlay_dynamic_text_region'
    rawEvidence.confidence = 0.3736
    rawEvidence.supportCount = 2
    rawEvidence.providerMetadata = {
      lowConfidence: true,
      bestAddressLine: '775-97 Âu Cơ, Quận (gần Quận 10)',
      qualityFlags: ['OCR_GARBAGE_TOKENS'],
    }
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.equal(gateResult.candidates[0].qualityGateReason, 'PARTIAL_HOUSE_STREET_REVIEW')
    assert.equal(gateResult.candidates[0].canAutoResolve, false)
  })

  it('drops an implicit-street partial when low-confidence OCR only selected the number as its best line', () => {
    const rawEvidence = evidence('08\nDoc Pas')
    rawEvidence.source = 'local_tesseract'
    rawEvidence.sourceType = 'smart_overlay_dynamic_text_region'
    rawEvidence.confidence = 0.8839
    rawEvidence.supportCount = 3
    rawEvidence.providerMetadata = {
      lowConfidence: true,
      bestAddressLine: '08',
      qualityFlags: ['LINE_BAND_RESCUE', 'LOW_PROVIDER_CONFIDENCE'],
    }
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: [rawEvidence],
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: [rawEvidence],
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY' },
    })

    assert.equal(gateResult.keptCandidateCount, 0)
    assert.equal(gateResult.droppedCandidates[0].reason, 'WEAK_IMPLICIT_STREET_PARTIAL')
  })

  it('keeps the higher-confidence nearby range-address observation in single-place context', () => {
    const evidenceItems = [
      {
        ...evidence('Ls "95-97 AulCo, Quan 11 (gan quan 10)"', 'ev:range:good'),
        timestampSeconds: 23.625,
        confidence: 0.535,
        providerMetadata: { qualityFlags: ['OCR_GARBAGE_TOKENS', 'LOW_PROVIDER_CONFIDENCE'] },
      },
      {
        ...evidence('ỉ 775-97 AulCơ, Quant (gan quan 10)', 'ev:range:mutation'),
        timestampSeconds: 24.375,
        confidence: 0.374,
        providerMetadata: { qualityFlags: ['OCR_GARBAGE_TOKENS', 'LOW_PROVIDER_CONFIDENCE'] },
      },
    ]
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: evidenceItems,
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: evidenceItems,
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY', inputClass: 'SINGLE_PLACE' },
    })

    assert.equal(gateResult.keptCandidateCount, 1)
    assert.match(gateResult.candidates[0].displayText, /^95-97\s+AulCo/iu)
    assert.equal(gateResult.candidates[0].canAutoResolve, false)
  })

  it('drops a partial OCR shape after numeric safety rejects its only house number', () => {
    const evidenceItems = [{
      ...evidence('n 4\nHN\na St\nX #\nTe', 'ev:rejected-house'),
      confidence: 0.37,
      providerMetadata: {
        qualityFlags: ['OCR_GARBAGE_TOKENS', 'LOW_PROVIDER_CONFIDENCE'],
        bestAddressLine: 'n 4',
      },
    }]
    const rawCandidateResult = buildShortsTrack2V3Candidates({
      evidence: evidenceItems,
      intent: { mustNotResolve: false },
    })
    const gateResult = applyShortsTrack2V3CandidateQualityGate({
      candidates: rawCandidateResult.candidates,
      evidence: evidenceItems,
      intent: { mustNotResolve: false, intent: 'SINGLE_PLACE_LIKELY', inputClass: 'SINGLE_PLACE' },
    })

    assert.equal(gateResult.keptCandidateCount, 0)
  })

  it('ranks a semantically complete ASR full-address review above a noisy OCR mutation', () => {
    const ranked = rankShortsTrack2V3CandidatesForReview([
      candidate({
        id: 'cand:ocr:bad',
        addressFragment: '13098 I Gam Mộc P4 D8 |',
        displayText: '13098 I Gam Mộc P4 D8 |',
        qualityGateReason: 'ADDRESS_ANCHORED',
        riskFlags: ['NOISY_OCR', 'LOW_CONFIDENCE_OCR', 'REVIEW_ONLY'],
      }),
      candidate({
        id: 'cand:asr:good',
        type: 'ASR_FULL_ADDRESS_REVIEW',
        addressFragment: '148 đường đào cam 1 Phường 4 quận 8',
        displayText: '148 đường đào cam 1 Phường 4 quận 8',
        qualityGateReason: 'ASR_FULL_ADDRESS_REVIEW',
        riskFlags: ['ASR_TRANSCRIPT_EVIDENCE', 'REVIEW_ONLY'],
      }),
    ])

    assert.equal(ranked[0].id, 'cand:asr:good')
  })

  it('keeps metadata addresses ahead of rescue candidates in final review ranking', () => {
    const ranked = rankShortsTrack2V3CandidatesForReview([
      candidate({
        id: 'cand:asr:0',
        type: 'ASR_FULL_ADDRESS_REVIEW',
        addressFragment: '148 Đào Cam Mộc, Phường 4, Quận 8',
        displayText: '148 Đào Cam Mộc, Phường 4, Quận 8',
        qualityGateReason: 'ASR_FULL_ADDRESS_REVIEW',
      }),
      candidate({
        id: 'metadata:0',
        type: 'METADATA_ADDRESS',
        addressFragment: '260 Tân Hương, Phường Phú Thọ Hòa, TP.HCM',
        displayText: '260 Tân Hương, Phường Phú Thọ Hòa, TP.HCM',
        riskFlags: ['METADATA_EVIDENCE', 'REVIEW_ONLY'],
      }),
    ])

    assert.equal(ranked[0].id, 'metadata:0')
  })
})
