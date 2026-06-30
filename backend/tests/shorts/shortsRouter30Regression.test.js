import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../../src/services/shortsAddressRouterService.js'
import {
  countBy,
  fixtureCases,
  loadShortsFixture,
  routeInputForAddressCase,
} from './helpers/loadShortsFixture.js'
import {
  runWithFetchBlocked,
  summarizeRoutingRows,
} from './helpers/shortsAssertions.js'

const fixture = loadShortsFixture('youtube-shorts-address-30.json')
const liveSnapshot = loadShortsFixture('youtube-shorts-address-30.live-snapshot.json')

describe('L1 Shorts router 30-case regression', () => {
  it('keeps the frozen 30-case fixture distribution and live baseline counters', () => {
    const cases = fixtureCases(fixture)
    const expectedCounts = countBy(cases, 'expectedTrack')

    assert.equal(cases.length, 30)
    assert.equal(expectedCounts.TRACK_1, 10)
    assert.equal(expectedCounts.TRACK_2, 20)
    assert.equal(liveSnapshot?.counts?.total, 30)
    assert.equal(liveSnapshot?.counts?.passed, 30)
    assert.equal(liveSnapshot?.counts?.failed, 0)
    assert.equal(liveSnapshot?.counts?.expectedTrack1, 10)
    assert.equal(liveSnapshot?.counts?.expectedTrack2, 20)
    assert.equal(liveSnapshot?.counts?.promotedTrack2ToTrack1, 0)
  })

  it('routes the 30-case fixture with no failures or Track 2 promotions', () => {
    runWithFetchBlocked(() => {
      const rows = fixtureCases(fixture).map((item) => ({
        item,
        result: routeShortsAddress(routeInputForAddressCase(item)),
      }))
      const failures = rows.filter(({ item, result }) => result.track !== item.expectedTrack)
      const promotedTrack2 = rows.filter(
        ({ item, result }) => item.expectedTrack === 'TRACK_2' && result.track === 'TRACK_1',
      )
      const actualCounts = countBy(rows.map(({ result }) => ({ actualTrack: result.track })), 'actualTrack')

      assert.equal(failures.length, 0, summarizeRoutingRows(failures))
      assert.equal(promotedTrack2.length, 0, summarizeRoutingRows(promotedTrack2))
      assert.equal(actualCounts.TRACK_1, 10)
      assert.equal(actualCounts.TRACK_2, 20)
    })
  })
})
