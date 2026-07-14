const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.googleMapsUri',
  'places.photos',
  'places.reviews',
].join(',')

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

function displayName(value) {
  return capText(typeof value === 'string' ? value : value?.text, 150)
}

function mapPhoto(photo) {
  const name = capText(photo?.name, 2_000)
  if (!/^places\/[^/]+\/photos\/[^/]+$/u.test(name)) return null
  return {
    name,
    widthPx: Number.isFinite(Number(photo?.widthPx)) ? Number(photo.widthPx) : null,
    heightPx: Number.isFinite(Number(photo?.heightPx)) ? Number(photo.heightPx) : null,
    attribution: (Array.isArray(photo?.authorAttributions) ? photo.authorAttributions : [])
      .map((author) => ({
        displayName: displayName(author?.displayName),
        uri: capText(author?.uri, 1_000) || null,
      }))
      .filter((author) => author.displayName)
      .slice(0, 2),
  }
}

function mapReview(review, placeMapsUri) {
  const text = capText(review?.text?.text || review?.originalText?.text, 360)
  if (!text) return null
  const rating = Number(review?.rating)
  return {
    text,
    rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : null,
    relativeTime: capText(review?.relativePublishTimeDescription, 80) || null,
    authorName: displayName(review?.authorAttribution?.displayName) || 'Google user',
    authorUri: capText(review?.authorAttribution?.uri, 1_000) || null,
    sourceUri: capText(review?.googleMapsUri, 1_000) || placeMapsUri || null,
  }
}

function providerErrorCode(status, payload) {
  const text = `${payload?.error?.status || ''} ${payload?.error?.message || ''}`.toLowerCase()
  if (status === 401 || /api key not valid|invalid api key/.test(text)) return 'google_places_api_key_invalid'
  if (status === 403) return 'google_places_forbidden'
  if (status === 429 || /quota|resource_exhausted|rate limit/.test(text)) return 'google_places_quota_exceeded'
  return 'google_places_request_failed'
}

function mapPlace(place, { selectedDish, origin, index }) {
  const providerPlaceId = capText(place?.id, 255)
  const name = displayName(place?.displayName)
  const address = capText(place?.formattedAddress, 300)
  const lat = finiteCoordinate(place?.location?.latitude, -90, 90)
  const lng = finiteCoordinate(place?.location?.longitude, -180, 180)
  if (!providerPlaceId || !name || !address || lat === null || lng === null) return null
  if (place?.businessStatus === 'CLOSED_PERMANENTLY') return null
  const rating = Number.isFinite(Number(place?.rating)) ? Math.max(0, Math.min(5, Number(place.rating))) : null
  const userRatingCount = Number.isFinite(Number(place?.userRatingCount)) ? Math.max(0, Math.trunc(Number(place.userRatingCount))) : 0
  const distance = distanceKm(origin, { lat, lng })
  const googleMapsUri = capText(place?.googleMapsUri, 1_000) || null
  const photo = (Array.isArray(place?.photos) ? place.photos : []).map(mapPhoto).find(Boolean) || null
  const reviews = (Array.isArray(place?.reviews) ? place.reviews : [])
    .map((review) => mapReview(review, googleMapsUri))
    .filter(Boolean)
    .slice(0, 2)
  const relevanceScore = Math.max(0, 1 - index / MAX_RESULTS)
  const ratingScore = rating === null ? 0 : rating / 5
  const popularityScore = Math.min(1, Math.log10(userRatingCount + 1) / 4)
  const distanceScore = distance === null ? 0 : Math.max(0, 1 - distance / 30)
  const rankScore = relevanceScore * 0.55 + ratingScore * 0.2 + popularityScore * 0.2 + distanceScore * 0.05

  return {
    id: `google_places:${providerPlaceId}`,
    sourceType: 'external',
    sourceId: null,
    provider: 'google_places',
    providerPlaceId,
    name,
    address,
    district: null,
    lat,
    lng,
    rating,
    userRatingCount,
    priceLevel: capText(place?.priceLevel, 40) || null,
    category: capText(place?.primaryType, 100) || null,
    categories: (Array.isArray(place?.types) ? place.types : []).map((value) => capText(value, 100)).filter(Boolean).slice(0, 12),
    businessStatus: capText(place?.businessStatus, 60) || null,
    googleMapsUri,
    photo,
    reviews,
    distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
    rankScore: Math.round(rankScore * 1_000) / 1_000,
    dishHint: selectedDish,
    dishMatchBasis: 'google_places_text_search',
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
    apiKey = process.env.GOOGLE_PLACES_API_KEY || '',
    enabled = process.env.VISION_DISH_EXTERNAL_SEARCH_ENABLED === 'true',
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.VISION_DISH_EXTERNAL_SEARCH_TIMEOUT_MS || 10_000),
  } = {},
) {
  const selectedDish = capText(dishName, 120)
  if (!selectedDish) {
    const error = new Error('Select one dish before searching Google Places.')
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
      source: 'google_places',
      reason: !enabled ? 'google_places_search_disabled' : 'google_places_not_configured',
    }
  }

  const radius = Math.max(1_000, Math.min(50_000, Number(radiusMeters) || DEFAULT_RADIUS_METERS))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
  try {
    const response = await fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: selectedDish,
        includedType: 'restaurant',
        strictTypeFiltering: false,
        pageSize: MAX_RESULTS,
        languageCode: 'vi',
        regionCode: 'VN',
        rankPreference: 'RELEVANCE',
        locationBias: {
          circle: {
            center: { latitude: searchOrigin.lat, longitude: searchOrigin.lng },
            radius,
          },
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      const error = new Error('Google Places search failed.')
      error.code = providerErrorCode(Number(response.status), payload)
      error.status = Number(response.status) || null
      throw error
    }
    const restaurants = (Array.isArray(payload?.places) ? payload.places : [])
      .map((place, index) => mapPlace(place, { selectedDish, origin: searchOrigin, index }))
      .filter(Boolean)
      .sort((left, right) => right.rankScore - left.rankScore)
      .slice(0, MAX_RESULTS)

    return {
      status: restaurants.length ? 'external_places_found' : 'external_places_not_found',
      selectedDish: { dishName: selectedDish, aliases: (Array.isArray(aliases) ? aliases : []).map((value) => capText(value, 120)).filter(Boolean).slice(0, 6) },
      originalPlaceKnown: false,
      searchOrigin,
      restaurants,
      source: 'google_places',
      reason: restaurants.length ? null : 'google_places_no_results',
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Google Places search timed out.')
      timeoutError.code = 'google_places_timeout'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const __visionDishExternalPlaceTestUtils = {
  normalizedOrigin,
  distanceKm,
  mapPlace,
  mapPhoto,
  mapReview,
  GOOGLE_PLACES_FIELD_MASK,
}
