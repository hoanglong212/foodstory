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
  },
]

function finiteNumber(value, fallback = null) {
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
        frameIndex: Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : variants.length,
        label: frame.label || null,
        timestampSeconds: Number.isFinite(Number(frame.timestampSeconds))
          ? Number(frame.timestampSeconds)
          : null,
        relativePosition: Number.isFinite(Number(frame.relativePosition))
          ? Number(frame.relativePosition)
          : null,
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
  const sourcePath = safeString(frame.path || frame.imagePath, 1000)
  if (!sourcePath) {
    return {
      descriptor: liveVariantDescriptor(frame, PHASE4_VARIANTS[1]),
      providerErrors: [
        providerError('CROP_SOURCE_MISSING', 'Bottom crop source image is missing.', {
          frameIndex: finiteNumber(frame.frameIndex, 0),
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
        descriptor: liveVariantDescriptor(frame, PHASE4_VARIANTS[1]),
        providerErrors: [
          providerError('CROP_METADATA_UNAVAILABLE', 'Bottom crop metadata is unavailable.', {
            frameIndex: finiteNumber(frame.frameIndex, 0),
          }),
        ],
      }
    }

    const cropHeight = Math.max(1, Math.floor(height * 0.45))
    const extension = path.extname(sourcePath) || '.jpg'
    const baseName = path.basename(sourcePath, extension)
    const cropPath = path.join(path.dirname(sourcePath), `${baseName}-bottom-crop.jpg`)

    await imageTool(sourcePath)
      .extract({
        left: 0,
        top: Math.max(0, height - cropHeight),
        width,
        height: cropHeight,
      })
      .jpeg({ quality: 90 })
      .toFile(cropPath)

    const stat = await fs.stat(cropPath)
    return {
      descriptor: liveVariantDescriptor(frame, PHASE4_VARIANTS[1], {
        path: cropPath,
        mimeType: 'image/jpeg',
        sizeBytes: stat.size,
        width,
        height: cropHeight,
      }),
      providerErrors: [],
    }
  } catch {
    return {
      descriptor: liveVariantDescriptor(frame, PHASE4_VARIANTS[1]),
      providerErrors: [
        providerError('BOTTOM_CROP_FAILED', 'Bottom crop generation failed.', {
          frameIndex: finiteNumber(frame.frameIndex, 0),
        }),
      ],
    }
  }
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
