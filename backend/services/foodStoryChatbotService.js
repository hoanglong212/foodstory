import { retrieveRelevantDocumentsWithDebug } from './aiRetrievalService.js'
import { generateFoodStoryAnswer } from './groqService.js'
import { routeFoodStoryQuery } from './foodStoryQueryRouter.js'
import { handleRecipeStructuredQuery } from './recipeStructuredService.js'
import { handleRestaurantStructuredQuery } from './restaurantStructuredService.js'
import { handleUserFoodDataQuery } from './userFoodDataService.js'
import {
  buildAppHelpResponse,
  buildRecipeStructuredResponse,
  buildRestaurantStructuredResponse,
  buildRetrievalSources,
  buildUserFoodDataResponse,
  createChatbotResponse,
} from './foodStoryAnswerBuilder.js'

const CHATBOT_TOP_K = 3
const MINIMUM_GROQ_SCORE = 0.5
const GROQ_ELIGIBLE_STATUSES = new Set(['matched', 'partial_match'])
const RECIPE_STRUCTURED_INTENTS = new Set([
  'recipe_ingredient_quantity',
  'recipe_ingredient_existence',
  'recipe_serving_scale',
  'recipe_nutrition',
  'recipe_cooking_time',
  'recipe_steps',
])
const RESTAURANT_STRUCTURED_INTENTS = new Set([
  'restaurant_search',
  'restaurant_address',
  'restaurant_location',
  'restaurant_price',
  'restaurant_rating',
  'food_map_search',
])
const USER_STRUCTURED_INTENTS = new Set([
  'user_favorites',
  'user_checklists',
  'user_food_spots',
])

function finish(response) {
  console.log('[Chatbot] mode:', response.mode)
  console.log('[Chatbot] Groq called:', response.groqCalled)
  return response
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function handleStructuredRestaurant(route, context) {
  const structured = await handleRestaurantStructuredQuery(route, context)
  const response = buildRestaurantStructuredResponse(structured, route.intent)

  if (
    route.intent !== 'restaurant_search' ||
    structured.status !== 'no_exact_constraint_match'
  ) {
    return response
  }

  // SQL decides whether an exact factual match exists. Local semantic retrieval
  // is used only to improve the clearly labelled alternatives.
  const retrieval = await retrieveRelevantDocumentsWithDebug(
    context.question,
    CHATBOT_TOP_K
  )
  if (!retrieval.results.length) return response
  const alternatives = retrieval.results
    .map((item) => {
      const details = [
        item.metadata?.category,
        item.metadata?.district,
        item.metadata?.address,
      ].filter(Boolean)
      return `${item.title}${details.length ? ` (${details.join(', ')})` : ''}`
    })
    .join('; ')

  return {
    ...response,
    answer: `FoodStory does not have an exact match for that request. Closest available alternatives: ${alternatives}.`,
    message: retrieval.message,
    confidence: Number((retrieval.results[0]?.score || response.confidence).toFixed(4)),
    sources: buildRetrievalSources(retrieval.results),
  }
}

async function handleRetrievalRoute(question, route) {
  const retrieval = await retrieveRelevantDocumentsWithDebug(
    question,
    CHATBOT_TOP_K
  )
  const bestScore = retrieval.results[0]?.score || 0
  const sources = buildRetrievalSources(retrieval.results)

  console.log('[Chatbot] retrieval status:', retrieval.status)
  console.log('[Chatbot] top score:', retrieval.results?.[0]?.score)

  if (retrieval.status === 'no_exact_constraint_match') {
    return createChatbotResponse({
      answer:
        'FoodStory does not have an exact match for that request. Here are the closest available results instead.',
      mode: 'fallback',
      intent: route.intent,
      retrievalStatus: retrieval.status,
      confidence: bestScore,
      message: retrieval.message,
      sources,
      groqCalled: false,
    })
  }

  const shouldSkipGroq =
    !route.shouldUseGroq ||
    !GROQ_ELIGIBLE_STATUSES.has(retrieval.status) ||
    !retrieval.results.length ||
    bestScore < MINIMUM_GROQ_SCORE

  if (shouldSkipGroq) {
    return createChatbotResponse({
      answer: "I don't have enough reliable FoodStory data to answer that confidently.",
      mode: retrieval.results.length ? 'fallback' : 'no_data',
      intent: route.intent,
      retrievalStatus: retrieval.status,
      confidence: bestScore,
      message: retrieval.message,
      sources,
      groqCalled: false,
    })
  }

  try {
    const answer = await generateFoodStoryAnswer({
      question,
      contexts: retrieval.results,
    })

    return createChatbotResponse({
      answer,
      mode: 'grounded_rag',
      intent: route.intent,
      retrievalStatus: retrieval.status,
      confidence: bestScore,
      message: retrieval.message,
      sources,
      groqCalled: true,
    })
  } catch (error) {
    console.error('[Chatbot] grounded answer generation failed:', error.message)
    const topTitles = retrieval.results
      .slice(0, CHATBOT_TOP_K)
      .map((item) => item.title)
      .join(', ')

    return createChatbotResponse({
      answer: `FoodStory found relevant results, but the grounded answer generator is currently unavailable. Top matches: ${topTitles}.`,
      mode: 'fallback',
      intent: route.intent,
      retrievalStatus: retrieval.status,
      confidence: bestScore,
      message: 'Retrieval succeeded, but grounded answer generation failed.',
      sources,
      groqCalled: true,
    })
  }
}

export async function askFoodStoryChatbot(question, context = {}) {
  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('Question is required')
  }

  const normalizedContext = {
    lastRecipeId: normalizeOptionalId(context.lastRecipeId),
    lastRecipeTitle:
      typeof context.lastRecipeTitle === 'string'
        ? context.lastRecipeTitle.trim().slice(0, 255) || null
        : null,
    lastRestaurantId: normalizeOptionalId(context.lastRestaurantId),
    userId: normalizeOptionalId(context.userId),
  }
  const route = routeFoodStoryQuery(question, normalizedContext)

  console.log('[Router] intent:', route.intent)
  console.log('[Router] entities:', route.entities)

  if (route.intent === 'app_help') {
    return finish(buildAppHelpResponse(route))
  }

  if (USER_STRUCTURED_INTENTS.has(route.intent)) {
    if (!normalizedContext.userId) {
      return finish(
        createChatbotResponse({
          answer: 'Please log in to access your saved FoodStory data.',
          mode: 'login_required',
          intent: route.intent,
          retrievalStatus: 'not_used',
          confidence: route.confidence,
          message: 'Authentication is required for private FoodStory data.',
          sources: [],
          groqCalled: false,
        })
      )
    }

    const result = await handleUserFoodDataQuery(
      route.intent,
      normalizedContext.userId,
      route.entities
    )
    return finish(buildUserFoodDataResponse(result, route.intent))
  }

  if (RECIPE_STRUCTURED_INTENTS.has(route.intent)) {
    const result = await handleRecipeStructuredQuery(route, normalizedContext)
    return finish(buildRecipeStructuredResponse(result, route.intent))
  }

  if (RESTAURANT_STRUCTURED_INTENTS.has(route.intent)) {
    const response = await handleStructuredRestaurant(route, {
      ...normalizedContext,
      question,
    })
    return finish(response)
  }

  if (route.shouldUseRetrieval) {
    return finish(await handleRetrievalRoute(question, route))
  }

  return finish(
    createChatbotResponse({
      answer:
        'I can help with FoodStory recipes, ingredients, nutrition, cooking times, restaurants, and the food map. Please make the request more specific.',
      mode: 'fallback',
      intent: route.intent,
      retrievalStatus: 'not_used',
      confidence: route.confidence,
      message: 'The query router could not identify a reliable FoodStory action.',
      sources: [],
      groqCalled: false,
    })
  )
}
