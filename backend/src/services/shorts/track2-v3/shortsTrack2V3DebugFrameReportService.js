function safeString(value, maxLength = 20000) {
  if (value == null) return ''
  return String(value).trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeProviderError(error = {}) {
  if (!error || typeof error !== 'object') return null
  const sanitized = {}

  for (const [key, value] of Object.entries(error)) {
    if (/key|secret|token|credential|password/iu.test(key)) continue
    if (value === undefined) continue
    if (typeof value === 'string') sanitized[key] = safeString(value, 600)
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => safeString(item, 160)).slice(0, 12)
    }
  }

  return sanitized
}

function normalizeFrame(frame = {}, stage = 'cheap') {
  return {
    stage,
    frameIndex: finiteNumber(frame.frameIndex, null),
    timestampSeconds: finiteNumber(frame.timestampSeconds, null),
    label: frame.label || null,
    path: safeString(frame.savedPath || frame.path || frame.imagePath, 1000) || null,
    sizeBytes: finiteNumber(frame.sizeBytes, 0),
  }
}

function normalizeVariant(variant = {}, stage = 'cheap') {
  return {
    stage,
    frameIndex: finiteNumber(variant.frameIndex, null),
    timestampSeconds: finiteNumber(variant.timestampSeconds, null),
    variant: safeString(variant.variant || variant.imageVariant || 'unknown', 120),
    sourceType: safeString(variant.sourceType || 'unknown', 120),
    path: safeString(variant.savedPath || variant.path || variant.imagePath, 1000) || null,
    sizeBytes: finiteNumber(variant.sizeBytes, 0),
  }
}

function normalizeOcrBlock(block = {}, stage = 'cheap') {
  return {
    stage,
    frameIndex: finiteNumber(block.frameIndex, null),
    timestampSeconds: finiteNumber(block.timestampSeconds, null),
    variant: safeString(block.imageVariant || block.variant || 'unknown', 120),
    sourceType: safeString(block.sourceType || 'unknown', 120),
    rawText: safeString(block.rawText || block.text || '', 20000),
    normalizedText: safeString(block.normalizedText || block.rawText || block.text || '', 20000),
  }
}

function summarizeCandidate(candidate = {}) {
  return {
    id: safeString(candidate.id, 160) || null,
    type: safeString(candidate.type, 160) || null,
    displayText: safeString(candidate.displayText || candidate.addressFragment || candidate.placeName, 1000),
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags.map((flag) => safeString(flag, 120)) : [],
    canAutoResolve: Boolean(candidate.canAutoResolve),
    qualityTier: safeString(candidate.qualityTier, 80) || null,
  }
}

function summarizeDroppedCandidate(candidate = {}) {
  return {
    id: safeString(candidate.id, 160) || null,
    type: safeString(candidate.type, 160) || null,
    reason: safeString(candidate.reason, 160) || null,
    displayText: safeString(candidate.displayText, 500),
  }
}

function resultMetric(result = {}, key, fallback = 0) {
  return finiteNumber(result.metrics?.[key], fallback)
}

export function buildShortsTrack2V3DebugFrameReport({
  url = '',
  videoId = '',
  duration = null,
  result = {},
  cheapLiveResult = {},
  boostLiveResult = {},
  outputDir = '',
} = {}) {
  const cheapFrames = Array.isArray(cheapLiveResult.frames) ? cheapLiveResult.frames : []
  const boostFrames = Array.isArray(boostLiveResult.frames) ? boostLiveResult.frames : []
  const cheapVariants = Array.isArray(cheapLiveResult.ocrImages) ? cheapLiveResult.ocrImages : []
  const boostVariants = Array.isArray(boostLiveResult.ocrImages) ? boostLiveResult.ocrImages : []
  const cheapBlocks = Array.isArray(cheapLiveResult.ocrTextBlocks) ? cheapLiveResult.ocrTextBlocks : []
  const boostBlocks = Array.isArray(boostLiveResult.ocrTextBlocks) ? boostLiveResult.ocrTextBlocks : []

  return {
    url: safeString(url, 2000),
    videoId: safeString(videoId, 200) || null,
    duration: duration ?? null,
    outputDir: safeString(outputDir, 1000) || null,
    cheapFramePlan: result.debug?.framePlan?.cheap || null,
    boostFramePlan: result.debug?.framePlan?.boost || null,
    extractedFrames: [
      ...cheapFrames.map((frame) => normalizeFrame(frame, 'cheap')),
      ...boostFrames.map((frame) => normalizeFrame(frame, 'boost')),
    ],
    ocrImageVariants: [
      ...cheapVariants.map((variant) => normalizeVariant(variant, 'cheap')),
      ...boostVariants.map((variant) => normalizeVariant(variant, 'boost')),
    ],
    ocrTextBlocks: [
      ...cheapBlocks.map((block) => normalizeOcrBlock(block, 'cheap')),
      ...boostBlocks.map((block) => normalizeOcrBlock(block, 'boost')),
    ],
    bestOcrSnippets: Array.isArray(result.debug?.bestOcrSnippets)
      ? result.debug.bestOcrSnippets.map((snippet) => safeString(snippet, 240))
      : [],
    candidates: Array.isArray(result.candidates) ? result.candidates.map(summarizeCandidate) : [],
    droppedCandidates: Array.isArray(result.debug?.droppedCandidates)
      ? result.debug.droppedCandidates.map(summarizeDroppedCandidate)
      : [],
    droppedCandidateReasons: result.debug?.droppedCandidateReasons || {},
    providerErrors: Array.isArray(result.providerErrors)
      ? result.providerErrors.map(sanitizeProviderError).filter(Boolean)
      : [],
    metrics: {
      frameCount: resultMetric(result, 'frameCount'),
      ocrImageCount: resultMetric(result, 'ocrImageCount'),
      cropImageCount: resultMetric(result, 'cropImageCount'),
      ocrTextBlockCount: resultMetric(result, 'ocrTextBlockCount'),
      evidenceCount: resultMetric(result, 'evidenceCount'),
      candidateCount: resultMetric(result, 'candidateCount'),
      rawCandidateCount: resultMetric(result, 'rawCandidateCount'),
      keptCandidateCount: resultMetric(result, 'keptCandidateCount'),
      droppedCandidateCount: resultMetric(result, 'droppedCandidateCount'),
      weakCandidateCount: resultMetric(result, 'weakCandidateCount'),
      addressAnchoredCandidateCount: resultMetric(result, 'addressAnchoredCandidateCount'),
      candidateQualityGateRan: Boolean(result.metrics?.candidateQualityGateRan),
      escalationLevel: safeString(result.metrics?.escalationLevel, 80) || null,
      geminiCalled: Boolean(result.metrics?.geminiCalled),
      placesCalled: Boolean(result.metrics?.placesCalled),
    },
    liveCheapOcrAdapterRan: Boolean(result.debug?.liveCheapOcrAdapterRan),
    ocrBoostRan: Boolean(result.debug?.ocrBoostRan || result.metrics?.ocrBoostRan),
    ocrBoostReason: safeString(result.debug?.ocrBoostReason, 200) || null,
  }
}

export default {
  buildShortsTrack2V3DebugFrameReport,
}
