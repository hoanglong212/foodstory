import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../../src/services/shortsAddressRouterService.js'
import { runShortsTrack2Pipeline } from '../../src/services/shortsTrack2PipelineService.js'
import {
  enabledCases,
  findFixtureCase,
  loadShortsFixture,
  routeInputForAddressCase,
  videoIdFromShortsUrl,
} from './helpers/loadShortsFixture.js'
import {
  assertAllowedResolution,
  assertNotResolved,
  outputMetrics,
  summarizeRoutingRows,
} from './helpers/shortsAssertions.js'

const track2Fixture = loadShortsFixture('youtube-shorts-track2-v1.json')
const addressFixture = loadShortsFixture('youtube-shorts-address-30.json')
const NEVER_RESOLVE_CATEGORIES = new Set(['MULTI_PLACE', 'GENERIC_LIST'])
const OCR_ONLY_ALLOWED = ['RESOLVED', 'CANDIDATES', 'NEEDS_REVIEW', 'UNRESOLVED']

function track1FallbackForCase(item) {
  const sourceCase = item.sourceCaseId
    ? findFixtureCase(addressFixture, item.sourceCaseId)
    : null
  const routeResult = sourceCase
    ? routeShortsAddress(routeInputForAddressCase(sourceCase))
    : { track: 'TRACK_2', reason: 'TRACK2_FIXTURE_ONLY', signals: [] }

  assert.equal(
    routeResult.track,
    'TRACK_2',
    summarizeRoutingRows([{ item: sourceCase || item, result: routeResult }]),
  )

  const metadata = sourceCase
    ? routeInputForAddressCase(sourceCase)
    : { url: item.url, title: '', description: '' }

  return {
    ...routeResult,
    track: 'TRACK_2',
    sourceUrl: item.url,
    videoId: videoIdFromShortsUrl(item.url),
    metadata: {
      ...metadata,
      url: item.url,
      videoId: videoIdFromShortsUrl(item.url),
    },
    signals: Array.isArray(routeResult.signals) ? routeResult.signals : [],
    stages: {
      router: {
        track: routeResult.track,
        reason: routeResult.reason,
      },
      clean: null,
      places: null,
      confirm: null,
    },
  }
}

describe('L2 Shorts Track 2 V1 safety regression', () => {
  it('keeps enabled V1 safety cases from resolving unsafe categories', async () => {
    const cases = enabledCases(track2Fixture)
    const metrics = []

    assert.equal(cases.length, 20)

    for (const item of cases) {
      const result = await runShortsTrack2Pipeline(track1FallbackForCase(item))
      const expected = item.expected || {}
      const label = `${item.id} ${item.category} -> ${result.resolution} ${result.reason}`

      assert.equal(result.track, 'TRACK_2', label)

      if (item.category === 'OCR_ONLY') {
        assertAllowedResolution(result, expected.allowedResolutions || OCR_ONLY_ALLOWED, label)
        metrics.push({ id: item.id, category: item.category, ...outputMetrics(result) })
        continue
      }

      if (
        expected.mustNotResolve === true ||
        NEVER_RESOLVE_CATEGORIES.has(item.category) ||
        item.category === 'NO_EVIDENCE'
      ) {
        assertNotResolved(result, label)
      }

      assertAllowedResolution(result, expected.allowedResolutions, label)
      metrics.push({ id: item.id, category: item.category, ...outputMetrics(result) })
    }

    assert.equal(metrics.length, cases.length)
  })
})
