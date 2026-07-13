function realPlace(candidate = {}) {
  return Boolean(candidate?.id && candidate?.name && candidate?.formattedAddress)
}

function uniquePlaces(values = []) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).filter(realPlace).filter((place) => {
    if (seen.has(place.id)) return false
    seen.add(place.id)
    return true
  }).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)).slice(0, 8)
}

/** Makes a public product decision from resolver-backed records only. */
export function decideVisionAutoResult({ placeCandidates = [], resolution = {}, sourceContext = {} } = {}) {
  const places = uniquePlaces(placeCandidates)
  const isMultiPlace = sourceContext?.isMultiPlace === true
  if (isMultiPlace) {
    if (places.length >= 2) return { status: 'multi_place', places, sourceContext: { isMultiPlace: true, resolvedCount: places.length }, reason: null }
    if (places.length === 1) return {
      status: places[0].sourceType === 'foodstory' ? 'matched_place' : 'external_place_found',
      place: places[0],
      sourceContext: { isMultiPlace: true, resolvedCount: 1 },
      reason: null,
    }
    return { status: 'not_found', places: [], sourceContext: { isMultiPlace: true, resolvedCount: 0 }, reason: 'multi_place_unresolved' }
  }
  if (!places.length) {
    return { status: 'not_found', places: [], sourceContext: { isMultiPlace: false, resolvedCount: 0 }, reason: resolution?.reason === 'provider_unavailable' ? 'provider_unavailable' : 'no_resolver_match' }
  }
  const first = places[0]
  if (first.sourceType === 'foodstory' || first.source === 'food_map_local') return { status: 'matched_place', place: first, sourceContext: { isMultiPlace: false, resolvedCount: 1 }, reason: null }
  return { status: 'external_place_found', place: first, sourceContext: { isMultiPlace: false, resolvedCount: 1 }, reason: null }
}
