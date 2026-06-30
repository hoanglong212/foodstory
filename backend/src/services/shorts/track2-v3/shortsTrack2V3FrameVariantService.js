import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PHASE4_VARIANTS = [
  {
    variant: 'full_raw',
    sourceType: 'ocr_frame_full',
  },
  {
    variant: 'bottom_crop_raw',
    sourceType: 'ocr_crop_bottom',
    cropRegion: 'bottom',
  },
]

const BOOST_VARIANTS = [
  {
    variant: 'full_raw',
    sourceType: 'ocr_frame_full',
  },
  {
    variant: 'top_crop_raw',
    sourceType: 'ocr_crop_top',
    cropRegion: 'top',
  },
  {
    variant: 'middle_crop_raw',
    sourceType: 'ocr_crop_middle',
    cropRegion: 'middle',
  },
  {
    variant: 'bottom_crop_raw',
    sourceType: 'ocr_crop_bottom',
    cropRegion: 'bottom',
  },
]

const DEFAULT_BOOST_VARIANT_PRIORITY = ['middle_crop_raw', 'bottom_crop_raw']
const MAX_BOOST_OCR_IMAGES = 16

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function withOptionalImageFields(variant, frame = {}) {
  const imagePath = safeString(frame.imagePath || frame.path, 1000)
  return {
    ...variant,
    ...(imagePath ? { path: imagePath, imagePath } : {}),
    ...(frame.imageBuffer ? { imageBuffer: frame.imageBuffer } : {}),
    ...(frame.mimeType ? { mimeType: frame.mimeType } : {}),
    ...(Number.isFinite(Number(frame.sizeBytes)) ? { sizeBytes: Number(frame.sizeBytes) } : {}),
    ...(Number.isFinite(Number(frame.width)) ? { width: Number(frame.width) } : {}),
    ...(Number.isFinite(Number(frame.height)) ? { height: Number(frame.height) } : {}),
  }
}

export function buildShortsTrack2V3FrameVariants(framePlan = {}, config = {}) {
  const maxOcrImages = Math.max(0, Number(config.maxOcrImages ?? 0))
  const frames = Array.isArray(framePlan.frames) && framePlan.frames.length
    ? framePlan.frames
    : Array.isArray(framePlan.plannedFrames)
      ? framePlan.plannedFrames
      : []

  const variants = []
  for (const frame of frames) {
    for (const definition of PHASE4_VARIANTS) {
      if (variants.length >= maxOcrImages) break
      variants.push(withOptionalImageFields({
        id: `frame:${Number(frame.frameIndex) || 0}:${definition.variant}`,
        variant: definition.variant,
        sourceType: definition.sourceType,
        frameIndex: finiteNumber(frame.frameIndex, variants.length),
        label: frame.label || null,
        timestampSeconds: finiteNumber(frame.timestampSeconds, null),
        relativePosition: finiteNumber(frame.relativePosition, null),
      }, frame))
    }
  }

  return {
    status: variants.length ? 'PLANNED' : 'NO_FRAMES',
    variants,
    variantCount: variants.length,
    maxOcrImages,
    plannedFrameCount: framePlan.plannedFrameCount ?? 0,
  }
}

function providerError(code, message, details = {}) {
  return {
    source: 'track2_v3_cheap_ocr',
    code,
    message: safeString(message, 240),
    recoverable: true,
    ...details,
  }
}

function variantId(frame = {}, variant) {
  const frameIndex = Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : 0
  return `ocrimg:${frameIndex}:${variant}`
}

function liveVariantDescriptor(frame = {}, definition = {}, overrides = {}) {
  const frameIndex = Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : 0
  const imagePath = safeString(overrides.path || frame.path || frame.imagePath, 1000)

  return {
    id: variantId(frame, definition.variant),
    frameIndex,
    label: frame.label || null,
    timestampSeconds: finiteNumber(frame.timestampSeconds, null),
    relativePosition: finiteNumber(frame.relativePosition, null),
    variant: definition.variant,
    sourceType: definition.sourceType,
    path: imagePath || null,
    imagePath: imagePath || null,
    mimeType: overrides.mimeType || frame.mimeType || 'image/jpeg',
    sizeBytes: finiteNumber(overrides.sizeBytes ?? frame.sizeBytes, 0),
    width: finiteNumber(overrides.width ?? frame.width, null),
    height: finiteNumber(overrides.height ?? frame.height, null),
  }
}

async function bottomCropDescriptor(frame = {}, deps = {}) {
  return cropDescriptor(frame, PHASE4_VARIANTS[1], deps)
}

function cropBounds(region, width, height) {
  const cropHeight = Math.max(1, Math.floor(height * (region === 'middle' ? 0.5 : 0.45)))

  if (region === 'top') {
    return {
      left: 0,
      top: 0,
      width,
      height: cropHeight,
    }
  }

  if (region === 'middle') {
    return {
      left: 0,
      top: Math.max(0, Math.floor((height - cropHeight) / 2)),
      width,
      height: cropHeight,
    }
  }

  return {
    left: 0,
    top: Math.max(0, height - cropHeight),
    width,
    height: cropHeight,
  }
}

async function cropDescriptor(frame = {}, definition = {}, deps = {}) {
  const sourcePath = safeString(frame.path || frame.imagePath, 1000)
  const region = definition.cropRegion || 'bottom'
  const label = region.charAt(0).toUpperCase() + region.slice(1)
  if (!sourcePath) {
    return {
      descriptor: liveVariantDescriptor(frame, definition),
      providerErrors: [
        providerError('CROP_SOURCE_MISSING', `${label} crop source image is missing.`, {
          frameIndex: finiteNumber(frame.frameIndex, 0),
          variant: definition.variant,
        }),
      ],
    }
  }

  try {
    const imageTool = deps.sharp || sharp
    const metadata = await imageTool(sourcePath).metadata()
    const width = finiteNumber(metadata.width, null)
    const height = finiteNumber(metadata.height, null)
    if (!width || !height) {
      return {
        descriptor: liveVariantDescriptor(frame, definition),
        providerErrors: [
          providerError('CROP_METADATA_UNAVAILABLE', `${label} crop metadata is unavailable.`, {
            frameIndex: finiteNumber(frame.frameIndex, 0),
            variant: definition.variant,
          }),
        ],
      }
    }

    const bounds = cropBounds(region, width, height)
    const extension = path.extname(sourcePath) || '.jpg'
    const baseName = path.basename(sourcePath, extension)
    const cropPath = path.join(path.dirname(sourcePath), `${baseName}-${region}-crop.jpg`)

    await imageTool(sourcePath)
      .extract(bounds)
      .jpeg({ quality: 90 })
      .toFile(cropPath)

    const stat = await fs.stat(cropPath)
    return {
      descriptor: liveVariantDescriptor(frame, definition, {
        path: cropPath,
        mimeType: 'image/jpeg',
        sizeBytes: stat.size,
        width: bounds.width,
        height: bounds.height,
      }),
      providerErrors: [],
    }
  } catch {
    return {
      descriptor: liveVariantDescriptor(frame, definition),
      providerErrors: [
        providerError('CROP_GENERATION_FAILED', `${label} crop generation failed.`, {
          frameIndex: finiteNumber(frame.frameIndex, 0),
          variant: definition.variant,
        }),
      ],
    }
  }
}

function boundedBoostMaxOcrImages(config = {}) {
  return Math.max(0, Math.min(MAX_BOOST_OCR_IMAGES, Number(config.maxOcrImages ?? 0)))
}

function selectBoostVariantDefinitions(frameCount, maxOcrImages) {
  if (frameCount <= 0 || maxOcrImages <= 0) return []
  if (maxOcrImages >= frameCount * BOOST_VARIANTS.length) return BOOST_VARIANTS
  if (maxOcrImages >= frameCount * DEFAULT_BOOST_VARIANT_PRIORITY.length) {
    return DEFAULT_BOOST_VARIANT_PRIORITY
      .map((variant) => BOOST_VARIANTS.find((definition) => definition.variant === variant))
      .filter(Boolean)
  }
  return [BOOST_VARIANTS.find((definition) => definition.variant === 'middle_crop_raw')]
    .filter(Boolean)
}

export async function buildShortsTrack2V3LiveFrameVariants(frameResult = {}, config = {}, deps = {}) {
  const maxOcrImages = Math.max(0, Number(config.maxOcrImages ?? 0))
  const frames = Array.isArray(frameResult.frames) ? frameResult.frames : []
  const variants = []
  const providerErrors = []

  for (const frame of frames) {
    if (variants.length >= maxOcrImages) break
    variants.push(liveVariantDescriptor(frame, PHASE4_VARIANTS[0]))

    if (variants.length >= maxOcrImages) break
    const bottomCrop = await bottomCropDescriptor(frame, deps)
    variants.push(bottomCrop.descriptor)
    providerErrors.push(...bottomCrop.providerErrors)
  }

  return {
    status: variants.length ? 'READY' : 'NO_FRAMES',
    variants,
    variantCount: variants.length,
    maxOcrImages,
    plannedFrameCount: frameResult.plannedFrameCount ?? frames.length,
    providerErrors,
  }
}

export function buildShortsTrack2V3OcrBoostFrameVariants(framePlan = {}, config = {}) {
  const maxOcrImages = boundedBoostMaxOcrImages(config)
  const frames = Array.isArray(framePlan.frames) && framePlan.frames.length
    ? framePlan.frames
    : Array.isArray(framePlan.plannedFrames)
      ? framePlan.plannedFrames
      : []
  const definitions = selectBoostVariantDefinitions(frames.length, maxOcrImages)
  const variants = []

  for (const definition of definitions) {
    for (const frame of frames) {
      if (variants.length >= maxOcrImages) break
      variants.push(withOptionalImageFields({
        id: `boost:${Number(frame.frameIndex) || 0}:${definition.variant}`,
        variant: definition.variant,
        sourceType: definition.sourceType,
        frameIndex: finiteNumber(frame.frameIndex, variants.length),
        label: frame.label || null,
        timestampSeconds: finiteNumber(frame.timestampSeconds, null),
        relativePosition: finiteNumber(frame.relativePosition, null),
      }, frame))
    }
  }

  return {
    status: variants.length ? 'PLANNED' : 'NO_FRAMES',
    variants,
    variantCount: variants.length,
    cropImageCount: variants.filter((variant) => variant.variant !== 'full_raw').length,
    maxOcrImages,
    plannedFrameCount: framePlan.plannedFrameCount ?? 0,
  }
}

export async function buildShortsTrack2V3LiveOcrBoostFrameVariants(
  frameResult = {},
  config = {},
  deps = {},
) {
  const maxOcrImages = boundedBoostMaxOcrImages(config)
  const frames = Array.isArray(frameResult.frames) ? frameResult.frames : []
  const definitions = selectBoostVariantDefinitions(frames.length, maxOcrImages)
  const variants = []
  const providerErrors = []

  for (const definition of definitions) {
    for (const frame of frames) {
      if (variants.length >= maxOcrImages) break
      if (!definition.cropRegion) {
        variants.push(liveVariantDescriptor(frame, definition))
        continue
      }

      const crop = await cropDescriptor(frame, definition, deps)
      variants.push(crop.descriptor)
      providerErrors.push(...crop.providerErrors)
    }
  }

  return {
    status: variants.length ? 'READY' : 'NO_FRAMES',
    variants,
    variantCount: variants.length,
    cropImageCount: variants.filter((variant) => variant.variant !== 'full_raw').length,
    maxOcrImages,
    plannedFrameCount: frameResult.plannedFrameCount ?? frames.length,
    providerErrors,
  }
}
