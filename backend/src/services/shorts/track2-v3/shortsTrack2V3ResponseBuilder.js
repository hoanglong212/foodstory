import { decideShortsTrack2V3Result } from './shortsTrack2V3DecisionService.js'

export function buildShortsTrack2V3Response({
  startedAt = Date.now(),
  context = {},
  config = {},
  intent = {},
  framePlan = {},
  frameVariants = {},
  ocrResult = {},
  evidence = [],
  candidates = [],
  escalation = {},
  geminiResult = {},
  placesResult = {},
  providerErrors = [],
  debug = {},
} = {}) {
  const decision = decideShortsTrack2V3Result({ context, config, intent, evidence, candidates })
  const latencyMs = Math.max(0, Date.now() - startedAt)

  return {
    ...decision,
    candidates,
    evidence,
    providerErrors,
    metrics: {
      frameCount: framePlan.plannedFrameCount ?? 0,
      ocrImageCount: frameVariants.variantCount ?? 0,
      ocrTextBlockCount: Array.isArray(ocrResult.textBlocks) ? ocrResult.textBlocks.length : 0,
      evidenceCount: evidence.length,
      candidateCount: candidates.length,
      escalationLevel: escalation.escalationLevel || 'SKELETON',
      geminiCalled: Boolean(geminiResult.called),
      placesCalled: Boolean(placesResult.called),
      latencyMs,
    },
    debug: {
      intentSignals: Array.isArray(intent.signals) ? intent.signals : [],
      bestOcrSnippets: [],
      placesQueries: [],
      ...debug,
    },
  }
}
