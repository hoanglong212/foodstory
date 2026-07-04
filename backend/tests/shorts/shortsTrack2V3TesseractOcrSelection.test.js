import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { runShortsTrack2V3LocalOcrProvider } from '../../src/services/shorts/track2-v3/shortsTrack2V3LocalOcrProviderService.js'
import { generateShortsTrack2V3TesseractPreprocessVariants } from '../../src/services/shorts/track2-v3/shortsTrack2V3TesseractPreprocessService.js'
import {
  scoreShortsTrack2V3TesseractOutput,
  selectBestShortsTrack2V3TesseractAttempt,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3TesseractOcrScoringService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-tesseract-test-'))
  tempDirs.push(directory)
  return directory
}

function tsv(lines, confidence = 85) {
  const rows = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  ]
  lines.forEach((line, lineIndex) => {
    line.split(/\s+/u).forEach((word, wordIndex) => {
      rows.push([
        5, 1, 1, 1, lineIndex + 1, wordIndex + 1,
        wordIndex * 20, lineIndex * 20, 18, 18, confidence, word,
      ].join('\t'))
    })
  })
  return rows.join('\n')
}

describe('Track 2 V3 Tesseract preprocessing and selection', () => {
  it('generates the bounded preprocessing variant set offline', async () => {
    const directory = await tempDir()
    const imagePath = path.join(directory, 'crop.jpg')
    await sharp({
      create: {
        width: 320,
        height: 160,
        channels: 3,
        background: '#202020',
      },
    }).jpeg().toFile(imagePath)

    const result = await generateShortsTrack2V3TesseractPreprocessVariants(
      { imagePath, cropVariant: 'upper_middle_crop_raw' },
      { outputDir: directory, index: 0 },
    )
    const names = result.variants.map((variant) => variant.preprocessVariant)

    assert.deepEqual(names, [
      'original',
      'upscale_3x_gray',
      'upscale_4x_gray',
      'sharpen_contrast',
      'threshold_light_text',
      'inverted_threshold',
      'tight_address_line',
    ])
    for (const variant of result.variants.filter((item) => item.generated)) {
      assert.ok(await fs.stat(variant.imagePath))
    }
    assert.deepEqual(result.providerErrors, [])
  })

  it('prefers a cleaner short address pass and marks uncertain digits', () => {
    const attempts = [
      {
        rawText: 'ae xoicem\n1193 3/2 Phường 6 Quan10\nBs 3 @1830-00h30\n- Ss a\nee |',
        confidence: 0.51,
        preprocessVariant: 'original',
        psm: 6,
      },
      {
        rawText: '1193 3/2 Phường 6 Quận 1O',
        confidence: 0.64,
        preprocessVariant: 'upscale_4x_gray',
        psm: 11,
      },
      {
        rawText: 'Sài Gòn Về Đêm\n1840',
        confidence: 0.75,
        preprocessVariant: 'original',
        psm: 12,
      },
    ].map((attempt) => ({
      ...attempt,
      scoring: scoreShortsTrack2V3TesseractOutput(attempt),
    }))

    const best = selectBestShortsTrack2V3TesseractAttempt(attempts)
    assert.equal(best.psm, 11)
    assert.equal(best.rawText, '1193 3/2 Phường 6 Quận 1O')
    assert.equal(best.scoring.lowConfidence, true)
    assert.equal(best.scoring.uncertainHouseNumber, true)
    assert.ok(best.scoring.qualityFlags.includes('UNCERTAIN_HOUSE_NUMBER'))
  })

  it('runs all three PSM modes and returns only the best mocked crop evidence', async () => {
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [
        {
          cropPath: 'C:\\offline\\selected-crop.jpg',
          timestampSeconds: 19.125,
          variant: 'upper_middle_crop_raw',
        },
      ],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        localOcrTimeoutMs: 5000,
        localOcrLanguages: 'vi,en',
      },
      deps: {
        tesseractPreprocessor: async () => ({
          variants: [
            { preprocessVariant: 'original', imagePath: 'original.png' },
            { preprocessVariant: 'tight_address_line', imagePath: 'tight.png' },
          ],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ args }) => {
          if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
          const psm = Number(args[args.indexOf('--psm') + 1])
          if (psm === 6) {
            return { ok: true, stdout: tsv(['ae xoicem', '1193 3/2 Phường 6 Quan10'], 50) }
          }
          if (psm === 11) {
            return { ok: true, stdout: tsv(['1193 3/2 Phường 6 Quận 1O'], 64) }
          }
          return { ok: true, stdout: tsv(['Sài Gòn Về Đêm', '1840'], 75) }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.textBlocks.length, 1)
    assert.equal(result.textBlocks[0].rawText, '1193 3/2 Phường 6 Quận 1O')
    assert.equal(result.textBlocks[0].providerMetadata.psm, 11)
    assert.equal(result.textBlocks[0].providerMetadata.preprocessVariant, 'original')
    assert.equal(result.textBlocks[0].providerMetadata.attemptCount, 6)
    assert.deepEqual(result.textBlocks[0].providerMetadata.attemptedPsms, [11, 12, 6])
    assert.equal(result.textBlocks[0].providerMetadata.attemptSummaries.length, 6)
  })
})
