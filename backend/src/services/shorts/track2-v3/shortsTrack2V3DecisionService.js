function firstCandidateType(candidates = [], type) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => candidate?.type === type)
}

function candidateHasRisk(candidates = [], riskFlag) {
  return (Array.isArray(candidates) ? candidates : []).some((candidate) =>
    Array.isArray(candidate?.riskFlags) && candidate.riskFlags.includes(riskFlag),
  )
}

function candidateReason({ candidates = [], intent = {} } = {}) {
  if (intent.mustNotResolve && firstCandidateType(candidates, 'MULTI_PLACE_REVIEW')) {
    return 'MULTI_PLACE_REVIEW_ONLY'
  }
  if (firstCandidateType(candidates, 'OCR_PLACE_PLUS_PARTIAL_ADDRESS')) {
    return 'OCR_PLACE_PLUS_PARTIAL_ADDRESS'
  }
  if (candidateHasRisk(candidates, 'NOISY_OCR')) {
    return 'OCR_NOISY_ADDRESS_CANDIDATE'
  }
  if (intent.mustNotResolve) {
    return 'MULTI_PLACE_REVIEW_ONLY'
  }
  return 'TRACK2_V3_CHEAP_OCR_CANDIDATES'
}

export function decideShortsTrack2V3Result({
  intent = {},
  candidates = [],
  providerErrors = [],
} = {}) {
  const candidateCount = Array.isArray(candidates) ? candidates.length : 0
  const mustNotResolve = Boolean(intent.mustNotResolve)
  const hasProviderErrors = Array.isArray(providerErrors) && providerErrors.length > 0

  let resolution = 'UNRESOLVED'
  let reason = hasProviderErrors
    ? 'TRACK2_V3_PROVIDER_UNAVAILABLE'
    : 'TRACK2_V3_NO_USEFUL_VISUAL_EVIDENCE'

  if (candidateCount > 0) {
    resolution = mustNotResolve ? 'NEEDS_REVIEW' : 'CANDIDATES'
    reason = candidateReason({ candidates, intent })
  }

  return {
    track: 'TRACK_2_V3',
    resolution,
    reason,
    intent: intent.intent || 'UNKNOWN',
    mustNotResolve,
    intentReason: intent.reason || 'NO_STRONG_INTENT_SIGNAL',
    resolvedPlace: null,
  }
}
