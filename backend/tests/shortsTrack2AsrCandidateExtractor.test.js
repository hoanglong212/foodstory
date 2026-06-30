import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractAsrAddressCandidates } from '../src/services/shortsTrack2AsrCandidateExtractorService.js'
import { normalizeAddress } from '../src/services/shortsAddressNormalizer.js'

function asrResult(text, overrides = {}) {
  const { transcript: transcriptOverrides = {}, ...resultOverrides } = overrides
  return {
    status: 'OK',
    reason: 'ASR_TRANSCRIPT_COLLECTED',
    transcript: {
      text,
      language: 'vi',
      confidence: 0.9,
      segments: [],
      ...transcriptOverrides,
    },
    diagnostics: [],
    ...resultOverrides,
  }
}

describe('shortsTrack2AsrCandidateExtractor', () => {
  it('no transcript returns NO_TRANSCRIPT / NO_ASR_TRANSCRIPT', () => {
    const result = extractAsrAddressCandidates({
      status: 'OK',
      transcript: null,
    })

    assert.equal(result.status, 'NO_TRANSCRIPT')
    assert.equal(result.reason, 'NO_ASR_TRANSCRIPT')
    assert.deepEqual(result.candidates, [])
  })

  it('"địa chỉ là ..." with full address extracts ASR_EXPLICIT_ADDRESS_LABEL', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3, TP.HCM',
    ))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].sourceType, 'asr_transcript')
    assert.equal(result.candidates[0].extractionRule, 'ASR_EXPLICIT_ADDRESS_LABEL')
  })

  it('"quán nằm ở ..." with full address extracts ASR_SPOKEN_ADDRESS_PHRASE', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'quán nằm ở 12 Đường A, Phường 1, Quận 1',
    ))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates[0].extractionRule, 'ASR_SPOKEN_ADDRESS_PHRASE')
  })

  it('"tại số ..." with full address extracts candidate', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'tại số 84 Đường Bạch Đằng, Phường 2, Quận Tân Bình',
    ))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates.length, 1)
    assert.match(result.candidates[0].candidateAddress, /84/u)
  })

  it('area-only phrase like "ở Quận 5" is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult('quán ở Quận 5'))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.equal(result.reason, 'NO_ASR_ADDRESS_CANDIDATE')
  })

  it('shop-only phrase is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult('quán nằm ở Bánh Mì Cô Ba'))

    assert.equal(result.status, 'NO_CANDIDATES')
  })

  it('dish-only phrase is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult('quán ở bún bò Huế đặc biệt'))

    assert.equal(result.status, 'NO_CANDIDATES')
  })

  it('missing house number is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là Đường Cao Thắng, Phường 4, Quận 3',
    ))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.riskFlags.includes('MISSING_HOUSE_NUMBER')))
  })

  it('missing street marker is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Cao Thắng, Phường 4, Quận 3',
    ))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.riskFlags.includes('MISSING_STREET_MARKER')))
  })

  it('missing admin marker is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Đường Cao Thắng',
    ))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.riskFlags.includes('MISSING_ADMIN_MARKER')))
  })

  it('noisy transcript is rejected', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3 follow TikTok để xem thêm',
    ))

    assert.equal(result.status, 'NO_CANDIDATES')
  })

  it('multiple address-like phrases returns NEEDS_REVIEW / MULTIPLE_ASR_ADDRESS_CANDIDATES', () => {
    const result = extractAsrAddressCandidates(asrResult(`địa chỉ là 12 Đường A, Phường 1, Quận 1
địa chỉ là 34 Đường B, Phường 2, Quận 2`))

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTIPLE_ASR_ADDRESS_CANDIDATES')
    assert.equal(result.candidates.length, 2)
    assert.ok(result.candidates.every((candidate) => candidate.riskFlags.includes('MULTIPLE_ADDRESS_LIKE_PHRASES')))
  })

  it('low transcript confidence gets LOW_TRANSCRIPT_CONFIDENCE risk flag', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3',
      { transcript: { confidence: 0.4 } },
    ))

    assert.equal(result.status, 'OK')
    assert.ok(result.candidates[0].riskFlags.includes('LOW_TRANSCRIPT_CONFIDENCE'))
  })

  it('candidates use safe normalizer', () => {
    const result = extractAsrAddressCandidates(asrResult(
      'address is 92C Duong Cao Thang, Ward 4, District 3, Ho Chi Minh City',
    ))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates[0].normalizedAddress, normalizeAddress(result.candidates[0].candidateAddress))
  })

  it('no provider calls are made', () => {
    const calls = {
      places: 0,
      gemini: 0,
      asr: 0,
    }
    const result = extractAsrAddressCandidates(asrResult(
      'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3',
    ), {
      confirmAddressWithPlaces: () => {
        calls.places += 1
      },
      geminiClient: () => {
        calls.gemini += 1
      },
      track2AsrProvider: () => {
        calls.asr += 1
      },
    })

    assert.equal(result.status, 'OK')
    assert.deepEqual(calls, { places: 0, gemini: 0, asr: 0 })
  })
})
