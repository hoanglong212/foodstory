const STATUSES = new Set([
  'matched_place',
  'draft_candidate',
  'multi_candidate',
  'unresolved_best_effort',
])

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function capText(value, maximumLength = 300) {
  const text = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, maximumLength)
}

function safeUrl(value) {
  const text = capText(value, 2_000)
  if (!text) return null
  try {
    const parsed = new URL(text)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/(?:api[_-]?key|token|secret|signature|credential|authorization)/i.test(key)) {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.href.slice(0, 2_000)
  } catch {
    return null
  }
}

function safeSource(value) {
  const text = capText(value, 160)
  if (!/^https?:\/\//i.test(text)) return text
  const sanitized = safeUrl(text)
  if (!sanitized) return 'public_url'
  try {
    const parsed = new URL(sanitized)
    return `${parsed.origin}${parsed.pathname}`.slice(0, 160)
  } catch {
    return 'public_url'
  }
}

function warningCodes(values) {
  return uniqueText(values, 16, 100).map((value) =>
    /^[a-z0-9_]{2,100}$/.test(value)
      ? value
      : 'vision_auto_warning',
  )
}

function uniqueText(values, maximumItems, maximumLength) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const text = capText(value, maximumLength)
    const key = text.toLocaleLowerCase('vi')
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= maximumItems) break
  }
  return result
}

function publicNamedEntity(entity = null) {
  return {
    value: entity?.value ? capText(entity.value, 260) : null,
    confidence: roundScore(entity?.confidence),
    source: entity?.source ? capText(entity.source, 40) : null,
    evidence: uniqueText(
      Array.isArray(entity?.evidence)
        ? entity.evidence
        : entity?.evidence
          ? [entity.evidence]
          : [],
      4,
      220,
    ),
    ...(entity?.reviewRequired === true ? { reviewRequired: true } : {}),
  }
}

function publicArrayEntities(items = [], { includeType = false } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item?.value) return null
      return {
        value: capText(item.value, 120),
        confidence: roundScore(item.confidence),
        source: item.source ? capText(item.source, 40) : null,
        evidence: uniqueText(
          Array.isArray(item.evidence)
            ? item.evidence
            : item.evidence
              ? [item.evidence]
              : [],
          3,
          220,
        ),
        ...(includeType && item.type
          ? { type: capText(item.type, 30) }
          : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 8)
}

function publicMetadata(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      type: capText(item?.type, 40),
      text: capText(item?.text, 500),
      confidence: roundScore(item?.confidence),
      source: safeSource(item?.source || 'unknown'),
    }))
    .filter((item) => item.type && item.text)
    .slice(0, 20)
}

function publicFrameEvidence(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const text = capText(item?.text, 220)
      if (!text) return null
      const timestamps = (Array.isArray(item?.timestamps)
        ? item.timestamps
        : [item?.timestampSeconds]
      )
        .map(Number)
        .filter(Number.isFinite)
        .map((value) => Math.round(value * 1000) / 1000)
        .slice(0, 8)
      return {
        source: 'youtube_frame_ocr',
        timestampSeconds: timestamps[0] ?? null,
        timestamps,
        textLines: [
          {
            text,
            confidence: roundScore(item?.confidence),
            type: capText(item?.type || 'other', 30),
          },
        ],
        confidence: roundScore(item?.confidence),
        selectedLineType: capText(item?.type || 'other', 30),
        supportCount: Math.max(
          1,
          Math.min(8, Math.round(Number(item?.supportCount) || 1)),
        ),
        warningCodes: warningCodes(item?.warnings || []).slice(0, 4),
      }
    })
    .filter(Boolean)
    .slice(0, 16)
}

function publicCandidate(candidate = null) {
  if (!candidate || typeof candidate !== 'object') return null
  return {
    name: candidate.name ? capText(candidate.name, 180) : null,
    formattedAddress: candidate.formattedAddress
      ? capText(candidate.formattedAddress, 300)
      : null,
    phone: candidate.phone ? capText(candidate.phone, 40) : null,
    lat: Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
    lng: Number.isFinite(Number(candidate.lng)) ? Number(candidate.lng) : null,
    placeId: candidate.placeId ? capText(candidate.placeId, 255) : null,
    source: candidate.source ? capText(candidate.source, 40) : null,
    confidence: roundScore(candidate.confidence),
    matchReasons: uniqueText(candidate.matchReasons, 8, 80),
  }
}

function publicDraft(draft = null) {
  if (!draft || typeof draft !== 'object') return null
  return {
    name: draft.name ? capText(draft.name, 180) : null,
    address: draft.address ? capText(draft.address, 300) : null,
    phone: draft.phone ? capText(draft.phone, 40) : null,
    dishNames: uniqueText(draft.dishNames, 8, 100),
    locationHints: uniqueText(draft.locationHints, 8, 100),
    sourceUrl: safeUrl(draft.sourceUrl),
    confidence: roundScore(draft.confidence),
    reviewRequired: true,
  }
}

function publicAddressCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const placeName = item?.placeName ? capText(item.placeName, 180) : null
      const dishHint = item?.dishHint ? capText(item.dishHint, 100) : null
      const locationHint = item?.locationHint
        ? capText(item.locationHint, 100)
        : null
      return {
        address: item?.address ? capText(item.address, 300) : null,
        confidence: roundScore(item?.confidence),
        source: item?.source ? capText(item.source, 40) : null,
        timestampSeconds: Number.isFinite(Number(item?.timestampSeconds))
          ? Math.round(Number(item.timestampSeconds) * 1000) / 1000
          : null,
        evidence: uniqueText(item?.evidence, 3, 220),
        ...(placeName ? { placeName } : {}),
        ...(dishHint ? { dishHint } : {}),
        ...(locationHint ? { locationHint } : {}),
        reviewRequired: true,
      }
    })
    .filter(
      (item) =>
        item.address &&
        item.source &&
        Number.isFinite(Number(item.timestampSeconds)),
    )
    .slice(0, 8)
}

function publicDebugDetails(debug = {}) {
  const attemptedTimestamps = (Array.isArray(debug.frameOcrAttemptedTimestamps)
    ? debug.frameOcrAttemptedTimestamps
    : []
  )
    .map(Number)
    .filter(Number.isFinite)
    .map((value) => Math.round(value * 1000) / 1000)
    .slice(0, 60)
  return {
    ...(debug.frameScanMode
      ? { frameScanMode: capText(debug.frameScanMode, 30) }
      : {}),
    ...(Number.isFinite(Number(debug.frameDurationSeconds))
      ? { frameDurationSeconds: Number(debug.frameDurationSeconds) }
      : {}),
    ...(Number.isFinite(Number(debug.frameCount))
      ? { frameCount: Math.max(0, Math.min(60, Number(debug.frameCount))) }
      : {}),
    ...(attemptedTimestamps.length
      ? { frameOcrAttemptedTimestamps: attemptedTimestamps }
      : {}),
    ...(debug.geminiOcrRepairStatus
      ? {
          geminiOcrRepairStatus: capText(
            debug.geminiOcrRepairStatus,
            60,
          ),
        }
      : {}),
    ...(debug.errorName ? { errorName: capText(debug.errorName, 80) } : {}),
    ...(debug.errorCode ? { errorCode: capText(debug.errorCode, 80) } : {}),
  }
}

export function buildVisionAutoResponse({
  status,
  confidence = 0,
  input,
  normalizedEvidence = {},
  entities = {},
  placeCandidates = [],
  candidates = [],
  bestResult = null,
  addPlaceDraft = null,
  reason = '',
  steps = [],
  warnings = [],
  debugLevel = 'summary',
  debug = {},
} = {}) {
  if (!STATUSES.has(status)) {
    throw new Error(`Unsupported Vision Auto status: ${status}`)
  }

  const publicWarnings = [...new Set(warningCodes(warnings))].slice(0, 16)
  return {
    status,
    confidence: roundScore(confidence),
    input: {
      type: input?.type || 'uploaded_image',
      url: safeUrl(input?.url),
    },
    evidenceSummary: {
      metadata: publicMetadata(normalizedEvidence.metadata),
      ocrLines: uniqueText(normalizedEvidence.ocrLines, 20, 220),
      frameEvidence: publicFrameEvidence(normalizedEvidence.frameEvidence),
      frameTexts: uniqueText(normalizedEvidence.frameTexts, 12, 220),
      audioTexts: uniqueText(normalizedEvidence.audioTexts, 12, 220),
      warnings: publicWarnings,
    },
    entities: {
      placeName: publicNamedEntity(entities.placeName),
      address: publicNamedEntity(entities.address),
      phones: publicArrayEntities(entities.phones),
      dishNames: publicArrayEntities(entities.dishNames),
      locationHints: publicArrayEntities(entities.locationHints, {
        includeType: true,
      }),
    },
    placeCandidates: (Array.isArray(placeCandidates) ? placeCandidates : [])
      .map(publicCandidate)
      .filter(Boolean)
      .slice(0, 5),
    bestResult: publicCandidate(bestResult),
    addPlaceDraft: publicDraft(addPlaceDraft),
    ...(status === 'multi_candidate'
      ? {
          candidates: publicAddressCandidates(candidates),
          reviewRequired: true,
        }
      : {}),
    reason: capText(reason, 500),
    debug: {
      steps:
        debugLevel === 'none' ? [] : uniqueText(steps, 24, 80),
      warnings:
        debugLevel === 'none' ? [] : publicWarnings,
      ...(debugLevel === 'none' ? {} : publicDebugDetails(debug)),
    },
  }
}

export { STATUSES as VISION_AUTO_STATUSES }
