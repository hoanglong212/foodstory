import { runOcrOnShortsFrames } from '../../shortsTrack2OcrService.js'
import { planShortsTrack2V3Frames } from './shortsTrack2V3FramePlannerService.js'
import {
  buildShortsTrack2V3LiveFrameVariants,
  buildShortsTrack2V3LiveOcrBoostFrameVariants,
} from './shortsTrack2V3FrameVariantService.js'

const DEFAULT_CHEAP_FRAME_COUNT = 4
const DEFAULT_BOOST_FRAME_COUNT = 8
const MAX_BOOST_FRAME_COUNT = 8

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeWhitespace(value = '') {
  return safeString(value, 20000)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
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

function diagnosticToProviderError(diagnostic = {}, fallbackCode = 'PROVIDER_ERROR') {
  const diagnosticCode = safeString(diagnostic.code || diagnostic.reason || fallbackCode, 120)
  const code = /UNAVAILABLE|MISSING|NOT_FOUND|NO_FRAMES/iu.test(diagnosticCode)
    ? 'PROVIDER_UNAVAILABLE'
    : fallbackCode

  return providerError(
    code,
    diagnostic.message || diagnosticCode || 'Track 2 V3 cheap OCR provider failed.',
    {
      providerCode: diagnosticCode || fallbackCode,
      ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
      ...(diagnostic.status ? { status: safeString(diagnostic.status, 80) } : {}),
      ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
      ...(Number.isFinite(Number(diagnostic.frameIndex))
        ? { frameIndex: Number(diagnostic.frameIndex) }
        : {}),
      ...(Number.isFinite(Number(diagnostic.timestampSeconds))
        ? { timestampSeconds: Number(diagnostic.timestampSeconds) }
        : {}),
      ...(Number.isFinite(Number(diagnostic.httpStatus))
        ? { httpStatus: Number(diagnostic.httpStatus) }
        : {}),
    },
  )
}

function durationSecondsFromContext(context = {}) {
  const metadata = context.metadata || {}
  const direct = finiteNumber(
    context.durationSeconds ??
      context.duration ??
      metadata.durationSeconds ??
      metadata.lengthSeconds ??
      metadata.videoDurationSeconds,
    null,
  )
  if (direct !== null) return direct

  const isoDuration = safeString(context.duration || metadata.duration, 80)
  const match = /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/iu.exec(isoDuration)
  if (!match) return null

  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total > 0 ? total : null
}

function emptyResult({ providerErrors = [], debug = {}, liveAdapterRan = true } = {}) {
  return {
    liveAdapterRan,
    frames: [],
    ocrImages: [],
    ocrTextBlocks: [],
    providerErrors,
    metrics: {
      frameCount: 0,
      ocrImageCount: 0,
      ocrTextBlockCount: 0,
    },
    debug: {
      bestOcrSnippets: [],
      ...debug,
    },
  }
}

function normalizeFrame(frame = {}, index = 0, plannedFrame = {}) {
  const frameIndex = Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : index
  const imagePath = safeString(frame.path || frame.imagePath, 1000)

  return {
    frameIndex,
    label: plannedFrame.label || frame.label || null,
    timestampSeconds: finiteNumber(frame.timestampSeconds ?? plannedFrame.timestampSeconds, null),
    relativePosition: finiteNumber(plannedFrame.relativePosition ?? frame.relativePosition, null),
    path: imagePath || null,
    imagePath: imagePath || null,
    width: finiteNumber(frame.width, null),
    height: finiteNumber(frame.height, null),
    mimeType: frame.mimeType || 'image/jpeg',
    sizeBytes: finiteNumber(frame.sizeBytes, 0),
  }
}

function normalizeFrames(frames = [], framePlan = {}) {
  const plannedFrames = Array.isArray(framePlan.plannedFrames) ? framePlan.plannedFrames : []
  return (Array.isArray(frames) ? frames : [])
    .map((frame, index) => normalizeFrame(frame, index, plannedFrames[index] || {}))
    .filter((frame) => frame.path)
}

function buildLimits(config = {}, framePlan = {}) {
  const plannedFrames = Array.isArray(framePlan.plannedFrames) ? framePlan.plannedFrames : []
  const cheapFrameCount = Math.max(
    1,
    Number(config.cheapFrameCount || plannedFrames.length || DEFAULT_CHEAP_FRAME_COUNT),
  )
  const maxFrames = Math.max(1, Math.min(
    Number(config.maxFrames || cheapFrameCount),
    cheapFrameCount,
  ))

  return {
    maxVideoDurationSeconds: Math.max(1, Number(config.maxDurationSeconds || 60)),
    maxFrames,
    maxExtractionBudgetMs: Math.max(1, Number(config.timeoutMs || 30000)),
    sampleStrategy: 'UNIFORM',
    sampledTimestamps: plannedFrames
      .map((frame) => finiteNumber(frame.timestampSeconds, null))
      .filter((value) => value !== null && value >= 0)
      .slice(0, maxFrames),
  }
}

function buildBoostLimits(config = {}, framePlan = {}) {
  const plannedFrames = Array.isArray(framePlan.plannedFrames) ? framePlan.plannedFrames : []
  const boostFrameCount = Math.max(
    1,
    Math.min(
      MAX_BOOST_FRAME_COUNT,
      Number(config.ocrBoostFrameCount || plannedFrames.length || DEFAULT_BOOST_FRAME_COUNT),
    ),
  )
  const maxFrames = Math.max(1, Math.min(
    MAX_BOOST_FRAME_COUNT,
    Number(config.maxFrames || boostFrameCount),
    boostFrameCount,
  ))

  return {
    maxVideoDurationSeconds: Math.max(1, Number(config.maxDurationSeconds || 60)),
    maxFrames,
    maxExtractionBudgetMs: Math.max(1, Number(config.timeoutMs || 30000)),
    sampleStrategy: 'UNIFORM',
    sampledTimestamps: plannedFrames
      .map((frame) => finiteNumber(frame.timestampSeconds, null))
      .filter((value) => value !== null && value >= 0)
      .slice(0, maxFrames),
  }
}

function normalizeOcrImages(variants = []) {
  return (Array.isArray(variants) ? variants : [])
    .map((variant, index) => {
      const imagePath = safeString(variant.path || variant.imagePath, 1000)
      if (!imagePath) return null

      return {
        id: safeString(variant.id || `ocrimg:${index}`, 160),
        frameIndex: finiteNumber(variant.frameIndex, 0),
        timestampSeconds: finiteNumber(variant.timestampSeconds, null),
        variant: safeString(variant.variant || 'full_raw', 80),
        sourceType: safeString(variant.sourceType || 'ocr_frame_full', 80),
        path: imagePath,
        imagePath,
        mimeType: variant.mimeType || 'image/jpeg',
        sizeBytes: finiteNumber(variant.sizeBytes, 0),
      }
    })
    .filter(Boolean)
}

function ocrFrameForProvider(image = {}, index = 0) {
  return {
    frameIndex: index,
    timestampSeconds: finiteNumber(image.timestampSeconds, 0),
    imagePath: image.path || image.imagePath,
    mimeType: image.mimeType || 'image/jpeg',
    sizeBytes: finiteNumber(image.sizeBytes, 0),
  }
}

function normalizeOcrTextBlocks(textBlocks = [], ocrImages = []) {
  return (Array.isArray(textBlocks) ? textBlocks : [])
    .map((block, index) => {
      const providerFrameIndex = Number.isFinite(Number(block?.frameIndex))
        ? Number(block.frameIndex)
        : index
      const sourceImage = ocrImages[providerFrameIndex] || ocrImages[index] || {}
      const rawText = normalizeWhitespace(block.rawText || block.text || block.description || '')
      if (!rawText) return null

      return {
        id: `ocr:block:${sourceImage.id || index}`,
        provider: 'google_vision_text',
        sourceType: sourceImage.sourceType || 'ocr_frame_full',
        imageVariant: sourceImage.variant || 'full_raw',
        frameIndex: finiteNumber(sourceImage.frameIndex, 0),
        timestampSeconds: finiteNumber(sourceImage.timestampSeconds, null),
        rawText,
        normalizedText: normalizeWhitespace(block.normalizedText || rawText),
        confidence: finiteNumber(block.confidence, 0),
        bbox: block.bbox || null,
      }
    })
    .filter(Boolean)
}

function bestOcrSnippets(textBlocks = []) {
  return textBlocks
    .map((block) => normalizeWhitespace(block.normalizedText || block.rawText))
    .filter(Boolean)
    .map((text) => text.replace(/\s+/gu, ' ').slice(0, 180))
    .slice(0, 5)
}

function frameResultStatusErrors(frameResult = {}) {
  const diagnostics = Array.isArray(frameResult.diagnostics) ? frameResult.diagnostics : []
  if (diagnostics.length) {
    return diagnostics.map((diagnostic) => diagnosticToProviderError(diagnostic, 'PROVIDER_ERROR'))
  }

  return [
    providerError(
      frameResult.status === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
      frameResult.reason || 'Track 2 V3 frame extraction failed.',
      { providerCode: frameResult.reason || null },
    ),
  ]
}

export async function runTrack2V3CheapOcrLive(context = {}, config = {}, deps = {}) {
  const framePlan = config.framePlan || planShortsTrack2V3Frames(context, config)
  const sourceUrl = safeString(context.url || context.sourceUrl || context.metadata?.url, 2000)
  const metadata = {
    ...(context.metadata || {}),
    ...(durationSecondsFromContext(context) !== null
      ? { durationSeconds: durationSecondsFromContext(context) }
      : {}),
  }
  const durationSeconds = durationSecondsFromContext({ ...context, metadata })
  const maxDurationSeconds = Math.max(1, Number(config.maxDurationSeconds || 60))
  const budgetMs = Math.max(1, Number(config.timeoutMs || 30000))
  const cleanup = typeof deps.cleanupTrack2LiveProviders === 'function'
    ? deps.cleanupTrack2LiveProviders
    : null

  if (!sourceUrl) {
    return emptyResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 cheap OCR needs a source URL.', {
          providerCode: 'MISSING_SOURCE_URL',
        }),
      ],
    })
  }

  if (durationSeconds !== null && durationSeconds > maxDurationSeconds) {
    return emptyResult({
      providerErrors: [
        providerError('VIDEO_TOO_LONG', 'Video is longer than Track 2 V3 cheap OCR allows.', {
          durationSeconds,
          maxDurationSeconds,
        }),
      ],
    })
  }

  if (typeof deps.track2FrameExtractor !== 'function') {
    return emptyResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 frame extractor is unavailable.', {
          providerCode: 'MISSING_TRACK2_FRAME_EXTRACTOR',
        }),
      ],
    })
  }

  if (typeof deps.track2OcrProvider !== 'function') {
    return emptyResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR provider is unavailable.', {
          providerCode: 'MISSING_TRACK2_OCR_PROVIDER',
        }),
      ],
    })
  }

  try {
    const frameResult = await deps.track2FrameExtractor({
      sourceUrl,
      videoId: context.videoId || metadata.videoId || null,
      metadata,
      limits: buildLimits(config, framePlan),
      budgetMs,
      signal: deps.signal,
      tmpDir: deps.tmpDir || null,
    })
    const frameStatus = safeString(frameResult?.status || 'OK', 80).toUpperCase()
    if (frameStatus !== 'OK') {
      await cleanup?.()
      return emptyResult({
        providerErrors: frameResultStatusErrors(frameResult),
      })
    }

    const frames = normalizeFrames(frameResult?.frames, framePlan)
    if (!frames.length) {
      await cleanup?.()
      return emptyResult({
        providerErrors: [
          providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 frame extractor returned no frames.', {
            providerCode: 'NO_FRAMES',
          }),
        ],
      })
    }

    const variantResult = await buildShortsTrack2V3LiveFrameVariants(
      {
        frames,
        plannedFrameCount: framePlan.plannedFrameCount,
      },
      config,
      deps,
    )
    const ocrImages = normalizeOcrImages(variantResult.variants)
    if (!ocrImages.length) {
      await cleanup?.()
      return {
        ...emptyResult({
          providerErrors: [
            ...variantResult.providerErrors,
            providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 has no OCR images.', {
              providerCode: 'NO_OCR_IMAGES',
            }),
          ],
        }),
        frames,
        metrics: {
          frameCount: frames.length,
          ocrImageCount: 0,
          ocrTextBlockCount: 0,
        },
      }
    }

    const ocrResult = await runOcrOnShortsFrames(
      {
        frames: ocrImages.map(ocrFrameForProvider),
        metadata,
      },
      {
        ...deps,
        metadata,
      },
    )
    const ocrStatus = safeString(ocrResult.status || 'OK', 80).toUpperCase()
    const ocrTextBlocks = ocrStatus === 'OK'
      ? normalizeOcrTextBlocks(ocrResult.textBlocks, ocrImages)
      : []
    const providerErrors = [
      ...(Array.isArray(variantResult.providerErrors) ? variantResult.providerErrors : []),
      ...(ocrStatus === 'UNAVAILABLE' || ocrStatus === 'ERROR'
        ? (Array.isArray(ocrResult.diagnostics) && ocrResult.diagnostics.length
            ? ocrResult.diagnostics.map((diagnostic) =>
                diagnosticToProviderError(
                  diagnostic,
                  ocrStatus === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
                ))
            : [
                providerError(
                  ocrStatus === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
                  ocrResult.reason || 'Track 2 V3 OCR provider failed.',
                  { providerCode: ocrResult.reason || null },
                ),
              ])
        : []),
    ]

    await cleanup?.()

    return {
      liveAdapterRan: true,
      frames,
      ocrImages,
      ocrTextBlocks,
      providerErrors,
      metrics: {
        frameCount: frames.length,
        ocrImageCount: ocrImages.length,
        ocrTextBlockCount: ocrTextBlocks.length,
      },
      debug: {
        bestOcrSnippets: bestOcrSnippets(ocrTextBlocks),
      },
    }
  } catch (error) {
    await cleanup?.()
    return emptyResult({
      providerErrors: [
        providerError('PROVIDER_ERROR', error?.message || 'Track 2 V3 cheap OCR adapter failed.', {
          providerCode: safeString(error?.code || 'TRACK2_V3_CHEAP_OCR_ADAPTER_ERROR', 120),
        }),
      ],
    })
  }
}

function emptyBoostResult({ providerErrors = [], debug = {} } = {}) {
  return {
    ocrBoostRan: true,
    frames: [],
    ocrImages: [],
    ocrTextBlocks: [],
    providerErrors,
    metrics: {
      frameCount: 0,
      ocrImageCount: 0,
      cropImageCount: 0,
      ocrTextBlockCount: 0,
    },
    debug: {
      boostBestOcrSnippets: [],
      ...debug,
    },
  }
}

export async function runTrack2V3OcrBoostLive(context = {}, config = {}, deps = {}) {
  const framePlan = config.framePlan ||
    planShortsTrack2V3Frames(context, config, { stage: 'OCR_BOOST' })
  const sourceUrl = safeString(context.url || context.sourceUrl || context.metadata?.url, 2000)
  const metadata = {
    ...(context.metadata || {}),
    ...(durationSecondsFromContext(context) !== null
      ? { durationSeconds: durationSecondsFromContext(context) }
      : {}),
  }
  const durationSeconds = durationSecondsFromContext({ ...context, metadata })
  const maxDurationSeconds = Math.max(1, Number(config.maxDurationSeconds || 60))
  const budgetMs = Math.max(1, Number(config.timeoutMs || 30000))
  const cleanup = typeof deps.cleanupTrack2LiveProviders === 'function'
    ? deps.cleanupTrack2LiveProviders
    : null

  if (!sourceUrl) {
    return emptyBoostResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR boost needs a source URL.', {
          providerCode: 'MISSING_SOURCE_URL',
        }),
      ],
    })
  }

  if (durationSeconds !== null && durationSeconds > maxDurationSeconds) {
    return emptyBoostResult({
      providerErrors: [
        providerError('VIDEO_TOO_LONG', 'Video is longer than Track 2 V3 OCR boost allows.', {
          durationSeconds,
          maxDurationSeconds,
        }),
      ],
    })
  }

  if (typeof deps.track2FrameExtractor !== 'function') {
    return emptyBoostResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR boost frame extractor is unavailable.', {
          providerCode: 'MISSING_TRACK2_FRAME_EXTRACTOR',
        }),
      ],
    })
  }

  if (typeof deps.track2OcrProvider !== 'function') {
    return emptyBoostResult({
      providerErrors: [
        providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR boost provider is unavailable.', {
          providerCode: 'MISSING_TRACK2_OCR_PROVIDER',
        }),
      ],
    })
  }

  try {
    const frameResult = await deps.track2FrameExtractor({
      sourceUrl,
      videoId: context.videoId || metadata.videoId || null,
      metadata,
      limits: buildBoostLimits(config, framePlan),
      budgetMs,
      signal: deps.signal,
      tmpDir: deps.tmpDir || null,
    })
    const frameStatus = safeString(frameResult?.status || 'OK', 80).toUpperCase()
    if (frameStatus !== 'OK') {
      await cleanup?.()
      return emptyBoostResult({
        providerErrors: frameResultStatusErrors(frameResult),
      })
    }

    const frames = normalizeFrames(frameResult?.frames, framePlan)
    if (!frames.length) {
      await cleanup?.()
      return emptyBoostResult({
        providerErrors: [
          providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR boost frame extractor returned no frames.', {
            providerCode: 'NO_FRAMES',
          }),
        ],
      })
    }

    const variantResult = await buildShortsTrack2V3LiveOcrBoostFrameVariants(
      {
        frames,
        plannedFrameCount: framePlan.plannedFrameCount,
      },
      config,
      deps,
    )
    const ocrImages = normalizeOcrImages(variantResult.variants)
    if (!ocrImages.length) {
      await cleanup?.()
      return {
        ...emptyBoostResult({
          providerErrors: [
            ...variantResult.providerErrors,
            providerError('PROVIDER_UNAVAILABLE', 'Track 2 V3 OCR boost has no OCR images.', {
              providerCode: 'NO_OCR_IMAGES',
            }),
          ],
        }),
        frames,
        metrics: {
          frameCount: frames.length,
          ocrImageCount: 0,
          cropImageCount: 0,
          ocrTextBlockCount: 0,
        },
      }
    }

    const ocrResult = await runOcrOnShortsFrames(
      {
        frames: ocrImages.map(ocrFrameForProvider),
        metadata,
      },
      {
        ...deps,
        metadata,
      },
    )
    const ocrStatus = safeString(ocrResult.status || 'OK', 80).toUpperCase()
    const ocrTextBlocks = ocrStatus === 'OK'
      ? normalizeOcrTextBlocks(ocrResult.textBlocks, ocrImages)
      : []
    const providerErrors = [
      ...(Array.isArray(variantResult.providerErrors) ? variantResult.providerErrors : []),
      ...(ocrStatus === 'UNAVAILABLE' || ocrStatus === 'ERROR'
        ? (Array.isArray(ocrResult.diagnostics) && ocrResult.diagnostics.length
            ? ocrResult.diagnostics.map((diagnostic) =>
                diagnosticToProviderError(
                  diagnostic,
                  ocrStatus === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
                ))
            : [
                providerError(
                  ocrStatus === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
                  ocrResult.reason || 'Track 2 V3 OCR boost provider failed.',
                  { providerCode: ocrResult.reason || null },
                ),
              ])
        : []),
    ]

    await cleanup?.()

    return {
      ocrBoostRan: true,
      frames,
      ocrImages,
      ocrTextBlocks,
      providerErrors,
      metrics: {
        frameCount: frames.length,
        ocrImageCount: ocrImages.length,
        cropImageCount: variantResult.cropImageCount || 0,
        ocrTextBlockCount: ocrTextBlocks.length,
      },
      debug: {
        boostBestOcrSnippets: bestOcrSnippets(ocrTextBlocks),
      },
    }
  } catch (error) {
    await cleanup?.()
    return emptyBoostResult({
      providerErrors: [
        providerError('PROVIDER_ERROR', error?.message || 'Track 2 V3 OCR boost adapter failed.', {
          providerCode: safeString(error?.code || 'TRACK2_V3_OCR_BOOST_ADAPTER_ERROR', 120),
        }),
      ],
    })
  }
}

export default {
  runTrack2V3CheapOcrLive,
  runTrack2V3OcrBoostLive,
}
