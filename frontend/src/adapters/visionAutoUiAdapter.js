const STATUS_TO_STATE = Object.freeze({
  matched_place: 'matched',
  external_place_found: 'external',
  multi_place: 'multi_place',
  review_candidates: 'review',
  not_found: 'not_found',
  error: 'error',
})

function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null }
function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// This is the client-side safety backstop. A legacy OCR candidate has no
// resolver identity and cannot produce a place card here.
function adaptPlace(value) {
  if (!value || typeof value !== 'object') return null
  const sourceType = text(value.sourceType)
  const id = text(value.id)
  const name = text(value.name)
  const address = text(value.formattedAddress)
  if (!id || !name || !address || !['foodstory', 'external'].includes(sourceType)) return null
  const lat = finiteNumber(value.lat)
  const lng = finiteNumber(value.lng)
  if (sourceType === 'external' && (lat === null || lng === null || !text(value.providerPlaceId))) return null
  return {
    id, sourceType, name, address, lat, lng,
    sourceId: text(value.sourceId), provider: text(value.provider), providerPlaceId: text(value.providerPlaceId),
    image: text(value.image), category: text(value.category), rating: finiteNumber(value.rating),
    categories: Array.isArray(value.categories) ? value.categories.map(text).filter(Boolean) : [],
    existsInFoodStory: value.existsInFoodStory === true,
  }
}

function uniquePlaces(values = []) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).map(adaptPlace).filter(Boolean).filter((place) => !seen.has(place.id) && Boolean(seen.add(place.id))).slice(0, 8)
}

function adaptReviewCandidate(value, index) {
  if (!value || typeof value !== 'object') return null
  if (value.sourceType !== 'review_candidate' || value.reviewRequired !== true || value.canAutoResolve !== false) return null
  const address = text(value.address)
  if (!address) return null
  const placeName = text(value.placeName)
  return {
    id: text(value.id) || `review-candidate:${index + 1}`,
    sourceType: 'review_candidate',
    source: 'track2_v3',
    name: placeName || text(value.name) || 'Possible food place',
    placeName,
    address,
    confidence: finiteNumber(value.confidence) || 0,
    timestampSeconds: finiteNumber(value.timestampSeconds),
    lat: null,
    lng: null,
    reviewRequired: true,
    canAutoResolve: false,
  }
}

export function adaptVisionAutoResponse(response = {}) {
  const status = text(response.status)
  const rawState = STATUS_TO_STATE[status] || 'error'
  const matchedPlace = rawState === 'matched' ? adaptPlace(response.place) : null
  const externalPlace = rawState === 'external' ? adaptPlace(response.place) : null
  const possiblePlaces = rawState === 'multi_place' ? uniquePlaces(response.places) : []
  const reviewCandidates = rawState === 'review'
    ? (Array.isArray(response.reviewCandidates) ? response.reviewCandidates : []).map(adaptReviewCandidate).filter(Boolean).slice(0, 8)
    : []
  const state = (rawState === 'matched' && !matchedPlace) || (rawState === 'external' && !externalPlace) || (rawState === 'multi_place' && possiblePlaces.length < 2) || (rawState === 'review' && !reviewCandidates.length) ? 'not_found' : rawState
  const mapTargets = [matchedPlace, externalPlace, ...possiblePlaces].filter((place) => place && place.lat !== null && place.lng !== null)
  return {
    state,
    status,
    source: { inputType: text(response.input?.type), platform: text(response.sourceContext?.platform) },
    sourceContext: { isMultiPlace: response.sourceContext?.isMultiPlace === true, resolvedCount: finiteNumber(response.sourceContext?.resolvedCount) || 0 },
    matchedPlace,
    externalPlace,
    primaryCandidate: matchedPlace || externalPlace || possiblePlaces[0] || null,
    possiblePlaces,
    reviewCandidates,
    candidates: state === 'review' ? reviewCandidates : possiblePlaces,
    mapTargets,
    reason: text(response.reason),
    warnings: [],
  }
}

export { finiteNumber }
