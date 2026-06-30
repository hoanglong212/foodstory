import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runTrack2V3CheapOcrLive } from '../../src/services/shorts/track2-v3/shortsTrack2V3LiveCheapOcrAdapter.js'

const config = {
  enabled: true,
  cheapFrameCount: 4,
  maxFrames: 8,
  maxOcrImages: 8,
  maxDurationSeconds: 60,
  timeoutMs: 1000,
}

const context = {
  url: 'https://www.youtube.com/shorts/example123',
  sourceUrl: 'https://www.youtube.com/shorts/example123',
  videoId: 'example123',
  metadata: {
    durationSeconds: 30,
    title: 'Example video',
  },
}

describe('Track 2 V3 live cheap OCR adapter', () => {
  it('returns a controlled provider error when live providers are missing', async () => {
    const result = await runTrack2V3CheapOcrLive(context, config, {})

    assert.equal(result.liveAdapterRan, true)
    assert.ok(Array.isArray(result.frames))
    assert.ok(Array.isArray(result.ocrImages))
    assert.ok(Array.isArray(result.ocrTextBlocks))
    assert.ok(Array.isArray(result.providerErrors))
    assert.ok(result.providerErrors.some((error) =>
      error.source === 'track2_v3_cheap_ocr' &&
      error.code === 'PROVIDER_UNAVAILABLE' &&
      error.recoverable === true
    ))
    assert.deepEqual(result.metrics, {
      frameCount: 0,
      ocrImageCount: 0,
      ocrTextBlockCount: 0,
    })
    assert.deepEqual(result.debug.bestOcrSnippets, [])
  })

  it('does not throw when the old frame extractor reports unavailable', async () => {
    const result = await runTrack2V3CheapOcrLive(context, config, {
      track2FrameExtractor: async () => ({
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        frames: [],
        diagnostics: [
          {
            code: 'YTDLP_UNAVAILABLE',
            message: 'yt-dlp is unavailable',
          },
        ],
      }),
      track2OcrProvider: async () => {
        throw new Error('OCR provider should not run without frames')
      },
    })

    assert.equal(result.liveAdapterRan, true)
    assert.deepEqual(result.frames, [])
    assert.deepEqual(result.ocrImages, [])
    assert.deepEqual(result.ocrTextBlocks, [])
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'PROVIDER_UNAVAILABLE' &&
      error.providerCode === 'YTDLP_UNAVAILABLE'
    ))
    assert.equal(result.metrics.frameCount, 0)
    assert.equal(result.metrics.ocrImageCount, 0)
    assert.equal(result.metrics.ocrTextBlockCount, 0)
  })
})
