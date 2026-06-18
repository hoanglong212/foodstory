const STRONG_LOCATION_TYPES = new Set([
  'ward',
  'district',
  'city',
  'landmark',
])

const MAX_COMPONENT_ITEMS = 8
const MAX_QUERY_LENGTH = 320

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

function entityValue(entity) {
  return entity?.value ? cleanText(entity.value) : null
}

function entityValues(items, valueKey = 'value') {
  const values = []
  const seen = new Set()

  for (const item of Array.isArray(items) ? items : []) {
    const value = cleanText(item?.[valueKey])
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
    phones: entityValues(entities.phones, 'normalized'),
    dishNames: entityValues(entities.dishNames),
    locationHints: entityValues(entities.locationHints),
    priceHints: entityValues(entities.priceHints),
  }
}

function repeatedTokenRatio(value) {
  const tokens = normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
  if (tokens.length < 4) return 0
  return 1 - new Set(tokens).size / tokens.length
}

function normalizedVietnamesePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  const isMobile = /^0[35789]\d{8}$/.test(local)
  const isLandline = /^02\d{8,9}$/.test(local)
  return isMobile || isLandline ? local : null
}

function strongPhones(phones = []) {
  const values = []
  const seen = new Set()

  for (const phone of Array.isArray(phones) ? phones : []) {
    if (Number(phone?.confidence || 0) < 0.62) continue
    const normalized = normalizedVietnamesePhone(
      phone?.normalized || phone?.value,
    )
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    values.push({
      value: normalized,
      confidence: clampScore(phone.confidence),
    })
  }

  return values
}

function strongLocationHints(locationHints = []) {
  const hints = []
  const seen = new Set()

  for (const location of Array.isArray(locationHints) ? locationHints : []) {
    if (!STRONG_LOCATION_TYPES.has(location?.type)) continue
    if (Number(location?.confidence || 0) < 0.35) continue
    const value = cleanText(location.value, 100)
    const key = normalizeText(value)
    if (!value || !key || seen.has(key)) continue
    seen.add(key)
    hints.push({
      value,
      type: location.type,
      confidence: clampScore(location.confidence),
    })
  }

  return hints
}

function hasEmbeddedLocation(address) {
  const normalized = normalizeText(address)
  return (
    /\b(?:p|phuong|ward)\s*\d{1,2}\b/.test(normalized) ||
    /\b(?:q|quan|district)\s*\d{1,2}\b/.test(normalized) ||
    /\b(?:tp|thanh pho|city)\b/.test(normalized)
  )
}

function strongAddress(address, locationHints) {
  const value = entityValue(address)
  if (!value || Number(address?.confidence || 0) < 0.62) return null

  const normalized = normalizeText(value)
  const hasHouseNumber =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/i.test(value)
  const hasStreetName =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s+[\p{L}]{2,}/u.test(
      value,
    )
  const textAfterHouseNumber = normalized
    .replace(/^\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s*/, '')
    .trim()
  const locationOnlyRemainder = strongLocationHints(locationHints).some(
    (location) => normalizeText(location.value) === textAfterHouseNumber,
  )
  const hasLocation =
    hasEmbeddedLocation(value) || strongLocationHints(locationHints).length > 0

  if (
    !hasHouseNumber ||
    !hasStreetName ||
    !hasLocation ||
    locationOnlyRemainder
  ) {
    return null
  }
  return {
    value,
    confidence: clampScore(address.confidence),
  }
}

function placeNameQuality(placeName, dishNames = []) {
  const value = entityValue(placeName)
  if (!value || Number(placeName?.confidence || 0) < 0.5) {
    return { usable: false, categoryLike: false, reason: 'missing_place_name' }
  }

  const normalized = normalizeText(value)
  const tokens = normalized.split(' ').filter(Boolean)
  const letterCount = [...value].filter((character) =>
    /\p{L}/u.test(character),
  ).length
  const visibleCount = [...value].filter(
    (character) => !/\s/u.test(character),
  ).length
  const priceCount = (
    value.match(/\b\d{1,3}\s*(?:k|vnd|đ|d)\b/giu) || []
  ).length

  if (
    value.length > 80 ||
    tokens.length > 9 ||
    tokens.length === 0 ||
    visibleCount === 0 ||
    letterCount / visibleCount < 0.55 ||
    priceCount >= 2 ||
    repeatedTokenRatio(value) >= 0.35
  ) {
    return { usable: false, categoryLike: false, reason: 'noisy_place_name' }
  }

  const normalizedDishes = entityValues(dishNames).map(normalizeText)
  if (normalizedDishes.includes(normalized)) {
    return { usable: false, categoryLike: true, reason: 'dish_only_name' }
  }

  const categoryLike = normalizedDishes.some((dish) => {
    if (!dish) return false
    const pattern = dish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return new RegExp(`\\b${pattern}\\b`).test(normalized)
  })

  return {
    usable: true,
    value,
    confidence: clampScore(placeName.confidence),
    categoryLike,
    reason: 'clean_place_name',
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

  return cleanText(values.join(', '), MAX_QUERY_LENGTH)
}

function result({
  query = null,
  canResolveLocation = false,
  confidence = 0,
  reason,
  components,
  warnings = [],
}) {
  return {
    query: query || null,
    canResolveLocation: canResolveLocation === true,
    confidence: clampScore(confidence),
    reason,
    components,
    warnings: [...new Set(warnings.filter(Boolean))],
  }
}

export function buildFoodMapLocationQuery(entities = {}) {
  const components = componentsFromEntities(entities)
  const locations = strongLocationHints(entities.locationHints)
  const phones = strongPhones(entities.phones)
  const address = strongAddress(entities.address, entities.locationHints)
  const place = placeNameQuality(entities.placeName, entities.dishNames)
  const locationValues = locations.map((location) => location.value)
  const phoneValues = phones.map((phone) => phone.value)

  if (address) {
    const normalizedAddress = normalizeText(address.value)
    const supplementalLocations = locationValues.filter(
      (location) => !normalizedAddress.includes(normalizeText(location)),
    )
    const confidence = Math.min(
      0.97,
      address.confidence +
        (locations.length ? 0.06 : 0) +
        (phones.length ? 0.04 : 0),
    )
    return result({
      query: joinQuery([address.value, supplementalLocations, phoneValues]),
      canResolveLocation: true,
      confidence,
      reason: phones.length
        ? 'Confident address with a normalized Vietnamese phone number.'
        : 'Confident address with a district, city, ward, or landmark hint.',
      components,
    })
  }

  if (phones.length) {
    const bestPhoneConfidence = Math.max(
      ...phones.map((phone) => phone.confidence),
    )
    return result({
      query: joinQuery([phoneValues, locationValues]),
      canResolveLocation: true,
      confidence: Math.min(
        0.92,
        0.7 + bestPhoneConfidence * 0.18 + (locations.length ? 0.06 : 0),
      ),
      reason: locations.length
        ? 'Normalized Vietnamese phone number with a location hint.'
        : 'Normalized Vietnamese phone number is strong location evidence.',
      components,
    })
  }

  if (place.usable && locations.length) {
    const normalizedPlace = normalizeText(place.value)
    const supplementalLocations = locationValues.filter(
      (location) => !normalizedPlace.includes(normalizeText(location)),
    )
    const bestLocationConfidence = Math.max(
      ...locations.map((location) => location.confidence),
    )
    let confidence =
      0.2 + place.confidence * 0.52 + bestLocationConfidence * 0.24
    const warnings = []

    if (place.categoryLike || entities.dishNames?.length) {
      confidence = Math.min(confidence, 0.74)
      warnings.push(
        'Place name is supported by dish or category text, so confidence is capped at medium.',
      )
    }

    return result({
      query: joinQuery([
        place.value,
        place.categoryLike ? components.dishNames.slice(0, 1) : [],
        supplementalLocations,
      ]),
      canResolveLocation: true,
      confidence,
      reason:
        place.categoryLike || entities.dishNames?.length
          ? 'Clean place name with dish or category evidence and a location hint.'
          : 'Clean place name with a district, city, ward, or landmark hint.',
      components,
      warnings,
    })
  }

  const warnings = []
  if (entityValue(entities.address)) {
    warnings.push(
      'Address evidence is incomplete or lacks a usable location hint.',
    )
  }
  if (place.reason === 'noisy_place_name') {
    warnings.push(
      'Long, repeated, price-heavy, or noisy text was rejected as a place name.',
    )
  }
  if (place.usable && !locations.length) {
    warnings.push('Place name needs a district, city, ward, or landmark hint.')
  }
  if (components.dishNames.length) {
    warnings.push('Dish text alone is not enough to resolve a real-world place.')
  }
  if (components.locationHints.length && !locations.length) {
    warnings.push('Only weak or unknown location text was found.')
  } else if (locations.length) {
    warnings.push('A location hint alone is not enough to identify a place.')
  }

  const weakConfidence = Math.min(
    0.49,
    Math.max(
      Number(entities.address?.confidence || 0) * 0.4,
      Number(entities.placeName?.confidence || 0) * 0.4,
      ...((entities.dishNames || []).map(
        (dish) => Number(dish?.confidence || 0) * 0.25,
      )),
      ...((entities.locationHints || []).map(
        (location) => Number(location?.confidence || 0) * 0.2,
      )),
      0,
    ),
  )

  return result({
    reason: 'Evidence is not strong enough to form a safe map search query.',
    confidence: weakConfidence,
    components,
    warnings,
  })
}

export function emptyFoodMapLocationQuery() {
  return result({
    reason: 'No location evidence was provided.',
    components: componentsFromEntities({}),
  })
}
