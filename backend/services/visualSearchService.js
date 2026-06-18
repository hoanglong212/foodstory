import axios from 'axios'
import FormData from 'form-data'
import pool from '../db.js'

export const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || process.env.FASTAPI_URL || 'http://127.0.0.1:8000'
export const SIMILARITY_THRESHOLD = Number(
  process.env.VISION_SIMILARITY_THRESHOLD || 0.2,
)
export const FOOD_THRESHOLD = Number(process.env.VISION_FOOD_THRESHOLD || 0.55)
export const RECIPE_TEXT_WEIGHT = Number(
  process.env.VISION_RECIPE_TEXT_WEIGHT || 0.6,
)
export const TOP_K = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const IMAGE_REQUEST_TIMEOUT_MS = 15_000
const HINT_WEIGHT = 0.2

export class VisualSearchError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'VisualSearchError'
    this.code = options.code || 'visual_search_failed'
    this.detail = options.detail || message
    this.statusCode = options.statusCode || 502
  }
}

function toVisualSearchError(error) {
  if (error instanceof VisualSearchError) return error

  const upstreamStatus = Number(error.response?.status || 0)
  const detail =
    error.response?.data?.detail ||
    error.response?.data?.error ||
    error.message ||
    'The image embedding service is unavailable.'
  const timedOut = error.code === 'ECONNABORTED'
  const invalidImage = upstreamStatus === 400 || upstreamStatus === 413

  return new VisualSearchError(
    invalidImage ? 'The image could not be processed.' : 'Visual search failed.',
    {
      code: timedOut
        ? 'embedding_timeout'
        : invalidImage
          ? 'invalid_image'
          : 'embedding_unavailable',
      detail,
      statusCode: timedOut ? 504 : invalidImage ? upstreamStatus : 502,
    },
  )
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value
  if (Buffer.isBuffer(value)) value = value.toString('utf8')
  if (typeof value === 'string') return JSON.parse(value)
  return null
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let magnitudeLeft = 0
  let magnitudeRight = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index])
    const rightValue = Number(right[index])
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0
    dot += leftValue * rightValue
    magnitudeLeft += leftValue * leftValue
    magnitudeRight += rightValue * rightValue
  }

  if (magnitudeLeft === 0 || magnitudeRight === 0) return 0
  return dot / (Math.sqrt(magnitudeLeft) * Math.sqrt(magnitudeRight))
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function calculateHintPlaceMatch(hint, title) {
  const normalizedHint = normalizeText(hint)
  const normalizedTitle = normalizeText(title)
  const hintTokens = normalizedHint.split(' ').filter(Boolean)
  if (!normalizedHint || !normalizedTitle || hintTokens.length < 2) return 0
  if (normalizedHint === normalizedTitle) return 1
  if (hintTokens.length < 3) return 0
  if (
    normalizedTitle.includes(normalizedHint) ||
    normalizedHint.includes(normalizedTitle)
  ) {
    return 0.92
  }

  const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean))
  const matchedTokens = hintTokens.filter((token) => titleTokens.has(token)).length
  return matchedTokens >= 3 ? matchedTokens / hintTokens.length : 0
}

async function loadVisualRows() {
  const [rows] = await pool.execute(
    `SELECT
       ae.source_type,
       ae.source_id,
       COALESCE(ae.source_title, r.title, rest.name) AS source_title,
       ae.embedding AS clip_text_embedding,
       ae.image_embedding,
       ae.image_url,
       CASE
         WHEN ae.source_type = 'recipe' THEN COALESCE(rating_stats.average_rating, 0)
         WHEN ae.source_type = 'restaurant' THEN rest.avg_rating
         ELSE 0
       END AS avg_rating,
       CASE
         WHEN ae.source_type = 'recipe' THEN category.name
         WHEN ae.source_type = 'restaurant' THEN rest.category
         ELSE NULL
       END AS category,
       CASE WHEN ae.source_type = 'restaurant' THEN rest.district ELSE NULL END AS district,
       CASE WHEN ae.source_type = 'restaurant' THEN rest.address ELSE NULL END AS address,
       CASE WHEN ae.source_type = 'restaurant' THEN rest.latitude ELSE NULL END AS latitude,
       CASE WHEN ae.source_type = 'restaurant' THEN rest.longitude ELSE NULL END AS longitude
     FROM ai_embeddings ae
     LEFT JOIN recipes r
       ON ae.source_type = 'recipe' AND ae.source_id = r.id
     LEFT JOIN categories category
       ON r.category_id = category.id
     LEFT JOIN (
       SELECT recipe_id, AVG(rating_value) AS average_rating
       FROM ratings
       GROUP BY recipe_id
     ) rating_stats
       ON rating_stats.recipe_id = r.id
     LEFT JOIN restaurants rest
       ON ae.source_type = 'restaurant' AND ae.source_id = rest.id
     WHERE ae.embedding_type = 'image'
       AND ae.image_embedding IS NOT NULL
       AND (
         (ae.source_type = 'recipe' AND r.id IS NOT NULL AND r.status = 'approved')
         OR (ae.source_type = 'restaurant' AND rest.id IS NOT NULL)
       )`,
  )

  return rows
}

function selectBalancedCandidates(ranked, topK) {
  const candidates = [
    ...ranked.filter((result) => result.sourceType === 'recipe').slice(0, 3),
    ...ranked.filter((result) => result.sourceType === 'restaurant').slice(0, 3),
  ]
  const selectedKeys = new Set(
    candidates.map((result) => `${result.sourceType}:${result.sourceId}`),
  )

  if (candidates.length < topK) {
    for (const result of ranked) {
      const key = `${result.sourceType}:${result.sourceId}`
      if (selectedKeys.has(key)) continue
      candidates.push(result)
      selectedKeys.add(key)
      if (candidates.length === topK) break
    }
  }

  return candidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, topK)
}

export async function embedUploadedImage(file) {
  const form = new FormData()
  form.append('file', file.buffer, {
    filename: file.originalname || 'upload',
    contentType: file.mimetype,
    knownLength: file.size,
  })

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/embed-image`, form, {
      headers: form.getHeaders(),
      maxBodyLength: MAX_IMAGE_BYTES + 64 * 1024,
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
    })
    return response.data
  } catch (error) {
    throw toVisualSearchError(error)
  }
}

export async function embedImageUrl(imageUrl) {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/embed-image-url`,
      { url: imageUrl },
      { timeout: IMAGE_REQUEST_TIMEOUT_MS },
    )
    return response.data
  } catch (error) {
    throw toVisualSearchError(error)
  }
}

export async function embedClipHint(hint) {
  if (!hint) return null

  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/embed-clip-text`,
      { text: hint },
      { timeout: IMAGE_REQUEST_TIMEOUT_MS },
    )
    return response.data.embedding
  } catch (error) {
    throw toVisualSearchError(error)
  }
}

export async function rankVisualCandidates(
  queryEmbedding,
  {
    hintEmbedding = null,
    hint = '',
    minimumScore = SIMILARITY_THRESHOLD,
    topK = TOP_K,
  } = {},
) {
  const rows = await loadVisualRows()
  const imageUrlCounts = new Map()

  for (const row of rows) {
    if (!row.image_url) continue
    imageUrlCounts.set(row.image_url, (imageUrlCounts.get(row.image_url) || 0) + 1)
  }

  const ranked = rows
    .map((row) => {
      let imageSimilarity = 0
      let visualTextSimilarity = 0
      let hintSimilarity = 0

      try {
        const imageEmbedding = parseEmbedding(row.image_embedding)
        const clipTextEmbedding = parseEmbedding(row.clip_text_embedding)
        imageSimilarity = cosineSimilarity(queryEmbedding, imageEmbedding)
        visualTextSimilarity = cosineSimilarity(queryEmbedding, clipTextEmbedding)

        if (hintEmbedding) {
          hintSimilarity = cosineSimilarity(
            hintEmbedding,
            clipTextEmbedding || imageEmbedding,
          )
        }
      } catch {
        imageSimilarity = 0
        visualTextSimilarity = 0
        hintSimilarity = 0
      }

      const imageScore =
        row.source_type === 'recipe' && visualTextSimilarity > 0
          ? (1 - RECIPE_TEXT_WEIGHT) * imageSimilarity +
            RECIPE_TEXT_WEIGHT * visualTextSimilarity
          : imageSimilarity
      const confidence = hintEmbedding
        ? (1 - HINT_WEIGHT) * imageScore + HINT_WEIGHT * hintSimilarity
        : imageScore

      return {
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.source_title,
        imageUrl: row.image_url,
        avgRating: Number(row.avg_rating || 0),
        category: row.category,
        district: row.district,
        address: row.address,
        latitude:
          row.latitude === null || row.latitude === undefined
            ? null
            : Number(row.latitude),
        longitude:
          row.longitude === null || row.longitude === undefined
            ? null
            : Number(row.longitude),
        confidence: roundScore(confidence),
        imageScore: roundScore(imageScore),
        hintScore: hintEmbedding ? roundScore(hintSimilarity) : null,
        hintPlaceMatch:
          row.source_type === 'restaurant'
            ? roundScore(calculateHintPlaceMatch(hint, row.source_title))
            : 0,
        duplicateImageCount: row.image_url
          ? imageUrlCounts.get(row.image_url) || 1
          : 0,
      }
    })
    .filter((result) => result.confidence >= minimumScore)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.imageScore - left.imageScore,
    )

  return {
    ranked,
    selected: selectBalancedCandidates(ranked, topK),
  }
}

function toLegacyResult(result) {
  return {
    source_type: result.sourceType,
    source_id: result.sourceId,
    title: result.title,
    image_url: result.imageUrl,
    avg_rating: result.avgRating,
    category: result.category,
    district: result.district,
    similarity: result.confidence,
  }
}

export async function searchVisualEmbeddings(queryEmbedding) {
  const { selected } = await rankVisualCandidates(queryEmbedding)
  const scored = selected.map(toLegacyResult)

  return {
    results: scored,
    recipes: scored.filter((result) => result.source_type === 'recipe').slice(0, 3),
    restaurants: scored
      .filter((result) => result.source_type === 'restaurant')
      .slice(0, 3),
    total: scored.length,
    threshold: SIMILARITY_THRESHOLD,
  }
}

export function buildLegacyNonFoodResponse(foodScore) {
  return {
    results: [],
    recipes: [],
    restaurants: [],
    total: 0,
    threshold: SIMILARITY_THRESHOLD,
    food_score: foodScore,
    reason: 'non_food_image',
    message: 'The uploaded image does not appear to contain a food dish.',
  }
}
