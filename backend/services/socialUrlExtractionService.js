import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 3
const RAW_TEXT_SNIPPET_LENGTH = 500
const SAFE_USER_AGENT =
  'FoodStory-Metadata-Extractor/1.0 (+public metadata only)'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const BLOCKED_STATUSES = new Set([401, 403, 407, 429])
const HTML_OR_TEXT_CONTENT_TYPE =
  /^(?:text\/(?:html|plain)|application\/xhtml\+xml)\b/i
const SOCIAL_HOSTS = [
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['facebook.com', 'facebook'],
  ['fb.watch', 'facebook'],
]

function emptyExtraction(url) {
  return {
    finalUrl: null,
    platform: detectSocialPlatform(url),
    title: null,
    description: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
    canonicalUrl: null,
    siteName: null,
    rawTextSnippet: null,
    extractionStatus: 'invalid_url',
    warnings: [],
  }
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
}

function hostnameMatches(hostname, expected) {
  return hostname === expected || hostname.endsWith(`.${expected}`)
}

export function detectSocialPlatform(value) {
  try {
    const parsed = value instanceof URL ? value : new URL(value)
    const hostname = normalizeHostname(parsed.hostname).replace(/^www\./, '')
    if (!hostname) return 'unknown'

    return (
      SOCIAL_HOSTS.find(([host]) => hostnameMatches(hostname, host))?.[1] ||
      (parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? 'web'
        : 'unknown')
    )
  } catch {
    return 'unknown'
  }
}

function ipv4ToNumber(address) {
  const parts = address.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null
  }

  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  )
}

function ipv4InRange(address, start, prefixLength) {
  const addressNumber = ipv4ToNumber(address)
  const startNumber = ipv4ToNumber(start)
  if (addressNumber === null || startNumber === null) return false

  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  return (addressNumber & mask) === (startNumber & mask)
}

function expandIpv6(address) {
  let normalized = address.toLowerCase().split('%')[0]
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    const ipv4 = normalized.slice(lastColon + 1)
    const ipv4Number = ipv4ToNumber(ipv4)
    if (ipv4Number === null) return null
    normalized = `${normalized.slice(0, lastColon)}:${(
      (ipv4Number >>> 16) &
      0xffff
    ).toString(16)}:${(ipv4Number & 0xffff).toString(16)}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null

  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (
    missing < 0 ||
    (halves.length === 1 && missing !== 0) ||
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null
  }

  return [
    ...left,
    ...Array(halves.length === 2 ? missing : 0).fill('0'),
    ...right,
  ].map((part) => Number.parseInt(part, 16))
}

export function isPrivateIpAddress(address) {
  const normalized = normalizeHostname(address)
  const family = net.isIP(normalized)

  if (family === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([start, prefix]) => ipv4InRange(normalized, start, prefix))
  }

  if (family === 6) {
    const groups = expandIpv6(normalized)
    if (!groups) return true

    const isUnspecified = groups.every((group) => group === 0)
    const isLoopback =
      groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1
    const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00
    const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80
    const isMulticast = (groups[0] & 0xff00) === 0xff00
    const isDocumentation =
      groups[0] === 0x2001 && groups[1] === 0x0db8
    const isIpv4Mapped =
      groups.slice(0, 5).every((group) => group === 0) &&
      groups[5] === 0xffff

    if (isIpv4Mapped) {
      const mapped = `${groups[6] >>> 8}.${groups[6] & 255}.${
        groups[7] >>> 8
      }.${groups[7] & 255}`
      return isPrivateIpAddress(mapped)
    }

    return (
      isUnspecified ||
      isLoopback ||
      isUniqueLocal ||
      isLinkLocal ||
      isMulticast ||
      isDocumentation
    )
  }

  return true
}

function isUnsafeHostname(hostname) {
  const normalized = normalizeHostname(hostname)
  return (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    (net.isIP(normalized) > 0 && isPrivateIpAddress(normalized))
  )
}

function parsePublicUrl(value) {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch {
    return { status: 'invalid_url', warning: 'The URL is invalid.' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      status: 'unsupported_protocol',
      warning: 'Only HTTP and HTTPS URLs are supported.',
    }
  }

  if (parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    return {
      status: 'unsafe_url',
      warning: 'The URL points to a local, private, or unsafe destination.',
    }
  }

  return { parsed }
}

async function defaultResolveHostname(hostname) {
  return dns.lookup(hostname, { all: true, verbatim: true })
}

function normalizeResolvedAddresses(records) {
  const list = Array.isArray(records) ? records : [records]
  return list
    .map((record) =>
      typeof record === 'string'
        ? { address: record, family: net.isIP(record) }
        : {
            address: record?.address,
            family: Number(record?.family) || net.isIP(record?.address),
          },
    )
    .filter((record) => record.address && (record.family === 4 || record.family === 6))
}

async function resolvePublicAddress(parsed, resolveHostname) {
  const hostname = normalizeHostname(parsed.hostname)
  if (net.isIP(hostname)) {
    return isPrivateIpAddress(hostname)
      ? { status: 'unsafe_url' }
      : { address: hostname, family: net.isIP(hostname) }
  }

  let records
  try {
    records = normalizeResolvedAddresses(await resolveHostname(hostname))
  } catch (error) {
    return {
      status: 'fetch_failed',
      warning: `DNS lookup failed: ${error.code || error.message || 'unknown error'}.`,
    }
  }

  if (records.length === 0) {
    return {
      status: 'fetch_failed',
      warning: 'DNS lookup returned no usable address.',
    }
  }
  if (records.some((record) => isPrivateIpAddress(record.address))) {
    return {
      status: 'unsafe_url',
      warning: 'The hostname resolves to a private or unsafe IP address.',
    }
  }

  return records[0]
}

function requestWithPinnedAddress(
  parsed,
  {
    address,
    family,
    timeoutMs,
    maxResponseBytes,
    userAgent,
  },
) {
  return new Promise((resolve, reject) => {
    const transport = parsed.protocol === 'https:' ? https : http
    const request = transport.request(
      parsed,
      {
        method: 'GET',
        family,
        autoSelectFamily: false,
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'Accept-Encoding': 'identity',
          'User-Agent': userAgent,
          Connection: 'close',
        },
        lookup(_hostname, _options, callback) {
          callback(null, address, family)
        },
      },
      (response) => {
        const status = Number(response.statusCode || 0)
        const headers = response.headers

        if (REDIRECT_STATUSES.has(status)) {
          response.destroy()
          resolve({ status, headers, body: '' })
          return
        }

        const declaredLength = Number(headers['content-length'])
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > maxResponseBytes
        ) {
          const error = new Error('Response exceeds the metadata size limit.')
          error.code = 'RESPONSE_TOO_LARGE'
          response.destroy(error)
          reject(error)
          return
        }

        const chunks = []
        let receivedBytes = 0
        response.on('data', (chunk) => {
          receivedBytes += chunk.length
          if (receivedBytes > maxResponseBytes) {
            const error = new Error('Response exceeds the metadata size limit.')
            error.code = 'RESPONSE_TOO_LARGE'
            response.destroy(error)
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          resolve({
            status,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
        response.on('error', reject)
      },
    )

    request.setTimeout(timeoutMs, () => {
      const error = new Error('URL metadata request timed out.')
      error.code = 'ETIMEDOUT'
      request.destroy(error)
    })
    request.on('error', reject)
    request.end()
  })
}

function headerValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) || ''

  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}

async function readFetchBody(response, maxResponseBytes) {
  const declaredLength = Number(headerValue(response.headers, 'content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxResponseBytes
  ) {
    const error = new Error('Response exceeds the metadata size limit.')
    error.code = 'RESPONSE_TOO_LARGE'
    throw error
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const body = await response.text()
    if (Buffer.byteLength(body) > maxResponseBytes) {
      const error = new Error('Response exceeds the metadata size limit.')
      error.code = 'RESPONSE_TOO_LARGE'
      throw error
    }
    return body
  }

  const reader = response.body.getReader()
  const chunks = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > maxResponseBytes) {
      await reader.cancel()
      const error = new Error('Response exceeds the metadata size limit.')
      error.code = 'RESPONSE_TOO_LARGE'
      throw error
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function requestWithInjectedFetch(
  fetchImpl,
  parsed,
  { timeoutMs, maxResponseBytes, userAgent },
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(parsed.href, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'Accept-Encoding': 'identity',
        'User-Agent': userAgent,
      },
    })
    return {
      status: response.status,
      headers: response.headers,
      body: REDIRECT_STATUSES.has(response.status)
        ? ''
        : await readFetchBody(response, maxResponseBytes),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function cleanMetadataText(value, maximumLength = 2_000) {
  const cleaned = decodeHtmlEntities(String(value || ''))
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, maximumLength) : null
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, decimal, hexadecimal, entity) => {
      const numericValue = decimal
        ? Number.parseInt(decimal, 10)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : null
      if (numericValue !== null) {
        return Number.isInteger(numericValue) &&
          numericValue >= 0 &&
          numericValue <= 0x10ffff
          ? String.fromCodePoint(numericValue)
          : match
      }
      return named[entity.toLowerCase()] ?? match
    },
  )
}

function parseAttributes(source) {
  const attributes = {}
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = pattern.exec(source))) {
    attributes[match[1].toLowerCase()] =
      match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

function extractMetaValues(html) {
  const values = new Map()
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1])
    const key = String(
      attributes.property || attributes.name || attributes.itemprop || '',
    ).toLowerCase()
    if (key && attributes.content && !values.has(key)) {
      values.set(key, attributes.content)
    }
  }
  return values
}

function extractCanonicalHref(html) {
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1])
    const relationships = String(attributes.rel || '')
      .toLowerCase()
      .split(/\s+/)
    if (relationships.includes('canonical') && attributes.href) {
      return attributes.href
    }
  }
  return null
}

function safeAbsoluteMetadataUrl(value, baseUrl) {
  if (!value) return null
  try {
    const parsed = new URL(value, baseUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href.slice(0, 2_048)
      : null
  } catch {
    return null
  }
}

function extractVisibleText(html) {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch?.[1] || html
  const text = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(?:script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript|svg)>/gi,
      ' ',
    )
    .replace(/<[^>]+>/g, ' ')

  return cleanMetadataText(text, RAW_TEXT_SNIPPET_LENGTH)
}

function parseMetadata(html, finalUrl) {
  const meta = extractMetaValues(html)
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)

  return {
    title: cleanMetadataText(titleMatch?.[1], 500),
    description: cleanMetadataText(meta.get('description')),
    ogTitle: cleanMetadataText(meta.get('og:title'), 500),
    ogDescription: cleanMetadataText(meta.get('og:description')),
    ogImage: safeAbsoluteMetadataUrl(meta.get('og:image'), finalUrl),
    twitterTitle: cleanMetadataText(meta.get('twitter:title'), 500),
    twitterDescription: cleanMetadataText(meta.get('twitter:description')),
    twitterImage: safeAbsoluteMetadataUrl(
      meta.get('twitter:image') || meta.get('twitter:image:src'),
      finalUrl,
    ),
    canonicalUrl: safeAbsoluteMetadataUrl(
      extractCanonicalHref(html),
      finalUrl,
    ),
    siteName: cleanMetadataText(meta.get('og:site_name'), 300),
    rawTextSnippet: extractVisibleText(html),
  }
}

function hasExtractedMetadata(metadata) {
  return Object.values(metadata).some(Boolean)
}

function classifyRequestError(error) {
  if (
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.code === 'ETIMEDOUT'
  ) {
    return {
      extractionStatus: 'timeout',
      warning: 'The URL metadata request timed out.',
    }
  }

  return {
    extractionStatus: 'fetch_failed',
    warning:
      error?.code === 'RESPONSE_TOO_LARGE'
        ? 'The response exceeded the 1MB metadata limit.'
        : 'The public URL could not be fetched.',
  }
}

export async function extractSocialUrlSignals(
  { url } = {},
  {
    fetchImpl = null,
    resolveHostname = defaultResolveHostname,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    userAgent = SAFE_USER_AGENT,
  } = {},
) {
  const result = emptyExtraction(url)
  let currentUrl = String(url || '').trim()

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validation = parsePublicUrl(currentUrl)
    if (!validation.parsed) {
      result.extractionStatus = validation.status
      result.warnings.push(validation.warning)
      return result
    }

    const resolved = await resolvePublicAddress(
      validation.parsed,
      resolveHostname,
    )
    if (!resolved.address) {
      result.extractionStatus = resolved.status
      result.warnings.push(
        resolved.warning ||
          'The URL points to a local, private, or unsafe destination.',
      )
      return result
    }

    let response
    try {
      response = fetchImpl
        ? await requestWithInjectedFetch(fetchImpl, validation.parsed, {
            timeoutMs,
            maxResponseBytes,
            userAgent,
          })
        : await requestWithPinnedAddress(validation.parsed, {
            ...resolved,
            timeoutMs,
            maxResponseBytes,
            userAgent,
          })
    } catch (error) {
      const classified = classifyRequestError(error)
      result.extractionStatus = classified.extractionStatus
      result.warnings.push(classified.warning)
      return result
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = headerValue(response.headers, 'location')
      if (!location) {
        result.extractionStatus = 'fetch_failed'
        result.warnings.push('The URL returned a redirect without a location.')
        return result
      }
      if (redirectCount === maxRedirects) {
        result.extractionStatus = 'blocked'
        result.warnings.push('The URL exceeded the redirect limit.')
        return result
      }

      try {
        currentUrl = new URL(location, validation.parsed).href
      } catch {
        result.extractionStatus = 'fetch_failed'
        result.warnings.push('The URL returned an invalid redirect location.')
        return result
      }
      continue
    }

    result.finalUrl = validation.parsed.href
    result.platform = detectSocialPlatform(validation.parsed)

    if (BLOCKED_STATUSES.has(response.status)) {
      result.extractionStatus = 'blocked'
      result.warnings.push(
        `The site blocked public metadata access with HTTP ${response.status}.`,
      )
      return result
    }
    if (response.status < 200 || response.status >= 300) {
      result.extractionStatus = 'fetch_failed'
      result.warnings.push(
        `The site returned HTTP ${response.status || 'unknown'}.`,
      )
      return result
    }

    const contentType = headerValue(response.headers, 'content-type')
      .split(';')[0]
      .trim()
    if (!HTML_OR_TEXT_CONTENT_TYPE.test(contentType)) {
      result.extractionStatus = 'no_metadata'
      result.warnings.push(
        'The response was not HTML or plain text, so it was not parsed.',
      )
      return result
    }

    const metadata = parseMetadata(response.body, result.finalUrl)
    Object.assign(result, metadata)
    if (!hasExtractedMetadata(metadata)) {
      result.extractionStatus = 'no_metadata'
      result.warnings.push('No useful public metadata was found on the page.')
      return result
    }

    result.extractionStatus = 'success'
    if (result.platform === 'tiktok' || result.platform === 'instagram') {
      result.warnings.push(
        'TikTok and Instagram may omit captions or block public metadata requests.',
      )
    }
    return result
  }

  result.extractionStatus = 'fetch_failed'
  result.warnings.push('The URL metadata request could not be completed.')
  return result
}

export const SOCIAL_URL_EXTRACTION_LIMITS = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
  maxRedirects: DEFAULT_MAX_REDIRECTS,
})
