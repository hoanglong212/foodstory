import { normalizeDiscoveryText } from './foodMapExistenceService.js'

export const DISH_MATCH_THRESHOLD = 0.45
export const DISH_PROMPT_MATCH_THRESHOLD = Number(
  process.env.VISION_DISH_PROMPT_THRESHOLD || 0.2,
)

const PLACE_HINT_PATTERN =
  /^(?:place|restaurant|cafe|coffee|qu[aá]n|ti[eệ]m|shop|bakery)\s*[:\-]/i

function cleanDishHint(hint) {
  return String(hint || '').replace(/^dish\s*[:\-]\s*/i, '').trim()
}

function canUseHintAsDish(hint) {
  const cleaned = cleanDishHint(hint)
  const tokens = normalizeDiscoveryText(cleaned).split(' ').filter(Boolean)
  return (
    cleaned &&
    !PLACE_HINT_PATTERN.test(hint) &&
    !/^https?:\/\//i.test(cleaned) &&
    tokens.length <= 8
  )
}

function specificCategorySupport(visualCandidates) {
  const broadCategories = new Set([
    'vietnamese',
    'korean',
    'asian',
    'restaurant',
    'specialties',
    'other',
  ])
  const categoryGroups = new Map()

  for (const candidate of visualCandidates) {
    if (
      candidate.sourceType !== 'restaurant' ||
      !candidate.category ||
      candidate.confidence < 0.3
    ) {
      continue
    }

    const normalized = normalizeDiscoveryText(candidate.category)
    if (!normalized || broadCategories.has(normalized)) continue
    const group = categoryGroups.get(normalized) || {
      category: candidate.category,
      count: 0,
      score: 0,
    }
    group.count += 1
    group.score = Math.max(group.score, candidate.confidence)
    categoryGroups.set(normalized, group)
  }

  return [...categoryGroups.values()]
    .filter((group) => group.count >= 2)
    .sort(
      (left, right) =>
        right.count - left.count || right.score - left.score,
    )[0] || null
}

export function identifyDish({
  hint = '',
  visualCandidates = [],
  dishPredictions = [],
  placeIdentified = false,
}) {
  const promptCandidate = dishPredictions
    .map((candidate) => ({
      dishName: candidate.dishName || candidate.dish_name || '',
      category: candidate.category || null,
      confidence: Number(candidate.confidence ?? candidate.score),
    }))
    .find(
      (candidate) =>
        candidate.dishName &&
        Number.isFinite(candidate.confidence) &&
        candidate.confidence >= DISH_PROMPT_MATCH_THRESHOLD,
    )
  const recipeCandidate = visualCandidates.find(
    (candidate) =>
      candidate.sourceType === 'recipe' &&
      candidate.confidence >= DISH_MATCH_THRESHOLD,
  )
  const categoryCandidate = visualCandidates.find(
    (candidate) =>
      candidate.category &&
      candidate.confidence >= DISH_MATCH_THRESHOLD,
  )
  const supportedCategory = specificCategorySupport(visualCandidates)
  const supportedCategoryName = supportedCategory?.category || null
  const recipeSupportsSpecificCategory =
    recipeCandidate &&
    supportedCategoryName &&
    normalizeDiscoveryText(recipeCandidate.title).includes(
      normalizeDiscoveryText(supportedCategoryName),
    )

  if (!placeIdentified && canUseHintAsDish(hint)) {
    const dishName = cleanDishHint(hint)
    return {
      dishName,
      category: recipeCandidate?.category || categoryCandidate?.category || null,
      confidence: 0.6,
      source: 'hint',
      caption: recipeCandidate
        ? `The image is visually closest to ${recipeCandidate.title} in FoodStory's dish index.`
        : `The user hint identifies the dish as ${dishName}.`,
    }
  }

  if (promptCandidate) {
    return {
      ...promptCandidate,
      source: 'clip_dish_prompts',
      caption: `The image has visual signals associated with ${promptCandidate.dishName}.`,
    }
  }

  if (recipeCandidate) {
    const dishName = recipeSupportsSpecificCategory
      ? supportedCategoryName
      : recipeCandidate.title
    const category = recipeSupportsSpecificCategory
      ? supportedCategoryName
      : recipeCandidate.category || categoryCandidate?.category || null
    return {
      dishName,
      category,
      confidence:
        recipeCandidate.duplicateImageCount > 1
          ? Math.min(recipeCandidate.confidence, 0.59)
          : recipeCandidate.confidence,
      source: 'visual',
      caption: `The image is visually closest to ${dishName} in FoodStory's dish index.`,
    }
  }

  if (categoryCandidate) {
    return {
      dishName: categoryCandidate.category,
      category: categoryCandidate.category,
      confidence: categoryCandidate.confidence,
      source: 'visual',
      caption: `The image has visual signals associated with ${categoryCandidate.category}.`,
    }
  }

  return null
}
