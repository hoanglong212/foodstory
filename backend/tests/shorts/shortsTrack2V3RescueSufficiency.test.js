import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyShortsTrack2V3NumericContexts,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES as NUMERIC,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3NumericContextSafetyService.js'
import { applyShortsTrack2V3CandidateQualityGate } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'
import { evaluateShortsTrack2V3LateRescueSufficiency } from '../../src/services/shorts/track2-v3/shortsTrack2V3LateRescueSufficiencyService.js'
import { runShortsTrack2V3AsrFallback } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrFallbackService.js'

function classifications(text) {
  return classifyShortsTrack2V3NumericContexts({ text, sourceType: 'injected_test' })
}

function classFor(text, token) {
  return classifications(text).find((item) => item.rawNumberToken === token)?.contextClass
}

function visualCandidate(text, alternatives = []) {
  return {
    id: 'cand:test:0',
    type: 'OCR_ADDRESS_FRAGMENT',
    displayText: text,
    addressFragment: text,
    evidenceIds: ['ev:test:0'],
    houseNumberToken: alternatives[0] || null,
    houseNumberAlternatives: alternatives,
    riskFlags: ['OCR_ADDRESS_FRAGMENT', 'REVIEW_ONLY'],
    canAutoResolve: false,
  }
}

function gate(text, alternatives = []) {
  return applyShortsTrack2V3CandidateQualityGate({
    candidates: [visualCandidate(text, alternatives)],
    evidence: [{
      id: 'ev:test:0',
      sourceType: 'ocr_frame_full',
      rawText: text,
      normalizedText: text,
    }],
    intent: { mustNotResolve: true, intent: 'UNKNOWN' },
  })
}

function sufficiency(candidate) {
  return evaluateShortsTrack2V3LateRescueSufficiency({ candidates: candidate ? [candidate] : [] })
}

describe('Track 2 V3 source-neutral numeric context safety', () => {
  it('classifies explicit and promotional buffet numbers as prices', () => {
    assert.equal(classFor('Buffet 169 nghìn ở quận 1', '169'), NUMERIC.PRICE)
    assert.equal(classFor('Buffet 169 – Đầu tiên ở quận 1', '169'), NUMERIC.PRICE)
    assert.equal(classFor('Giá 169K', '169'), NUMERIC.PRICE)
    assert.equal(gate('Buffet 169 – Đầu tiên ở quận 1', ['169']).keptCandidateCount, 0)
  })

  it('preserves valid house-number structures', () => {
    for (const [text, token] of [
      ['169 Nguyễn Văn Cừ, Quận 5', '169'],
      ['169/2 Nguyễn Văn Cừ, Phường 2, Quận 5', '169/2'],
      ['4 Nguyễn Trãi, Quận 5', '4'],
    ]) {
      assert.equal(classFor(text, token), NUMERIC.HOUSE_NUMBER_LIKE)
      const result = gate(text, [token])
      assert.equal(result.keptCandidateCount, 1)
      assert.ok(result.candidates[0].houseNumberAlternatives.includes(token))
      assert.equal(result.candidates[0].canAutoResolve, false)
    }
  })

  it('classifies floor numbers without admitting them as house numbers', () => {
    for (const [text, token] of [
      ['tầng 4 TTTM Nowzone, Q.1', '4'],
      ['lầu 2 Vincom Quận 1', '2'],
      ['floor 3 Takashimaya', '3'],
    ]) {
      assert.equal(classFor(text, token), NUMERIC.FLOOR_OR_LEVEL)
      const result = gate(text, [token])
      assert.equal(result.keptCandidateCount, 0)
      assert.equal(result.floorNumberRejectedAsHouseNumberCount, 1)
    }
  })

  it('keeps a real address number while removing a separate floor alternative', () => {
    const text = '235 Nguyễn Văn Cừ, Quận 5, tầng 4'
    assert.equal(classFor(text, '235'), NUMERIC.HOUSE_NUMBER_LIKE)
    assert.equal(classFor(text, '4'), NUMERIC.FLOOR_OR_LEVEL)
    const result = gate(text, ['235', '4'])
    assert.equal(result.keptCandidateCount, 1)
    assert.deepEqual(result.candidates[0].houseNumberAlternatives, ['235'])
  })

  it('distinguishes hours, phone, list, and administrative numbers', () => {
    assert.equal(classFor('quán bán từ 18 giờ đến 2 giờ sáng', '18'), NUMERIC.OPENING_HOUR)
    assert.equal(classFor('gọi số 0901234567 để đặt bàn', '0901234567'), NUMERIC.PHONE)
    assert.equal(classFor('top 5 quán ngon ở quận 1', '5'), NUMERIC.LIST_OR_COUNT)
    assert.equal(classFor('quán ở quận 4', '4'), NUMERIC.ADMIN_NUMBER)
  })
})

describe('Track 2 V3 late rescue sufficiency', () => {
  it('treats strong metadata and visual full addresses as rescue sufficient', () => {
    const metadata = sufficiency({
      type: 'METADATA_ADDRESS',
      addressFragment: '160 Phạm Phú Thứ, P.4, Q.6',
      houseNumberAlternatives: ['160'],
      riskFlags: ['REVIEW_ONLY', 'METADATA_EVIDENCE'],
      canAutoResolve: false,
    })
    const visual = sufficiency({
      type: 'OCR_ADDRESS_FRAGMENT',
      addressFragment: '68/6 Lữ Gia, Quận 11',
      houseNumberAlternatives: ['68/6'],
      riskFlags: ['REVIEW_ONLY'],
      canAutoResolve: false,
    })
    assert.equal(metadata.lateRescueSufficient, true)
    assert.equal(visual.lateRescueSufficient, true)
  })

  it('does not let a single metadata address block rescue under a confirmed multi-place safety lock', () => {
    const result = evaluateShortsTrack2V3LateRescueSufficiency({
      candidates: [{
        type: 'METADATA_ADDRESS',
        addressFragment: '15 Phạm Sơn Khai, P. An Khánh, Q. Ninh Kiều, Cần Thơ',
        houseNumberAlternatives: ['15'],
        riskFlags: ['REVIEW_ONLY', 'METADATA_EVIDENCE'],
        canAutoResolve: false,
      }],
      intent: { mustNotResolve: true, intent: 'MULTI_PLACE_OR_LIST' },
    })

    assert.equal(result.lateRescueSufficient, false)
    assert.equal(result.lateRescueBlockingCandidateCount, 0)
    assert.equal(result.lateRescueCandidateEvaluations[0].reason, 'RESCUE_INSUFFICIENT_MULTI_PLACE_METADATA')
  })

  it('keeps partial, floor/place, price-context, and weak conflicts non-blocking', () => {
    const cases = [
      {
        type: 'OCR_ADDRESS_FRAGMENT',
        addressFragment: 'Ung Văn Khiêm, Bình Thạnh',
        riskFlags: ['PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY'],
      },
      {
        type: 'PLACE_LOCATION_FRAGMENT',
        displayText: 'tầng 4 TTTM Nowzone, Q.1',
        riskFlags: ['PLACE_LOCATION_FRAGMENT', 'REVIEW_ONLY'],
      },
      {
        type: 'OCR_ADDRESS_FRAGMENT',
        addressFragment: 'Buffet 169 – Đầu tiên ở quận 1',
        riskFlags: ['CONTEXT_NUMBER_REJECTED_AS_HOUSE_NUMBER', 'PRICE_CONTEXT_NUMBER', 'REVIEW_ONLY'],
      },
      {
        type: 'OCR_ADDRESS_FRAGMENT',
        addressFragment: '42 khu Bình Thạnh',
        houseNumberAlternatives: ['42', '43'],
        houseNumberConflict: true,
        riskFlags: ['HOUSE_NUMBER_CONFLICT', 'PARTIAL_ADDRESS', 'REVIEW_ONLY'],
      },
    ]
    for (const candidate of cases) {
      assert.equal(sufficiency(candidate).lateRescueSufficient, false)
    }
  })

  it('treats a structurally full ASR review candidate as sufficient without enabling auto resolve', () => {
    const candidate = {
      type: 'ASR_FULL_ADDRESS_REVIEW',
      addressFragment: '6A đường Tân Quý quận Tân Phú',
      houseNumberAlternatives: ['6A'],
      riskFlags: ['ASR_DERIVED_CANDIDATE', 'REVIEW_ONLY'],
      canAutoResolve: false,
    }
    const result = sufficiency(candidate)
    assert.equal(result.lateRescueSufficient, true)
    assert.equal(candidate.canAutoResolve, false)
  })

  it('skips ASR only for sufficient candidates and runs for non-blocking review evidence', async () => {
    let calls = 0
    const provider = async () => {
      calls += 1
      return {
        status: 'OK',
        called: true,
        provider: 'injected-asr',
        transcriptText: 'không có địa chỉ',
        segments: [{ start: 0, end: 1, text: 'không có địa chỉ' }],
        providerErrors: [],
      }
    }
    const config = { asrFallbackEnabled: true, asrModel: 'small', asrLanguage: 'vi' }
    const strong = await runShortsTrack2V3AsrFallback({
      config,
      deps: { track2V3AsrProvider: provider },
      existingCandidates: [{
        type: 'METADATA_ADDRESS',
        addressFragment: '160 Phạm Phú Thứ, P.4, Q.6',
        houseNumberAlternatives: ['160'],
        riskFlags: ['REVIEW_ONLY'],
      }],
    })
    assert.equal(strong.asrFallbackReason, 'RESCUE_SUFFICIENT')
    assert.equal(calls, 0)

    const partial = await runShortsTrack2V3AsrFallback({
      config,
      deps: { track2V3AsrProvider: provider },
      existingCandidates: [{
        type: 'OCR_ADDRESS_FRAGMENT',
        addressFragment: 'Ung Văn Khiêm, Bình Thạnh',
        riskFlags: ['PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY'],
      }],
    })
    assert.equal(calls, 1)
    assert.equal(partial.preAsrLateRescueSufficient, false)
    assert.equal(partial.preAsrLateRescueNonBlockingCandidateCount, 1)
  })
})
