import { decideShortsTrack2V3Result } from './shortsTrack2V3DecisionService.js'

function ocrSnippet(evidence = {}) {
  const text = String(evidence.rawText || evidence.normalizedText || '')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!text) return null
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function bestOcrSnippets(evidence = []) {
  return (Array.isArray(evidence) ? evidence : [])
    .map(ocrSnippet)
    .filter(Boolean)
    .slice(0, 5)
}

function metricNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

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
  const decision = decideShortsTrack2V3Result({
    context,
    config,
    intent,
    evidence,
    candidates,
    providerErrors,
  })
  const latencyMs = Math.max(0, Date.now() - startedAt)
  const ocrMetrics = ocrResult.metrics || {}
  const frameCount = ocrMetrics.frameCount ??
    framePlan.frameCount ??
    (Array.isArray(framePlan.frames) ? framePlan.frames.length : framePlan.plannedFrameCount)
  const ocrImageCount = ocrMetrics.ocrImageCount ??
    ocrResult.imageCount ??
    frameVariants.variantCount ??
    (Array.isArray(frameVariants.variants) ? frameVariants.variants.length : 0)
  const ocrTextBlockCount = ocrMetrics.ocrTextBlockCount ??
    (Array.isArray(ocrResult.textBlocks) ? ocrResult.textBlocks.length : 0)

  return {
    ...decision,
    candidates,
    evidence,
    providerErrors,
    metrics: {
      frameCount: metricNumber(frameCount),
      ocrImageCount: metricNumber(ocrImageCount),
      ocrTextBlockCount: metricNumber(ocrTextBlockCount),
      evidenceCount: evidence.length,
      candidateCount: candidates.length,
      escalationLevel: escalation.escalationLevel || 'SKELETON',
      geminiCalled: Boolean(geminiResult.called),
      placesCalled: Boolean(placesResult.called),
      latencyMs,
    },
    debug: {
      intentSignals: Array.isArray(intent.signals) ? intent.signals : [],
      bestOcrSnippets: bestOcrSnippets(evidence),
      placesQueries: Array.isArray(placesResult.queries) ? placesResult.queries : [],
      ...debug,
    },
  }
}
