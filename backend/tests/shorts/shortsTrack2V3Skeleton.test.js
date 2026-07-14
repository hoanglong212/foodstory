import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsPipeline } from '../../src/services/shortsPipelineService.js'
import {
  DEFAULT_SHORTS_TRACK2_V3_CONFIG,
  getShortsTrack2V3Config,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'
import { decideShortsTrack2V3Result } from '../../src/services/shorts/track2-v3/shortsTrack2V3DecisionService.js'

describe('L3 Shorts Track 2 V3 skeleton', () => {
  it('loads safe config defaults without required env keys', () => {
    const config = getShortsTrack2V3Config({})

    assert.deepEqual(config, DEFAULT_SHORTS_TRACK2_V3_CONFIG)
  })

  it('returns the stable skeleton response schema', async () => {
    const result = await runShortsTrack2V3Pipeline({
      url: 'https://www.youtube.com/shorts/JSf3Yh3094s',
      videoId: 'JSf3Yh3094s',
      metadata: {
        title: 'Fixture title',
      },
    }, {
      env: {},
    })

    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.reason, 'TRACK2_V3_PROVIDER_UNAVAILABLE')
    assert.equal(result.intent, 'UNKNOWN')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.intentReason, 'NO_STRONG_INTENT_SIGNAL')
    assert.equal(result.resolvedPlace, null)
    assert.ok(Array.isArray(result.candidates))
    assert.ok(Array.isArray(result.evidence))
    assert.ok(Array.isArray(result.providerErrors))
    assert.equal(result.candidates.length, 0)
    assert.equal(result.evidence.length, 0)
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE'
    ))
    assert.equal(result.metrics.frameCount, 4)
    assert.equal(result.metrics.ocrImageCount, 8)
    assert.equal(result.metrics.ocrTextBlockCount, 0)
    assert.equal(result.metrics.evidenceCount, 0)
    assert.equal(result.metrics.candidateCount, 0)
    assert.equal(result.metrics.escalationLevel, 'CHEAP_OCR')
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
    assert.equal(Number.isFinite(result.metrics.latencyMs), true)
    assert.ok(Array.isArray(result.debug.intentSignals))
    assert.deepEqual(result.debug.bestOcrSnippets, [])
    assert.deepEqual(result.debug.placesQueries, [])
  })

  it('carries mustNotResolve intent locks into the skeleton response', async () => {
    const result = await runShortsTrack2V3Pipeline({
      title: 'Top 8 quán ngon Quận 10',
    }, {
      env: {},
    })

    assert.equal(result.intent, 'MULTI_PLACE_OR_LIST')
    assert.equal(result.mustNotResolve, true)
    assert.equal(result.intentReason, 'TITLE_TOP_LIST')
    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTI_PLACE_REVIEW_ONLY')
    assert.ok(result.debug.intentSignals.length > 0)
  })

  it('does not treat an arbitrary mustNotResolve seam as a confirmed listicle', () => {
    const result = decideShortsTrack2V3Result({
      intent: {
        intent: 'UNKNOWN',
        inputClass: 'UNSUPPORTED',
        mustNotResolve: true,
        reason: 'INJECTED_SAFETY_SEAM',
      },
      candidates: [],
      providerErrors: [{ code: 'INJECTED_PROVIDER_ERROR' }],
    })

    assert.equal(result.mustNotResolve, true)
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.reason, 'TRACK2_V3_PROVIDER_UNAVAILABLE')
  })

  it('keeps old Track 2 as default and routes to V3 only when enabled', async () => {
    const track1Fallback = {
      track: 'TRACK_2',
      reason: 'TITLE_ONLY',
      sourceUrl: 'https://www.youtube.com/shorts/example123',
      videoId: 'example123',
      metadata: {
        url: 'https://www.youtube.com/shorts/example123',
        videoId: 'example123',
        title: 'Example',
      },
      stages: {
        router: {
          track: 'TRACK_2',
          reason: 'TITLE_ONLY',
        },
      },
    }

    const oldTrack2Result = await runShortsPipeline(track1Fallback.sourceUrl, {
      env: {},
      runShortsTrack1Pipeline: async () => track1Fallback,
      runShortsTrack2Pipeline: async () => ({ track: 'TRACK_2', resolution: 'UNRESOLVED' }),
    })
    assert.equal(oldTrack2Result.track, 'TRACK_2')

    const v3Result = await runShortsPipeline(track1Fallback.sourceUrl, {
      env: { TRACK2_V3_ENABLED: 'true' },
      runShortsTrack1Pipeline: async () => track1Fallback,
      runShortsTrack2Pipeline: async () => {
        throw new Error('old Track 2 should not run when V3 is enabled')
      },
    })
    assert.equal(v3Result.track, 'TRACK_2_V3')
    assert.equal(v3Result.resolution, 'UNRESOLVED')
  })
})
