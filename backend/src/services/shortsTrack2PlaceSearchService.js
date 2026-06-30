const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const TEXT_SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.primaryType,places.businessStatus'
const MAX_QUERIES = 6
const MAX_CANDIDATES_PER_QUERY = 5
const MAX_CONCURRENT_FETCHES = 3

function safeString(value, maxLength = 500) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, maxLength)
}

function foldText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

function uniqueBy(values, keyFn) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const key = foldText(keyFn(value))
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function noDiacritics(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
}

function first(values = []) {
  return safeString(Array.isArray(values) ? values[0] : values)
}

function cityFromAreas(areas = []) {
  const folded = areas.map(foldText).join(' ')
  if (/\b(?:hcm|ho chi minh|sai gon)\b/.test(folded)) return 'Ho Chi Minh City'
  if (/\b(?:ha noi|hanoi)\b/.test(folded)) return 'Ha Noi'
  return ''
}

function districtFromAreas(areas = []) {
  return areas.find((area) => /\b(?:quan|district|q\.?)\s*\d{1,2}/i.test(foldText(area))) || ''
}

function buildQueries(placeSignals = {}) {
  const placeName = first(placeSignals?.signals?.placeNames || placeSignals?.placeNames)
  const areas = placeSignals?.signals?.areas || placeSignals?.areas || []
  const dishes = placeSignals?.signals?.dishes || placeSignals?.dishes || []
  const area = first(areas)
  const district = safeString(districtFromAreas(areas))
  const city = safeString(cityFromAreas(areas))
  const dish = first(dishes)

  if (!placeName || !area) return []

  return uniqueBy([
    district && city ? { textQuery: `${placeName} ${district} ${city}`, strategy: 'place_district_city' } : null,
    district ? { textQuery: `${placeName} ${district}`, strategy: 'place_district' } : null,
    city ? { textQuery: `${placeName} ${city}`, strategy: 'place_city' } : null,
    area ? { textQuery: `${placeName} ${area}`, strategy: 'place_area' } : null,
    dish && city ? { textQuery: `${placeName} ${dish} ${city}`, strategy: 'place_dish_city' } : null,
    area ? { textQuery: `${noDiacritics(placeName)} ${area}`, strategy: 'plain_place_area' } : null,
  ].filter(Boolean), (item) => item.textQuery).slice(0, MAX_QUERIES)
}

function displayNameText(displayName) {
  if (!displayName) return ''
  if (typeof displayName === 'string') return displayName
  return safeString(displayName.text)
}

function mapCandidate(candidate = {}, strategy = '') {
  return {
    placeId: safeString(candidate.placeId || candidate.id || candidate.name, 120),
    displayName: displayNameText(candidate.displayName),
    formattedAddress: safeString(candidate.formattedAddress, 300),
    primaryType: safeString(candidate.primaryType, 120),
    businessStatus: safeString(candidate.businessStatus, 120),
    foundByStrategies: Array.isArray(candidate.foundByStrategies)
      ? candidate.foundByStrategies.map((item) => safeString(item, 80)).filter(Boolean)
      : [strategy].filter(Boolean),
    queryCount: Number.isFinite(Number(candidate.queryCount)) ? Number(candidate.queryCount) : 1,
  }
}

function mergeCandidates(candidates = []) {
  const byId = new Map()
  for (const candidate of candidates) {
    if (!candidate.placeId) continue
    const existing = byId.get(candidate.placeId)
    if (!existing) {
      byId.set(candidate.placeId, candidate)
      continue
    }
    existing.foundByStrategies = [...new Set([
      ...existing.foundByStrategies,
      ...candidate.foundByStrategies,
    ])]
    existing.queryCount += candidate.queryCount || 1
  }
  return [...byId.values()]
}

function diagnostic(code, message, extra = {}) {
  return {
    code,
    message: safeString(message, 240),
    ...extra,
  }
}

async function fetchQuery({ query, apiKey, fetchImpl }) {
  const response = await fetchImpl(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query.textQuery,
      languageCode: 'vi',
      regionCode: 'VN',
      pageSize: MAX_CANDIDATES_PER_QUERY,
    }),
  })

  if (response && 'ok' in response && !response.ok) {
    return {
      status: 'ERROR',
      candidates: [],
      diagnostic: diagnostic('PLACE_SEARCH_HTTP_ERROR', 'Places search HTTP error', {
        httpStatus: Number(response.status) || null,
        apiKeyPresent: Boolean(apiKey),
      }),
    }
  }

  const payload = response && typeof response.json === 'function'
    ? await response.json()
    : {}
  return {
    status: 'OK',
    candidates: (Array.isArray(payload.places) ? payload.places : [])
      .slice(0, MAX_CANDIDATES_PER_QUERY)
      .map((place) => mapCandidate(place, query.strategy)),
  }
}

export async function searchPlaceNameCandidates(placeSignals = {}, deps = {}) {
  const queries = buildQueries(placeSignals)
  if (!queries.length) {
    return {
      status: 'NO_QUERIES',
      reason: 'PLACE_NAME_NO_QUERIES',
      queries: [],
      rawCandidates: [],
      diagnostics: [],
    }
  }

  if (typeof deps.track2PlaceSearchProvider === 'function') {
    try {
      const providerResult = await deps.track2PlaceSearchProvider({ queries, placeSignals })
      const candidates = mergeCandidates((Array.isArray(providerResult?.rawCandidates)
        ? providerResult.rawCandidates
        : Array.isArray(providerResult?.candidates)
        ? providerResult.candidates
        : []).map((candidate) => mapCandidate(candidate)))
      return {
        status: 'OK',
        reason: candidates.length ? 'PLACE_NAME_CANDIDATES_FOUND' : 'PLACE_NAME_NO_CANDIDATES',
        queries,
        rawCandidates: candidates,
        diagnostics: [],
      }
    } catch (error) {
      return {
        status: 'ERROR',
        reason: 'PLACE_NAME_PROVIDER_ERROR',
        queries,
        rawCandidates: [],
        diagnostics: [diagnostic('PLACE_SEARCH_PROVIDER_ERROR', error?.message || 'provider_error')],
      }
    }
  }

  const apiKey = safeString(deps.googlePlacesApiKey, 200)
  const fetchImpl = deps.fetch
  if (!apiKey || typeof fetchImpl !== 'function') {
    return {
      status: 'UNAVAILABLE',
      reason: 'PLACE_NAME_PROVIDER_UNAVAILABLE',
      queries,
      rawCandidates: [],
      diagnostics: [diagnostic('PLACE_SEARCH_UNAVAILABLE', 'Places API key or fetch unavailable', {
        apiKeyPresent: Boolean(apiKey),
      })],
    }
  }

  const allCandidates = []
  const diagnostics = []
  try {
    for (let index = 0; index < queries.length; index += MAX_CONCURRENT_FETCHES) {
      const batch = queries.slice(index, index + MAX_CONCURRENT_FETCHES)
      const results = await Promise.all(batch.map((query) => fetchQuery({ query, apiKey, fetchImpl })))
      for (const result of results) {
        if (result.diagnostic) diagnostics.push(result.diagnostic)
        allCandidates.push(...result.candidates)
      }
    }
  } catch (error) {
    return {
      status: 'ERROR',
      reason: 'PLACE_NAME_PROVIDER_ERROR',
      queries,
      rawCandidates: [],
      diagnostics: [diagnostic('PLACE_SEARCH_PROVIDER_ERROR', error?.message || 'provider_error', {
        apiKeyPresent: Boolean(apiKey),
      })],
    }
  }

  const rawCandidates = mergeCandidates(allCandidates)
  return {
    status: rawCandidates.length ? 'OK' : 'OK',
    reason: rawCandidates.length ? 'PLACE_NAME_CANDIDATES_FOUND' : 'PLACE_NAME_NO_CANDIDATES',
    queries,
    rawCandidates,
    diagnostics,
  }
}

export const __shortsTrack2PlaceSearchTestUtils = {
  buildQueries,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_URL,
}

export default {
  searchPlaceNameCandidates,
}
