export const FOOD_MAP_SOCIAL_STATUSES = Object.freeze([
  'place_found_in_foodmap',
  'place_found_not_in_foodmap',
  'dish_identified_only',
  'needs_screenshot_or_hint',
  'unclear',
])

function emptyPlace(reason) {
  return {
    name: null,
    address: null,
    district: null,
    city: null,
    source: null,
    existsInFoodMap: false,
    matchedFoodMapPlace: null,
    confidence: 0,
    reason,
  }
}

function emptyDishFallback(reason) {
  return {
    broadDish: null,
    possibleDish: null,
    cuisine: null,
    topCandidates: [],
    confidence: 0,
    reason,
  }
}

export function createFoodMapSocialResponse({
  status,
  confidence = 0,
  message,
  inputSignals,
  placeReason = 'No place lookup was performed in Part 1.',
  dishReason = 'No visual dish fallback was performed in Part 1.',
  steps = [],
  warnings = [],
  urlExtraction = null,
}) {
  if (!FOOD_MAP_SOCIAL_STATUSES.includes(status)) {
    throw new Error(`Unsupported Food Map social discovery status: ${status}`)
  }

  return {
    status,
    confidence,
    message,
    inputSignals: {
      url: inputSignals.url || null,
      platform: inputSignals.platform || null,
      title: inputSignals.title || null,
      description: inputSignals.description || null,
      ocrText: inputSignals.ocrText || null,
      ocrUsable: inputSignals.ocrUsable === true,
      hint: inputSignals.hint || null,
    },
    place: emptyPlace(placeReason),
    dishFallback: emptyDishFallback(dishReason),
    addPlaceDraft: null,
    debug: {
      steps,
      warnings,
      ...(urlExtraction ? { urlExtraction } : {}),
    },
  }
}
