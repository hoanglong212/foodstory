export const INTENTS = {
  FIND_RESTAURANT: [
    'find',
    'restaurant',
    'where to eat',
    'suggest',
    'recommend',
    'place to eat',
    'food place',
  ],
  FIND_RECIPE: ['recipe', 'cook', 'how to make', 'ingredients', 'dish'],
  FIND_SPOT: ['my places', 'saved places', 'saved spot', 'spot', 'places i visited', 'history'],
  TOP_RATED: [
    'best',
    'top rated',
    'hot',
    'popular',
    'high rating',
    'highly rated',
  ],
  CHEAP: ['cheap', 'affordable', 'budget', 'inexpensive'],
  NEARBY_DISTRICT: [],
}

export const DISTRICTS = {
  'district 1': 'District 1',
  d1: 'District 1',
  'district 2': 'District 2',
  d2: 'District 2',
  'district 3': 'District 3',
  d3: 'District 3',
  'district 4': 'District 4',
  d4: 'District 4',
  'district 5': 'District 5',
  d5: 'District 5',
  'district 6': 'District 6',
  d6: 'District 6',
  'district 7': 'District 7',
  d7: 'District 7',
  'district 8': 'District 8',
  d8: 'District 8',
  'district 9': 'District 9',
  d9: 'District 9',
  'district 10': 'District 10',
  d10: 'District 10',
  'district 11': 'District 11',
  d11: 'District 11',
  'district 12': 'District 12',
  d12: 'District 12',
  'binh thanh': 'Binh Thanh',
  'binh tan': 'Binh Tan',
  'go vap': 'Go Vap',
  'tan binh': 'Tan Binh',
  'tan phu': 'Tan Phu',
  'phu nhuan': 'Phu Nhuan',
  'thu duc': 'Thu Duc City',
  'thu duc city': 'Thu Duc City',
  'binh chanh': 'Binh Chanh',
  'nha be': 'Nha Be',
  'can gio': 'Can Gio',
  'cu chi': 'Cu Chi',
  'hoc mon': 'Hoc Mon',
}

export const FOOD_KEYWORDS = {
  'beef noodle soup': 'Beef Noodle Soup',
  'broken rice': 'Broken Rice',
  'banh mi': 'Banh Mi',
  'hu tieu': 'Hu Tieu',
  seafood: 'Seafood',
  'savory pancake': 'Savory Pancakes',
  'steamed rice rolls': 'Steamed Rice Rolls',
  coffee: 'Cafe',
  cafe: 'Cafe',
  'grilled pork rolls': 'Grilled Pork Rolls',
  pho: 'Pho',
  noodles: 'Noodles',
  rice: 'Rice',
  'dim sum': 'Dim Sum',
  dimsum: 'Dim Sum',
  'hot pot': 'Hot Pot',
  dessert: 'Dessert',
  congee: 'Congee',
  beef: 'Beef',
  chicken: 'Grilled Chicken',
  snacks: 'Snacks',
}

export const PRICE_KEYWORDS = {
  cheap: ['cheap', 'affordable', 'budget', 'inexpensive'],
  mid: ['mid-range', 'moderate', 'average price'],
  expensive: ['expensive', 'premium', 'upscale'],
}

const GREETINGS = ['hello', 'hi', 'hey', 'good morning', 'good afternoon']
const HELP_KEYWORDS = ['help', 'what can you do', 'guide']
const RECIPE_STRONG_KEYWORDS = ['recipe', 'cook', 'how to make', 'ingredients']
const RESTAURANT_STRONG_KEYWORDS = ['restaurant', 'where to eat', 'place to eat']
const RESTAURANT_GENERIC_KEYWORDS = ['find', 'suggest', 'recommend', 'place']

function cleanText(value) {
  return String(value || '')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function includesConversationKeyword(text, keyword) {
  if (keyword.includes(' ')) {
    return text.includes(keyword)
  }

  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.includes(keyword)
}

function findMappedValue(message, dictionary) {
  const lower = cleanText(message)
  const aliases = Object.keys(dictionary).sort((left, right) => right.length - left.length)
  const alias = aliases.find((item) => lower.includes(item))
  return alias ? dictionary[alias] : null
}

function extractKeyword(message, category) {
  if (category) {
    return category
  }

  let keyword = cleanText(message)
  const removable = [
    ...Object.keys(DISTRICTS),
    ...Object.values(PRICE_KEYWORDS).flat(),
    ...INTENTS.TOP_RATED,
    ...INTENTS.FIND_SPOT,
    ...RECIPE_STRONG_KEYWORDS,
    ...RESTAURANT_STRONG_KEYWORDS,
    ...RESTAURANT_GENERIC_KEYWORDS,
    'dish',
    'food',
    'best',
    'in',
    'at',
    'for me',
    'please',
  ].sort((left, right) => right.length - left.length)

  removable.forEach((phrase) => {
    keyword = keyword.replaceAll(phrase, ' ')
  })

  keyword = keyword
    .replace(/[?!.,;:()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return keyword || null
}

export function detectMatchedIntents(message) {
  const lower = cleanText(message)
  const matches = []
  const hasSpotIntent = includesAny(lower, INTENTS.FIND_SPOT)
  const hasRecipeIntent = includesAny(lower, RECIPE_STRONG_KEYWORDS)
  const hasRestaurantIntent = includesAny(lower, RESTAURANT_STRONG_KEYWORDS)

  if (hasSpotIntent) {
    matches.push('FIND_SPOT')
  }
  if (hasRecipeIntent) {
    matches.push('FIND_RECIPE')
  }
  if (hasRestaurantIntent) {
    matches.push('FIND_RESTAURANT')
  }

  if (matches.length > 0) {
    return [...new Set(matches)]
  }

  const hasFoodOrDistrict = Boolean(
    findMappedValue(lower, FOOD_KEYWORDS) || findMappedValue(lower, DISTRICTS),
  )
  const hasRestaurantModifier =
    includesAny(lower, RESTAURANT_GENERIC_KEYWORDS) ||
    includesAny(lower, INTENTS.TOP_RATED) ||
    includesAny(lower, INTENTS.CHEAP) ||
    lower.includes('food')

  if (hasFoodOrDistrict || hasRestaurantModifier) {
    return ['FIND_RESTAURANT']
  }

  return []
}

export function detectIntent(message) {
  const intents = detectMatchedIntents(message)
  if (intents.length > 1) {
    return 'combined'
  }
  return intents[0] || 'unknown'
}

export function extractEntities(message) {
  const lower = cleanText(message)
  const category = findMappedValue(lower, FOOD_KEYWORDS)
  let price = null

  if (includesAny(lower, PRICE_KEYWORDS.cheap)) {
    price = '$'
  } else if (includesAny(lower, PRICE_KEYWORDS.mid)) {
    price = '$$'
  } else if (includesAny(lower, PRICE_KEYWORDS.expensive)) {
    price = '$$$'
  }

  return {
    district: findMappedValue(lower, DISTRICTS),
    category,
    price,
    topRated: includesAny(lower, INTENTS.TOP_RATED),
    keyword: extractKeyword(lower, category),
  }
}

export function analyzeMessage(message) {
  const intents = detectMatchedIntents(message)
  return {
    intent: intents.length > 1 ? 'combined' : intents[0] || 'unknown',
    intents,
    entities: extractEntities(message),
  }
}

export function buildRestaurantQuery(entities) {
  let sql = `SELECT id, name, address, district, category,
                    avg_rating, price_range, description,
                    latitude, longitude
             FROM restaurants
             WHERE 1 = 1`
  const params = []

  if (entities.district) {
    sql += ' AND district = ?'
    params.push(entities.district)
  }
  if (entities.category) {
    sql += ' AND category = ?'
    params.push(entities.category)
  }
  if (entities.price) {
    sql += ' AND price_range = ?'
    params.push(entities.price)
  }
  if (entities.topRated) {
    sql += ' AND avg_rating >= 4.5'
  }

  sql += ' ORDER BY avg_rating DESC, id ASC LIMIT 5'
  return { sql, params }
}

export function buildRecipeQuery(entities) {
  let sql = `SELECT
               r.id, r.title, r.image_url, r.description,
               r.prep_time, r.cook_time, r.servings,
               c.name AS category,
               COALESCE(rating_stats.avg_rating, 0) AS avg_rating
             FROM recipes r
             JOIN categories c ON c.id = r.category_id
             LEFT JOIN (
               SELECT recipe_id, AVG(rating_value) AS avg_rating
               FROM ratings
               GROUP BY recipe_id
             ) rating_stats ON rating_stats.recipe_id = r.id
             WHERE r.status = 'approved'`
  const params = []

  if (entities.keyword) {
    const pattern = `%${entities.keyword}%`
    sql += ` AND (
      r.title LIKE ?
      OR r.description LIKE ?
      OR c.name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM recipe_ingredients ingredient
        WHERE ingredient.recipe_id = r.id AND ingredient.ingredient_name LIKE ?
      )
      OR EXISTS (
        SELECT 1
        FROM recipe_tags recipe_tag
        JOIN tags tag ON tag.id = recipe_tag.tag_id
        WHERE recipe_tag.recipe_id = r.id AND tag.name LIKE ?
      )
    )`
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  sql += ' ORDER BY avg_rating DESC, r.created_at DESC, r.id DESC LIMIT 5'
  return { sql, params }
}

export function buildSpotQuery(entities, userId) {
  let sql = `SELECT
               id, name, dish_name, category, district,
               latitude, longitude, rating, notes, created_at
             FROM food_spots
             WHERE user_id = ?`
  const params = [userId]

  if (entities.district) {
    sql += ' AND district = ?'
    params.push(entities.district)
  }
  if (entities.category) {
    sql += ' AND category = ?'
    params.push(entities.category)
  }
  if (entities.keyword && !entities.category) {
    const pattern = `%${entities.keyword}%`
    sql += ' AND (name LIKE ? OR dish_name LIKE ? OR notes LIKE ? OR tags LIKE ?)'
    params.push(pattern, pattern, pattern, pattern)
  }
  if (entities.topRated) {
    sql += ' AND rating >= 4'
  }

  sql += ' ORDER BY rating DESC, created_at DESC, id DESC LIMIT 5'
  return { sql, params }
}

function resultLabel(entities, fallback) {
  return entities.category || entities.keyword || fallback
}

export function generateResponse(intent, entities, results, options = {}) {
  const total = results.length

  if (total === 0) {
    if (intent === 'combined') {
      return {
        message:
          'I could not find matching restaurants, recipes, or saved places. Try a more specific question.',
        suggestions: ['Find restaurants', 'Banh mi recipe', 'Saved places'],
      }
    }
    if (intent === 'FIND_RECIPE') {
      return {
        message: `I could not find a recipe for "${resultLabel(entities, 'this dish')}". Try another dish or ingredient.`,
        suggestions: ['View all recipes', 'Banh mi recipe'],
      }
    }
    if (intent === 'FIND_SPOT') {
      return {
        message: 'You do not have any saved places matching this request.',
        suggestions: ['Open food map', 'Find restaurants'],
      }
    }

    return {
      message: `Sorry, I could not find a matching ${entities.category || 'place'}${entities.district ? ` in ${entities.district}` : ''}. Try another area or dish.`,
      suggestions: ['View all restaurants', 'Find another dish'],
    }
  }

  if (intent === 'FIND_RESTAURANT') {
    const topPlace = results[0]
    const filters = [
      entities.price === '$' ? 'affordable' : '',
      entities.category || '',
      entities.district ? `in ${entities.district}` : 'in Ho Chi Minh City',
    ]
      .filter(Boolean)
      .join(' ')

    return {
      message: `I found ${total} restaurants ${filters}. Top result: ${topPlace.name} (${Number(topPlace.avg_rating || 0).toFixed(1)} stars).`,
      suggestions: [
        'View on map',
        `Find more ${entities.category || 'good food'}`,
        'Affordable restaurants',
      ],
    }
  }

  if (intent === 'FIND_RECIPE') {
    return {
      message: `I found ${total} recipes matching "${resultLabel(entities, 'your search')}".`,
      suggestions: ['View recipe', 'Banh mi recipe'],
    }
  }

  if (intent === 'FIND_SPOT') {
    return {
      message: `You have ${total} matching saved places.`,
      suggestions: ['Open food map', 'Find restaurants'],
    }
  }

  const loginNote = options.requiresLogin
    ? ' Log in so I can also search your saved places.'
    : ''
  return {
    message: `I found ${total} results from FoodStory.${loginNote}`,
    suggestions: options.requiresLogin
      ? ['Log in', 'Find restaurants', 'Find recipes']
      : ['Find restaurants', 'Find recipes', 'Saved places'],
  }
}

export function handleSmallTalk(message) {
  const lower = cleanText(message)

  if (GREETINGS.some((greeting) => includesConversationKeyword(lower, greeting))) {
    return {
      message: `Hello! I am FoodBot.

I can help you:
• Find restaurants by area
• Suggest food based on your preferences
• Find cooking recipes
• Review your saved places

Try asking: "Best pho in District 1"`,
      type: 'greeting',
      suggestions: ['Best pho in District 1', 'Cafe in Binh Thanh', 'Banh mi recipe'],
    }
  }

  if (HELP_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      message: `FoodBot can help you:

• Find restaurants: "best pho in District 1", "cafe in Binh Thanh"
• Find recipes: "banh mi recipe", "how to cook pho"
• Search your places: "what places have I saved"
• Get suggestions: "best food", "good affordable restaurants"`,
      type: 'help',
      suggestions: ['Find restaurants', 'Find recipes', 'Saved places'],
    }
  }

  return null
}
