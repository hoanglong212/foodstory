import sharp from 'sharp'

import pool from '../../db.js'
import { fetchPublicImageBuffer } from '../socialUrlExtractionService.js'
import { normalizeDiscoveryText } from '../foodMapExistenceService.js'
import { normalizeVisionAutoUrl } from './visionAutoUrlPolicyService.js'
import { fetchVisionMetadata } from './visionMetadataHypothesisService.js'

const MAX_CANDIDATES = 3
const MAX_RESULTS = 8
const GENERIC_DISHES = new Set([
  'food',
  'dish',
  'meal',
  'restaurant food',
  'vietnamese food',
  'asian food',
])

const DISH_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    titleDishName: {
      type: 'string',
      nullable: true,
      description: 'The specific dish explicitly named in the public video title, without locations or hashtags.',
    },
    candidates: {
      type: 'array',
      maxItems: MAX_CANDIDATES,
      items: {
        type: 'object',
        properties: {
          dishName: { type: 'string' },
          cuisine: { type: 'string', nullable: true },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          aliases: { type: 'array', maxItems: 6, items: { type: 'string' } },
          visualEvidence: { type: 'array', maxItems: 4, items: { type: 'string' } },
        },
        required: ['dishName', 'cuisine', 'confidence', 'aliases', 'visualEvidence'],
      },
    },
  },
  required: ['titleDishName', 'candidates'],
}

function capText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maxLength)
}

function uniqueTexts(values, maxItems, maxLength) {
  const seen = new Set()
  return (Array.isArray(values) ? values : [])
    .map((value) => capText(value, maxLength))
    .filter((value) => {
      const normalized = normalizeDiscoveryText(value)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .slice(0, maxItems)
}

function sanitizeCandidates(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : [])
    .map((candidate, index) => {
      const dishName = capText(candidate?.dishName, 120)
      const normalized = normalizeDiscoveryText(dishName)
      const confidence = Number(candidate?.confidence)
      if (
        !normalized ||
        GENERIC_DISHES.has(normalized) ||
        !Number.isFinite(confidence) ||
        confidence < 0.35 ||
        seen.has(normalized)
      ) return null
      seen.add(normalized)
      return {
        id: `dish:${index + 1}:${normalized.replace(/\s+/gu, '-')}`,
        dishName,
        cuisine: capText(candidate?.cuisine, 80) || null,
        confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 1000) / 1000,
        aliases: uniqueTexts(candidate?.aliases, 6, 120),
        visualEvidence: uniqueTexts(candidate?.visualEvidence, 4, 160),
        evidenceSource: 'thumbnail',
        evidenceLabel: 'Thumbnail evidence',
        reviewRequired: true,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CANDIDATES)
}

function inferTitleDishPhrase(title) {
  const source = capText(String(title || '').split('#')[0], 400)
    .replace(/\s+(?:\||[-–—])\s+.*$/u, '')
    .trim()
  if (!source) return ''

  const patterns = [
    /(?:^|\s)(?:món|mon)\s+(.+)$/iu,
    /(?:^|\s)(?:cách làm|cach lam)\s+(.+)$/iu,
    /(?:^|\s)(?:how to make|recipe(?:\s+for)?|making)\s*:?\s+(.+)$/iu,
  ]
  const match = patterns.map((pattern) => source.match(pattern)).find(Boolean)
  const phrase = capText(match?.[1], 120)
  const normalized = normalizeDiscoveryText(phrase)
  const wordCount = normalized.split(' ').filter(Boolean).length
  if (!normalized || GENERIC_DISHES.has(normalized) || wordCount > 10) return ''
  return phrase
}

function titleDishNamedInMetadata(modelResult, metadata) {
  const title = capText(metadata?.title, 400)
  const normalizedTitle = normalizeDiscoveryText(title)
  const modelTitleDish = capText(modelResult?.titleDishName, 120)
  const normalizedModelDish = normalizeDiscoveryText(modelTitleDish)

  if (
    normalizedModelDish &&
    !GENERIC_DISHES.has(normalizedModelDish) &&
    normalizedTitle.includes(normalizedModelDish)
  ) {
    return modelTitleDish
  }

  return inferTitleDishPhrase(title)
}

function candidateMatchesDish(candidate, dishName) {
  const normalizedDish = normalizeDiscoveryText(dishName)
  if (!normalizedDish) return false
  return [candidate?.dishName, ...(candidate?.aliases || [])].some((value) => {
    const normalizedValue = normalizeDiscoveryText(value)
    return (
      normalizedValue === normalizedDish ||
      normalizedValue.includes(normalizedDish) ||
      normalizedDish.includes(normalizedValue)
    )
  })
}

function buildDishCandidates(modelResult, metadata) {
  const visualCandidates = sanitizeCandidates(modelResult?.candidates)
  const titleDishName = titleDishNamedInMetadata(modelResult, metadata)
  if (!titleDishName) return visualCandidates

  const matchingIndex = visualCandidates.findIndex((candidate) =>
    candidateMatchesDish(candidate, titleDishName),
  )
  const matchingCandidate = matchingIndex >= 0 ? visualCandidates[matchingIndex] : null
  const normalized = normalizeDiscoveryText(titleDishName)
  const titleCandidate = {
    id: `dish:title:${normalized.replace(/\s+/gu, '-')}`,
    dishName: titleDishName,
    cuisine: matchingCandidate?.cuisine || null,
    confidence: Math.max(0.9, Number(matchingCandidate?.confidence) || 0),
    aliases: matchingCandidate?.aliases || [],
    visualEvidence: matchingCandidate?.visualEvidence?.length
      ? matchingCandidate.visualEvidence
      : ['Named explicitly in the public video title'],
    evidenceSource: matchingCandidate ? 'title_and_thumbnail' : 'title',
    evidenceLabel: matchingCandidate ? 'Title and thumbnail evidence' : 'Title evidence',
    reviewRequired: true,
  }

  return [
    titleCandidate,
    ...visualCandidates.filter((_, index) => index !== matchingIndex),
  ].slice(0, MAX_CANDIDATES)
}

function responseText(payload) {
  return (Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
    : [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function parseJson(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  return JSON.parse(source)
}

export async function invokeDishVisionGemini({
  imageBuffer,
  metadata = null,
  apiKey = process.env.GEMINI_API_KEY || '',
  model = process.env.GEMINI_MODEL || '',
  timeoutMs = Number(process.env.VISION_DISH_DISCOVERY_TIMEOUT_MS || 15_000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey || !model) {
    const error = new Error('Dish recognition is not configured.')
    error.code = 'dish_provider_not_configured'
    throw error
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    const prompt = [
      'Identify up to three specific dishes visibly supported by this food-video thumbnail.',
      'First extract titleDishName when the public video title explicitly names a specific dish. Remove locations, presenter names, and hashtags from that field.',
      'When titleDishName is present and the thumbnail does not clearly contradict its food category, candidate 1 must be that dish. Do not replace it with a visually similar noodle soup.',
      'Use the thumbnail to validate or add alternatives. Do not identify or infer a restaurant, address, city, or original filming location.',
      'Prefer a specific dish name over a broad cuisine. Return no candidates when the image is not sufficient.',
      metadata?.title ? `Public video title: ${capText(metadata.title, 400)}` : '',
    ].filter(Boolean).join('\n')
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are a bounded food-dish classifier. Never output place or address claims.' }],
        },
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: DISH_RESPONSE_SCHEMA,
          temperature: 0,
          topP: 0.1,
          maxOutputTokens: 4_096,
        },
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      const error = new Error('Dish recognition provider request failed.')
      error.code = response.status === 429
        ? 'dish_provider_quota'
        : response.status === 400
          ? 'dish_provider_invalid_request'
          : 'dish_provider_failed'
      error.status = Number(response.status) || null
      error.providerStatus = capText(payload?.error?.status, 80) || null
      error.providerMessage = capText(payload?.error?.message, 500) || null
      throw error
    }
    const generatedText = responseText(payload)
    try {
      return parseJson(generatedText)
    } catch (parseError) {
      parseError.code = 'dish_provider_invalid_json'
      parseError.responseExcerpt = capText(generatedText, 1_000)
      throw parseError
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Dish recognition timed out.')
      timeoutError.code = 'dish_provider_timeout'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function identifyDishFromVideoSource(
  { sourceUrl, signal = null } = {},
  {
    fetchMetadata = fetchVisionMetadata,
    fetchImage = fetchPublicImageBuffer,
    invokeModel = invokeDishVisionGemini,
  } = {},
) {
  const input = normalizeVisionAutoUrl(sourceUrl, { assetTypeHint: 'video' })
  if (input.type !== 'youtube_url') {
    const error = new Error('Dish discovery currently supports public YouTube videos and Shorts.')
    error.code = 'dish_source_unsupported'
    throw error
  }

  const metadata = await fetchMetadata(input.url)
  const thumbnailUrl = `https://i.ytimg.com/vi/${encodeURIComponent(input.videoId)}/hqdefault.jpg`
  const image = await fetchImage({ url: thumbnailUrl }, { signal, timeoutMs: 8_000, maxResponseBytes: 3_000_000 })
  if (!image?.buffer) {
    const error = new Error('The public video thumbnail could not be read.')
    error.code = 'dish_thumbnail_unavailable'
    throw error
  }
  const imageBuffer = await sharp(image.buffer)
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer()
  const modelResult = await invokeModel({ imageBuffer, metadata, signal })
  const dishCandidates = buildDishCandidates(modelResult, metadata)

  return {
    status: dishCandidates.length ? 'dish_candidates' : 'dish_not_identified',
    source: {
      type: 'youtube_url',
      platform: 'youtube',
      videoId: input.videoId,
      url: input.url,
      title: capText(metadata?.title, 400) || null,
      thumbnailUrl,
    },
    dishCandidates,
    selectedDish: null,
    originalPlaceKnown: false,
    restaurants: [],
    warnings: dishCandidates.length ? [] : ['dish_visual_evidence_insufficient'],
  }
}

function tokens(value) {
  return normalizeDiscoveryText(value).split(' ').filter((token) => token.length > 1)
}

function dishMatchScore(queryNames, text) {
  const haystack = normalizeDiscoveryText(text)
  if (!haystack) return 0
  let best = 0
  for (const name of queryNames) {
    const normalized = normalizeDiscoveryText(name)
    if (!normalized) continue
    if (haystack.includes(normalized)) best = Math.max(best, 1)
    const queryTokens = tokens(normalized)
    if (!queryTokens.length) continue
    const shared = queryTokens.filter((token) => haystack.includes(token)).length
    best = Math.max(best, shared / queryTokens.length)
  }
  return best
}

function distanceKm(origin, place) {
  const lat1 = Number(origin?.lat)
  const lng1 = Number(origin?.lng)
  const lat2 = Number(place?.latitude)
  const lng2 = Number(place?.longitude)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  const rad = (value) => (value * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

async function loadLocalPlaces(database = pool, timeoutMs = 6_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('FoodStory place search timed out.')
      error.code = 'dish_database_timeout'
      reject(error)
    }, Math.max(1_000, timeoutMs))
  })
  const queries = Promise.all([
    database.execute(`SELECT id, name, address, district, category, latitude, longitude, avg_rating, price_range, description, featured_dish, image_url, source_url, DATE_FORMAT(verified_at, '%Y-%m-%d') AS verified_at FROM restaurants WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 500`),
    database.execute(`SELECT id, name, dish_name, category, district, latitude, longitude, rating FROM food_spots WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 500`),
  ])
  const [[restaurants], [spots]] = await Promise.race([queries, timeout]).finally(() => clearTimeout(timer))
  return [
    ...restaurants.map((row) => ({ ...row, sourceType: 'restaurant', rating: Number(row.avg_rating) || 0 })),
    ...spots.map((row) => ({ ...row, sourceType: 'food_spot', address: null, description: null, price_range: null, rating: Number(row.rating) || 0 })),
  ]
}

export async function searchLocalPlacesForDish(
  { dishName, aliases = [], origin = null, limit = MAX_RESULTS } = {},
  { database = pool, rows = null, timeoutMs = 6_000 } = {},
) {
  const selectedDish = capText(dishName, 120)
  if (!normalizeDiscoveryText(selectedDish)) {
    const error = new Error('Select one dish before searching for places.')
    error.code = 'dish_required'
    throw error
  }
  const names = uniqueTexts([selectedDish, ...aliases], 7, 120)
  const candidates = rows || await loadLocalPlaces(database, timeoutMs)
  const restaurants = candidates
    .map((place) => {
      const searchable = [place.dish_name, place.name, place.category, place.description].filter(Boolean).join(' ')
      const dishScore = dishMatchScore(names, searchable)
      if (dishScore < 0.45) return null
      const distance = distanceKm(origin, place)
      const rating = Math.max(0, Math.min(5, Number(place.rating) || 0))
      const distanceScore = distance === null ? 0 : Math.max(0, 1 - distance / 25)
      const rankScore = dishScore * 0.75 + (rating / 5) * 0.17 + distanceScore * 0.08
      return {
        id: `${place.sourceType}:${place.id}`,
        sourceType: place.sourceType,
        sourceId: String(place.id),
        name: capText(place.name, 150),
        dishName: capText(place.dish_name, 150) || null,
        category: capText(place.category, 80) || null,
        address: capText(place.address, 255) || null,
        district: capText(place.district, 80) || null,
        lat: Number(place.latitude),
        lng: Number(place.longitude),
        rating,
        priceRange: capText(place.price_range, 20) || null,
        distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
        dishMatchScore: Math.round(dishScore * 1000) / 1000,
        rankScore: Math.round(rankScore * 1000) / 1000,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.rankScore - left.rankScore || (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity))
    .slice(0, Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS)))

  return {
    status: restaurants.length ? 'dish_places_found' : 'dish_places_not_found',
    selectedDish: { dishName: selectedDish, aliases: names.filter((name) => normalizeDiscoveryText(name) !== normalizeDiscoveryText(selectedDish)) },
    originalPlaceKnown: false,
    searchOrigin: origin && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng))
      ? { lat: Number(origin.lat), lng: Number(origin.lng) }
      : null,
    restaurants,
    source: 'foodstory_local',
  }
}

export const __visionDishDiscoveryTestUtils = {
  sanitizeCandidates,
  inferTitleDishPhrase,
  titleDishNamedInMetadata,
  buildDishCandidates,
  dishMatchScore,
  distanceKm,
}
