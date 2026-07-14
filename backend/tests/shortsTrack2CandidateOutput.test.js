import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTrack2CandidateOutput } from '../src/services/shortsTrack2CandidateOutputService.js'

function ocrCandidate(overrides = {}) {
  return {
    sourceType: 'ocr_frame',
    candidateAddress: '92C Cao Thang, Ward 4, District 3, HCMC',
    normalizedAddress: '92C Cao Thang, Ward 4, District 3, HCMC',
    rawText: 'Address: 92C Cao Thang, Ward 4, District 3, HCMC',
    timestampSeconds: 12,
    frameIndex: 1,
    ocrConfidence: 0.9,
    riskFlags: [],
    ...overrides,
  }
}

describe('shortsTrack2CandidateOutput', () => {
  it('prioritizes verified candidates and emits the bounded normalized shape', () => {
    const verified = ocrCandidate({
      placeId: 'place-1',
      formattedAddress: '92C Cao Thang, District 3, Ho Chi Minh City',
      placeVerificationStatus: 'PLACES_MATCHED',
      verificationReason: 'OCR_ADDRESS_CONFIRMED',
      confidence: 0.9,
    })
    const output = buildTrack2CandidateOutput({
      ocrExtraction: { candidates: [ocrCandidate()] },
      ocrVerification: {
        verifiedCandidates: [verified],
        unresolvedCandidates: [],
        rejectedCandidates: [],
      },
    })

    assert.equal(output.length, 1)
    assert.equal(output[0].verificationReason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(output[0].placeId, 'place-1')
    assert.deepEqual(output[0].evidence, {
      source: 'ocr',
      text: verified.rawText,
      timestampSeconds: 12,
      frameIndex: 1,
    })
    assert.deepEqual(Object.keys(output[0]), [
      'sourceType',
      'candidateAddress',
      'placeName',
      'normalizedAddress',
      'formattedAddress',
      'placeId',
      'timestampSeconds',
      'frameIndex',
      'rawText',
      'confidence',
      'riskFlags',
      'verificationReason',
      'placeVerificationStatus',
      'evidence',
    ])
  })

  it('deduplicates candidates, caps output at five, and redacts evidence text', () => {
    const duplicate = ocrCandidate({ rawText: 'mail owner@example.com https://example.com/private' })
    const placeCandidates = Array.from({ length: 8 }, (_, index) => ({
      sourceType: 'place_name_inference',
      placeId: `place-${index}`,
      displayName: `Place ${index}`,
      formattedAddress: `${index} Example Street`,
      score: 0.7,
    }))
    const output = buildTrack2CandidateOutput({
      ocrExtraction: { candidates: [duplicate, { ...duplicate }] },
      placeCandidates,
    })

    assert.equal(output.length, 5)
    assert.equal(output.filter((candidate) => candidate.sourceType === 'ocr_frame').length, 1)
    assert.match(output[0].rawText, /\[REDACTED_EMAIL\]/u)
    assert.match(output[0].rawText, /\[REDACTED_URL\]/u)
    assert.equal(JSON.stringify(output).includes('owner@example.com'), false)
  })
})
