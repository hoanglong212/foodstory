import {
  detectSocialPlatform,
  extractSocialUrlSignals,
} from '../socialUrlExtractionService.js'

const GENERIC_METADATA_WORDS = new Set([
  'facebook',
  'instagram',
  'login',
  'reel',
  'reels',
  'tiktok',
  'watch',
])

function cleanText(value, maximumLength = 700) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maximumLength) : ''
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function metadataWords(value) {
  return normalizeText(value).split(' ').filter(Boolean)
}

function isGenericSocialMetadata(value) {
  const words = metadataWords(value)
  return (
    words.length > 0 &&
    words.length <= 4 &&
    words.every((word) => GENERIC_METADATA_WORDS.has(word))
  )
}

function isWeakMetadata(value) {
  const words = metadataWords(value)
  return words.length <= 1 || isGenericSocialMetadata(value)
}

function source(type, text, confidence, origin) {
  const cleaned = cleanText(text)
  if (!cleaned || isGenericSocialMetadata(cleaned)) return null
  return cleaned
    ? {
        type,
        text: cleaned,
        confidence: isWeakMetadata(cleaned)
          ? Math.min(confidence, 0.24)
          : confidence,
        source: origin,
      }
    : null
}

function unique(values) {
  const result = []
  const seen = new Set()
  for (const value of values.filter(Boolean)) {
    const key = `${value.type}:${value.text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result.slice(0, 16)
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
    700,
  )
}

function isSocialVideoUrl(value) {
  try {
    const parsed = new URL(value)
    return (
      parsed.hostname.toLowerCase() === 'fb.watch' ||
      /\/(?:reel|reels|video|videos)\//i.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

export async function resolveGenericSocialUrl(
  { url, platform = null } = {},
  {
    extractUrlSignals = extractSocialUrlSignals,
    extractionOptions = {},
  } = {},
) {
  const metadata = await extractUrlSignals({ url }, extractionOptions)
  const finalUrl = metadata.finalUrl || url || null
  const detected = platform || detectSocialPlatform(finalUrl || url)
  const publicPlatform = ['tiktok', 'instagram', 'facebook'].includes(detected)
    ? detected
    : 'generic_web'
  const origin = finalUrl || `${publicPlatform}_url`
  const textSources = unique([
    source('title', metadata.title, 0.34, origin),
    source('description', metadata.description, 0.3, origin),
    source('og_title', metadata.ogTitle, 0.46, origin),
    source('og_description', metadata.ogDescription, 0.4, origin),
    source('title', metadata.twitterTitle, 0.34, 'twitter_card'),
    source(
      'description',
      metadata.twitterDescription,
      0.3,
      'twitter_card',
    ),
  ])
  const warnings = Array.isArray(metadata.warnings)
    ? [...metadata.warnings]
    : []
  if (publicPlatform !== 'generic_web') {
    warnings.push('generic_social_metadata_limited')
  }
  if (metadata.extractionStatus !== 'success' || textSources.length === 0) {
    warnings.push('metadata_blocked_or_empty')
  } else if (textSources.every((item) => isWeakMetadata(item.text))) {
    warnings.push('weak_url_metadata')
  }
  if (
    publicPlatform !== 'generic_web' &&
    isSocialVideoUrl(finalUrl || url)
  ) {
    warnings.push('unsupported_social_video_metadata')
  }

  const mediaUrl = metadata.ogImage || metadata.twitterImage || null
  const jsonLdEvidence = (metadata.jsonLdBusinesses || [])
    .map(structuredBusinessText)
    .filter(Boolean)
    .slice(0, 5)
  return {
    platform: publicPlatform,
    sourceUrl: finalUrl,
    textSources,
    mediaSources: mediaUrl
      ? [{ type: 'og_image', url: mediaUrl, source: 'social_metadata' }]
      : [],
    warnings: [...new Set(warnings)].slice(0, 12),
    debug: {
      provider: 'generic_social',
      extractionStatus: metadata.extractionStatus || 'unknown',
      canonicalUrl: metadata.canonicalUrl || null,
      siteName: metadata.siteName || null,
      evidence: {
        title: cleanText(metadata.title, 500) || null,
        description: cleanText(metadata.description, 700) || null,
        ogTitle: cleanText(metadata.ogTitle, 500) || null,
        ogDescription: cleanText(metadata.ogDescription, 700) || null,
        jsonLdEvidence,
        thumbnailUrl: cleanText(mediaUrl, 2_048) || null,
      },
    },
  }
}

export default resolveGenericSocialUrl
