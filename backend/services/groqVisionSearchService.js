import OpenAI from 'openai'
import sharp from 'sharp'
import { findRecipesByFilters } from './recipeStructuredService.js'
import { searchRestaurants } from './restaurantStructuredService.js'

const DEFAULT_MODEL = 'qwen/qwen3.6-27b'
const DEFAULT_TIMEOUT_MS = 16_000
const MAX_CANDIDATES = 3
const GENERIC_RECIPE_MATCH_TOKENS = new Set([
  'dish',
  'food',
  'indian',
  'vietnamese',
  'thai',
  'chinese',
  'japanese',
  'korean',
  'italian',
  'mexican',
])

let groqVisionClient = null

export class GroqVisionSearchError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'GroqVisionSearchError'
    this.code = options.code || 'groq_vision_failed'
    this.statusCode = options.statusCode || 502
    this.detail = options.detail || message
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/```(?:json)?|```/giu, '')
    .trim()
}

function boundedConfidence(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  const normalized = parsed > 1 ? parsed / 100 : parsed
  return Math.max(0, Math.min(1, normalized))
}

function normalizeCandidate(value) {
  const name = String(value?.name || '').replace(/\s+/gu, ' ').trim().slice(0, 120)
  if (!name) return null

  const alternatives = Array.isArray(value?.alternative_names)
    ? value.alternative_names
        .map((item) => String(item || '').replace(/\s+/gu, ' ').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 4)
    : []

  return {
    name,
    alternativeNames: [...new Set(alternatives)],
    confidence: boundedConfidence(value?.confidence),
    evidence: String(value?.evidence || '').replace(/\s+/gu, ' ').trim().slice(0, 240),
  }
}

export function parseGroqVisionResponse(content) {
  let parsed
  try {
    parsed = JSON.parse(normalizeText(content))
  } catch {
    throw new GroqVisionSearchError('The vision provider returned an unreadable response.', {
      code: 'invalid_provider_response',
    })
  }

  const candidates = (Array.isArray(parsed?.candidates) ? parsed.candidates : [])
    .map(normalizeCandidate)
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CANDIDATES)

  return {
    isFood: parsed?.is_food === true || String(parsed?.is_food).toLowerCase() === 'true',
    foodScore: boundedConfidence(parsed?.food_score),
    candidates,
  }
}

function getGroqVisionClient() {
  const apiKey = String(process.env.GROQ_API_KEY || '').trim()
  if (!apiKey) {
    throw new GroqVisionSearchError('Image search is not configured on this deployment.', {
      code: 'provider_not_configured',
      statusCode: 503,
    })
  }

  if (!groqVisionClient) {
    groqVisionClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: Number(process.env.GROQ_VISION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      maxRetries: 0,
    })
  }

  return groqVisionClient
}

export function isGroqVisionConfigured() {
  return Boolean(String(process.env.GROQ_API_KEY || '').trim())
}

function providerError(error) {
  if (error instanceof GroqVisionSearchError) return error

  const status = Number(error?.status || error?.response?.status || 0)
  if (status === 429) {
    return new GroqVisionSearchError('Image search quota is temporarily unavailable.', {
      code: 'provider_quota',
      statusCode: 429,
    })
  }
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNABORTED') {
    return new GroqVisionSearchError('The image provider took too long to respond.', {
      code: 'provider_timeout',
      statusCode: 504,
    })
  }

  return new GroqVisionSearchError('The image provider could not analyze this image.', {
    code: 'provider_failed',
    statusCode: status >= 400 && status < 500 ? 502 : status || 502,
  })
}

async function compactImageDataUrl(file) {
  try {
    const jpeg = await sharp(file.buffer, { animated: false })
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    throw new GroqVisionSearchError('The uploaded image could not be decoded.', {
      code: 'invalid_image',
      statusCode: 400,
    })
  }
}

function validateRemoteImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
    if (url.toString().length > 2048) throw new Error('URL too long')
    return url.toString()
  } catch {
    throw new GroqVisionSearchError('A valid public HTTP image URL is required.', {
      code: 'invalid_image_url',
      statusCode: 400,
    })
  }
}

export async function analyzeFoodImage(imageUrl, options = {}) {
  const client = options.client || getGroqVisionClient()
  const model = options.model || process.env.GROQ_VISION_MODEL || DEFAULT_MODEL

  try {
    const response = await client.chat.completions.create({
      model,
      reasoning_effort: 'none',
      temperature: 0.1,
      max_completion_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You identify prepared food from visible evidence only. Return JSON only. Do not guess a restaurant, filming location, brand, or exact regional dish when the image is ambiguous.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Analyze the food image. Return {"is_food":boolean,"food_score":number,"candidates":[{"name":string,"alternative_names":string[],"confidence":number,"evidence":string}]}. Give at most 3 dish candidates ordered by confidence. Use Vietnamese and English alternative names when supported by visible evidence. If uncertain, use a broader food name or an empty candidates list.',
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    })

    const content = response?.choices?.[0]?.message?.content
    return {
      ...parseGroqVisionResponse(content),
      model: response?.model || model,
    }
  } catch (error) {
    throw providerError(error)
  }
}

function legacyRecipe(recipe, confidence) {
  return {
    source_type: 'recipe',
    source_id: recipe.id,
    title: recipe.title,
    image_url: recipe.image_url || null,
    avg_rating: Number(recipe.avg_rating || 0),
    category: recipe.category_name || null,
    district: null,
    similarity: Math.round(confidence * 1000) / 1000,
  }
}

function legacyRestaurant(restaurant, confidence) {
  return {
    source_type: 'restaurant',
    source_id: restaurant.id,
    title: restaurant.name,
    image_url: restaurant.image_url || null,
    avg_rating: Number(restaurant.avg_rating || 0),
    category: restaurant.category || null,
    district: restaurant.district || null,
    similarity: Math.round(confidence * 1000) / 1000,
  }
}

function addUnique(target, seen, result) {
  const key = `${result.source_type}:${result.source_id}`
  if (seen.has(key)) return
  seen.add(key)
  target.push(result)
}

function matchingTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .match(/[a-z0-9]+/gu) || []
}

function recipeTitleMatchesVisionTerm(title, term) {
  const titleTokens = new Set(matchingTokens(title))
  const termTokens = matchingTokens(term)
    .filter((token) => !GENERIC_RECIPE_MATCH_TOKENS.has(token))
  if (!termTokens.length) return false

  const matched = termTokens.filter((token) => titleTokens.has(token)).length
  return matched >= Math.min(2, termTokens.length)
}

export async function matchVisionCandidatesToFoodStory(candidates, options = {}) {
  const recipeSearch = options.recipeSearch || findRecipesByFilters
  const restaurantSearch = options.restaurantSearch || searchRestaurants
  const recipes = []
  const restaurants = []
  const seen = new Set()

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const terms = [candidate.name, ...candidate.alternativeNames]
    const confidence = Math.max(0.05, candidate.confidence - candidateIndex * 0.05)

    for (const term of terms) {
      const [recipeMatches, restaurantMatches] = await Promise.all([
        recipeSearch({ query: term }, 3),
        restaurantSearch({ dishName: term }, 3),
      ])

      for (const recipe of recipeMatches?.results || []) {
        if (!recipeTitleMatchesVisionTerm(recipe.title, term)) continue
        addUnique(recipes, seen, legacyRecipe(recipe, confidence))
      }
      if (restaurantMatches?.status === 'matched') {
        for (const restaurant of restaurantMatches.results || []) {
          addUnique(restaurants, seen, legacyRestaurant(restaurant, confidence))
        }
      }

      if (recipes.length >= 3 && restaurants.length >= 3) break
    }
    if (recipes.length >= 3 && restaurants.length >= 3) break
  }

  const selectedRecipes = recipes.slice(0, 3)
  const selectedRestaurants = restaurants.slice(0, Math.min(3, 5 - selectedRecipes.length))
  return {
    results: [...selectedRecipes, ...selectedRestaurants],
    recipes: selectedRecipes,
    restaurants: selectedRestaurants,
    total: selectedRecipes.length + selectedRestaurants.length,
  }
}

async function searchByImageUrl(imageUrl, options = {}) {
  const analysis = await analyzeFoodImage(imageUrl, options)
  if (!analysis.isFood || analysis.foodScore < 0.35) {
    return {
      results: [],
      recipes: [],
      restaurants: [],
      total: 0,
      food_score: analysis.foodScore,
      reason: 'non_food_image',
      message: 'The uploaded image does not appear to contain a food dish.',
      provider: 'groq_vision',
      provider_model: analysis.model,
      dish_candidates: analysis.candidates,
    }
  }

  const matches = await matchVisionCandidatesToFoodStory(analysis.candidates, options)
  return {
    ...matches,
    food_score: analysis.foodScore,
    provider: 'groq_vision',
    provider_model: analysis.model,
    dish_candidates: analysis.candidates,
    ...(matches.total
      ? {}
      : { message: 'The dish was recognized, but no matching FoodStory item was found.' }),
  }
}

export async function searchUploadedImageWithGroq(file, options = {}) {
  return searchByImageUrl(await compactImageDataUrl(file), options)
}

export async function searchImageUrlWithGroq(imageUrl, options = {}) {
  return searchByImageUrl(validateRemoteImageUrl(imageUrl), options)
}
