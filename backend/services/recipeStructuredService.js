import pool from '../db.js'

const RECIPE_SELECT = `
  SELECT
    r.id,
    r.title,
    r.description,
    r.instructions,
    r.servings,
    r.prep_time,
    r.cook_time,
    r.calories,
    r.protein,
    r.carbs,
    r.fat,
    r.difficulty,
    r.recipe_notes,
    r.storage_notes,
    r.blog_intro,
    r.why_love_it,
    c.name AS category_name
  FROM recipes r
  LEFT JOIN categories c ON c.id = r.category_id
`

const INGREDIENT_ALIASES = new Map([
  ['ca', 'fish'],
  ['trung', 'egg'],
  ['sua', 'milk'],
  ['banh mi', 'bread'],
  ['ga', 'chicken'],
  ['bo', 'beef'],
  ['thit bo', 'beef'],
  ['heo', 'pork'],
  ['thit heo', 'pork'],
  ['thit lon', 'pork'],
  ['tom', 'shrimp'],
  ['com', 'rice'],
  ['sua dua', 'coconut milk'],
  ['nuoc dua', 'coconut water'],
  ['dau hu', 'tofu'],
  ['khoai tay', 'potato'],
  ['ca chua', 'tomato'],
  ['hanh tay', 'onion'],
  ['toi', 'garlic'],
])

const INGREDIENT_CONCEPT_TERMS = new Map([
  ['fish', ['fish', 'salmon', 'cod', 'tuna', 'tilapia', 'mackerel', 'sardine']],
  ['beef', ['beef', 'steak', 'sirloin']],
  ['pork', ['pork', 'ham', 'bacon']],
  ['chicken', ['chicken']],
  ['shrimp', ['shrimp', 'prawn']],
])
const DERIVED_INGREDIENT_TOKENS = new Set([
  'sauce',
  'paste',
  'stock',
  'broth',
  'seasoning',
  'powder',
  'oil',
  'extract',
  'flavor',
  'flavour',
])

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularizeToken(token) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2)
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1)
  return token
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .map(singularizeToken)
}

function tokenOverlapScore(query, candidate) {
  const queryTokens = new Set(tokenize(query))
  const candidateTokens = new Set(tokenize(candidate))
  if (!queryTokens.size || !candidateTokens.size) return 0

  const intersection = [...queryTokens].filter((token) => candidateTokens.has(token)).length
  const queryCoverage = intersection / queryTokens.size
  const candidateCoverage = intersection / candidateTokens.size
  return 0.75 * queryCoverage + 0.25 * candidateCoverage
}

async function fetchApprovedRecipes() {
  const [rows] = await pool.execute(
    `${RECIPE_SELECT}
     WHERE r.status = 'approved'
     ORDER BY r.title ASC`
  )
  return rows
}

export async function findRecipeByFuzzyTitle(recipeName, options = {}) {
  if (options.recipeId) {
    const [rows] = await pool.execute(
      `${RECIPE_SELECT}
       WHERE r.id = ? AND r.status = 'approved'
       LIMIT 1`,
      [options.recipeId]
    )

    return rows[0]
      ? { recipe: rows[0], matchScore: 1, matchType: 'id' }
      : { recipe: null, matchScore: 0, matchType: 'none' }
  }

  const normalizedName = normalizeText(recipeName)
  if (!normalizedName) {
    return { recipe: null, matchScore: 0, matchType: 'none' }
  }

  const [exactRows] = await pool.execute(
    `${RECIPE_SELECT}
     WHERE r.status = 'approved' AND LOWER(r.title) = LOWER(?)
     LIMIT 1`,
    [recipeName]
  )
  if (exactRows[0]) {
    return { recipe: exactRows[0], matchScore: 1, matchType: 'exact' }
  }

  const recipes = await fetchApprovedRecipes()
  const normalizedExact = recipes.find(
    (recipe) => normalizeText(recipe.title) === normalizedName
  )
  if (normalizedExact) {
    return { recipe: normalizedExact, matchScore: 1, matchType: 'normalized_exact' }
  }

  const [likeRows] = await pool.execute(
    `${RECIPE_SELECT}
     WHERE r.status = 'approved' AND r.title LIKE ?
     ORDER BY CHAR_LENGTH(r.title) ASC
     LIMIT 5`,
    [`%${String(recipeName).trim()}%`]
  )
  if (likeRows[0]) {
    return { recipe: likeRows[0], matchScore: 0.92, matchType: 'like' }
  }

  const ranked = recipes
    .map((recipe) => ({
      recipe,
      score: tokenOverlapScore(normalizedName, recipe.title),
    }))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]

  if (!best || best.score < 0.5) {
    return { recipe: null, matchScore: best?.score || 0, matchType: 'none' }
  }

  return {
    recipe: best.recipe,
    matchScore: Math.min(0.89, best.score),
    matchType: 'token_overlap',
  }
}

export async function findRecipeByName(recipeName, options = {}) {
  return findRecipeByFuzzyTitle(recipeName, options)
}

export async function fetchFullRecipeDetails(recipeId) {
  const [rows] = await pool.execute(
    `${RECIPE_SELECT}
     WHERE r.id = ? AND r.status = 'approved'
     LIMIT 1`,
    [recipeId]
  )
  if (!rows[0]) return null

  const [ingredients] = await pool.execute(
    `SELECT id, ingredient_name, quantity
     FROM recipe_ingredients
     WHERE recipe_id = ?
     ORDER BY id ASC`,
    [recipeId]
  )
  const [tags] = await pool.execute(
    `SELECT t.id, t.name
     FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ?
     ORDER BY t.name ASC`,
    [recipeId]
  )

  return {
    ...rows[0],
    ingredients,
    tags,
  }
}

export async function getRecipeIngredients(recipeId) {
  const [rows] = await pool.execute(
    `SELECT id, recipe_id, ingredient_name, quantity
     FROM recipe_ingredients
     WHERE recipe_id = ?
     ORDER BY id ASC`,
    [recipeId]
  )
  return rows
}

function editDistance(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(a[row - 1] !== b[column - 1])
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length]
}

function characterSimilarity(left, right) {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (Math.min(a.length, b.length) < 4) return 0
  return 1 - editDistance(a, b) / Math.max(a.length, b.length)
}

function findIngredient(ingredients, ingredientName) {
  const rawNormalizedName = normalizeText(ingredientName)
  const normalizedName = INGREDIENT_ALIASES.get(rawNormalizedName) || rawNormalizedName
  const exact = ingredients.find(
    (ingredient) => normalizeText(ingredient.ingredient_name) === normalizedName
  )
  if (exact) return { ingredient: exact, matchScore: 1 }

  const partial = ingredients.find((ingredient) => {
    const candidate = normalizeText(ingredient.ingredient_name)
    return candidate.includes(normalizedName) || normalizedName.includes(candidate)
  })
  if (partial) return { ingredient: partial, matchScore: 0.9 }

  const ranked = ingredients
    .map((ingredient) => ({
      ingredient,
      score: Math.max(
        tokenOverlapScore(normalizedName, ingredient.ingredient_name),
        characterSimilarity(normalizedName, ingredient.ingredient_name)
      ),
    }))
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.score >= 0.5
    ? { ingredient: ranked[0].ingredient, matchScore: ranked[0].score }
    : {
        ingredient: null,
        matchScore: ranked[0]?.score || 0,
        closestIngredient: ranked[0]?.ingredient || null,
      }
}

export function findAvailableIngredient(ingredients, ingredientName) {
  const raw = normalizeText(ingredientName)
  const canonical = INGREDIENT_ALIASES.get(raw) || raw
  const queryTokens = new Set(tokenize(canonical))
  const conceptTerms = INGREDIENT_CONCEPT_TERMS.get(canonical) || [canonical]
  const matches = ingredients
    .map((ingredient) => {
      const candidate = normalizeText(ingredient.ingredient_name)
      const candidateTokens = new Set(tokenize(candidate))
      const conceptMatch = conceptTerms.find((term) => candidateTokens.has(term))
      const directMatch = [...queryTokens].every((token) => candidateTokens.has(token))
      if (!directMatch && !conceptMatch) return null
      if (
        [...DERIVED_INGREDIENT_TOKENS].some((token) => candidateTokens.has(token)) &&
        ![...queryTokens].some((token) => DERIVED_INGREDIENT_TOKENS.has(token))
      ) {
        return null
      }
      const score = candidate === canonical
        ? 1
        : directMatch
          ? 0.96
          : 0.92
      return { ingredient, matchScore: score }
    })
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore)

  return matches[0] || { ingredient: null, matchScore: 0 }
}

export async function findRecipesByIngredients(availableIngredients = [], limit = 3) {
  const requested = [...new Set(
    availableIngredients.map(normalizeText).filter(Boolean)
  )].slice(0, 6)
  if (!requested.length) {
    return { status: 'no_ingredients', kind: 'ingredient_recommendation', results: [] }
  }

  const recipes = await fetchApprovedRecipes()
  if (!recipes.length) {
    return { status: 'no_results', kind: 'ingredient_recommendation', results: [] }
  }

  const placeholders = recipes.map(() => '?').join(', ')
  const [ingredientRows] = await pool.execute(
    `SELECT id, recipe_id, ingredient_name, quantity
     FROM recipe_ingredients
     WHERE recipe_id IN (${placeholders})
     ORDER BY recipe_id ASC, id ASC`,
    recipes.map((recipe) => recipe.id)
  )
  const ingredientVocabulary = [
    ...new Set(
      ingredientRows.flatMap((ingredient) => {
        const normalized = normalizeText(ingredient.ingredient_name)
        return [normalized, ...normalized.split(' ')].filter(
          (item) => item.length >= 4
        )
      })
    ),
  ]
  const resolvedRequested = requested.map((input) => {
    const translated = INGREDIENT_ALIASES.get(input) || input
    if (
      ingredientVocabulary.some(
        (candidate) => candidate === translated || candidate.includes(translated)
      )
    ) {
      return {
        input,
        resolved: translated,
        corrected: translated !== input,
      }
    }
    const closest = ingredientVocabulary
      .map((candidate) => ({
        candidate,
        score: characterSimilarity(translated, candidate),
      }))
      .sort((left, right) => right.score - left.score)[0]
    return closest?.score >= 0.75
      ? { input, resolved: closest.candidate, corrected: true }
      : {
          input,
          resolved: translated,
          corrected: translated !== input,
        }
  })
  const ingredientsByRecipe = new Map()
  for (const ingredient of ingredientRows) {
    const key = Number(ingredient.recipe_id)
    const current = ingredientsByRecipe.get(key) || []
    current.push(ingredient)
    ingredientsByRecipe.set(key, current)
  }

  const ranked = recipes
    .map((recipe) => {
      const ingredients = ingredientsByRecipe.get(Number(recipe.id)) || []
      const matchedIngredients = resolvedRequested
        .map((requestedIngredient) => {
          const match = findAvailableIngredient(
            ingredients,
            requestedIngredient.resolved
          )
          return match.ingredient
            ? {
                requested: requestedIngredient.input,
                interpretedAs: requestedIngredient.resolved,
                corrected: requestedIngredient.corrected,
                ingredient: match.ingredient,
                score: match.matchScore,
              }
            : null
        })
        .filter(Boolean)
      const coverage = matchedIngredients.length / resolvedRequested.length
      const averageMatch = matchedIngredients.length
        ? matchedIngredients.reduce((sum, item) => sum + item.score, 0) /
          matchedIngredients.length
        : 0
      return {
        recipe: { ...recipe, ingredients },
        matchedIngredients,
        missingIngredients: requested.filter(
          (item) => !matchedIngredients.some((match) => match.requested === item)
        ),
        coverage,
        matchScore: 0.8 * coverage + 0.2 * averageMatch,
      }
    })
    .filter((item) => item.matchedIngredients.length > 0)
    .sort(
      (left, right) =>
        right.coverage - left.coverage ||
        right.matchScore - left.matchScore ||
        left.recipe.ingredients.length - right.recipe.ingredients.length
    )
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 5)))

  return {
    status: ranked.length
      ? ranked[0].coverage === 1
        ? 'matched'
        : 'partial_match'
      : 'no_results',
    kind: 'ingredient_recommendation',
    requestedIngredients: requested,
    ingredientCorrections: resolvedRequested.filter((item) => item.corrected),
    results: ranked,
  }
}

function parseNumber(value) {
  const normalized = String(value).trim()
  if (/^\d+\s+\d+\/\d+$/.test(normalized)) {
    const [whole, fraction] = normalized.split(/\s+/)
    const [numerator, denominator] = fraction.split('/').map(Number)
    return Number(whole) + numerator / denominator
  }
  if (/^\d+\/\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized.split('/').map(Number)
    return numerator / denominator
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

export function parseIngredientQuantity(quantity) {
  const text = String(quantity || '').trim()
  const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/)
  if (!match) return { scalable: false, originalText: text }

  const amount = parseNumber(match[1])
  const unit = match[2].trim()
  const hasMultipleNumericParts = /,\s*\d/.test(unit)

  if (!Number.isFinite(amount) || hasMultipleNumericParts) {
    return { scalable: false, originalText: text }
  }

  return {
    scalable: true,
    amount,
    unit,
    originalText: text,
  }
}

function formatAmount(value) {
  return Number(value.toFixed(2)).toString()
}

function scaleIngredient(ingredient, targetServings, originalServings) {
  const parsed = parseIngredientQuantity(ingredient.quantity)
  if (!parsed.scalable) {
    return {
      ...ingredient,
      scalable: false,
      scaledQuantity: ingredient.quantity || 'amount not recorded',
    }
  }

  const scaledAmount = parsed.amount * (targetServings / originalServings)
  return {
    ...ingredient,
    scalable: true,
    originalAmount: parsed.amount,
    unit: parsed.unit,
    scaledAmount,
    scaledQuantity: `${formatAmount(scaledAmount)}${parsed.unit ? ` ${parsed.unit}` : ''}`,
  }
}

async function resolveRecipe(entities, context = {}) {
  const recipeId =
    entities.needsRecipeContext || !entities.recipeName ? context.lastRecipeId : null
  const contextualRecipeName =
    entities.needsRecipeContext || !entities.recipeName
      ? context.lastRecipeTitle
      : null

  if (
    (entities.needsRecipeContext || !entities.recipeName) &&
    !recipeId &&
    !contextualRecipeName
  ) {
    return { status: 'needs_context', message: 'Which recipe do you mean?' }
  }

  const match = await findRecipeByFuzzyTitle(
    entities.recipeName || contextualRecipeName,
    { recipeId }
  )
  if (!match.recipe) {
    return {
      status: 'recipe_not_found',
      message: `FoodStory could not find a recipe matching "${entities.recipeName || 'that recipe'}".`,
    }
  }

  const recipe = await fetchFullRecipeDetails(match.recipe.id)
  return { status: 'matched', recipe, matchScore: match.matchScore }
}

async function handleIngredientLookup(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved

  const ingredientMatch = findIngredient(
    resolved.recipe.ingredients,
    entities.ingredientName
  )
  if (!ingredientMatch.ingredient) {
    return {
      ...resolved,
      status: 'ingredient_not_found',
      ingredientName: entities.ingredientName,
      closestIngredient: ingredientMatch.closestIngredient,
    }
  }

  if (entities.lookupType === 'existence') {
    return {
      ...resolved,
      kind: 'ingredient_existence',
      ingredient: ingredientMatch.ingredient,
    }
  }

  if (!entities.targetServings) {
    return {
      ...resolved,
      kind: 'ingredient_quantity',
      ingredient: ingredientMatch.ingredient,
      targetServings: null,
    }
  }

  if (!resolved.recipe.servings) {
    return {
      ...resolved,
      status: 'cannot_scale',
      reason: 'missing_original_servings',
      ingredient: ingredientMatch.ingredient,
      targetServings: entities.targetServings,
    }
  }

  const scaledIngredient = scaleIngredient(
    ingredientMatch.ingredient,
    entities.targetServings,
    resolved.recipe.servings
  )

  return {
    ...resolved,
    status: scaledIngredient.scalable ? 'matched' : 'cannot_scale',
    kind: 'ingredient_quantity',
    ingredient: scaledIngredient,
    targetServings: entities.targetServings,
    reason: scaledIngredient.scalable ? null : 'non_numeric_quantity',
  }
}

async function handleIngredientList(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved
  if (!resolved.recipe.ingredients.length) {
    return {
      ...resolved,
      status: 'ingredients_not_found',
      message: `FoodStory has ${resolved.recipe.title}, but its ingredient list is empty.`,
    }
  }
  return {
    ...resolved,
    kind: 'ingredient_list',
    ingredients: resolved.recipe.ingredients,
  }
}

async function handleServingScale(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved
  if (!entities.targetServings) {
    return { ...resolved, status: 'cannot_scale', reason: 'missing_target_servings' }
  }
  if (!resolved.recipe.servings) {
    return { ...resolved, status: 'cannot_scale', reason: 'missing_original_servings' }
  }

  return {
    ...resolved,
    kind: 'serving_scale',
    targetServings: entities.targetServings,
    scaledIngredients: resolved.recipe.ingredients.map((ingredient) =>
      scaleIngredient(ingredient, entities.targetServings, resolved.recipe.servings)
    ),
  }
}

async function handleNutrition(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved

  const originalServings = resolved.recipe.servings
  const targetServings = entities.targetServings || originalServings
  const scaleFactor =
    entities.targetServings && originalServings
      ? entities.targetServings / originalServings
      : 1

  if (entities.targetServings && !originalServings) {
    return { ...resolved, status: 'cannot_scale', reason: 'missing_original_servings' }
  }

  const values = {}
  for (const field of ['calories', 'protein', 'carbs', 'fat']) {
    const storedValue = Number(resolved.recipe[field])
    values[field] = Number.isFinite(storedValue)
      ? Number((storedValue * scaleFactor).toFixed(2))
      : null
  }
  if (Object.values(values).every((value) => !value)) {
    return {
      ...resolved,
      status: 'nutrition_not_found',
      message: `FoodStory has ${resolved.recipe.title}, but its nutrition values are not recorded.`,
    }
  }

  return {
    ...resolved,
    kind: 'nutrition',
    nutritionField: entities.nutritionField,
    originalServings,
    targetServings,
    nutrition: values,
  }
}

async function handleCookingTime(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved

  const prepTime = Number(resolved.recipe.prep_time || 0)
  const cookTime = Number(resolved.recipe.cook_time || 0)
  if (prepTime + cookTime === 0) {
    return {
      ...resolved,
      status: 'time_not_found',
      message: `FoodStory has ${resolved.recipe.title}, but its preparation and cooking times are not recorded.`,
    }
  }

  return {
    ...resolved,
    kind: 'cooking_time',
    prepTime,
    cookTime,
    totalTime: prepTime + cookTime,
  }
}

async function handleSteps(entities, context) {
  const resolved = await resolveRecipe(entities, context)
  if (resolved.status !== 'matched') return resolved

  return {
    ...resolved,
    kind: 'recipe_steps',
    instructions: resolved.recipe.instructions,
  }
}

export async function handleRecipeStructuredQuery(route, context = {}) {
  if (route.intent === 'recipe_by_ingredients') {
    return findRecipesByIngredients(route.entities.availableIngredients)
  }
  if (route.intent === 'recipe_ingredients') {
    return handleIngredientList(route.entities, context)
  }
  if (
    route.intent === 'recipe_ingredient_quantity' ||
    route.intent === 'recipe_ingredient_existence'
  ) {
    return handleIngredientLookup(route.entities, context)
  }
  if (route.intent === 'recipe_serving_scale') {
    return handleServingScale(route.entities, context)
  }
  if (route.intent === 'recipe_nutrition') {
    return handleNutrition(route.entities, context)
  }
  if (route.intent === 'recipe_cooking_time') {
    return handleCookingTime(route.entities, context)
  }
  if (route.intent === 'recipe_steps') {
    return handleSteps(route.entities, context)
  }

  return { status: 'unsupported', message: 'This recipe lookup is not supported.' }
}

export async function answerIngredientQuantity(entities, context = {}) {
  return handleIngredientLookup(
    { ...entities, lookupType: 'quantity' },
    context
  )
}

export async function answerIngredientExistence(entities, context = {}) {
  return handleIngredientLookup(
    { ...entities, lookupType: 'existence' },
    context
  )
}

export async function answerNutritionScale(entities, context = {}) {
  return handleNutrition(entities, context)
}

export async function answerCookingTime(entities, context = {}) {
  return handleCookingTime(entities, context)
}

export async function answerRecipeSteps(entities, context = {}) {
  return handleSteps(entities, context)
}
