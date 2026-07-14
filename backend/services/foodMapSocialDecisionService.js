import { emptyFoodMapEntities } from './foodMapEntityExtractionService.js'
import { emptyFoodMapLocationQuery } from './foodMapLocationQueryService.js'

export const FOOD_MAP_SOCIAL_STATUSES = Object.freeze([
  'address_found',
  'place_name_found',
  'dish_only',
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

function publicMatchedPlace(place, reason) {
  if (!place) return emptyPlace(reason)
  return {
    name: place.name || null,
    address: place.address || place.formattedAddress || null,
    district: place.district || null,
    city: place.city || null,
    source: place.sourceType || place.source || null,
    existsInFoodMap: true,
    matchedFoodMapPlace: place,
    confidence: roundScore(place.confidence),
    reason,
  }
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function capString(value, maximumLength) {
  const text = String(value || '').trim()
  if (text.length <= maximumLength) return text
  return `${text.slice(0, maximumLength).trim()}...`
}

function publicOcrEvidence(evidence = null) {
  const usable = evidence?.usable === true || evidence?.ocrUsable === true
  const publicLines = (lines = []) =>
    usable && Array.isArray(lines)
      ? lines
          .map((line) => ({
            text: capString(line?.text, 300),
            ...(line?.displayText
              ? { displayText: capString(line.displayText, 300) }
              : {}),
            confidence: roundScore(line?.confidence),
            type: ['address', 'phone', 'sign', 'other'].includes(line?.type)
              ? line.type
              : 'other',
            ...(line?.clusterType
              ? { clusterType: capString(line.clusterType, 40) }
              : {}),
            ...(Number.isFinite(Number(line?.quality))
              ? { quality: roundScore(line.quality) }
              : {}),
            ...(Number.isFinite(Number(line?.supportCount))
              ? { supportCount: Math.max(1, Number(line.supportCount)) }
              : {}),
            ...(['strong', 'weak'].includes(line?.tier)
              ? { tier: line.tier }
              : {}),
            ...(Array.isArray(line?.evidenceVariants)
              ? {
                  evidenceVariants: line.evidenceVariants
                    .slice(0, 5)
                    .map((variant) => ({
                      text: capString(variant?.text, 180),
                      confidence: roundScore(variant?.confidence),
                      pass: capString(variant?.pass, 80),
                      variant: capString(variant?.variant, 40),
                    }))
                    .filter((variant) => variant.text),
                }
              : {}),
          }))
          .filter((line) => line.text)
      : []

  return {
    text: usable && evidence?.text ? capString(evidence.text, 1_500) : null,
    usable,
    confidence: roundScore(evidence?.confidence),
    reason: evidence?.reason || 'not_provided',
    lines: publicLines(evidence?.lines),
    strongLines: publicLines(evidence?.strongLines),
    weakLines: publicLines(evidence?.weakLines),
    warnings: Array.isArray(evidence?.warnings) ? evidence.warnings : [],
    debug: evidence?.debug || { implemented: false },
  }
}

function publicTextSources(textSources = []) {
  return Array.isArray(textSources)
    ? textSources
        .map((source) => ({
          type: capString(source?.type, 40),
          text: capString(source?.text, 700),
          confidence: roundScore(source?.confidence),
          source: capString(source?.source || 'unknown', 160),
          usable: source?.usable !== false,
        }))
        .filter((source) => source.type && source.text)
    : []
}

function publicUrlEvidence(evidence = null) {
  if (!evidence || typeof evidence !== 'object') return null
  const values = (items = [], maximumLength = 700, maximumItems = 5) =>
    Array.isArray(items)
      ? items
          .map((item) => capString(item, maximumLength))
          .filter(Boolean)
          .slice(0, maximumItems)
      : []
  return {
    platform: capString(evidence.platform || 'unknown', 40),
    provider: evidence.provider ? capString(evidence.provider, 80) : null,
    resolvedInputType: capString(
      evidence.resolvedInputType || 'unknown',
      60,
    ),
    extractionStatus: capString(
      evidence.extractionStatus || 'unknown',
      60,
    ),
    videoId: evidence.videoId ? capString(evidence.videoId, 32) : null,
    title: evidence.title ? capString(evidence.title, 500) : null,
    description: evidence.description
      ? capString(evidence.description, 700)
      : null,
    channelTitle: evidence.channelTitle
      ? capString(evidence.channelTitle, 300)
      : null,
    publishedAt: evidence.publishedAt
      ? capString(evidence.publishedAt, 80)
      : null,
    ogTitle: evidence.ogTitle ? capString(evidence.ogTitle, 500) : null,
    ogDescription: evidence.ogDescription
      ? capString(evidence.ogDescription, 700)
      : null,
    jsonLdEvidence: values(evidence.jsonLdEvidence),
    thumbnailUrl: evidence.thumbnailUrl
      ? capString(evidence.thumbnailUrl, 2_048)
      : null,
    thumbnailOcrStatus: capString(
      evidence.thumbnailOcrStatus || 'not_available',
      60,
    ),
    warnings: values(evidence.warnings, 180, 12),
  }
}

function publicEvidenceValidation(validation = null) {
  if (!validation || typeof validation !== 'object') return null
  return {
    provider: capString(validation.provider || 'rule', 40),
    mode: capString(validation.mode || 'rule', 40),
    requested: validation.requested === true,
    applied: validation.applied === true,
    status: capString(validation.status || 'not_requested', 60),
    keyConfigured: validation.keyConfigured === true,
    modelConfigured: validation.modelConfigured === true,
    httpStatus:
      validation.httpStatus != null &&
      Number.isFinite(Number(validation.httpStatus))
        ? Number(validation.httpStatus)
        : null,
    confidence: roundScore(validation.confidence),
    rejectedEntities: (Array.isArray(validation.rejectedEntities)
      ? validation.rejectedEntities
      : []
    )
      .map((item) => ({
        field: capString(item?.field, 40),
        value: capString(item?.value, 180),
        reason: capString(item?.reason, 180),
      }))
      .filter((item) => item.field && item.value && item.reason)
      .slice(0, 12),
    canResolveLocation:
      typeof validation.canResolveLocation === 'boolean'
        ? validation.canResolveLocation
        : null,
    recommendedNextAction: capString(
      validation.recommendedNextAction || 'none',
      60,
    ),
    warnings: (Array.isArray(validation.warnings)
      ? validation.warnings
      : []
    )
      .map((item) => capString(item, 180))
      .filter(Boolean)
      .slice(0, 8),
  }
}

function publicEntitySummary(entities = null) {
  const sourceValues = new Set(['ocr', 'title', 'description', 'hint', 'mixed'])
  const safeEntities = entities || emptyFoodMapEntities()
  const source = (value) => (sourceValues.has(value) ? value : null)
  const publicNamedEntity = (entity = {}) => ({
    value: entity?.value ? capString(entity.value, 300) : null,
    confidence: roundScore(entity?.confidence),
    source: source(entity?.source),
    evidence: Array.isArray(entity?.evidence)
      ? entity.evidence.map((item) => capString(item, 220)).filter(Boolean)
      : [],
  })
  const publicArray = (items = [], mapper) =>
    Array.isArray(items) ? items.map(mapper).filter(Boolean).slice(0, 8) : []

  return {
    address: publicNamedEntity(safeEntities.address),
    placeName: publicNamedEntity(safeEntities.placeName),
    phones: publicArray(safeEntities.phones, (phone) => {
      const value = phone?.value ? capString(phone.value, 80) : null
      const normalized = phone?.normalized
        ? capString(phone.normalized, 40)
        : null
      if (!value || !normalized) return null
      return {
        value,
        normalized,
        confidence: roundScore(phone?.confidence),
        source: capString(phone?.source, 40),
        evidence: capString(phone?.evidence, 220),
      }
    }),
    dishNames: publicArray(safeEntities.dishNames, (dish) => {
      if (!dish?.value) return null
      return {
        value: capString(dish.value, 100),
        confidence: roundScore(dish?.confidence),
        source: capString(dish?.source, 40),
        evidence: capString(dish?.evidence, 220),
      }
    }),
    priceHints: publicArray(safeEntities.priceHints, (price) => {
      if (!price?.value) return null
      return {
        value: capString(price.value, 60),
        confidence: roundScore(price?.confidence),
        source: capString(price?.source, 40),
        evidence: capString(price?.evidence, 220),
      }
    }),
    locationHints: publicArray(safeEntities.locationHints, (location) => {
      if (!location?.value) return null
      const type = ['ward', 'district', 'city', 'landmark', 'unknown'].includes(
        location?.type,
      )
        ? location.type
        : 'unknown'
      return {
        value: capString(location.value, 100),
        type,
        confidence: roundScore(location?.confidence),
        source: capString(location?.source, 40),
        evidence: capString(location?.evidence, 220),
      }
    }),
    confidence: roundScore(safeEntities.confidence),
    status: ['address_found', 'place_name_found', 'dish_only', 'unclear'].includes(
      safeEntities.status,
    )
      ? safeEntities.status
      : 'unclear',
    warnings: Array.isArray(safeEntities.warnings)
      ? safeEntities.warnings.map((warning) => capString(warning, 180))
      : [],
    extractorUsed: capString(safeEntities.extractorUsed || 'rule', 40),
    mergeDebug:
      safeEntities.mergeDebug && typeof safeEntities.mergeDebug === 'object'
        ? safeEntities.mergeDebug
        : {},
  }
}

function publicLocationQuery(locationQuery = null) {
  const safeQuery = locationQuery || emptyFoodMapLocationQuery()
  const components = safeQuery.components || {}
  const publicValues = (values = [], maximumLength = 120) =>
    Array.isArray(values)
      ? values
          .map((value) => capString(value, maximumLength))
          .filter(Boolean)
          .slice(0, 8)
      : []

  return {
    query: safeQuery.query ? capString(safeQuery.query, 320) : null,
    canResolveLocation: safeQuery.canResolveLocation === true,
    confidence: roundScore(safeQuery.confidence),
    score: Math.max(0, Math.round(Number(safeQuery.score) || 0)),
    reason: capString(
      safeQuery.reason || 'No location evidence was provided.',
      220,
    ),
    strategy: capString(safeQuery.strategy || 'insufficient_evidence', 80),
    components: {
      address: components.address
        ? capString(components.address, 220)
        : null,
      placeName: components.placeName
        ? capString(components.placeName, 160)
        : null,
      phones: publicValues(components.phones, 40),
      dishNames: publicValues(components.dishNames, 100),
      locationHints: publicValues(components.locationHints, 100),
      priceHints: publicValues(components.priceHints, 60),
    },
    evidence: publicValues(safeQuery.evidence, 220),
    warnings: publicValues(safeQuery.warnings, 220),
  }
}

function publicLocationResolution(resolution = null) {
  const safe = resolution || {
    status: 'provider_disabled',
    resolvedLocation: null,
    candidates: [],
    confidence: 0,
    reason: 'not_requested',
    warnings: [],
  }
  const candidate = (value) => ({
    name: value?.name ? capString(value.name, 180) : null,
    formattedAddress: value?.formattedAddress
      ? capString(value.formattedAddress, 300)
      : null,
    phone: value?.phone ? capString(value.phone, 40) : null,
    lat: Number.isFinite(Number(value?.lat)) ? Number(value.lat) : null,
    lng: Number.isFinite(Number(value?.lng)) ? Number(value.lng) : null,
    placeId: value?.placeId ? capString(value.placeId, 255) : null,
    rating: Number.isFinite(Number(value?.rating))
      ? Number(value.rating)
      : null,
    userRatingsTotal: Number.isFinite(Number(value?.userRatingsTotal))
      ? Number(value.userRatingsTotal)
      : null,
    source: value?.source ? capString(value.source, 40) : null,
    rawTypes: Array.isArray(value?.rawTypes)
      ? value.rawTypes.map((item) => capString(item, 80)).slice(0, 20)
      : [],
    confidence: roundScore(value?.confidence),
    matchReasons: Array.isArray(value?.matchReasons)
      ? value.matchReasons.map((item) => capString(item, 80)).slice(0, 10)
      : [],
  })

  return {
    status: capString(safe.status || 'error', 40),
    resolvedLocation: safe.resolvedLocation
      ? candidate(safe.resolvedLocation)
      : null,
    candidates: Array.isArray(safe.candidates)
      ? safe.candidates.slice(0, 10).map(candidate)
      : [],
    confidence: roundScore(safe.confidence),
    reason: capString(safe.reason || 'unknown', 180),
    warnings: Array.isArray(safe.warnings)
      ? safe.warnings.map((item) => capString(item, 180)).slice(0, 8)
      : [],
  }
}

function publicNextAction(nextAction = null) {
  const safe = nextAction || {
    type: 'none',
    message: 'No next action is required.',
    payload: {},
  }
  const payload =
    safe.payload && typeof safe.payload === 'object'
      ? safe.payload
      : {}
  let payloadIsBounded = false
  try {
    payloadIsBounded = JSON.stringify(payload).length <= 12_000
  } catch {
    payloadIsBounded = false
  }
  return {
    type: capString(safe.type || 'none', 60),
    message: capString(safe.message || '', 500),
    payload:
      payloadIsBounded ? payload : { truncated: true },
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
  urlEvidence = null,
  evidenceValidation = null,
  ocrEvidence = null,
  textSources = [],
  entities = null,
  locationQuery = null,
  locationResolution = null,
  nextAction = null,
  matchedPlace = null,
  draftPlace = null,
}) {
  if (!FOOD_MAP_SOCIAL_STATUSES.includes(status)) {
    throw new Error(`Unsupported Food Map social discovery status: ${status}`)
  }

  const publicOcr = publicOcrEvidence(ocrEvidence)
  const publicEntities = publicEntitySummary(entities)

  return {
    status,
    confidence,
    message,
    inputSignals: {
      url: inputSignals.url || null,
      platform: inputSignals.platform || null,
      title: inputSignals.title || null,
      description: inputSignals.description || null,
      ocrText: inputSignals.ocrText || publicOcr.text || null,
      ocrUsable: inputSignals.ocrUsable === true || publicOcr.usable,
      hint: inputSignals.hint || null,
    },
    ocrEvidence: publicOcr,
    textSources: publicTextSources(textSources),
    entities: publicEntities,
    locationQuery: publicLocationQuery(locationQuery),
    locationResolution: publicLocationResolution(locationResolution),
    nextAction: publicNextAction(nextAction),
    place: publicMatchedPlace(matchedPlace, placeReason),
    dishFallback: emptyDishFallback(dishReason),
    addPlaceDraft: draftPlace || null,
    debug: {
      steps,
      warnings,
      ...(urlExtraction ? { urlExtraction } : {}),
      ...(urlEvidence ? { urlEvidence: publicUrlEvidence(urlEvidence) } : {}),
      ...(evidenceValidation
        ? {
            evidenceValidation:
              publicEvidenceValidation(evidenceValidation),
          }
        : {}),
    },
  }
}
