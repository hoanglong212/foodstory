import pool from '../db.js'

const STRONG_MATCH_THRESHOLD = 0.82
const PARTIAL_MATCH_THRESHOLD = 0.58
const CLOSE_COORDINATE_METERS = 120

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

export function normalizeDiscoveryText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value) {
  return normalizeDiscoveryText(value).split(' ').filter(Boolean)
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(tokens(left))
  const rightTokens = new Set(tokens(right))
  if (!leftTokens.size || !rightTokens.size) return 0

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return (2 * shared) / (leftTokens.size + rightTokens.size)
}

function textAgreement(left, right) {
  const normalizedLeft = normalizeDiscoveryText(left)
  const normalizedRight = normalizeDiscoveryText(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.9
  }
  return tokenOverlap(normalizedLeft, normalizedRight)
}

function sameText(left, right) {
  const normalizedLeft = normalizeDiscoveryText(left)
  const normalizedRight = normalizeDiscoveryText(right)
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.includes(normalizedRight) ||
        normalizedRight.includes(normalizedLeft)),
  )
}

function validCoordinate(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
}

function coordinateDistanceMeters(left, right) {
  if (
    !validCoordinate(left?.latitude) ||
    !validCoordinate(left?.longitude) ||
    !validCoordinate(right?.latitude) ||
    !validCoordinate(right?.longitude)
  ) {
    return null
  }

  const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180
  const earthRadius = 6_371_000
  const latitudeDelta = toRadians(
    Number(right.latitude) - Number(left.latitude),
  )
  const longitudeDelta = toRadians(
    Number(right.longitude) - Number(left.longitude),
  )
  const leftLatitude = toRadians(left.latitude)
  const rightLatitude = toRadians(right.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine))
}

function matchLevel(confidence) {
  if (confidence >= STRONG_MATCH_THRESHOLD) return 'strong'
  if (confidence >= PARTIAL_MATCH_THRESHOLD) return 'partial'
  return 'weak'
}

async function loadFoodMapRows() {
  const [[restaurants], [foodSpots]] = await Promise.all([
    pool.execute(
      `SELECT id, name, category, district, address, latitude, longitude
       FROM restaurants`,
    ),
    pool.execute(
      `SELECT id, name, dish_name, category, district, latitude, longitude
       FROM food_spots`,
    ),
  ])

  return [
    ...restaurants.map((restaurant) => ({
      sourceType: 'restaurant',
      sourceId: restaurant.id,
      name: restaurant.name,
      dishName: null,
      category: restaurant.category,
      district: restaurant.district,
      address: restaurant.address,
      latitude: Number(restaurant.latitude),
      longitude: Number(restaurant.longitude),
    })),
    ...foodSpots.map((spot) => ({
      sourceType: 'food_spot',
      sourceId: spot.id,
      name: spot.name,
      dishName: spot.dish_name,
      category: spot.category,
      district: spot.district,
      address: null,
      latitude: Number(spot.latitude),
      longitude: Number(spot.longitude),
    })),
  ]
}

export function scoreFoodMapCandidate(externalPlace, row) {
  const normalizedExternalName = normalizeDiscoveryText(externalPlace?.name)
  const normalizedRowName = normalizeDiscoveryText(row?.name)
  if (!normalizedExternalName || !normalizedRowName) return null

  const exactName = normalizedExternalName === normalizedRowName
  const nameOverlap = tokenOverlap(normalizedExternalName, normalizedRowName)
  const partialName =
    tokens(normalizedExternalName).length >= 2 &&
    (normalizedExternalName.includes(normalizedRowName) ||
      normalizedRowName.includes(normalizedExternalName))
  const districtMatch = sameText(externalPlace?.district, row?.district)
  const categoryMatch =
    sameText(externalPlace?.category, row?.category) ||
    sameText(externalPlace?.dishName, row?.dishName) ||
    sameText(externalPlace?.dishName, row?.category)
  const addressScore = textAgreement(externalPlace?.address, row?.address)
  const distanceMeters = coordinateDistanceMeters(externalPlace, row)
  const closeCoordinates =
    distanceMeters !== null && distanceMeters <= CLOSE_COORDINATE_METERS

  let confidence = 0
  const evidence = []

  if (exactName) {
    confidence = 0.96
    evidence.push('exact_name')
  } else if (nameOverlap >= 0.78 && districtMatch) {
    confidence = 0.88
    evidence.push('high_name_overlap', 'same_district')
  } else if (nameOverlap >= 0.88) {
    confidence = 0.7
    evidence.push('high_name_overlap')
  } else if (partialName || nameOverlap >= 0.55) {
    confidence = 0.52 + Math.min(0.12, nameOverlap * 0.12)
    evidence.push(partialName ? 'partial_name' : 'name_overlap')
  }

  if (confidence > 0 && addressScore >= 0.8) {
    confidence = Math.max(confidence, 0.9)
    evidence.push('same_address')
  }
  if (confidence > 0 && closeCoordinates) {
    confidence = Math.max(confidence, 0.9)
    evidence.push('nearby_coordinates')
  }
  if (confidence > 0 && districtMatch) {
    confidence += 0.04
    if (!evidence.includes('same_district')) evidence.push('same_district')
  }
  if (confidence > 0 && categoryMatch) {
    confidence += 0.04
    evidence.push('same_category')
  }

  confidence = Math.min(1, confidence)
  if (confidence < 0.4) return null

  return {
    ...row,
    confidence: roundScore(confidence),
    matchLevel: matchLevel(confidence),
    evidence,
    distanceMeters:
      distanceMeters === null ? null : Math.round(distanceMeters),
  }
}

export async function findFoodMapMatch(
  externalPlace,
  { rows = null, limit = 5 } = {},
) {
  if (!normalizeDiscoveryText(externalPlace?.name)) {
    return { match: null, candidates: [] }
  }

  const foodMapRows = rows || (await loadFoodMapRows())
  const candidates = foodMapRows
    .map((row) => scoreFoodMapCandidate(externalPlace, row))
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, limit)
  const match =
    candidates[0]?.matchLevel === 'strong' ? candidates[0] : null

  return { match, candidates }
}

// Retained for compatibility with Phase 1 callers.
export async function searchFoodMapPlaces({
  placeName,
  category = '',
  district = '',
  limit = 5,
}) {
  const result = await findFoodMapMatch(
    { name: placeName, category, district },
    { limit },
  )
  return result.candidates
}

export function selectExistingFoodMapMatch(candidates = []) {
  return candidates.find((candidate) => candidate.matchLevel === 'strong') || null
}

export const FOOD_MAP_STRONG_MATCH_THRESHOLD = STRONG_MATCH_THRESHOLD
