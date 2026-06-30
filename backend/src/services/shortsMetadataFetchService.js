import { parseShortsUrl } from './shortsAddressRouterService.js'

function getFetch(deps = {}) {
  return deps.fetch || globalThis.fetch
}

function createServiceError(code, message = code) {
  const error = new Error(message)
  error.code = code
  return error
}

function assertFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw createServiceError('FETCH_UNAVAILABLE')
  }
}

function decodeJsonLdEntities(text) {
  return String(text || '')
    .replace(/<!--|-->/gu, '')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&#39;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/gu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .trim()
}

function flattenJsonLdValue(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLdValue)
  return value && typeof value === 'object' ? [value] : []
}

export function parseJsonLdScriptTags(html = '') {
  const objects = []
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/giu

  for (const match of String(html || '').matchAll(scriptPattern)) {
    const jsonText = decodeJsonLdEntities(match[1])
    if (!jsonText) continue

    try {
      objects.push(...flattenJsonLdValue(JSON.parse(jsonText)))
    } catch {
      // Invalid JSON-LD is ignored; it must not create Track 1 evidence.
    }
  }

  return objects
}

async function readJsonResponse(response) {
  if (response && 'ok' in response && !response.ok) {
    throw createServiceError('YOUTUBE_API_ERROR')
  }
  return response && typeof response.json === 'function'
    ? response.json()
    : {}
}

async function readTextResponse(response) {
  if (response && 'ok' in response && !response.ok) {
    throw createServiceError('SHORTS_HTML_ERROR')
  }
  return response && typeof response.text === 'function'
    ? response.text()
    : ''
}

function firstYoutubeItem(apiPayload = {}) {
  return Array.isArray(apiPayload.items) && apiPayload.items.length
    ? apiPayload.items[0]
    : {}
}

export async function fetchShortsMetadata(url, deps = {}) {
  const parsed = parseShortsUrl(url)
  if (!parsed.ok) {
    throw createServiceError(parsed.reason || 'INVALID_SHORTS_URL')
  }

  const fetchImpl = getFetch(deps)
  assertFetch(fetchImpl)

  const videoId = parsed.videoId
  const canonicalShortsUrl = `https://www.youtube.com/shorts/${videoId}`
  const youtubeApiKey = String(deps.youtubeApiKey || '').trim()
  let youtubeItem = {}

  if (youtubeApiKey) {
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    apiUrl.searchParams.set('part', 'snippet,contentDetails,status')
    apiUrl.searchParams.set('id', videoId)
    apiUrl.searchParams.set('key', youtubeApiKey)

    youtubeItem = firstYoutubeItem(await readJsonResponse(await fetchImpl(apiUrl.toString())))
  }

  const html = await readTextResponse(await fetchImpl(canonicalShortsUrl))
  const snippet = youtubeItem.snippet || {}
  const contentDetails = youtubeItem.contentDetails || {}
  const status = youtubeItem.status || {}

  return {
    url,
    videoId,
    title: String(snippet.title || ''),
    description: String(snippet.description || ''),
    channelTitle: String(snippet.channelTitle || ''),
    publishedAt: String(snippet.publishedAt || ''),
    duration: String(contentDetails.duration || ''),
    privacyStatus: String(status.privacyStatus || ''),
    pageMetadataText: '',
    serpSnippet: '',
    jsonldObjects: parseJsonLdScriptTags(html),
    ocrText: '',
    asrText: '',
    metadataSource: {
      youtubeApi: Boolean(youtubeApiKey),
      shortsHtml: true,
    },
  }
}

export default {
  fetchShortsMetadata,
  parseJsonLdScriptTags,
}
