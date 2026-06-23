import {
  extractSocialUrlSignals,
} from '../socialUrlExtractionService.js'

function source(type, text, confidence, origin) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  return cleaned
    ? {
        type,
        text: cleaned.slice(0, 700),
        confidence,
        source: origin,
      }
    : null
}

function structuredBusinessText(business = {}) {
  return [
    business.name ? `Name: ${business.name}` : '',
    business.address ? `Address: ${business.address}` : '',
    business.telephone ? `Telephone: ${business.telephone}` : '',
    business.servesCuisine
      ? `Serves cuisine: ${business.servesCuisine}`
      : '',
    business.priceRange ? `Price range: ${business.priceRange}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

function uniqueSources(values) {
  const sources = []
  const seen = new Set()
  for (const value of values.filter(Boolean)) {
    const key = `${value.type}:${value.text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(value)
  }
  return sources.slice(0, 20)
}

function mediaSource(type, url, origin) {
  return url
    ? {
        type,
        url,
        source: origin,
      }
    : null
}

export async function resolveBlogUrl(
  { url } = {},
  {
    extractUrlSignals = extractSocialUrlSignals,
    extractionOptions = {},
  } = {},
) {
  const metadata = await extractUrlSignals({ url }, extractionOptions)
  const finalUrl = metadata.finalUrl || url || null
  const origin = finalUrl || 'blog_url'
  const jsonLdSources = (metadata.jsonLdBusinesses || []).map((business) =>
    source('json_ld', structuredBusinessText(business), 0.72, origin),
  )
  const textSources = uniqueSources([
    source('title', metadata.title, 0.42, origin),
    source('description', metadata.description, 0.34, origin),
    source('og_title', metadata.ogTitle, 0.52, origin),
    source('og_description', metadata.ogDescription, 0.44, origin),
    source('title', metadata.twitterTitle, 0.38, 'twitter_card'),
    source(
      'description',
      metadata.twitterDescription,
      0.34,
      'twitter_card',
    ),
    ...jsonLdSources,
    source('article_text', metadata.rawTextSnippet, 0.22, origin),
  ])
  const mediaSources = [
    mediaSource('og_image', metadata.ogImage, 'open_graph'),
    mediaSource('og_image', metadata.twitterImage, 'twitter_card'),
  ].filter(Boolean)

  return {
    platform: 'blog',
    sourceUrl: finalUrl,
    textSources,
    mediaSources,
    warnings: Array.isArray(metadata.warnings) ? metadata.warnings : [],
    debug: {
      provider: 'blog',
      extractionStatus: metadata.extractionStatus || 'unknown',
      canonicalUrl: metadata.canonicalUrl || null,
      siteName: metadata.siteName || null,
      jsonLdBusinessCount: (metadata.jsonLdBusinesses || []).length,
      evidence: {
        title: metadata.title || null,
        description: metadata.description || null,
        ogTitle: metadata.ogTitle || null,
        ogDescription: metadata.ogDescription || null,
        jsonLdEvidence: jsonLdSources
          .map((item) => item?.text)
          .filter(Boolean)
          .slice(0, 5),
        thumbnailUrl: metadata.ogImage || metadata.twitterImage || null,
      },
    },
  }
}

export default resolveBlogUrl
