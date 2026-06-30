import { planShortsTrack2V3Frames } from './shortsTrack2V3FramePlannerService.js'
import { buildShortsTrack2V3OcrBoostFrameVariants } from './shortsTrack2V3FrameVariantService.js'
import { runShortsTrack2V3CheapOcr } from './shortsTrack2V3OcrProviderService.js'
import { runTrack2V3OcrBoostLive } from './shortsTrack2V3LiveCheapOcrAdapter.js'

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeWhitespace(value = '') {
  return safeString(value, 20000)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function bestOcrSnippets(textBlocks = []) {
  return (Array.isArray(textBlocks) ? textBlocks : [])
    .map((block) => normalizeWhitespace(block.normalizedText || block.rawText || block.text))
    .filter(Boolean)
    .map((text) => text.replace(/\s+/gu, ' ').slice(0, 180))
    .slice(0, 5)
}

function providerError(code, message, details = {}) {
  return {
    source: 'track2_v3_ocr_boost',
    stage: 'ocr_boost',
    code,
    message: safeString(message, 240),
    recoverable: true,
    ...details,
  }
}

function asBoostProviderErrors(providerErrors = []) {
  return (Array.isArray(providerErrors) ? providerErrors : [])
    .map((error) => ({
      ...error,
      source: 'track2_v3_ocr_boost',
      stage: error?.stage || 'ocr_boost',
      recoverable: error?.recoverable !== false,
    }))
}

function shouldRunLiveOcrBoost(config = {}, deps = {}) {
  if (!config.enabled) return false
  if (Array.isArray(deps.track2V3OcrBoostBlocks)) return false
  if (typeof deps.track2V3OcrBoostProvider === 'function') return false
  return typeof deps.track2FrameExtractor === 'function' ||
    typeof deps.track2OcrProvider === 'function' ||
    typeof deps.track2V3OcrBoostLiveAdapter === 'function'
}

function notRun(reason = 'OCR_BOOST_NOT_SELECTED') {
  return {
    status: 'NOT_RUN',
    reason,
    ocrBoostRan: false,
    textBlocks: [],
    framePlan: null,
    frameVariants: null,
    providerErrors: [],
    metrics: {
      frameCount: 0,
      ocrImageCount: 0,
      cropImageCount: 0,
      ocrTextBlockCount: 0,
    },
    debug: {
      boostBestOcrSnippets: [],
    },
  }
}

function normalizeProviderResult(providerResult = {}, framePlan = {}, frameVariants = {}, reason) {
  const textBlocks = Array.isArray(providerResult.textBlocks)
    ? providerResult.textBlocks
    : []
  const metrics = providerResult.metrics || {}

  return {
    status: providerResult.status || 'OK',
    reason: providerResult.reason || (textBlocks.length ? 'OCR_BOOST_TEXT_COLLECTED' : 'OCR_BOOST_NO_TEXT'),
    ocrBoostRan: true,
    ocrBoostReason: reason,
    textBlocks,
    framePlan,
    frameVariants,
    providerErrors: asBoostProviderErrors(providerResult.providerErrors),
    imageCount: providerResult.imageCount ?? frameVariants.variantCount ?? 0,
    metrics: {
      frameCount: metrics.frameCount ?? framePlan.frameCount ?? framePlan.plannedFrameCount ?? 0,
      ocrImageCount: metrics.ocrImageCount ??
        providerResult.imageCount ??
        frameVariants.variantCount ??
        0,
      cropImageCount: metrics.cropImageCount ?? frameVariants.cropImageCount ?? 0,
      ocrTextBlockCount: metrics.ocrTextBlockCount ?? textBlocks.length,
    },
    debug: {
      boostBestOcrSnippets: bestOcrSnippets(textBlocks),
      ...(providerResult.debug || {}),
    },
  }
}

async function runInjectedBoost(context, config, deps, reason) {
  const framePlan = planShortsTrack2V3Frames(context, config, { stage: 'OCR_BOOST' })
  const frameVariants = buildShortsTrack2V3OcrBoostFrameVariants(framePlan, config)
  const providerResult = await runShortsTrack2V3CheapOcr(frameVariants, config, {
    ...deps,
    context,
    track2V3OcrBlocks: deps.track2V3OcrBoostBlocks,
  })

  return normalizeProviderResult(providerResult, framePlan, frameVariants, reason)
}

async function runProviderBoost(context, config, deps, reason) {
  const framePlan = planShortsTrack2V3Frames(context, config, { stage: 'OCR_BOOST' })
  const frameVariants = buildShortsTrack2V3OcrBoostFrameVariants(framePlan, config)
  const providerResult = await runShortsTrack2V3CheapOcr(frameVariants, config, {
    ...deps,
    context,
    track2V3OcrBlocks: undefined,
    track2V3OcrProvider: deps.track2V3OcrBoostProvider,
  })

  return normalizeProviderResult(providerResult, framePlan, frameVariants, reason)
}

async function runLiveBoost(context, config, deps, reason) {
  const framePlan = planShortsTrack2V3Frames(context, config, { stage: 'OCR_BOOST' })
  const adapter = typeof deps.track2V3OcrBoostLiveAdapter === 'function'
    ? deps.track2V3OcrBoostLiveAdapter
    : runTrack2V3OcrBoostLive
  const liveResult = await adapter(context, { ...config, framePlan }, deps)
  const frames = Array.isArray(liveResult.frames) ? liveResult.frames : []
  const ocrImages = Array.isArray(liveResult.ocrImages) ? liveResult.ocrImages : []
  const textBlocks = Array.isArray(liveResult.ocrTextBlocks)
    ? liveResult.ocrTextBlocks
    : []

  return {
    status: textBlocks.length ? 'OK' : liveResult.providerErrors?.length ? 'UNAVAILABLE' : 'OK',
    reason: textBlocks.length
      ? 'OCR_BOOST_TEXT_COLLECTED'
      : liveResult.providerErrors?.length
      ? 'OCR_BOOST_PROVIDER_UNAVAILABLE'
      : 'OCR_BOOST_NO_TEXT',
    ocrBoostRan: true,
    ocrBoostReason: reason,
    textBlocks,
    framePlan: {
      ...framePlan,
      frames,
      frameCount: liveResult.metrics?.frameCount ?? frames.length,
    },
    frameVariants: {
      status: ocrImages.length ? 'READY' : 'NO_FRAMES',
      variants: ocrImages,
      variantCount: liveResult.metrics?.ocrImageCount ?? ocrImages.length,
      cropImageCount: liveResult.metrics?.cropImageCount ?? 0,
      maxOcrImages: Math.min(16, Number(config.maxOcrImages || 0)),
      providerErrors: liveResult.providerErrors || [],
    },
    providerErrors: asBoostProviderErrors(liveResult.providerErrors),
    imageCount: liveResult.metrics?.ocrImageCount ?? ocrImages.length,
    metrics: {
      frameCount: liveResult.metrics?.frameCount ?? frames.length,
      ocrImageCount: liveResult.metrics?.ocrImageCount ?? ocrImages.length,
      cropImageCount: liveResult.metrics?.cropImageCount ?? 0,
      ocrTextBlockCount: liveResult.metrics?.ocrTextBlockCount ?? textBlocks.length,
    },
    debug: {
      boostBestOcrSnippets: bestOcrSnippets(textBlocks),
      ...(liveResult.debug || {}),
    },
  }
}

export async function runShortsTrack2V3OcrBoost({
  context = {},
  config = {},
  deps = {},
  escalation = {},
} = {}) {
  if (escalation.escalationLevel !== 'OCR_BOOST' || escalation.ocrBoostAllowed === false) {
    return notRun(escalation.ocrBoostReason || 'OCR_BOOST_NOT_SELECTED')
  }

  const reason = escalation.ocrBoostReason || 'OCR_BOOST_SELECTED'

  try {
    if (Array.isArray(deps.track2V3OcrBoostBlocks)) {
      return runInjectedBoost(context, config, deps, reason)
    }

    if (typeof deps.track2V3OcrBoostProvider === 'function') {
      return runProviderBoost(context, config, deps, reason)
    }

    if (shouldRunLiveOcrBoost(config, deps)) {
      return runLiveBoost(context, config, deps, reason)
    }

    return {
      ...notRun('OCR_BOOST_PROVIDER_UNAVAILABLE'),
      status: 'UNAVAILABLE',
      providerErrors: [
        providerError(
          'TRACK2_V3_OCR_BOOST_PROVIDER_UNAVAILABLE',
          'No OCR boost provider is configured for Track 2 V3.',
        ),
      ],
    }
  } catch (error) {
    return {
      ...notRun('OCR_BOOST_PROVIDER_ERROR'),
      status: 'ERROR',
      ocrBoostRan: true,
      providerErrors: [
        providerError(
          'TRACK2_V3_OCR_BOOST_PROVIDER_ERROR',
          error?.message || 'Track 2 V3 OCR boost failed.',
        ),
      ],
    }
  }
}
