import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractOcrAddressCandidates } from '../src/services/shortsTrack2OcrCandidateExtractorService.js'

function ocrResult(textBlocks = []) {
  return {
    status: textBlocks.length ? 'OK' : 'NO_FRAMES',
    reason: textBlocks.length ? 'OCR_TEXT_COLLECTED' : 'NO_FRAMES',
    textBlocks,
    diagnostics: [],
  }
}

function block(text, overrides = {}) {
  return {
    frameIndex: 0,
    timestampSeconds: 4,
    text,
    confidence: 0.9,
    ...overrides,
  }
}

describe('shortsTrack2OcrCandidateExtractor', () => {
  it('returns NO_TEXT / NO_OCR_TEXT when there is no OCR text', () => {
    const result = extractOcrAddressCandidates(ocrResult())

    assert.equal(result.status, 'NO_TEXT')
    assert.equal(result.reason, 'NO_OCR_TEXT')
    assert.deepEqual(result.candidates, [])
  })

  it('extracts an OCR_EXPLICIT_LABEL candidate from Địa chỉ:', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Địa chỉ: Số 92C Cao Thắng, P.4, Q.3, TP.HCM'),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'OCR_ADDRESS_CANDIDATES_FOUND')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].sourceType, 'ocr_frame')
    assert.equal(result.candidates[0].candidateAddress, 'Số 92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.equal(result.candidates[0].normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.equal(result.candidates[0].extractionRule, 'OCR_EXPLICIT_LABEL')
  })

  it('extracts an OCR_EXPLICIT_LABEL candidate from ĐC:', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('ĐC: 52 Đường Nguyễn Công Trứ, Phường 19, Quận Bình Thạnh'),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates[0].extractionRule, 'OCR_EXPLICIT_LABEL')
    assert.equal(result.candidates[0].candidateAddress, '52 Đường Nguyễn Công Trứ, Phường 19, Quận Bình Thạnh')
  })

  it('extracts an OCR_EXPLICIT_LABEL candidate from Address:', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Address: 39 Nguyen Trai Street, District 1, HCMC'),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates[0].extractionRule, 'OCR_EXPLICIT_LABEL')
    assert.equal(result.candidates[0].normalizedAddress, '39 Nguyen Trai Street, District 1, TP. Hồ Chí Minh')
  })

  it('extracts OCR_ADDRESS_LIKE_FULL from house number + street + district', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('39 Nguyen Trai Street, District 1, HCMC'),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates[0].extractionRule, 'OCR_ADDRESS_LIKE_FULL')
    assert.equal(result.candidates[0].candidateAddress, '39 Nguyen Trai Street, District 1, TP. Hồ Chí Minh')
  })

  it('extracts the sanitized track2_007 bare-street full address with frame metadata', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block(`NỘM LONG VI DUNG
23 Hồ Hoàn Kiếm, Q. Hoàn Kiếm, Hà Nội`, {
        frameIndex: 7,
        timestampSeconds: 53.3,
        confidence: null,
      }),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'OCR_ADDRESS_CANDIDATES_FOUND')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].sourceType, 'ocr_frame')
    assert.ok(result.candidates[0].candidateAddress)
    assert.ok(result.candidates[0].normalizedAddress)
    assert.equal(result.candidates[0].frameIndex, 7)
    assert.equal(result.candidates[0].timestampSeconds, 53.3)
    assert.equal(
      result.candidates[0].extractionRule,
      'OCR_VIETNAM_BARE_STREET_FULL',
    )
  })

  it('safely joins adjacent same-frame OCR lines that form one full address', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block(`NỘM LONG VI DUNG
23 Hồ Hoàn Kiếm
Q. Hoàn Kiếm, Hà Nội`, {
        frameIndex: 7,
        timestampSeconds: 53.3,
      }),
    ]))

    assert.equal(result.status, 'OK')
    assert.equal(result.candidates.length, 1)
    assert.equal(
      result.candidates[0].extractionRule,
      'OCR_JOINED_VIETNAM_ADDRESS',
    )
  })

  it('does not turn generic list OCR into a bare-street address candidate', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block(`TOP 8 QUÁN NGON QUẬN 5
1 BÚN BÒ
2 CƠM TẤM
3 MÌ VỊT`),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.equal(result.reason, 'NO_OCR_ADDRESS_CANDIDATE')
    assert.deepEqual(result.candidates, [])
  })

  it('rejects OCR text with only a shop name', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Lạc Concept Coffee'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.equal(result.reason, 'NO_OCR_ADDRESS_CANDIDATE')
    assert.deepEqual(result.candidates, [])
  })

  it('rejects OCR text with only a dish name', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Bún bò Huế đặc biệt'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.deepEqual(result.candidates, [])
  })

  it('rejects OCR text with only an area like Quận 5', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Quận 5, TP.HCM'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.deepEqual(result.candidates, [])
  })

  it('rejects OCR text with only street but no house number/admin marker', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Đường Nguyễn Trãi'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.deepEqual(result.candidates, [])
  })

  it('rejects URL/social/hashtag/contact noise', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Address: https://instagram.com/example #food contact@example.com'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.deepEqual(result.candidates, [])
    assert.ok(result.diagnostics.length > 0)
  })

  it('rejects truncated OCR text with ellipsis', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Địa chỉ: 114 Lê Thị Riêng, Quận ...'),
    ]))

    assert.equal(result.status, 'NO_CANDIDATES')
    assert.deepEqual(result.candidates, [])
    assert.ok(result.diagnostics.some((item) => item.riskFlags?.includes('TRUNCATED_TEXT')))
  })

  it('returns NEEDS_REVIEW / MULTIPLE_OCR_ADDRESS_CANDIDATES for multiple address-like lines', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block(`Địa chỉ: 12 Đường A, Phường 1, Quận 1
Địa chỉ: 34 Đường B, Phường 2, Quận 2`),
    ]))

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTIPLE_OCR_ADDRESS_CANDIDATES')
    assert.equal(result.candidates.length, 2)
    assert.equal(result.candidates[0].extractionRule, 'OCR_MULTIPLE_ADDRESSES')
    assert.ok(result.candidates[0].riskFlags.includes('MULTIPLE_ADDRESS_LIKE_LINES'))
  })

  it('adds LOW_OCR_CONFIDENCE risk flag to low confidence candidates', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM', { confidence: 0.4 }),
    ]))

    assert.equal(result.status, 'OK')
    assert.ok(result.candidates[0].riskFlags.includes('LOW_OCR_CONFIDENCE'))
  })

  it('uses normalizedAddress from the safe normalizer', () => {
    const result = extractOcrAddressCandidates(ocrResult([
      block('Địa chỉ: Số 92C Cao Thắng, P.4, Q.3, TP.HCM'),
    ]))

    assert.equal(result.candidates[0].normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
  })

  it('does not call providers from context', () => {
    let calls = 0

    const result = extractOcrAddressCandidates(ocrResult([
      block('Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM'),
    ]), {
      fetch: () => {
        calls += 1
      },
      confirmAddressWithPlaces: () => {
        calls += 1
      },
      confirmExplicitAddressWithGemini: () => {
        calls += 1
      },
      asrProvider: () => {
        calls += 1
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(calls, 0)
  })
})
