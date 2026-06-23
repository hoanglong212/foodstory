const DEFAULT_TIMEOUT_MS = 6_000
const DEFAULT_MAX_CANDIDATES = 5
const GOOGLE_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText'

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value) {
  return new Set(normalizeText(value).split(' ').filter(Boolean))
}

function similarity(left, right) {
  const leftText = normalizeText(left)
  const rightText = normalizeText(right)
  if (!leftText || !rightText) return 0
  if (leftText === rightText) return 1
  if (leftText.includes(rightText) || rightText.includes(leftText)) return 0.88
  const leftTokens = tokens(leftText)
  const rightTokens = tokens(rightText)
  const union = new Set([...leftTokens, ...rightTokens])
  if (!union.size) return 0
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return shared / union.size
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function configuredProvider(value = process.env.LOCATION_RESOLUTION_PROVIDER) {
  const provider = String(value || 'disabled').trim().toLowerCase()
  return provider === 'google' ? 'google' : 'disabled'
}

function emptyResolution(status, reason, warnings = []) {
  return {
    status,
    resolvedLocation: null,
    candidates: [],
    confidence: 0,
    reason,
    warnings,
  }
}

function googleCandidate(place) {
  return {
    name: place?.displayName?.text || place?.name || null,
    formattedAddress: place?.formattedAddress || null,
    phone:
      place?.nationalPhoneNumber ||
      place?.internationalPhoneNumber ||
      null,
    lat: Number.isFinite(Number(place?.location?.latitude))
      ? Number(place.location.latitude)
      : null,
    lng: Number.isFinite(Number(place?.location?.longitude))
      ? Number(place.location.longitude)
      : null,
    placeId: place?.id || null,
    rating: Number.isFinite(Number(place?.rating))
      ? Number(place.rating)
      : null,
    userRatingsTotal: Number.isFinite(Number(place?.userRatingCount))
      ? Number(place.userRatingCount)
      : null,
    source: 'google',
    rawTypes: Array.isArray(place?.types) ? place.types.slice(0, 20) : [],
  }
}

function rankCandidate(candidate, { locationQuery, entities, userLocation }) {
  const components = locationQuery?.components || {}
  const matchReasons = []
  const placeNameScore = similarity(components.placeName, candidate.name)
  const addressScore = similarity(
    components.address,
    candidate.formattedAddress,
  )
  const locationScore = Math.max(
    0,
    ...(components.locationHints || []).map((hint) =>
      similarity(hint, candidate.formattedAddress),
    ),
  )
  const phone = normalizePhone(candidate.phone)
  const phoneMatch = (components.phones || []).some(
    (value) => normalizePhone(value) && normalizePhone(value) === phone,
  )
  const dishSupport = (components.dishNames || []).some((dish) =>
    (candidate.rawTypes || []).some((type) =>
      normalizeText(type).includes(normalizeText(dish)),
    ),
  )
  let score =
    placeNameScore * 0.34 +
    addressScore * 0.28 +
    locationScore * 0.12 +
    Number(phoneMatch) * 0.32 +
    Number(dishSupport) * 0.04
  if (candidate.placeId && candidate.lat !== null && candidate.lng !== null) {
    score += 0.08
    matchReasons.push('complete_provider_record')
  }
  if (phoneMatch) matchReasons.push('phone_match')
  if (addressScore >= 0.6) matchReasons.push('address_similarity')
  if (placeNameScore >= 0.6) matchReasons.push('place_name_similarity')
  if (locationScore >= 0.6) matchReasons.push('location_hint_match')
  if (dishSupport) matchReasons.push('dish_or_category_support')

  if (
    Number.isFinite(Number(userLocation?.lat)) &&
    Number.isFinite(Number(userLocation?.lng)) &&
    candidate.lat !== null &&
    candidate.lng !== null
  ) {
    const latitudeDelta = Number(userLocation.lat) - candidate.lat
    const longitudeDelta = Number(userLocation.lng) - candidate.lng
    const roughDistance = Math.sqrt(
      latitudeDelta ** 2 + longitudeDelta ** 2,
    )
    if (roughDistance < 0.05) {
      score += 0.05
      matchReasons.push('near_user_location')
    }
  }

  return {
    ...candidate,
    confidence: roundScore(Math.max(0, Math.min(1, score))),
    matchReasons,
    evidenceStatus: entities?.status || null,
  }
}

async function fetchGoogleCandidates({
  query,
  apiKey,
  timeoutMs,
  maxCandidates,
  fetchImpl,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(GOOGLE_TEXT_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.types',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: maxCandidates,
      }),
    })
    if (!response.ok) {
      const error = new Error(`Google Places returned HTTP ${response.status}.`)
      error.code = 'provider_error'
      throw error
    }
    const payload = await response.json()
    return Array.isArray(payload?.places) ? payload.places : []
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveFoodMapLocation(
  {
    locationQuery,
    entities = {},
    userLocation = null,
  } = {},
  {
    provider = configuredProvider(),
    apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      '',
    timeoutMs = Number(
      process.env.LOCATION_RESOLUTION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
    maxCandidates = Number(
      process.env.LOCATION_RESOLUTION_MAX_CANDIDATES ||
        DEFAULT_MAX_CANDIDATES,
    ),
    fetchImpl = globalThis.fetch,
    fetchCandidates = fetchGoogleCandidates,
  } = {},
) {
  if (!locationQuery?.canResolveLocation || !locationQuery?.query) {
    return emptyResolution(
      'provider_disabled',
      'location_query_not_ready',
    )
  }
  const selectedProvider = configuredProvider(provider)
  if (selectedProvider === 'disabled') {
    return emptyResolution('provider_disabled', 'provider_disabled')
  }
  if (!String(apiKey || '').trim()) {
    return emptyResolution('missing_api_key', 'missing_api_key')
  }

  try {
    const places = await fetchCandidates({
      query: locationQuery.query,
      apiKey,
      timeoutMs: Math.max(200, timeoutMs),
      maxCandidates: Math.max(1, Math.min(10, maxCandidates)),
      fetchImpl,
    })
    const candidates = places
      .map(googleCandidate)
      .filter((candidate) => candidate.name || candidate.formattedAddress)
      .map((candidate) =>
        rankCandidate(candidate, {
          locationQuery,
          entities,
          userLocation,
        }),
      )
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, Math.max(1, Math.min(10, maxCandidates)))

    if (!candidates.length) {
      return emptyResolution('not_found', 'no_provider_candidates')
    }
    const top = candidates[0]
    const gap =
      top.confidence - Number(candidates[1]?.confidence || 0)
    const resolved =
      top.confidence >= 0.5 &&
      (
        candidates.length === 1 ||
        (top.confidence >= 0.62 && gap >= 0.12)
      )

    return {
      status: resolved ? 'resolved' : 'multiple_candidates',
      resolvedLocation: resolved ? top : null,
      candidates,
      confidence: top.confidence,
      reason: resolved
        ? 'single_highest_ranked_candidate'
        : 'candidate_ambiguity_requires_user_choice',
      warnings: [],
    }
  } catch (error) {
    return emptyResolution(
      'error',
      error?.name === 'AbortError' ? 'provider_timeout' : 'provider_error',
      [
        error?.name === 'AbortError'
          ? 'Location provider timed out.'
          : 'Location provider request failed.',
      ],
    )
  }
}

export {
  configuredProvider as configuredLocationResolutionProvider,
  rankCandidate as rankLocationCandidate,
}
