import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyShortsTrack2V3Intent } from '../../src/services/shorts/track2-v3/shortsTrack2V3IntentClassifierService.js'

describe('L3 Shorts Track 2 V3 intent classifier', () => {
  it('classifies generic top/list titles as mustNotResolve', () => {
    const result = classifyShortsTrack2V3Intent({
      title: 'Top 8 quán ngon Quận 10',
    })

    assert.ok(['MULTI_PLACE_OR_LIST', 'GENERIC_FOOD_LIST'].includes(result.intent))
    assert.equal(result.mustNotResolve, true)
    assert.ok(['TITLE_TOP_LIST', 'TITLE_GENERIC_LIST'].includes(result.reason))
    assert.ok(result.signals.length > 0)
  })

  it('classifies Vietnamese tong hop titles as mustNotResolve', () => {
    const result = classifyShortsTrack2V3Intent({
      title: 'Tổng hợp quán ngon Sài Gòn phần 1',
    })

    assert.equal(result.intent, 'MULTI_PLACE_OR_LIST')
    assert.equal(result.mustNotResolve, true)
    assert.equal(result.reason, 'TITLE_GENERIC_LIST')
  })

  it('does not let a generic addresses-in-video description template force multi-place', () => {
    const result = classifyShortsTrack2V3Intent({
      description: 'Địa chỉ các nơi trong video ở phần mô tả này.',
    })

    assert.equal(result.intent, 'UNKNOWN')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.reason, 'NO_STRONG_INTENT_SIGNAL')
  })

  it('classifies address-on-screen metadata as OCR address likely', () => {
    const result = classifyShortsTrack2V3Intent({
      description: 'Xem địa chỉ trên màn hình',
    })

    assert.equal(result.intent, 'OCR_ADDRESS_LIKELY')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.reason, 'PINNED_ADDRESS_ON_SCREEN')
  })

  it('classifies single place review metadata without safety lock', () => {
    const result = classifyShortsTrack2V3Intent({
      title: 'Review quán bún bò ngon ở Sài Gòn',
    })

    assert.equal(result.intent, 'SINGLE_PLACE_LIKELY')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.reason, 'SINGLE_PLACE_REVIEW')
  })

  it('lets list rules beat single-place keywords', () => {
    const result = classifyShortsTrack2V3Intent({
      title: 'Top quán bún bò ngon ở Quận 10',
    })

    assert.ok(['MULTI_PLACE_OR_LIST', 'GENERIC_FOOD_LIST'].includes(result.intent))
    assert.equal(result.mustNotResolve, true)
    assert.equal(result.reason, 'TITLE_TOP_LIST')
  })

  it('handles empty metadata defensively', () => {
    const result = classifyShortsTrack2V3Intent({})

    assert.equal(result.intent, 'UNKNOWN')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.reason, 'NO_STRONG_INTENT_SIGNAL')
    assert.deepEqual(result.signals, [])
  })
})
