const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
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
  const district =
    address.city_district ||
    address.suburb ||
    address.county ||
    address.city ||
    address.town ||
    ''

  return {
    id: String(item?.place_id || `${latitude}:${longitude}`),
    label,
    shortLabel: String(item?.name || item?.display_name?.split(',')?.[0] || label).trim(),
    latitude,
    longitude,
    district: String(district || '').trim(),
    type: String(item?.type || item?.category || '').trim(),
  }
}

export async function searchAddresses(
  query,
  { signal, fetchImpl = globalThis.fetch, limit = MAX_RESULTS } = {},
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

  // The public Nominatim endpoint permits lightweight, user-triggered lookups only.
  // Keep requests explicit (never autocomplete), spaced apart, cached, and attributed in the UI.
  await respectPublicServiceRateLimit(signal)

  const params = new URLSearchParams({
    q: normalizedQuery,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'vn',
    limit: String(safeLimit),
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
  if (!Array.isArray(data)) {
    return []
  }

  const seen = new Set()
  const results = data
    .map(normalizeGeocodingResult)
    .filter((item) => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, safeLimit)

  cacheResults(cacheKey, results)
  return results.map((item) => ({ ...item }))
}
