const VISION_AUTO_STATUSES = new Set(['matched_place', 'external_place_found', 'multi_place', 'review_candidates', 'not_found', 'error'])

function text(value, max = 320) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function publicPlace(value = {}) {
  const sourceType = value?.sourceType === 'foodstory' || value?.source === 'food_map_local'
    ? 'foodstory'
    : value?.sourceType === 'external' || value?.sourceType === 'external_place'
      ? 'external'
      : null
  const name = text(value?.name, 180)
  const formattedAddress = text(value?.formattedAddress, 320)
  const id = text(value?.id, 255)
  const lat = finite(value?.lat)
  const lng = finite(value?.lng)
  if (!sourceType || !id || !name || !formattedAddress) return null
  if (sourceType === 'foodstory') return {
    sourceType,
    id,
    sourceId: text(value?.sourceId, 120),
    name,
    formattedAddress,
    lat,
    lng,
    image: text(value?.image, 1000),
    category: text(value?.category, 100),
    rating: finite(value?.rating),
    existsInFoodStory: true,
  }
  const providerPlaceId = text(value?.providerPlaceId || value?.placeId || value?.sourceId, 255)
  if (!providerPlaceId || lat === null || lng === null) return null
  return {
    sourceType,
    provider: 'geoapify',
    providerPlaceId,
    id,
    name,
    formattedAddress,
    lat,
    lng,
    categories: Array.isArray(value?.categories) ? value.categories.map((item) => text(item, 80)).filter(Boolean).slice(0, 8) : [],
    existsInFoodStory: false,
  }
}

function confidence(value) {
  const number = finite(value)
  return number === null ? 0 : Math.round(Math.max(0, Math.min(1, number)) * 1000) / 1000
}

function publicReviewCandidate(value = {}, index = 0) {
  const address = text(value?.address || value?.addressFragment || value?.displayText, 320)
  if (!address) return null
  const placeName = text(value?.placeName || value?.name, 180)
  const timestampSeconds = finite(value?.timestampSeconds)
  return {
    id: text(value?.id, 255) || `review-candidate:${index + 1}`,
    sourceType: 'review_candidate',
    source: 'track2_v3',
    name: placeName || 'Possible food place',
    placeName,
    address,
    confidence: confidence(value?.confidence),
    timestampSeconds: timestampSeconds === null ? null : Math.round(Math.max(0, timestampSeconds) * 1000) / 1000,
    reviewRequired: true,
    canAutoResolve: false,
  }
}

function publicPlatform(input = {}) {
  const host = String(input?.url || '').toLowerCase()
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube'
  if (host.includes('tiktok')) return 'tiktok'
  if (host.includes('instagram')) return 'instagram'
  if (host.includes('facebook') || host.includes('fb.watch')) return 'facebook'
  return input?.type === 'uploaded_image' ? 'image' : 'link'
}

function safeReason(status, reason) {
  const allowed = status === 'not_found'
    ? new Set(['insufficient_evidence', 'no_resolver_match', 'provider_unavailable', 'analysis_timeout', 'unsupported_source', 'multi_place_unresolved'])
    : status === 'error'
      ? new Set(['source_unavailable', 'request_failed', 'service_failure'])
      : new Set()
  return allowed.has(reason) ? reason : status === 'not_found' ? 'insufficient_evidence' : status === 'error' ? 'service_failure' : null
}

/** Public serialization boundary. Never pass OCR/ASR/evidence/debug through it. */
export function buildVisionAutoResponse({ status, place = null, places = [], reviewCandidates = [], sourceContext = {}, input = {}, reason = null } = {}) {
  const normalizedStatus = VISION_AUTO_STATUSES.has(status) ? status : 'error'
  const safePlace = publicPlace(place)
  const safePlaces = [...new Map((Array.isArray(places) ? places : []).map(publicPlace).filter(Boolean).map((item) => [item.id, item])).values()].slice(0, 8)
  const safeReviewCandidates = [...new Map(
    (Array.isArray(reviewCandidates) ? reviewCandidates : [])
      .map(publicReviewCandidate)
      .filter(Boolean)
      .map((item) => [`${item.address.toLocaleLowerCase('vi')}|${item.placeName || ''}`, item]),
  ).values()].slice(0, 8)
  const context = {
    isMultiPlace: sourceContext?.isMultiPlace === true,
    resolvedCount: Math.max(0, Math.min(8, Number(sourceContext?.resolvedCount) || safePlaces.length || (safePlace ? 1 : 0))),
    platform: publicPlatform(input),
  }
  if (normalizedStatus === 'matched_place' && safePlace?.sourceType === 'foodstory') return { status: normalizedStatus, place: safePlace, sourceContext: context }
  if (normalizedStatus === 'external_place_found' && safePlace?.sourceType === 'external') return { status: normalizedStatus, place: safePlace, sourceContext: context }
  if (normalizedStatus === 'multi_place' && safePlaces.length >= 2) return { status: normalizedStatus, places: safePlaces, sourceContext: { ...context, isMultiPlace: true, resolvedCount: safePlaces.length } }
  if (normalizedStatus === 'review_candidates' && safeReviewCandidates.length) return {
    status: normalizedStatus,
    reviewCandidates: safeReviewCandidates,
    reviewRequired: true,
    sourceContext: { ...context, resolvedCount: 0 },
  }
  if (normalizedStatus === 'not_found') return { status: 'not_found', reason: safeReason('not_found', reason), sourceContext: context, places: [] }
  return { status: 'error', reason: safeReason('error', reason), sourceContext: context }
}

export { VISION_AUTO_STATUSES }
