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
import { runShortsTrack2V3OcrBoost } from './shortsTrack2V3OcrBoostService.js'
import { applyShortsTrack2V3CandidateQualityGate } from './shortsTrack2V3CandidateQualityGateService.js'
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
  if (config.track2V3GoogleVisionEnabled !== true) return false
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

function mergeTextBlocks(...groups) {
  const seen = new Set()
  const merged = []

  for (const blocks of groups) {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      const key = [
        block.provider || block.source || '',
        block.sourceType || '',
        block.imageVariant || '',
        block.frameIndex ?? '',
        block.timestampSeconds ?? '',
        block.rawText || block.text || '',
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(block)
    }
  }

  return merged
}

function mergeCandidates(...groups) {
  const seen = new Set()
  const merged = []

  for (const candidates of groups) {
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const key = [
        candidate.type || '',
        candidate.displayText || '',
        candidate.addressFragment || '',
        candidate.placeName || '',
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(candidate)
    }
  }

  return merged
}

function snippetFromBlock(block = {}) {
  const text = String(block.normalizedText || block.rawText || block.text || '')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!text) return null
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function bestOcrSnippetsFromBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .map(snippetFromBlock)
    .filter(Boolean)
    .slice(0, 8)
}

function summarizeFramePlan(framePlan = {}) {
  const plannedFrames = Array.isArray(framePlan.plannedFrames)
    ? framePlan.plannedFrames
    : []
  const frames = Array.isArray(framePlan.frames) ? framePlan.frames : []

  return {
    stage: framePlan.stage || null,
    plannedFrameCount: framePlan.plannedFrameCount ?? plannedFrames.length,
    frameCount: framePlan.frameCount ?? frames.length,
    durationSeconds: framePlan.durationSeconds ?? null,
    plannedFrames: plannedFrames.map((frame) => ({
      frameIndex: frame.frameIndex,
      label: frame.label,
      timestampSeconds: frame.timestampSeconds,
      relativePosition: frame.relativePosition,
    })),
    frames: frames.map((frame) => ({
      frameIndex: frame.frameIndex,
      label: frame.label,
      timestampSeconds: frame.timestampSeconds,
      relativePosition: frame.relativePosition,
    })),
  }
}

function summarizeVariants(frameVariants = {}) {
  return (Array.isArray(frameVariants.variants) ? frameVariants.variants : [])
    .map((variant) => ({
      id: variant.id,
      frameIndex: variant.frameIndex,
      label: variant.label,
      timestampSeconds: variant.timestampSeconds,
      relativePosition: variant.relativePosition,
      variant: variant.variant,
      sourceType: variant.sourceType,
    }))
}

function mergedOcrMetrics(
  ocrResult = {},
  ocrBoostResult = {},
  mergedTextBlocks = [],
  framePlan = {},
  frameVariants = {},
) {
  const cheapMetrics = ocrResult.metrics || {}
  const boostMetrics = ocrBoostResult.metrics || {}
  const boostRan = Boolean(ocrBoostResult.ocrBoostRan)

  return {
    frameCount: boostRan
      ? Number(boostMetrics.frameCount || 0)
      : Number(
        cheapMetrics.frameCount ??
          framePlan.frameCount ??
          (Array.isArray(framePlan.frames) ? framePlan.frames.length : framePlan.plannedFrameCount) ??
          0,
      ),
    ocrImageCount: boostRan
      ? Number(boostMetrics.ocrImageCount || ocrBoostResult.imageCount || 0)
      : Number(
        cheapMetrics.ocrImageCount ??
          ocrResult.imageCount ??
          frameVariants.variantCount ??
          (Array.isArray(frameVariants.variants) ? frameVariants.variants.length : 0),
      ),
    cropImageCount: boostRan
      ? Number(boostMetrics.cropImageCount || 0)
      : Number(cheapMetrics.cropImageCount ?? frameVariants.cropImageCount ?? 0),
    ocrTextBlockCount: mergedTextBlocks.length,
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
    ocrResult,
    config,
  })
  const ocrBoostResult = await runShortsTrack2V3OcrBoost({
    context,
    config,
    deps,
    evidence: evidenceStore.list(),
    candidates: candidateResult.candidates,
    ocrResult,
    escalation,
  })
  const mergedTextBlocks = mergeTextBlocks(
    ocrResult.textBlocks,
    ocrBoostResult.textBlocks,
  )
  const mergedOcrResult = {
    ...ocrResult,
    status: mergedTextBlocks.length ? 'OK' : ocrResult.status,
    reason: mergedTextBlocks.length ? 'OCR_TEXT_COLLECTED' : ocrResult.reason,
    textBlocks: mergedTextBlocks,
    imageCount: ocrBoostResult.ocrBoostRan
      ? ocrBoostResult.imageCount
      : ocrResult.imageCount,
    metrics: mergedOcrMetrics(ocrResult, ocrBoostResult, mergedTextBlocks, framePlan, frameVariants),
    ocrBoostRan: Boolean(ocrBoostResult.ocrBoostRan),
  }
  const mergedEvidenceStore = createShortsTrack2V3EvidenceStore(
    collectShortsTrack2V3Evidence(mergedOcrResult),
  )
  const geminiResult = {
    status: 'NOT_RUN',
    reason: 'TRACK2_V3_GEMINI_VISION_NOT_IMPLEMENTED',
    called: false,
    providerErrors: [],
  }
  const fusionResult = fuseShortsTrack2V3Evidence({
    evidence: mergedEvidenceStore.list(),
    candidates: candidateResult.candidates,
    ocrBoostResult,
    geminiResult,
  })
  const boostedCandidateResult = buildShortsTrack2V3Candidates({
    context,
    intent,
    ocrResult: mergedOcrResult,
    evidence: fusionResult.fusedEvidence || mergedEvidenceStore.list(),
    config,
  })
  const finalCandidates = mergeCandidates(
    candidateResult.candidates,
    boostedCandidateResult.candidates,
  )
  const candidateQualityGate = applyShortsTrack2V3CandidateQualityGate({
    context,
    intent,
    evidence: fusionResult.fusedEvidence || mergedEvidenceStore.list(),
    candidates: finalCandidates,
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
    framePlan: ocrBoostResult.ocrBoostRan ? ocrBoostResult.framePlan || framePlan : framePlan,
    frameVariants: ocrBoostResult.ocrBoostRan
      ? ocrBoostResult.frameVariants || frameVariants
      : frameVariants,
    ocrResult: mergedOcrResult,
    evidence: fusionResult.fusedEvidence || evidenceStore.list(),
    candidates: candidateQualityGate.candidates,
    escalation,
    geminiResult,
    placesResult,
    providerErrors,
    debug: {
      ...(ocrResult.debug || {}),
      ...(ocrBoostResult.debug || {}),
      liveCheapOcrAdapterRan: Boolean(ocrResult.liveAdapterRan),
      ocrBoostRan: Boolean(ocrBoostResult.ocrBoostRan),
      ocrBoostReason: ocrBoostResult.ocrBoostReason || escalation.ocrBoostReason || null,
      candidateCountBeforeBoost: candidateResult.candidateCount,
      candidateCountAfterBoost: finalCandidates.length,
      candidateQualityGateRan: candidateQualityGate.candidateQualityGateRan,
      rawCandidateCount: candidateQualityGate.rawCandidateCount,
      keptCandidateCount: candidateQualityGate.keptCandidateCount,
      droppedCandidateCount: candidateQualityGate.droppedCandidateCount,
      weakCandidateCount: candidateQualityGate.weakCandidateCount,
      addressAnchoredCandidateCount: candidateQualityGate.addressAnchoredCandidateCount,
      keptCandidateReasons: candidateQualityGate.keptCandidateReasons,
      droppedCandidateReasons: candidateQualityGate.droppedCandidateReasons,
      droppedCandidates: candidateQualityGate.droppedCandidates,
      cheapBestOcrSnippets: bestOcrSnippetsFromBlocks(ocrResult.textBlocks),
      boostBestOcrSnippets: bestOcrSnippetsFromBlocks(ocrBoostResult.textBlocks),
      bestOcrSnippets: bestOcrSnippetsFromBlocks(mergedTextBlocks),
      framePlan: {
        cheap: summarizeFramePlan(framePlan),
        boost: ocrBoostResult.framePlan ? summarizeFramePlan(ocrBoostResult.framePlan) : null,
      },
      ocrVariants: {
        cheap: summarizeVariants(frameVariants),
        boost: ocrBoostResult.frameVariants ? summarizeVariants(ocrBoostResult.frameVariants) : [],
      },
      fusion: {
        status: fusionResult.status,
        fusedEvidenceCount: fusionResult.fusedEvidenceCount || 0,
        clusters: fusionResult.fusionClusters || [],
      },
    },
  })
}

export default {
  runShortsTrack2V3Pipeline,
}
