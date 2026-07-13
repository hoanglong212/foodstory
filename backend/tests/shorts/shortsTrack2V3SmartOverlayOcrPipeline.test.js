import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'
import { normalizeShortsTrack2V3OcrAdminText } from '../../src/services/shorts/track2-v3/shortsTrack2V3OcrHouseNumberSafetyService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function selectedCrop() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-local-ocr-'))
  tempDirs.push(directory)
  const cropPath = path.join(directory, 'selected-crop.jpg')
  await fs.writeFile(cropPath, 'offline mocked crop')
  return {
    cropPath,
    timestampSeconds: 19.125,
    frameIndex: 19,
    variant: 'upper_middle_crop_raw',
    sourceType: 'smart_overlay_crop_upper_middle',
    score: 0.9,
  }
}

function config() {
  return {
    enabled: true,
    track2V3SmartOverlayEnabled: true,
    track2V3LocalOcrEnabled: true,
    track2V3LocalOcrProvider: 'easyocr',
    track2V3EasyOcrEnabled: true,
    track2V3TesseractEnabled: true,
    localOcrTimeoutMs: 5000,
    maxLocalOcrImages: 24,
    localOcrLanguages: 'vi,en',
  }
}

function selectorResult(crop) {
  return {
    status: 'OK',
    sampledFrameCount: 1,
    selectedImageCount: 1,
    selectedImages: [crop],
    sampledFrames: [],
    providerErrors: [],
  }
}

function mockedTesseractTsv(lines, confidence = 88) {
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

function failExternalProvider(calls, key) {
  return async () => {
    calls[key] += 1
    throw new Error(`${key} must not run`)
  }
}

async function adaptiveTailFixture({ selectedTailCropId = null } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-tail-overlay-'))
  tempDirs.push(directory)
  const crops = []
  const regions = [
    'top_overlay_crop_raw',
    'upper_middle_crop_raw',
    'lower_middle_crop_raw',
  ]
  for (const [frameIndex, timestampSeconds] of [4.25, 14.25, 24.25].entries()) {
    for (const regionType of regions) {
      const shortRegion = regionType.replace(/_crop_raw$/u, '')
      const cropId = `crop-${frameIndex}-${shortRegion}`
      const cropPath = path.join(directory, `${cropId}.jpg`)
      await fs.writeFile(cropPath, `offline ${cropId}`)
      crops.push({
        cropId,
        frameId: `frame-${frameIndex}`,
        frameIndex,
        timestampSeconds,
        regionType,
        variant: regionType,
        path: cropPath,
        cropPath,
        selected: cropId === selectedTailCropId,
      })
    }
  }
  const adaptiveSelected = selectedTailCropId
    ? crops.find((crop) => crop.cropId === selectedTailCropId)
    : crops.find((crop) => crop.cropId === 'crop-0-lower_middle')
  return {
    directory,
    crops,
    adaptiveSelected,
    samplerResult: {
      sampledFrameCount: 3,
      generatedCropCount: crops.length,
      selectedCropIds: [adaptiveSelected.cropId],
      selectedImages: [{
        ...adaptiveSelected,
        sourceType: 'smart_overlay_crop',
      }],
      selectorDiagnostics: { crops },
      providerErrors: [],
    },
  }
}

function injectedTailPreprocessor(calls = []) {
  return async (image) => {
    const alternatePath = path.join(
      path.dirname(image.cropPath),
      `${image.cropId}-tail-sharpen.png`,
    )
    await fs.writeFile(alternatePath, `tail sharpen ${image.cropId}`)
    calls.push({
      cropId: image.cropId,
      sourceCropPath: image.cropPath,
      alternatePath,
    })
    return {
      variants: [
        { preprocessVariant: 'original', imagePath: image.cropPath, generated: false },
        { preprocessVariant: 'sharpen_contrast', imagePath: alternatePath, generated: true },
      ],
      providerErrors: [],
      cleanup: async () => {},
    }
  }
}

async function runInjectedTailOverlayCase({
  tailText,
  tailProviderStatus = 'OK',
  tailProviderErrors = [],
  duplicateTailText = false,
  selectedTailCropId = null,
} = {}) {
  const crop = await selectedCrop()
  const fixture = await adaptiveTailFixture({ selectedTailCropId })
  const preprocessCalls = []
  const ocrCalls = []
  const result = await runShortsTrack2V3SmartOverlayOcr(
    {
      url: 'https://example.test/injected-tail-overlay',
      metadata: { title: 'Danh sach mon an', durationSeconds: 30 },
      fixtureCase: { expected: { mustNotResolve: true } },
    },
    {
      ...config(),
      adaptiveFrameSamplingEnabled: true,
      adaptiveFrameMaxAdditionalFrames: 4,
      adaptiveFrameMaxSelectedImages: 3,
      track2V3GeminiCropJudgeEnabled: false,
    },
    {
      smartOverlayResult: {
        ...selectorResult(crop),
        duration: 30,
        generatedCropCount: 6,
        sampledTimestamps: [2.5, 12.5, 22.5],
      },
      adaptiveFrameSampler: async () => fixture.samplerResult,
      tailOverlayPreprocessor: injectedTailPreprocessor(preprocessCalls),
      localOcrProvider: async ({ selectedImages, config: ocrConfig }) => {
        ocrCalls.push(selectedImages)
        const isTail = selectedImages.every((image) =>
          String(image.preprocessingVariant || '').startsWith('tail_')
        )
        if (!isTail) {
          return {
            status: 'OK',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [{
              source: 'local_tesseract',
              rawText: 'Mon ngon hom nay',
              imagePath: selectedImages[0].cropPath,
            }],
            providerErrors: [],
          }
        }
        assert.equal(ocrConfig.track2V3LocalOcrProvider, 'ensemble')
        assert.ok(selectedImages.length <= 4)
        assert.ok(selectedImages.every((image) =>
          ['top_overlay_crop_raw', 'upper_middle_crop_raw'].includes(image.regionType)
        ))
        const blocks = tailText
          ? [{
              source: 'local_tesseract',
              rawText: tailText,
              imagePath: selectedImages[0].cropPath,
              timestampSeconds: selectedImages[0].timestampSeconds,
              cropVariant: selectedImages[0].variant,
              preprocessingVariant: selectedImages[0].preprocessingVariant,
            }]
          : []
        if (duplicateTailText && blocks.length) blocks.push({ ...blocks[0], id: 'duplicate' })
        return {
          status: tailProviderStatus,
          reason: tailProviderStatus === 'ERROR'
            ? 'LOCAL_OCR_PROVIDER_ERROR'
            : 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_ocr_ensemble',
          textBlocks: blocks,
          providerErrors: tailProviderErrors,
        }
      },
    },
  )
  return { result, fixture, preprocessCalls, ocrCalls }
}

describe('Track 2 V3 smart overlay local OCR pipeline', () => {
  it('materializes a selected frame region before real local OCR instead of OCRing the full frame', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-materialize-region-'))
    tempDirs.push(directory)
    const framePath = path.join(directory, 'frame.jpg')
    await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 30, g: 30, b: 30 },
      },
    }).jpeg().toFile(framePath)

    let observedDimensions = null
    const result = await runShortsTrack2V3SmartOverlayOcr({
      url: 'https://www.youtube.com/shorts/materialize-test',
      title: 'Review quán ăn một địa điểm',
    }, {
      ...config(),
      track2V3LocalOcrProvider: 'tesseract',
      track2V3EasyOcrEnabled: false,
      track2V3TesseractEnabled: true,
      adaptiveFrameSamplingEnabled: false,
      asrFallbackEnabled: false,
      track2V3GeminiCropJudgeEnabled: false,
    }, {
      smartOverlayResult: {
        status: 'OK',
        sampledFrameCount: 1,
        selectedImageCount: 1,
        selectedImages: [{
          id: 'episode-representative-1',
          framePath,
          imagePath: framePath,
          cropPath: null,
          cropBounds: { left: 40, top: 50, width: 120, height: 60 },
          timestampSeconds: 12.4,
          frameIndex: 12,
          variant: 'dynamic_text_region_1',
          sourceType: 'smart_overlay_dynamic_text_region',
          score: 0.95,
          episodeId: 'episode-001',
          segmentId: 'segment-001',
          startSeconds: 12.4,
          endSeconds: 14.1,
        }],
        sampledFrames: [],
        providerErrors: [],
      },
      tesseractPreprocessor: async (image) => {
        const metadata = await sharp(image.imagePath).metadata()
        observedDimensions = { width: metadata.width, height: metadata.height }
        return {
          variants: [{ preprocessVariant: 'original', imagePath: image.imagePath }],
          providerErrors: [],
          cleanup: async () => {},
        }
      },
      commandRunner: async ({ args }) => {
        if (args[0] === '--version') return { ok: true, stdout: 'tesseract 5' }
        return {
          ok: true,
          stdout: mockedTesseractTsv(['242 Độc Lập, Phường Tân Thành, Quận Tân Phú']),
        }
      },
    })

    assert.deepEqual(observedDimensions, { width: 120, height: 60 })
    assert.equal(result.localOcrCalled, true)
    assert.ok(result.localOcrBestSnippets.some((snippet) => snippet.includes('242 Độc Lập')))
  })
  it('creates a low-confidence review-only candidate from local EasyOCR', async () => {
    const crop = await selectedCrop()
    const calls = { googleVision: 0, places: 0, gemini: 0, asr: 0, localOcr: 0 }
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/offline-local-ocr',
        sourceUrl: 'https://www.youtube.com/shorts/offline-local-ocr',
        videoId: 'offline-local-ocr',
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async ({ selectedImages }) => {
          calls.localOcr += 1
          assert.equal(selectedImages[0].cropPath, crop.cropPath)
          return {
            status: 'OK',
            reason: 'LOCAL_OCR_TEXT_COLLECTED',
            called: true,
            provider: 'local_easyocr',
            textBlocks: [
              {
                source: 'local_easyocr',
                rawText: 'xe *oi dem\n1143 3/2 PhưỜng 6 Quận 10',
                confidence: 0.48,
                bbox: [[12, 18], [438, 18], [438, 142], [12, 142]],
                imagePath: crop.cropPath,
                timestampSeconds: crop.timestampSeconds,
                cropVariant: crop.variant,
                preprocessingVariant: 'original',
                providerMetadata: {
                  adapter: 'mock_easyocr',
                  languages: ['vi', 'en'],
                  preprocessVariant: 'original',
                  lowConfidence: true,
                },
              },
            ],
            providerErrors: [],
          }
        },
        track2OcrProvider: failExternalProvider(calls, 'googleVision'),
        placesProvider: failExternalProvider(calls, 'places'),
        geminiProvider: failExternalProvider(calls, 'gemini'),
        asrProvider: failExternalProvider(calls, 'asr'),
      },
    )

    assert.equal(calls.localOcr, 1)
    assert.equal(calls.googleVision, 0)
    assert.equal(calls.places, 0)
    assert.equal(calls.gemini, 0)
    assert.equal(calls.asr, 0)
    assert.equal(result.resolution, 'CANDIDATES')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.localOcrCalled, true)
    assert.equal(result.localOcrProvider, 'local_easyocr')
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
    assert.equal(result.metrics.candidateQualityGateRan, true)
    assert.ok(result.rawCandidateCount >= 1)
    assert.ok(result.keptCandidateCount >= 1)

    const candidate = result.candidates.find((item) =>
      item.addressFragment?.includes('1143 3/2')
    )
    assert.ok(candidate)
    assert.equal(candidate.addressFragment, '1143 3/2 Phường 6 Quận 10')
    assert.doesNotMatch(candidate.addressFragment, /11433\/2/u)
    assert.equal(candidate.originalAddressFragment, '1143 3/2 PhưỜng 6 Quận 10')
    assert.equal(candidate.normalizedAddressFragment, '1143 3/2 Phường 6 Quận 10')
    assert.equal(candidate.houseNumberToken, '1143 3/2')
    assert.deepEqual(candidate.houseNumberAlternatives, ['1143 3/2'])
    assert.equal(candidate.houseNumberConflict, false)
    assert.ok(candidate.normalizationApplied.includes('NORMALIZED_WARD_TEXT'))
    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('NOISY_HOUSE_NUMBER'))
    assert.ok(candidate.riskFlags.includes('MISSING_STREET_NAME'))
    assert.equal(result.evidence[0].source, 'local_easyocr')
    assert.deepEqual(result.evidence[0].bbox, [[12, 18], [438, 18], [438, 142], [12, 142]])
    assert.equal(result.evidence[0].imagePath, crop.cropPath)
    assert.equal(result.evidence[0].cropVariant, crop.variant)
    assert.equal(result.evidence[0].preprocessingVariant, 'original')
  })

  it('collapses conflicting OCR house numbers into one noisy review candidate', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/offline-house-number-conflict',
        sourceUrl: 'https://www.youtube.com/shorts/offline-house-number-conflict',
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_easyocr',
          textBlocks: [
            {
              source: 'local_easyocr',
              rawText: 'xe *oi dem\n1143 3/2 Phường 6 Quận 10\n18h30 - 00h30',
              confidence: 0.55,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
              providerMetadata: { lowConfidence: true },
            },
            {
              source: 'local_easyocr',
              rawText: 'xe xôi đêm\n11433/2 Phường 6 Quận 10\n18h30 00h30',
              confidence: 0.82,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
            },
            {
              source: 'local_easyocr',
              rawText: 'xe xoi dem\n1193 3/2 Phường 6 Quận 10\n18h30 - 00h30',
              confidence: 0.64,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
              providerMetadata: { uncertainHouseNumber: true },
            },
          ],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.doesNotMatch(candidate.addressFragment, /11433\/2/u)
    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('NOISY_HOUSE_NUMBER'))
    assert.equal(candidate.houseNumberConflict, true)
    assert.deepEqual(candidate.houseNumberAlternatives, [
      '1143 3/2',
      '11433/2',
      '1193 3/2',
    ])
    assert.ok(candidate.houseNumberAlternatives.includes(candidate.houseNumberToken))
    assert.ok(result.localOcrTextBlocks.some((block) =>
      block.rawText.includes(candidate.originalAddressFragment)
    ))
  })

  it('keeps house-number alternatives scoped to the candidate visual neighborhood', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://www.youtube.com/shorts/offline-listicle-house-scope' },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [
            { source: 'local_tesseract', rawText: '1100 ban tam 30 hấm', confidence: 0.5, timestampSeconds: 23.625, imagePath: 'first.jpg' },
            { source: 'local_tesseract', rawText: '45/9 Han Hat Nguy ê', confidence: 0.6, timestampSeconds: 56.625, imagePath: 'second.jpg' },
          ],
          providerErrors: [],
        }),
      },
    )

    const realCandidate = result.candidates.find((candidate) => candidate.addressFragment?.includes('45/9'))
    assert.ok(realCandidate)
    assert.deepEqual(realCandidate.houseNumberAlternatives, ['45/9'])
    assert.equal(result.candidates.some((candidate) => candidate.addressFragment?.includes('1100 ban tam')), false)
  })

  it('retains more than two review candidates for a real runtime listicle intent', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/offline-runtime-listicle',
        title: 'Những quán ăn giá rẻ ở Sài Gòn',
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [
            { source: 'local_tesseract', rawText: '182 Lò Siêu, Phường 12, Quận 11', confidence: 0.8, timestampSeconds: 10, imagePath: 'a.jpg' },
            { source: 'local_tesseract', rawText: '136 Vạn Kiếp, Phường 3, Quận Bình Thạnh', confidence: 0.8, timestampSeconds: 30, imagePath: 'b.jpg' },
            { source: 'local_tesseract', rawText: '45/9 Hàn Hải Nguyên, Phường 16, Quận 11', confidence: 0.8, timestampSeconds: 55, imagePath: 'c.jpg' },
          ],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.intent, 'MULTI_PLACE_OR_LIST')
    assert.equal(result.mustNotResolve, true)
    assert.ok(result.candidates.length >= 3)
    assert.ok(result.candidates.every((candidate) => candidate.canAutoResolve === false))
  })

  it('normalizes Vietnamese admin text without changing house-number digits', () => {
    const normalized = normalizeShortsTrack2V3OcrAdminText(
      '1143 3/2  PhưỜng 6 Quan10, Quận 1O',
    )

    assert.equal(normalized.text, '1143 3/2 Phường 6 Quận 10, Quận 10')
    assert.match(normalized.text, /^1143 3\/2/u)
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_WARD_TEXT'))
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_DISTRICT_TEXT'))
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_ADMIN_DIGIT'))
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_SPACING'))
  })

  it('splits a compact PaddleOCR address without inventing missing letters', () => {
    const normalized = normalizeShortsTrack2V3OcrAdminText(
      '25DungNgôThiNhm,Phung4,DàLat',
    )

    assert.equal(normalized.text, '25 Đ. Ngô Thi Nhm,Phường 4,Dà Lat')
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_JOINED_OCR_WORDS'))
    assert.ok(normalized.normalizationApplied.includes('NORMALIZED_STREET_MARKER'))
    assert.doesNotMatch(normalized.text, /Nhậm/u)
  })

  it('prefers a high-confidence compact PaddleOCR address over a noisier same-house Tesseract fusion', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-compact-ensemble-ranking' },
      { ...config(), track2V3LocalOcrProvider: 'ensemble' },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_ocr_ensemble',
          imageCount: 1,
          textBlocks: [
            {
              source: 'local_tesseract',
              rawText: '25 Duong Rgô)Thì NhậmXPhưỡng 4104 Lat, Phường 4',
              confidence: 0.38,
              providerMetadata: { ocrScore: 65, lowConfidence: true },
            },
            {
              source: 'local_paddleocr',
              rawText: '25DungNgôThiNhm,Phung4,DàLat',
              confidence: 0.9,
              providerMetadata: { lowConfidence: false },
            },
          ].map((block) => ({
            ...block,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
          })),
          providerErrors: [],
        }),
      },
    )

    assert.ok(result.candidates.length >= 1)
    assert.equal(result.candidates[0].addressFragment, '25 Đ. Ngô Thi Nhm,Phường 4,Dà Lat')
    assert.doesNotMatch(result.candidates[0].addressFragment, /4104|Rgô/u)
    assert.equal(result.candidates[0].canAutoResolve, false)
  })

  it('creates a conservative PaddleOCR candidate with safe admin normalization', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-paddle-ocr' },
      { ...config(), track2V3LocalOcrProvider: 'paddleocr' },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_paddleocr',
          imageCount: 1,
          engineRuns: {
            local_paddleocr: {
              provider: 'local_paddleocr',
              status: 'OK',
              imageCountSent: 1,
              bestSnippets: ['Xexöiđêm 1143 3/2 PhuÖng 6 Quân 10 18h30-00h30'],
            },
          },
          textBlocks: [{
            source: 'local_paddleocr',
            rawText: 'Xexöiđêm\n1143 3/2 PhuÖng 6 Quân 10\n18h30-00h30',
            confidence: 0.71,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
            providerMetadata: { lowConfidence: true },
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.localOcrProvider, 'local_paddleocr')
    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.equal(candidate.addressFragment, '1143 3/2 Phường 6 Quận 10')
    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('NOISY_HOUSE_NUMBER'))
    assert.ok(candidate.riskFlags.includes('MISSING_STREET_NAME'))
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.localOcrEngineDiagnostics.local_paddleocr.imageCountSent, 1)
    assert.ok(result.localOcrBestSnippetsByEngine.local_paddleocr[0].includes('PhuÖng'))
  })

  it('chooses an exact ensemble house number only when raw evidence supports it', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-ensemble-explicit' },
      { ...config(), track2V3LocalOcrProvider: 'ensemble' },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_ocr_ensemble',
          imageCount: 3,
          textBlocks: [
            { source: 'local_easyocr', rawText: '1143 3/2 Phường 6 Quận 10', confidence: 0.55 },
            { source: 'local_tesseract', rawText: '1193 3/2 Phường 6 Quận 10', confidence: 0.55 },
            { source: 'local_paddleocr', rawText: '1433/2 Phường 6 Quận 10', confidence: 0.8 },
          ].map((block) => ({
            ...block,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
          })),
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.localOcrProvider, 'local_ocr_ensemble')
    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.match(candidate.addressFragment, /^1433\/2\b/u)
    assert.deepEqual(candidate.houseNumberAlternatives, [
      '1143 3/2',
      '1193 3/2',
      '1433/2',
    ])
    assert.equal(candidate.houseNumberConflict, true)
    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('NOISY_HOUSE_NUMBER'))
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.ok(result.localOcrTextBlocks.some((block) =>
      block.source === 'local_paddleocr' && block.rawText.includes('1433/2')
    ))
  })

  it('never invents an unsupported house number in ensemble mode', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-ensemble-no-explicit' },
      { ...config(), track2V3LocalOcrProvider: 'ensemble' },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_ocr_ensemble',
          imageCount: 3,
          textBlocks: [
            { source: 'local_easyocr', rawText: '1143 3/2 Phường 6 Quận 10', confidence: 0.55 },
            { source: 'local_tesseract', rawText: '1193 3/2 Phường 6 Quận 10', confidence: 0.55 },
            { source: 'local_paddleocr', rawText: '1143 3/2 PhuÖng 6 Quân 10', confidence: 0.75 },
          ].map((block) => ({
            ...block,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
          })),
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.doesNotMatch(candidate.addressFragment, /1433\/2/u)
    assert.deepEqual(candidate.houseNumberAlternatives, ['1143 3/2', '1193 3/2'])
    assert.equal(candidate.houseNumberConflict, true)
    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('NOISY_HOUSE_NUMBER'))
    assert.notEqual(result.resolution, 'RESOLVED')
  })

  it('removes date and time noise before selecting a directly supported house number', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-date-time-address' },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_easyocr',
          textBlocks: [{
            source: 'local_easyocr',
            rawText: '6-7-8/12/2024\nTRUNG TÂM VĂN HÓA QUẬN\n105 Tran Hung Dao, Quận 5',
            confidence: 0.62,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
            providerMetadata: { lowConfidence: true },
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    const candidate = result.candidates[0]
    assert.ok(candidate)
    assert.deepEqual(candidate.houseNumberAlternatives, ['105'])
    assert.equal(candidate.houseNumberToken, '105')
    assert.doesNotMatch(candidate.addressFragment, /8\/12\/2024/u)
    assert.ok(candidate.riskFlags.includes('DATE_TIME_REMOVED_FROM_ADDRESS'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
  })

  it('recognizes noisy Vietnamese admin and street anchors as a review-only candidate', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/offline-noisy-vietnamese-admin' },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [{
            source: 'local_tesseract',
            rawText: '360 D. Pham Văn Chí, Phưròng 4, Qun 6',
            confidence: 0.54,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
            providerMetadata: { lowConfidence: true },
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    const candidate = result.candidates[0]
    assert.ok(candidate)
    assert.match(candidate.addressFragment, /Phường 4/u)
    assert.match(candidate.addressFragment, /Quận 6/u)
    assert.deepEqual(candidate.houseNumberAlternatives, ['360'])
    assert.ok(candidate.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('OCR_NORMALIZED_ADMIN'))
    assert.ok(candidate.riskFlags.includes('OCR_NOISY_STREET'))
    assert.equal(candidate.canAutoResolve, false)
  })

  it('strips a joined place prefix and safely normalizes a strong Quân district address', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/offline-place-prefixed-address',
        metadata: { title: 'TOP NHỮNG QUÁN ĂN BÁN GIÁ RẺ' },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_ocr_ensemble',
          textBlocks: [{
            source: 'local_easyocr',
            rawText: 'QUÁNCHÁO 1K 221 Phan Văn Khe; Quân 6; TP HCM',
            confidence: 0.72,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.equal(candidate.addressFragment, '221 Phan Văn Khe; Quận 6; TP HCM')
    assert.equal(candidate.displayText, candidate.addressFragment)
    assert.doesNotMatch(candidate.addressFragment, /QUÁN|1K/u)
    assert.ok(candidate.riskFlags.includes('OCR_ADDRESS_FRAGMENT'))
    assert.ok(candidate.riskFlags.includes('OCR_PLACE_PREFIX_STRIPPED'))
    assert.ok(candidate.riskFlags.includes('OCR_NORMALIZED_ADMIN'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.deepEqual(candidate.houseNumberAlternatives, ['221'])
    assert.equal(candidate.canAutoResolve, false)
    assert.equal(result.canAutoResolve, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('parses joined house, street, and named district OCR without inventing a house number', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/offline-joined-named-district',
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_ocr_ensemble',
          textBlocks: [{
            source: 'local_tesseract',
            rawText: 'Xôigà56 56TrinhDinhTrong QuânTân Phú',
            confidence: 0.72,
            imagePath: crop.cropPath,
            timestampSeconds: crop.timestampSeconds,
            cropVariant: crop.variant,
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.candidates.length, 1)
    const candidate = result.candidates[0]
    assert.equal(candidate.addressFragment, '56 Trinh Dinh Trong, Quận Tân Phú')
    assert.equal(candidate.houseNumberToken, '56')
    assert.deepEqual(candidate.houseNumberAlternatives, ['56'])
    assert.ok(candidate.riskFlags.includes('OCR_JOINED_HOUSE_STREET'))
    assert.ok(candidate.riskFlags.includes('OCR_JOINED_ADMIN_TEXT'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
    assert.equal(result.canAutoResolve, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('rejects a generic list caption without creating a candidate', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/offline-generic-list',
        fixtureCase: { category: 'generic_caption_only' },
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [{
            source: 'local_tesseract',
            rawText: 'TOP 8 QUÁN NÊN THỬ QUẬN BÌNH THẠNH PHẦN 2',
            confidence: 0.8,
            imagePath: crop.cropPath,
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('rejects an address-like non-food negative fixture', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/offline-nonfood-negative',
        fixtureCase: { category: 'no_address_expected' },
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_easyocr',
          textBlocks: [{
            source: 'local_easyocr',
            rawText: 'TRUNG TÂM SỬA CÁP\n12 Đ. Nguyen Van Cu, Phường 4, Quận 5',
            confidence: 0.79,
            imagePath: crop.cropPath,
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.canAutoResolve, false)
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('keeps old behavior when the Gemini crop judge feature flag is disabled', async () => {
    const crop = await selectedCrop()
    let cropJudgeCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/crop-judge-disabled' },
      { ...config(), track2V3GeminiCropJudgeEnabled: false },
      {
        smartOverlayResult: selectorResult(crop),
        geminiCropJudge: async () => {
          cropJudgeCalls += 1
          throw new Error('disabled crop judge must not run')
        },
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [],
          providerErrors: [],
        }),
      },
    )

    assert.equal(cropJudgeCalls, 0)
    assert.equal(result.geminiCropJudgeEnabled, false)
    assert.equal(result.geminiCropJudgeCalled, false)
    assert.equal(result.resolution, 'UNRESOLVED')
  })

  it('does not run adaptive sampling when normal selected-crop OCR has a candidate', async () => {
    const crop = await selectedCrop()
    let adaptiveCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/adaptive-not-needed' },
      { ...config(), adaptiveFrameSamplingEnabled: true },
      {
        smartOverlayResult: selectorResult(crop),
        adaptiveFrameSampler: async () => {
          adaptiveCalls += 1
          throw new Error('adaptive sampler must not run')
        },
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_ocr_ensemble',
          textBlocks: [{
            source: 'local_tesseract',
            rawText: '221 Phan Văn Khe, Quận 6, TP HCM',
            confidence: 0.84,
            imagePath: crop.cropPath,
          }],
          providerErrors: [],
        }),
      },
    )

    assert.equal(adaptiveCalls, 0)
    assert.equal(result.adaptiveFrameSamplingEnabled, true)
    assert.equal(result.adaptiveFrameSamplingRan, false)
    assert.equal(result.adaptiveSamplingReason, 'NORMAL_CANDIDATE_EXISTS')
    assert.equal(result.tailOverlayEscalationRan, false)
    assert.equal(result.tailOverlayEscalationReason, 'NORMAL_CANDIDATE_EXISTS')
    assert.equal(result.resolution, 'CANDIDATES')
  })

  it('uses adaptive-frame OCR to create only a review candidate from injected additional frames', async () => {
    const crop = await selectedCrop()
    const adaptivePath = path.join(path.dirname(crop.cropPath), 'adaptive-crop.jpg')
    await fs.writeFile(adaptivePath, 'offline mocked adaptive crop')
    const adaptiveCrop = {
      cropPath: adaptivePath,
      frameIndex: 4,
      timestampSeconds: 4.25,
      variant: 'upper_middle_crop_raw',
      sourceType: 'smart_overlay_crop_upper_middle',
    }
    let localOcrCalls = 0
    let geminiCropJudgeCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/adaptive-review-candidate',
        metadata: { title: 'TOP NHỮNG QUÁN ĂN GIÁ RẺ', durationSeconds: 30 },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: true,
        adaptiveFrameMaxAdditionalFrames: 4,
        adaptiveFrameMaxSelectedImages: 3,
        track2V3GeminiCropJudgeEnabled: true,
      },
      {
        smartOverlayResult: {
          ...selectorResult(crop),
          duration: 100,
          generatedCropCount: 6,
          sampledTimestamps: [0.375, 10.125, 20.625],
        },
        adaptiveFrameSampler: async ({ sampledTimestamps, maxAdditionalFrames }) => {
          assert.ok(sampledTimestamps.length <= maxAdditionalFrames)
          assert.ok(sampledTimestamps.some((timestamp) => timestamp > 60))
          return {
            sampledFrameCount: 1,
            generatedCropCount: 6,
            selectedCropIds: ['crop-901'],
            selectedImages: [adaptiveCrop],
            providerErrors: [],
          }
        },
        geminiCropJudge: async () => {
          geminiCropJudgeCalls += 1
          throw new Error('adaptive candidate must prevent Gemini fallback')
        },
        localOcrProvider: async ({ selectedImages, config: ocrConfig }) => {
          localOcrCalls += 1
          if (localOcrCalls === 1) {
            assert.equal(selectedImages[0].cropPath, crop.cropPath)
            return {
              status: 'OK',
              called: true,
              provider: 'local_ocr_ensemble',
              textBlocks: [{
                source: 'local_tesseract',
                rawText: 'Món ngon giá rẻ hôm nay',
                imagePath: crop.cropPath,
              }],
              providerErrors: [],
            }
          }
          assert.equal(ocrConfig.track2V3LocalOcrProvider, 'ensemble')
          assert.equal(selectedImages[0].cropPath, adaptivePath)
          return {
            status: 'OK',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [{
              source: 'local_paddleocr',
              rawText: 'QUÁN CHÁO 1K 221 Phan Văn Khe, Quận 6, TP HCM',
              confidence: 0.81,
              imagePath: adaptivePath,
              timestampSeconds: adaptiveCrop.timestampSeconds,
              cropVariant: adaptiveCrop.variant,
            }],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(geminiCropJudgeCalls, 0)
    assert.equal(result.adaptiveFrameSamplingEnabled, true)
    assert.equal(result.adaptiveFrameSamplingRan, true)
    assert.equal(result.adaptiveFrameCount, 1)
    assert.equal(result.adaptiveCropCount, 6)
    assert.deepEqual(result.adaptiveSelectedCropIds, ['adaptive-crop-901'])
    assert.equal(result.ocrTextBlockCountFromAdaptiveFrames, 1)
    assert.deepEqual(result.ocrSnippetsFromAdaptiveFrames, [
      'QUÁN CHÁO 1K 221 Phan Văn Khe, Quận 6, TP HCM',
    ])
    assert.equal(result.candidateCountFromAdaptiveFrames, 1)
    assert.equal(result.adaptiveSamplingReason, 'SELECTED_CROPS_NO_ADDRESS_ANCHOR')
    assert.equal(result.tailOverlayEscalationRan, false)
    assert.equal(result.tailOverlayEscalationReason, 'ADAPTIVE_CANDIDATE_EXISTS')
    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.canAutoResolve, false)
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].addressFragment, '221 Phan Văn Khe, Quận 6, TP HCM')
    assert.equal(result.candidates[0].canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
    assert.ok(result.candidates[0].riskFlags.includes('ADAPTIVE_FRAME_SAMPLING'))
    assert.equal(result.geminiCropJudgeCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('creates a review-only named-admin candidate from injected adaptive OCR', async () => {
    const crop = await selectedCrop()
    const adaptivePath = path.join(path.dirname(crop.cropPath), 'adaptive-named-admin.jpg')
    await fs.writeFile(adaptivePath, 'offline mocked adaptive named-admin crop')
    let localOcrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/adaptive-named-admin',
        metadata: { title: 'Danh sách món ăn', durationSeconds: 30 },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: true,
        adaptiveFrameMaxAdditionalFrames: 4,
        adaptiveFrameMaxSelectedImages: 3,
        track2V3GeminiCropJudgeEnabled: false,
      },
      {
        smartOverlayResult: {
          ...selectorResult(crop),
          duration: 30,
          generatedCropCount: 6,
          sampledTimestamps: [0.375, 10.125, 20.625],
        },
        adaptiveFrameSampler: async () => ({
          sampledFrameCount: 1,
          generatedCropCount: 6,
          selectedCropIds: ['crop-902'],
          selectedImages: [{
            cropPath: adaptivePath,
            frameIndex: 4,
            timestampSeconds: 4.25,
            variant: 'upper_middle_crop_raw',
            sourceType: 'smart_overlay_crop_upper_middle',
          }],
          providerErrors: [],
        }),
        localOcrProvider: async ({ selectedImages }) => {
          localOcrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [{
              source: 'local_paddleocr',
              rawText: localOcrCalls === 1
                ? 'CƠM GÀ QUÝ DẦU'
                : '242 Dc Lâp, F.Tân Thành,\nQ.Tân Phú 10:00-21:00 COM GÀ QUÝ DẦU',
              imagePath: selectedImages[0].cropPath,
              timestampSeconds: 4.25,
            }],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(result.candidateCountFromAdaptiveFrames, 1)
    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.canAutoResolve, false)
    assert.equal(result.candidates[0].addressFragment, '242 Dc Lâp, Phường Tân Thành, Quận Tân Phú')
    assert.equal(result.candidates[0].canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
    assert.ok(result.candidates[0].riskFlags.includes('ADAPTIVE_FRAME_SAMPLING'))
    assert.equal(result.geminiCropJudgeCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('lets Gemini crop judge inspect adaptive crops only after adaptive OCR still has no candidate', async () => {
    const crop = await selectedCrop()
    const adaptivePath = path.join(path.dirname(crop.cropPath), 'adaptive-for-gemini.jpg')
    await fs.writeFile(adaptivePath, 'offline mocked adaptive crop for Gemini')
    let localOcrCalls = 0
    let geminiCropJudgeCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/adaptive-before-gemini', metadata: { durationSeconds: 20 } },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: true,
        track2V3GeminiCropJudgeEnabled: true,
      },
      {
        smartOverlayResult: {
          ...selectorResult(crop),
          generatedCropCount: 1,
          selectorDiagnostics: {
            crops: [{ cropId: 'crop-001', path: crop.cropPath, selected: true }],
          },
        },
        adaptiveFrameSampler: async () => ({
          sampledFrameCount: 1,
          generatedCropCount: 1,
          selectedCropIds: ['crop-301'],
          selectedImages: [{
            cropPath: adaptivePath,
            frameIndex: 3,
            timestampSeconds: 3.25,
            variant: 'top_overlay_crop_raw',
          }],
          selectorDiagnostics: {
            crops: [{
              cropId: 'crop-301',
              frameId: 'frame-3',
              frameIndex: 3,
              timestampSeconds: 3.25,
              regionType: 'top_overlay_crop_raw',
              path: adaptivePath,
              selected: true,
            }],
          },
          providerErrors: [],
        }),
        localOcrProvider: async ({ selectedImages }) => {
          localOcrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [{
              source: 'local_tesseract',
              rawText: localOcrCalls === 1 ? 'Món ăn hôm nay' : 'Quán ngon giá rẻ',
              imagePath: selectedImages[0].cropPath,
            }],
            providerErrors: [],
          }
        },
        geminiCropJudge: async ({ allCrops }) => {
          geminiCropJudgeCalls += 1
          assert.ok(allCrops.some((item) => item.cropId === 'crop-001'))
          assert.ok(allCrops.some((item) => item.cropId === 'adaptive-crop-301'))
          return {
            enabled: true,
            called: true,
            provider: 'gemini',
            status: 'OK',
            selectedCropIds: [],
            selectedCrops: [],
            errors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(geminiCropJudgeCalls, 1)
    assert.equal(result.adaptiveFrameSamplingRan, true)
    assert.equal(result.geminiCropJudgeCalled, true)
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.canAutoResolve, false)
  })

  it('runs the OCR ensemble only on Gemini-validated original crop files', async () => {
    const crop = await selectedCrop()
    const fallbackPath = path.join(path.dirname(crop.cropPath), 'all-crop.jpg')
    await fs.writeFile(fallbackPath, 'offline mocked all crop')
    const fallbackCrop = {
      cropId: 'crop-101',
      cropPath: fallbackPath,
      path: fallbackPath,
      frameId: 'frame-7',
      frameIndex: 7,
      timestampSeconds: 7.25,
      regionType: 'middle_crop_raw',
      variant: 'middle_crop_raw',
      sourceType: 'gemini_crop_judge_selected',
    }
    let localOcrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/crop-judge-fallback' },
      { ...config(), track2V3GeminiCropJudgeEnabled: true },
      {
        smartOverlayResult: {
          ...selectorResult(crop),
          selectorDiagnostics: { crops: [fallbackCrop] },
        },
        geminiCropJudge: async () => ({
          enabled: true,
          called: true,
          provider: 'gemini',
          status: 'OK',
          geminiCropJudgeAggregateStatus: 'GEMINI_PARTIAL_PAGE_SUCCESS',
          geminiCropJudgeRequestedPageCount: 2,
          geminiCropJudgeSuccessfulPageCount: 1,
          geminiCropJudgeFailedPageCount: 1,
          geminiCropJudgePartialSuccess: true,
          geminiCropJudgeTotalAttemptCount: 3,
          geminiCropJudgeRetryCount: 1,
          geminiCropJudgeRateLimitCount: 1,
          geminiCropJudgeTimeoutCount: 0,
          geminiCropJudgeServerErrorCount: 0,
          geminiCropJudgeQueueWaitMs: 5,
          geminiCropJudgeProviderRuntimeMs: 20,
          geminiCropJudgeBackoffMs: 100,
          geminiCropJudgeMaxObservedConcurrency: 1,
          geminiCropJudgeDedupHitCount: 1,
          selectedCropIds: ['crop-101'],
          rejectedCropIds: ['crop-999'],
          selectedCrops: [fallbackCrop],
          contactSheetPaths: ['gemini-crop-judge/contact-sheet-page-01.jpg'],
          pageResults: [{
            pageNumber: 1,
            pageIndex: 0,
            status: 'OK',
            pageStatus: 'SUCCESS',
            selectedCropIds: ['crop-101'],
            rejectedCropIds: [],
            attemptCount: 2,
          }],
          resultPath: 'gemini-crop-judge/result.json',
          errors: [],
        }),
        localOcrProvider: async ({ selectedImages, config: ocrConfig }) => {
          localOcrCalls += 1
          if (localOcrCalls === 1) {
            assert.equal(selectedImages[0].cropPath, crop.cropPath)
            return {
              status: 'OK',
              called: true,
              provider: 'local_tesseract',
              textBlocks: [{ rawText: 'Món ngon hôm nay', imagePath: crop.cropPath }],
              providerErrors: [],
            }
          }
          assert.equal(ocrConfig.track2V3LocalOcrProvider, 'ensemble')
          assert.deepEqual(selectedImages.map((image) => image.cropId), ['crop-101'])
          assert.equal(selectedImages[0].cropPath, fallbackPath)
          return {
            status: 'OK',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [{
              source: 'local_tesseract',
              rawText: '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
              confidence: 0.72,
              imagePath: fallbackPath,
              timestampSeconds: fallbackCrop.timestampSeconds,
              cropVariant: fallbackCrop.variant,
            }],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(result.geminiCropJudgeCalled, true)
    assert.equal(result.geminiCropJudgeAggregateStatus, 'GEMINI_PARTIAL_PAGE_SUCCESS')
    assert.equal(result.geminiCropJudgeRequestedPageCount, 2)
    assert.equal(result.geminiCropJudgeSuccessfulPageCount, 1)
    assert.equal(result.geminiCropJudgeFailedPageCount, 1)
    assert.equal(result.geminiCropJudgePartialSuccess, true)
    assert.equal(result.geminiCropJudgeTotalAttemptCount, 3)
    assert.equal(result.geminiCropJudgeRetryCount, 1)
    assert.equal(result.geminiCropJudgeRateLimitCount, 1)
    assert.equal(result.geminiCropJudgeQueueWaitMs, 5)
    assert.equal(result.geminiCropJudgeProviderRuntimeMs, 20)
    assert.equal(result.geminiCropJudgeBackoffMs, 100)
    assert.equal(result.geminiCropJudgeMaxObservedConcurrency, 1)
    assert.equal(result.geminiCropJudgeDedupHitCount, 1)
    assert.equal(result.geminiCropJudgePageResults.length, 1)
    assert.deepEqual(result.geminiCropJudgeSelectedCropIds, ['crop-101'])
    assert.deepEqual(result.geminiCropJudgeRejectedCropIds, ['crop-999'])
    assert.equal(result.ocrTextBlockCountFromGeminiSelectedCrops, 1)
    assert.deepEqual(result.ocrSnippetsFromGeminiSelectedCrops, [
      '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
    ])
    assert.equal(result.candidateCountFromGeminiSelectedCrops, 1)
    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
    assert.ok(result.candidates[0].riskFlags.includes('GEMINI_CROP_JUDGE_SELECTED'))
    assert.ok(result.evidence.some((item) =>
      item.riskFlags?.includes('GEMINI_CROP_JUDGE_SELECTED')
    ))
    assert.equal(result.geminiCalled, false)
  })

  it('cannot create a candidate directly from Gemini crop judge output', async () => {
    const crop = await selectedCrop()
    const fallbackCrop = { ...crop, cropId: 'crop-201' }
    let localOcrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/crop-judge-no-direct-candidate' },
      { ...config(), track2V3GeminiCropJudgeEnabled: true },
      {
        smartOverlayResult: {
          ...selectorResult(crop),
          selectorDiagnostics: { crops: [fallbackCrop] },
        },
        geminiCropJudge: async () => ({
          enabled: true,
          called: true,
          provider: 'gemini',
          selectedCropIds: ['crop-201'],
          selectedCrops: [fallbackCrop],
          candidateAddress: 'This field must never be consumed.',
          errors: [],
        }),
        localOcrProvider: async () => {
          localOcrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: localOcrCalls === 1 ? 'local_tesseract' : 'local_ocr_ensemble',
            textBlocks: [],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(result.candidates.length, 0)
    assert.equal(result.candidateCountFromGeminiSelectedCrops, 0)
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.geminiCalled, false)
  })

  for (const [label, tailText, expectedAddress] of [
    [
      'named ward and district tail overlay',
      '14 đường 63, P. Thạnh Mỹ Lợi, Q.2',
      /14 đường 63.*Thạnh Mỹ Lợi.*2/iu,
    ],
    [
      'numeric ward and district tail overlay',
      '901 Hồng Bàng, P.9, Q.6',
      /901 Hồng Bàng.*9.*6/iu,
    ],
    [
      'compact numbered-street tail overlay',
      'Ső14đuong63 P.Thanhmyloi-Q.2',
      /14 đuong 63.*Thanhmyloi.*2/iu,
    ],
  ]) {
    it(`creates a bounded review-only candidate from a ${label}`, async () => {
      const { result, fixture, preprocessCalls, ocrCalls } = await runInjectedTailOverlayCase({
        tailText,
        selectedTailCropId: label.startsWith('named') ? 'crop-2-upper_middle' : null,
      })

      assert.equal(ocrCalls.length, 3)
      assert.equal(result.tailOverlayEscalationEnabled, true)
      assert.equal(result.tailOverlayEscalationRan, true)
      assert.equal(result.tailOverlayEscalationReason, 'TAIL_CANDIDATE_FOUND')
      assert.deepEqual(result.tailOverlayFrameIds, ['adaptive-frame-2', 'adaptive-frame-1'])
      assert.deepEqual(result.tailOverlayFrameTimestamps, [24.25, 14.25])
      assert.equal(result.tailOverlayCropCount, 4)
      assert.equal(result.tailOverlayCropIds.length, 4)
      assert.ok(result.tailOverlayCropIds.every((cropId) =>
        /(?:top_overlay|upper_middle)/u.test(cropId)
      ))
      assert.equal(result.tailOverlayOcrTextBlockCount, 1)
      assert.deepEqual(result.tailOverlayOcrSnippets, [tailText])
      assert.equal(result.candidateCountFromTailOverlay, 1)
      assert.equal(result.resolution, 'NEEDS_REVIEW')
      assert.equal(result.canAutoResolve, false)
      assert.equal(result.candidates.length, 1)
      assert.match(result.candidates[0].displayText, expectedAddress)
      assert.equal(result.candidates[0].canAutoResolve, false)
      assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
      assert.ok(result.candidates[0].riskFlags.includes('TAIL_OVERLAY_ESCALATION'))
      assert.notEqual(result.resolution, 'RESOLVED')
      assert.equal(result.geminiCalled, false)
      assert.equal(result.googleVisionCalled, false)
      assert.equal(result.placesCalled, false)
      assert.equal(result.asrCalled, false)
      assert.equal(preprocessCalls.length, 4)
      assert.ok(preprocessCalls.every((call) => call.sourceCropPath !== call.alternatePath))
      assert.ok(preprocessCalls.every((call) =>
        /^adaptive-crop-[12]-/u.test(call.cropId)
      ))
      assert.ok(ocrCalls[2].every((image) =>
        image.cropPath !== image.sourceCropPath &&
        image.preprocessingVariant === 'tail_sharpen_contrast'
      ))
      if (label.startsWith('named')) {
        const alreadySelected = fixture.adaptiveSelected
        const retried = ocrCalls[2].find((image) =>
          image.cropId === `adaptive-${alreadySelected.cropId}`
        )
        assert.ok(retried)
        assert.equal(retried.selectedPreviously, true)
        assert.notEqual(retried.cropPath, alreadySelected.cropPath)
      }
    })
  }

  it('deduplicates repeated tail OCR evidence and candidates', async () => {
    const tailText = '901 Hồng Bàng, P.9, Q.6'
    const { result } = await runInjectedTailOverlayCase({
      tailText,
      duplicateTailText: true,
    })

    assert.equal(result.tailOverlayOcrTextBlockCount, 1)
    assert.equal(result.candidateCountFromTailOverlay, 1)
    assert.equal(result.candidates.length, 1)
    assert.equal(result.canAutoResolve, false)
  })

  it('skips tail escalation safely when the local OCR provider is unavailable', async () => {
    const crop = await selectedCrop()
    let localOcrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      { url: 'https://example.test/tail-provider-unavailable' },
      { ...config(), adaptiveFrameSamplingEnabled: true },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => {
          localOcrCalls += 1
          return {
            status: 'UNAVAILABLE',
            reason: 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
            called: true,
            provider: 'local_ocr_ensemble',
            textBlocks: [],
            providerErrors: [{
              provider: 'local_ocr',
              code: 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
              message: 'offline injected provider unavailable',
            }],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 1)
    assert.equal(result.tailOverlayEscalationRan, false)
    assert.equal(result.tailOverlayEscalationReason, 'OCR_PROVIDER_UNAVAILABLE')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.resolution, 'UNRESOLVED')
  })

  it('bounds a tail OCR provider error without resolving', async () => {
    const { result, ocrCalls } = await runInjectedTailOverlayCase({
      tailProviderStatus: 'ERROR',
      tailProviderErrors: [{
        provider: 'local_tesseract',
        code: 'INJECTED_TAIL_OCR_ERROR',
        message: 'offline injected tail OCR error',
      }],
    })

    assert.equal(ocrCalls.length, 3)
    assert.equal(result.tailOverlayEscalationRan, true)
    assert.equal(result.tailOverlayCropCount, 4)
    assert.equal(result.tailOverlayEscalationReason, 'TAIL_OCR_NO_CANDIDATE')
    assert.ok(result.tailOverlayProviderErrors.some((error) =>
      error.code === 'INJECTED_TAIL_OCR_ERROR'
    ))
    assert.equal(result.candidates.length, 0)
    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTI_PLACE_REVIEW_ONLY')
    assert.equal(result.canAutoResolve, false)
  })

  it('rejects non-address tail OCR without creating candidates', async () => {
    const negativeTailTexts = [
      '16:00-24:00',
      '15K',
      '0901234567',
      'CƠM GÀ QUÝ DẦU',
      'Quận 6',
      '56. Trinh Dinh Trong',
      '901',
    ]
    for (const tailText of negativeTailTexts) {
      const { result } = await runInjectedTailOverlayCase({ tailText })
      assert.equal(result.tailOverlayEscalationRan, true, tailText)
      assert.equal(result.tailOverlayEscalationReason, 'TAIL_OCR_NO_CANDIDATE', tailText)
      assert.equal(result.candidateCountFromTailOverlay, 0, tailText)
      assert.equal(result.candidates.length, 0, tailText)
      assert.equal(result.resolution, 'NEEDS_REVIEW', tailText)
      assert.equal(result.reason, 'MULTI_PLACE_REVIEW_ONLY', tailText)
      assert.equal(result.canAutoResolve, false, tailText)
    }
  })

  it('keeps explicit metadata addresses as separate review candidates for a listicle', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/listicle-metadata-addresses',
        metadata: {
          title: 'Top 2 quán ăn địa phương',
          description: [
            'Địa chỉ quán:',
            'Cơ sở 1: 165-167 Núi Thành, Đà Nẵng',
            'Cơ sở 2: 283 Hải Phòng, Đà Nẵng',
          ].join('\n'),
          durationSeconds: 30,
        },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: false,
        track2V3GeminiCropJudgeEnabled: false,
        track2V3AsrEnabled: false,
      },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.intent, 'MULTI_PLACE_OR_LIST')
    assert.equal(result.candidates.length, 2)
    assert.ok(result.candidates.some((candidate) => candidate.displayText.includes('165-167 Núi Thành')))
    assert.ok(result.candidates.some((candidate) => candidate.displayText.includes('283 Hải Phòng')))
    assert.ok(result.candidates.every((candidate) => candidate.canAutoResolve === false))
  })

  it('fails fast instead of burning full-audio ASR when visual OCR provider is unavailable', async () => {
    const crop = await selectedCrop()
    let asrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/visual-provider-unavailable',
        metadata: { title: 'Quán ăn địa phương', durationSeconds: 30 },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: false,
        track2V3GeminiCropJudgeEnabled: false,
        asrFallbackEnabled: true,
        asrTimeoutMs: 1000,
      },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'UNAVAILABLE',
          reason: 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
          called: true,
          provider: null,
          textBlocks: [],
          providerErrors: [{
            code: 'LOCAL_TESSERACT_UNAVAILABLE',
            provider: 'local_tesseract',
            message: 'Tesseract CLI is unavailable.',
          }],
        }),
        track2V3AsrProvider: async () => {
          asrCalls += 1
          throw new Error('ASR must not run during a visual provider outage')
        },
      },
    )

    assert.equal(asrCalls, 0)
    assert.equal(result.asrFallbackRan, false)
    assert.equal(result.asrCalled, false)
    assert.equal(result.asrFallbackReason, 'ASR_SKIPPED_VISUAL_PROVIDER_UNAVAILABLE')
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.ok(result.providerErrors.some((error) => error.code === 'LOCAL_TESSERACT_UNAVAILABLE'))
  })

  it('runs ASR only after all visual stages keep zero candidates and admits a review candidate', async () => {
    const crop = await selectedCrop()
    let asrCalls = 0
    const rawText = 'địa chỉ quán là 6A đường Tân Quý quận Tân Phú'
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/asr-fallback-zero-visual',
        metadata: { title: 'Quán ăn địa phương', durationSeconds: 30 },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: false,
        track2V3GeminiCropJudgeEnabled: false,
        asrFallbackEnabled: true,
        asrTimeoutMs: 1000,
      },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK', called: true, provider: 'local_ocr_injected', textBlocks: [], providerErrors: [],
        }),
        track2V3AsrProvider: async () => {
          asrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'faster-whisper-local',
            model: 'small',
            device: 'cpu',
            computeType: 'int8',
            requestedLanguage: 'vi',
            transcriptText: rawText,
            segments: [{ start: 1, end: 4, text: rawText }],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(asrCalls, 1)
    assert.equal(result.preAsrKeptCandidateCount, 0)
    assert.equal(result.asrFallbackRan, true)
    assert.equal(result.asrFallbackReason, 'ASR_CANDIDATE_FOUND')
    assert.equal(result.candidateCountFromAsr, 1)
    assert.equal(result.candidates[0].type, 'ASR_FULL_ADDRESS_REVIEW')
    assert.equal(result.candidates[0].rawAsrEvidenceText, rawText)
    assert.equal(result.candidates[0].canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('does not call ASR when visual OCR already kept a candidate', async () => {
    const crop = await selectedCrop()
    let asrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/asr-skip-existing-visual',
        metadata: { title: 'Quán ăn địa phương', durationSeconds: 30 },
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      {
        ...config(),
        adaptiveFrameSamplingEnabled: false,
        track2V3GeminiCropJudgeEnabled: false,
        asrFallbackEnabled: true,
        asrTimeoutMs: 1000,
      },
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_ocr_injected',
          textBlocks: [{ rawText: '105 Trần Hưng Đạo, Phường 6, Quận 5', confidence: 0.9 }],
          providerErrors: [],
        }),
        track2V3AsrProvider: async () => {
          asrCalls += 1
          throw new Error('ASR must not run when an existing candidate exists')
        },
      },
    )

    assert.equal(asrCalls, 0)
    assert.equal(result.asrFallbackRan, false)
    assert.equal(result.asrFallbackReason, 'RESCUE_SUFFICIENT')
    assert.equal(result.candidateCountFromAsr, 0)
    assert.ok(result.candidates.length > 0)
  })

  for (const testCase of [
    {
      name: 'price-context OCR review evidence',
      rawText: 'Buffet 169 – Đầu tiên ở quận 1',
      token: '169',
      contextClass: 'PRICE',
      counter: 'priceNumberRejectedAsHouseNumberCount',
    },
    {
      name: 'floor/place OCR review evidence',
      rawText: 'Buffet Sushi in Sushi - tầng 4 TTTM Nowzone (Q.1)',
      token: '4',
      contextClass: 'FLOOR_OR_LEVEL',
      counter: 'floorNumberRejectedAsHouseNumberCount',
    },
  ]) {
    it(`keeps ASR eligible after rejecting ${testCase.name} as a house number`, async () => {
      const crop = await selectedCrop()
      let asrCalls = 0
      const result = await runShortsTrack2V3SmartOverlayOcr(
        {
          url: 'https://example.test/context-number-rescue',
          metadata: { title: 'Quán ăn địa phương', durationSeconds: 30 },
          fixtureCase: { expected: { mustNotResolve: true } },
        },
        {
          ...config(),
          adaptiveFrameSamplingEnabled: false,
          track2V3GeminiCropJudgeEnabled: false,
          asrFallbackEnabled: true,
          asrTimeoutMs: 1000,
        },
        {
          smartOverlayResult: selectorResult(crop),
          localOcrProvider: async () => ({
            status: 'OK',
            called: true,
            provider: 'local_ocr_injected',
            textBlocks: [{ rawText: testCase.rawText, confidence: 0.9 }],
            providerErrors: [],
          }),
          track2V3AsrProvider: async () => {
            asrCalls += 1
            return {
              status: 'OK',
              called: true,
              provider: 'injected-asr',
              transcriptText: 'quán ăn tại Sài Gòn',
              segments: [{ start: 0, end: 1, text: 'quán ăn tại Sài Gòn' }],
              providerErrors: [],
            }
          },
        },
      )

      assert.equal(asrCalls, 1)
      assert.equal(result.preAsrKeptCandidateCount, 0)
      assert.equal(result.asrFallbackRan, true)
      assert.equal(result.candidateCountFromAsr, 0)
      assert.equal(result.candidates.length, 0)
      assert.ok(result.localOcrTextBlocks.some((block) => block.rawText === testCase.rawText))
      assert.ok(result.numericContextClassifications.some((item) =>
        item.rawNumberToken === testCase.token && item.contextClass === testCase.contextClass
      ))
      assert.ok(result[testCase.counter] > 0)
      assert.equal(result.lateRescueSufficient, false)
      assert.equal(result.canAutoResolve, false)
    })
  }

  it('contains no URL-specific or target-value hardcode in production OCR code', async () => {
    const productionFiles = [
      new URL('../../scripts/track2/localOcr/paddleocrTrack2V3.py', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3LocalOcrProviderService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3OcrHouseNumberSafetyService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3AdaptiveFrameSamplingService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js', import.meta.url),
      new URL('../../src/services/shorts/track2-v3/shortsTrack2V3TailOverlayOcrEscalationService.js', import.meta.url),
    ]
    const source = (await Promise.all(productionFiles.map((file) => fs.readFile(file, 'utf8'))))
      .join('\n')

    assert.doesNotMatch(source, /xohEPfmd6y0|JSf3Yh3094s/u)
    assert.doesNotMatch(source, /1433\/2/u)
    assert.doesNotMatch(source, /NXnEvUyM9NI|221\s+Phan\s+Văn\s+Khe|242\s+Độc\s+Lập/iu)
  })

  it('does not create a candidate from a generic caption plus an isolated number', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/offline-no-fake-ocr',
        sourceUrl: 'https://www.youtube.com/shorts/offline-no-fake-ocr',
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [
            {
              source: 'local_tesseract',
              rawText: 'Sài Gòn Về Đêm\n1840',
              confidence: 0.8,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
            },
          ],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.rawCandidateCount, 0)
    assert.equal(result.keptCandidateCount, 0)
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('reduces noisy duplicate Tesseract evidence to one low-confidence review candidate', async () => {
    const crop = await selectedCrop()
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/offline-noisy-address',
        sourceUrl: 'https://www.youtube.com/shorts/offline-noisy-address',
      },
      config(),
      {
        smartOverlayResult: selectorResult(crop),
        localOcrProvider: async () => ({
          status: 'OK',
          reason: 'LOCAL_OCR_TEXT_COLLECTED',
          called: true,
          provider: 'local_tesseract',
          textBlocks: [
            {
              source: 'local_tesseract',
              rawText: 'ae xoicem\n1193 3/2 Phường 6 Quan10\nBs 3 @1830-00h30\n- Ss a\nee |',
              confidence: 0.51,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
              providerMetadata: {
                ocrScore: 45,
                lowConfidence: true,
                uncertainHouseNumber: true,
              },
            },
            {
              source: 'local_tesseract',
              rawText: '1193 3/2 Phường 6 Quận 1O',
              confidence: 0.64,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
              providerMetadata: {
                ocrScore: 82,
                lowConfidence: true,
                uncertainHouseNumber: true,
              },
            },
            {
              source: 'local_tesseract',
              rawText: '1193 3/2 Phường 6 Quận 10',
              confidence: 0.6,
              imagePath: crop.cropPath,
              timestampSeconds: crop.timestampSeconds,
              cropVariant: crop.variant,
              providerMetadata: {
                ocrScore: 75,
                lowConfidence: true,
                uncertainHouseNumber: true,
              },
            },
          ],
          providerErrors: [],
        }),
      },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.rawCandidateCount, 1)
    assert.equal(result.keptCandidateCount, 1)
    assert.ok(result.debug.localCandidateCleanupDroppedCount >= 1)
    assert.match(result.candidates[0].addressFragment, /1193/u)
    assert.doesNotMatch(result.candidates[0].addressFragment, /1433/u)
    assert.equal(result.candidates[0].canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
    assert.ok(result.candidates[0].riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })
})
