import { getShortsTrack2V3Config } from './shortsTrack2V3Config.js'
import { classifyShortsTrack2V3Intent } from './shortsTrack2V3IntentClassifierService.js'
import { planShortsTrack2V3Frames } from './shortsTrack2V3FramePlannerService.js'
import { buildShortsTrack2V3FrameVariants } from './shortsTrack2V3FrameVariantService.js'
import { runShortsTrack2V3CheapOcr } from './shortsTrack2V3OcrProviderService.js'
import { createShortsTrack2V3EvidenceStore } from './shortsTrack2V3EvidenceStoreService.js'
import { buildShortsTrack2V3Candidates } from './shortsTrack2V3CandidateBuilderService.js'
import { decideShortsTrack2V3Escalation } from './shortsTrack2V3EscalationService.js'
import { runShortsTrack2V3OcrBoost } from './shortsTrack2V3OcrBoostService.js'
import { runShortsTrack2V3GeminiVision } from './shortsTrack2V3GeminiVisionService.js'
import { fuseShortsTrack2V3Evidence } from './shortsTrack2V3EvidenceFusionService.js'
import { runShortsTrack2V3PlacesUpgrade } from './shortsTrack2V3PlacesUpgradeService.js'
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

export async function runShortsTrack2V3Pipeline(input = {}, deps = {}) {
  const startedAt = Date.now()
  const config = deps.track2V3Config || getShortsTrack2V3Config(deps.env || process.env)
  const context = normalizeContext(input)
  const intent = classifyShortsTrack2V3Intent(context, config)
  const framePlan = planShortsTrack2V3Frames(context, config, intent)
  const frameVariants = buildShortsTrack2V3FrameVariants(framePlan, config)
  const ocrResult = await runShortsTrack2V3CheapOcr(frameVariants, config)
  const evidenceStore = createShortsTrack2V3EvidenceStore()
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
  const ocrBoostResult = await runShortsTrack2V3OcrBoost({ context, escalation, config })
  const geminiResult = await runShortsTrack2V3GeminiVision({ context, escalation, config })
  const fusionResult = fuseShortsTrack2V3Evidence({
    evidence: evidenceStore.list(),
    candidates: candidateResult.candidates,
    ocrBoostResult,
    geminiResult,
  })
  const placesResult = await runShortsTrack2V3PlacesUpgrade({
    context,
    candidates: fusionResult.candidates,
    escalation,
    config,
  })
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
  })
}

export default {
  runShortsTrack2V3Pipeline,
}
