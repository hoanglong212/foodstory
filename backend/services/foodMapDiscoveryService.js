import {
  FOOD_THRESHOLD,
  embedClipHint,
  embedUploadedImage,
  rankVisualCandidates,
} from './visualSearchService.js'
import {
  findFoodMapMatch,
  selectExistingFoodMapMatch,
} from './foodMapExistenceService.js'
import { findExternalPlace } from './externalPlaceDiscoveryService.js'
import { identifyDish } from './dishIdentificationService.js'
import { extractTextFromImage } from './ocrService.js'

const MAX_HINT_LENGTH = 200
const MAX_SOURCE_URL_LENGTH = 2000
const MAX_OCR_NOTES_LENGTH = 500

const DEFAULT_DEPENDENCIES = {
  embedClipHint,
  embedUploadedImage,
  extractTextFromImage,
  findExternalPlace,
  findFoodMapMatch,
  rankVisualCandidates,
}

function cleanText(value, maximumLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function cleanMultilineText(value, maximumLength) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maximumLength)
}

function publicExternalPlace(externalPlace) {
  if (!externalPlace) return null
  const { discoveryWarning: _warning, ...place } = externalPlace
  return place
}

function normalizeOcrResult(result) {
  const confidence = Number(result?.confidence)
  const text = typeof result?.text === 'string' ? result.text.trim() : ''
  const ocrUsable =
    result?.ocrUsable === true ||
    (result?.ocrUsable === undefined &&
      Boolean(text) &&
      Number.isFinite(confidence) &&
      confidence >= 0.5)

  return {
    ...result,
    text: ocrUsable ? text : null,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    lines:
      ocrUsable && Array.isArray(result?.lines)
        ? result.lines.filter(Boolean)
        : [],
    ocrUsable,
    reason: result?.reason || (ocrUsable ? 'usable' : 'unusable'),
    debug: {
      rawText: result?.debug?.rawText || text,
      cleanedText: result?.debug?.cleanedText || text,
    },
  }
}

function buildVisualUnderstanding({
  caption = null,
  dishSignal = null,
  externalPlace = null,
  ocrResult = null,
  imagePreview = null,
}) {
  return {
    caption,
    ocrText: ocrResult?.text || null,
    ocrConfidence: Number.isFinite(ocrResult?.confidence)
      ? ocrResult.confidence
      : null,
    ocrUsable: ocrResult?.ocrUsable ?? null,
    ocrReason: ocrResult?.reason || null,
    ocrLines: Array.isArray(ocrResult?.lines) ? ocrResult.lines : [],
    dishName: dishSignal?.dishName || externalPlace?.dishName || null,
    placeName: externalPlace?.name || null,
    category: externalPlace?.category || dishSignal?.category || null,
    district: externalPlace?.district || null,
    imagePreview,
  }
}

function toFoodMapMatch(candidate) {
  if (!candidate) return null
  return {
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    name: candidate.name,
    dishName: candidate.dishName || null,
    category: candidate.category || null,
    district: candidate.district || null,
    address: candidate.address || null,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    confidence: candidate.confidence,
    matchLevel: candidate.matchLevel,
    evidence: candidate.evidence || [],
  }
}

function buildTags(category, dishName) {
  return [
    ...new Set(
      [category, dishName]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
    ),
  ]
    .slice(0, 4)
    .join(', ')
}

function buildSuggestedDraft({
  externalPlace = null,
  dishSignal = null,
  hint = '',
  ocrText = '',
  sourceUrl = '',
  imagePreview = null,
}) {
  const notes = [
    'Suggested from Food Map discovery. Please verify before saving.',
    hint ? `User hint: ${hint}.` : '',
    ocrText
      ? `Text found in image: ${cleanMultilineText(
          ocrText,
          MAX_OCR_NOTES_LENGTH,
        )}.`
      : '',
    sourceUrl ? `Source: ${sourceUrl}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const dishName = externalPlace?.dishName || dishSignal?.dishName || ''
  const category = externalPlace?.category || dishSignal?.category || ''

  return {
    name: externalPlace?.name || '',
    dish_name: dishName,
    category,
    district: externalPlace?.district || '',
    address: externalPlace?.address || '',
    latitude: externalPlace?.latitude ?? null,
    longitude: externalPlace?.longitude ?? null,
    notes,
    tags: buildTags(category, dishName),
    source_url: sourceUrl,
    imagePreview,
  }
}

function baseResponse({
  status,
  message,
  sourceUrl = '',
  visualUnderstanding,
  externalPlace = null,
  foodMapMatch = null,
  foodMapCandidates = [],
  suggestedDraft = null,
  actions = [],
  debug = {},
}) {
  return {
    status,
    message,
    sourceUrl: sourceUrl || null,
    visualUnderstanding,
    externalPlace: publicExternalPlace(externalPlace),
    foodMapMatch,
    foodMapCandidates,
    suggestedDraft,
    actions,
    debug,
  }
}

export function buildUrlExtractionFailedResponse({
  sourceUrl = '',
  hint = '',
} = {}) {
  return baseResponse({
    status: 'url_extraction_failed',
    message:
      'I could not read this URL directly yet. Please upload a screenshot or image from the video instead.',
    sourceUrl,
    visualUnderstanding: buildVisualUnderstanding({}),
    actions: hint ? ['upload_screenshot', 'add_hint'] : ['upload_screenshot'],
    debug: {
      phase: 2,
      urlExtractionImplemented: false,
      ocrImplemented: true,
      captionModelImplemented: false,
    },
  })
}

export function buildUnclearResponse({
  message = 'I could not identify food clearly. Please upload a clearer image or add a hint.',
  sourceUrl = '',
  ocrResult = null,
  debug = {},
} = {}) {
  return baseResponse({
    status: 'unclear',
    message,
    sourceUrl,
    visualUnderstanding: buildVisualUnderstanding({ ocrResult }),
    actions: ['upload_screenshot', 'add_hint'],
    debug: {
      phase: 2,
      ocrImplemented: true,
      captionModelImplemented: false,
      ...debug,
    },
  })
}

export function decideFoodMapDiscovery({
  sourceUrl = '',
  hint = '',
  foodScore = null,
  externalPlace = null,
  foodMapMatch = null,
  mapCandidates = [],
  dishSignal = null,
  caption = null,
  ocrResult = null,
  imagePreview = null,
  imageWasProvided = true,
  debug = {},
}) {
  if (
    imageWasProvided &&
    (!Number.isFinite(foodScore) || foodScore < FOOD_THRESHOLD) &&
    !externalPlace &&
    !dishSignal
  ) {
    return buildUnclearResponse({
      sourceUrl,
      ocrResult,
      debug: { ...debug, foodScore },
    })
  }

  const visualUnderstanding = buildVisualUnderstanding({
    caption,
    dishSignal,
    externalPlace,
    ocrResult,
    imagePreview,
  })
  const candidates = mapCandidates.map(toFoodMapMatch)

  if (externalPlace) {
    const existingMatch =
      foodMapMatch || selectExistingFoodMapMatch(mapCandidates)
    if (existingMatch) {
      return baseResponse({
        status: 'external_place_found_in_foodmap',
        message: 'Found in FoodStory Map.',
        sourceUrl,
        visualUnderstanding,
        externalPlace,
        foodMapMatch: toFoodMapMatch(existingMatch),
        foodMapCandidates: candidates,
        actions: ['focus_map_marker', 'view_details'],
        debug,
      })
    }

    return baseResponse({
      status: 'external_place_found_not_in_foodmap',
      message: 'Found outside FoodStory, not in map yet.',
      sourceUrl,
      visualUnderstanding,
      externalPlace,
      foodMapCandidates: candidates,
      suggestedDraft: buildSuggestedDraft({
        externalPlace,
        dishSignal,
        hint,
        ocrText: ocrResult?.text,
        sourceUrl,
        imagePreview,
      }),
      actions: ['add_to_food_map', 'edit_before_add', 'upload_screenshot'],
      debug,
    })
  }

  if (dishSignal) {
    const dishDescription =
      dishSignal.category &&
      dishSignal.category.toLowerCase() !== dishSignal.dishName.toLowerCase()
        ? `${dishSignal.dishName} / ${dishSignal.category}`
        : dishSignal.dishName
    return baseResponse({
      status: 'external_place_not_found_dish_identified',
      message: `I could not identify the exact place, but this looks like ${dishDescription}.`,
      sourceUrl,
      visualUnderstanding,
      foodMapCandidates: candidates,
      suggestedDraft: buildSuggestedDraft({
        dishSignal,
        hint,
        ocrText: ocrResult?.text,
        sourceUrl,
        imagePreview,
      }),
      actions: [
        'add_to_food_map',
        'edit_before_add',
        'add_hint',
        'upload_screenshot',
      ],
      debug,
    })
  }

  return baseResponse({
    status: 'external_place_not_found_unclear',
    message:
      'I could not identify the place or dish reliably. Please upload a clearer screenshot or add a hint.',
    sourceUrl,
    visualUnderstanding,
    foodMapCandidates: candidates,
    actions: ['upload_screenshot', 'add_hint'],
    debug,
  })
}

async function discoverFromHintOnly({
  hint,
  sourceUrl,
  dependencies,
}) {
  if (sourceUrl) {
    return buildUrlExtractionFailedResponse({ sourceUrl, hint })
  }

  const externalPlace = await dependencies.findExternalPlace({
    hint,
    sourceUrl,
  })
  const dishSignal = identifyDish({
    hint,
    placeIdentified: Boolean(externalPlace),
  })
  const foodMapResult = externalPlace
    ? await dependencies.findFoodMapMatch(externalPlace)
    : { match: null, candidates: [] }

  return decideFoodMapDiscovery({
    sourceUrl,
    hint,
    externalPlace,
    foodMapMatch: foodMapResult.match,
    mapCandidates: foodMapResult.candidates,
    dishSignal,
    caption: dishSignal?.caption || null,
    imageWasProvided: false,
    debug: {
      phase: 2,
      evidence: 'hint_only',
      externalPlaceSource: externalPlace?.source || null,
      externalPlaceWarning: externalPlace?.discoveryWarning || null,
      googlePlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      urlExtractionImplemented: false,
      ocrImplemented: true,
      captionModelImplemented: false,
    },
  })
}

export async function analyzeFoodMapDiscovery(
  { file = null, hint = '', sourceUrl = '' },
  dependencyOverrides = {},
) {
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...dependencyOverrides,
  }
  const cleanedHint = cleanText(hint, MAX_HINT_LENGTH)
  const cleanedSourceUrl = cleanText(sourceUrl, MAX_SOURCE_URL_LENGTH)

  if (!file) {
    return discoverFromHintOnly({
      hint: cleanedHint,
      sourceUrl: cleanedSourceUrl,
      dependencies,
    })
  }

  const [imageResult, rawOcrResult] = await Promise.all([
    dependencies.embedUploadedImage(file),
    dependencies.extractTextFromImage(file.buffer),
  ])
  const ocrResult = normalizeOcrResult(rawOcrResult)
  const foodScore = Number(imageResult.food_score)
  let ranked = []

  if (Number.isFinite(foodScore) && foodScore >= FOOD_THRESHOLD) {
    const hintEmbedding = cleanedHint
      ? await dependencies.embedClipHint(cleanedHint)
      : null
    const visualRanking = await dependencies.rankVisualCandidates(
      imageResult.embedding,
      {
        hintEmbedding,
        hint: cleanedHint,
        minimumScore: 0,
        topK: 12,
      },
    )
    ranked = visualRanking.ranked
  }

  const visualDishSignal = identifyDish({
    hint: '',
    visualCandidates: ranked,
    dishPredictions:
      Number.isFinite(foodScore) && foodScore >= FOOD_THRESHOLD
        ? imageResult.dish_predictions || imageResult.dishPredictions || []
        : [],
    placeIdentified: false,
  })
  const externalPlace = await dependencies.findExternalPlace({
    ocrText: ocrResult.ocrUsable ? ocrResult.text : '',
    hint: cleanedHint,
    dishName: visualDishSignal?.dishName,
    category: visualDishSignal?.category,
    sourceUrl: cleanedSourceUrl,
  })
  const dishSignal =
    visualDishSignal ||
    identifyDish({
      hint: cleanedHint,
      visualCandidates: ranked,
      dishPredictions:
        Number.isFinite(foodScore) && foodScore >= FOOD_THRESHOLD
          ? imageResult.dish_predictions || imageResult.dishPredictions || []
          : [],
      placeIdentified: Boolean(externalPlace),
    })
  const foodMapResult = externalPlace
    ? await dependencies.findFoodMapMatch(externalPlace)
    : { match: null, candidates: [] }

  return decideFoodMapDiscovery({
    sourceUrl: cleanedSourceUrl,
    hint: cleanedHint,
    foodScore,
    externalPlace,
    foodMapMatch: foodMapResult.match,
    mapCandidates: foodMapResult.candidates,
    dishSignal,
    caption: dishSignal?.caption || null,
    ocrResult,
    imageWasProvided: true,
    debug: {
      phase: 2,
      foodScore,
      visualCandidateCount: ranked.length,
      topVisualMatchScore: ranked[0]?.confidence || 0,
      restaurantEmbeddingsAreTextDerived: true,
      ocrImplemented: true,
      ocrWarning: ocrResult.warning || null,
      ocrConfidence: ocrResult.confidence,
      ocrUsable: ocrResult.ocrUsable,
      ocrReason: ocrResult.reason,
      ocr: ocrResult.debug,
      externalPlaceSource: externalPlace?.source || null,
      externalPlaceWarning: externalPlace?.discoveryWarning || null,
      googlePlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      captionModelImplemented: false,
      urlExtractionImplemented: false,
    },
  })
}

export const FOOD_MAP_DISCOVERY_LIMITS = {
  maxHintLength: MAX_HINT_LENGTH,
  maxSourceUrlLength: MAX_SOURCE_URL_LENGTH,
}
