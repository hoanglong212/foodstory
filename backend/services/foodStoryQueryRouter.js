const DISTRICT_ALIASES = [
  ...Array.from({ length: 12 }, (_, index) => {
    const number = index + 1
    return {
      value: `District ${number}`,
      aliases: [`district ${number}`, `quan ${number}`, `q${number}`, `d${number}`],
    }
  }),
  { value: 'Go Vap', aliases: ['go vap'] },
  { value: 'Binh Thanh', aliases: ['binh thanh'] },
  { value: 'Tan Binh', aliases: ['tan binh'] },
  { value: 'Phu Nhuan', aliases: ['phu nhuan'] },
  { value: 'Thu Duc City', aliases: ['thu duc city', 'thu duc'] },
  { value: 'Thao Dien', aliases: ['thao dien'] },
]

const FOOD_ALIASES = [
  ['beef noodle soup', 'beef noodle soup'],
  ['tofu vermicelli', 'tofu vermicelli'],
  ['broken rice', 'broken rice'],
  ['chicken rice', 'chicken rice'],
  ['banh mi', 'banh mi'],
  ['bun bo', 'bun bo'],
  ['dim sum', 'dim sum'],
  ['hot pot', 'hot pot'],
  ['vietnamese', 'vietnamese'],
  ['japanese', 'japanese'],
  ['korean', 'korean'],
  ['thai', 'thai'],
  ['chinese', 'chinese'],
  ['indian', 'indian'],
  ['italian', 'italian'],
  ['mexican', 'mexican'],
  ['vegetarian', 'vegetarian'],
  ['seafood', 'seafood'],
  ['dessert', 'dessert'],
  ['breakfast', 'breakfast'],
  ['cafe', 'cafe'],
  ['cafe', 'cafes'],
  ['cafe', 'coffee shop'],
  ['cafe', 'coffee'],
  ['drinks', 'drinks'],
  ['noodles', 'noodles'],
  ['pho', 'pho'],
  ['sushi', 'sushi'],
]

const NUTRITION_FIELDS = [
  ['calories', /\bcalories?\b/],
  ['protein', /\bprotein\b/],
  ['carbs', /\bcarbs?\b|\bcarbohydrates?\b/],
  ['fat', /\bfat\b/],
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanEntity(value) {
  return String(value || '')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isContextReference(value, type) {
  const normalized = normalizeText(value)
  const references =
    type === 'recipe'
      ? ['this recipe', 'that recipe', 'it', 'this']
      : ['this restaurant', 'that restaurant', 'that place', 'this place', 'it']

  return references.includes(normalized)
}

function extractTargetServings(message) {
  const match = String(message).match(
    /\b(?:for|to|serve|serves|serving)\s+(\d+)\s*(?:servings?|people|persons?)?\b/i
  )

  return match ? Number(match[1]) : null
}

function extractMappedPhrase(message, definitions) {
  const normalized = ` ${normalizeText(message)} `

  for (const definition of definitions) {
    const aliases = [...definition.aliases].sort((left, right) => right.length - left.length)
    if (aliases.some((alias) => normalized.includes(` ${normalizeText(alias)} `))) {
      return definition.value
    }
  }

  return null
}

function extractDistrict(message) {
  return extractMappedPhrase(message, DISTRICT_ALIASES)
}

function extractFoodCategory(message) {
  const normalized = ` ${normalizeText(message)} `
  const match = FOOD_ALIASES.find(([, alias]) =>
    normalized.includes(` ${normalizeText(alias)} `)
  )

  return match?.[0] || null
}

function extractPriceRange(message) {
  const normalized = normalizeText(message)
  if (/\bcheap\b|\baffordable\b|\bbudget\b|\binexpensive\b/.test(normalized)) {
    return '$'
  }
  if (/\bmid range\b|\bmoderate\b|\baverage price\b/.test(normalized)) {
    return '$$'
  }
  if (/\bexpensive\b|\bpremium\b|\bupscale\b/.test(normalized)) {
    return '$$$'
  }
  return null
}

function extractNutritionField(message) {
  const normalized = normalizeText(message)
  return NUTRITION_FIELDS.find(([, pattern]) => pattern.test(normalized))?.[0] || null
}

function removeServingSuffix(value) {
  return cleanEntity(
    String(value || '').replace(/\s+(?:for|to)\s+\d+\s*(?:servings?|people)?\s*$/i, '')
  )
}

function normalizeRecipeReference(value) {
  const candidate = cleanEntity(value)
  return isContextReference(candidate, 'recipe') ? null : candidate
}

function extractIngredientQuery(message) {
  const quantityMatch = String(message).match(
    /how much\s+(.+?)\s+(?:do|should|would)\s+i\s+(?:need|use)\s+for\s+(.+?)(?=\s+for\s+\d+\s+servings?\b|[?.!]*$)/i
  )

  if (quantityMatch) {
    return {
      ingredientName: cleanEntity(quantityMatch[1]),
      recipeName: removeServingSuffix(quantityMatch[2]),
      lookupType: 'quantity',
    }
  }

  const existenceMatch = String(message).match(
    /does\s+(.+?)\s+(?:use|have|contain|include)\s+(.+?)(?:[?.!]|$)/i
  )

  if (existenceMatch) {
    const recipeReference = cleanEntity(existenceMatch[1])
    return {
      ingredientName: cleanEntity(existenceMatch[2]),
      recipeName: isContextReference(recipeReference, 'recipe')
        ? null
        : recipeReference,
      lookupType: 'existence',
      needsRecipeContext: isContextReference(recipeReference, 'recipe'),
    }
  }

  return null
}

function extractServingScaleRecipe(message) {
  const scaleMatch = String(message).match(
    /\bscale\s+(.+?)\s+(?:to|for)\s+\d+\s*(?:servings?|people)?\b/i
  )
  if (scaleMatch) return cleanEntity(scaleMatch[1])

  const ingredientsMatch = String(message).match(
    /what ingredients(?:\s+do i need)?(?:\s+for\s+(.+?))?(?=\s+for\s+\d+\s+servings?\b|[?.!]*$)/i
  )
  if (!ingredientsMatch?.[1]) return null

  const candidate = cleanEntity(ingredientsMatch[1])
  return /^\d+\s*(?:servings?|people)?$/i.test(candidate) ? null : candidate
}

function extractNutritionRecipe(message) {
  const forMatch = String(message).match(
    /\b(?:calories?|protein|carbs?|carbohydrates?|fat)\b.*?\bfor\s+(.+?)(?=\s+for\s+\d+\s+servings?\b|[?.!]*$)/i
  )
  if (forMatch) {
    const candidate = removeServingSuffix(forMatch[1])
    return /^\d+\s*(?:servings?|people)?$/i.test(candidate) ? null : candidate
  }

  const doesMatch = String(message).match(
    /\b(?:calories?|protein|carbs?|carbohydrates?|fat)\b\s+(?:does|in|of)\s+(.+?)\s+(?:have|contain|has|are there)(?:[?.!]|$)/i
  )
  if (doesMatch) return cleanEntity(doesMatch[1])

  return null
}

function extractCookingTimeRecipe(message) {
  const patterns = [
    /how long does\s+(.+?)\s+take(?:[?.!]|$)/i,
    /how long (?:does it take )?to cook\s+(.+?)(?:[?.!]|$)/i,
    /cooking time (?:for|of)\s+(.+?)(?:[?.!]|$)/i,
  ]

  for (const pattern of patterns) {
    const match = String(message).match(pattern)
    if (match) return cleanEntity(match[1])
  }

  return null
}

function extractStepsRecipe(message) {
  const patterns = [
    /how (?:do|can) i (?:cook|make|prepare)\s+(.+?)(?:[?.!]|$)/i,
    /how to (?:cook|make|prepare)\s+(.+?)(?:[?.!]|$)/i,
    /what are the steps (?:for|to make)\s+(.+?)(?:[?.!]|$)/i,
    /(?:instructions|steps) (?:for|to make)\s+(.+?)(?:[?.!]|$)/i,
  ]

  for (const pattern of patterns) {
    const match = String(message).match(pattern)
    if (match) return cleanEntity(match[1])
  }

  return null
}

function extractRestaurantName(message, intent) {
  const patternsByIntent = {
    restaurant_address: [
      /(?:what is|what's)\s+the\s+(?:address|location)\s+of\s+(.+?)(?:[?.!]|$)/i,
      /where is\s+(.+?)(?:[?.!]|$)/i,
    ],
    restaurant_location: [
      /(?:what is|what's)\s+the\s+(?:address|location)\s+of\s+(.+?)(?:[?.!]|$)/i,
      /where is\s+(.+?)(?:[?.!]|$)/i,
    ],
    restaurant_price: [
      /(?:what is|what's)\s+the\s+price(?:\s+range)?\s+(?:of|at|for)\s+(.+?)(?:[?.!]|$)/i,
      /how expensive is\s+(.+?)(?:[?.!]|$)/i,
    ],
    restaurant_rating: [
      /(?:what is|what's)\s+the\s+rating\s+(?:of|for)\s+(.+?)(?:[?.!]|$)/i,
      /how is\s+(.+?)\s+rated(?:[?.!]|$)/i,
    ],
  }

  for (const pattern of patternsByIntent[intent] || []) {
    const match = String(message).match(pattern)
    if (match) return cleanEntity(match[1])
  }

  return null
}

function createRoute(intent, entities, confidence, options) {
  return {
    intent,
    entities: {
      recipeName: null,
      ingredientName: null,
      targetServings: null,
      cuisineOrCategory: null,
      districtOrLocation: null,
      dishName: null,
      priceRange: null,
      nutritionField: null,
      sourcePreference: 'mixed',
      lookupType: null,
      needsRecipeContext: false,
      needsRestaurantContext: false,
      requiresUserId: false,
      checklistId: null,
      lastRecipeId: null,
      lastRecipeTitle: null,
      helpTopic: null,
      ...entities,
    },
    confidence,
    shouldUseStructuredLookup: Boolean(options.structured),
    shouldUseRetrieval: Boolean(options.retrieval),
    shouldUseGroq: Boolean(options.groq),
  }
}

export function routeFoodStoryQuery(message, context = {}) {
  const normalized = normalizeText(message)
  const targetServings = extractTargetServings(message)
  const districtOrLocation = extractDistrict(message)
  const cuisineOrCategory = extractFoodCategory(message)
  const priceRange = extractPriceRange(message)
  const routeContext = {
    lastRecipeId: context.lastRecipeId || null,
    lastRecipeTitle: context.lastRecipeTitle || null,
  }
  const makeRoute = (intent, entities, confidence, options) =>
    createRoute(
      intent,
      { ...routeContext, ...entities },
      confidence,
      options
    )

  if (
    /\b(?:show|list|view|what are|recommend from)\b.*\bmy favou?rites?\b/.test(
      normalized
    ) ||
    /\bwhat (?:recipes )?(?:did|have) i save\b/.test(normalized) ||
    /\bmy saved recipes\b/.test(normalized)
  ) {
    return makeRoute(
      'user_favorites',
      { ...routeContext, requiresUserId: true, sourcePreference: 'recipe' },
      0.98,
      { structured: true }
    )
  }

  if (
    /\bmy (?:shopping )?checklists?\b/.test(normalized) ||
    /\bwhat(?: is|'s)? in my (?:shopping )?checklist\b/.test(normalized) ||
    /\bshow\b.*\bmy checklist\b/.test(normalized)
  ) {
    const checklistMatch = normalized.match(/\bchecklist\s+(\d+)\b/)
    return makeRoute(
      'user_checklists',
      {
        requiresUserId: true,
        checklistId: checklistMatch ? Number(checklistMatch[1]) : null,
        sourcePreference: 'recipe',
        ...routeContext,
      },
      0.98,
      { structured: true }
    )
  }

  if (
    /\bmy (?:saved )?(?:places|food spots)\b/.test(normalized) ||
    /\bwhat places (?:did|have) i save\b/.test(normalized) ||
    /\bshow\b.*\bmy saved places\b/.test(normalized)
  ) {
    return makeRoute(
      'user_food_spots',
      { ...routeContext, requiresUserId: true, sourcePreference: 'mixed' },
      0.98,
      { structured: true }
    )
  }

  if (
    /\bhow\b.*\b(?:save|add)\b.*\bfavou?rite\b/.test(normalized) ||
    /\bhow\b.*\bfind\b.*\bsaved (?:places|recipes)\b/.test(normalized) ||
    /\bhow\b.*\bopen\b.*\bfood map\b/.test(normalized)
  ) {
    const helpTopic = normalized.includes('favorite')
      || normalized.includes('favourite')
      ? 'favorites'
      : normalized.includes('saved')
        ? 'saved_places'
        : 'food_map'

    return makeRoute(
      'app_help',
      { helpTopic, sourcePreference: 'mixed' },
      0.98,
      { structured: true }
    )
  }

  const ingredientQuery = extractIngredientQuery(message)
  if (ingredientQuery) {
    const intent =
      ingredientQuery.lookupType === 'existence'
        ? 'recipe_ingredient_existence'
        : 'recipe_ingredient_quantity'
    return makeRoute(
      intent,
      {
        ...ingredientQuery,
        targetServings,
        sourcePreference: 'recipe',
      },
      0.98,
      { structured: true }
    )
  }

  if (
    /\bscale\b.*\bservings?\b/.test(normalized) ||
    /\bwhat ingredients\b/.test(normalized)
  ) {
    const recipeName = normalizeRecipeReference(extractServingScaleRecipe(message))
    const needsRecipeContext =
      !recipeName && /\b(?:this recipe|that recipe|what ingredients)\b/.test(normalized)

    return makeRoute(
      'recipe_serving_scale',
      {
        recipeName,
        targetServings,
        needsRecipeContext,
        sourcePreference: 'recipe',
      },
      targetServings ? 0.95 : 0.78,
      { structured: true }
    )
  }

  const mentionsNutrition = NUTRITION_FIELDS.some(([, pattern]) =>
    pattern.test(normalized)
  )
  const asksNutrition =
    /\bhow (?:many|much)\b/.test(normalized) ||
    /\bnutrition(?: facts| information)?\b/.test(normalized) ||
    /\b(?:calories?|protein|carbs?|carbohydrates?|fat)\b.*\b(?:for|in|of)\b/.test(
      normalized
    )

  if (mentionsNutrition && asksNutrition) {
    const recipeName = normalizeRecipeReference(extractNutritionRecipe(message))
    const needsRecipeContext =
      !recipeName && /\b(?:this recipe|that recipe|this|it)\b/.test(normalized)

    return makeRoute(
      'recipe_nutrition',
      {
        recipeName,
        targetServings,
        nutritionField: extractNutritionField(message),
        needsRecipeContext,
        sourcePreference: 'recipe',
      },
      0.92,
      { structured: true }
    )
  }

  if (/\bhow long\b|\bcooking time\b|\bprep time\b/.test(normalized)) {
    const recipeName = normalizeRecipeReference(extractCookingTimeRecipe(message))
    const needsRecipeContext =
      !recipeName && /\b(?:this recipe|that recipe|this|it)\b/.test(normalized)

    return makeRoute(
      'recipe_cooking_time',
      { recipeName, needsRecipeContext, sourcePreference: 'recipe' },
      0.94,
      { structured: true }
    )
  }

  if (
    (/\bhow (?:(?:do|can) i |to )(?:cook|make|prepare)\b/.test(normalized) ||
      /\b(?:instructions|steps)\b/.test(normalized)) &&
    !/\b(?:healthy|low calorie|high protein|meal prep|recommend|suggest)\b/.test(
      normalized
    )
  ) {
    const recipeName = normalizeRecipeReference(extractStepsRecipe(message))
    const needsRecipeContext =
      !recipeName && /\b(?:this recipe|that recipe|this|it)\b/.test(normalized)

    return makeRoute(
      'recipe_steps',
      { recipeName, needsRecipeContext, sourcePreference: 'recipe' },
      0.94,
      { structured: true }
    )
  }

  const restaurantSpecificIntents = [
    ['restaurant_address', /\baddress\b|\blocation of\b|^where is\b/],
    ['restaurant_price', /\bprice(?: range)?\b|\bhow expensive\b/],
    ['restaurant_rating', /\brating\b|\brated\b/],
  ]

  for (const [intent, pattern] of restaurantSpecificIntents) {
    if (!pattern.test(normalized)) continue

    const restaurantName = extractRestaurantName(message, intent)
    const needsRestaurantContext =
      !restaurantName && /\b(?:that place|this place|that restaurant|it)\b/.test(normalized)

    return makeRoute(
      intent,
      {
        restaurantName,
        needsRestaurantContext,
        sourcePreference: 'restaurant',
      },
      restaurantName || context.lastRestaurantId ? 0.94 : 0.72,
      { structured: true }
    )
  }

  if (
    /\bwhere can i (?:eat|drink)\b/.test(normalized) ||
    /\bwhere to eat\b/.test(normalized) ||
    /\bfind\b.*\b(?:restaurant|restaurants|cafe|cafes)\b/.test(normalized) ||
    /\bshow me\b.*\b(?:restaurant|restaurants|cafe|cafes)\b/.test(normalized) ||
    /\bis there\b.*\bfood\b/.test(normalized) ||
    /\brestaurants?\s+(?:near|in)\b/.test(normalized)
  ) {
    return makeRoute(
      'restaurant_search',
      {
        cuisineOrCategory,
        dishName: cuisineOrCategory,
        districtOrLocation,
        priceRange,
        sourcePreference: 'restaurant',
      },
      0.95,
      { structured: true, retrieval: true }
    )
  }

  if (
    /\bshow\b.*\b(?:food spots|saved places)\b/.test(normalized) ||
    /\bfind\b.*\b(?:food spots|saved places)\b/.test(normalized) ||
    /\bfood map\b.*\b(?:near|in|for)\b/.test(normalized)
  ) {
    return makeRoute(
      'food_map_search',
      {
        cuisineOrCategory,
        dishName: cuisineOrCategory,
        districtOrLocation,
        sourcePreference: 'mixed',
      },
      0.9,
      { structured: true }
    )
  }

  const restaurantRecommendation =
    /\brecommend\b|\bsuggest\b/.test(normalized) &&
    /\brestaurant|cafe|where to eat|place to eat\b/.test(normalized)
  const recipeRecommendation =
    /\brecommend\b|\bsuggest\b|\bmeal prep\b|\blow calorie\b|\bhigh protein\b|\bhealthy\b/.test(
      normalized
    ) &&
    !restaurantRecommendation

  if (recipeRecommendation) {
    return makeRoute(
      'recipe_recommendation',
      {
        cuisineOrCategory,
        dishName: cuisineOrCategory,
        sourcePreference: 'recipe',
      },
      0.9,
      { retrieval: true, groq: true }
    )
  }

  if (
    /\bfood\b|\brecipe\b|\brestaurant\b|\bcook\b|\beat\b|\bdish\b|\bmeal\b|\bfoodstory\b|\bapp\b|\bfeature\b|\bnews\b/.test(
      normalized
    )
  ) {
    return makeRoute(
      'general_foodstory_rag',
      {
        cuisineOrCategory,
        districtOrLocation,
        sourcePreference: 'mixed',
      },
      0.65,
      { retrieval: true, groq: true }
    )
  }

  return makeRoute('unknown', {}, 0.25, {})
}
