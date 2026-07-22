function roundScore(score) {
  return Number((Number(score) || 0).toFixed(4))
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)).toString() : 'not recorded'
}

function routeIntent(routeOrIntent) {
  return typeof routeOrIntent === 'string' ? routeOrIntent : routeOrIntent?.intent
}

function isVietnameseRoute(routeOrIntent) {
  return routeOrIntent?.entities?.responseLanguage === 'vi'
}

const VIETNAMESE_INGREDIENT_LABELS = new Map([
  ['trung', 'trứng'],
  ['sua', 'sữa'],
  ['ca', 'cá'],
  ['ga', 'gà'],
  ['bo', 'bò'],
  ['thit bo', 'thịt bò'],
  ['heo', 'heo'],
  ['thit heo', 'thịt heo'],
  ['tom', 'tôm'],
  ['com', 'cơm'],
  ['banh mi', 'bánh mì'],
])

function ingredientInputLabel(value, vietnamese = false) {
  const normalized = String(value || '').trim()
  return vietnamese
    ? VIETNAMESE_INGREDIENT_LABELS.get(normalized) || normalized
    : normalized
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
  results = [],
  suggestions = [],
  groqCalled = false,
  recipeSearchFilters = undefined,
}) {
  return {
    answer,
    mode,
    intent,
    retrievalStatus,
    confidence: roundScore(confidence),
    message,
    sources: sources.filter(Boolean),
    results,
    suggestions,
    groqCalled,
    ...(recipeSearchFilters !== undefined ? { recipeSearchFilters } : {}),
  }
}

export function buildRetrievalPresentationResults(results = []) {
  return results
    .filter((item) => ['recipe', 'restaurant', 'food_spot'].includes(item.sourceType))
    .map((item) => {
      const metadata = item.metadata || {}
      if (item.sourceType === 'recipe') {
        return {
          id: item.sourceId,
          title: item.title,
          image_url: metadata.imageUrl || metadata.image_url || null,
          category: metadata.categoryName || metadata.category || 'Recipe',
          prep_time: Number(metadata.prepTime || metadata.prep_time || 0),
          cook_time: Number(metadata.cookTime || metadata.cook_time || 0),
          servings: Number(metadata.servings || 0) || null,
          difficulty: metadata.difficulty || null,
          calories: Number(metadata.calories || 0),
          protein: Number(metadata.protein || 0),
          avg_rating: Number(metadata.averageRating || metadata.avg_rating || 0),
          result_type: 'recipe',
        }
      }

      if (item.sourceType === 'restaurant') {
        return {
          id: item.sourceId,
          name: item.title,
          image_url: metadata.imageUrl || metadata.image_url || null,
          category: metadata.category || 'Restaurant',
          district: metadata.district || null,
          address: metadata.address || null,
          price_range: metadata.priceRange || metadata.price_range || null,
          avg_rating: Number(metadata.averageRating || metadata.avg_rating || 0),
          description: metadata.description || null,
          result_type: 'restaurant',
        }
      }

      return {
        id: item.sourceId,
        name: item.title,
        image_url: metadata.imageUrl || metadata.image_url || null,
        category: metadata.category || 'Saved place',
        district: metadata.district || null,
        dish_name: metadata.dishName || metadata.dish_name || null,
        rating: Number(metadata.rating || 0),
        result_type: 'spot',
      }
    })
}

function noDataAnswer(result, vietnamese = false) {
  if (result.status === 'needs_context') {
    return vietnamese
      ? result.message?.toLowerCase().includes('restaurant')
        ? 'Bạn đang hỏi nhà hàng nào?'
        : 'Bạn đang hỏi công thức nào?'
      : result.message
  }
  if (result.status === 'recipe_not_found') {
    return vietnamese ? 'FoodStory không tìm thấy công thức phù hợp.' : result.message
  }
  if (result.status === 'restaurant_not_found') {
    return vietnamese ? 'FoodStory không tìm thấy nhà hàng phù hợp.' : result.message
  }
  if (result.status === 'ingredient_not_found') {
    const closest = result.closestIngredient
      ? vietnamese
        ? ` Nguyên liệu gần nhất được lưu là ${result.closestIngredient.ingredient_name} (${result.closestIngredient.quantity || 'chưa ghi định lượng'}).`
        : ` The closest stored ingredient is ${result.closestIngredient.ingredient_name} (${result.closestIngredient.quantity || 'amount not recorded'}).`
      : ''
    return vietnamese
      ? `Công thức ${result.recipe.title} trên FoodStory không có nguyên liệu “${result.ingredientName}”.${closest}`
      : `${result.recipe.title} does not list "${result.ingredientName}" in its stored FoodStory ingredients.${closest}`
  }
  if (result.reason === 'missing_target_servings') {
    return vietnamese
      ? 'Bạn muốn nấu cho bao nhiêu khẩu phần?'
      : 'How many servings would you like to make?'
  }
  if (result.reason === 'missing_original_servings') {
    return vietnamese
      ? 'FoodStory có công thức này nhưng thiếu số khẩu phần gốc, nên chưa thể điều chỉnh định lượng một cách đáng tin cậy.'
      : `FoodStory has the recipe, but its original serving count is missing, so the quantities cannot be scaled reliably.`
  }
  if (result.reason === 'non_numeric_quantity') {
    return vietnamese
      ? `${result.recipe.title} có ${result.ingredient.ingredient_name}, nhưng định lượng “${result.ingredient.quantity}” không đủ rõ để điều chỉnh chính xác.`
      : `${result.recipe.title} includes ${result.ingredient.ingredient_name}, but the stored amount "${result.ingredient.quantity}" is not numeric enough to scale reliably.`
  }
  return result.message || (vietnamese
    ? 'FoodStory chưa có đủ dữ liệu có cấu trúc cho yêu cầu này.'
    : 'FoodStory does not have enough structured data for that request.')
}

function buildRecipeStructuredResponseInternal(result, routeOrIntent) {
  const intent = routeIntent(routeOrIntent)
  const vietnamese = isVietnameseRoute(routeOrIntent)

  if (result.kind === 'recipe_filter_search') {
    const recipes = result.results || []
    const filters = result.filters || {}
    const labels = [
      filters.category ? `${vietnamese ? 'nhóm' : 'category'} ${filters.category}` : null,
      filters.tag ? `${vietnamese ? 'thẻ' : 'tag'} ${filters.tag}` : null,
      filters.maxCalories ? `${vietnamese ? 'tối đa' : 'up to'} ${formatNumber(filters.maxCalories)} kcal` : null,
      filters.minRating !== null && filters.minRating !== undefined
        ? `${vietnamese ? 'rating từ' : 'rating at least'} ${formatNumber(filters.minRating)}/5`
        : null,
      filters.maxTotalTime ? `${vietnamese ? 'không quá' : 'within'} ${formatNumber(filters.maxTotalTime)} ${vietnamese ? 'phút' : 'minutes'}` : null,
      filters.minProtein !== null && filters.minProtein !== undefined
        ? `${vietnamese ? 'protein từ' : 'at least'} ${formatNumber(filters.minProtein)}g protein`
        : null,
    ].filter(Boolean)
    const filterSummary = labels.length
      ? labels.join(', ')
      : vietnamese
        ? 'không có giới hạn bổ sung'
        : 'no additional constraints'

    if (!recipes.length) {
      return createChatbotResponse({
        answer: vietnamese
          ? `FoodStory chưa có công thức nào khớp đồng thời các điều kiện: ${filterSummary}. Tôi giữ nguyên bộ lọc để bạn có thể bỏ bớt một điều kiện.`
          : `FoodStory has no stored recipe matching all of these conditions: ${filterSummary}. I kept the filters so you can relax one condition.`,
        mode: 'no_data',
        intent,
        retrievalStatus: 'no_results',
        confidence: 0,
        message: 'No approved FoodStory recipe matched every live database filter.',
        results: [],
        sources: [],
        suggestions: vietnamese
          ? ['Bỏ bộ lọc rating', 'Xóa tất cả bộ lọc']
          : ['Remove the rating filter', 'Clear all filters'],
        groqCalled: false,
        recipeSearchFilters: filters,
      })
    }

    return createChatbotResponse({
      answer: vietnamese
        ? `Tôi tìm thấy ${result.totalMatched} công thức FoodStory khớp ${filterSummary}. Đây là ${recipes.length} kết quả phù hợp nhất theo ${filters.sort || 'popular'}.`
        : `I found ${result.totalMatched} FoodStory recipes matching ${filterSummary}. Here are the best ${recipes.length} sorted by ${filters.sort || 'popular'}.`,
      mode: 'structured',
      intent,
      retrievalStatus: 'matched',
      confidence: 1,
      message: 'Filtered approved recipes directly from live FoodStory recipe, nutrition, rating, favorite, category, and tag data.',
      sources: recipes.map((recipe) => buildRecipeSource(recipe, 1)),
      results: recipes.map((recipe) => ({ ...recipe, result_type: 'recipe' })),
      suggestions: vietnamese
        ? ['Món khác cùng bộ lọc', 'Xóa tất cả bộ lọc']
        : ['More with the same filters', 'Clear all filters'],
      groqCalled: false,
      recipeSearchFilters: filters,
    })
  }

  if (result.kind === 'ingredient_recommendation') {
    const ranked = result.results || []
    const sources = ranked.map((item) =>
      buildRecipeSource(
        item.recipe,
        item.matchScore,
        item.coverage === 1 ? 'exact' : 'partial'
      )
    )
    if (!ranked.length) {
      const listed = (result.requestedIngredients || []).join(', ')
      return createChatbotResponse({
        answer: vietnamese
          ? `FoodStory chưa tìm thấy công thức đã lưu có nguyên liệu ${listed || 'bạn vừa nêu'}. Bạn có thể thêm nguyên liệu khác để tôi tìm lại.`
          : `FoodStory could not find a stored recipe using ${listed || 'those ingredients'}. Add another ingredient and I can narrow the search.`,
        mode: 'no_data',
        intent,
        retrievalStatus: 'no_results',
        confidence: 0,
        message: 'No stored recipe matched the supplied ingredients.',
        suggestions: vietnamese
          ? ['Tôi có thêm trứng', 'Tìm công thức dễ làm']
          : ['I also have eggs', 'Find an easy recipe'],
        recipeSearchFilters: result.filters || undefined,
      })
    }

    const descriptions = ranked.map((item) => {
      const matches = item.matchedIngredients
        .map((match) => match.ingredient.ingredient_name)
        .join(', ')
      const missing = item.missingIngredients?.length
        ? vietnamese
          ? `; chưa khớp ${item.missingIngredients.join(', ')}`
          : `; did not match ${item.missingIngredients.join(', ')}`
        : ''
      return `${item.recipe.title} (${matches}${missing})`
    })
    const best = ranked[0]
    const corrections = (result.ingredientCorrections || [])
      .map((item) =>
        vietnamese
          ? `“${ingredientInputLabel(item.input, true)}” là ${item.resolved}`
          : `${item.input} → ${item.resolved}`
      )
      .join(vietnamese ? ' và ' : ', ')
    const correctionPrefix = corrections
      ? vietnamese
        ? `Tôi hiểu ${corrections}. `
        : `I interpreted ${corrections}. `
      : ''
    return createChatbotResponse({
      answer: vietnamese
        ? `${correctionPrefix}${best.coverage === 1 ? 'FoodStory tìm thấy công thức dùng các nguyên liệu bạn có' : 'FoodStory tìm thấy các công thức khớp một phần nguyên liệu'}: ${descriptions.join('; ')}.`
        : `${correctionPrefix}${best.coverage === 1 ? 'FoodStory found recipes using the ingredients you have' : 'FoodStory found partial ingredient matches'}: ${descriptions.join('; ')}.`,
      mode: 'structured',
      intent,
      retrievalStatus: result.status,
      confidence: best.matchScore,
      message: 'Ranked only from stored FoodStory recipe ingredients.',
      sources,
      results: ranked.map((item) => ({
        ...item.recipe,
        match_coverage: item.coverage,
        matched_ingredient_count: item.matchedIngredients.length,
        requested_ingredient_count: result.requestedIngredients?.length || 0,
        missing_ingredients: item.missingIngredients || [],
        result_type: 'recipe',
      })),
      suggestions: vietnamese
        ? [`Cần bao nhiêu ${ingredientInputLabel(result.requestedIngredients?.[0], true) || 'nguyên liệu'}?`]
        : [`How much ${result.requestedIngredients?.[0] || 'of it'} is needed?`],
      recipeSearchFilters: result.filters || undefined,
    })
  }

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
      answer: noDataAnswer(result, vietnamese),
      mode: result.status === 'needs_context' ? 'fallback' : 'no_data',
      retrievalStatus: 'no_data',
      message: result.message || 'Structured recipe data was missing or incomplete.',
    })
  }

  if (result.kind === 'ingredient_list') {
    const ingredientLines = result.ingredients.map(
      (ingredient) =>
        `- ${ingredient.ingredient_name}: ${ingredient.quantity || (vietnamese ? 'chưa ghi định lượng' : 'amount not recorded')}`
    )
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: vietnamese
        ? `Nguyên liệu FoodStory đang lưu cho ${result.recipe.title}:\n${ingredientLines.join('\n')}`
        : `Stored FoodStory ingredients for ${result.recipe.title}:\n${ingredientLines.join('\n')}`,
      message: 'Answered from the stored recipe ingredient list.',
      suggestions: vietnamese
        ? ['Điều chỉnh cho 4 người', 'Món này mất bao lâu?']
        : ['Scale this to 4 servings', 'How long does this recipe take?'],
    })
  }

  if (result.kind === 'ingredient_existence') {
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: vietnamese
        ? `Có. ${result.recipe.title} dùng ${result.ingredient.ingredient_name}, với định lượng ${result.ingredient.quantity || 'chưa được ghi rõ'}.`
        : `Yes. ${result.recipe.title} uses ${result.ingredient.ingredient_name}, recorded as ${result.ingredient.quantity || 'an unspecified amount'}.`,
      message: 'Answered from stored recipe ingredients.',
    })
  }

  if (result.kind === 'ingredient_quantity') {
    const answer = vietnamese
      ? result.targetServings
        ? `Để làm ${result.targetServings} khẩu phần ${result.recipe.title}, bạn cần khoảng ${result.ingredient.scaledQuantity} ${result.ingredient.ingredient_name}. Công thức gốc dùng ${result.ingredient.quantity} cho ${result.recipe.servings} khẩu phần.`
        : `${result.recipe.title} dùng ${result.ingredient.quantity || 'định lượng chưa rõ'} ${result.ingredient.ingredient_name} cho ${result.recipe.servings || 'số'} khẩu phần đã lưu.`
      : result.targetServings
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
          ingredient.scalable
            ? ''
            : vietnamese
              ? ' (không thể điều chỉnh định lượng đã lưu)'
              : ' (stored amount could not be scaled)'
        }`
    )
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: vietnamese
        ? `Nguyên liệu cho ${result.targetServings} khẩu phần ${result.recipe.title}:\n${ingredientLines.join('\n')}`
        : `For ${result.targetServings} servings of ${result.recipe.title}:\n${ingredientLines.join('\n')}`,
      message: `Scaled from the stored ${result.recipe.servings}-serving recipe.`,
    })
  }

  if (result.kind === 'nutrition') {
    const field = result.nutritionField
    const label = field === 'carbs' ? 'carbohydrates' : field
    const servings = result.targetServings || result.originalServings
    const vietnameseLabels = {
      protein: 'chất đạm',
      carbs: 'tinh bột',
      fat: 'chất béo',
    }
    const answer = vietnamese
      ? field
        ? field === 'calories'
          ? `Với ${servings} khẩu phần ${result.recipe.title}, FoodStory ghi nhận khoảng ${formatNumber(result.nutrition[field])} calo.`
          : `Với ${servings} khẩu phần ${result.recipe.title}, FoodStory ghi nhận khoảng ${formatNumber(result.nutrition[field])}g ${vietnameseLabels[field] || field}.`
        : `Với ${servings} khẩu phần ${result.recipe.title}: ${formatNumber(result.nutrition.calories)} calo, ${formatNumber(result.nutrition.protein)}g chất đạm, ${formatNumber(result.nutrition.carbs)}g tinh bột và ${formatNumber(result.nutrition.fat)}g chất béo.`
      : field
        ? field === 'calories'
          ? `For ${servings} servings of ${result.recipe.title}, FoodStory records approximately ${formatNumber(result.nutrition[field])} calories.`
          : `For ${servings} servings of ${result.recipe.title}, FoodStory records approximately ${formatNumber(result.nutrition[field])}g of ${label}.`
        : `For ${servings} servings of ${result.recipe.title}: ${formatNumber(result.nutrition.calories)} calories, ${formatNumber(result.nutrition.protein)}g protein, ${formatNumber(result.nutrition.carbs)}g carbohydrates, and ${formatNumber(result.nutrition.fat)}g fat.`

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
      answer: vietnamese
        ? `${result.recipe.title} mất khoảng ${result.totalTime} phút: ${result.prepTime} phút chuẩn bị và ${result.cookTime} phút nấu.`
        : `${result.recipe.title} takes about ${result.totalTime} minutes total: ${result.prepTime} minutes of preparation and ${result.cookTime} minutes of cooking.`,
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
        answer: vietnamese
          ? `FoodStory có công thức ${result.recipe.title}, nhưng chưa có hướng dẫn nấu.`
          : `FoodStory has ${result.recipe.title}, but its cooking instructions are missing.`,
        message: 'Stored recipe instructions are missing.',
      })
    }

    const trimmed =
      instructions.length > 1800
        ? `${instructions.slice(0, 1800)}...\n\n${
            vietnamese
              ? 'Mở trang công thức để xem phần hướng dẫn còn lại.'
              : 'Open the recipe for the remaining stored instructions.'
          }`
        : instructions
    return createChatbotResponse({
      ...base,
      mode: 'structured',
      answer: vietnamese
        ? `${result.recipe.title} — hướng dẫn đang được lưu trên FoodStory:\n${trimmed}`
        : `${result.recipe.title}:\n${trimmed}`,
      message: 'Answered from stored recipe instructions.',
    })
  }

  return createChatbotResponse({
    ...base,
    mode: 'no_data',
    retrievalStatus: 'no_data',
    answer: vietnamese
      ? 'FoodStory chưa thể tạo câu trả lời có cấu trúc cho công thức này.'
      : 'FoodStory could not build a structured recipe answer.',
  })
}

function normalizeRecipePresentation(recipe) {
  if (!recipe) return null
  return {
    id: recipe.id,
    title: recipe.title,
    category: recipe.category || recipe.category_name || 'Recipe',
    image_url: recipe.image_url || recipe.imageUrl || null,
    prep_time: Number(recipe.prep_time || recipe.prepTime || 0),
    cook_time: Number(recipe.cook_time || recipe.cookTime || 0),
    servings: Number(recipe.servings || 0) || null,
    difficulty: recipe.difficulty || null,
    calories: Number(recipe.calories || 0),
    protein: Number(recipe.protein || 0),
    avg_rating: Number(recipe.avg_rating || recipe.average_rating || 0),
    rating_count: Number(recipe.rating_count || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    tags: Array.isArray(recipe.tags)
      ? recipe.tags.slice(0, 8)
      : String(recipe.tag_names || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
    match_coverage:
      recipe.match_coverage === null || recipe.match_coverage === undefined
        ? null
        : Number(recipe.match_coverage),
    matched_ingredient_count:
      Number(recipe.matched_ingredient_count || 0) || null,
    requested_ingredient_count:
      Number(recipe.requested_ingredient_count || 0) || null,
    missing_ingredients: Array.isArray(recipe.missing_ingredients)
      ? recipe.missing_ingredients.slice(0, 6)
      : [],
    result_type: 'recipe',
  }
}

export function buildRecipeStructuredResponse(result, routeOrIntent) {
  const response = buildRecipeStructuredResponseInternal(result, routeOrIntent)
  const existingResults = (response.results || []).map((item) =>
    item.result_type === 'recipe' || item.title
      ? normalizeRecipePresentation(item)
      : item
  )

  if (existingResults.length) {
    return { ...response, results: existingResults.filter(Boolean) }
  }

  const recipe = normalizeRecipePresentation(result?.recipe)
  return recipe ? { ...response, results: [recipe] } : response
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

export function buildRestaurantStructuredResponse(result, routeOrIntent) {
  const intent = routeIntent(routeOrIntent)
  const vietnamese = isVietnameseRoute(routeOrIntent)
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
        answer: vietnamese
          ? `FoodStory chưa có kết quả khớp chính xác với ${requested || 'yêu cầu tìm quán này'}. Các lựa chọn gần nhất: ${alternatives || 'chưa có'}.`
          : `No exact match was found for ${requested || 'that restaurant search'}. Closest available FoodStory results: ${alternatives || 'none available'}.`,
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
        answer: vietnamese
          ? 'FoodStory hiện chưa có nhà hàng phù hợp với yêu cầu này.'
          : 'FoodStory does not currently have restaurants matching that request.',
        mode: 'no_data',
        intent,
        retrievalStatus: 'no_results',
        message: 'No matching restaurants were found.',
        sources: [],
      })
    }

    return createChatbotResponse({
      answer: vietnamese
        ? `FoodStory tìm thấy: ${result.results.map(describeRestaurant).join('; ')}.`
        : `FoodStory found: ${result.results.map(describeRestaurant).join('; ')}.`,
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
        ? vietnamese
          ? `Kết quả trên Food Map: ${result.results
              .map((spot) => `${spot.name}${spot.district ? ` tại ${spot.district}` : ''}`)
              .join('; ')}.`
          : `FoodStory food map results: ${result.results
              .map((spot) => `${spot.name}${spot.district ? ` in ${spot.district}` : ''}`)
              .join('; ')}.`
        : vietnamese
          ? 'Không tìm thấy địa điểm phù hợp trên Food Map.'
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
      answer: noDataAnswer(result, vietnamese),
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
      ? vietnamese
        ? `${restaurant.name} nằm tại ${restaurant.address}, ${restaurant.district || 'chưa ghi quận'}.`
        : `${restaurant.name} is at ${restaurant.address}, ${restaurant.district || 'district not recorded'}.`
      : vietnamese
        ? `FoodStory có ${restaurant.name}, nhưng chưa lưu địa chỉ.`
        : `FoodStory has ${restaurant.name}, but its address is not recorded.`,
    restaurant_location: restaurant.address
      ? vietnamese
        ? `${restaurant.name} nằm tại ${restaurant.address}, ${restaurant.district || 'chưa ghi quận'}.`
        : `${restaurant.name} is at ${restaurant.address}, ${restaurant.district || 'district not recorded'}.`
      : vietnamese
        ? `FoodStory có ${restaurant.name}, nhưng chưa lưu địa chỉ.`
        : `FoodStory has ${restaurant.name}, but its address is not recorded.`,
    restaurant_price: restaurant.price_range
      ? vietnamese
        ? `Mức giá FoodStory ghi nhận cho ${restaurant.name} là ${restaurant.price_range}.`
        : `${restaurant.name} has a FoodStory price range of ${restaurant.price_range}.`
      : vietnamese
        ? `FoodStory có ${restaurant.name}, nhưng chưa có thông tin mức giá.`
        : `FoodStory has ${restaurant.name}, but its price range is not recorded.`,
    restaurant_rating:
      Number.isFinite(Number(restaurant.avg_rating)) &&
      Number(restaurant.avg_rating) > 0
      ? vietnamese
        ? `${restaurant.name} có điểm đánh giá trung bình ${restaurant.avg_rating}/5 trên FoodStory.`
        : `${restaurant.name} has an average FoodStory rating of ${restaurant.avg_rating} out of 5.`
      : vietnamese
        ? `FoodStory có ${restaurant.name}, nhưng chưa có điểm đánh giá.`
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

export function buildUserFoodDataResponse(result, routeOrIntent) {
  const intent = routeIntent(routeOrIntent)
  const vietnamese = isVietnameseRoute(routeOrIntent)
  if (!result.items.length) {
    const emptyAnswers = {
      user_favorites: vietnamese
        ? 'Bạn chưa lưu công thức yêu thích nào.'
        : 'You do not have any favorite recipes saved yet.',
      user_checklists: vietnamese
        ? 'Bạn chưa có danh sách mua sắm nào.'
        : 'You do not have any shopping checklists yet.',
      user_food_spots: vietnamese
        ? 'Bạn chưa lưu địa điểm ăn uống nào.'
        : 'You do not have any saved food places yet.',
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
      answer: `${vietnamese ? 'Công thức yêu thích của bạn' : 'Your favorite recipes'}: ${result.items
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
      ? `${detailedChecklist.recipe_title} ${vietnamese ? '— danh sách mua sắm' : 'checklist'}:\n${detailedChecklist.items
          .map(
            (item) =>
              `- ${item.ingredient_name}: ${item.quantity || 'amount not recorded'}${
                item.is_checked ? ' (checked)' : ''
              }`
          )
          .join('\n')}`
      : `${vietnamese ? 'Danh sách mua sắm của bạn' : 'Your shopping checklists'}: ${result.items
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
    answer: `${vietnamese ? 'Địa điểm đã lưu của bạn' : 'Your saved food places'}: ${result.items
      .map(
        (spot) =>
          `${spot.name}${spot.district ? ` ${vietnamese ? 'tại' : 'in'} ${spot.district}` : ''}${
            spot.dish_name ? ` ${vietnamese ? '— món' : 'for'} ${spot.dish_name}` : ''
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
  const vietnamese = isVietnameseRoute(route)
  if (route.entities.helpTopic === 'dish_clarification') {
    const dish = route.entities.dishName || route.entities.cuisineOrCategory || 'món này'
    return createChatbotResponse({
      answer: vietnamese
        ? `Bạn muốn biết điều gì về ${dish}: xem công thức, kiểm tra dinh dưỡng hay tìm quán đang phục vụ món này?`
        : `What would you like to know about ${dish}: its recipe, nutrition, or places serving it?`,
      mode: 'structured',
      intent: route.intent,
      retrievalStatus: 'not_used',
      confidence: route.confidence,
      message: 'Asked for the missing action instead of guessing from a dish name alone.',
      suggestions: vietnamese
        ? [`Công thức ${dish}`, `${dish} có bao nhiêu calo?`, `Tìm quán ${dish}`]
        : [`Recipe for ${dish}`, `How many calories are in ${dish}?`, `Find places serving ${dish}`],
    })
  }
  const englishAnswers = {
    favorites:
      'Open a recipe, then use its favorite control to save it. You must be logged in. Saved recipes are available from the Favorites page.',
    food_map:
      'Open Food Map from the main navigation. You can browse community restaurants and switch to your personal places when logged in.',
    saved_places:
      'Open Food Map and switch to the personal or saved places view. You must be logged in to see places saved to your account.',
    greeting:
      'Hello! I can help you find FoodStory recipes, ingredients, nutrition, restaurants, and saved food places.',
    thanks: 'You are welcome. Ask me whenever you need help finding food or cooking.',
    capabilities:
      'I can search FoodStory recipes and restaurants, explain stored ingredients and nutrition, scale recipe servings, show saved account data, and open relevant Food Map results.',
    food_safety:
      'For allergies, poisoning, or unsafe food, do not rely on FoodBot alone. Avoid the suspected food, check ingredients with the restaurant, and seek urgent medical help for breathing difficulty, swelling, faintness, or severe symptoms.',
  }
  const vietnameseAnswers = {
    favorites:
      'Mở một công thức rồi dùng nút yêu thích để lưu. Bạn cần đăng nhập; các công thức đã lưu nằm trong trang Favorites.',
    food_map:
      'Mở Food Map từ thanh điều hướng. Bạn có thể xem các quán cộng đồng và chuyển sang địa điểm cá nhân sau khi đăng nhập.',
    saved_places:
      'Mở Food Map rồi chọn khu vực địa điểm cá nhân hoặc đã lưu. Bạn cần đăng nhập để xem dữ liệu của tài khoản.',
    greeting:
      'Xin chào! Tôi có thể giúp bạn tìm công thức, nguyên liệu, dinh dưỡng, nhà hàng và địa điểm đã lưu trên FoodStory.',
    thanks: 'Không có gì. Bạn cứ hỏi khi cần tìm món ăn, quán hoặc công thức nhé.',
    capabilities:
      'Tôi có thể tìm công thức và nhà hàng trong FoodStory, tra nguyên liệu và dinh dưỡng đã lưu, điều chỉnh khẩu phần, xem dữ liệu cá nhân và mở kết quả liên quan trên Food Map.',
    food_safety:
      'Với dị ứng, ngộ độc hoặc thực phẩm không an toàn, đừng chỉ dựa vào FoodBot. Hãy tránh món nghi ngờ, xác nhận nguyên liệu với quán và gọi trợ giúp y tế khẩn cấp nếu khó thở, sưng, choáng hoặc có triệu chứng nặng.',
  }
  englishAnswers.recipe_budget =
    'FoodStory does not store live grocery prices, so I cannot promise that a recipe fits that exact budget. Tell me which ingredients you already have and I can find stored recipes that use them.'
  vietnameseAnswers.recipe_budget =
    'FoodStory không lưu giá nguyên liệu theo thời gian thực nên tôi không thể cam kết công thức nằm chính xác trong ngân sách đó. Hãy cho tôi biết những nguyên liệu bạn đang có để tôi tìm công thức phù hợp trong dữ liệu FoodStory.'
  const answers = vietnamese ? vietnameseAnswers : englishAnswers

  return createChatbotResponse({
    answer:
      answers[route.entities.helpTopic] ||
      (vietnamese
        ? 'Dùng thanh điều hướng FoodStory để mở công thức, mục yêu thích và Food Map.'
        : 'Use the FoodStory navigation to open recipes, favorites, and the food map.'),
    mode: 'structured',
    intent: route.intent,
    retrievalStatus: 'not_used',
    confidence: route.confidence,
    message: 'Answered from FoodStory app guidance.',
    sources: [],
    suggestions:
      route.entities.helpTopic === 'recipe_budget'
        ? vietnamese
          ? ['Tôi có trứng và sữa thì làm món gì?', 'Tôi có bánh mì thì làm được món gì?']
          : ['What can I cook with eggs and milk?', 'I have bread. What can I make?']
        : [],
  })
}
