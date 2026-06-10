function roundScore(score) {
  return Number((Number(score) || 0).toFixed(4))
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)).toString() : 'not recorded'
}

export function buildRecipeSource(recipe, score = 1, matchLevel = 'exact') {
  if (!recipe) return null
  return {
    sourceType: 'recipe',
    sourceId: recipe.id,
    title: recipe.title,
    score: roundScore(score),
    matchLevel: score >= 0.9 ? matchLevel : 'partial',
  }
}

export function buildRestaurantSource(
  restaurant,
  score = 1,
  matchLevel = 'exact'
) {
  if (!restaurant) return null
  return {
    sourceType: 'restaurant',
    sourceId: restaurant.id,
    title: restaurant.name,
    score: roundScore(score),
    matchLevel,
  }
}

export function buildFoodSpotSource(spot, score = 1, matchLevel = 'exact') {
  if (!spot) return null
  return {
    sourceType: 'food_spot',
    sourceId: spot.id,
    title: spot.name,
    score: roundScore(score),
    matchLevel,
  }
}

export function buildRetrievalSources(results = []) {
  return results.map((item) => ({
    documentId: item.documentId,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    score: roundScore(item.score),
    matchLevel: item.matchLevel,
  }))
}

export function createChatbotResponse({
  answer,
  mode,
  intent,
  retrievalStatus = 'not_used',
  confidence = 0,
  message = '',
  sources = [],
  groqCalled = false,
}) {
  return {
    answer,
    mode,
    intent,
    retrievalStatus,
    confidence: roundScore(confidence),
    message,
    sources: sources.filter(Boolean),
    groqCalled,
  }
}

function noDataAnswer(result) {
  if (result.status === 'needs_context') return result.message
  if (result.status === 'recipe_not_found') return result.message
  if (result.status === 'restaurant_not_found') return result.message
  if (result.status === 'ingredient_not_found') {
    return `${result.recipe.title} does not list "${result.ingredientName}" in its stored FoodStory ingredients.`
  }
  if (result.reason === 'missing_target_servings') {
    return 'How many servings would you like to make?'
  }
  if (result.reason === 'missing_original_servings') {
    return `FoodStory has the recipe, but its original serving count is missing, so the quantities cannot be scaled reliably.`
  }
  if (result.reason === 'non_numeric_quantity') {
    return `${result.recipe.title} includes ${result.ingredient.ingredient_name}, but the stored amount "${result.ingredient.quantity}" is not numeric enough to scale reliably.`
  }
  return result.message || 'FoodStory does not have enough structured data for that request.'
}

export function buildRecipeStructuredResponse(result, intent) {
  const source = buildRecipeSource(result.recipe, result.matchScore)
  const base = {
    intent,
    confidence: result.matchScore || 0,
    sources: source ? [source] : [],
    groqCalled: false,
  }

  if (result.status !== 'matched') {
    return createChatbotResponse({
      ...base,
      answer: noDataAnswer(result),
      mode: result.status === 'needs_context' ? 'fallback' : 'no_data',
      retrievalStatus: 'no_data',
      message: result.message || 'Structured recipe data was missing or incomplete.',
    })
  }

  if (result.kind === 'ingredient_existence') {
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: `Yes. ${result.recipe.title} uses ${result.ingredient.ingredient_name}, recorded as ${result.ingredient.quantity || 'an unspecified amount'}.`,
      message: 'Answered from stored recipe ingredients.',
    })
  }

  if (result.kind === 'ingredient_quantity') {
    const answer = result.targetServings
      ? `For ${result.targetServings} servings of ${result.recipe.title}, you need approximately ${result.ingredient.scaledQuantity} of ${result.ingredient.ingredient_name}. The original recipe uses ${result.ingredient.quantity} for ${result.recipe.servings} servings.`
      : `${result.recipe.title} uses ${result.ingredient.quantity || 'an unspecified amount'} of ${result.ingredient.ingredient_name} for ${result.recipe.servings || 'its stored'} servings.`

    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer,
      message: 'Answered from stored recipe ingredient quantities.',
    })
  }

  if (result.kind === 'serving_scale') {
    const ingredientLines = result.scaledIngredients.map(
      (ingredient) =>
        `- ${ingredient.ingredient_name}: ${ingredient.scaledQuantity}${
          ingredient.scalable ? '' : ' (stored amount could not be scaled)'
        }`
    )
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: `For ${result.targetServings} servings of ${result.recipe.title}:\n${ingredientLines.join('\n')}`,
      message: `Scaled from the stored ${result.recipe.servings}-serving recipe.`,
    })
  }

  if (result.kind === 'nutrition') {
    const field = result.nutritionField
    const label = field === 'carbs' ? 'carbohydrates' : field
    const answer = field
      ? field === 'calories'
        ? `For ${result.targetServings || result.originalServings} servings of ${result.recipe.title}, FoodStory records approximately ${formatNumber(result.nutrition[field])} calories.`
        : `For ${result.targetServings || result.originalServings} servings of ${result.recipe.title}, FoodStory records approximately ${formatNumber(result.nutrition[field])}g of ${label}.`
      : `For ${result.targetServings || result.originalServings} servings of ${result.recipe.title}: ${formatNumber(result.nutrition.calories)} calories, ${formatNumber(result.nutrition.protein)}g protein, ${formatNumber(result.nutrition.carbs)}g carbohydrates, and ${formatNumber(result.nutrition.fat)}g fat.`

    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer,
      message: result.targetServings
        ? `Nutrition was scaled from ${result.originalServings} stored servings.`
        : 'Answered from stored recipe nutrition.',
    })
  }

  if (result.kind === 'cooking_time') {
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: `${result.recipe.title} takes about ${result.totalTime} minutes total: ${result.prepTime} minutes of preparation and ${result.cookTime} minutes of cooking.`,
      message: 'Answered from stored recipe times.',
    })
  }

  if (result.kind === 'recipe_steps') {
    const instructions = String(result.instructions || '').trim()
    if (!instructions) {
      return createChatbotResponse({
        ...base,
        mode: 'no_data',
        retrievalStatus: 'no_data',
        answer: `FoodStory has ${result.recipe.title}, but its cooking instructions are missing.`,
        message: 'Stored recipe instructions are missing.',
      })
    }

    const trimmed =
      instructions.length > 1800
        ? `${instructions.slice(0, 1800)}...\n\nOpen the recipe for the remaining stored instructions.`
        : instructions
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: `${result.recipe.title}:\n${trimmed}`,
      message: 'Answered from stored recipe instructions.',
    })
  }

  return createChatbotResponse({
    ...base,
    mode: 'no_data',
    retrievalStatus: 'no_data',
    answer: 'FoodStory could not build a structured recipe answer.',
  })
}

function describeRestaurant(restaurant) {
  const details = [
    restaurant.category,
    restaurant.district,
    restaurant.address,
    restaurant.price_range ? `price ${restaurant.price_range}` : null,
    restaurant.avg_rating ? `${restaurant.avg_rating}/5 rating` : null,
  ].filter(Boolean)

  return `${restaurant.name} (${details.join(', ')})`
}

function formatRequestedRestaurant(category, district) {
  const formattedCategory = category
    ? `${category.replace(/\b\w/g, (letter) => letter.toUpperCase())}${
        ['japanese', 'korean', 'vietnamese', 'thai', 'chinese', 'indian', 'italian', 'mexican'].includes(
          String(category).toLowerCase()
        )
          ? ' food'
          : ''
      }`
    : null

  return [formattedCategory, district].filter(Boolean).join(' in ')
}

export function buildRestaurantStructuredResponse(result, intent) {
  if (intent === 'restaurant_search') {
    const sources = result.results.map((restaurant) =>
      buildRestaurantSource(
        restaurant,
        restaurant.score,
        result.status === 'matched' ? 'exact' : 'fallback'
      )
    )
    const requested = formatRequestedRestaurant(
      result.cuisineOrCategory,
      result.districtOrLocation
    )

    if (result.status === 'no_exact_constraint_match') {
      const alternatives = result.results.map(describeRestaurant).join('; ')
      return createChatbotResponse({
        answer: `No exact match was found for ${requested || 'that restaurant search'}. Closest available FoodStory results: ${alternatives || 'none available'}.`,
        mode: 'fallback',
        intent,
        retrievalStatus: 'no_exact_constraint_match',
        confidence: result.results[0]?.score || 0,
        message: `No exact match found for ${requested || 'the requested restaurant constraints'}. Showing closest available FoodStory results instead.`,
        sources,
        groqCalled: false,
      })
    }

    if (!result.results.length) {
      return createChatbotResponse({
        answer: 'FoodStory does not currently have restaurants matching that request.',
        mode: 'no_data',
        intent,
        retrievalStatus: 'no_results',
        message: 'No matching restaurants were found.',
        sources: [],
      })
    }

    return createChatbotResponse({
      answer: `FoodStory found: ${result.results.map(describeRestaurant).join('; ')}.`,
      mode: 'structured',
      intent,
      retrievalStatus: 'matched',
      confidence: result.results[0]?.score || 1,
      message: 'Answered from structured restaurant data.',
      sources,
    })
  }

  if (intent === 'food_map_search') {
    const sources = result.results.map((spot) => buildFoodSpotSource(spot))
    return createChatbotResponse({
      answer: result.results.length
        ? `FoodStory food map results: ${result.results
            .map((spot) => `${spot.name}${spot.district ? ` in ${spot.district}` : ''}`)
            .join('; ')}.`
        : 'No matching FoodStory food spots were found.',
      mode: result.results.length ? 'structured' : 'no_data',
      intent,
      retrievalStatus: result.results.length ? 'matched' : 'no_results',
      confidence: result.results.length ? 1 : 0,
      message: result.results.length
        ? 'Answered from structured food map data.'
        : 'No matching food spots were found.',
      sources,
    })
  }

  const source = buildRestaurantSource(result.restaurant, result.matchScore)
  if (result.status !== 'matched') {
    return createChatbotResponse({
      answer: noDataAnswer(result),
      mode: result.status === 'needs_context' ? 'fallback' : 'no_data',
      intent,
      retrievalStatus: 'no_data',
      confidence: result.matchScore || 0,
      message: result.message || 'Structured restaurant data was unavailable.',
      sources: source ? [source] : [],
    })
  }

  const restaurant = result.restaurant
  const answers = {
    restaurant_address: restaurant.address
      ? `${restaurant.name} is at ${restaurant.address}, ${restaurant.district || 'district not recorded'}.`
      : `FoodStory has ${restaurant.name}, but its address is not recorded.`,
    restaurant_location: restaurant.address
      ? `${restaurant.name} is at ${restaurant.address}, ${restaurant.district || 'district not recorded'}.`
      : `FoodStory has ${restaurant.name}, but its address is not recorded.`,
    restaurant_price: restaurant.price_range
      ? `${restaurant.name} has a FoodStory price range of ${restaurant.price_range}.`
      : `FoodStory has ${restaurant.name}, but its price range is not recorded.`,
    restaurant_rating: Number.isFinite(Number(restaurant.avg_rating))
      ? `${restaurant.name} has an average FoodStory rating of ${restaurant.avg_rating} out of 5.`
      : `FoodStory has ${restaurant.name}, but its rating is not recorded.`,
  }

  return createChatbotResponse({
    answer: answers[intent],
    mode: 'structured',
    intent,
    retrievalStatus: 'not_used',
    confidence: result.matchScore,
    message: 'Answered from structured restaurant data.',
    sources: [source],
  })
}

function buildChecklistSource(checklist) {
  return {
    sourceType: 'recipe',
    sourceId: checklist.recipe_id,
    title: checklist.recipe_title,
    score: 1,
    matchLevel: 'private',
  }
}

export function buildUserFoodDataResponse(result, intent) {
  if (!result.items.length) {
    const emptyAnswers = {
      user_favorites: 'You do not have any favorite recipes saved yet.',
      user_checklists: 'You do not have any shopping checklists yet.',
      user_food_spots: 'You do not have any saved food places yet.',
    }

    return createChatbotResponse({
      answer: emptyAnswers[intent],
      mode: 'no_data',
      intent,
      retrievalStatus: 'no_results',
      confidence: 1,
      message: 'Authenticated user data was checked and no matching items were found.',
      sources: [],
      groqCalled: false,
    })
  }

  if (intent === 'user_favorites') {
    const sources = result.items.map((recipe) => buildRecipeSource(recipe, 1, 'private'))
    return createChatbotResponse({
      answer: `Your favorite recipes: ${result.items
        .map((recipe) => recipe.title)
        .join('; ')}.`,
      mode: 'structured',
      intent,
      retrievalStatus: 'not_used',
      confidence: 1,
      message: 'Answered from your authenticated favorites only.',
      sources,
      groqCalled: false,
    })
  }

  if (intent === 'user_checklists') {
    const detailedChecklist = result.items[0]?.items
      ? result.items[0]
      : null
    const answer = detailedChecklist
      ? `${detailedChecklist.recipe_title} checklist:\n${detailedChecklist.items
          .map(
            (item) =>
              `- ${item.ingredient_name}: ${item.quantity || 'amount not recorded'}${
                item.is_checked ? ' (checked)' : ''
              }`
          )
          .join('\n')}`
      : `Your shopping checklists: ${result.items
          .map(
            (checklist) =>
              `${checklist.recipe_title} (${checklist.checked_items}/${checklist.total_items} checked)`
          )
          .join('; ')}.`

    return createChatbotResponse({
      answer,
      mode: 'structured',
      intent,
      retrievalStatus: 'not_used',
      confidence: 1,
      message: 'Answered from your authenticated shopping checklists only.',
      sources: result.items.map(buildChecklistSource),
      groqCalled: false,
    })
  }

  const sources = result.items.map((spot) => buildFoodSpotSource(spot, 1, 'private'))
  return createChatbotResponse({
    answer: `Your saved food places: ${result.items
      .map(
        (spot) =>
          `${spot.name}${spot.district ? ` in ${spot.district}` : ''}${
            spot.dish_name ? ` for ${spot.dish_name}` : ''
          }`
      )
      .join('; ')}.`,
    mode: 'structured',
    intent,
    retrievalStatus: 'not_used',
    confidence: 1,
    message: 'Answered from your authenticated saved places only.',
    sources,
    groqCalled: false,
  })
}

export function buildAppHelpResponse(route) {
  const answers = {
    favorites:
      'Open a recipe, then use its favorite control to save it. You must be logged in. Saved recipes are available from the Favorites page.',
    food_map:
      'Open Food Map from the main navigation. You can browse community restaurants and switch to your personal places when logged in.',
    saved_places:
      'Open Food Map and switch to the personal or saved places view. You must be logged in to see places saved to your account.',
  }

  return createChatbotResponse({
    answer: answers[route.entities.helpTopic] || 'Use the FoodStory navigation to open recipes, favorites, and the food map.',
    mode: 'structured',
    intent: route.intent,
    retrievalStatus: 'not_used',
    confidence: route.confidence,
    message: 'Answered from FoodStory app guidance.',
    sources: [],
  })
}
