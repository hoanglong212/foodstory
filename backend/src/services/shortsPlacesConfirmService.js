const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const TEXT_SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.primaryType,places.businessStatus'
const DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,primaryType,businessStatus,moved_place,moved_place_id'

const MAX_QUERY_ATTEMPTS = 3

function safeString(value) {
  return String(value || '').trim()
}

function capText(value, maxLength = 240) {
  return safeString(value).replace(/\s+/gu, ' ').slice(0, maxLength)
}

function normalizeSearchText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

function uniqueByText(items = [], key = (item) => item) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const value = normalizeSearchText(key(item))
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(item)
  }
  return result
}

function displayNameText(displayName) {
  if (!displayName) return ''
  if (typeof displayName === 'string') return displayName
  return safeString(displayName.text)
}

function mapPlace(place = {}) {
  return {
    placeId: safeString(place.id || place.name),
    displayName: displayNameText(place.displayName),
    formattedAddress: safeString(place.formattedAddress),
    primaryType: safeString(place.primaryType),
    businessStatus: safeString(place.businessStatus),
    movedPlace: place.moved_place || place.movedPlace || null,
    movedPlaceId: safeString(place.moved_place_id || place.movedPlaceId) || null,
  }
}

function baseHeaders(googlePlacesApiKey, fieldMask) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': googlePlacesApiKey,
    'X-Goog-FieldMask': fieldMask,
  }
}

async function responseBodySummary(response) {
  let payload = null
  let text = ''
  try {
    if (response && typeof response.clone === 'function') {
      payload = await response.clone().json()
    } else if (response && typeof response.json === 'function') {
      payload = await response.json()
    }
  } catch {
    payload = null
  }

  if (!payload && response && typeof response.text === 'function') {
    try {
      text = await response.text()
      payload = JSON.parse(text)
    } catch {
      // Keep only a bounded plain text fallback.
    }
  }

  const error = payload?.error || payload || {}
  return {
    message: capText(error.message || text, 300) || null,
    status: capText(error.status, 120) || null,
    reason: capText(
      error.details?.[0]?.reason ||
        error.errors?.[0]?.reason ||
        error.reason,
      120,
    ) || null,
  }
}

function providerDiagnostic({
  endpoint,
  textQuery = '',
  fieldMask,
  apiKeyPresent,
  httpStatus = null,
  body = {},
  error = '',
}) {
  return {
    endpoint,
    textQuery: capText(textQuery, 500) || null,
    fieldMask,
    apiKeyPresent: Boolean(apiKeyPresent),
    httpStatus: Number.isFinite(Number(httpStatus)) ? Number(httpStatus) : null,
    message: capText(body.message || error, 300) || null,
    status: capText(body.status, 120) || null,
    reason: capText(body.reason, 120) || null,
  }
}

async function readJsonResponse(response, diagnosticContext) {
  if (response && 'ok' in response && !response.ok) {
    const diagnostic = providerDiagnostic({
      ...diagnosticContext,
      httpStatus: response.status,
      body: await responseBodySummary(response),
    })
    const error = new Error('PLACES_PROVIDER_ERROR')
    error.diagnostic = diagnostic
    throw error
  }
  return response && typeof response.json === 'function'
    ? response.json()
    : {}
}

function firstHouseToken(value) {
  return safeString(value).match(/\b\d{1,5}(?:\/\d{1,5})?[A-Za-z]?\b/u)?.[0] || ''
}

function stripContextNoise(value) {
  return safeString(value)
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\b(?:www|facebook|instagram|tiktok|youtube)\.[^\s]+/giu, ' ')
    .replace(/#[\p{L}\p{N}_-]+/gu, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, ' ')
    .replace(/\b(?:dia\s*chi|address|d\/c|dc)\s*:/giu, ' ')
    .replace(/\b(?:tai|so|hem|ngo|duong|phuong|quan|district|ward)\s*$/giu, ' ')
    .replace(/^[\s:;,.|/\\-]+|[\s:;,.|/\\-]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function unsafePlaceContext(value) {
  const text = safeString(value)
  const normalized = normalizeSearchText(text)
  if (text.length < 2 || text.length > 90) return true
  if (/https?:\/\//iu.test(text)) return true
  if (/#|@|\.com\b|\b(?:facebook|instagram|tiktok|youtube|subscribe|follow)\b/iu.test(text)) {
    return true
  }
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/u.test(text)) return true
  if (/\b\d+\s*k\b|\b\d{2,}(?:\.\d{3})?\s*(?:vnd|d|dong|ngan|nghin)\b/iu.test(text)) {
    return true
  }
  if (/\b(?:gia|gio|mo cua|phuc vu|lien he|copyright|ban quyen|hashtag)\b/u.test(normalized)) {
    return true
  }
  if (/\b(?:dia chi|address|duong|street|district|ward|phuong|quan|tp|thanh pho)\b/u.test(normalized)) {
    return true
  }
  if (/^\d/.test(normalized)) return true
  return !/[a-z\p{L}]/iu.test(text)
}

function safePlaceContext(value, source) {
  const text = stripContextNoise(value)
    .replace(/\b(?:tai|tại)\s+(?:so|số)?\s*$/iu, '')
    .replace(/\b(?:so|số|hem|hẻm|ngo|ngõ|duong|đường)\s*$/iu, '')
    .replace(/^[\s:;,.|/\\-]+|[\s:;,.|/\\-]+$/gu, '')
    .trim()
  if (unsafePlaceContext(text)) return null
  return { name: capText(text, 90), source }
}

function contextBeforeAddressLabel(text, source) {
  const sourceText = safeString(text)
  const labelPattern = /(?:dia\s*chi|địa\s*chỉ|address|d\/c|đ\/c|dc)\s*:/giu
  const results = []
  for (const match of sourceText.matchAll(labelPattern)) {
    const before = sourceText.slice(Math.max(0, match.index - 220), match.index)
    const beforeParts = before
      .split(/[\r\n]+/u)
      .map((part) => part.trim())
      .filter(Boolean)
    const candidate = safePlaceContext(beforeParts.at(-1), source)
    if (candidate) results.push(candidate)
  }
  return results
}

function contextBeforeAddressNumber(text, candidateAddress, source) {
  const sourceText = safeString(text)
  const token = firstHouseToken(candidateAddress)
  if (!sourceText || !token) return []

  const index = sourceText.indexOf(token)
  if (index < 0) return []

  const before = sourceText.slice(Math.max(0, index - 180), index)
  const sameLine = before.split(/[\r\n]+/u).at(-1) || ''
  const afterLastColon = sameLine.split(':').at(-1) || sameLine
  const candidate = safePlaceContext(afterLastColon, source)
  return candidate ? [candidate] : []
}

function titlePlaceContext(title) {
  const text = safeString(title)
    .replace(/#[\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+(?:#|review|food review)\b/iu)[0]
    .split(/\s+(?:\/\/|\|| - )\s+/u)[0]
    .trim()
  const candidate = safePlaceContext(text, 'title')
  return candidate ? [candidate] : []
}

export function extractPlacesQueryContexts({
  metadata = {},
  candidateAddress = '',
} = {}) {
  const description = metadata.descriptionRawFromYoutube || metadata.description || ''
  const sources = [
    ...contextBeforeAddressLabel(description, 'description'),
    ...contextBeforeAddressNumber(description, candidateAddress, 'description'),
    ...contextBeforeAddressLabel(metadata.pageMetadataText, 'page_metadata'),
    ...contextBeforeAddressNumber(metadata.pageMetadataText, candidateAddress, 'page_metadata'),
    ...contextBeforeAddressLabel(metadata.title, 'title'),
    ...contextBeforeAddressNumber(metadata.title, candidateAddress, 'title'),
    ...titlePlaceContext(metadata.title),
  ]
  return uniqueByText(sources, (item) => item.name).slice(0, 2)
}

export function buildPlacesQueryAttempts({
  candidateAddress = '',
  normalizedAddress = '',
  metadata = {},
  placeNameContexts = null,
} = {}) {
  const address = capText(normalizedAddress || candidateAddress, 300)
  if (!address) return []

  const contexts = Array.isArray(placeNameContexts)
    ? placeNameContexts
    : extractPlacesQueryContexts({ metadata, candidateAddress: candidateAddress || address })

  const contextualAttempts = uniqueByText(contexts, (item) => item.name)
    .slice(0, 2)
    .map((context) => ({
      textQuery: `${context.name}, ${address}`,
      contextName: context.name,
      contextSource: context.source,
      endpoint: TEXT_SEARCH_URL,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
    }))

  return uniqueByText([
    ...contextualAttempts,
    {
      textQuery: address,
      contextName: null,
      contextSource: null,
      endpoint: TEXT_SEARCH_URL,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
    },
  ], (item) => item.textQuery).slice(0, MAX_QUERY_ATTEMPTS)
}

async function fetchPlaceDetails({
  placeId,
  googlePlacesApiKey,
  fetch,
  apiKeyPresent,
}) {
  const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: baseHeaders(googlePlacesApiKey, DETAILS_FIELD_MASK),
  })
  return readJsonResponse(response, {
    endpoint,
    textQuery: '',
    fieldMask: DETAILS_FIELD_MASK,
    apiKeyPresent,
  })
}

function providerErrorResult(diagnostic) {
  return {
    status: 'PLACES_PROVIDER_ERROR',
    candidates: [],
    raw: null,
    error: 'PLACES_PROVIDER_ERROR',
    diagnostics: [diagnostic].filter(Boolean),
    queryAttempts: [],
    placeNameContexts: [],
  }
}

export async function confirmAddressWithPlaces({
  normalizedAddress,
  candidateAddress = '',
  metadata = {},
  placeNameContexts = null,
  shopName = '',
  googlePlacesApiKey,
  fetch,
} = {}) {
  const address = safeString(normalizedAddress || candidateAddress)
  const apiKey = safeString(googlePlacesApiKey)
  const apiKeyPresent = Boolean(apiKey)

  if (!address) {
    return providerErrorResult(providerDiagnostic({
      endpoint: TEXT_SEARCH_URL,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
      apiKeyPresent,
      error: 'missing_address',
    }))
  }
  if (!apiKey) {
    return providerErrorResult(providerDiagnostic({
      endpoint: TEXT_SEARCH_URL,
      textQuery: address,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
      apiKeyPresent,
      error: 'missing_api_key',
    }))
  }
  if (typeof fetch !== 'function') {
    return providerErrorResult(providerDiagnostic({
      endpoint: TEXT_SEARCH_URL,
      textQuery: address,
      fieldMask: TEXT_SEARCH_FIELD_MASK,
      apiKeyPresent,
      error: 'fetch_unavailable',
    }))
  }

  const contexts = Array.isArray(placeNameContexts)
    ? placeNameContexts
    : extractPlacesQueryContexts({
        metadata: {
          ...metadata,
          title: metadata.title || shopName,
        },
        candidateAddress: candidateAddress || address,
      })
  const queryAttempts = buildPlacesQueryAttempts({
    candidateAddress: candidateAddress || address,
    normalizedAddress: address,
    metadata: {
      ...metadata,
      title: metadata.title || shopName,
    },
    placeNameContexts: contexts,
  })

  const candidatesById = new Map()
  const diagnostics = []

  try {
    for (const attempt of queryAttempts) {
      const response = await fetch(TEXT_SEARCH_URL, {
        method: 'POST',
        headers: baseHeaders(apiKey, TEXT_SEARCH_FIELD_MASK),
        body: JSON.stringify({
          textQuery: attempt.textQuery,
          languageCode: 'vi',
          regionCode: 'VN',
          pageSize: 5,
        }),
      })
      const payload = await readJsonResponse(response, {
        endpoint: TEXT_SEARCH_URL,
        textQuery: attempt.textQuery,
        fieldMask: TEXT_SEARCH_FIELD_MASK,
        apiKeyPresent,
      })
      const textSearchCandidates = Array.isArray(payload.places)
        ? payload.places.map(mapPlace).filter((place) => place.placeId)
        : []

      for (const candidate of textSearchCandidates) {
        if (!candidatesById.has(candidate.placeId)) {
          candidatesById.set(candidate.placeId, {
            ...candidate,
            queryText: attempt.textQuery,
            queryContextName: attempt.contextName,
            queryContextSource: attempt.contextSource,
          })
        }
      }
    }

    const candidates = []
    for (const candidate of candidatesById.values()) {
      try {
        const details = await fetchPlaceDetails({
          placeId: candidate.placeId,
          googlePlacesApiKey: apiKey,
          fetch,
          apiKeyPresent,
        })
        candidates.push({
          ...candidate,
          ...mapPlace({ ...candidate, ...details }),
          placeId: candidate.placeId,
        })
      } catch (error) {
        if (error?.diagnostic) diagnostics.push(error.diagnostic)
        candidates.push(candidate)
      }
    }

    return {
      status: candidates.length ? 'PLACES_CANDIDATES_RETURNED' : 'PLACES_EMPTY_RESULT',
      candidates,
      raw: null,
      queryAttempts,
      placeNameContexts: contexts,
      diagnostics,
    }
  } catch (error) {
    return {
      status: 'PLACES_PROVIDER_ERROR',
      candidates: [],
      raw: null,
      error: 'PLACES_PROVIDER_ERROR',
      diagnostics: [
        error?.diagnostic ||
          providerDiagnostic({
            endpoint: TEXT_SEARCH_URL,
            textQuery: queryAttempts[0]?.textQuery || address,
            fieldMask: TEXT_SEARCH_FIELD_MASK,
            apiKeyPresent,
            error: error?.message || 'provider_error',
          }),
      ],
      queryAttempts,
      placeNameContexts: contexts,
    }
  }
}

export const __shortsPlacesConfirmTestUtils = {
  DETAILS_FIELD_MASK,
  MAX_QUERY_ATTEMPTS,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_URL,
  buildPlacesQueryAttempts,
  extractPlacesQueryContexts,
}

export default {
  confirmAddressWithPlaces,
}
