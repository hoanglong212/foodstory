import { embedText } from './aiEmbeddingClient.js'
import { getAllAiEmbeddings } from './aiEmbeddingRepository.js'

const SCORING_WEIGHTS = Object.freeze({
  semantic: 0.45,
  intent: 0.15,
  constraint: 0.15,
  keyword: 0.1,
  category: 0.1,
  location: 0.05,
})

const MATCH_THRESHOLDS = Object.freeze({
  strong: 0.7,
  partial: 0.5,
  minimumStrongSemantic: 0.4,
})

const MAX_TOP_K = 20

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'can',
  'could',
  'find',
  'food',
  'for',
  'give',
  'how',
  'i',
  'in',
  'is',
  'me',
  'of',
  'on',
  'or',
  'please',
  'recommend',
  'restaurant',
  'restaurants',
  'the',
  'to',
  'want',
  'where',
  'with',
  'you',
])

const RECIPE_INTENT_PHRASES = [
  'how to cook',
  'how to make',
  'how to prepare',
  'tell me how to make',
  'recipe',
  'recipes',
  'ingredients',
  'ingredient',
  'cooking instructions',
  'meal prep',
  'low calorie',
  'calories',
  'healthy meal',
  'nutrition',
  'servings',
  'difficulty',
]

const RESTAURANT_INTENT_PHRASES = [
  'where can i eat',
  'where can i drink',
  'where to eat',
  'eat out',
  'restaurant',
  'restaurants',
  'food spot',
  'food spots',
  'near me',
  'nearby',
  'address',
  'dine',
  'dining',
  'find a cafe',
  'find cafe',
]

const MIXED_INTENT_PATTERNS = [
  /\brecommend\b.+\b(?:and|then)\b.+\b(?:how to|make|cook|recipe)\b/,
  /\bwhere\b.+\b(?:eat|restaurant)\b.+\b(?:and|then)\b.+\b(?:make|cook)\b/,
]

// Add new domain terms here. Aliases are matched as complete normalized phrases,
// which avoids cases such as "district 1" incorrectly matching "district 10".
const CUISINE_CONSTRAINTS = [
  { value: 'beef noodle soup', aliases: ['beef noodle soup', 'spicy beef noodle soup'] },
  { value: 'tofu vermicelli', aliases: ['tofu vermicelli', 'bun dau'] },
  { value: 'broken rice', aliases: ['broken rice', 'com tam'] },
  { value: 'chicken rice', aliases: ['chicken rice', 'com ga'] },
  { value: 'banh mi', aliases: ['banh mi', 'banhmy'] },
  { value: 'bun bo', aliases: ['bun bo', 'bun bo hue'] },
  { value: 'dim sum', aliases: ['dim sum', 'dimsum'] },
  { value: 'hot pot', aliases: ['hot pot', 'hotpot'] },
  { value: 'specialties', aliases: ['specialties', 'speciality', 'specialty'] },
  { value: 'vegetarian', aliases: ['vegetarian', 'vegan', 'plant based'] },
  { value: 'vietnamese', aliases: ['vietnamese', 'viet food'] },
  { value: 'japanese', aliases: ['japanese'] },
  { value: 'korean', aliases: ['korean'] },
  { value: 'thai', aliases: ['thai'] },
  { value: 'chinese', aliases: ['chinese'] },
  { value: 'indian', aliases: ['indian'] },
  { value: 'italian', aliases: ['italian'] },
  { value: 'mexican', aliases: ['mexican'] },
  { value: 'seafood', aliases: ['seafood', 'shellfish'] },
  { value: 'dessert', aliases: ['dessert', 'desserts', 'sweet dish'] },
  { value: 'breakfast', aliases: ['breakfast', 'brunch'] },
  { value: 'cafe', aliases: ['cafe', 'coffee shop'] },
  { value: 'drinks', aliases: ['drinks', 'drink', 'beverage', 'beverages'] },
  { value: 'noodles', aliases: ['noodles', 'noodle'] },
  { value: 'pho', aliases: ['pho'] },
  { value: 'sushi', aliases: ['sushi'] },
]

const LOCATION_CONSTRAINTS = [
  ...Array.from({ length: 12 }, (_, index) => {
    const districtNumber = index + 1
    return {
      value: `district ${districtNumber}`,
      aliases: [
        `district ${districtNumber}`,
        `quan ${districtNumber}`,
        `q${districtNumber}`,
        `d${districtNumber}`,
      ],
    }
  }),
  { value: 'go vap', aliases: ['go vap'] },
  { value: 'binh thanh', aliases: ['binh thanh'] },
  { value: 'tan binh', aliases: ['tan binh'] },
  { value: 'phu nhuan', aliases: ['phu nhuan'] },
  { value: 'thu duc', aliases: ['thu duc'] },
  { value: 'thao dien', aliases: ['thao dien'] },
]

const CUISINE_ADJECTIVES = new Set([
  'vietnamese',
  'japanese',
  'korean',
  'thai',
  'chinese',
  'indian',
  'italian',
  'mexican',
])

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    throw new Error('Both inputs must be arrays')
  }

  if (vectorA.length !== vectorB.length) {
    throw new Error(`Vector length mismatch: ${vectorA.length} vs ${vectorB.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let index = 0; index < vectorA.length; index++) {
    dotProduct += vectorA[index] * vectorB[index]
    normA += vectorA[index] * vectorA[index]
    normB += vectorB[index] * vectorB[index]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function clampScore(score) {
  return Math.max(0, Math.min(1, score))
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

function containsPhrase(normalizedText, phrase) {
  if (!normalizedText || !phrase) return false
  return ` ${normalizedText} `.includes(` ${normalizeText(phrase)} `)
}

function hasAnyPhrase(normalizedText, phrases) {
  return phrases.some((phrase) => containsPhrase(normalizedText, phrase))
}

function extractConstraint(query, definitions) {
  const normalizedQuery = normalizeText(query)

  for (const definition of definitions) {
    const matchedAlias = [...definition.aliases]
      .sort((left, right) => right.length - left.length)
      .find((alias) => containsPhrase(normalizedQuery, alias))

    if (matchedAlias) {
      return {
        value: definition.value,
        alias: normalizeText(matchedAlias),
        definition,
      }
    }
  }

  return null
}

function detectUserIntent(query, locationConstraint) {
  const normalizedQuery = normalizeText(query)
  const recipeSignal = hasAnyPhrase(normalizedQuery, RECIPE_INTENT_PHRASES)
  const restaurantSignal =
    hasAnyPhrase(normalizedQuery, RESTAURANT_INTENT_PHRASES) ||
    Boolean(locationConstraint)
  const explicitMixedSignal = MIXED_INTENT_PATTERNS.some((pattern) =>
    pattern.test(normalizedQuery)
  )

  if (explicitMixedSignal || (recipeSignal && restaurantSignal)) return 'mixed'
  if (recipeSignal) return 'recipe'
  if (restaurantSignal) return 'restaurant'
  return 'general'
}

function calculateIntentScore(intent, sourceType) {
  if (intent === 'restaurant') {
    if (sourceType === 'restaurant') return 1
    if (sourceType === 'food_spot') return 0.9
    return 0.1
  }

  if (intent === 'recipe') {
    return sourceType === 'recipe' ? 1 : 0.1
  }

  if (intent === 'mixed') {
    if (sourceType === 'recipe' || sourceType === 'restaurant') return 1
    if (sourceType === 'food_spot') return 0.9
    if (sourceType === 'news') return 0.2
    return 0.5
  }

  if (sourceType === 'news') return 0.15
  return ['recipe', 'restaurant', 'food_spot'].includes(sourceType) ? 0.6 : 0.4
}

function isIntentCompatible(intent, sourceType) {
  if (intent === 'restaurant') {
    return sourceType === 'restaurant' || sourceType === 'food_spot'
  }

  if (intent === 'recipe') {
    return sourceType === 'recipe'
  }

  return true
}

function keywordOverlapScore(query, text) {
  const queryWords = new Set(
    normalizeText(query)
      .split(' ')
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
  )

  if (!queryWords.size) return 0

  const targetWords = new Set(normalizeText(text).split(' '))
  const matchedWordCount = [...queryWords].filter((word) => targetWords.has(word)).length

  return matchedWordCount / queryWords.size
}

function itemMatchesConstraint(normalizedItemText, constraintMatch) {
  if (!constraintMatch) return false

  return constraintMatch.definition.aliases.some((alias) =>
    containsPhrase(normalizedItemText, alias)
  )
}

function calculateConstraintScore({
  hasCuisineConstraint,
  hasLocationConstraint,
  cuisineMatched,
  locationMatched,
}) {
  if (hasCuisineConstraint && hasLocationConstraint) {
    if (cuisineMatched && locationMatched) return 1
    if (cuisineMatched || locationMatched) return 0.35
    return 0
  }

  if (hasCuisineConstraint) return cuisineMatched ? 1 : 0
  if (hasLocationConstraint) return locationMatched ? 1 : 0
  return 0.5
}

function calculateFinalScore({
  semanticScore,
  intentScore,
  constraintScore,
  keywordScore,
  categoryScore,
  locationScore,
}) {
  return (
    SCORING_WEIGHTS.semantic * semanticScore +
    SCORING_WEIGHTS.intent * intentScore +
    SCORING_WEIGHTS.constraint * constraintScore +
    SCORING_WEIGHTS.keyword * keywordScore +
    SCORING_WEIGHTS.category * categoryScore +
    SCORING_WEIGHTS.location * locationScore
  )
}

function classifyMatchLevel(result, hasConstraints) {
  const hasRequiredConstraints = !hasConstraints || result.matchesAllConstraints
  const hasGoodIntent = result.intentScore >= 0.6

  if (
    result.score >= MATCH_THRESHOLDS.strong &&
    result.semanticScore >= MATCH_THRESHOLDS.minimumStrongSemantic &&
    hasRequiredConstraints &&
    hasGoodIntent
  ) {
    return 'strong'
  }

  if (
    result.score >= MATCH_THRESHOLDS.partial ||
    result.matchesAnyConstraint ||
    result.intentScore >= 0.9
  ) {
    return 'partial'
  }

  return 'weak'
}

function normalizeTopK(topK) {
  const parsedTopK = Number.parseInt(topK, 10)
  if (!Number.isFinite(parsedTopK)) return 5
  return Math.max(1, Math.min(parsedTopK, MAX_TOP_K))
}

function buildSearchableText(item) {
  return `${item.title || ''} ${item.chunkText || ''} ${item.content || ''} ${JSON.stringify(
    item.metadata || {}
  )}`
}

function formatLabel(value) {
  if (!value) return null
  if (value.startsWith('district ')) {
    return `District ${value.split(' ')[1]}`
  }

  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function describeConstraints(cuisineConstraint, locationConstraint) {
  const formattedCuisine = formatLabel(cuisineConstraint)
  const formattedLocation = formatLabel(locationConstraint)
  const cuisineDescription = CUISINE_ADJECTIVES.has(cuisineConstraint)
    ? `${formattedCuisine} food`
    : formattedCuisine

  if (cuisineDescription && formattedLocation) {
    return `${cuisineDescription} in ${formattedLocation}`
  }

  if (cuisineDescription) return cuisineDescription
  if (formattedLocation) return `FoodStory results in ${formattedLocation}`
  return 'the requested constraints'
}

function buildStatusMessage(status, cuisineConstraint, locationConstraint) {
  if (status === 'matched') return 'Found matching FoodStory results.'
  if (status === 'partial_match') return 'Found partially matching FoodStory results.'
  if (status === 'weak_match') {
    return 'Only weakly related FoodStory results were found.'
  }
  if (status === 'no_results') return 'No FoodStory results are available.'

  const constraintDescription = describeConstraints(
    cuisineConstraint,
    locationConstraint
  )

  return `No exact match found for ${constraintDescription}. Showing the closest available FoodStory results instead.`
}

function determineResponseStatus(results, hasConstraints, hasExactConstraintMatch) {
  if (!results.length) return 'no_results'
  if (hasConstraints && !hasExactConstraintMatch) {
    return 'no_exact_constraint_match'
  }

  if (results[0].matchLevel === 'strong') return 'matched'
  if (results[0].matchLevel === 'partial') return 'partial_match'
  return 'weak_match'
}

function scoreDocument({
  item,
  query,
  queryEmbedding,
  detectedIntent,
  cuisineMatch,
  locationMatch,
}) {
  const searchableText = buildSearchableText(item)
  const normalizedItemText = normalizeText(searchableText)
  const semanticScore = clampScore(cosineSimilarity(queryEmbedding, item.embedding))
  const intentScore = calculateIntentScore(detectedIntent, item.sourceType)
  const cuisineMatched = itemMatchesConstraint(normalizedItemText, cuisineMatch)
  const locationMatched = itemMatchesConstraint(normalizedItemText, locationMatch)
  const hasCuisineConstraint = Boolean(cuisineMatch)
  const hasLocationConstraint = Boolean(locationMatch)
  const categoryScore = hasCuisineConstraint ? Number(cuisineMatched) : 0.5
  const locationScore = hasLocationConstraint ? Number(locationMatched) : 0.5
  const constraintScore = calculateConstraintScore({
    hasCuisineConstraint,
    hasLocationConstraint,
    cuisineMatched,
    locationMatched,
  })
  const keywordScore = keywordOverlapScore(query, searchableText)
  const score = calculateFinalScore({
    semanticScore,
    intentScore,
    constraintScore,
    keywordScore,
    categoryScore,
    locationScore,
  })
  const matchesAllConstraints =
    (!hasCuisineConstraint || cuisineMatched) &&
    (!hasLocationConstraint || locationMatched)

  return {
    documentId: item.documentId,
    embeddingId: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    chunkText: item.chunkText,
    content: item.content,
    metadata: item.metadata,
    score,
    semanticScore,
    intentScore,
    constraintScore,
    keywordScore,
    categoryScore,
    locationScore,
    detectedIntent,
    cuisineConstraint: cuisineMatch?.value || null,
    locationConstraint: locationMatch?.value || null,
    cuisineMatched,
    locationMatched,
    matchesAnyConstraint: cuisineMatched || locationMatched,
    matchesAllConstraints,

    // Compatibility aliases for existing local callers that used the first
    // intent-aware implementation before the structured score was added.
    intent: detectedIntent,
    intentBoost: intentScore,
    keywordBoost: keywordScore,
    categoryBoost: categoryScore,
    locationBoost: locationScore,
  }
}

export async function retrieveRelevantDocumentsWithDebug(query, topK = 5) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Query is required')
  }

  const normalizedTopK = normalizeTopK(topK)
  const cuisineMatch = extractConstraint(query, CUISINE_CONSTRAINTS)
  const locationMatch = extractConstraint(query, LOCATION_CONSTRAINTS)
  const detectedIntent = detectUserIntent(query, locationMatch)
  const hasConstraints = Boolean(cuisineMatch || locationMatch)
  const queryEmbeddingResult = await embedText(query.trim())
  const storedEmbeddings = await getAllAiEmbeddings()

  const scoredResults = storedEmbeddings
    .map((item) =>
      scoreDocument({
        item,
        query,
        queryEmbedding: queryEmbeddingResult.embedding,
        detectedIntent,
        cuisineMatch,
        locationMatch,
      })
    )
    .sort((left, right) => right.score - left.score || right.semanticScore - left.semanticScore)

  // Explicit constraints are factual filters, not just ranking hints. If an
  // intent-compatible exact group exists, unrelated candidates are excluded.
  // Otherwise the full ranking is retained only as a clearly labelled fallback.
  const exactConstraintMatches = hasConstraints
    ? scoredResults.filter(
        (item) =>
          item.matchesAllConstraints &&
          isIntentCompatible(detectedIntent, item.sourceType)
      )
    : []
  const hasExactConstraintMatch = !hasConstraints || exactConstraintMatches.length > 0
  const candidatePool =
    hasConstraints && exactConstraintMatches.length
      ? exactConstraintMatches
      : scoredResults
  const results = candidatePool.slice(0, normalizedTopK)

  for (const result of results) {
    result.matchLevel = hasExactConstraintMatch
      ? classifyMatchLevel(result, hasConstraints)
      : 'no_exact_constraint_match'
  }

  const status = determineResponseStatus(
    results,
    hasConstraints,
    hasExactConstraintMatch
  )
  const cuisineConstraint = cuisineMatch?.value || null
  const locationConstraint = locationMatch?.value || null

  return {
    query: query.trim(),
    topK: normalizedTopK,
    status,
    detectedIntent,
    cuisineConstraint,
    locationConstraint,
    message: buildStatusMessage(status, cuisineConstraint, locationConstraint),
    results,
  }
}

export async function retrieveRelevantDocuments(query, topK = 5) {
  const response = await retrieveRelevantDocumentsWithDebug(query, topK)
  return response.results
}
