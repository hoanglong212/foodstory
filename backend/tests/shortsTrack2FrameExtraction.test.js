import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  __shortsTrack2FrameExtractionTestUtils,
  extractShortsFramesForOcr,
  getTrack2FrameExtractionLimits,
  TRACK2_FRAME_EXTRACTION_LIMITS,
} from '../src/services/shortsTrack2FrameExtractionService.js'
import {
  __shortsTrack2LiveProviderTestUtils,
  createLiveTrack2FrameExtractor,
} from '../src/services/shortsTrack2LiveProviderService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

async function withFrameMaxDurationEnv(value, callback) {
  const original = process.env.TRACK2_FRAME_MAX_DURATION_SECONDS
  if (value === undefined) delete process.env.TRACK2_FRAME_MAX_DURATION_SECONDS
  else process.env.TRACK2_FRAME_MAX_DURATION_SECONDS = value

  try {
    return await callback()
  } finally {
    if (original === undefined) delete process.env.TRACK2_FRAME_MAX_DURATION_SECONDS
    else process.env.TRACK2_FRAME_MAX_DURATION_SECONDS = original
  }
}

async function withSamplingEnv({ enabled, strategy }, callback) {
  const originalEnabled = process.env.TRACK2_SMART_SAMPLING_ENABLED
  const originalStrategy = process.env.TRACK2_FRAME_SAMPLE_STRATEGY
  if (enabled === undefined) delete process.env.TRACK2_SMART_SAMPLING_ENABLED
  else process.env.TRACK2_SMART_SAMPLING_ENABLED = enabled
  if (strategy === undefined) delete process.env.TRACK2_FRAME_SAMPLE_STRATEGY
  else process.env.TRACK2_FRAME_SAMPLE_STRATEGY = strategy

  try {
    return await callback()
  } finally {
    if (originalEnabled === undefined) delete process.env.TRACK2_SMART_SAMPLING_ENABLED
    else process.env.TRACK2_SMART_SAMPLING_ENABLED = originalEnabled
    if (originalStrategy === undefined) delete process.env.TRACK2_FRAME_SAMPLE_STRATEGY
    else process.env.TRACK2_FRAME_SAMPLE_STRATEGY = originalStrategy
  }
}

function track1Fallback(overrides = {}) {
  return {
    track: 'TRACK_2',
    sourceUrl: SHORTS_URL,
    videoId: 'abc123DEF45',
    metadata: {
      url: SHORTS_URL,
      videoId: 'abc123DEF45',
      duration: 'PT35S',
      title: 'Track 2 fallback',
    },
    ...overrides,
  }
}

describe('shortsTrack2FrameExtraction', () => {
  it('returns REJECTED / MISSING_SOURCE_URL when sourceUrl is missing', async () => {
    const result = await extractShortsFramesForOcr(track1Fallback({
      sourceUrl: null,
      metadata: {
        videoId: 'abc123DEF45',
        duration: 'PT35S',
      },
    }))

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.reason, 'MISSING_SOURCE_URL')
    assert.equal(result.frameCount, 0)
    assert.deepEqual(result.frames, [])
  })

  it('keeps the default duration limit at 60 seconds when env is absent', async () => {
    await withFrameMaxDurationEnv(undefined, async () => {
      let providerCalls = 0

      const result = await extractShortsFramesForOcr(track1Fallback({
        metadata: {
          url: SHORTS_URL,
          videoId: 'abc123DEF45',
          duration: 'PT1M1S',
        },
      }), {
        track2FrameExtractor: async () => {
          providerCalls += 1
          return { status: 'OK', frames: [] }
        },
      })

      assert.equal(result.status, 'REJECTED')
      assert.equal(result.reason, 'VIDEO_TOO_LONG')
      assert.equal(result.durationSeconds, 61)
      assert.equal(result.maxDurationSeconds, 60)
      assert.equal(result.frameCount, 0)
      assert.equal(providerCalls, 0)
      assert.equal('limitBytes' in result.diagnostics[0], false)
      assert.equal(result.diagnostics[0].maxDurationSeconds, 60)
    })
  })

  it('allows a duration exactly equal to the default 60-second limit', async () => {
    await withFrameMaxDurationEnv(undefined, async () => {
      let providerCalls = 0
      const result = await extractShortsFramesForOcr(track1Fallback({
        metadata: {
          url: SHORTS_URL,
          videoId: 'abc123DEF45',
          durationSeconds: 60,
        },
      }), {
        track2FrameExtractor: async () => {
          providerCalls += 1
          return { status: 'OK', frames: [] }
        },
      })

      assert.equal(result.status, 'OK')
      assert.equal(result.maxDurationSeconds, 60)
      assert.equal(providerCalls, 1)
    })
  })

  it('allows a duration exactly equal to the configured 180-second limit', async () => {
    await withFrameMaxDurationEnv('180', async () => {
      let providerContext = null
      const result = await extractShortsFramesForOcr(track1Fallback({
        metadata: {
          url: SHORTS_URL,
          videoId: 'abc123DEF45',
          duration: 'PT3M',
        },
      }), {
        track2FrameExtractor: async (context) => {
          providerContext = context
          return { status: 'OK', frames: [] }
        },
      })

      assert.equal(result.status, 'OK')
      assert.equal(result.durationSeconds, 180)
      assert.equal(result.maxDurationSeconds, 180)
      assert.equal(providerContext.limits.maxVideoDurationSeconds, 180)
    })
  })

  it('rejects 181 seconds when the configured limit is 180', async () => {
    await withFrameMaxDurationEnv('180', async () => {
      let providerCalls = 0
      const result = await extractShortsFramesForOcr(track1Fallback({
        metadata: {
          url: SHORTS_URL,
          videoId: 'abc123DEF45',
          durationSeconds: 181,
        },
      }), {
        track2FrameExtractor: async () => {
          providerCalls += 1
          return { status: 'OK', frames: [] }
        },
      })

      assert.equal(result.status, 'REJECTED')
      assert.equal(result.reason, 'VIDEO_TOO_LONG')
      assert.equal(result.durationSeconds, 181)
      assert.equal(result.maxDurationSeconds, 180)
      assert.equal(providerCalls, 0)
    })
  })

  it('falls back to 60 seconds for an invalid duration override', async () => {
    await withFrameMaxDurationEnv('not-a-number', async () => {
      const result = await extractShortsFramesForOcr(track1Fallback({
        metadata: {
          url: SHORTS_URL,
          videoId: 'abc123DEF45',
          durationSeconds: 61,
        },
      }), {
        track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      })

      assert.equal(result.status, 'REJECTED')
      assert.equal(result.maxDurationSeconds, 60)
      assert.equal(__shortsTrack2FrameExtractionTestUtils.resolveTrack2FrameMaxDurationSeconds('181'), 60)
      assert.equal(__shortsTrack2FrameExtractionTestUtils.resolveTrack2FrameMaxDurationSeconds('180'), 180)
    })
  })

  it('samples across the configured duration while keeping maxFrames bounded', () => {
    const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
      { durationSeconds: 180 },
      { maxFrames: 999, maxVideoDurationSeconds: 180 },
    )

    assert.deepEqual(timestamps, [20, 40, 60, 80, 100, 120, 140, 160])
    assert.equal(timestamps.length, 8)
    assert.ok(timestamps.every((timestamp) => timestamp > 0 && timestamp < 180))
    assert.ok(timestamps.some((timestamp) => timestamp > 60))
  })

  it('defaults sampling strategy to UNIFORM when env is absent', async () => {
    await withSamplingEnv({}, async () => {
      assert.equal(getTrack2FrameExtractionLimits().sampleStrategy, 'UNIFORM')
    })
  })

  it('falls back to UNIFORM for an invalid configured strategy', async () => {
    await withSamplingEnv({ enabled: 'true', strategy: 'random' }, async () => {
      assert.equal(getTrack2FrameExtractionLimits().sampleStrategy, 'UNIFORM')
    })
  })

  it('keeps UNIFORM when smart sampling is disabled', async () => {
    await withSamplingEnv({ enabled: 'false', strategy: 'HEAD_MID_TAIL' }, async () => {
      assert.equal(getTrack2FrameExtractionLimits().sampleStrategy, 'UNIFORM')
    })
  })

  it('uses deterministic HEAD_MID_TAIL timestamps when explicitly enabled', async () => {
    await withSamplingEnv({ enabled: 'true', strategy: 'HEAD_MID_TAIL' }, async () => {
      const limits = getTrack2FrameExtractionLimits()
      const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
        { durationSeconds: 150 },
        { ...limits, maxVideoDurationSeconds: 180 },
      )

      assert.equal(limits.sampleStrategy, 'HEAD_MID_TAIL')
      assert.deepEqual(timestamps, [12, 24, 42, 67.5, 82.5, 108, 126, 138])
      assert.ok(timestamps.some((timestamp) => timestamp > 60))
      assert.ok(timestamps.some((timestamp) => timestamp > 100))
      assert.equal(timestamps.length, 8)
    })
  })

  it('keeps HEAD_MID_TAIL stable and bounded for short videos', () => {
    const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
      { durationSeconds: 20 },
      { maxFrames: 8, maxVideoDurationSeconds: 180, sampleStrategy: 'HEAD_MID_TAIL' },
    )

    assert.deepEqual(timestamps, [1.6, 3.2, 5.6, 9, 11, 14.4, 16.8, 18.4])
    assert.ok(timestamps.every((timestamp) => timestamp > 0 && timestamp < 20))
  })

  it('samples a 150-second video beyond 60 seconds when max duration is 180', () => {
    const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
      { durationSeconds: 150 },
      { maxFrames: 8, maxVideoDurationSeconds: 180 },
    )

    assert.equal(timestamps.length, 8)
    assert.ok(timestamps.some((timestamp) => timestamp > 60))
    assert.ok(timestamps.every((timestamp) => timestamp > 0 && timestamp < 150))
  })

  it('caps sampling at 60 seconds when extended duration is not configured', () => {
    const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
      { durationSeconds: 90 },
      { maxFrames: 8, maxVideoDurationSeconds: 60 },
    )

    assert.equal(timestamps.length, 8)
    assert.ok(timestamps.every((timestamp) => timestamp > 0 && timestamp < 60))
  })

  it('keeps fallback timestamps for unknown duration', () => {
    const timestamps = __shortsTrack2LiveProviderTestUtils.buildSampleTimestamps(
      {},
      { maxFrames: 8, maxVideoDurationSeconds: 180, sampleStrategy: 'HEAD_MID_TAIL' },
    )

    assert.deepEqual(timestamps, [1, 3, 5, 8, 12, 18, 24, 32])
  })

  it('sanitizes injected provider success frames', async () => {
    let providerContext = null

    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractor: async (context) => {
        providerContext = context
        return {
          status: 'OK',
          reason: 'MOCK_FRAMES',
          sampledTimestamps: [0, 12.5],
          frames: [
            {
              frameIndex: 0,
              timestampSeconds: 0,
              imagePath: 'C:/tmp/frame-0.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1200,
              rawImageBytes: Buffer.from('do-not-return'),
              base64: 'data:image/jpeg;base64,unsafe',
            },
          ],
          diagnostics: [{ code: 'MOCK_OK', message: 'mocked' }],
        }
      },
    })

    assert.equal(providerContext.sourceUrl, SHORTS_URL)
    assert.equal(providerContext.videoId, 'abc123DEF45')
    assert.equal(providerContext.metadata.title, 'Track 2 fallback')
    assert.equal(providerContext.limits.maxFrames, 8)
    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'MOCK_FRAMES')
    assert.deepEqual(result.sampledTimestamps, [0, 12.5])
    assert.equal(result.frameCount, 1)
    assert.deepEqual(result.frames, [
      {
        frameIndex: 0,
        timestampSeconds: 0,
        imagePath: 'C:/tmp/frame-0.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
      },
    ])
  })

  it('returns ERROR instead of throwing when the injected provider throws', async () => {
    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractor: async () => {
        throw new Error('mock extractor failed')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'FRAME_EXTRACTION_PROVIDER_ERROR')
    assert.equal(result.frameCount, 0)
    assert.ok(result.diagnostics.some((item) => item.code === 'FRAME_EXTRACTION_PROVIDER_ERROR'))
  })

  it('aborts a non-resolving provider within budget and runs timeout cleanup', async () => {
    let signalObserved = false
    let cleanupCalls = 0
    const startedAt = Date.now()

    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractionBudgetMs: 25,
      cleanupTrack2LiveProviders: async () => {
        cleanupCalls += 1
      },
      track2FrameExtractor: async ({ signal }) => new Promise(() => {
        signal.addEventListener('abort', () => {
          signalObserved = true
        }, { once: true })
      }),
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'FRAME_EXTRACTION_TIMEOUT')
    assert.equal(result.budgetMs, 25)
    assert.ok(result.diagnostics.some((item) => item.code === 'FRAME_EXTRACTION_TIMEOUT'))
    assert.equal(signalObserved, true)
    assert.equal(cleanupCalls, 1)
    assert.ok(Date.now() - startedAt < 1000)
  })

  it('command runner returns a controlled result when aborted', async () => {
    const controller = new AbortController()
    const commandPromise = __shortsTrack2LiveProviderTestUtils.runCommand(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { timeoutMs: 5000, signal: controller.signal },
    )
    setTimeout(() => controller.abort(), 50)

    const result = await commandPromise
    assert.equal(result.ok, false)
    assert.equal(result.aborted, true)
    assert.equal(result.timedOut, false)
  })

  it('command runner kills and reports a timed-out child process', async () => {
    const result = await __shortsTrack2LiveProviderTestUtils.runCommand(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { timeoutMs: 100 },
    )

    assert.equal(result.ok, false)
    assert.equal(result.timedOut, true)
    assert.equal(result.aborted, false)
  })

  it('removes frames over the per-frame size limit', async () => {
    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 0,
            imagePath: 'C:/tmp/oversized.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: TRACK2_FRAME_EXTRACTION_LIMITS.maxFrameSizeBytes + 1,
          },
          {
            frameIndex: 1,
            timestampSeconds: 10,
            imagePath: 'C:/tmp/valid.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 2048,
          },
        ],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.frameCount, 1)
    assert.equal(result.frames[0].imagePath, 'C:/tmp/valid.jpg')
    assert.ok(result.diagnostics.some((item) => item.code === 'FRAME_SIZE_LIMIT_EXCEEDED'))
  })

  it('drops frames once total frame bytes exceed the limit', async () => {
    const frames = Array.from({ length: 6 }, (_, index) => ({
      frameIndex: index,
      timestampSeconds: index * 5,
      imagePath: `C:/tmp/frame-${index}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: TRACK2_FRAME_EXTRACTION_LIMITS.maxFrameSizeBytes,
    }))

    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames,
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.frameCount, 5)
    assert.ok(
      result.frames.reduce((total, frame) => total + frame.sizeBytes, 0) <=
        TRACK2_FRAME_EXTRACTION_LIMITS.maxTotalFrameBytes,
    )
    assert.ok(result.diagnostics.some((item) => item.code === 'TOTAL_FRAME_BYTES_LIMIT_EXCEEDED'))
  })

  it('never includes raw image bytes in returned frame output', async () => {
    const result = await extractShortsFramesForOcr(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 0,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            rawImageBytes: Buffer.from('unsafe'),
            imageBase64: 'data:image/jpeg;base64,unsafe',
          },
        ],
      }),
    })

    const serialized = JSON.stringify(result)
    assert.equal(serialized.includes('rawImageBytes'), false)
    assert.equal(serialized.includes('imageBase64'), false)
    assert.equal(serialized.includes('data:image'), false)
  })

  it('live frame provider unavailable returns controlled diagnostics, not a crash', async () => {
    const provider = createLiveTrack2FrameExtractor({
      ytDlpBin: 'definitely-missing-track2-ytdlp',
      ffmpegBin: 'definitely-missing-track2-ffmpeg',
      commandTimeoutMs: 100,
    })

    const result = await provider({
      sourceUrl: SHORTS_URL,
      videoId: 'abc123DEF45',
      metadata: track1Fallback().metadata,
      limits: TRACK2_FRAME_EXTRACTION_LIMITS,
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'FRAME_PROVIDER_UNAVAILABLE')
    assert.deepEqual(result.frames, [])
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'YTDLP_UNAVAILABLE'))
  })
})
