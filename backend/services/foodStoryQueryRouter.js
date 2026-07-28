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
  {
    value: 'Ho Chi Minh City',
    aliases: ['ho chi minh city', 'ho chi minh', 'sai gon', 'saigon', 'tp hcm', 'tphcm'],
  },
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
  ['com tam', 'com tam'],
  ['bun dau mam tom', 'bun dau mam tom'],
  ['goi cuon', 'goi cuon'],
  ['banh xeo', 'banh xeo'],
  ['hu tieu', 'hu tieu'],
  ['bo kho', 'bo kho'],
  ['chicken', 'ga'],
  ['vegetarian', 'mon chay'],
  ['vegetarian', 'do chay'],
  ['seafood', 'hai san'],
  ['hot pot', 'lau'],
  ['barbecue', 'nuong'],
  ['dessert', 'che'],
  ['cafe', 'ca phe'],
]

const NUTRITION_FIELDS = [
  ['calories', /\bcalories?\b|\bcalo\b|\bkcal\b/],
  ['protein', /\bprotein\b|\bchat dam\b|\bdam\b/],
  ['carbs', /\bcarbs?\b|\bcarbohydrates?\b|\btinh bot\b/],
  ['fat', /\bfat\b|\bchat beo\b/],
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectResponseLanguage(value) {
  const raw = String(value || '').toLowerCase()
  const normalized = normalizeText(raw)
  if (/[ăâđêôơưà-ỹ]/u.test(raw)) return 'vi'
  if (
    /\b(?:toi muon|toi can|toi co|minh can|minh co|cho toi|giup toi|mon nay|mon gi|an gi|quan nay|quan do|cong thuc|nguyen lieu|bao nhieu|nhieu calo|o dau|cach lam|cach nau|yeu thich|dia diem|danh sach|goi y|de xuat|tim quan|nha hang|khau phan|nguoi an|thoi gian|huong dan|kinh phi|ngan sach|nen nau)\b/.test(
      normalized
    )
  ) {
    return 'vi'
  }
  return 'en'
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
      ? ['this recipe', 'that recipe', 'it', 'this', 'mon nay', 'mon do', 'cong thuc nay']
      : [
          'this restaurant',
          'that restaurant',
          'that place',
          'this place',
          'it',
          'quan nay',
          'quan do',
          'nha hang nay',
          'nha hang do',
        ]

  return references.includes(normalized)
}

function extractTargetServings(message) {
  const normalized = normalizeText(message)
  const englishMatch = String(message).match(
    /\b(?:for|to|serve|serves|serving)\s+(\d+)\s*(?:servings?|people|persons?)?\b/i
  )
  if (englishMatch) return Number(englishMatch[1])

  const familyMatch = normalized.match(
    /\b(?:for\s+)?(?:a\s+)?family\s+of\s+(\d+)\b/
  )
  if (familyMatch) return Number(familyMatch[1])

  const standaloneMatch = normalized.match(
    /^(\d+)\s*(?:servings?|people|persons?|portions?)$/
  )
  if (standaloneMatch) return Number(standaloneMatch[1])

  const bareNumberMatch = normalized.match(/^(\d+)$/)
  if (bareNumberMatch) return Number(bareNumberMatch[1])

  const dishMatch = normalized.match(
    /\b(?:for\s+)?(\d+)\s*(?:dishes?|plates?|meals?)\b/
  )
  if (dishMatch) return Number(dishMatch[1])

  const mealOfMatch = normalized.match(
    /\b(?:meal|dish|recipe)\s+(?:for|of)\s+(\d+)\b/
  )
  if (mealOfMatch) return Number(mealOfMatch[1])

  const vietnameseMatch = normalizeText(message).match(
    /\b(?:cho|lam cho|nau cho)?\s*(\d+)\s*(?:khau phan|phan|nguoi|nguoi an)\b/
  )

  return vietnameseMatch ? Number(vietnameseMatch[1]) : null
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
  if (
    /\bcheap\b|\baffordable\b|\bbudget\b|\binexpensive\b|\bgia re\b|\bbinh dan\b|\bkhong dat\b/.test(
      normalized
    )
  ) {
    return '$'
  }
  if (
    /\bmid range\b|\bmoderate\b|\baverage price\b|\btam trung\b|\bgia vua\b/.test(
      normalized
    )
  ) {
    return '$$'
  }
  if (
    /\bexpensive\b|\bpremium\b|\bupscale\b|\bcao cap\b|\bsang trong\b|\bdat tien\b/.test(
      normalized
    )
  ) {
    return '$$$'
  }
  return null
}

function extractNutritionField(message) {
  const normalized = normalizeText(message)
  return NUTRITION_FIELDS.find(([, pattern]) => pattern.test(normalized))?.[0] || null
}

function boundedNumber(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(maximum, Math.max(minimum, parsed))
}

export function normalizeRecipeSearchFilters(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
  const sort = ['popular', 'rating', 'fastest', 'lightest', 'protein', 'saved']
    .includes(source.sort)
    ? source.sort
    : 'popular'
  return {
    query: cleanEntity(source.query).slice(0, 80) || null,
    category: cleanEntity(source.category).slice(0, 80) || null,
    tag: cleanEntity(source.tag).slice(0, 80) || null,
    maxCalories: boundedNumber(source.maxCalories, 1, 5_000),
    minRating: boundedNumber(source.minRating, 0, 5),
    maxTotalTime: boundedNumber(source.maxTotalTime, 1, 1_440),
    minProtein: boundedNumber(source.minProtein, 0, 500),
    sort,
  }
}

function hasActiveRecipeSearchFilters(filters = {}) {
  return Boolean(
    filters.query ||
    filters.category ||
    filters.tag ||
    filters.maxCalories ||
    filters.minRating ||
    filters.maxTotalTime ||
    filters.minProtein
  )
}

function extractRecipeDiscoveryQuery(normalized) {
  const patterns = [
    /\b(?:do you|does foodstory)\s+have\s+(?:any\s+|some\s+)?(.+?)\s+recipes?\b/,
    /\bare there\s+(?:any\s+|some\s+)?(.+?)\s+recipes?\b/,
    /\b(?:show|list|find|recommend|suggest)(?:\s+me)?\s+(?:any\s+|some\s+|a\s+|good\s+|best\s+|great\s+|tasty\s+)*(.+?)\s+recipes?\b/,
    /\b(?:foodstory\s+)?co\s+(?:cong thuc|mon)\s+(.+?)(?:\s+khong)?\b/,
  ]
  const genericWords = new Set([
    'a', 'any', 'best', 'food', 'good', 'great', 'meal', 'meals', 'recipe',
    'recipes', 'some', 'tasty', 'the',
  ])
  const queryAliases = new Map([
    ['bo', 'beef'],
    ['thit bo', 'beef'],
    ['ga', 'chicken'],
    ['thit ga', 'chicken'],
    ['heo', 'pork'],
    ['thit heo', 'pork'],
    ['tom', 'shrimp'],
    ['ca', 'fish'],
  ])

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const query = match[1]
      .split(/\s+/)
      .filter((word) => !genericWords.has(word))
      .join(' ')
      .trim()
    if (query && query.length <= 80) return queryAliases.get(query) || query
  }
  return null
}

function extractRecipeSearchNumber(normalized, patterns) {
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return Number(match[1])
  }
  return null
}

export function extractRecipeSearchFilters(message, previousFilters = {}) {
  const normalized = normalizeText(message)
  const resetAll =
    /\b(?:clear|reset)\s+(?:all\s+)?filters?\b|\bremove\s+all\s+filters?\b/.test(normalized) ||
    /\b(?:xoa|dat lai)\s+(?:tat ca\s+)?(?:bo loc|loc)\b|\bbo\s+tat ca\s+(?:bo loc|loc)\b/.test(normalized)
  const followup = /\b(?:another|more|else|same|keep|still|next|other|filters?|con|khac|them|tiep|giu|van|bo loc)\b/.test(
    normalized
  )
  const discoveryRequest =
    /\b(?:recommend|suggest|find|filter)\b/.test(normalized) ||
    /\b(?:show|list)\b.*\b(?:recipes?|meals?|dishes?)\b/.test(normalized) ||
    /\b(?:do you|does foodstory)\s+have\s+(?:any\s+|some\s+)?.+?\s+recipes?\b/.test(normalized) ||
    /\bare there\s+(?:any\s+|some\s+)?.+?\s+recipes?\b/.test(normalized) ||
    /\b(?:foodstory\s+)?co\s+(?:cong thuc|mon)\s+.+/.test(normalized) ||
    /\bwhat should i (?:cook|eat)\b/.test(normalized) ||
    /\b(?:goi y|de xuat|tu van|tim|loc)\b.*\b(?:cong thuc|mon|mon an)\b/.test(normalized) ||
    /\b(?:mon nao|an gi|nau gi)\b/.test(normalized)
  const previous = normalizeRecipeSearchFilters(previousFilters)
  const filters = resetAll || !followup
    ? normalizeRecipeSearchFilters()
    : { ...previous }
  const discoveryQuery = extractRecipeDiscoveryQuery(normalized)
  if (discoveryQuery) filters.query = discoveryQuery

  const maxCalories = extractRecipeSearchNumber(normalized, [
    /\b(?:under|below|less than|no more than|maximum|max|up to)\s+(\d{2,4})\s*(?:calories?|calo|kcal)\b/,
    /\b(?:duoi|it hon|khong qua|toi da)\s+(\d{2,4})\s*(?:calo|kcal)\b/,
    /\b(\d{2,4})\s*(?:calories?|calo|kcal)\s+(?:or less|or fewer|tro xuong)\b/,
  ])
  const minRating = extractRecipeSearchNumber(normalized, [
    /\b(?:rating|rated)\s*(?:above|over|at least|from|>=)?\s*(\d(?:\.\d)?)\b/,
    /\b(?:above|over|at least|minimum|from)\s*(\d(?:\.\d)?)\s*(?:stars?|rating)\b/,
    /\b(?:rating|danh gia|tu|tren|it nhat)\s*(?:tren|tu|it nhat)?\s*(\d(?:\.\d)?)\s*(?:sao)?\b/,
  ])
  const maxTotalTime = extractRecipeSearchNumber(normalized, [
    /\b(?:under|below|less than|within|no more than|up to)\s+(\d{1,3})\s*(?:minutes?|mins?)\b/,
    /\b(?:duoi|trong|it hon|khong qua|toi da)\s+(\d{1,3})\s*(?:phut)\b/,
  ])
  const minProtein = extractRecipeSearchNumber(normalized, [
    /\b(?:at least|minimum|over|above)\s*(\d{1,3})\s*g(?:rams?)?\s+(?:of\s+)?protein\b/,
    /\b(?:it nhat|toi thieu|tren)\s*(\d{1,3})\s*g\s*(?:protein|dam|chat dam)\b/,
  ])

  if (/\b(?:remove|clear)\b.*\bcalor|\bbo\b.*\bcalo/.test(normalized)) {
    filters.maxCalories = null
  } else if (maxCalories) {
    filters.maxCalories = boundedNumber(maxCalories, 1, 5_000)
  }
  if (/\b(?:remove|clear)\b.*\brating|\bbo\b.*\b(?:rating|danh gia)/.test(normalized)) {
    filters.minRating = null
  } else if (minRating !== null) {
    filters.minRating = boundedNumber(minRating, 0, 5)
  } else if (/\b(?:highly rated|top rated|rating cao|danh gia cao)\b/.test(normalized)) {
    filters.minRating = 4
  }
  if (/\b(?:remove|clear)\b.*\btime|\bbo\b.*\bthoi gian/.test(normalized)) {
    filters.maxTotalTime = null
  } else if (maxTotalTime) {
    filters.maxTotalTime = boundedNumber(maxTotalTime, 1, 1_440)
  }
  if (minProtein !== null) filters.minProtein = boundedNumber(minProtein, 0, 500)

  const category = extractFoodCategory(message)
  if (category) filters.category = category
  if (/\b(?:healthy|lanh manh|tot cho suc khoe)\b/.test(normalized)) filters.tag = 'Healthy'
  if (/\b(?:vegetarian|vegan|mon chay|do chay|an chay)\b/.test(normalized)) filters.tag = 'Vegetarian'
  if (/\b(?:student friendly|sinh vien)\b/.test(normalized)) filters.tag = 'Student-friendly'
  if (/\b(?:quick and easy|quick meal|de lam|nhanh gon)\b/.test(normalized)) filters.tag = 'Quick Meal'
  if (
    filters.query &&
    [filters.category, filters.tag].some(
      (value) => value && normalizeText(value) === normalizeText(filters.query)
    )
  ) {
    filters.query = null
  }

  if (/\b(?:highest rated|best rated|top rated|rating cao|danh gia cao)\b/.test(normalized)) {
    filters.sort = 'rating'
  } else if (/\b(?:lowest calorie|lightest|it calo|calo thap)\b/.test(normalized)) {
    filters.sort = 'lightest'
  } else if (/\b(?:fastest|quickest|nhanh nhat|nhanh gon)\b/.test(normalized)) {
    filters.sort = 'fastest'
  } else if (/\b(?:highest protein|high protein|protein cao|nhieu dam)\b/.test(normalized)) {
    filters.sort = 'protein'
  } else if (/\b(?:most saved|saved most|luu nhieu nhat)\b/.test(normalized)) {
    filters.sort = 'saved'
  } else if (/\b(?:most popular|popular|pho bien)\b/.test(normalized)) {
    filters.sort = 'popular'
  } else if (minRating !== null) {
    filters.sort = 'rating'
  } else if (maxCalories) {
    filters.sort = 'lightest'
  } else if (maxTotalTime) {
    filters.sort = 'fastest'
  } else if (minProtein !== null) {
    filters.sort = 'protein'
  }

  const hasNewConstraint = Boolean(
    resetAll || discoveryQuery || category || maxCalories || minRating !== null || maxTotalTime ||
    minProtein !== null || filters.tag || /\b(?:rated|rating|calor|calo|kcal|protein|minutes?|phut|fastest|quickest|popular|pho bien)\b/.test(normalized)
  )
  if (!discoveryRequest && !(followup && (hasActiveRecipeSearchFilters(previous) || hasNewConstraint))) {
    return null
  }

  return normalizeRecipeSearchFilters(filters)
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
  const normalized = normalizeText(message)
  const loosePatterns = [
    /^how (?:many|much) (?:calories?|calo|kcal|protein|carbs?|fat) (?:are )?(?:in|for) (?:\d+\s*(?:dish|plate|serving)s?\s+of\s+)?(.+)$/,
    /^(.+?)\s+how (?:many|much)\s+(?:calories?|calo|kcal|protein|carbs?|fat)$/,
    /^(?:mon\s+)?(.+?)\s+(?:co\s+)?(?:bao nhieu|nhieu)\s+(?:calo|kcal|protein|dam|carb|tinh bot|chat beo)$/,
  ]
  for (const pattern of loosePatterns) {
    const match = normalized.match(pattern)
    if (match) return removeServingSuffix(match[1])
  }

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

function extractDirectRecipeName(message) {
  const normalized = normalizeText(message)
  const match = normalized.match(/^(?:cong thuc|recipe for|recipe of)\s+(.+)$/)
  if (!match) return null

  return cleanEntity(
    match[1]
      .replace(/\s+(?:voi\s+)?(?:kinh phi|ngan sach|budget)\s+.*$/g, '')
      .replace(/\s+(?:va\s+)?(?:cho|for)\s+\d+\s*(?:nguoi|phan|khau phan|people|servings?)\b.*$/g, '')
  ) || null
}

function extractNamedDishCookingRequest(message) {
  const normalized = normalizeText(message)
  const patterns = [
    /^(?:toi|minh)\s+(?:muon|can)\s+(?:nau|lam|che bien)\s+(?:mon\s+)?(.+)$/,
    /^(?:i\s+)?(?:want|would like|need)\s+to\s+(?:cook|make|prepare)\s+(.+)$/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const recipeName = cleanEntity(match[1])
    if (!recipeName || /^(?:gi|mon gi|something|something tasty)$/.test(recipeName)) {
      return null
    }
    return recipeName
  }
  return null
}

function extractRecipeIngredientListRequest(message) {
  const normalized = normalizeText(message)
  if (
    /^(?:what|which)\s+ingredients\s+(?:do\s+i\s+need|are\s+needed)$/i.test(
      normalized
    ) ||
    /^(?:toi|minh)\s+can\s+(?:nhung\s+)?nguyen\s+lieu\s+gi$/.test(normalized) ||
    /^can\s+(?:nhung\s+)?nguyen\s+lieu\s+gi$/.test(normalized)
  ) {
    return {
      recipeName: null,
      needsRecipeContext: true,
    }
  }

  const patterns = [
    /^(?:toi|minh)\s+can\s+(?:danh sach\s+)?nguyen lieu\s+(?:de\s+)?(?:nau|lam|che bien)\s+(.+)$/,
    /^(?:cho toi|liet ke)\s+(?:danh sach\s+)?nguyen lieu\s+(?:de\s+)?(?:nau|lam|che bien)?\s*(.+)$/,
    /^nguyen lieu\s+(?:de\s+)?(?:nau|lam|che bien)\s+(.+)$/,
    /^(?:what|which)\s+ingredients\s+(?:do i need\s+)?(?:for|to cook|to make)\s+(.+)$/,
    /^(?:what|which)\s+ingredients\s+are\s+(?:in|used in)\s+(.+)$/,
    /^what\s+are\s+the\s+ingredients\s+(?:in|for|of)\s+(.+)$/,
    /^what\s+do\s+i\s+need\s+to\s+(?:cook|make)\s+(.+)$/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const candidate = cleanEntity(
      match[1].replace(
        /\s+(?:cho|for)\s+\d+\s*(?:nguoi|phan|khau phan|people|servings?)\b.*$/,
        ''
      )
    )
    return {
      recipeName: isContextReference(candidate, 'recipe') ? null : candidate,
      needsRecipeContext: isContextReference(candidate, 'recipe'),
    }
  }
  return null
}

function extractBudget(message) {
  const normalized = normalizeText(message)
  const dollarMatch = normalized.match(
    /(?:\$\s*|\b)(\d+(?:\.\d+)?)\s*(?:usd|dollars?|do la)\b/
  )
  if (dollarMatch) {
    return { amount: Number(dollarMatch[1]), currency: 'USD' }
  }

  const compactVndMatch = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(k|ngan|nghin)\b/
  )
  if (compactVndMatch) {
    return { amount: Number(compactVndMatch[1]) * 1000, currency: 'VND' }
  }

  const vndMatch = normalized.match(/\b(\d{5,7})\s*(?:vnd|dong)?\b/)
  return vndMatch
    ? { amount: Number(vndMatch[1]), currency: 'VND' }
    : null
}

function budgetToPriceRange(budget) {
  if (!budget) return null
  if (budget.currency === 'USD') {
    if (budget.amount <= 15) return '$'
    if (budget.amount <= 40) return '$$'
    return '$$$'
  }
  if (budget.amount <= 60000) return '$'
  if (budget.amount <= 200000) return '$$'
  return '$$$'
}

function cleanIngredientList(value) {
  const cleaned = normalizeText(value)
    .replace(/\b(?:thi|nen|co the|muon|bay gio|gio|now|today|hom nay)\b/g, ' ')
    .replace(/\b(?:for|cho)\s+\d+\s*(?:people|servings?|nguoi|phan|khau phan)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
    .split(/\s*(?:,|\band\b|\bva\b|\bvoi\b)\s*/)
    .map(cleanEntity)
    .filter((item) => item.length >= 2 && item.length <= 80)
    .slice(0, 6)
}

function extractAvailableIngredients(message) {
  const normalized = normalizeText(message)
  const patterns = [
    /^(?:toi|minh|nha toi|nha minh)\s+co\s+(.+?)\s+(?:thi\s+)?(?:(?:nen|co the|muon)\s+)?(?:lam|nau|che bien)\s+(?:duoc\s+)?(?:mon\s+)?gi$/,
    /^(?:lam|nau|che bien)\s+(?:duoc\s+)?(?:mon\s+)?gi\s+(?:tu|voi)\s+(.+)$/,
    /^what\s+(?:recipe|meal|dish)?\s*(?:can|could)\s+i\s+(?:cook|make)\s+(?:with|using)\s+(.+)$/,
    /^what\s+(?:recipe|meal|dish)\s+to\s+(?:cook|make)\s+if\s+i\s+have\s+(.+)$/,
    /^(?:i\s+have|if\s+i\s+have)\s+(.+?)\s+what\s+(?:can|could)\s+i\s+(?:cook|make)$/,
    /^i\s+have\s+(.+?)\s+what\s+(?:recipe|meal|dish)\s+(?:should|can|could)\s+i\s+(?:cook|make)$/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const ingredients = cleanIngredientList(match[1])
    if (ingredients.length) return ingredients
  }
  return []
}

function extractContextualIngredientQuantity(message, context = {}) {
  if (!context.lastRecipeId && !context.lastRecipeTitle) return null
  const normalized = normalizeText(message).replace(
    /^(?:nhu the|vay thi|the thi|vay|so|then)\s+/,
    ''
  )
  if (/\b(?:calories?|calo|kcal|protein|carbs?|fat|dinh duong|chat beo|chat dam)\b/.test(normalized)) {
    return null
  }
  const patterns = [
    /^(?:toi|minh)?\s*(?:can|dung|lay)\s*(?:khoang\s*)?bao nhieu\s+(.+)$/,
    /^bao nhieu\s+(.+?)(?:\s+la du|\s+thi du)?$/,
    /^(.+?)\s+(?:can|dung)\s+bao nhieu$/,
    /^how much\s+(.+?)\s+(?:is|are)?\s*(?:needed|required|do i need|should i use)(?:\s+for\s+(?:this|that|the)\s+recipe)?$/,
    /^how much\s+(.+?)(?:\s+for\s+(?:this|that|the)\s+recipe)?$/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const ingredientName = cleanEntity(
      match[1].replace(/\b(?:cho|for)\s+\d+\s*(?:nguoi|phan|servings?|people)\b/g, '')
        .replace(/^(?:ml|l|g|kg|mg|cups?|tbsp|tsp)\s+/, '')
    )
    if (ingredientName) {
      return {
        recipeName: null,
        ingredientName,
        lookupType: 'quantity',
        needsRecipeContext: true,
      }
    }
  }
  return null
}

function vietnameseRecipeReference(value) {
  const candidate = cleanEntity(value)
  return isContextReference(candidate, 'recipe') ? null : candidate
}

function extractVietnameseIngredientQuery(message) {
  const normalized = normalizeText(message)
  const existenceMatch = normalized.match(
    /^(.+?)\s+co\s+(?:dung|chua|can|su dung)\s+(.+?)\s+khong$/
  )
  if (existenceMatch) {
    const recipeReference = cleanEntity(existenceMatch[1])
    return {
      recipeName: vietnameseRecipeReference(recipeReference),
      ingredientName: cleanEntity(existenceMatch[2]),
      lookupType: 'existence',
      needsRecipeContext: isContextReference(recipeReference, 'recipe'),
    }
  }

  const quantityPatterns = [
    /^(?:toi\s+)?(?:can|dung)\s+bao nhieu\s+(.+?)\s+de\s+(?:nau|lam)\s+(.+?)(?:\s+cho\s+\d+\s*(?:khau phan|phan|nguoi))?$/,
    /^(.+?)\s+(?:can|dung)\s+bao nhieu\s+(.+?)(?:\s+cho\s+\d+\s*(?:khau phan|phan|nguoi))?$/,
  ]
  for (const [index, pattern] of quantityPatterns.entries()) {
    const match = normalized.match(pattern)
    if (!match) continue
    const recipeReference = cleanEntity(index === 0 ? match[2] : match[1])
    return {
      recipeName: vietnameseRecipeReference(recipeReference),
      ingredientName: cleanEntity(index === 0 ? match[1] : match[2]),
      lookupType: 'quantity',
      needsRecipeContext: isContextReference(recipeReference, 'recipe'),
    }
  }

  return null
}

function extractVietnameseServingRecipe(message) {
  const normalized = normalizeText(message)
  const patterns = [
    /(?:dieu chinh|tang|giam|scale)\s+(?:cong thuc\s+)?(.+?)\s+(?:cho|thanh)\s+\d+\s*(?:khau phan|phan|nguoi)/,
    /(?:nguyen lieu|cong thuc)\s+(?:de\s+)?(?:nau|lam)?\s*(.+?)\s+cho\s+\d+\s*(?:khau phan|phan|nguoi)/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return vietnameseRecipeReference(match[1])
  }
  return null
}

function extractVietnameseNutritionRecipe(message) {
  const normalized = normalizeText(message)
  if (/^(?:mon nay|mon do|cong thuc nay)\b/.test(normalized)) return null
  const patterns = [
    /^(?:mon\s+)?(.+?)\s+(?:co|chua)?\s*(?:bao nhieu|nhieu)\s+(?:calo|kcal|protein|dam|carb|tinh bot|chat beo)$/,
    /(?:calo|kcal|protein|dam|carb|tinh bot|chat beo)\s+(?:cua|trong)\s+(.+?)(?:\s+cho\s+\d+\s*(?:khau phan|phan|nguoi))?$/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return vietnameseRecipeReference(match[1])
  }
  return null
}

function extractVietnameseCookingTimeRecipe(message) {
  const normalized = normalizeText(message)
  const patterns = [
    /^(?:nau|lam)\s+(.+?)\s+(?:mat|trong)\s+bao lau$/,
    /^(.+?)\s+(?:mat|nau mat|lam mat)\s+bao lau$/,
    /(?:thoi gian nau|thoi gian lam)\s+(.+?)$/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return vietnameseRecipeReference(match[1])
  }
  return null
}

function extractVietnameseStepsRecipe(message) {
  const normalized = normalizeText(message)
  const patterns = [
    /(?:cach|huong dan)\s+(?:nau|lam|che bien)\s+(.+?)$/,
    /(?:nau|lam|che bien)\s+(.+?)\s+(?:nhu the nao|the nao)$/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return vietnameseRecipeReference(match[1])
  }
  return null
}

function extractVietnameseRestaurantName(message, intent) {
  const normalized = normalizeText(message)
  const contextReference = normalized.match(
    /\b(quan nay|quan do|nha hang nay|nha hang do)\b/
  )?.[1]
  if (contextReference) return null

  const patterns = {
    restaurant_address: [
      /(?:dia chi|vi tri)\s+(?:cua\s+)?(?:quan|nha hang)?\s*(.+?)(?:\s+(?:la gi|o dau))?$/,
      /^(.+?)\s+o dau$/,
    ],
    restaurant_price: [
      /(?:gia|muc gia)\s+(?:o|tai|cua)\s+(?:quan|nha hang)?\s*(.+?)(?:\s+bao nhieu)?$/,
      /^(.+?)\s+gia\s+bao nhieu$/,
    ],
    restaurant_rating: [
      /(?:danh gia|rating)\s+(?:cua\s+)?(?:quan|nha hang)?\s*(.+?)$/,
      /^(.+?)\s+(?:duoc\s+)?danh gia\s+(?:bao nhieu|the nao)$/,
    ],
  }

  for (const pattern of patterns[intent] || []) {
    const match = normalized.match(pattern)
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
      availableIngredients: [],
      budgetAmount: null,
      budgetCurrency: null,
      sourcePreference: 'mixed',
      lookupType: null,
      needsRecipeContext: false,
      needsRestaurantContext: false,
      requiresUserId: false,
      checklistId: null,
      lastRecipeId: null,
      lastRecipeTitle: null,
      helpTopic: null,
      responseLanguage: 'en',
      recipeSearchFilters: null,
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
  const responseLanguage = detectResponseLanguage(message)
  const isVietnamese = responseLanguage === 'vi'
  const targetServings = extractTargetServings(message)
  const districtOrLocation = extractDistrict(message)
  const cuisineOrCategory = extractFoodCategory(message)
  const budget = extractBudget(message)
  const priceRange = extractPriceRange(message) || budgetToPriceRange(budget)
  const availableIngredients = extractAvailableIngredients(message)
  const recipeSearchFilters = extractRecipeSearchFilters(
    message,
    context.recipeSearchFilters
  )
  const routeContext = {
    lastRecipeId: context.lastRecipeId || null,
    lastRecipeTitle: context.lastRecipeTitle || null,
    responseLanguage,
  }
  const makeRoute = (intent, entities, confidence, options) =>
    createRoute(
      intent,
      { ...routeContext, ...entities },
      confidence,
      options
    )

  if (
    /\b(?:ignore|reveal|show|print|leak)\b.*\b(?:system instructions|system prompt|developer message|secrets?|api keys?|environment variables?)\b/.test(
      normalized
    )
  ) {
    return makeRoute('unknown', {}, 0.99, {})
  }

  if (availableIngredients.length) {
    return makeRoute(
      'recipe_by_ingredients',
      {
        availableIngredients,
        targetServings,
        budgetAmount: budget?.amount || null,
        budgetCurrency: budget?.currency || null,
        recipeSearchFilters,
        sourcePreference: 'recipe',
      },
      0.97,
      { structured: true }
    )
  }

  if (recipeSearchFilters) {
    return makeRoute(
      'recipe_filter_search',
      {
        cuisineOrCategory: recipeSearchFilters.category,
        recipeSearchFilters,
        sourcePreference: 'recipe',
      },
      0.97,
      { structured: true }
    )
  }

  const isShortServingFollowup =
    Boolean(targetServings) &&
    (context.lastRecipeId || context.lastRecipeTitle) &&
    (/^(?:for\s+)?(?:a\s+)?family\s+of\s+\d+$/i.test(normalized) ||
      /^\d+\s*(?:servings?|people|persons?|portions?)$/i.test(normalized) ||
      (/^\d+$/i.test(normalized) && context.pendingIntent === 'recipe_serving_scale'))

  if (isShortServingFollowup) {
    return makeRoute(
      'recipe_serving_scale',
      {
        recipeName: null,
        targetServings,
        needsRecipeContext: true,
        sourcePreference: 'recipe',
      },
      0.98,
      { structured: true }
    )
  }

  const ingredientListRequest = extractRecipeIngredientListRequest(message)
  if (ingredientListRequest) {
    return makeRoute(
      targetServings ? 'recipe_serving_scale' : 'recipe_ingredients',
      {
        ...ingredientListRequest,
        targetServings,
        sourcePreference: 'recipe',
      },
      0.97,
      { structured: true }
    )
  }

  const contextualIngredientQuantity = extractContextualIngredientQuantity(
    message,
    context
  )
  if (contextualIngredientQuantity) {
    return makeRoute(
      'recipe_ingredient_quantity',
      {
        ...contextualIngredientQuantity,
        targetServings,
        sourcePreference: 'recipe',
      },
      0.96,
      { structured: true }
    )
  }

  if (/^(?:hi|hello|hey|good morning|good evening|xin chao|chao|chao ban)$/.test(normalized)) {
    return makeRoute(
      'app_help',
      { helpTopic: 'greeting', sourcePreference: 'mixed' },
      0.99,
      { structured: true }
    )
  }

  if (/^(?:thanks|thank you|cam on|cam on ban|ok cam on)$/.test(normalized)) {
    return makeRoute(
      'app_help',
      { helpTopic: 'thanks', sourcePreference: 'mixed' },
      0.99,
      { structured: true }
    )
  }

  if (
    /\b(?:what can you do|how can you help|your features|ban lam duoc gi|ban co the lam gi|foodbot lam duoc gi|giup duoc gi)\b/.test(
      normalized
    )
  ) {
    return makeRoute(
      'app_help',
      { helpTopic: 'capabilities', sourcePreference: 'mixed' },
      0.99,
      { structured: true }
    )
  }

  if (
    /\b(?:food allergy|allergy|allergic|food poisoning|raw chicken|di ung|ngo doc|ga song|thuc pham song|an co an toan)\b/.test(
      normalized
    )
  ) {
    return makeRoute(
      'app_help',
      { helpTopic: 'food_safety', sourcePreference: 'mixed' },
      0.99,
      { structured: true }
    )
  }

  const namedDishCookingRequest = extractNamedDishCookingRequest(message)
  const directRecipeName =
    extractDirectRecipeName(message) || namedDishCookingRequest
  if (directRecipeName) {
    return makeRoute(
      targetServings ? 'recipe_serving_scale' : 'recipe_steps',
      {
        recipeName: directRecipeName,
        targetServings,
        budgetAmount: budget?.amount || null,
        budgetCurrency: budget?.currency || null,
        allowGeneralGuidance: true,
        sourcePreference: 'recipe',
      },
      0.96,
      { structured: true }
    )
  }

  if (
    budget &&
    /\b(?:an gi|uong gi|quan nao|noi nao|where to eat|what to eat)\b/.test(
      normalized
    )
  ) {
    return makeRoute(
      'restaurant_search',
      {
        cuisineOrCategory,
        dishName: cuisineOrCategory,
        districtOrLocation,
        priceRange,
        budgetAmount: budget.amount,
        budgetCurrency: budget.currency,
        sourcePreference: 'restaurant',
      },
      0.91,
      { structured: true, retrieval: true }
    )
  }

  if (
    budget &&
    /\b(?:cook|make|nau|lam)\b/.test(normalized) &&
    !availableIngredients.length
  ) {
    return makeRoute(
      'app_help',
      {
        helpTopic: 'recipe_budget',
        targetServings,
        budgetAmount: budget.amount,
        budgetCurrency: budget.currency,
        sourcePreference: 'recipe',
      },
      0.9,
      { structured: true }
    )
  }

  if (
    cuisineOrCategory &&
    normalized.split(' ').length <= 3 &&
    normalizeText(cuisineOrCategory) === normalized
  ) {
    return makeRoute(
      'app_help',
      {
        helpTopic: 'dish_clarification',
        dishName: cuisineOrCategory,
        cuisineOrCategory,
        sourcePreference: 'mixed',
      },
      0.94,
      { structured: true }
    )
  }

  if (isVietnamese) {
    if (
      /\b(?:xem|liet ke|danh sach|cho toi xem)\b.*\b(?:cong thuc|mon)\b.*\b(?:yeu thich|da luu)\b/.test(
        normalized
      ) ||
      /\b(?:cong thuc|mon)\s+(?:yeu thich|da luu)\s+cua toi\b/.test(normalized)
    ) {
      return makeRoute(
        'user_favorites',
        { requiresUserId: true, sourcePreference: 'recipe' },
        0.98,
        { structured: true }
      )
    }

    if (
      /\b(?:danh sach mua sam|checklist|nguyen lieu can mua)\b/.test(normalized)
    ) {
      const checklistMatch = normalized.match(/\b(?:checklist|danh sach)\s+(\d+)\b/)
      return makeRoute(
        'user_checklists',
        {
          requiresUserId: true,
          checklistId: checklistMatch ? Number(checklistMatch[1]) : null,
          sourcePreference: 'recipe',
        },
        0.98,
        { structured: true }
      )
    }

    if (
      /\b(?:dia diem|quan|noi an)\b.*\b(?:da luu|cua toi|yeu thich)\b/.test(
        normalized
      )
    ) {
      return makeRoute(
        'user_food_spots',
        { requiresUserId: true, sourcePreference: 'mixed' },
        0.98,
        { structured: true }
      )
    }

    if (
      /\b(?:lam sao|cach)\b.*\b(?:luu|them)\b.*\b(?:yeu thich|cong thuc)\b/.test(
        normalized
      ) ||
      /\b(?:mo|vao)\b.*\b(?:food map|ban do am thuc)\b/.test(normalized) ||
      /\btim\b.*\b(?:mon|quan|dia diem)\b.*\bda luu\b/.test(normalized)
    ) {
      const helpTopic = /yeu thich|cong thuc/.test(normalized)
        ? 'favorites'
        : /da luu/.test(normalized)
          ? 'saved_places'
          : 'food_map'
      return makeRoute(
        'app_help',
        { helpTopic, sourcePreference: 'mixed' },
        0.98,
        { structured: true }
      )
    }

    const vietnameseIngredientQuery = extractVietnameseIngredientQuery(message)
    if (vietnameseIngredientQuery) {
      return makeRoute(
        vietnameseIngredientQuery.lookupType === 'existence'
          ? 'recipe_ingredient_existence'
          : 'recipe_ingredient_quantity',
        {
          ...vietnameseIngredientQuery,
          targetServings,
          sourcePreference: 'recipe',
        },
        0.96,
        { structured: true }
      )
    }

    if (
      /\b(?:dieu chinh|tang|giam|scale|nguyen lieu|cong thuc)\b.*\b\d+\s*(?:khau phan|phan|nguoi)\b/.test(
        normalized
      )
    ) {
      const recipeName = extractVietnameseServingRecipe(message)
      return makeRoute(
        'recipe_serving_scale',
        {
          recipeName,
          targetServings,
          needsRecipeContext:
            !recipeName && /\b(?:mon nay|mon do|cong thuc nay)\b/.test(normalized),
          sourcePreference: 'recipe',
        },
        targetServings ? 0.95 : 0.78,
        { structured: true }
      )
    }

    if (
      /\b(?:calo|kcal|protein|dam|carb|tinh bot|chat beo|dinh duong)\b/.test(
        normalized
      ) &&
      /\b(?:bao nhieu|nhieu|dinh duong|co|chua|trong|cua)\b/.test(normalized)
    ) {
      const recipeName = extractVietnameseNutritionRecipe(message)
      return makeRoute(
        'recipe_nutrition',
        {
          recipeName,
          targetServings,
          nutritionField: extractNutritionField(message),
          needsRecipeContext:
            !recipeName && /\b(?:mon nay|mon do|cong thuc nay)\b/.test(normalized),
          sourcePreference: 'recipe',
        },
        0.94,
        { structured: true }
      )
    }

    if (/\b(?:bao lau|thoi gian nau|thoi gian lam)\b/.test(normalized)) {
      const recipeName = extractVietnameseCookingTimeRecipe(message)
      return makeRoute(
        'recipe_cooking_time',
        {
          recipeName,
          needsRecipeContext:
            !recipeName && /\b(?:mon nay|mon do|cong thuc nay)\b/.test(normalized),
          sourcePreference: 'recipe',
        },
        0.94,
        { structured: true }
      )
    }

    if (
      /\b(?:cach|huong dan)\s+(?:nau|lam|che bien)\b/.test(normalized) ||
      /\b(?:nau|lam|che bien)\b.*\bnhu the nao\b/.test(normalized)
    ) {
      const recipeName = extractVietnameseStepsRecipe(message)
      return makeRoute(
        'recipe_steps',
        {
          recipeName,
          needsRecipeContext:
            !recipeName && /\b(?:mon nay|mon do|cong thuc nay)\b/.test(normalized),
          allowGeneralGuidance: Boolean(recipeName),
          sourcePreference: 'recipe',
        },
        0.94,
        { structured: true }
      )
    }

    const restaurantIntent = /\b(?:danh gia|rating)\b/.test(normalized)
      ? 'restaurant_rating'
      : /\b(?:gia bao nhieu|muc gia|gia (?:o|tai|cua))\b/.test(normalized)
        ? 'restaurant_price'
        : /\b(?:dia chi|vi tri)\b/.test(normalized) ||
            (/\bo dau\b/.test(normalized) &&
              !/^(?:an|uong|tim|cho toi|o dau co)\b/.test(normalized))
          ? 'restaurant_address'
          : null

    if (restaurantIntent) {
      const restaurantName = extractVietnameseRestaurantName(
        message,
        restaurantIntent
      )
      const needsRestaurantContext =
        !restaurantName &&
        /\b(?:quan nay|quan do|nha hang nay|nha hang do)\b/.test(normalized)
      return makeRoute(
        restaurantIntent,
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
      /\b(?:food map|ban do am thuc)\b/.test(normalized) &&
      /\b(?:tim|hien|xem|o|cho)\b/.test(normalized)
    ) {
      return makeRoute(
        'food_map_search',
        {
          cuisineOrCategory,
          dishName: cuisineOrCategory,
          districtOrLocation,
          sourcePreference: 'mixed',
        },
        0.92,
        { structured: true }
      )
    }

    if (
      /\b(?:tim|goi y|cho toi|o dau co)\b.*\b(?:quan|nha hang|an|uong|ca phe)\b/.test(
        normalized
      ) ||
      /^(?:an|uong)\b.*\bo dau\b/.test(normalized) ||
      /^(?:toi|minh)\s+(?:can|muon)\s+(?:di\s+)?(?:an|uong)\b/.test(normalized)
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

    const vietnameseRestaurantRecommendation =
      /\b(?:goi y|de xuat|tu van)\b/.test(normalized) &&
      /\b(?:quan|nha hang|ca phe|noi an)\b/.test(normalized)
    const vietnameseRecipeRecommendation =
      /\b(?:goi y|de xuat|tu van)\b/.test(normalized) &&
      !vietnameseRestaurantRecommendation

    if (vietnameseRestaurantRecommendation) {
      return makeRoute(
        'restaurant_search',
        {
          cuisineOrCategory,
          dishName: cuisineOrCategory,
          districtOrLocation,
          priceRange,
          sourcePreference: 'restaurant',
        },
        0.9,
        { structured: true, retrieval: true }
      )
    }

    if (vietnameseRecipeRecommendation) {
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
      /\b(?:mon an|cong thuc|nau an|quan an|nha hang|am thuc|foodstory)\b/.test(
        normalized
      )
    ) {
      return makeRoute(
        'general_foodstory_rag',
        { cuisineOrCategory, districtOrLocation, sourcePreference: 'mixed' },
        0.65,
        { retrieval: true, groq: true }
      )
    }
  }

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
    /\bmy (?:saved )?(?:food map )?(?:places|food spots)\b/.test(normalized) ||
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
  ) || /\bnutrition(?: facts| information)?\b/.test(normalized)
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
      {
        recipeName,
        needsRecipeContext,
        allowGeneralGuidance: Boolean(recipeName),
        sourcePreference: 'recipe',
      },
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
