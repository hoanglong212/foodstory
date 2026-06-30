import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { runShortsTrack2V3SmartOverlayDryRun } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-overlay-dry-run-'))
  tempDirs.push(directory)
  return directory
}

async function createOverlayFrame(filePath) {
  const svg = `
    <svg width="480" height="854" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="854" fill="#666666"/>
      <rect x="30" y="145" width="420" height="230" fill="#101010" opacity="0.9"/>
      <text x="54" y="210" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff">OFFLINE TEXT</text>
      <text x="54" y="274" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">DISTRICT HINT</text>
      <text x="54" y="330" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">OPEN HOURS</text>
    </svg>`

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(filePath)
}

describe('Track 2 V3 smart overlay dry-run', () => {
  it('produces selected image diagnostics without OCR, ASR, Google Vision, Places, or Gemini', async () => {
    const directory = await tempDir()
    const framePath = path.join(directory, 'frame.jpg')
    await createOverlayFrame(framePath)

    const calls = {
      frameExtractor: 0,
      googleVision: 0,
      places: 0,
      gemini: 0,
      asr: 0,
      localOcr: 0,
    }
    const failProvider = (key) => async () => {
      calls[key] += 1
      throw new Error(`${key} should not run`)
    }

    const result = await runShortsTrack2V3SmartOverlayDryRun(
      {
        url: 'https://www.youtube.com/shorts/example-overlay',
        sourceUrl: 'https://www.youtube.com/shorts/example-overlay',
        videoId: 'example-overlay',
        metadata: {
          durationSeconds: 20,
        },
      },
      {
        track2V3SmartOverlayEnabled: true,
        smartOverlaySampleIntervalMs: 750,
        maxSmartOverlayFrames: 60,
        maxSmartOverlaySelectedImages: 4,
        smartOverlayTimeoutMs: 2000,
      },
      {
        outputDir: directory,
        keepSampledFrames: true,
        track2FrameExtractor: async () => {
          calls.frameExtractor += 1
          return {
            status: 'OK',
            reason: 'MOCK_FRAMES',
            sampledTimestamps: [12],
            frames: [
              {
                frameIndex: 0,
                timestampSeconds: 12,
                imagePath: framePath,
                path: framePath,
                mimeType: 'image/jpeg',
              },
            ],
            diagnostics: [],
          }
        },
        track2OcrProvider: failProvider('googleVision'),
        placesProvider: failProvider('places'),
        geminiProvider: failProvider('gemini'),
        asrProvider: failProvider('asr'),
        localOcrProvider: failProvider('localOcr'),
      },
    )

    assert.equal(calls.frameExtractor, 1)
    assert.equal(calls.googleVision, 0)
    assert.equal(calls.places, 0)
    assert.equal(calls.gemini, 0)
    assert.equal(calls.asr, 0)
    assert.equal(calls.localOcr, 0)
    assert.equal(result.status, 'OK')
    assert.equal(result.sampledFrameCount, 1)
    assert.equal(result.selectedImageCount > 0, true)
    assert.equal(result.selectedImageCount <= 4, true)
    assert.equal(result.providerCalls.googleVisionCalled, false)
    assert.equal(result.providerCalls.placesCalled, false)
    assert.equal(result.providerCalls.geminiCalled, false)
    assert.equal(result.providerCalls.localOcrCalled, false)
    assert.equal(result.providerCalls.asrCalled, false)
    assert.deepEqual(result.providerErrors, [])
    assert.ok(result.selectedImages[0].cropPath)
    assert.ok(await fs.stat(result.selectedImages[0].cropPath))
  })

  it('does not crash when OCR providers are missing', async () => {
    const directory = await tempDir()
    const framePath = path.join(directory, 'frame.jpg')
    await createOverlayFrame(framePath)

    const result = await runShortsTrack2V3SmartOverlayDryRun(
      {
        url: 'https://www.youtube.com/shorts/example-no-ocr',
        videoId: 'example-no-ocr',
        metadata: {
          durationSeconds: 12,
        },
      },
      {
        track2V3SmartOverlayEnabled: true,
        maxSmartOverlaySelectedImages: 2,
      },
      {
        outputDir: directory,
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 9,
            imagePath: framePath,
            path: framePath,
          },
        ],
      },
    )

    assert.equal(result.status, 'OK')
    assert.equal(result.selectedImageCount > 0, true)
    assert.equal(result.providerCalls.googleVisionCalled, false)
    assert.equal(result.providerCalls.localOcrCalled, false)
    assert.deepEqual(result.providerErrors, [])
  })
})
