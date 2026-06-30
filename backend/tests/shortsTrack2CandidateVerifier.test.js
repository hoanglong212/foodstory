import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  verifyAsrAddressCandidates,
  verifyOcrAddressCandidates,
} from '../src/services/shortsTrack2CandidateVerifierService.js'

function candidate(overrides = {}) {
  return {
    sourceType: 'ocr_frame',
    candidateAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    normalizedAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    rawText: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
    timestampSeconds: 3,
    frameIndex: 0,
    ocrConfidence: 0.91,
    extractionRule: 'OCR_EXPLICIT_LABEL',
    riskFlags: [],
    ...overrides,
  }
}

function candidateResult(candidates = [candidate()], overrides = {}) {
  return {
    status: candidates.length > 1 ? 'NEEDS_REVIEW' : 'OK',
    reason: candidates.length > 1 ? 'MULTIPLE_OCR_ADDRESS_CANDIDATES' : 'OCR_ADDRESS_CANDIDATES_FOUND',
    candidates,
    diagnostics: [],
    ...overrides,
  }
}

function asrCandidate(overrides = {}) {
  return {
    sourceType: 'asr_transcript',
    candidateAddress: '92C Đường Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    normalizedAddress: '92C Đường Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    rawText: 'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3, TP.HCM',
    timestampSeconds: 2,
    transcriptConfidence: 0.91,
    extractionRule: 'ASR_EXPLICIT_ADDRESS_LABEL',
    riskFlags: [],
    ...overrides,
  }
}

function asrCandidateResult(candidates = [asrCandidate()], overrides = {}) {
  return {
    status: candidates.length > 1 ? 'NEEDS_REVIEW' : 'OK',
    reason: candidates.length > 1 ? 'MULTIPLE_ASR_ADDRESS_CANDIDATES' : 'ASR_ADDRESS_CANDIDATES_FOUND',
    candidates,
    diagnostics: [],
    ...overrides,
  }
}

function cleanOk(overrides = {}) {
  return {
    status: 'OK',
    normalizedAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    disallowedRepairDetected: false,
    ...overrides,
  }
}

function placesOk(overrides = {}) {
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

function confirmOk(overrides = {}) {
  return {
    status: 'OK',
    decision: 'CONFIRMED',
    confidence: 0.9,
    reason: 'CONSISTENT_ADDRESS',
    explanation: '',
    diagnostics: [],
    ...overrides,
  }
}

describe('shortsTrack2CandidateVerifier', () => {
  it('returns NO_CANDIDATES when there are no candidates', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult([], {
      status: 'NO_CANDIDATES',
      reason: 'NO_OCR_ADDRESS_CANDIDATE',
    }))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.equal(result.reason, 'NO_OCR_ADDRESS_CANDIDATE')
    assert.deepEqual(result.verifiedCandidates, [])
  })

  it('dirty candidate fails clean and does not call Places/Gemini', async () => {
    let placesCalls = 0
    let geminiCalls = 0
    const result = await verifyOcrAddressCandidates(candidateResult([
      candidate({ riskFlags: ['DIRTY_TEXT'] }),
    ]), {}, {
      cleanAddressNoRepair: async () => cleanOk({ status: 'DAMAGED', normalizedAddress: null }),
      confirmAddressWithPlaces: async () => {
        placesCalls += 1
        return placesOk()
      },
      confirmTrack2OcrAddressWithGemini: async () => {
        geminiCalls += 1
        return confirmOk()
      },
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.rejectedCandidates.length, 1)
    assert.equal(placesCalls, 0)
    assert.equal(geminiCalls, 0)
  })

  it('clean candidate + Places confirmed + Gemini CONFIRMED >= 0.85 returns one verified candidate', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async ({ metadata, placeNameContexts, shopName }) => {
        assert.deepEqual(metadata, {})
        assert.deepEqual(placeNameContexts, [])
        assert.equal(shopName, '')
        return placesOk()
      },
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({ confidence: 0.88 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(result.verifiedCandidates.length, 1)
    assert.equal(result.verifiedCandidates[0].addressSource, 'ocr_frame')
    assert.equal(result.verifiedCandidates[0].placeId, 'place-123')
  })

  it('clean candidate + Places no match returns unresolved, not verified', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk({
        status: 'PLACES_EMPTY_RESULT',
        candidates: [],
      }),
      confirmTrack2OcrAddressWithGemini: async () => {
        throw new Error('Gemini should not run without Places')
      },
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.unresolvedCandidates.length, 1)
    assert.equal(result.reason, 'PLACES_NOT_CONFIRMED')
  })

  it('clean candidate + Gemini UNSURE returns unresolved, not verified', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({
        decision: 'UNSURE',
        confidence: 0.5,
      }),
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.unresolvedCandidates.length, 1)
    assert.equal(result.reason, 'GEMINI_TRACK2_UNSURE')
  })

  it('clean candidate + Gemini REJECTED returns rejected, not verified', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({
        decision: 'REJECTED',
        confidence: 0.9,
      }),
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.rejectedCandidates.length, 1)
    assert.equal(result.reason, 'GEMINI_TRACK2_REJECTED')
  })

  it('multiple verified candidates returns NEEDS_REVIEW', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult([
      candidate(),
      candidate({
        candidateAddress: '34 Đường B, Phường 2, Quận 2',
        normalizedAddress: '34 Đường B, Phường 2, Quận 2',
        rawText: 'Địa chỉ: 34 Đường B, Phường 2, Quận 2',
      }),
    ]), {}, {
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({
        normalizedAddress: rawCandidate,
      }),
      confirmAddressWithPlaces: async ({ normalizedAddress }) => placesOk({
        candidates: [{ placeId: normalizedAddress.includes('34 ') ? 'place-456' : 'place-123' }],
      }),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({ confidence: 0.92 }),
    })

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTIPLE_VERIFIED_OCR_CANDIDATES')
    assert.equal(result.verifiedCandidates.length, 2)
  })

  it('provider errors return controlled result, not throw', async () => {
    const result = await verifyOcrAddressCandidates(candidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => ({
        status: 'PLACES_PROVIDER_ERROR',
        error: 'PLACES_PROVIDER_ERROR',
        candidates: [],
        diagnostics: [{ message: 'provider failed', apiKeyPresent: true }],
      }),
      confirmTrack2OcrAddressWithGemini: async () => {
        throw new Error('Gemini should not run on Places provider error')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.unresolvedCandidates.length, 1)
  })

  it('does not call ASR or use place-name/title inference', async () => {
    let asrCalls = 0
    const result = await verifyOcrAddressCandidates(candidateResult(), {
      metadata: {
        title: 'Specific Shop Name',
      },
    }, {
      asrProvider: async () => {
        asrCalls += 1
      },
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async ({ metadata, shopName, placeNameContexts }) => {
        assert.deepEqual(metadata, {})
        assert.equal(shopName, '')
        assert.deepEqual(placeNameContexts, [])
        return placesOk()
      },
      confirmTrack2OcrAddressWithGemini: async () => confirmOk(),
    })

    assert.equal(result.status, 'OK')
    assert.equal(asrCalls, 0)
  })

  it('verifyAsrAddressCandidates no candidates returns NO_CANDIDATES', async () => {
    const result = await verifyAsrAddressCandidates(asrCandidateResult([], {
      status: 'NO_CANDIDATES',
      reason: 'NO_ASR_ADDRESS_CANDIDATE',
    }))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.equal(result.reason, 'NO_ASR_ADDRESS_CANDIDATE')
    assert.deepEqual(result.verifiedCandidates, [])
  })

  it('dirty ASR candidate fails clean and does not call Places/Gemini', async () => {
    let placesCalls = 0
    let geminiCalls = 0
    const result = await verifyAsrAddressCandidates(asrCandidateResult([
      asrCandidate({ riskFlags: ['DIRTY_TRANSCRIPT'] }),
    ]), {}, {
      cleanAddressNoRepair: async () => cleanOk({ status: 'DAMAGED', normalizedAddress: null }),
      confirmAddressWithPlaces: async () => {
        placesCalls += 1
        return placesOk()
      },
      confirmTrack2AsrAddressWithGemini: async () => {
        geminiCalls += 1
        return confirmOk()
      },
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.rejectedCandidates.length, 1)
    assert.equal(placesCalls, 0)
    assert.equal(geminiCalls, 0)
  })

  it('clean ASR candidate + Places confirmed + Gemini CONFIRMED >= 0.85 returns one verified candidate', async () => {
    const result = await verifyAsrAddressCandidates(asrCandidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk({
        normalizedAddress: asrCandidate().candidateAddress,
      }),
      confirmAddressWithPlaces: async ({ metadata, placeNameContexts, shopName }) => {
        assert.deepEqual(metadata, {})
        assert.deepEqual(placeNameContexts, [])
        assert.equal(shopName, '')
        return placesOk()
      },
      confirmTrack2AsrAddressWithGemini: async () => confirmOk({ confidence: 0.88 }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'ASR_ADDRESS_CONFIRMED')
    assert.equal(result.verifiedCandidates.length, 1)
    assert.equal(result.verifiedCandidates[0].addressSource, 'asr_transcript')
    assert.equal(result.verifiedCandidates[0].placeId, 'place-123')
  })

  it('ASR Places no match does not verify', async () => {
    const result = await verifyAsrAddressCandidates(asrCandidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk({
        normalizedAddress: asrCandidate().candidateAddress,
      }),
      confirmAddressWithPlaces: async () => placesOk({
        status: 'PLACES_EMPTY_RESULT',
        candidates: [],
      }),
      confirmTrack2AsrAddressWithGemini: async () => {
        throw new Error('Gemini should not run without Places')
      },
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.unresolvedCandidates.length, 1)
    assert.equal(result.reason, 'ASR_PLACES_NOT_CONFIRMED')
  })

  it('ASR Gemini UNSURE does not verify', async () => {
    const result = await verifyAsrAddressCandidates(asrCandidateResult(), {}, {
      cleanAddressNoRepair: async () => cleanOk({
        normalizedAddress: asrCandidate().candidateAddress,
      }),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2AsrAddressWithGemini: async () => confirmOk({
        decision: 'UNSURE',
        confidence: 0.5,
      }),
    })

    assert.equal(result.verifiedCandidates.length, 0)
    assert.equal(result.unresolvedCandidates.length, 1)
    assert.equal(result.reason, 'ASR_GEMINI_UNSURE')
  })

  it('multiple verified ASR candidates returns NEEDS_REVIEW', async () => {
    const result = await verifyAsrAddressCandidates(asrCandidateResult([
      asrCandidate(),
      asrCandidate({
        candidateAddress: '34 Đường B, Phường 2, Quận 2',
        normalizedAddress: '34 Đường B, Phường 2, Quận 2',
        rawText: 'địa chỉ là 34 Đường B, Phường 2, Quận 2',
      }),
    ]), {}, {
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({
        normalizedAddress: rawCandidate,
      }),
      confirmAddressWithPlaces: async ({ normalizedAddress }) => placesOk({
        candidates: [{ placeId: normalizedAddress.includes('34 ') ? 'place-456' : 'place-123' }],
      }),
      confirmTrack2AsrAddressWithGemini: async () => confirmOk({ confidence: 0.92 }),
    })

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTIPLE_VERIFIED_ASR_CANDIDATES')
    assert.equal(result.verifiedCandidates.length, 2)
  })

  it('ASR verifier does not call ASR or use place-name/title inference', async () => {
    let asrCalls = 0
    const result = await verifyAsrAddressCandidates(asrCandidateResult(), {
      metadata: {
        title: 'Specific Shop Name',
      },
    }, {
      track2AsrProvider: async () => {
        asrCalls += 1
      },
      cleanAddressNoRepair: async () => cleanOk({
        normalizedAddress: asrCandidate().candidateAddress,
      }),
      confirmAddressWithPlaces: async ({ metadata, shopName, placeNameContexts }) => {
        assert.deepEqual(metadata, {})
        assert.equal(shopName, '')
        assert.deepEqual(placeNameContexts, [])
        return placesOk()
      },
      confirmTrack2AsrAddressWithGemini: async () => confirmOk(),
    })

    assert.equal(result.status, 'OK')
    assert.equal(asrCalls, 0)
  })
})
