import api from './api'

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const PRECISE_ADDRESS_SEARCH_URL =
  `${String(api.defaults.baseURL || '/api').replace(/\/$/u, '')}/food-map/address-search`
const MIN_QUERY_LENGTH = 3
const MAX_RESULTS = 5
const MIN_REQUEST_INTERVAL_MS = 1100
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_CACHE_ENTRIES = 50

const responseCache = new Map()
let nextRequestAt = 0

function finiteCoordinate(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeHouseNumber(value) {
  return cleanText(value).toLocaleLowerCase('vi-VN').replace(/\s+/g, '')
}

export function extractHouseNumber(value) {
  const match = cleanText(value).match(
    /(?:^|,\s*)(\d{1,5}[a-z]?)(?:\s*([/-])\s*(\d{1,5}[a-z]?))?(?=\s+[\p{L}])/iu,
  )
  if (!match) return ''
  return [match[1], match[2], match[3]].filter(Boolean).join('')
}

export function resultMatchesHouseNumber(result, requestedHouseNumber) {
  const requested = normalizeHouseNumber(requestedHouseNumber)
  if (!requested) return false
  return normalizeHouseNumber(result?.houseNumber) === requested
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The address search was cancelled.', 'AbortError')
  }

  const error = new Error('The address search was cancelled.')
  error.name = 'AbortError'
  return error
}

function delay(milliseconds, signal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  if (milliseconds <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, milliseconds)

    function handleAbort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', handleAbort)
      reject(createAbortError())
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

async function respectPublicServiceRateLimit(signal) {
  const now = Date.now()
  const scheduledAt = Math.max(now, nextRequestAt)
  nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS
  await delay(scheduledAt - now, signal)
}

function readCachedResults(cacheKey) {
  const cached = responseCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey)
    return null
  }

  return cached.results.map((item) => ({ ...item }))
}

function cacheResults(cacheKey, results) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value
    if (oldestKey) responseCache.delete(oldestKey)
  }

  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    results: results.map((item) => ({ ...item })),
  })
}

export function normalizeGeocodingResult(item) {
  const latitude = finiteCoordinate(item?.lat, -90, 90)
  const longitude = finiteCoordinate(item?.lon, -180, 180)
  const label = String(item?.display_name || '').trim()

  if (!label || latitude === null || longitude === null) {
    return null
  }

  const address = item?.address && typeof item.address === 'object' ? item.address : {}
  const houseNumber = cleanText(address.house_number || address.housenumber)
  const street = cleanText(
    address.road ||
      address.pedestrian ||
      address.residential ||
      address.footway,
  )
  const district =
    address.city_district ||
    address.suburb ||
    address.county ||
    address.city ||
    address.town ||
    ''
  const type = cleanText(item?.type || item?.category)
  const placeName = cleanText(item?.name)
  const isNamedPlace = Boolean(
    placeName &&
      placeName !== street &&
      !['road', 'street', 'residential', 'administrative'].includes(type),
  )

  return {
    id: String(item?.place_id || `${latitude}:${longitude}`),
    label,
    shortLabel:
      (isNamedPlace ? placeName : '') ||
      [houseNumber, street].filter(Boolean).join(' ') ||
      cleanText(item?.display_name?.split(',')?.[0]) ||
      label,
    latitude,
    longitude,
    district: String(district || '').trim(),
    type,
    houseNumber,
    street,
    precision: houseNumber ? 'house' : isNamedPlace ? 'place' : street ? 'street' : 'area',
    provider: 'openstreetmap',
    sourceType: 'external',
    providerPlaceId: String(item?.place_id || ''),
    placeName: isNamedPlace ? placeName : '',
  }
}

function normalizePreciseAddressResult(item) {
  const latitude = finiteCoordinate(item?.latitude, -90, 90)
  const longitude = finiteCoordinate(item?.longitude, -180, 180)
  const label = cleanText(item?.label)
  if (!label || latitude === null || longitude === null) return null

  return {
    id: cleanText(item?.id) || `${latitude}:${longitude}`,
    label,
    shortLabel: cleanText(item?.shortLabel) || label,
    latitude,
    longitude,
    district: cleanText(item?.district),
    type: cleanText(item?.type),
    houseNumber: cleanText(item?.houseNumber),
    street: cleanText(item?.street),
    precision: ['house', 'place', 'street', 'area'].includes(item?.precision)
      ? item.precision
      : 'area',
    provider: cleanText(item?.provider) || 'geoapify',
    sourceType: 'external',
    providerPlaceId: cleanText(item?.providerPlaceId),
    placeName: cleanText(item?.placeName),
  }
}

function uniqueResults(items, limit) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item) return false
    const coordinateKey = `${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`
    if (seen.has(item.id) || seen.has(coordinateKey)) return false
    seen.add(item.id)
    seen.add(coordinateKey)
    return true
  }).slice(0, limit)
}

async function searchPreciseAddresses(
  query,
  { signal, token, fetchImpl, limit },
) {
  try {
    const params = new URLSearchParams({ q: query })
    const response = await fetchImpl(`${PRECISE_ADDRESS_SEARCH_URL}?${params.toString()}`, {
      method: 'GET',
      signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!response.ok) return []

    const payload = await response.json()
    return uniqueResults(
      (Array.isArray(payload?.results) ? payload.results : [])
        .map(normalizePreciseAddressResult),
      limit,
    )
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return []
  }
}

async function searchOpenStreetMapAddresses(
  query,
  { signal, fetchImpl, limit },
) {
  await respectPublicServiceRateLimit(signal)

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'vn',
    dedupe: '1',
    limit: String(limit),
  })

  const response = await fetchImpl(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'vi,en;q=0.8',
    },
  })

  if (!response.ok) {
    const error = new Error(
      'Address search is temporarily unavailable. You can still pick a point on the map.',
    )
    error.status = response.status
    throw error
  }

  const data = await response.json()
  return Array.isArray(data)
    ? uniqueResults(data.map(normalizeGeocodingResult), limit)
    : []
}

export async function searchAddresses(
  query,
  { signal, token = '', fetchImpl = globalThis.fetch, limit = MAX_RESULTS } = {},
) {
  const normalizedQuery = String(query || '').trim()
  if (normalizedQuery.length < MIN_QUERY_LENGTH) {
    const error = new Error('Enter at least 3 characters to search for an address.')
    error.code = 'ADDRESS_QUERY_TOO_SHORT'
    throw error
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Address search is not available in this browser.')
  }

  const safeLimit = Math.min(Math.max(Number(limit) || MAX_RESULTS, 1), MAX_RESULTS)
  const cacheKey = `${normalizedQuery.toLocaleLowerCase('vi-VN')}::${safeLimit}`
  const cachedResults = readCachedResults(cacheKey)
  if (cachedResults) {
    return cachedResults
  }

  const requestedHouseNumber = extractHouseNumber(normalizedQuery)
  if (!requestedHouseNumber) {
    const openStreetMapResults = await searchOpenStreetMapAddresses(normalizedQuery, {
      signal,
      fetchImpl,
      limit: safeLimit,
    })
    if (openStreetMapResults.length) {
      cacheResults(cacheKey, openStreetMapResults)
      return openStreetMapResults.map((item) => ({ ...item }))
    }
  }

  const preciseResults = await searchPreciseAddresses(normalizedQuery, {
    signal,
    token,
    fetchImpl,
    limit: safeLimit,
  })
  if (
    preciseResults.length &&
    (
      !requestedHouseNumber ||
      preciseResults.some((item) =>
        resultMatchesHouseNumber(item, requestedHouseNumber),
      )
    )
  ) {
    cacheResults(cacheKey, preciseResults)
    return preciseResults.map((item) => ({ ...item }))
  }
  if (!requestedHouseNumber) {
    cacheResults(cacheKey, preciseResults)
    return preciseResults.map((item) => ({ ...item }))
  }

  // Keep the public Nominatim fallback explicit (never autocomplete),
  // rate-limited, cached, and attributed in the UI.
  const openStreetMapResults = await searchOpenStreetMapAddresses(normalizedQuery, {
    signal,
    fetchImpl,
    limit: safeLimit,
  })
  const results = uniqueResults(
    [...preciseResults, ...openStreetMapResults],
    safeLimit,
  )

  cacheResults(cacheKey, results)
  return results.map((item) => ({ ...item }))
}
