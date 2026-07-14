const MAX_COMPONENT_ITEMS = 8
const MAX_QUERY_LENGTH = 260
const LOCATION_GATE_SCORE = 10
const STRONG_LOCATION_TYPES = new Set([
  'ward',
  'district',
  'city',
  'landmark',
])

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function clampScore(value) {
  return roundScore(Math.max(0, Math.min(1, Number(value) || 0)))
}

function cleanText(value, maximumLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength).trim()}...`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceValues(entity) {
  const values = Array.isArray(entity?.evidence)
    ? entity.evidence
    : entity?.evidence
      ? [entity.evidence]
      : []
  return values.map((value) => cleanText(value, 220)).filter(Boolean)
}

function entityValue(entity) {
  return entity?.value ? cleanText(entity.value) : null
}

function uniqueEntityValues(items, valueKey = 'value') {
  const values = []
  const seen = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const value = cleanText(item?.[valueKey] || item?.value)
    const key = normalizeText(value)
    if (!value || !key || seen.has(key)) continue
    seen.add(key)
    values.push(value)
    if (values.length >= MAX_COMPONENT_ITEMS) break
  }
  return values
}

function componentsFromEntities(entities = {}) {
  return {
    address: entityValue(entities.address),
    placeName: entityValue(entities.placeName),
    phones: uniqueEntityValues(entities.phones, 'normalized'),
    dishNames: uniqueEntityValues(entities.dishNames),
    locationHints: uniqueEntityValues(entities.locationHints),
    priceHints: uniqueEntityValues(entities.priceHints),
  }
}

function normalizedVietnamesePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  return /^0[35789]\d{8}$/.test(local) || /^02\d{8,9}$/.test(local)
    ? local
    : null
}

function strongPhones(items = []) {
  const values = []
  const seen = new Set()
  for (const phone of Array.isArray(items) ? items : []) {
    if (Number(phone?.confidence || 0) < 0.62) continue
    const normalized = normalizedVietnamesePhone(
      phone?.normalized || phone?.value,
    )
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    values.push({
      value: normalized,
      confidence: clampScore(phone.confidence),
      evidence: evidenceValues(phone),
    })
  }
  return values
}

function strongLocations(items = []) {
  const values = []
  const seen = new Set()
  for (const location of Array.isArray(items) ? items : []) {
    if (
      !STRONG_LOCATION_TYPES.has(location?.type) ||
      Number(location?.confidence || 0) < 0.35
    ) {
      continue
    }
    const value = cleanText(location.value, 100)
    const key = normalizeText(value)
    if (!value || !key || seen.has(key)) continue
    seen.add(key)
    values.push({
      value,
      type: location.type,
      confidence: clampScore(location.confidence),
      evidence: evidenceValues(location),
    })
  }
  return values
}

function addressQuality(entity, locations) {
  const value = entityValue(entity)
  if (!value || Number(entity?.confidence || 0) < 0.58) return null
  const normalized = normalizeText(value)
  const hasHouseNumber =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/.test(normalized)
  const hasStreet =
    /\b(?:duong|street|road|avenue|boulevard|hem|ngo)\b/.test(normalized) ||
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s+[a-z]{2,}(?:\s+[a-z]{2,})+/.test(
      normalized,
    )
  const hasAdmin =
    /\b(?:phuong|ward|quan|district|thanh pho|city|province|tinh|tp hcm|tphcm)\b/.test(
      normalized,
    ) || locations.length > 0
  const remainder = normalized
    .replace(/^\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s*/, '')
    .trim()
  const locationOnlyRemainder = locations.some(
    (location) => normalizeText(location.value) === remainder,
  )
  if (!hasHouseNumber || !hasStreet || locationOnlyRemainder) return null
  return {
    value,
    confidence: clampScore(entity.confidence),
    hasAdmin,
    evidence: evidenceValues(entity),
  }
}

function placeQuality(entity, dishes) {
  const value = entityValue(entity)
  if (!value || Number(entity?.confidence || 0) < 0.5) return null
  const normalized = normalizeText(value)
  const tokens = normalized.split(' ').filter(Boolean)
  const repeatedRatio =
    tokens.length < 4 ? 0 : 1 - new Set(tokens).size / tokens.length
  const categoryLike = uniqueEntityValues(dishes)
    .map(normalizeText)
    .some(
      (dish) =>
        dish === normalized ||
        (dish && new RegExp(`\\b${dish.replace(/\s+/g, '\\s+')}\\b`).test(normalized)),
    )
  if (
    value.length > 80 ||
    !tokens.length ||
    tokens.length > 9 ||
    repeatedRatio >= 0.35
  ) {
    return null
  }
  return {
    value,
    confidence: clampScore(entity.confidence),
    categoryLike,
    evidence: evidenceValues(entity),
  }
}

function joinQuery(parts) {
  const values = []
  const seen = new Set()
  for (const part of parts.flat()) {
    const value = cleanText(part)
    const key = normalizeText(value)
    if (!value || !key || seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }
  const query = values.join(' ')
  return query.length <= MAX_QUERY_LENGTH
    ? query
    : query.slice(0, MAX_QUERY_LENGTH).trim()
}

function conflictPenalty(locations) {
  const byType = new Map()
  for (const location of locations) {
    if (!['city', 'district'].includes(location.type)) continue
    if (!byType.has(location.type)) byType.set(location.type, new Set())
    byType.get(location.type).add(normalizeText(location.value))
  }
  return [...byType.values()].some((values) => values.size > 1) ? 3 : 0
}

function allEvidence({ address, place, phones, locations, dishes }) {
  return [
    ...(address?.evidence || []),
    ...(place?.evidence || []),
    ...phones.flatMap((phone) => phone.evidence),
    ...locations.flatMap((location) => location.evidence),
    ...dishes.flatMap((dish) => evidenceValues(dish)),
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 12)
}

function result({
  query = null,
  canResolveLocation = false,
  confidence = 0,
  score = 0,
  reason,
  strategy = 'insufficient_evidence',
  components,
  evidence = [],
  warnings = [],
}) {
  return {
    query: query || null,
    canResolveLocation: canResolveLocation === true,
    confidence: clampScore(confidence),
    score: Math.max(0, Math.round(Number(score) || 0)),
    reason,
    strategy,
    components,
    evidence: [...new Set(evidence.filter(Boolean))].slice(0, 12),
    warnings: [...new Set(warnings.filter(Boolean))],
  }
}

export function buildFoodMapLocationQuery(input = {}) {
  const entities = input?.entities || input
  const components = componentsFromEntities(entities)
  const locations = strongLocations(entities.locationHints)
  const phones = strongPhones(entities.phones)
  const address = addressQuality(entities.address, locations)
  const place = placeQuality(entities.placeName, entities.dishNames)
  const dishes = Array.isArray(entities.dishNames)
    ? entities.dishNames.filter((dish) => Number(dish?.confidence || 0) >= 0.45)
    : []
  const locationValues = locations.map((location) => location.value)
  const phoneValues = phones.map((phone) => phone.value)
  const dishValues = uniqueEntityValues(dishes).slice(0, 2)
  const warnings = []
  let score = 0

  if (phones.length) score += 8
  if (address) score += address.hasAdmin ? 10 : 8
  if (place) score += 5
  if (locations.length) score += 2
  if (dishes.length) score += 1
  if (place && locations.length) score += 3
  if (place && dishes.length && locations.length) score += 1

  const penalty = conflictPenalty(locations)
  if (penalty) {
    score -= penalty
    warnings.push('Conflicting district or city evidence reduced the query score.')
  }
  if (
    [components.address, components.placeName, ...components.locationHints]
      .filter(Boolean)
      .some((value) => String(value).length > 180)
  ) {
    score -= 2
    warnings.push('An overlong query component was penalized.')
  }

  let strategy = 'insufficient_evidence'
  let query = null
  let reason = 'insufficient_evidence'
  if (address && phones.length) {
    strategy = 'place_address_phone'
    query = joinQuery([
      place?.value || [],
      address.value,
      phoneValues.slice(0, 1),
    ])
    reason = 'address_phone_supported'
  } else if (address) {
    strategy = 'address'
    const normalizedAddress = normalizeText(address.value)
    const supplementalLocations = locationValues.filter(
      (location) => !normalizedAddress.includes(normalizeText(location)),
    )
    query = joinQuery([
      place?.value || [],
      address.value,
      supplementalLocations,
    ])
    reason = address.hasAdmin
      ? 'address_house_street_location'
      : 'address_house_street'
  } else if (place && phones.length) {
    strategy = 'place_phone'
    query = joinQuery([
      place.value,
      phoneValues.slice(0, 1),
      locationValues,
    ])
    reason = 'place_phone_supported'
  } else if (place && locations.length) {
    strategy = dishes.length
      ? 'place_dish_location_hint'
      : 'place_location_hint'
    query = joinQuery([place.value, dishValues.slice(0, 1), locationValues])
    reason = strategy
  } else if (phones.length && locations.length) {
    strategy = 'phone_location_hint'
    query = joinQuery([phoneValues.slice(0, 1), locationValues])
    reason = 'phone_location_supported'
  } else if (phones.length) {
    reason = 'phone_only_needs_context'
    warnings.push(
      'Phone evidence needs place, address, or strong location context before map resolution.',
    )
  } else if (place) {
    reason = 'place_name_only_not_enough_for_location'
  } else if (dishes.length && !locations.length) {
    reason = 'dish_only_not_enough_for_location'
  } else if (locations.length) {
    reason = 'weak_location_only_not_enough_for_location'
  } else {
    reason = 'noisy_ocr_not_enough_for_location'
  }

  const canResolveLocation = score >= LOCATION_GATE_SCORE && Boolean(query)
  if (!canResolveLocation) query = null
  const confidence = canResolveLocation
    ? Math.min(
        0.96,
        0.42 +
          Math.min(score, 20) * 0.025 +
          Number(Boolean(address)) * 0.08 +
          Number(Boolean(phones.length)) * 0.06,
      )
    : Math.min(0.49, Math.max(0, score) / 20)
  if (dishes.length && !place && !address && !phones.length) {
    warnings.push('Dish text alone is not enough to resolve a real-world place.')
  }
  if (locations.length && !place && !address && !phones.length) {
    warnings.push('A location hint alone is not enough to identify a place.')
  }

  return result({
    query,
    canResolveLocation,
    confidence,
    score,
    reason,
    strategy,
    components,
    evidence: allEvidence({
      address,
      place,
      phones,
      locations,
      dishes,
    }),
    warnings,
  })
}

export function emptyFoodMapLocationQuery() {
  return result({
    reason: 'no_location_evidence',
    components: componentsFromEntities({}),
  })
}

export const FOOD_MAP_LOCATION_GATE_SCORE = LOCATION_GATE_SCORE
