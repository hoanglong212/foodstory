import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildShortsTrack2V3AdaptiveSampleTimestamps,
  decideShortsTrack2V3AdaptiveFrameSampling,
  runShortsTrack2V3AdaptiveFrameSampling,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AdaptiveFrameSamplingService.js'

function enabledConfig(overrides = {}) {
  return {
    adaptiveFrameSamplingEnabled: true,
    adaptiveFrameMaxAdditionalFrames: 4,
    adaptiveFrameSampleIntervalMs: 500,
    adaptiveFrameMaxSelectedImages: 3,
    adaptiveFrameTimeoutMs: 5000,
    maxDurationSeconds: 60,
    ...overrides,
  }
}

function eligibleInput(overrides = {}) {
  return {
    config: enabledConfig(),
    metadataCandidateCount: 0,
    normalCandidateCount: 0,
    selectorResult: {
      generatedCropCount: 6,
      selectedImageCount: 2,
      selectedImages: [{ cropPath: 'normal-a.jpg' }, { cropPath: 'normal-b.jpg' }],
      sampledTimestamps: [0.375, 10.125, 20.625, 30.375, 40.125, 50.625],
    },
    localOcrResult: { status: 'OK', called: true },
    localOcrTextBlocks: [{ rawText: 'weak non-address caption' }],
    ...overrides,
  }
}

describe('Track 2 V3 adaptive frame sampling', () => {
  it('does not run when normal OCR already produced a candidate', () => {
    const decision = decideShortsTrack2V3AdaptiveFrameSampling(
      eligibleInput({ normalCandidateCount: 1 }),
    )

    assert.equal(decision.shouldRun, false)
    assert.equal(decision.reason, 'NORMAL_CANDIDATE_EXISTS')
  })

  it('does not run when the local OCR provider is unavailable', () => {
    const decision = decideShortsTrack2V3AdaptiveFrameSampling(eligibleInput({
      localOcrResult: { status: 'UNAVAILABLE', called: true },
    }))

    assert.equal(decision.shouldRun, false)
    assert.equal(decision.reason, 'LOCAL_OCR_PROVIDER_UNAVAILABLE')
  })

  it('builds bounded additional timestamps across the video and avoids normal samples', () => {
    const existing = [0.25, 10.25, 20.25, 30.25, 40.25, 50.25]
    const timestamps = buildShortsTrack2V3AdaptiveSampleTimestamps(
      { metadata: { durationSeconds: 60 } },
      enabledConfig({ adaptiveFrameMaxAdditionalFrames: 5 }),
      existing,
    )

    assert.equal(timestamps.length, 5)
    assert.ok(timestamps[0] < 10)
    assert.ok(timestamps.at(-1) > 50)
    assert.ok(timestamps.filter((timestamp) => timestamp <= 8).length >= 2)
    assert.ok(timestamps.every((timestamp) =>
      existing.every((normalTimestamp) => Math.abs(timestamp - normalTimestamp) >= 0.1)
    ))
  })

  it('distributes remaining coverage across an uncovered video tail', () => {
    const existing = Array.from({ length: 60 }, (_, index) => 0.375 + index)
    const timestamps = buildShortsTrack2V3AdaptiveSampleTimestamps(
      { metadata: { durationSeconds: 100 } },
      enabledConfig({ adaptiveFrameMaxAdditionalFrames: 12, maxDurationSeconds: 120 }),
      existing,
    )
    const tail = timestamps.filter((timestamp) => timestamp > 60)

    assert.ok(tail.length >= 6)
    assert.ok(tail[0] < 66)
    assert.ok(tail.at(-1) > 95)
  })

  it('enforces frame and selected-crop caps on an injected adaptive sampler', async () => {
    let requestedTimestamps = []
    const result = await runShortsTrack2V3AdaptiveFrameSampling({
      context: { metadata: { durationSeconds: 30 } },
      ...eligibleInput(),
      deps: {
        adaptiveFrameSampler: async ({ sampledTimestamps, maxAdditionalFrames }) => {
          requestedTimestamps = sampledTimestamps
          assert.equal(maxAdditionalFrames, 4)
          return {
            sampledFrameCount: 99,
            generatedCropCount: 24,
            selectedCropIds: ['crop-001', 'crop-002', 'crop-003', 'crop-004'],
            selectedImages: [1, 2, 3, 4].map((index) => ({
              cropPath: `adaptive-${index}.jpg`,
            })),
            providerErrors: [],
          }
        },
      },
    })

    assert.ok(requestedTimestamps.length <= 4)
    assert.equal(result.ran, true)
    assert.equal(result.frameCount, 4)
    assert.equal(result.selectedImages.length, 3)
    assert.equal(result.selectedCropIds.length, 3)
  })
})
