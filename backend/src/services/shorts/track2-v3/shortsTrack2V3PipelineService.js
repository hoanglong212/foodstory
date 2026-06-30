import { getShortsTrack2V3Config } from './shortsTrack2V3Config.js'
import { classifyShortsTrack2V3Intent } from './shortsTrack2V3IntentClassifierService.js'
import { planShortsTrack2V3Frames } from './shortsTrack2V3FramePlannerService.js'
import { buildShortsTrack2V3FrameVariants } from './shortsTrack2V3FrameVariantService.js'
import { runShortsTrack2V3CheapOcr } from './shortsTrack2V3OcrProviderService.js'
import { runTrack2V3CheapOcrLive } from './shortsTrack2V3LiveCheapOcrAdapter.js'
import {
  collectShortsTrack2V3Evidence,
  createShortsTrack2V3EvidenceStore,
} from './shortsTrack2V3EvidenceStoreService.js'
import { buildShortsTrack2V3Candidates } from './shortsTrack2V3CandidateBuilderService.js'
import { decideShortsTrack2V3Escalation } from './shortsTrack2V3EscalationService.js'
import { fuseShortsTrack2V3Evidence } from './shortsTrack2V3EvidenceFusionService.js'
import { buildShortsTrack2V3Response } from './shortsTrack2V3ResponseBuilder.js'

function normalizeContext(input = {}) {
  if (typeof input === 'string') {
    return {
      url: input,
      sourceUrl: input,
    }
  }

  const metadata = input.metadata || {}
  return {
    ...input,
    url: input.url || input.sourceUrl || metadata.url || null,
    sourceUrl: input.sourceUrl || input.url || metadata.url || null,
    videoId: input.videoId || metadata.videoId || null,
    metadata,
    title: input.title || metadata.title || '',
    description: input.description || metadata.description || metadata.descriptionRawFromYoutube || '',
    channelTitle: input.channelTitle || metadata.channelTitle || '',
    duration: input.duration || metadata.duration || null,
  }
}

function shouldRunLiveCheapOcrAdapter(config = {}, deps = {}) {
  if (!config.enabled) return false
  if (Array.isArray(deps.track2V3OcrBlocks)) return false
  if (typeof deps.track2V3OcrProvider === 'function') return false
  return typeof deps.track2FrameExtractor === 'function' ||
    typeof deps.track2OcrProvider === 'function' ||
    typeof deps.track2V3LiveCheapOcrAdapter === 'function'
}

async function runCheapOcrStage(context, config, framePlan, frameVariants, deps) {
  if (shouldRunLiveCheapOcrAdapter(config, deps)) {
    const adapter = typeof deps.track2V3LiveCheapOcrAdapter === 'function'
      ? deps.track2V3LiveCheapOcrAdapter
      : runTrack2V3CheapOcrLive
    const liveResult = await adapter(context, { ...config, framePlan }, deps)
    const frames = Array.isArray(liveResult.frames) ? liveResult.frames : []
    const ocrImages = Array.isArray(liveResult.ocrImages) ? liveResult.ocrImages : []
    const ocrTextBlocks = Array.isArray(liveResult.ocrTextBlocks)
      ? liveResult.ocrTextBlocks
      : []

    return {
      framePlan: {
        ...framePlan,
        frames,
        frameCount: liveResult.metrics?.frameCount ?? frames.length,
      },
      frameVariants: {
        ...frameVariants,
        variants: ocrImages,
        variantCount: liveResult.metrics?.ocrImageCount ?? ocrImages.length,
        providerErrors: liveResult.providerErrors || [],
      },
      ocrResult: {
        status: ocrTextBlocks.length ? 'OK' : liveResult.providerErrors?.length ? 'UNAVAILABLE' : 'OK',
        reason: ocrTextBlocks.length
          ? 'OCR_TEXT_COLLECTED'
          : liveResult.providerErrors?.length
          ? 'TRACK2_V3_PROVIDER_UNAVAILABLE'
          : 'OCR_NO_TEXT',
        textBlocks: ocrTextBlocks,
        providerErrors: liveResult.providerErrors || [],
        imageCount: liveResult.metrics?.ocrImageCount ?? ocrImages.length,
        metrics: liveResult.metrics || {},
        liveAdapterRan: Boolean(liveResult.liveAdapterRan),
        debug: liveResult.debug || {},
      },
    }
  }

  return {
    framePlan,
    frameVariants,
    ocrResult: await runShortsTrack2V3CheapOcr(frameVariants, config, {
      ...deps,
      context,
    }),
  }
}

export async function runShortsTrack2V3Pipeline(input = {}, deps = {}) {
  const startedAt = Date.now()
  const config = deps.track2V3Config || getShortsTrack2V3Config(deps.env || process.env)
  const context = normalizeContext(input)
  const intent = classifyShortsTrack2V3Intent(context, config)
  const plannedFramePlan = planShortsTrack2V3Frames(context, config, intent)
  const plannedFrameVariants = buildShortsTrack2V3FrameVariants(plannedFramePlan, config)
  const {
    framePlan,
    frameVariants,
    ocrResult,
  } = await runCheapOcrStage(context, config, plannedFramePlan, plannedFrameVariants, deps)
  const evidenceStore = createShortsTrack2V3EvidenceStore(
    collectShortsTrack2V3Evidence(ocrResult),
  )
  const candidateResult = buildShortsTrack2V3Candidates({
    context,
    intent,
    ocrResult,
    evidence: evidenceStore.list(),
    config,
  })
  const escalation = decideShortsTrack2V3Escalation({
    context,
    candidates: candidateResult.candidates,
    evidence: evidenceStore.list(),
    config,
  })
  const ocrBoostResult = {
    status: 'NOT_RUN',
    reason: 'TRACK2_V3_OCR_BOOST_NOT_IMPLEMENTED',
    providerErrors: [],
  }
  const geminiResult = {
    status: 'NOT_RUN',
    reason: 'TRACK2_V3_GEMINI_VISION_NOT_IMPLEMENTED',
    called: false,
    providerErrors: [],
  }
  const fusionResult = fuseShortsTrack2V3Evidence({
    evidence: evidenceStore.list(),
    candidates: candidateResult.candidates,
    ocrBoostResult,
    geminiResult,
  })
  const placesResult = {
    status: 'NOT_RUN',
    reason: 'TRACK2_V3_PLACES_UPGRADE_NOT_IMPLEMENTED',
    called: false,
    queries: [],
    providerErrors: [],
  }
  const providerErrors = [
    ...(Array.isArray(ocrResult.providerErrors) ? ocrResult.providerErrors : []),
    ...(Array.isArray(ocrBoostResult.providerErrors) ? ocrBoostResult.providerErrors : []),
    ...(Array.isArray(geminiResult.providerErrors) ? geminiResult.providerErrors : []),
    ...(Array.isArray(placesResult.providerErrors) ? placesResult.providerErrors : []),
  ]

  return buildShortsTrack2V3Response({
    startedAt,
    context,
    config,
    intent,
    framePlan,
    frameVariants,
    ocrResult,
    evidence: fusionResult.fusedEvidence || evidenceStore.list(),
    candidates: candidateResult.candidates,
    escalation,
    geminiResult,
    placesResult,
    providerErrors,
    debug: {
      liveCheapOcrAdapterRan: Boolean(ocrResult.liveAdapterRan),
      ...(ocrResult.debug || {}),
    },
  })
}

export default {
  runShortsTrack2V3Pipeline,
}
