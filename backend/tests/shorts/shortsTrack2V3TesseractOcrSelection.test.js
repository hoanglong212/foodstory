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
      'overlay_line_band_01',
      'overlay_line_band_02',
      'overlay_line_band_03',
      'overlay_line_band_04',
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

  it('uses repeated range-house OCR consensus instead of a high-scoring leading-digit mutation', () => {
    const attempts = [
      { rawText: '775-97 AulCo, Quan 11', confidence: 0.37, preprocessVariant: 'original', psm: 6 },
      { rawText: '195-97 AulCo, Quan 11', confidence: 0.48, preprocessVariant: 'original', psm: 11 },
      { rawText: '95-97 Au Co, Quan 11', confidence: 0.61, preprocessVariant: 'upscale_3x_gray', psm: 11 },
      { rawText: '95-97 Au Co, Quan 11', confidence: 0.49, preprocessVariant: 'upscale_3x_gray', psm: 6 },
    ].map((attempt) => ({
      ...attempt,
      scoring: scoreShortsTrack2V3TesseractOutput(attempt),
    }))

    const best = selectBestShortsTrack2V3TesseractAttempt(attempts)

    assert.match(best.scoring.bestAddressLine, /^95-97\s+Au Co/iu)
    assert.equal(best.partialHouseConsensusCount, 2)
    assert.equal(best.compatiblePartialHouseConsensusCount, 3)
  })

  it('prefers an intact Vietnamese street token over a higher-confidence mid-word split', () => {
    const selected = selectBestShortsTrack2V3TesseractAttempt([
      {
        rawText: '21/3 Nguyen Th ién Thuật @3)',
        confidence: 0.82,
        preprocessVariant: 'sharpen_contrast',
        psm: 11,
      },
      {
        rawText: '21/3 Nguyen Thiện Thuật asm',
        confidence: 0.57,
        preprocessVariant: 'upscale_3x_gray',
        psm: 6,
      },
    ])

    assert.equal(selected.scoring.bestAddressLine, '21/3 Nguyen Thiện Thuật asm')
    assert.doesNotMatch(selected.scoring.bestAddressLine, /\bTh\s+ién\b/u)
  })

  it('runs a bounded fast/deep progressive cascade and returns one observed best crop evidence', async () => {
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
    assert.equal(result.textBlocks[0].rawText, 'ae xoicem\n1193 3/2 Phường 6 Quan10')
    assert.equal(result.textBlocks[0].providerMetadata.bestAddressLine, '1193 3/2 Phường 6 Quan10')
    assert.equal(result.textBlocks[0].providerMetadata.psm, 6)
    assert.equal(result.textBlocks[0].providerMetadata.preprocessVariant, 'original')
    assert.equal(result.textBlocks[0].providerMetadata.attemptCount, 4)
    assert.equal(result.textBlocks[0].providerMetadata.fastAttemptCount, 2)
    assert.equal(result.textBlocks[0].providerMetadata.deepAttemptCount, 2)
    assert.equal(result.textBlocks[0].providerMetadata.deepPassRan, true)
    assert.deepEqual(result.textBlocks[0].providerMetadata.attemptedPsms, [11, 6])
    assert.equal(result.textBlocks[0].providerMetadata.attemptSummaries.length, 4)
    assert.ok(result.textBlocks[0].providerMetadata.attemptSummaries.every((attempt) =>
      ['1193 3/2 Phường 6 Quan10', '1193 3/2 Phường 6 Quận 1O', '1840'].includes(attempt.bestAddressLine)
    ))
  })

  it('emits bounded supplemental same-frame line-band evidence for multi-line overlays', async () => {
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{
        cropPath: 'C:\\offline\\multi-line-overlay.jpg',
        timestampSeconds: 54.375,
        frameIndex: 56,
        variant: 'dynamic_text_region_01',
        episodeId: 'episode-125',
        segmentId: 'segment-125',
      }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        localOcrTimeoutMs: 5000,
        localOcrLanguages: 'vi,en',
        maxTesseractDeepPassImages: 1,
      },
      deps: {
        tesseractCommands: ['mock-tesseract'],
        tesseractPreprocessor: async (image) => ({
          variants: [
            { preprocessVariant: 'original', imagePath: image.imagePath },
            { preprocessVariant: 'overlay_line_band_01', imagePath: 'band-1.png' },
            { preprocessVariant: 'overlay_line_band_02', imagePath: 'band-2.png' },
          ],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ args }) => {
          if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
          if (args[0] === '--list-langs') return { ok: true, stdout: 'List of available languages (2):\nvie\neng\n' }
          const imagePath = args[0]
          const psm = Number(args[args.indexOf('--psm') + 1])
          if (imagePath === 'band-1.png' && psm === 7) {
            return { ok: true, stdout: tsv(['45/9 Han Hai Nguyen'], 82) }
          }
          if (imagePath === 'band-2.png' && psm === 11) {
            return { ok: true, stdout: tsv(['Phu', "ong'16", 'Quan 11'], 80) }
          }
          return { ok: true, stdout: tsv(['BO BIA 2000'], 70) }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.ok(result.textBlocks.some((block) => block.rawText.includes('45/9 Han Hai Nguyen')))
    assert.ok(result.textBlocks.some((block) =>
      block.rawText.includes('Phu') && block.rawText.includes("ong'16") && block.rawText.includes('Quan 11')
    ))
    assert.ok(result.textBlocks.filter((block) => block.providerMetadata?.lineBandRescue).length <= 3)
    assert.ok(result.textBlocks.filter((block) => block.providerMetadata?.lineBandRescue).every((block) =>
      block.timestampSeconds === 54.375 && block.frameIndex === 56
    ))
  })

  it('prioritizes a main-overlay HOUSE_ONLY fast result for bounded line-band rescue', async () => {
    const lineBandImages = new Set()
    const selectedImages = Array.from({ length: 6 }, (_, index) => ({
      cropPath: `C:\\offline\\crop-${index}.jpg`,
      timestampSeconds: index,
      frameIndex: index,
      variant: 'dynamic_text_region_01',
      selectionRank: index,
      selectorScore: 1 - index * 0.01,
    }))

    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages,
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        localOcrTimeoutMs: 5000,
        localOcrLanguages: 'vi,en',
        maxTesseractDeepPassImages: 1,
      },
      deps: {
        tesseractCommands: ['mock-tesseract'],
        tesseractPreprocessor: async (image) => ({
          variants: [
            { preprocessVariant: 'original', imagePath: image.imagePath },
            { preprocessVariant: 'upscale_3x_gray', imagePath: `${image.imagePath}.3x` },
            { preprocessVariant: 'overlay_line_band_01', imagePath: `${image.imagePath}.band` },
          ],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ args }) => {
          if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
          if (args[0] === '--list-langs') {
            return { ok: true, stdout: 'List of available languages (2):\nvie\neng\n' }
          }
          const imagePath = args[0]
          const psm = Number(args[args.indexOf('--psm') + 1])
          if (imagePath.endsWith('.band')) lineBandImages.add(imagePath)
          const isTarget = imagePath.includes('crop-5.jpg')
          if (isTarget && imagePath.endsWith('.band') && psm === 7) {
            return { ok: true, stdout: tsv(['25 Duong Ngo Thi Nham Phuong 4 Da Lat'], 90) }
          }
          if (isTarget) return { ok: true, stdout: tsv(['25'], 72) }
          return { ok: true, stdout: tsv([`caption overlay ${imagePath}`], 75) }
        },
      },
    })

    assert.ok(result.textBlocks.some((block) =>
      block.rawText.includes('25 Duong Ngo Thi Nham Phuong 4 Da Lat') &&
      block.providerMetadata?.lineBandRescue === true
    ))
    assert.ok(lineBandImages.size <= 4)
  })

  it('falls back to available Tesseract language packs instead of failing the OCR stage', async () => {
    const languageArgs = []
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{
        cropPath: 'C:\offline\selected-crop.jpg',
        timestampSeconds: 9.5,
        variant: 'dynamic_text_region',
      }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        localOcrTimeoutMs: 5000,
        localOcrLanguages: 'vi,en',
      },
      deps: {
        tesseractCommands: ['mock-tesseract'],
        tesseractPreprocessor: async (image) => ({
          variants: [{ preprocessVariant: 'original', imagePath: image.imagePath }],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ args }) => {
          if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
          if (args[0] === '--list-langs') {
            return { ok: true, stdout: 'List of available languages in C:/tessdata (1):\neng\n' }
          }
          languageArgs.push(args[args.indexOf('-l') + 1])
          return { ok: true, stdout: tsv(['242 Doc Lap Phuong Tan Thanh Quan Tan Phu'], 88) }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.deepEqual(new Set(languageArgs), new Set(['eng']))
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'LOCAL_TESSERACT_LANGUAGE_FALLBACK'
    ))
  })

  it('preserves the full observed multi-line OCR text while keeping bestAddressLine as ranking metadata', async () => {
    const observedLines = [
      '242 Độc Lập',
      'P. Tân Thành Q. Tân Phú',
    ]
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{
        cropPath: 'C:\\offline\\address-band.jpg',
        timestampSeconds: 53,
        frameIndex: 53,
        variant: 'dynamic_text_region_01',
      }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        localOcrTimeoutMs: 5000,
        localOcrLanguages: 'vi,en',
      },
      deps: {
        tesseractCommands: ['mock-tesseract'],
        tesseractPreprocessor: async (image) => ({
          variants: [{ preprocessVariant: 'original', imagePath: image.imagePath }],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ args }) => {
          if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
          if (args[0] === '--list-langs') {
            return { ok: true, stdout: 'List of available languages (2):\nvie\neng\n' }
          }
          return { ok: true, stdout: tsv(observedLines, 91) }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.textBlocks.length, 1)
    assert.match(result.textBlocks[0].rawText, /242 Độc Lập/u)
    assert.match(result.textBlocks[0].rawText, /P\. Tân Thành Q\. Tân Phú/u)
    assert.ok(result.textBlocks[0].rawText.includes('\n'))
    assert.ok(result.textBlocks[0].providerMetadata.bestAddressLine)
    assert.notEqual(result.textBlocks[0].providerMetadata.bestAddressLine, result.textBlocks[0].rawText)
  })

  it('scores a bounded post-house apostrophe as OCR separator for slash house street text', () => {
    const result = scoreShortsTrack2V3TesseractOutput({
      rawText: "45/9'Han Hai Nguyen",
      confidence: 0.72,
      preprocessVariant: 'overlay_line_band_01',
      psm: 7,
    })

    assert.equal(result.features.hasSlashNumber, true)
    assert.equal(result.features.hasStreetLike, true)
    assert.equal(result.features.namedStreetWordCount >= 2, true)
  })

  it('uses repeated partial house-number support so one-off 4242 does not beat repeated 242', () => {
    const attempts = [
      { rawText: '4242 Dọc Lapy', confidence: 0.82, preprocessVariant: 'original', psm: 11 },
      { rawText: '242 Dec Lap', confidence: 0.74, preprocessVariant: 'upscale_4x_gray', psm: 11 },
      { rawText: '242 Độc Lap', confidence: 0.70, preprocessVariant: 'upscale_3x_gray', psm: 11 },
      { rawText: '242 Doc Lap', confidence: 0.68, preprocessVariant: 'sharpen_contrast', psm: 12 },
    ]

    const best = selectBestShortsTrack2V3TesseractAttempt(attempts)
    assert.match(best.scoring.bestAddressLine, /^242\s/u)
    assert.ok(best.partialHouseConsensusCount >= 3)
  })


})
