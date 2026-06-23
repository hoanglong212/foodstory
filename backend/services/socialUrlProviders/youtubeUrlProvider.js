import {
  extractSocialUrlSignals,
} from '../socialUrlExtractionService.js'

const DEFAULT_TIMEOUT_MS = 6_000
const MAX_JSON_LENGTH = 200_000
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/videos'
const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed'
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const QUOTA_REASONS = new Set([
  'dailylimitexceeded',
  'dailylimitexceededunreg',
  'quotaexceeded',
  'ratelimitexceeded',
  'userratelimitexceeded',
])
const INVALID_KEY_REASONS = new Set([
  'apikeyinvalid',
  'badrequest',
  'invalidkey',
  'keyinvalid',
])
const FORBIDDEN_REASONS = new Set([
  'accessnotconfigured',
  'forbidden',
  'insufficientpermissions',
  'iprefererblocked',
])

function cleanText(value, maximumLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, maximumLength) : null
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

function isGenericYouTubeText(value) {
  const normalized = normalizeText(value)
  return [
    'youtube',
    'youtube shorts',
    'watch',
    'watch on youtube',
    'shorts',
  ].includes(normalized)
}

function source(type, text, confidence, origin, { genericConfidence = 0.16 } = {}) {
  const cleaned = cleanText(text)
  if (!cleaned) return null
  return {
    type,
    text: cleaned,
    confidence: isGenericYouTubeText(cleaned)
      ? Math.min(confidence, genericConfidence)
      : confidence,
    source: origin,
  }
}

function uniqueSources(values) {
  const result = []
  const seen = new Set()
  for (const value of values.filter(Boolean)) {
    const key = `${value.type}:${value.text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result.slice(0, 20)
}

function metadataWordCount(value) {
  return normalizeText(value).split(' ').filter(Boolean).length
}

function structuredBusinessText(business = {}) {
  return cleanText(
    [
      business.name ? `Name: ${business.name}` : '',
      business.address ? `Address: ${business.address}` : '',
      business.telephone ? `Telephone: ${business.telephone}` : '',
      business.servesCuisine
        ? `Serves cuisine: ${business.servesCuisine}`
        : '',
      business.priceRange ? `Price range: ${business.priceRange}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  )
}

function validVideoId(value) {
  const id = String(value || '').trim()
  return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null
}

export function parseYouTubeVideoId(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
      return validVideoId(parsed.pathname.split('/').filter(Boolean)[0])
    }
    if (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com')
    ) {
      if (parsed.pathname === '/watch') {
        return validVideoId(parsed.searchParams.get('v'))
      }
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      if (pathParts[0] === 'shorts') return validVideoId(pathParts[1])
    }
  } catch {
    return null
  }
  return null
}

function boundedReasons(payload) {
  const errors = Array.isArray(payload?.error?.errors)
    ? payload.error.errors
    : []
  return [
    ...new Set(
      errors
        .map((item) => normalizeText(item?.reason))
        .filter(Boolean),
    ),
  ].slice(0, 8)
}

function providerError(code, { status = null, reasons = [] } = {}) {
  const error = new Error('YouTube metadata request failed.')
  error.code = code
  error.status = Number.isFinite(Number(status)) ? Number(status) : null
  error.reasons = Array.isArray(reasons) ? reasons.slice(0, 8) : []
  return error
}

async function readBoundedJson(
  response,
  invalidCode = 'youtube_api_invalid_response',
) {
  const text = await response.text()
  if (Buffer.byteLength(text) > MAX_JSON_LENGTH) {
    throw providerError(invalidCode)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw providerError(invalidCode)
  }
}

async function fetchJsonWithTimeout(
  url,
  { timeoutMs, fetchImpl, provider = 'youtube_api' },
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FoodStory-YouTube-Metadata/1.0',
      },
    })
    let payload
    try {
      payload = await readBoundedJson(
        response,
        `${provider}_invalid_response`,
      )
    } catch (error) {
      if (!response.ok) {
        throw providerError(`${provider}_http_error`, {
          status: response.status,
        })
      }
      throw error
    }
    if (!response.ok) {
      throw providerError(`${provider}_http_error`, {
        status: response.status,
        reasons: boundedReasons(payload),
      })
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw providerError(`${provider}_invalid_response`)
    }
    if (payload.error) {
      throw providerError(`${provider}_http_error`, {
        status: payload.error?.code,
        reasons: boundedReasons(payload),
      })
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw providerError(`${provider}_timeout`)
    }
    if (error?.code) throw error
    throw providerError(`${provider}_fetch_failed`)
  } finally {
    clearTimeout(timer)
  }
}

async function defaultFetchYouTubeApi({
  videoId,
  apiKey,
  timeoutMs,
  fetchImpl,
}) {
  const requestUrl = new URL(YOUTUBE_API_URL)
  requestUrl.searchParams.set('part', 'snippet')
  requestUrl.searchParams.set('id', videoId)
  requestUrl.searchParams.set('key', apiKey)
  return fetchJsonWithTimeout(requestUrl, {
    timeoutMs,
    fetchImpl,
    provider: 'youtube_api',
  })
}

async function defaultFetchOEmbed({
  url,
  timeoutMs,
  fetchImpl,
}) {
  const requestUrl = new URL(YOUTUBE_OEMBED_URL)
  requestUrl.searchParams.set('url', url)
  requestUrl.searchParams.set('format', 'json')
  return fetchJsonWithTimeout(requestUrl, {
    timeoutMs,
    fetchImpl,
    provider: 'youtube_oembed',
  })
}

function bestThumbnail(thumbnails = {}) {
  const value =
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  if (!value) return null
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.href.slice(0, 2_048)
      : null
  } catch {
    return null
  }
}

function validApiPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      Array.isArray(payload.items),
  )
}

function snippetFromPayload(payload) {
  if (!validApiPayload(payload)) {
    throw providerError('youtube_api_invalid_response')
  }
  if (payload.items.length === 0) return null
  const snippet = payload.items[0]?.snippet
  if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) {
    throw providerError('youtube_api_invalid_response')
  }
  for (const field of [
    'title',
    'description',
    'channelTitle',
    'publishedAt',
  ]) {
    if (
      snippet[field] !== undefined &&
      snippet[field] !== null &&
      typeof snippet[field] !== 'string'
    ) {
      throw providerError('youtube_api_invalid_response')
    }
  }
  if (
    snippet.thumbnails !== undefined &&
    snippet.thumbnails !== null &&
    (
      typeof snippet.thumbnails !== 'object' ||
      Array.isArray(snippet.thumbnails)
    )
  ) {
    throw providerError('youtube_api_invalid_response')
  }
  return {
    title: cleanText(snippet.title, 500),
    description: cleanText(snippet.description, 700),
    channelTitle: cleanText(snippet.channelTitle, 300),
    publishedAt: cleanText(snippet.publishedAt, 80),
    thumbnails:
      snippet.thumbnails &&
      typeof snippet.thumbnails === 'object' &&
      !Array.isArray(snippet.thumbnails)
        ? snippet.thumbnails
        : {},
  }
}

function youtubeApiWarning(error) {
  if (error?.code === 'youtube_api_timeout' || error?.name === 'AbortError') {
    return 'youtube_api_timeout'
  }
  if (error?.code === 'youtube_api_invalid_response') {
    return 'youtube_api_invalid_response'
  }
  if (error?.code === 'youtube_api_fetch_failed') {
    return 'youtube_api_fetch_failed'
  }
  const reasons = new Set(
    (Array.isArray(error?.reasons) ? error.reasons : [])
      .map(normalizeText)
      .filter(Boolean),
  )
  if ([...reasons].some((reason) => QUOTA_REASONS.has(reason))) {
    return 'youtube_quota_exceeded'
  }
  if ([...reasons].some((reason) => INVALID_KEY_REASONS.has(reason))) {
    return 'youtube_api_key_invalid'
  }
  if ([...reasons].some((reason) => FORBIDDEN_REASONS.has(reason))) {
    return 'youtube_api_forbidden_or_disabled'
  }
  if ([400, 401].includes(Number(error?.status))) {
    return 'youtube_api_key_invalid'
  }
  if (Number(error?.status) === 403) {
    return 'youtube_api_forbidden_or_disabled'
  }
  return 'youtube_api_fetch_failed'
}

function oembedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }
  return {
    title: cleanText(payload.title, 500),
    authorName: cleanText(payload.author_name, 300),
    thumbnailUrl: cleanText(payload.thumbnail_url, 2_048),
  }
}

export async function resolveYouTubeUrl(
  { url } = {},
  {
    extractUrlSignals = extractSocialUrlSignals,
    extractionOptions = {},
    apiKey = process.env.YOUTUBE_API_KEY || '',
    timeoutMs = Number(
      process.env.YOUTUBE_METADATA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
    fetchImpl = globalThis.fetch,
    fetchYouTubeApi = defaultFetchYouTubeApi,
    fetchOEmbed = defaultFetchOEmbed,
  } = {},
) {
  const videoId = parseYouTubeVideoId(url)
  const warnings = []
  const metadata = await extractUrlSignals({ url }, extractionOptions)
  const finalUrl = metadata.finalUrl || url || null
  let apiStatus = 'not_requested'
  let apiSnippet = null
  let oembed = null

  if (!videoId) {
    warnings.push('youtube_video_id_invalid')
  } else if (!String(apiKey).trim()) {
    warnings.push('youtube_api_key_missing')
    apiStatus = 'missing_api_key'
  } else {
    try {
      const payload = await fetchYouTubeApi({
        videoId,
        apiKey,
        timeoutMs: Math.max(200, timeoutMs),
        fetchImpl,
      })
      apiSnippet = snippetFromPayload(payload)
      apiStatus = apiSnippet ? 'success' : 'not_found'
      if (!apiSnippet) {
        warnings.push('youtube_video_not_found_or_unavailable')
      }
    } catch (error) {
      const warning = youtubeApiWarning(error)
      apiStatus = warning.replace(/^youtube_api_/, '')
      warnings.push(warning)
    }
  }

  if (!apiSnippet && videoId) {
    try {
      oembed = oembedPayload(
        await fetchOEmbed({
          url,
          timeoutMs: Math.max(200, timeoutMs),
          fetchImpl,
        }),
      )
      if (!oembed) warnings.push('youtube_oembed_unavailable')
    } catch {
      warnings.push('youtube_oembed_unavailable')
    }
  }

  const origin = finalUrl || 'youtube_url'
  const textSources = uniqueSources([
    source('youtube_title', apiSnippet?.title, 0.66, 'youtube_api'),
    source(
      'youtube_description',
      apiSnippet?.description,
      0.52,
      'youtube_api',
    ),
    source(
      'youtube_channel',
      apiSnippet?.channelTitle
        ? apiSnippet.channelTitle
        : null,
      0.28,
      'youtube_api',
    ),
    source(
      'youtube_published_at',
      apiSnippet?.publishedAt
        ? apiSnippet.publishedAt
        : null,
      0.12,
      'youtube_api',
    ),
    source('og_title', metadata.ogTitle, 0.5, origin),
    source('og_description', metadata.ogDescription, 0.42, origin),
    source('title', metadata.title, 0.38, origin),
    source('description', metadata.description, 0.34, origin),
    source('title', metadata.twitterTitle, 0.36, 'twitter_card'),
    source(
      'description',
      metadata.twitterDescription,
      0.32,
      'twitter_card',
    ),
    source('youtube_title', oembed?.title, 0.42, 'youtube_oembed'),
    source(
      'youtube_channel',
      oembed?.authorName,
      0.22,
      'youtube_oembed',
    ),
  ])
  const thumbnail =
    bestThumbnail(apiSnippet?.thumbnails) ||
    cleanText(oembed?.thumbnailUrl, 2_048) ||
    metadata.ogImage ||
    metadata.twitterImage ||
    null
  if (
    metadata.extractionStatus !== 'success' &&
    !apiSnippet &&
    !oembed
  ) {
    warnings.push('metadata_blocked_or_empty')
  }
  if (
    textSources.length > 0 &&
    textSources
      .filter((item) => item.type !== 'youtube_channel')
      .every((item) => metadataWordCount(item.text) <= 1)
  ) {
    warnings.push('weak_url_metadata')
  }
  const jsonLdEvidence = (metadata.jsonLdBusinesses || [])
    .map(structuredBusinessText)
    .filter(Boolean)
    .slice(0, 5)

  return {
    platform: 'youtube',
    sourceUrl: finalUrl,
    textSources,
    mediaSources: thumbnail
      ? [{ type: 'thumbnail', url: thumbnail, source: 'youtube_thumbnail' }]
      : [],
    warnings: [
      ...new Set([
        ...(metadata.warnings || []),
        ...warnings,
      ]),
    ].slice(0, 12),
    debug: {
      provider: 'youtube',
      videoId,
      apiStatus,
      extractionStatus: metadata.extractionStatus || 'unknown',
      oembedUsed: Boolean(oembed),
      evidence: {
        title:
          cleanText(apiSnippet?.title, 500) ||
          cleanText(metadata.title, 500) ||
          cleanText(oembed?.title, 500),
        description:
          cleanText(apiSnippet?.description) ||
          cleanText(metadata.description) ||
          null,
        channelTitle:
          cleanText(apiSnippet?.channelTitle, 300) ||
          cleanText(oembed?.authorName, 300),
        publishedAt: cleanText(apiSnippet?.publishedAt, 80),
        ogTitle: cleanText(metadata.ogTitle, 500),
        ogDescription: cleanText(metadata.ogDescription),
        jsonLdEvidence,
        thumbnailUrl: cleanText(thumbnail, 2_048),
      },
    },
  }
}

export default resolveYouTubeUrl
