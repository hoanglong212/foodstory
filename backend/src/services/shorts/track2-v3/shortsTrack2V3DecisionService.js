function firstCandidateType(candidates = [], type) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => candidate?.type === type)
}

function candidateHasRisk(candidates = [], riskFlag) {
  return (Array.isArray(candidates) ? candidates : []).some((candidate) =>
    Array.isArray(candidate?.riskFlags) && candidate.riskFlags.includes(riskFlag),
  )
}

function confirmedMultiPlaceIntent(intent = {}) {
  return Boolean(
    intent.mustNotResolve &&
    (
      intent.intent === 'MULTI_PLACE_OR_LIST' ||
      intent.intent === 'GENERIC_FOOD_LIST' ||
      intent.inputClass === 'MULTI_PLACE_LISTICLE'
    )
  )
}

function candidateReason({ candidates = [], intent = {} } = {}) {
  if (confirmedMultiPlaceIntent(intent)) {
    return 'MULTI_PLACE_REVIEW_ONLY'
  }
  const metadataCandidateCount = candidates.filter((candidate) =>
    candidate?.type === 'METADATA_ADDRESS'
  ).length
  if (metadataCandidateCount > 1) {
    return 'METADATA_MULTI_LOCATION_REVIEW'
  }
  if (metadataCandidateCount === 1) {
    return 'METADATA_ADDRESS_REVIEW'
  }
  if (firstCandidateType(candidates, 'OCR_PLACE_PLUS_PARTIAL_ADDRESS')) {
    return 'OCR_PLACE_PLUS_PARTIAL_ADDRESS'
  }
  if (candidateHasRisk(candidates, 'NOISY_OCR')) {
    return 'OCR_NOISY_ADDRESS_CANDIDATE'
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
  const confirmedMultiPlace = confirmedMultiPlaceIntent(intent)
  const hasProviderErrors = Array.isArray(providerErrors) && providerErrors.length > 0

  let resolution = 'UNRESOLVED'
  let reason = hasProviderErrors
    ? 'TRACK2_V3_PROVIDER_UNAVAILABLE'
    : 'TRACK2_V3_NO_USEFUL_VISUAL_EVIDENCE'

  if (confirmedMultiPlace) {
    resolution = 'NEEDS_REVIEW'
    reason = 'MULTI_PLACE_REVIEW_ONLY'
  } else if (candidateCount > 0) {
    resolution = 'CANDIDATES'
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
