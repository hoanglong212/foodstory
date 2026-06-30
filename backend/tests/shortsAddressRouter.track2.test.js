import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../src/services/shortsAddressRouterService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

describe('shortsAddressRouter TRACK_2 routing', () => {
  it('shortsAddressRouter keeps OCR-only address in TRACK_2', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'The address is pinned on the screen.',
      ocrText: '52 Nguyễn Công Trứ, Bình Thạnh',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'OCR_ONLY')
    assert.equal(result.evidenceSource, 'ocr')
    assert.equal(result.candidateAddress, '52 Nguyễn Công Trứ, Bình Thạnh')
    assert.equal(result.normalizedAddress, '52 Nguyễn Công Trứ, Bình Thạnh')
  })

  it('shortsAddressRouter keeps ASR-only address in TRACK_2', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Nghe trong video để biết địa chỉ.',
      asrText: 'địa chỉ là 39 Nguyen Trai, District 1, HCMC',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'ASR_ONLY')
    assert.equal(result.evidenceSource, 'asr')
    assert.equal(result.normalizedAddress, 'địa chỉ là 39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
  })

  it('shortsAddressRouter keeps title-only address-like text in TRACK_2', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      title: 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'TITLE_ONLY')
    assert.equal(result.evidenceSource, 'title')
    assert.equal(result.candidateAddress, 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội')
    assert.equal(result.normalizedAddress, 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội')
    assert.ok(
      result.signals.some((signal) => signal.rule === 'TITLE_ADDRESS_WITHOUT_EXACT_PREFIX'),
    )
  })

  it('shortsAddressRouter routes truncated exact label evidence to TRACK_2', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Địa chỉ: 114 Lê Thị Riêng, Quận ...',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'TRUNCATED_EVIDENCE')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, '114 Lê Thị Riêng, Quận ...')
    assert.equal(result.normalizedAddress, null)
  })
})
