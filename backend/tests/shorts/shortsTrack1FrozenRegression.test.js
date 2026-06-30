import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../../src/services/shortsAddressRouterService.js'
import {
  expectedTrackCases,
  loadShortsFixture,
  routeInputForAddressCase,
} from './helpers/loadShortsFixture.js'
import {
  runWithFetchBlocked,
  summarizeRoutingRows,
} from './helpers/shortsAssertions.js'

const fixture = loadShortsFixture('youtube-shorts-address-30.json')

describe('L0 Shorts Track 1 frozen regression', () => {
  it('keeps all expected TRACK_1 fixture cases on Track 1 with stable evidence', () => {
    runWithFetchBlocked(() => {
      const track1Cases = expectedTrackCases(fixture, 'TRACK_1')
      const rows = track1Cases.map((item) => ({
        item,
        result: routeShortsAddress(routeInputForAddressCase(item)),
      }))
      const summary = summarizeRoutingRows(rows)

      assert.equal(track1Cases.length, 10, summary)

      for (const { item, result } of rows) {
        const caseSummary = summarizeRoutingRows([{ item, result }])

        assert.equal(result.track, 'TRACK_1', caseSummary)
        assert.equal(result.reason, item.expectedReason, caseSummary)
        assert.equal(result.evidenceSource, item.expectedEvidenceSource, caseSummary)

        if (Object.hasOwn(item, 'expectedCandidateAddress')) {
          assert.ok(result.candidateAddress, caseSummary)
          assert.equal(result.candidateAddress, item.expectedCandidateAddress, caseSummary)
        }

        if (Object.hasOwn(item, 'expectedNormalizedAddress')) {
          assert.ok(result.normalizedAddress, caseSummary)
          assert.equal(result.normalizedAddress, item.expectedNormalizedAddress, caseSummary)
        }
      }
    })
  })
})
