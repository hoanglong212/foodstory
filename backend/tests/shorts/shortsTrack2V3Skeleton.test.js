import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsPipeline } from '../../src/services/shortsPipelineService.js'
import {
  DEFAULT_SHORTS_TRACK2_V3_CONFIG,
  getShortsTrack2V3Config,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

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
    assert.equal(result.reason, 'TRACK2_V3_SKELETON_NO_VISUAL_PASS_YET')
    assert.equal(result.mustNotResolve, false)
    assert.equal(result.resolvedPlace, null)
    assert.ok(Array.isArray(result.candidates))
    assert.ok(Array.isArray(result.evidence))
    assert.ok(Array.isArray(result.providerErrors))
    assert.equal(result.candidates.length, 0)
    assert.equal(result.evidence.length, 0)
    assert.equal(result.providerErrors.length, 0)
    assert.equal(result.metrics.frameCount, 0)
    assert.equal(result.metrics.ocrImageCount, 0)
    assert.equal(result.metrics.ocrTextBlockCount, 0)
    assert.equal(result.metrics.evidenceCount, 0)
    assert.equal(result.metrics.candidateCount, 0)
    assert.equal(result.metrics.escalationLevel, 'SKELETON')
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
    assert.equal(Number.isFinite(result.metrics.latencyMs), true)
    assert.deepEqual(result.debug.bestOcrSnippets, [])
    assert.deepEqual(result.debug.placesQueries, [])
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
