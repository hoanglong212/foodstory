import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  getShortsTrack2V3Config,
  runShortsTrack2V3Pipeline,
} from '../../src/services/shorts/track2-v3/index.js'
import { runShortsTrack2V3SmartOverlayDryRun } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-provider-optionality-'))
  tempDirs.push(directory)
  return directory
}

async function createOverlayFrame(filePath) {
  const svg = `
    <svg width="480" height="854" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="854" fill="#707070"/>
      <rect x="28" y="132" width="424" height="250" fill="#101010" opacity="0.9"/>
      <text x="56" y="202" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff">PROVIDER FREE</text>
      <text x="56" y="268" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">OVERLAY SIGNAL</text>
      <text x="56" y="324" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">DEBUG CROP</text>
    </svg>`

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(filePath)
}

describe('Track 2 V3 provider optionality', () => {
  it('keeps Google Vision, Places, Gemini, and local OCR disabled by default', () => {
    const config = getShortsTrack2V3Config({})

    assert.equal(config.track2V3GoogleVisionEnabled, false)
    assert.equal(config.track2V3PlacesEnabled, false)
    assert.equal(config.track2V3GeminiVisionEnabled, false)
    assert.equal(config.track2V3GeminiCropJudgeEnabled, false)
    assert.equal(config.geminiCropJudgeModel, 'gemini-3.5-flash')
    assert.equal(config.geminiCropJudgeMaxPages, 6)
    assert.equal(config.geminiCropJudgeMaxSelectedCrops, 8)
    assert.equal(config.geminiCropJudgeTimeoutMs, 60000)
    assert.equal(config.geminiCropJudgeMaxRequestBytes, 12000000)
    assert.equal(config.geminiCropJudgeMaxImageBytes, 4000000)
    assert.equal(config.geminiCropJudgeJpegQuality, 80)
    assert.equal(config.track2V3LocalOcrEnabled, false)
    assert.equal(config.track2V3PaddleOcrEnabled, true)
    assert.equal(config.paddleOcrAllowModelDownload, false)
    assert.equal(config.maxPaddleOcrImages, 6)
    assert.equal(config.maxEasyOcrImages, 6)
    assert.equal(config.localOcrDebugEnabled, false)
    assert.equal(config.track2V3SmartOverlayEnabled, true)
    assert.equal(config.track2V3SmartOverlayDryRun, false)
    assert.equal(config.adaptiveFrameSamplingEnabled, false)
    assert.equal(config.adaptiveFrameMaxAdditionalFrames, 18)
    assert.equal(config.adaptiveFrameSampleIntervalMs, 500)
    assert.equal(config.adaptiveFrameMaxSelectedImages, 12)
    assert.equal(config.adaptiveFrameTimeoutMs, 45000)
  })

  it('reads bounded Gemini Crop Judge request-size controls from env', () => {
    const config = getShortsTrack2V3Config({
      TRACK2_V3_GEMINI_CROP_JUDGE_MAX_REQUEST_BYTES: '15000000',
      TRACK2_V3_GEMINI_CROP_JUDGE_MAX_IMAGE_BYTES: '5000000',
      TRACK2_V3_GEMINI_CROP_JUDGE_JPEG_QUALITY: '72',
    })

    assert.equal(config.geminiCropJudgeMaxRequestBytes, 15000000)
    assert.equal(config.geminiCropJudgeMaxImageBytes, 5000000)
    assert.equal(config.geminiCropJudgeJpegQuality, 72)
  })

  it('reads bounded local OCR engine caps and controls from env', () => {
    const config = getShortsTrack2V3Config({
      TRACK2_V3_MAX_LOCAL_OCR_IMAGES: '4',
      TRACK2_V3_MAX_EASYOCR_IMAGES: '3',
      TRACK2_V3_MAX_PADDLEOCR_IMAGES: '5',
      TRACK2_V3_PADDLEOCR_ENABLED: 'false',
      TRACK2_V3_PADDLEOCR_ALLOW_MODEL_DOWNLOAD: 'true',
      TRACK2_V3_LOCAL_OCR_PROVIDER: 'ensemble',
      TRACK2_V3_LOCAL_OCR_TIMEOUT_MS: '180000',
      TRACK2_V3_LOCAL_OCR_DEBUG: 'true',
    })

    assert.equal(config.maxLocalOcrImages, 4)
    assert.equal(config.maxEasyOcrImages, 3)
    assert.equal(config.maxPaddleOcrImages, 5)
    assert.equal(config.track2V3PaddleOcrEnabled, false)
    assert.equal(config.paddleOcrAllowModelDownload, true)
    assert.equal(config.track2V3LocalOcrProvider, 'ensemble')
    assert.equal(config.localOcrTimeoutMs, 180000)
    assert.equal(config.localOcrDebugEnabled, true)
  })

  it('reads bounded adaptive frame sampling controls from env', () => {
    const config = getShortsTrack2V3Config({
      TRACK2_V3_ADAPTIVE_FRAME_SAMPLING_ENABLED: 'true',
      TRACK2_V3_ADAPTIVE_FRAME_MAX_ADDITIONAL_FRAMES: '9',
      TRACK2_V3_ADAPTIVE_FRAME_SAMPLE_INTERVAL_MS: '400',
      TRACK2_V3_ADAPTIVE_FRAME_MAX_SELECTED_IMAGES: '7',
      TRACK2_V3_ADAPTIVE_FRAME_TIMEOUT_MS: '30000',
    })

    assert.equal(config.adaptiveFrameSamplingEnabled, true)
    assert.equal(config.adaptiveFrameMaxAdditionalFrames, 9)
    assert.equal(config.adaptiveFrameSampleIntervalMs, 400)
    assert.equal(config.adaptiveFrameMaxSelectedImages, 7)
    assert.equal(config.adaptiveFrameTimeoutMs, 30000)
  })

  it('does not call a legacy Google OCR provider when V3 is enabled but Google Vision is disabled', async () => {
    let frameExtractorCalls = 0
    let ocrProviderCalls = 0
    const secretValue = 'secret-provider-token-should-not-leak'

    const result = await runShortsTrack2V3Pipeline(
      {
        url: 'https://www.youtube.com/shorts/provider-optional',
        sourceUrl: 'https://www.youtube.com/shorts/provider-optional',
        videoId: 'provider-optional',
        metadata: {
          title: 'Provider optional video',
          durationSeconds: 20,
        },
      },
      {
        env: {
          TRACK2_V3_ENABLED: 'true',
        },
        track2FrameExtractor: async () => {
          frameExtractorCalls += 1
          throw new Error(`frame extractor should not run ${secretValue}`)
        },
        track2OcrProvider: async () => {
          ocrProviderCalls += 1
          throw new Error(`Google Vision should not run ${secretValue}`)
        },
      },
    )

    assert.equal(frameExtractorCalls, 0)
    assert.equal(ocrProviderCalls, 0)
    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.reason, 'TRACK2_V3_PROVIDER_UNAVAILABLE')
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE'
    ))
    assert.doesNotMatch(JSON.stringify(result.providerErrors), /secret-provider-token/u)
  })

  it('runs smart overlay dry-run without Google config', async () => {
    const directory = await tempDir()
    const framePath = path.join(directory, 'frame.jpg')
    await createOverlayFrame(framePath)

    const result = await runShortsTrack2V3SmartOverlayDryRun(
      {
        url: 'https://www.youtube.com/shorts/provider-free-overlay',
        sourceUrl: 'https://www.youtube.com/shorts/provider-free-overlay',
        videoId: 'provider-free-overlay',
        metadata: {
          durationSeconds: 15,
        },
      },
      getShortsTrack2V3Config({}),
      {
        outputDir: directory,
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 12,
            imagePath: framePath,
            path: framePath,
          },
        ],
      },
    )

    assert.equal(result.status, 'OK')
    assert.equal(result.selectedImageCount > 0, true)
    assert.deepEqual(result.providerErrors, [])
    assert.equal(result.providerCalls.googleVisionCalled, false)
    assert.equal(result.providerCalls.placesCalled, false)
    assert.equal(result.providerCalls.geminiCalled, false)
    assert.equal(result.providerCalls.asrCalled, false)
    assert.equal(result.providerCalls.localOcrCalled, false)
  })
})
