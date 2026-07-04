import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  SMART_OVERLAY_CROP_VARIANTS,
  selectShortsTrack2V3SmartOverlayCrops,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-overlay-selector-'))
  tempDirs.push(directory)
  return directory
}

async function createPlainFrame(filePath) {
  await sharp({
    create: {
      width: 480,
      height: 854,
      channels: 3,
      background: '#777777',
    },
  }).jpeg({ quality: 90 }).toFile(filePath)
}

async function createOverlayFrame(filePath) {
  const svg = `
    <svg width="480" height="854" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="854" fill="#777777"/>
      <rect x="24" y="120" width="432" height="260" rx="0" fill="#111111" opacity="0.88"/>
      <text x="48" y="185" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff">TEXT OVERLAY</text>
      <text x="48" y="250" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">123 SAMPLE DISTRICT</text>
      <text x="48" y="310" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">18H30 00H30</text>
      <line x1="48" y1="336" x2="420" y2="336" stroke="#ffffff" stroke-width="5"/>
    </svg>`

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(filePath)
}

function frame(imagePath, timestampSeconds, frameIndex = 0) {
  return {
    frameIndex,
    timestampSeconds,
    imagePath,
    path: imagePath,
    mimeType: 'image/jpeg',
  }
}

describe('Track 2 V3 smart overlay selector', () => {
  it('supports all overlay crop variants and emits selected image metadata', async () => {
    const directory = await tempDir()
    const framePath = path.join(directory, 'overlay.jpg')
    await createOverlayFrame(framePath)

    const result = await selectShortsTrack2V3SmartOverlayCrops({
      frames: [frame(framePath, 10, 0)],
      outputDir: directory,
      config: {
        maxSmartOverlaySelectedImages: 10,
      },
      durationSeconds: 20,
    })

    const selectedVariants = new Set(result.selectedImages.map((image) => image.variant))
    for (const definition of SMART_OVERLAY_CROP_VARIANTS) {
      assert.ok(selectedVariants.has(definition.variant), `missing ${definition.variant}`)
    }

    assert.equal(result.status, 'OK')
    assert.equal(result.sampledFrameCount, 1)
    assert.equal(result.selectedImageCount <= 10, true)
    assert.equal(result.providerCalls.googleVisionCalled, false)
    assert.equal(result.providerCalls.placesCalled, false)
    assert.equal(result.providerCalls.geminiCalled, false)
    assert.equal(result.providerCalls.localOcrCalled, false)
    assert.equal(result.providerCalls.asrCalled, false)

    for (const image of result.selectedImages) {
      assert.equal(typeof image.timestampSeconds, 'number')
      assert.equal(typeof image.variant, 'string')
      assert.equal(typeof image.score, 'number')
      assert.ok(image.score >= 0)
      assert.ok(image.framePath)
      assert.ok(image.cropPath)
      assert.ok(image.width > 0)
      assert.ok(image.height > 0)
      assert.ok(await fs.stat(image.cropPath))
    }
  })

  it('selects a high-score overlay crop over a low-score crop and respects the max count', async () => {
    const directory = await tempDir()
    const lowPath = path.join(directory, 'low.jpg')
    const highPath = path.join(directory, 'high.jpg')
    await createPlainFrame(lowPath)
    await createOverlayFrame(highPath)

    const result = await selectShortsTrack2V3SmartOverlayCrops({
      frames: [
        frame(lowPath, 2, 0),
        frame(highPath, 12, 1),
      ],
      outputDir: directory,
      config: {
        maxSmartOverlaySelectedImages: 1,
      },
      durationSeconds: 20,
    })

    assert.equal(result.selectedImageCount, 1)
    assert.equal(result.selectedImages[0].frameIndex, 1)
    assert.equal(result.selectedImages[0].timestampSeconds, 12)
    assert.ok(result.selectedImages[0].score > 0.2)
    assert.ok(result.selectedImages[0].cropPath)
  })

  it('writes inspectable selector crop diagnostics and contact sheets without changing selection', async () => {
    const directory = await tempDir()
    const lowPath = path.join(directory, 'diagnostic-low.jpg')
    const highPath = path.join(directory, 'diagnostic-high.jpg')
    await createPlainFrame(lowPath)
    await createOverlayFrame(highPath)

    const result = await selectShortsTrack2V3SmartOverlayCrops({
      frames: [
        frame(lowPath, 2, 0),
        frame(highPath, 12, 1),
      ],
      outputDir: directory,
      config: { maxSmartOverlaySelectedImages: 1 },
      durationSeconds: 20,
      videoId: 'selector-diagnostics-mock',
      deps: {
        selectorDiagnosticsEnabled: true,
        keepSampledFrames: true,
      },
    })

    assert.ok(result.selectorDiagnosticsPath)
    assert.ok(result.contactSheetPath)
    assert.ok(await fs.stat(result.selectorDiagnosticsPath))
    assert.ok(await fs.stat(result.contactSheetPath))
    assert.ok(await fs.stat(result.selectedContactSheetPath))
    assert.ok(result.generatedCropCount >= result.selectedImageCount)
    assert.equal(result.selectedCropIds.length, result.selectedImageCount)
    assert.ok(Object.keys(result.cropRegionCounts).length > 0)

    const diagnostics = JSON.parse(await fs.readFile(result.selectorDiagnosticsPath, 'utf8'))
    assert.equal(diagnostics.videoId, 'selector-diagnostics-mock')
    assert.equal(diagnostics.frameCount, 2)
    assert.equal(diagnostics.generatedCropCount, SMART_OVERLAY_CROP_VARIANTS.length * 2)
    assert.equal(diagnostics.selectedCropIds.length, 1)
    assert.ok(diagnostics.crops.some((crop) => crop.selected === false))
    assert.ok(diagnostics.crops.every((crop) => crop.scores.digitPresence === null))
    assert.ok(diagnostics.crops.every((crop) => crop.scores.addressKeywordHint === null))
    assert.ok(await fs.stat(path.join(directory, 'all-crops')))
    assert.ok(await fs.stat(path.join(directory, 'unselected-crops')))
  })
})
