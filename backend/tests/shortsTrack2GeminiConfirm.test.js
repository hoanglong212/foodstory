import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  confirmTrack2AsrAddressWithGemini,
  confirmTrack2OcrAddressWithGemini,
  confirmTrack2PlaceInferenceWithGemini,
} from '../src/services/shortsTrack2GeminiConfirmService.js'

function candidate(overrides = {}) {
  return {
    sourceType: 'ocr_frame',
    candidateAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    normalizedAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    rawText: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
    riskFlags: [],
    ...overrides,
  }
}

function asrCandidate(overrides = {}) {
  return candidate({
    sourceType: 'asr_transcript',
    rawText: 'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3',
    extractionRule: 'ASR_EXPLICIT_ADDRESS_LABEL',
    transcriptConfidence: 0.9,
    ...overrides,
  })
}

function clean(overrides = {}) {
  return {
    status: 'OK',
    normalizedAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    disallowedRepairDetected: false,
    ...overrides,
  }
}

function places(overrides = {}) {
  return {
    status: 'PLACES_CANDIDATES_RETURNED',
    candidates: [
      {
        placeId: 'place-123',
        displayName: 'OCR Cafe',
        formattedAddress: '92C Cao Thang, District 3, Ho Chi Minh City',
      },
    ],
    diagnostics: [],
    ...overrides,
  }
}

function placeSignals(overrides = {}) {
  return {
    status: 'OK',
    signals: {
      placeNames: ['Quan Com Ba Hoa'],
      areas: ['Quan 5'],
      dishes: ['com'],
      sourceFields: ['title'],
      ...overrides,
    },
  }
}

function rankedCandidate(overrides = {}) {
  return {
    sourceType: 'place_name_inference',
    placeId: 'place-inferred-1',
    displayName: 'Quan Com Ba Hoa',
    formattedAddress: '12 Duong A, Quan 5, Ho Chi Minh',
    primaryType: 'restaurant',
    businessStatus: 'OPERATIONAL',
    score: 0.91,
    scoreBreakdown: { name: 1, area: 1 },
    riskFlags: [],
    ...overrides,
  }
}

describe('shortsTrack2GeminiConfirm', () => {
  it('missing geminiClient returns UNAVAILABLE / UNSURE', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.decision, 'UNSURE')
    assert.equal(result.reason, 'GEMINI_CLIENT_UNAVAILABLE')
  })

  it('non-OCR sourceType returns REJECTED / SOURCE_NOT_ELIGIBLE', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate({ sourceType: 'title' }),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.decision, 'REJECTED')
    assert.equal(result.reason, 'SOURCE_NOT_ELIGIBLE')
  })

  it('clean not OK returns REJECTED / CLEAN_NOT_OK', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean({ status: 'DAMAGED', normalizedAddress: null }),
      places: places(),
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.decision, 'REJECTED')
    assert.equal(result.reason, 'CLEAN_NOT_OK')
  })

  it('Places not confirmed returns UNSURE / PLACES_NOT_CONFIRMED', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places({ candidates: [] }),
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'UNSURE')
    assert.equal(result.reason, 'PLACES_NOT_CONFIRMED')
  })

  it('Gemini CONFIRMED JSON returns decision CONFIRMED with confidence', async () => {
    let request = null
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
      metadata: { title: 'must not be used as inference' },
      sourceUrl: 'https://www.youtube.com/shorts/abc123DEF45',
      videoId: 'abc123DEF45',
    }, {
      geminiClient: async (payload) => {
        request = payload
        return {
          decision: 'CONFIRMED',
          confidence: 0.91,
          reason: 'CONSISTENT_ADDRESS',
          explanation: 'consistent',
        }
      },
    })

    assert.equal(request.task, 'SHORTS_TRACK_2_OCR_ADDRESS_CONFIRM')
    assert.equal(request.input.candidateAddress, candidate().candidateAddress)
    assert.equal(request.input.cleanedAddress, clean().normalizedAddress)
    assert.equal(request.input.placesCandidates.length, 1)
    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'CONFIRMED')
    assert.equal(result.confidence, 0.91)
  })

  it('Gemini UNSURE does not confirm', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async () => ({
        decision: 'UNSURE',
        confidence: 0.4,
        reason: 'LOW_VISIBILITY',
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'UNSURE')
    assert.equal(result.confidence, 0.4)
  })

  it('Gemini invalid JSON returns ERROR / UNSURE, not throw', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async () => 'not json',
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.decision, 'UNSURE')
  })

  it('Gemini provider throw returns ERROR / UNSURE, not throw', async () => {
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async () => {
        throw new Error('provider unavailable')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.decision, 'UNSURE')
    assert.ok(result.diagnostics.length > 0)
  })

  it('does not repair or return a rewritten address', async () => {
    let request = null
    const result = await confirmTrack2OcrAddressWithGemini({
      candidate: candidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async (payload) => {
        request = payload
        return {
          decision: 'CONFIRMED',
          confidence: 0.9,
          reason: 'CONSISTENT_ADDRESS',
          repairedAddress: '999 Repaired Street',
        }
      },
    })

    assert.ok(request.rules.forbidden.includes('REPAIR_ADDRESS'))
    assert.equal('address' in result, false)
    assert.equal(JSON.stringify(result).includes('999 Repaired Street'), false)
  })

  it('asr_transcript sourceType is accepted by ASR confirmation', async () => {
    let request = null
    const result = await confirmTrack2AsrAddressWithGemini({
      candidate: asrCandidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async (payload) => {
        request = payload
        return {
          decision: 'CONFIRMED',
          confidence: 0.9,
          reason: 'CONSISTENT_TRANSCRIPT_ADDRESS',
        }
      },
    })

    assert.equal(request.task, 'SHORTS_TRACK_2_ASR_ADDRESS_CONFIRM')
    assert.equal(request.input.sourceType, 'asr_transcript')
    assert.equal(request.input.rawTranscriptText, asrCandidate().rawText)
    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'CONFIRMED')
  })

  it('ASR clean not OK returns REJECTED', async () => {
    const result = await confirmTrack2AsrAddressWithGemini({
      candidate: asrCandidate(),
      clean: clean({ status: 'DAMAGED', normalizedAddress: null }),
      places: places(),
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.reason, 'CLEAN_NOT_OK')
  })

  it('ASR Places not confirmed returns UNSURE', async () => {
    const result = await confirmTrack2AsrAddressWithGemini({
      candidate: asrCandidate(),
      clean: clean(),
      places: places({ candidates: [] }),
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'UNSURE')
    assert.equal(result.reason, 'PLACES_NOT_CONFIRMED')
  })

  it('ASR Gemini CONFIRMED works', async () => {
    const result = await confirmTrack2AsrAddressWithGemini({
      candidate: asrCandidate(),
      clean: clean(),
      places: places(),
    }, {
      geminiClient: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.93,
        reason: 'CONSISTENT_TRANSCRIPT_ADDRESS',
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'CONFIRMED')
    assert.equal(result.confidence, 0.93)
  })

  it('place_name_inference source supported', async () => {
    let request = null
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
      metadata: { title: 'Quan Com Ba Hoa Quan 5' },
    }, {
      geminiClient: async (payload) => {
        request = payload
        return { decision: 'CONFIRMED', confidence: 0.9, reason: 'SINGLE_PLACE_MATCH' }
      },
    })

    assert.equal(request.task, 'SHORTS_TRACK_2_PLACE_NAME_INFERENCE_CONFIRM')
    assert.equal(request.input.sourceType, 'place_name_inference')
    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'CONFIRMED')
  })

  it('place inference safety blocked returns REJECTED/UNSURE', async () => {
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'BLOCKED', flags: ['GENERIC_LIST_TITLE'] },
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.decision, 'UNSURE')
  })

  it('place inference missing place name returns REJECTED', async () => {
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals({ placeNames: [] }),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.reason, 'MISSING_PLACE_NAME')
  })

  it('place inference missing area returns UNSURE', async () => {
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals({ areas: [] }),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 1 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'UNSURE')
    assert.equal(result.reason, 'MISSING_AREA_SIGNAL')
  })

  it('place inference Gemini CONFIRMED works for specific single place', async () => {
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
      metadata: { title: 'Quan Com Ba Hoa Quan 5' },
    }, {
      geminiClient: async () => ({ decision: 'CONFIRMED', confidence: 0.92 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'CONFIRMED')
    assert.equal(result.confidence, 0.92)
  })

  it('place inference Gemini UNSURE does not confirm', async () => {
    const result = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
    }, {
      geminiClient: async () => ({ decision: 'UNSURE', confidence: 0.4 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.decision, 'UNSURE')
  })

  it('place inference invalid JSON/provider throw controlled', async () => {
    const invalid = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
    }, {
      geminiClient: async () => 'not json',
    })
    const thrown = await confirmTrack2PlaceInferenceWithGemini({
      placeSignals: placeSignals(),
      rankedCandidate: rankedCandidate(),
      safety: { status: 'OK', flags: [] },
    }, {
      geminiClient: async () => {
        throw new Error('provider down')
      },
    })

    assert.equal(invalid.status, 'ERROR')
    assert.equal(invalid.decision, 'UNSURE')
    assert.equal(thrown.status, 'ERROR')
    assert.equal(thrown.decision, 'UNSURE')
  })
})
