import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safePreNormalize } from '../src/services/shortsAddressNormalizer.js'
import { findExactPrefixAddress } from '../src/services/shortsTrack1EvidenceExtractor.js'
import {
  parseShortsUrl,
  routeShortsAddress,
} from '../src/services/shortsAddressRouterService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

describe('shortsAddressRouter edge behavior', () => {
  it('shortsAddressRouter parses only supported YouTube Shorts URLs', () => {
    assert.deepEqual(parseShortsUrl(SHORTS_URL), {
      ok: true,
      videoId: 'abc123DEF45',
      canonicalUrl: SHORTS_URL,
      reason: null,
    })

    assert.equal(parseShortsUrl('https://m.youtube.com/shorts/abc123DEF45').ok, true)
    assert.equal(parseShortsUrl('https://www.youtube.com/watch?v=abc123DEF45').ok, false)
    assert.equal(parseShortsUrl('https://youtu.be/abc123DEF45').ok, false)
  })

  it('shortsAddressRouter keeps the exact prefix helper strict', () => {
    assert.equal(findExactPrefixAddress('Address : 39 Nguyen Trai, District 1, HCMC'), null)
    assert.equal(findExactPrefixAddress('dia chi: 39 Nguyen Trai, District 1, HCMC'), null)
    assert.equal(findExactPrefixAddress('Đ/C: 39 Nguyen Trai, District 1, HCMC'), null)

    const exact = findExactPrefixAddress('Address: 39 Nguyen Trai, District 1, HCMC')
    assert.equal(exact.prefix, 'Address:')
  })

  it('shortsAddressRouter rejects near-miss address labels from TRACK_1', () => {
    const cases = [
      'dc: 92C Cao Thắng, Quận 3',
      'dia chi: 92C Cao Thắng, Quận 3',
      'Đ/C: 92C Cao Thắng, Quận 3',
      'Address : 39 Nguyen Trai, District 1',
      'Địa chỉ : 92C Cao Thắng, Quận 3',
    ]

    for (const description of cases) {
      const result = routeShortsAddress({
        url: SHORTS_URL,
        description,
      })

      assert.equal(result.track, 'TRACK_2', description)
    }
  })

  it('shortsAddressRouter normalizes only from the closed safe lexicon', () => {
    assert.equal(
      safePreNormalize('• Address: 39 Nguyen Trai, Q.1, HCMC •'),
      'Address: 39 Nguyen Trai, Quận 1, TP. Hồ Chí Minh',
    )
  })

  it('shortsAddressRouter does not let SERP snippet text create TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      serpSnippet:
        'Google result snippet: NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'NO_EXPLICIT_EVIDENCE')
    assert.equal(result.evidenceSource, null)
  })

  it('shortsAddressRouter does not let SERP snippet exact prefix create TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      serpSnippet: 'Địa chỉ: 92C Cao Thắng, Quận 3, TP.HCM',
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'NO_EXPLICIT_EVIDENCE')
    assert.equal(result.evidenceSource, null)
    assert.ok(
      result.signals.some((signal) => signal.reason === 'SERP_SNIPPET_NOT_ELIGIBLE'),
    )
  })

  it('shortsAddressRouter returns the stable Sprint 1 router fields', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Address: 39 Nguyen Trai, District 1, HCMC',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.ok(Array.isArray(result.signals))
  })
})
