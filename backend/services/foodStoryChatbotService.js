import { retrieveRelevantDocumentsWithDebug } from './aiRetrievalService.js'
import { generateFoodStoryAnswer } from './groqService.js'
import { routeFoodStoryQuery } from './foodStoryQueryRouter.js'
import { resolveFoodStorySemanticRoute } from './foodStorySemanticRouterService.js'
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
  'recipe_by_ingredients',
  'recipe_ingredients',
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

function finish(response, context = {}) {
  console.log('[Chatbot] mode:', response.mode)
  console.log('[Chatbot] Groq called:', response.groqCalled)
  const recipeSource = response.sources?.find(
    (source) => source.sourceType === 'recipe' && normalizeOptionalId(source.sourceId)
  )
  const restaurantSource = response.sources?.find(
    (source) =>
      source.sourceType === 'restaurant' && normalizeOptionalId(source.sourceId)
  )
  return {
    ...response,
    conversationContext: {
      lastRecipeId:
        normalizeOptionalId(recipeSource?.sourceId) || context.lastRecipeId || null,
      lastRecipeTitle:
        (typeof recipeSource?.title === 'string' && recipeSource.title.trim()) ||
        context.lastRecipeTitle ||
        null,
      lastRestaurantId:
        normalizeOptionalId(restaurantSource?.sourceId) ||
        context.lastRestaurantId ||
        null,
    },
  }
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeConversationHistory(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(-12)
    .map((entry) => {
      const role = entry?.role === 'assistant' || entry?.role === 'bot'
        ? 'assistant'
        : entry?.role === 'user'
          ? 'user'
          : null
      const content = typeof entry?.content === 'string'
        ? entry.content.trim().slice(0, 600)
        : ''
      if (!role || !content) return null
      const sources = Array.isArray(entry.sources)
        ? entry.sources.slice(0, 3).map((source) => ({
            sourceType: ['recipe', 'restaurant', 'food_spot'].includes(
              source?.sourceType
            )
              ? source.sourceType
              : null,
            sourceId: normalizeOptionalId(source?.sourceId),
            title:
              typeof source?.title === 'string'
                ? source.title.trim().slice(0, 255)
                : null,
          })).filter((source) => source.sourceType && source.sourceId)
        : []
      return {
        role,
        content,
        intent: typeof entry?.intent === 'string' ? entry.intent.slice(0, 80) : null,
        sources,
      }
    })
    .filter(Boolean)
}

function deriveContextFromHistory(history) {
  const context = {
    lastRecipeId: null,
    lastRecipeTitle: null,
    lastRestaurantId: null,
    pendingIntent: null,
  }
  let checkedLatestAssistant = false
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (!checkedLatestAssistant && entry.role === 'assistant') {
      checkedLatestAssistant = true
      const normalizedContent = entry.content
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
      if (
        entry.intent === 'recipe_serving_scale' &&
        /how many servings|bao nhieu (?:khau phan|phan|nguoi)/.test(
          normalizedContent
        )
      ) {
        context.pendingIntent = 'recipe_serving_scale'
      }
    }
    for (const source of entry.sources || []) {
      if (!context.lastRecipeId && source.sourceType === 'recipe') {
        context.lastRecipeId = source.sourceId
        context.lastRecipeTitle = source.title
      }
      if (!context.lastRestaurantId && source.sourceType === 'restaurant') {
        context.lastRestaurantId = source.sourceId
      }
    }
    if (context.lastRecipeId && context.lastRestaurantId && context.pendingIntent) break
  }
  return context
}

async function handleStructuredRestaurant(route, context) {
  const structured = await handleRestaurantStructuredQuery(route, context)
  const response = buildRestaurantStructuredResponse(structured, route)

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

async function handleRetrievalRoute(question, route, context = {}) {
  const vietnamese = route.entities.responseLanguage === 'vi'
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
        vietnamese
          ? 'FoodStory chưa có kết quả khớp chính xác. Đây là những kết quả gần nhất để bạn tham khảo.'
          : 'FoodStory does not have an exact match for that request. Here are the closest available results instead.',
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
      answer: vietnamese
        ? 'Tôi chưa có đủ dữ liệu FoodStory đáng tin cậy để trả lời chắc chắn.'
        : "I don't have enough reliable FoodStory data to answer that confidently.",
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
      responseLanguage: route.entities.responseLanguage,
      conversationHistory: context.conversationHistory,
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
      answer: vietnamese
        ? `FoodStory đã tìm thấy dữ liệu liên quan nhưng bộ tạo câu trả lời hiện không khả dụng. Kết quả gần nhất: ${topTitles}.`
        : `FoodStory found relevant results, but the grounded answer generator is currently unavailable. Top matches: ${topTitles}.`,
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

  const conversationHistory = normalizeConversationHistory(
    context.conversationHistory
  )
  const historyContext = deriveContextFromHistory(conversationHistory)
  const normalizedContext = {
    lastRecipeId:
      normalizeOptionalId(context.lastRecipeId) || historyContext.lastRecipeId,
    lastRecipeTitle:
      typeof context.lastRecipeTitle === 'string'
        ? context.lastRecipeTitle.trim().slice(0, 255) || null
        : historyContext.lastRecipeTitle,
    lastRestaurantId:
      normalizeOptionalId(context.lastRestaurantId) ||
      historyContext.lastRestaurantId,
    userId: normalizeOptionalId(context.userId),
    pendingIntent:
      context.pendingIntent === 'recipe_serving_scale'
        ? context.pendingIntent
        : historyContext.pendingIntent,
    conversationHistory,
  }
  const deterministicRoute = routeFoodStoryQuery(question, normalizedContext)
  const semanticResolution = await resolveFoodStorySemanticRoute(
    question,
    deterministicRoute,
    normalizedContext
  )
  const route = semanticResolution.route

  console.log('[Router] intent:', route.intent)
  console.log('[Router] entities:', route.entities)
  console.log('[Router] semantic fallback:', semanticResolution.status)

  if (route.intent === 'app_help') {
    return finish(buildAppHelpResponse(route), normalizedContext)
  }

  if (USER_STRUCTURED_INTENTS.has(route.intent)) {
    if (!normalizedContext.userId) {
      return finish(
        createChatbotResponse({
          answer:
            route.entities.responseLanguage === 'vi'
              ? 'Vui lòng đăng nhập để xem dữ liệu FoodStory đã lưu của bạn.'
              : 'Please log in to access your saved FoodStory data.',
          mode: 'login_required',
          intent: route.intent,
          retrievalStatus: 'not_used',
          confidence: route.confidence,
          message: 'Authentication is required for private FoodStory data.',
          sources: [],
          groqCalled: false,
        }),
        normalizedContext
      )
    }

    const result = await handleUserFoodDataQuery(
      route.intent,
      normalizedContext.userId,
      route.entities
    )
    return finish(buildUserFoodDataResponse(result, route), normalizedContext)
  }

  if (RECIPE_STRUCTURED_INTENTS.has(route.intent)) {
    const result = await handleRecipeStructuredQuery(route, normalizedContext)
    return finish(buildRecipeStructuredResponse(result, route), normalizedContext)
  }

  if (RESTAURANT_STRUCTURED_INTENTS.has(route.intent)) {
    const response = await handleStructuredRestaurant(route, {
      ...normalizedContext,
      question,
    })
    return finish(response, normalizedContext)
  }

  if (route.shouldUseRetrieval) {
    return finish(
      await handleRetrievalRoute(question, route, normalizedContext),
      normalizedContext
    )
  }

  return finish(
    createChatbotResponse({
      answer:
        route.entities.responseLanguage === 'vi'
          ? 'Tôi có thể giúp về công thức, nguyên liệu, dinh dưỡng, thời gian nấu, nhà hàng và Food Map. Bạn hãy nói rõ hơn điều cần tìm.'
          : 'I can help with FoodStory recipes, ingredients, nutrition, cooking times, restaurants, and the food map. Please make the request more specific.',
      mode: 'fallback',
      intent: route.intent,
      retrievalStatus: 'not_used',
      confidence: route.confidence,
      message: 'The query router could not identify a reliable FoodStory action.',
      sources: [],
      groqCalled: false,
    }),
    normalizedContext
  )
}
