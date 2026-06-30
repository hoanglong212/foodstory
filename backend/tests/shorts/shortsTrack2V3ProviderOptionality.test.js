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
    assert.equal(config.track2V3LocalOcrEnabled, false)
    assert.equal(config.track2V3SmartOverlayEnabled, true)
    assert.equal(config.track2V3SmartOverlayDryRun, false)
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
