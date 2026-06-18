import pool from '../db.js'

const RESTAURANT_SELECT = `
  SELECT
    id,
    name,
    address,
    district,
    category,
    latitude,
    longitude,
    avg_rating,
    price_range,
    description
  FROM restaurants
`

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlapScore(query, candidate) {
  const queryTokens = new Set(normalizeText(query).split(' ').filter(Boolean))
  const candidateTokens = new Set(normalizeText(candidate).split(' ').filter(Boolean))
  if (!queryTokens.size || !candidateTokens.size) return 0

  const matches = [...queryTokens].filter((token) => candidateTokens.has(token)).length
  return matches / queryTokens.size
}

function searchableRestaurantText(restaurant) {
  return normalizeText(
    `${restaurant.name} ${restaurant.category} ${restaurant.description}`
  )
}

function matchesPhrase(text, phrase) {
  const normalizedPhrase = normalizeText(phrase)
  return normalizedPhrase ? ` ${text} `.includes(` ${normalizedPhrase} `) : true
}

async function fetchRestaurants() {
  const [rows] = await pool.execute(
    `${RESTAURANT_SELECT}
     ORDER BY avg_rating DESC, id ASC`
  )
  return rows
}

export async function findRestaurantByName(restaurantName, options = {}) {
  if (options.restaurantId) {
    const [rows] = await pool.execute(
      `${RESTAURANT_SELECT}
       WHERE id = ?
       LIMIT 1`,
      [options.restaurantId]
    )
    return rows[0]
      ? { restaurant: rows[0], matchScore: 1, matchType: 'id' }
      : { restaurant: null, matchScore: 0, matchType: 'none' }
  }

  const normalizedName = normalizeText(restaurantName)
  if (!normalizedName) {
    return { restaurant: null, matchScore: 0, matchType: 'none' }
  }

  const [exactRows] = await pool.execute(
    `${RESTAURANT_SELECT}
     WHERE LOWER(name) = LOWER(?)
     LIMIT 1`,
    [restaurantName]
  )
  if (exactRows[0]) {
    return { restaurant: exactRows[0], matchScore: 1, matchType: 'exact' }
  }

  const [likeRows] = await pool.execute(
    `${RESTAURANT_SELECT}
     WHERE name LIKE ?
     ORDER BY CHAR_LENGTH(name) ASC
     LIMIT 5`,
    [`%${String(restaurantName).trim()}%`]
  )
  if (likeRows[0]) {
    return { restaurant: likeRows[0], matchScore: 0.92, matchType: 'like' }
  }

  const restaurants = await fetchRestaurants()
  const ranked = restaurants
    .map((restaurant) => ({
      restaurant,
      score: tokenOverlapScore(restaurantName, restaurant.name),
    }))
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.score >= 0.5
    ? {
        restaurant: ranked[0].restaurant,
        matchScore: Math.min(0.89, ranked[0].score),
        matchType: 'token_overlap',
      }
    : { restaurant: null, matchScore: ranked[0]?.score || 0, matchType: 'none' }
}

export async function searchRestaurants(entities, limit = 3) {
  const restaurants = await fetchRestaurants()
  const category = entities.cuisineOrCategory || entities.dishName
  const district = entities.districtOrLocation
  const priceRange = entities.priceRange
  const hasConstraints = Boolean(category || district || priceRange)

  const ranked = restaurants
    .map((restaurant) => {
      const text = searchableRestaurantText(restaurant)
      const categoryMatched = category ? matchesPhrase(text, category) : true
      const districtMatched = district
        ? normalizeText(restaurant.district) === normalizeText(district)
        : true
      const priceMatched = priceRange
        ? normalizeText(restaurant.price_range) === normalizeText(priceRange)
        : true
      const matchesAllConstraints =
        categoryMatched && districtMatched && priceMatched
      const score =
        (category ? (categoryMatched ? 0.55 : 0) : 0.25) +
        (district ? (districtMatched ? 0.3 : 0) : 0.15) +
        (priceRange ? (priceMatched ? 0.1 : 0) : 0.05) +
        0.05 * (Number(restaurant.avg_rating || 0) / 5)

      return {
        ...restaurant,
        score,
        categoryMatched,
        districtMatched,
        priceMatched,
        matchesAllConstraints,
      }
    })
    .sort(
      (left, right) =>
        Number(right.matchesAllConstraints) - Number(left.matchesAllConstraints) ||
        right.score - left.score ||
        Number(right.avg_rating) - Number(left.avg_rating)
    )

  const exactMatches = hasConstraints
    ? ranked.filter((restaurant) => restaurant.matchesAllConstraints)
    : ranked
  const status =
    hasConstraints && !exactMatches.length
      ? 'no_exact_constraint_match'
      : exactMatches.length
        ? 'matched'
        : 'no_results'
  const results = (exactMatches.length ? exactMatches : ranked).slice(0, limit)

  return {
    status,
    results,
    cuisineOrCategory: category || null,
    districtOrLocation: district || null,
    priceRange: priceRange || null,
  }
}

export async function searchRestaurantsByCategoryAndDistrict(
  { cuisineOrCategory, districtOrLocation, priceRange = null },
  limit = 3
) {
  return searchRestaurants(
    { cuisineOrCategory, districtOrLocation, priceRange },
    limit
  )
}

async function resolveRestaurant(entities, context = {}) {
  const restaurantId =
    entities.needsRestaurantContext || !entities.restaurantName
      ? context.lastRestaurantId
      : null

  if ((entities.needsRestaurantContext || !entities.restaurantName) && !restaurantId) {
    return { status: 'needs_context', message: 'Which restaurant do you mean?' }
  }

  const match = await findRestaurantByName(entities.restaurantName, { restaurantId })
  if (!match.restaurant) {
    return {
      status: 'restaurant_not_found',
      message: `FoodStory could not find a restaurant matching "${entities.restaurantName || 'that restaurant'}".`,
    }
  }

  return { status: 'matched', restaurant: match.restaurant, matchScore: match.matchScore }
}

async function searchFoodSpots(entities, limit = 3) {
  const [spots] = await pool.execute(
    `SELECT id, name, dish_name, category, district, latitude, longitude, rating, created_at
     FROM food_spots
     ORDER BY rating DESC, id ASC`
  )
  const category = entities.cuisineOrCategory || entities.dishName
  const district = entities.districtOrLocation

  const matches = spots
    .filter((spot) => {
      const text = normalizeText(
        `${spot.name} ${spot.dish_name} ${spot.category}`
      )
      const categoryMatched = category ? matchesPhrase(text, category) : true
      const districtMatched = district
        ? normalizeText(spot.district) === normalizeText(district)
        : true
      return categoryMatched && districtMatched
    })
    .slice(0, limit)

  return {
    status: matches.length ? 'matched' : 'no_results',
    results: matches,
    cuisineOrCategory: category || null,
    districtOrLocation: district || null,
  }
}

export async function handleRestaurantStructuredQuery(route, context = {}) {
  if (route.intent === 'restaurant_search') {
    return searchRestaurants(route.entities)
  }
  if (route.intent === 'food_map_search') {
    return searchFoodSpots(route.entities)
  }

  const resolved = await resolveRestaurant(route.entities, context)
  if (resolved.status !== 'matched') return resolved

  return {
    ...resolved,
    kind: route.intent,
  }
}

export async function answerRestaurantAddress(restaurantName, context = {}) {
  return handleRestaurantStructuredQuery(
    {
      intent: 'restaurant_address',
      entities: {
        restaurantName,
        needsRestaurantContext: !restaurantName,
      },
    },
    context
  )
}

export async function answerRestaurantPrice(restaurantName, context = {}) {
  return handleRestaurantStructuredQuery(
    {
      intent: 'restaurant_price',
      entities: {
        restaurantName,
        needsRestaurantContext: !restaurantName,
      },
    },
    context
  )
}

export async function answerRestaurantRating(restaurantName, context = {}) {
  return handleRestaurantStructuredQuery(
    {
      intent: 'restaurant_rating',
      entities: {
        restaurantName,
        needsRestaurantContext: !restaurantName,
      },
    },
    context
  )
}

export async function answerRestaurantLocationSearch(entities, limit = 3) {
  return searchRestaurants(entities, limit)
}
