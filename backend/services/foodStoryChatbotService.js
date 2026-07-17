import { retrieveRelevantDocumentsWithDebug } from './aiRetrievalService.js'
import {
  generateFoodStoryAnswer,
  generateGeneralCustomerAnswer,
  generateGeneralKnowledgeAnswer,
  generateExternalFoodAnswer,
} from './groqService.js'
import { routeFoodStoryQuery } from './foodStoryQueryRouter.js'
import { resolveFoodStorySemanticRoute } from './foodStorySemanticRouterService.js'
import { answerWebsiteKnowledgeQuestion } from './foodStoryWebsiteKnowledgeService.js'
import {
  answerFoodStoryProductDataQuestion,
  detectFoodStoryProductDataIntent,
} from './foodStoryProductDataService.js'
import { handleRecipeStructuredQuery } from './recipeStructuredService.js'
import { handleRestaurantStructuredQuery } from './restaurantStructuredService.js'
import { handleUserFoodDataQuery } from './userFoodDataService.js'
import {
  buildContextualCustomerQuestion,
  buildLocalCustomerCareAnswer,
  isExternalFoodQuestion,
  isGeneralCulinaryQuestion,
  isPrivateFoodStoryQuestion,
} from './foodStoryCustomerConversationService.js'
import {
  buildAppHelpResponse,
  buildRecipeStructuredResponse,
  buildRestaurantStructuredResponse,
  buildRetrievalPresentationResults,
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
const RECIPE_GROQ_FALLBACK_STATUSES = new Set([
  'recipe_not_found',
  'no_results',
  'ingredients_not_found',
  'nutrition_not_found',
  'time_not_found',
  'unsupported',
])

export function recipeResultNeedsGroqFallback(result = {}) {
  if (
    result.kind === 'ingredient_recommendation' &&
    !result.results?.length &&
    result.status !== 'no_ingredients'
  ) {
    return true
  }
  return RECIPE_GROQ_FALLBACK_STATUSES.has(result.status)
}

async function buildGroqKnowledgeFallback(
  question,
  route,
  context = {},
  { culinary = false } = {}
) {
  const vietnamese = route.entities.responseLanguage === 'vi'
  const answer = culinary
    ? await generateGeneralCustomerAnswer({
        question,
        responseLanguage: route.entities.responseLanguage,
        conversationHistory: context.conversationHistory,
        conversationMemory: context.conversationMemory,
        activeRecipeTitle: context.lastRecipeTitle,
      })
    : await generateGeneralKnowledgeAnswer({
        question,
        responseLanguage: route.entities.responseLanguage,
        conversationHistory: context.conversationHistory,
        conversationMemory: context.conversationMemory,
      })

  return createChatbotResponse({
    answer,
    mode: culinary ? 'general_guidance' : 'general_knowledge',
    intent: culinary
      ? 'general_culinary_guidance'
      : 'general_knowledge_fallback',
    retrievalStatus: 'general_knowledge',
    confidence: culinary ? 0.65 : 0.55,
    message:
      'FoodStory had no verified answer; Groq general model knowledge was used without claiming it as FoodStory or live web data.',
    sources: [],
    results: [],
    suggestions: culinary
      ? vietnamese
        ? ['Tìm công thức phù hợp', 'Cách thay thế nguyên liệu']
        : ['Find a matching recipe', 'Ask about an ingredient swap']
      : [],
    groqCalled: true,
  })
}

async function buildExternalFoodResponse(question, route, context = {}) {
  const researched = await generateExternalFoodAnswer({
    question,
    responseLanguage: route.entities.responseLanguage,
    conversationHistory: context.conversationHistory,
    conversationMemory: context.conversationMemory,
  })
  const vietnamese = route.entities.responseLanguage === 'vi'

  return createChatbotResponse({
    answer: researched.answer,
    mode: 'external_web',
    intent: 'external_food_research',
    retrievalStatus: 'external_sources',
    confidence: researched.sources[0]?.score || 0.7,
    message:
      'FoodStory did not have enough verified local data, so FoodBot researched the web and exposed the sources used.',
    sources: researched.sources,
    results: [],
    suggestions: vietnamese
      ? ['Chá»‰ dÃ¹ng dá»¯ liá»‡u FoodStory', 'Kiá»ƒm tra thÃªm nguá»“n khÃ¡c']
      : ['Use only FoodStory data', 'Cross-check more sources'],
    groqCalled: true,
  })
}

function finish(response, context = {}) {
  const { clearRecipeContext = false, ...publicResponse } = response
  console.log('[Chatbot] mode:', publicResponse.mode)
  console.log('[Chatbot] Groq called:', publicResponse.groqCalled)
  const recipeSource = publicResponse.sources?.find(
    (source) => source.sourceType === 'recipe' && normalizeOptionalId(source.sourceId)
  )
  const restaurantSource = publicResponse.sources?.find(
    (source) =>
      source.sourceType === 'restaurant' && normalizeOptionalId(source.sourceId)
  )
  return {
    ...publicResponse,
    conversationContext: {
      lastRecipeId:
        clearRecipeContext
          ? null
          : normalizeOptionalId(recipeSource?.sourceId) || context.lastRecipeId || null,
      lastRecipeTitle:
        clearRecipeContext
          ? null
          : (typeof recipeSource?.title === 'string' && recipeSource.title.trim()) ||
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
    .slice(-8)
    .map((entry) => {
      const role = entry?.role === 'assistant' || entry?.role === 'bot'
        ? 'assistant'
        : entry?.role === 'user'
          ? 'user'
          : null
      const content = typeof entry?.content === 'string'
        ? entry.content.trim().slice(0, 320)
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

function normalizeConversationMemory(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 4_000)
}

function deriveContextFromHistory(history) {
  const context = {
    lastRecipeId: null,
    lastRecipeTitle: null,
    lastRestaurantId: null,
    pendingIntent: null,
  }
  let checkedLatestAssistant = false
  let olderRecipeContextBlocked = false
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (
      entry.role === 'assistant' &&
      entry.intent === 'general_culinary_guidance' &&
      !context.lastRecipeId
    ) {
      olderRecipeContextBlocked = true
    }
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
      if (
        !olderRecipeContextBlocked &&
        !context.lastRecipeId &&
        source.sourceType === 'recipe'
      ) {
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

function latestAssistantIntent(history = []) {
  return [...history]
    .reverse()
    .find((entry) => entry.role === 'assistant' && entry.intent)?.intent || null
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

  try {
    return await buildExternalFoodResponse(
      context.question,
      route,
      context
    )
  } catch (error) {
    console.error('[Chatbot] external restaurant research failed:', error.message)
  }

  // SQL decides whether an exact factual match exists. Local semantic retrieval
  // is used only to improve the clearly labelled alternatives.
  let retrieval
  try {
    retrieval = await retrieveRelevantDocumentsWithDebug(
      context.question,
      CHATBOT_TOP_K
    )
  } catch (error) {
    console.error('[Chatbot] restaurant retrieval failed:', error.message)
    return response
  }
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
  if (isExternalFoodQuestion(question)) {
    try {
      return await buildExternalFoodResponse(question, route, context)
    } catch (error) {
      console.error('[Chatbot] external research failed:', error.message)
    }
  }

  let retrieval
  try {
    retrieval = await retrieveRelevantDocumentsWithDebug(
      question,
      CHATBOT_TOP_K
    )
  } catch (error) {
    console.error('[Chatbot] retrieval failed:', error.message)

    if (!isPrivateFoodStoryQuestion(question)) {
      try {
        return await buildGroqKnowledgeFallback(question, route, context, {
          culinary:
            route.intent === 'recipe_recommendation' ||
            isGeneralCulinaryQuestion(question),
        })
      } catch (fallbackError) {
        console.error(
          '[Chatbot] retrieval failure Groq fallback failed:',
          fallbackError.message
        )
      }
    }

    return createChatbotResponse({
      answer: vietnamese
        ? 'Dịch vụ tìm kiếm công thức đang tạm thời gián đoạn. Vui lòng thử lại sau.'
        : 'Recipe search is temporarily unavailable. Please try again shortly.',
      mode: 'no_data',
      intent: route.intent,
      retrievalStatus: 'unavailable',
      confidence: 0,
      message: 'FoodStory retrieval is temporarily unavailable.',
      sources: [],
      results: [],
      groqCalled: false,
    })
  }
  const bestScore = retrieval.results[0]?.score || 0
  const sources = buildRetrievalSources(retrieval.results)
  const results = buildRetrievalPresentationResults(retrieval.results)

  console.log('[Chatbot] retrieval status:', retrieval.status)
  console.log('[Chatbot] top score:', retrieval.results?.[0]?.score)

  if (retrieval.status === 'no_exact_constraint_match') {
    if (!isPrivateFoodStoryQuestion(question)) {
      try {
        return await buildGroqKnowledgeFallback(question, route, context, {
          culinary: isGeneralCulinaryQuestion(question),
        })
      } catch (error) {
        console.error('[Chatbot] no-exact-match Groq fallback failed:', error.message)
      }
    }

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
      results,
      groqCalled: false,
    })
  }

  const shouldSkipGroq =
    !route.shouldUseGroq ||
    !GROQ_ELIGIBLE_STATUSES.has(retrieval.status) ||
    !retrieval.results.length ||
    bestScore < MINIMUM_GROQ_SCORE

  if (shouldSkipGroq) {
    if (!isPrivateFoodStoryQuestion(question)) {
      try {
        return await buildGroqKnowledgeFallback(question, route, context, {
          culinary: isGeneralCulinaryQuestion(question),
        })
      } catch (error) {
        console.error('[Chatbot] general knowledge fallback failed:', error.message)
      }
    }

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
      results,
      groqCalled: false,
    })
  }

  try {
    const answer = await generateFoodStoryAnswer({
      question,
      contexts: retrieval.results,
      responseLanguage: route.entities.responseLanguage,
      conversationHistory: context.conversationHistory,
      conversationMemory: context.conversationMemory,
    })

    return createChatbotResponse({
      answer,
      mode: 'grounded_rag',
      intent: route.intent,
      retrievalStatus: retrieval.status,
      confidence: bestScore,
      message: retrieval.message,
      sources,
      results,
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
      results,
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
  const conversationMemory = normalizeConversationMemory(
    context.conversationMemory
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
    conversationMemory,
  }
  const routingQuestion = buildContextualCustomerQuestion(
    question,
    conversationHistory
  )
  const deterministicRoute = routeFoodStoryQuery(
    routingQuestion,
    normalizedContext
  )
  const customerCareAnswer = buildLocalCustomerCareAnswer(
    question,
    deterministicRoute.entities.responseLanguage
  )

  if (customerCareAnswer) {
    return finish(
      createChatbotResponse({
        answer: customerCareAnswer.answer,
        mode: 'customer_care',
        intent: 'customer_recovery',
        retrievalStatus: 'not_used',
        confidence: 0.92,
        message: 'Handled locally without an external model call.',
        sources: [],
        results: [],
        suggestions: customerCareAnswer.suggestions,
        groqCalled: false,
      }),
      normalizedContext
    )
  }

  const previousIntent = latestAssistantIntent(conversationHistory)
  const productDataIntent = detectFoodStoryProductDataIntent(routingQuestion, {
    previousIntent,
  })
  if (productDataIntent) {
    try {
      const productDataAnswer = await answerFoodStoryProductDataQuestion(
        routingQuestion,
        deterministicRoute.entities.responseLanguage,
        { previousIntent }
      )
      if (productDataAnswer) {
        return finish(
          createChatbotResponse({
            answer: productDataAnswer.answer,
            mode: 'website_live_data',
            intent: productDataAnswer.intent,
            retrievalStatus: 'matched',
            confidence: productDataAnswer.confidence,
            message:
              'Answered from the same live FoodStory data used by the website.',
            sources: productDataAnswer.sources,
            results: productDataAnswer.results,
            suggestions: productDataAnswer.suggestions,
            groqCalled: false,
          }),
          normalizedContext
        )
      }
    } catch (error) {
      console.error('[Chatbot] live website data failed:', error.message)
      const vietnamese = deterministicRoute.entities.responseLanguage === 'vi'
      return finish(
        createChatbotResponse({
          answer: vietnamese
            ? 'Dữ liệu trực tiếp của FoodStory hiện tạm thời không khả dụng. Tôi sẽ không dùng Groq để đoán con số hoặc nội dung đang hiển thị.'
            : 'FoodStory live data is temporarily unavailable. I will not use Groq to guess a catalog count or what the website is currently showing.',
          mode: 'no_data',
          intent: productDataIntent,
          retrievalStatus: 'data_unavailable',
          confidence: 0,
          message: 'The live product-data query failed closed.',
          sources: [],
          results: [],
          groqCalled: false,
        }),
        normalizedContext
      )
    }
  }

  const privateRequest = isPrivateFoodStoryQuestion(routingQuestion)
  const websiteAnswer = privateRequest
    ? null
    : answerWebsiteKnowledgeQuestion(routingQuestion, deterministicRoute)

  if (websiteAnswer) {
    return finish(
      createChatbotResponse({
        answer: websiteAnswer.answer,
        mode: 'website_knowledge',
        intent: 'app_help',
        retrievalStatus: websiteAnswer.status,
        confidence: websiteAnswer.confidence,
        message: 'Answered from the verified FoodStory feature and navigation catalog.',
        sources: websiteAnswer.sources,
        suggestions: websiteAnswer.suggestions,
        groqCalled: false,
      }),
      normalizedContext
    )
  }

  if (isExternalFoodQuestion(routingQuestion)) {
    try {
      return finish(
        await buildExternalFoodResponse(
          routingQuestion,
          deterministicRoute,
          normalizedContext
        ),
        normalizedContext
      )
    } catch (error) {
      console.error('[Chatbot] explicit external research failed:', error.message)
    }
  }

  const semanticResolution = await resolveFoodStorySemanticRoute(
    routingQuestion,
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

    if (
      recipeResultNeedsGroqFallback(result) &&
      !isPrivateFoodStoryQuestion(routingQuestion)
    ) {
      try {
        const response = await buildGroqKnowledgeFallback(
          routingQuestion,
          route,
          normalizedContext,
          { culinary: true }
        )
        return finish(
          {
            ...response,
            clearRecipeContext: result.status === 'recipe_not_found',
          },
          normalizedContext
        )
      } catch (error) {
        console.error('[Chatbot] recipe Groq fallback failed:', error.message)
      }
    }

    return finish(buildRecipeStructuredResponse(result, route), normalizedContext)
  }

  if (RESTAURANT_STRUCTURED_INTENTS.has(route.intent)) {
    const response = await handleStructuredRestaurant(route, {
      ...normalizedContext,
      question: routingQuestion,
    })
    return finish(response, normalizedContext)
  }

  if (route.shouldUseRetrieval) {
    return finish(
      await handleRetrievalRoute(routingQuestion, route, normalizedContext),
      normalizedContext
    )
  }

  if (isExternalFoodQuestion(routingQuestion)) {
    try {
      return finish(
        await buildExternalFoodResponse(
          routingQuestion,
          route,
          normalizedContext
        ),
        normalizedContext
      )
    } catch (error) {
      console.error('[Chatbot] external research failed:', error.message)
    }
  }

  if (!isPrivateFoodStoryQuestion(routingQuestion)) {
    try {
      return finish(
        await buildGroqKnowledgeFallback(
          routingQuestion,
          route,
          normalizedContext,
          { culinary: isGeneralCulinaryQuestion(routingQuestion) }
        ),
        normalizedContext
      )
    } catch (error) {
      console.error('[Chatbot] final Groq fallback failed:', error.message)
    }
  }

  return finish(
    createChatbotResponse({
      answer:
        route.entities.responseLanguage === 'vi'
          ? 'Tôi có thể giúp về công thức, nguyên liệu, dinh dưỡng, thời gian nấu, nhà hàng và Food Map. Bạn hãy nói rõ hơn điều cần tìm.'
          : 'I can help with FoodStory recipes, ingredients, nutrition, cooking times, restaurants, and the food map. Please make the request more specific.',
      mode: 'clarification',
      intent: route.intent,
      retrievalStatus: 'not_used',
      confidence: route.confidence,
      message: 'The query router could not identify a reliable FoodStory action.',
      sources: [],
      results: [],
      suggestions:
        route.entities.responseLanguage === 'vi'
          ? ['Gợi ý món tối', 'Tìm quán ăn', 'Food Map hoạt động thế nào?']
          : ['Suggest a dinner recipe', 'Find a place to eat', 'How does Food Map work?'],
      groqCalled: false,
    }),
    normalizedContext
  )
}
