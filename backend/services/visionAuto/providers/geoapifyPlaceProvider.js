const GEOAPIFY_GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search'
const GEOAPIFY_PLACES_URL = 'https://api.geoapify.com/v2/places'
const FOOD_CATEGORIES = ['catering.restaurant', 'catering.cafe', 'catering.fast_food', 'catering.food_court']

function clean(value, max = 320) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalize(value) {
  return clean(value, 500).toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenScore(left, right) {
  const a = new Set(normalize(left).split(' ').filter(Boolean))
  const b = new Set(normalize(right).split(' ').filter(Boolean))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / new Set([...a, ...b]).size
}

function abortError() {
  const error = new Error('Geoapify request aborted')
  error.name = 'AbortError'
  return error
}

function combineSignals(externalSignal, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const forward = () => controller.abort()
  externalSignal?.addEventListener('abort', forward, { once: true })
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', forward)
    },
  }
}

function providerError(status, code = '') {
  const error = new Error('Geoapify is unavailable')
  error.name = 'GeoapifyProviderError'
  error.status = status || 0
  error.code = status === 401 || status === 403 ? 'provider_unauthorized'
    : status === 429 ? 'provider_rate_limited'
      : code === 'timeout' ? 'provider_timeout'
        : 'provider_unavailable'
  return error
}

async function geoapifyRequest(path, params, { apiKey, signal, timeoutMs = 7_000, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw providerError(0, 'not_configured')
  const url = new URL(path)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  url.searchParams.set('apiKey', apiKey)
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw abortError()
    const combined = combineSignals(signal, timeoutMs)
    try {
      const response = await fetchImpl(url, { signal: combined.signal, headers: { accept: 'application/json' } })
      if (!response.ok) {
        const error = providerError(response.status)
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          lastError = error
          continue
        }
        throw error
      }
      return await response.json()
    } catch (error) {
      if (signal?.aborted) throw abortError()
      const normalized = error?.name === 'AbortError' ? providerError(0, 'timeout') : error
      if (attempt === 0 && (normalized?.code === 'provider_timeout' || normalized?.code === 'provider_unavailable')) {
        lastError = normalized
        continue
      }
      throw normalized
    } finally {
      combined.dispose()
    }
  }
  throw lastError || providerError()
}

function featureRecord(feature = {}) {
  const properties = feature?.properties || {}
  const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : []
  const lng = finite(properties.lon ?? coordinates[0])
  const lat = finite(properties.lat ?? coordinates[1])
  const providerPlaceId = clean(properties.place_id || properties.datasource?.raw?.id, 255)
  const name = clean(properties.name || properties.address_line1 || '', 180)
  const formattedAddress = clean(properties.formatted || [properties.address_line1, properties.address_line2].filter(Boolean).join(', '), 320)
  const categories = Array.isArray(properties.categories) ? properties.categories.map((value) => clean(value, 80)).filter(Boolean).slice(0, 8) : []
  const countryCode = clean(properties.country_code, 8).toLowerCase()
  if (!providerPlaceId || !lat || !lng || (!name && !formattedAddress) || countryCode !== 'vn') return null
  return {
    sourceType: 'external',
    provider: 'geoapify',
    providerPlaceId,
    id: `geoapify:${providerPlaceId}`,
    name: name || formattedAddress,
    formattedAddress,
    lat,
    lng,
    categories,
    countryCode,
    existsInFoodStory: false,
  }
}

function hasFoodCategory(categories = []) {
  return categories.some((category) => category === 'catering' || category.startsWith('catering.'))
}

function localityText(hypothesis = {}) {
  return [hypothesis.locality, hypothesis.ward, hypothesis.district, hypothesis.city].filter(Boolean).join(', ')
}

function houseNumber(value) {
  return normalize(value).match(/^\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?/u)?.[0] || null
}

export function scoreGeoapifyPlace(hypothesis = {}, candidate = {}) {
  const hasName = Boolean(clean(hypothesis.placeName))
  const nameScore = hasName ? tokenScore(hypothesis.placeName, candidate.name) : 0
  const streetScore = hypothesis.streetCore ? tokenScore(hypothesis.streetCore, candidate.formattedAddress) : 0
  const localityScore = localityText(hypothesis) ? tokenScore(localityText(hypothesis), candidate.formattedAddress) : 0
  const expectedHouse = houseNumber(hypothesis.address)
  const resultHouse = houseNumber(candidate.formattedAddress)
  const houseCompatible = !expectedHouse || !resultHouse || expectedHouse === resultHouse
  const categoryRelevant = hasFoodCategory(candidate.categories)
  const nameRequirementMet = !hasName || nameScore >= 0.48
  const addressOnlyQuality = !hasName && streetScore >= 0.68 && localityScore >= 0.34
  const score = Math.max(0, Math.min(1,
    (hasName ? nameScore * 0.5 : 0) + streetScore * 0.23 + localityScore * 0.18 + (categoryRelevant ? 0.13 : 0) + (houseCompatible ? 0.05 : -0.32),
  ))
  const accepted = Boolean(
    candidate.providerPlaceId && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng) &&
    candidate.countryCode === 'vn' && nameRequirementMet && houseCompatible &&
    (hasName ? categoryRelevant && score >= 0.52 : addressOnlyQuality && score >= 0.52),
  )
  return { score: Math.round(score * 1000) / 1000, accepted, nameScore, streetScore, localityScore, categoryRelevant, houseCompatible }
}

async function geocode(text, options) {
  const body = await geoapifyRequest(GEOAPIFY_GEOCODE_URL, {
    text,
    filter: 'countrycode:vn',
    lang: 'vi',
    limit: 5,
    format: 'geojson',
  }, options)
  return Array.isArray(body?.features) ? body.features : []
}

async function localityAnchor(hypothesis, options) {
  const locality = localityText(hypothesis)
  if (!locality) return null
  const [feature] = await geocode(locality, options)
  const properties = feature?.properties || {}
  const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : []
  const lng = finite(properties.lon ?? coordinates[0])
  const lat = finite(properties.lat ?? coordinates[1])
  return lat !== null && lng !== null ? { lat, lng } : null
}

export async function resolveGeoapifyPlace(hypothesis = {}, options = {}) {
  const apiKey = options.apiKey || options.config?.geoapifyApiKey
  if (!apiKey) return { candidates: [], status: 'provider_disabled' }
  const requestOptions = { ...options, apiKey }
  const placeName = clean(hypothesis.placeName, 180)
  let features = []
  if (placeName) {
    const anchor = await localityAnchor(hypothesis, requestOptions)
    if (!anchor) return { candidates: [], status: 'no_safe_search_anchor' }
    const body = await geoapifyRequest(GEOAPIFY_PLACES_URL, {
      categories: FOOD_CATEGORIES.join(','),
      name: placeName,
      filter: `circle:${anchor.lng},${anchor.lat},12000`,
      bias: `proximity:${anchor.lng},${anchor.lat}`,
      limit: 8,
      lang: 'vi',
    }, requestOptions)
    features = Array.isArray(body?.features) ? body.features : []
  } else if (clean(hypothesis.address, 320)) {
    features = await geocode(hypothesis.address, requestOptions)
  } else {
    return { candidates: [], status: 'insufficient_hypothesis' }
  }
  const candidates = features.map(featureRecord).filter(Boolean).map((candidate) => {
    const scored = scoreGeoapifyPlace(hypothesis, candidate)
    return { ...candidate, confidence: scored.score, resolverScore: scored.score, matchReasons: scored.accepted ? ['resolver_evidence_match'] : [], _accepted: scored.accepted }
  }).filter((candidate) => candidate._accepted).map(({ _accepted, ...candidate }) => candidate).sort((a, b) => b.confidence - a.confidence).slice(0, 5)
  return { candidates, status: candidates.length ? 'resolved' : 'no_resolver_match' }
}

export async function checkGeoapifyProviderHealth({ config, performLookup = false, signal, fetchImpl } = {}) {
  const configured = Boolean(config?.geoapifyConfigured && config?.geoapifyApiKey)
  if (!configured) return { configured: false, reachable: false, authorized: false, rateLimited: false, timeout: false }
  if (!performLookup) return { configured: true, reachable: null, authorized: null, rateLimited: false, timeout: false }
  try {
    await geocode('Ho Chi Minh City, Vietnam', { apiKey: config.geoapifyApiKey, signal, timeoutMs: config.geoapifyTimeoutMs, fetchImpl })
    return { configured: true, reachable: true, authorized: true, rateLimited: false, timeout: false }
  } catch (error) {
    return { configured: true, reachable: error?.code !== 'provider_timeout', authorized: error?.code !== 'provider_unauthorized', rateLimited: error?.code === 'provider_rate_limited', timeout: error?.code === 'provider_timeout' }
  }
}

export { FOOD_CATEGORIES, GEOAPIFY_GEOCODE_URL, GEOAPIFY_PLACES_URL }
