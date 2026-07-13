import path from 'node:path'

import { generateShortsTrack2V3TesseractPreprocessVariants } from './shortsTrack2V3TesseractPreprocessService.js'

export const SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS = Object.freeze({
  NORMAL_CANDIDATE_EXISTS: 'NORMAL_CANDIDATE_EXISTS',
  ADAPTIVE_CANDIDATE_EXISTS: 'ADAPTIVE_CANDIDATE_EXISTS',
  RESCUE_SUFFICIENT: 'RESCUE_SUFFICIENT',
  OCR_PROVIDER_UNAVAILABLE: 'OCR_PROVIDER_UNAVAILABLE',
  NO_TAIL_CROPS: 'NO_TAIL_CROPS',
  TAIL_OVERLAY_ESCALATED: 'TAIL_OVERLAY_ESCALATED',
  TAIL_OCR_NO_CANDIDATE: 'TAIL_OCR_NO_CANDIDATE',
  TAIL_CANDIDATE_FOUND: 'TAIL_CANDIDATE_FOUND',
})

const MAX_TAIL_FRAMES = 2
const MAX_TAIL_CROPS = 4
const ELIGIBLE_REGIONS = new Set([
  'top_overlay_crop_raw',
  'upper_middle_crop_raw',
])
const ALTERNATE_VARIANTS = [
  'sharpen_contrast',
  'upscale_4x_gray',
  'upscale_3x_gray',
]

function finiteNumber(value, fallback = null) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function safeText(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function emptyResult(reason) {
  return {
    enabled: true,
    ran: false,
    reason,
    frameIds: [],
    frameTimestamps: [],
    cropIds: [],
    cropCount: 0,
    selectedImages: [],
    providerErrors: [],
    cleanup: async () => {},
  }
}

function cropPath(crop = {}, outputDir = '') {
  const value = safeText(crop.cropPath || crop.path || crop.unselectedPath, 2000)
  if (!value) return null
  return path.isAbsolute(value) ? value : path.resolve(outputDir || '.', value)
}

function normalizedCrop(crop = {}, index = 0, outputDir = '') {
  const imagePath = cropPath(crop, outputDir)
  const regionType = safeText(crop.regionType || crop.variant || crop.cropVariant, 120)
  const timestampSeconds = finiteNumber(crop.timestampSeconds, null)
  if (!imagePath || timestampSeconds === null || !ELIGIBLE_REGIONS.has(regionType)) return null

  return {
    ...crop,
    cropId: safeText(crop.cropId || `tail-crop-${index}`, 160),
    frameId: safeText(crop.frameId || `tail-frame-${timestampSeconds}`, 160),
    timestampSeconds,
    regionType,
    sourceCropPath: imagePath,
    selectedPreviously: crop.selected === true,
  }
}

function selectTailCrops(crops = [], outputDir = '') {
  const deduped = new Map()
  for (const [index, crop] of (Array.isArray(crops) ? crops : []).entries()) {
    const normalized = normalizedCrop(crop, index, outputDir)
    if (!normalized) continue
    const key = normalized.cropId || normalized.sourceCropPath
    if (!deduped.has(key)) deduped.set(key, normalized)
  }

  const available = [...deduped.values()]
  const frames = new Map()
  for (const crop of available) {
    const key = `${crop.frameId}:${crop.timestampSeconds}`
    if (!frames.has(key)) {
      frames.set(key, {
        key,
        frameId: crop.frameId,
        timestampSeconds: crop.timestampSeconds,
      })
    }
  }
  const finalFrames = [...frames.values()]
    .sort((left, right) => right.timestampSeconds - left.timestampSeconds)
    .slice(0, MAX_TAIL_FRAMES)
  const finalFrameKeys = new Set(finalFrames.map((frame) => frame.key))

  const selected = available
    .filter((crop) => finalFrameKeys.has(`${crop.frameId}:${crop.timestampSeconds}`))
    .sort((left, right) =>
      right.timestampSeconds - left.timestampSeconds ||
      (left.regionType === 'top_overlay_crop_raw' ? -1 : 1)
    )
    .slice(0, MAX_TAIL_CROPS)

  return { finalFrames, selected }
}

function preprocessError(code, cropId) {
  return {
    provider: 'local_ocr',
    code,
    message: `Tail overlay preprocessing failed safely for ${safeText(cropId, 120) || 'crop'}.`,
    recoverable: true,
  }
}

export async function prepareShortsTrack2V3TailOverlayOcrEscalation({
  normalCandidateCount = 0,
  adaptiveCandidateCount = 0,
  localOcrAvailable = true,
  lateRescueSufficiency = null,
  crops = [],
  outputDir = '',
  deps = {},
} = {}) {
  const sufficiencyKnown = lateRescueSufficiency && typeof lateRescueSufficiency === 'object'
  if (sufficiencyKnown && lateRescueSufficiency.lateRescueSufficient === true) {
    const reason = normalCandidateCount > 0
      ? SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.NORMAL_CANDIDATE_EXISTS
      : adaptiveCandidateCount > 0
        ? SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.ADAPTIVE_CANDIDATE_EXISTS
        : SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.RESCUE_SUFFICIENT
    return emptyResult(reason)
  }
  if (!sufficiencyKnown && normalCandidateCount > 0) {
    return emptyResult(SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.NORMAL_CANDIDATE_EXISTS)
  }
  if (!sufficiencyKnown && adaptiveCandidateCount > 0) {
    return emptyResult(SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.ADAPTIVE_CANDIDATE_EXISTS)
  }
  if (!localOcrAvailable) {
    return emptyResult(SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.OCR_PROVIDER_UNAVAILABLE)
  }

  const { finalFrames, selected } = selectTailCrops(crops, outputDir)
  if (!selected.length) {
    return emptyResult(SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.NO_TAIL_CROPS)
  }

  const preprocessor = typeof deps.tailOverlayPreprocessor === 'function'
    ? deps.tailOverlayPreprocessor
    : generateShortsTrack2V3TesseractPreprocessVariants
  const preprocessOutputDir = outputDir
    ? path.join(outputDir, 'tail-overlay-escalation')
    : ''
  const selectedImages = []
  const providerErrors = []
  const cleanupTasks = []

  for (const [index, crop] of selected.entries()) {
    let preprocessResult
    try {
      preprocessResult = await preprocessor({
        ...crop,
        imagePath: crop.sourceCropPath,
        cropPath: crop.sourceCropPath,
        cropVariant: crop.regionType,
      }, {
        outputDir: preprocessOutputDir,
        index,
      })
    } catch {
      preprocessResult = {
        variants: [],
        providerErrors: [preprocessError('TAIL_OVERLAY_PREPROCESS_ERROR', crop.cropId)],
        cleanup: async () => {},
      }
    }

    if (typeof preprocessResult?.cleanup === 'function') {
      cleanupTasks.push(preprocessResult.cleanup)
    }
    providerErrors.push(...(Array.isArray(preprocessResult?.providerErrors)
      ? preprocessResult.providerErrors
      : []))
    const variants = Array.isArray(preprocessResult?.variants) ? preprocessResult.variants : []
    const alternate = ALTERNATE_VARIANTS
      .map((name) => variants.find((variant) => variant.preprocessVariant === name))
      .find(Boolean)

    if (!alternate?.imagePath) {
      providerErrors.push(preprocessError(
        crop.selectedPreviously
          ? 'TAIL_OVERLAY_ALTERNATE_VARIANT_UNAVAILABLE'
          : 'TAIL_OVERLAY_PREPROCESS_UNAVAILABLE',
        crop.cropId,
      ))
      continue
    }

    selectedImages.push({
      cropId: crop.cropId,
      frameId: crop.frameId,
      frameIndex: finiteNumber(crop.frameIndex, null),
      timestampSeconds: crop.timestampSeconds,
      regionType: crop.regionType,
      variant: crop.regionType,
      cropVariant: crop.regionType,
      imagePath: alternate.imagePath,
      cropPath: alternate.imagePath,
      sourceCropPath: crop.sourceCropPath,
      preprocessingVariant: `tail_${alternate.preprocessVariant}`,
      tailOverlayEscalation: true,
      selectedPreviously: crop.selectedPreviously,
    })
  }

  if (!selectedImages.length) {
    await Promise.allSettled(cleanupTasks.map((cleanup) => cleanup()))
    return {
      ...emptyResult(SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.NO_TAIL_CROPS),
      providerErrors,
    }
  }

  const selectedFrameKeys = new Set(selectedImages.map((image) =>
    `${image.frameId}:${image.timestampSeconds}`
  ))
  const selectedFrames = finalFrames.filter((frame) =>
    selectedFrameKeys.has(`${frame.frameId}:${frame.timestampSeconds}`)
  )

  return {
    enabled: true,
    ran: true,
    reason: SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.TAIL_OVERLAY_ESCALATED,
    frameIds: selectedFrames.map((frame) => frame.frameId),
    frameTimestamps: selectedFrames.map((frame) => frame.timestampSeconds),
    cropIds: selectedImages.map((image) => image.cropId),
    cropCount: selectedImages.length,
    selectedImages,
    providerErrors,
    cleanup: async () => {
      await Promise.allSettled(cleanupTasks.map((cleanup) => cleanup()))
    },
  }
}

export default {
  prepareShortsTrack2V3TailOverlayOcrEscalation,
}
