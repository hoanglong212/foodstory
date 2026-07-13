import OpenAI from 'openai'
import { z } from 'zod'
import 'dotenv/config'

const DEFAULT_TIMEOUT_MS = 4_000
const MIN_CONFIDENCE = 0.72

const intentSchema = z.enum([
  'recipe_by_ingredients',
  'recipe_ingredients',
  'recipe_ingredient_quantity',
  'recipe_ingredient_existence',
  'recipe_serving_scale',
  'recipe_nutrition',
  'recipe_cooking_time',
  'recipe_steps',
  'recipe_recommendation',
  'restaurant_search',
  'restaurant_address',
  'restaurant_price',
  'restaurant_rating',
  'food_map_search',
  'general_foodstory_rag',
  'unknown',
])

const nullableText = z.string().trim().min(1).max(180).nullable()
const semanticRouteSchema = z.object({
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  entities: z.object({
    recipeName: nullableText,
    ingredientName: nullableText,
    availableIngredients: z.array(z.string().trim().min(1).max(80)).max(6),
    targetServings: z.number().int().min(1).max(100).nullable(),
    dishName: nullableText,
    cuisineOrCategory: nullableText,
    districtOrLocation: nullableText,
    priceRange: z.enum(['$', '$$', '$$$']).nullable(),
    nutritionField: z
      .enum(['calories', 'protein', 'carbs', 'fat'])
      .nullable(),
  }),
})

const STRUCTURED_RECIPE_INTENTS = new Set([
  'recipe_by_ingredients',
  'recipe_ingredients',
  'recipe_ingredient_quantity',
  'recipe_ingredient_existence',
  'recipe_serving_scale',
  'recipe_nutrition',
  'recipe_cooking_time',
  'recipe_steps',
])
const STRUCTURED_RESTAURANT_INTENTS = new Set([
  'restaurant_search',
  'restaurant_address',
  'restaurant_price',
  'restaurant_rating',
  'food_map_search',
])

function semanticRoutingEnabled(invokeSemanticRouter) {
  if (invokeSemanticRouter) return true
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) return false
  if (!process.env.GROQ_API_KEY) return false
  return process.env.FOODSTORY_CHATBOT_SEMANTIC_ROUTER_ENABLED !== 'false'
}

function shouldTrySemanticRoute(route) {
  if (route.intent === 'unknown') return route.confidence < 0.9
  return route.intent === 'general_foodstory_rag' && route.confidence <= 0.7
}

function boundedHistory(history = []) {
  if (!Array.isArray(history)) return []
  return history.slice(-6).map((entry) => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: String(entry.content || '').trim().slice(0, 300),
    intent: typeof entry.intent === 'string' ? entry.intent.slice(0, 80) : null,
  }))
}

function buildPrompt(question, route, context) {
  return `
Classify one FoodStory customer message. Return JSON only.

Allowed intents:
- recipe_by_ingredients: user lists ingredients they possess and asks what to cook
- recipe_ingredients: user asks for the ingredient list of a recipe
- recipe_ingredient_quantity / recipe_ingredient_existence
- recipe_serving_scale / recipe_nutrition / recipe_cooking_time / recipe_steps
- recipe_recommendation
- restaurant_search / restaurant_address / restaurant_price / restaurant_rating
- food_map_search / general_foodstory_rag / unknown

Rules:
- Interpret natural Vietnamese, Vietnamese without accents, English, typos, and short follow-ups.
- Use activeRecipe only when the current message refers back to it or omits a new recipe name.
- A new dish name in the current message overrides activeRecipe.
- availableIngredients contains only ingredients the user says they already have.
- Do not invent restaurant names, addresses, recipe facts, prices, or quantities.
- This step selects a lookup only; database services will verify every fact.

Required JSON:
{
  "intent": "one allowed intent",
  "confidence": 0.0,
  "entities": {
    "recipeName": string|null,
    "ingredientName": string|null,
    "availableIngredients": string[],
    "targetServings": number|null,
    "dishName": string|null,
    "cuisineOrCategory": string|null,
    "districtOrLocation": string|null,
    "priceRange": "$"|"$$"|"$$$"|null,
    "nutritionField": "calories"|"protein"|"carbs"|"fat"|null
  }
}

Current message: ${String(question).trim().slice(0, 600)}
Deterministic route: ${route.intent}
Active recipe: ${context.lastRecipeTitle || 'none'}
Active restaurant id: ${context.lastRestaurantId || 'none'}
Recent conversation: ${JSON.stringify(boundedHistory(context.conversationHistory))}
  `.trim()
}

async function defaultInvokeSemanticRouter({ prompt, timeoutMs }) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: timeoutMs,
  })
  const response = await client.chat.completions.create({
    model: process.env.GROQ_ENTITY_MODEL || 'llama-3.1-8b-instant',
    temperature: 0,
    max_tokens: 450,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a conservative intent and entity router for a food application. Output JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  })
  return response?.choices?.[0]?.message?.content || ''
}

function hasRequiredEntities(result, context) {
  const { intent, entities } = result
  if (intent === 'recipe_by_ingredients') {
    return entities.availableIngredients.length > 0
  }
  if (intent === 'recipe_ingredient_quantity' || intent === 'recipe_ingredient_existence') {
    return Boolean(
      entities.ingredientName &&
      (entities.recipeName || context.lastRecipeId || context.lastRecipeTitle)
    )
  }
  if (
    ['recipe_ingredients', 'recipe_serving_scale', 'recipe_nutrition', 'recipe_cooking_time', 'recipe_steps'].includes(
      intent
    )
  ) {
    return Boolean(entities.recipeName || context.lastRecipeId || context.lastRecipeTitle)
  }
  if (intent === 'restaurant_search') {
    return Boolean(
      entities.dishName ||
      entities.cuisineOrCategory ||
      entities.districtOrLocation ||
      entities.priceRange
    )
  }
  return intent !== 'unknown'
}

function toRoute(result, deterministicRoute, context) {
  const { intent, confidence, entities } = result
  const hasRecipeContext = Boolean(context.lastRecipeId || context.lastRecipeTitle)
  const sourcePreference = STRUCTURED_RECIPE_INTENTS.has(intent) || intent === 'recipe_recommendation'
    ? 'recipe'
    : STRUCTURED_RESTAURANT_INTENTS.has(intent)
      ? 'restaurant'
      : 'mixed'
  return {
    intent,
    confidence,
    entities: {
      ...deterministicRoute.entities,
      ...entities,
      sourcePreference,
      lookupType:
        intent === 'recipe_ingredient_quantity'
          ? 'quantity'
          : intent === 'recipe_ingredient_existence'
            ? 'existence'
            : null,
      needsRecipeContext:
        STRUCTURED_RECIPE_INTENTS.has(intent) &&
        intent !== 'recipe_by_ingredients' &&
        !entities.recipeName &&
        hasRecipeContext,
      needsRestaurantContext:
        ['restaurant_address', 'restaurant_price', 'restaurant_rating'].includes(intent) &&
        !entities.dishName &&
        Boolean(context.lastRestaurantId),
      responseLanguage: deterministicRoute.entities.responseLanguage,
      lastRecipeId: context.lastRecipeId || null,
      lastRecipeTitle: context.lastRecipeTitle || null,
    },
    shouldUseStructuredLookup:
      STRUCTURED_RECIPE_INTENTS.has(intent) || STRUCTURED_RESTAURANT_INTENTS.has(intent),
    shouldUseRetrieval: [
      'recipe_recommendation',
      'restaurant_search',
      'general_foodstory_rag',
    ].includes(intent),
    shouldUseGroq: ['recipe_recommendation', 'general_foodstory_rag'].includes(intent),
    semanticFallbackUsed: true,
  }
}

export async function resolveFoodStorySemanticRoute(
  question,
  deterministicRoute,
  context = {},
  {
    invokeSemanticRouter = null,
    timeoutMs = Number(
      process.env.FOODSTORY_CHATBOT_SEMANTIC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
    ),
  } = {}
) {
  if (!semanticRoutingEnabled(invokeSemanticRouter)) {
    return { status: 'disabled', route: deterministicRoute }
  }
  if (!shouldTrySemanticRoute(deterministicRoute)) {
    return { status: 'not_needed', route: deterministicRoute }
  }

  try {
    const raw = await (invokeSemanticRouter || defaultInvokeSemanticRouter)({
      prompt: buildPrompt(question, deterministicRoute, context),
      timeoutMs,
    })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const validation = semanticRouteSchema.safeParse(parsed)
    if (!validation.success) {
      return { status: 'invalid_schema', route: deterministicRoute }
    }
    if (
      validation.data.confidence < MIN_CONFIDENCE ||
      !hasRequiredEntities(validation.data, context)
    ) {
      return { status: 'low_confidence', route: deterministicRoute }
    }
    return {
      status: 'resolved',
      route: toRoute(validation.data, deterministicRoute, context),
    }
  } catch (error) {
    return {
      status:
        error instanceof SyntaxError
          ? 'invalid_json'
          : error?.name === 'AbortError'
            ? 'timeout'
            : 'provider_error',
      route: deterministicRoute,
    }
  }
}
