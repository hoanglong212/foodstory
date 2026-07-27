import { searchGeoapifyFoodPlaces } from './providers/geoapifyPlaceProvider.js'

const DEFAULT_RADIUS_METERS = 20_000
const MAX_RESULTS = 10

function capText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maxLength)
}

function finiteCoordinate(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null
}

function normalizedOrigin(origin) {
  const lat = finiteCoordinate(origin?.lat, -90, 90)
  const lng = finiteCoordinate(origin?.lng, -180, 180)
  return lat === null || lng === null ? null : { lat, lng }
}

function distanceKm(origin, place) {
  const target = normalizedOrigin({ lat: place?.lat, lng: place?.lng })
  if (!origin || !target) return null
  const radians = (value) => (value * Math.PI) / 180
  const latitudeDelta = radians(target.lat - origin.lat)
  const longitudeDelta = radians(target.lng - origin.lng)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.lat)) * Math.cos(radians(target.lat)) *
    Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function providerErrorCode(status, payload) {
  const text = `${payload?.error?.status || ''} ${payload?.error?.message || ''}`.toLowerCase()
  if (status === 401 || /api key not valid|invalid api key/.test(text)) return 'google_places_api_key_invalid'
  if (status === 403) return 'google_places_forbidden'
  if (status === 429 || /quota|resource_exhausted|rate limit/.test(text)) return 'google_places_quota_exceeded'
  return 'google_places_request_failed'
}

function mapGeoapifyPlace(place, { selectedDish, origin, index }) {
  const providerPlaceId = capText(place?.providerPlaceId, 255)
  const name = capText(place?.name, 150)
  const address = capText(place?.formattedAddress, 300)
  const lat = finiteCoordinate(place?.lat, -90, 90)
  const lng = finiteCoordinate(place?.lng, -180, 180)
  if (!providerPlaceId || !name || !address || lat === null || lng === null) return null

  const distance = distanceKm(origin, { lat, lng })
  const relevanceScore = Math.max(0, 1 - index / MAX_RESULTS)
  const distanceScore = distance === null ? 0 : Math.max(0, 1 - distance / 30)
  const rankScore = relevanceScore * 0.9 + distanceScore * 0.1
  const categories = (Array.isArray(place?.categories) ? place.categories : [])
    .map((value) => capText(value, 100))
    .filter(Boolean)
    .slice(0, 12)

  return {
    id: `geoapify:${providerPlaceId}`,
    sourceType: 'external',
    sourceId: null,
    provider: 'geoapify',
    providerPlaceId,
    name,
    address,
    district: capText(place?.district, 100) || null,
    lat,
    lng,
    rating: null,
    userRatingCount: 0,
    priceLevel: null,
    category: categories[0] || 'catering',
    categories,
    businessStatus: null,
    googleMapsUri: null,
    mapUri: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
    photo: null,
    reviews: [],
    distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
    rankScore: Math.round(rankScore * 1_000) / 1_000,
    dishHint: selectedDish,
    dishMatchBasis: 'geoapify_food_text_search',
    existsInFoodStory: false,
    reviewRequired: true,
  }
}

export async function resolveGooglePlacePhoto(
  { photoName, maxWidthPx = 720, maxHeightPx = 480 } = {},
  {
    apiKey = process.env.GOOGLE_PLACES_API_KEY || '',
    enabled = process.env.VISION_DISH_EXTERNAL_SEARCH_ENABLED === 'true',
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.VISION_DISH_EXTERNAL_SEARCH_TIMEOUT_MS || 10_000),
  } = {},
) {
  const name = capText(photoName, 2_000)
  if (!/^places\/[^/]+\/photos\/[^/]+$/u.test(name)) {
    const error = new Error('Invalid Google Places photo reference.')
    error.code = 'google_places_photo_invalid'
    throw error
  }
  if (!enabled || !capText(apiKey, 500)) {
    const error = new Error('Google Places photos are not configured.')
    error.code = 'google_places_photo_unavailable'
    throw error
  }
  const width = Math.max(64, Math.min(1_600, Number(maxWidthPx) || 720))
  const height = Math.max(64, Math.min(1_600, Number(maxHeightPx) || 480))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
  try {
    const endpoint = new URL(`https://places.googleapis.com/v1/${name}/media`)
    endpoint.searchParams.set('maxWidthPx', String(width))
    endpoint.searchParams.set('maxHeightPx', String(height))
    endpoint.searchParams.set('skipHttpRedirect', 'true')
    endpoint.searchParams.set('key', apiKey)
    const response = await fetchImpl(endpoint, { signal: controller.signal })
    const payload = await response.json()
    if (!response.ok) {
      const error = new Error('Google Places photo request failed.')
      error.code = providerErrorCode(Number(response.status), payload)
      throw error
    }
    const photoUri = capText(payload?.photoUri, 2_000)
    let parsed
    try {
      parsed = new URL(photoUri)
    } catch {
      parsed = null
    }
    if (!parsed || parsed.protocol !== 'https:') {
      const error = new Error('Google Places returned an invalid photo URL.')
      error.code = 'google_places_photo_failed'
      throw error
    }
    return photoUri
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Google Places photo request timed out.')
      timeoutError.code = 'google_places_timeout'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function searchExternalPlacesForDish(
  { dishName, aliases = [], origin = null, radiusMeters = DEFAULT_RADIUS_METERS } = {},
  {
    apiKey = process.env.GEOAPIFY_API_KEY || '',
    enabled = process.env.VISION_DISH_EXTERNAL_SEARCH_ENABLED === 'true',
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.VISION_DISH_EXTERNAL_SEARCH_TIMEOUT_MS || 10_000),
  } = {},
) {
  const selectedDish = capText(dishName, 120)
  if (!selectedDish) {
    const error = new Error('Select one dish before searching nearby places.')
    error.code = 'dish_required'
    throw error
  }
  const searchOrigin = normalizedOrigin(origin)
  if (!searchOrigin) {
    const error = new Error('Move the map to the area where you want to search.')
    error.code = 'dish_search_origin_required'
    throw error
  }
  if (!enabled || !capText(apiKey, 500)) {
    return {
      status: 'external_places_unavailable',
      selectedDish: { dishName: selectedDish, aliases: (Array.isArray(aliases) ? aliases : []).map((value) => capText(value, 120)).filter(Boolean).slice(0, 6) },
      originalPlaceKnown: false,
      searchOrigin,
      restaurants: [],
      source: 'geoapify',
      reason: !enabled ? 'geoapify_search_disabled' : 'geoapify_not_configured',
    }
  }

  const radius = Math.max(1_000, Math.min(50_000, Number(radiusMeters) || DEFAULT_RADIUS_METERS))
  try {
    const places = await searchGeoapifyFoodPlaces(selectedDish, {
      apiKey,
      origin: searchOrigin,
      radiusMeters: radius,
      limit: MAX_RESULTS,
      timeoutMs: Math.max(1_000, timeoutMs),
      fetchImpl,
    })
    const restaurants = places
      .map((place, index) => mapGeoapifyPlace(place, { selectedDish, origin: searchOrigin, index }))
      .filter(Boolean)
      .sort((left, right) => right.rankScore - left.rankScore)
      .slice(0, MAX_RESULTS)

    return {
      status: restaurants.length ? 'external_places_found' : 'external_places_not_found',
      selectedDish: { dishName: selectedDish, aliases: (Array.isArray(aliases) ? aliases : []).map((value) => capText(value, 120)).filter(Boolean).slice(0, 6) },
      originalPlaceKnown: false,
      searchOrigin,
      restaurants,
      source: 'geoapify',
      reason: restaurants.length ? null : 'geoapify_no_results',
    }
  } catch (error) {
    const providerError = new Error(
      error?.code === 'provider_timeout'
        ? 'Geoapify place search timed out.'
        : 'Geoapify place search is temporarily unavailable.',
    )
    providerError.code = error?.code === 'provider_unauthorized'
      ? 'geoapify_api_key_invalid'
      : error?.code === 'provider_rate_limited'
        ? 'geoapify_quota_exceeded'
        : error?.code === 'provider_timeout' || error?.name === 'AbortError'
          ? 'geoapify_timeout'
          : 'geoapify_request_failed'
    providerError.status = Number(error?.status) || null
    throw providerError
  }
}

export const __visionDishExternalPlaceTestUtils = {
  normalizedOrigin,
  distanceKm,
  mapGeoapifyPlace,
}
