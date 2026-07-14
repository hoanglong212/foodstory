import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildShortsTrack2V3TemporalTextEpisodes } from '../../src/services/shorts/track2-v3/shortsTrack2V3TemporalTextEpisodeService.js'

function crop(timestampSeconds, signature, score = 0.7, top = 100) {
  return {
    frameIndex: Math.round(timestampSeconds * 2),
    timestampSeconds,
    signature,
    score,
    variant: 'dynamic_text_region_01',
    sourceFrameHeight: 1000,
    cropBounds: { left: 0, top, width: 500, height: 180 },
    scoreBreakdown: { contrast: 0.6, edgeDensity: 0.7, textBandScore: 0.8 },
  }
}

describe('Track2 V3 temporal text episodes', () => {
  it('collapses repeated overlay regions and keeps representative neighbours', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [
        crop(12.0, '0000000011111111', 0.60),
        crop(12.6, '0000000011111111', 0.92),
        crop(13.2, '0000000011111110', 0.70),
      ],
      config: {
        temporalEpisodeEnabled: true,
        temporalEpisodeMaxGapSeconds: 2.25,
        temporalEpisodeMaxRepresentatives: 12,
        temporalEpisodeNeighborCount: 2,
      },
    })
    assert.equal(result.episodeCount, 1)
    assert.equal(result.representatives.length, 1)
    assert.equal(result.representatives[0].timestampSeconds, 12.6)
    assert.equal(result.representatives[0].episodeNeighbors.length, 2)
    assert.equal(result.reductionRatio, 0.3333)
  })

  it('keeps visually distinct overlays in separate episodes', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [crop(10, '0000000000000000'), crop(10.8, '1111111111111111')],
      config: { temporalEpisodeEnabled: true },
    })
    assert.equal(result.episodeCount, 2)
  })

  it('associates moderate appearance drift along the same region trajectory', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [
        crop(20.0, '0000000000000000111111111111111100000000000000001111111111111111', 0.72, 120),
        crop(20.7, '0000000000000011111111111111111000000000000000011111111111111110', 0.69, 126),
        crop(21.4, '0000000000000111111111111111110000000000000000111111111111111100', 0.74, 132),
        crop(22.1, '0000000000001111111111111111100000000000000001111111111111111000', 0.71, 128),
      ],
      config: { temporalEpisodeEnabled: true, temporalEpisodeMaxGapSeconds: 2.25 },
    })

    assert.equal(result.episodeCount, 1)
    assert.equal(result.repeatedEpisodeCount, 1)
    assert.equal(result.singleFrameEpisodeCount, 0)
    assert.equal(result.maxEpisodeSupportCount, 4)
    assert.deepEqual(result.episodeSupportHistogram, { '1': 0, '2': 0, '3-4': 1, '5+': 0 })
  })

  it('does not merge radically different text that reuses the same geometry', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [
        crop(30.0, '0000000000000000000000000000000011111111111111111111111111111111', 0.78, 100),
        crop(30.6, '1111111111111111111111111111111100000000000000000000000000000000', 0.77, 100),
      ],
      config: { temporalEpisodeEnabled: true },
    })

    assert.equal(result.episodeCount, 2)
    assert.equal(result.singleFrameEpisodeCount, 2)
    assert.equal(result.repeatedEpisodeCount, 0)
  })

  it('does not merge subtitle token changes from position alone', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [
        crop(40.0, '0000111100001111000011110000111100001111000011110000111100001111', 0.81, 700),
        crop(40.5, '0011001100110011110011001100110000110011001100111100110011001100', 0.80, 702),
        crop(41.0, '1111000011110000111100001111000011110000111100001111000011110000', 0.82, 698),
      ],
      config: { temporalEpisodeEnabled: true },
    })

    assert.equal(result.episodeCount, 3)
  })
})
