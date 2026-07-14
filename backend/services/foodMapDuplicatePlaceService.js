import pool from '../db.js'

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similarity(left, right) {
  const leftText = normalizeText(left)
  const rightText = normalizeText(right)
  if (!leftText || !rightText) return 0
  if (leftText === rightText) return 1
  if (leftText.includes(rightText) || rightText.includes(leftText)) return 0.9
  const leftTokens = new Set(leftText.split(' '))
  const rightTokens = new Set(rightText.split(' '))
  const union = new Set([...leftTokens, ...rightTokens])
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return union.size ? shared / union.size : 0
}

function normalizeAddressText(value) {
  return normalizeText(value)
    .replace(/\bp\b/gu, 'phuong')
    .replace(/\bq\b/gu, 'quan')
    .replace(/\btp\b/gu, 'thanh pho')
    .replace(/\btx\b/gu, 'thi xa')
    .replace(/\btt\b/gu, 'thi tran')
    .replace(/\s+/gu, ' ')
    .trim()
}

function addressSimilarity(left, right) {
  const leftText = normalizeAddressText(left)
  const rightText = normalizeAddressText(right)
  if (!leftText || !rightText) return 0
  if (leftText === rightText) return 1

  const leftTokens = new Set(leftText.split(' '))
  const rightTokens = new Set(rightText.split(' '))
  const union = new Set([...leftTokens, ...rightTokens])
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return union.size ? shared / union.size : 0
}

function distanceMeters(left, right) {
  if (
    !Number.isFinite(Number(left?.lat)) ||
    !Number.isFinite(Number(left?.lng)) ||
    !Number.isFinite(Number(right?.lat)) ||
    !Number.isFinite(Number(right?.lng))
  ) {
    return null
  }
  const toRadians = (value) => (Number(value) * Math.PI) / 180
  const earthRadius = 6_371_000
  const latitudeDelta = toRadians(Number(right.lat) - Number(left.lat))
  const longitudeDelta = toRadians(Number(right.lng) - Number(left.lng))
  const leftLatitude = toRadians(left.lat)
  const rightLatitude = toRadians(right.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine))
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function rowRecord(row, sourceType) {
  return {
    sourceType,
    sourceId: row.id,
    name: row.name,
    address: sourceType === 'restaurant' ? row.address : null,
    district: row.district,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
  }
}

function rowsFromResults(restaurants = [], foodSpots = []) {
  return [
    ...restaurants.map((row) => rowRecord(row, 'restaurant')),
    ...foodSpots.map((row) => rowRecord(row, 'food_spot')),
  ]
}

function houseNumberFromAddress(value) {
  return normalizeAddressText(value).match(/\b\d{1,6}(?:[/.\-]\d{1,6}){0,2}\b/u)?.[0] || null
}

function boundedLike(value, maxLength = 120) {
  const text = String(value || '').trim().slice(0, maxLength)
  return text ? `%${text}%` : null
}

async function loadEvidenceRows(entities = {}, database = pool) {
  const address = entities?.address?.value || entities?.formattedAddress || null
  const name = entities?.placeName?.value || entities?.name || null
  const houseNumber = houseNumberFromAddress(address)
  const nameLike = boundedLike(name, 120)
  const houseLike = boundedLike(houseNumber, 30)

  const restaurantClauses = []
  const restaurantParams = []
  if (houseLike) {
    restaurantClauses.push('address LIKE ?')
    restaurantParams.push(houseLike)
  }
  if (nameLike) {
    restaurantClauses.push('name LIKE ?')
    restaurantParams.push(nameLike)
  }
  const restaurantWhere = restaurantClauses.length
    ? `WHERE ${restaurantClauses.join(' OR ')}`
    : ''

  const restaurantPromise = database.execute(
    `SELECT id, name, address, district, latitude, longitude
     FROM restaurants
     ${restaurantWhere}
     LIMIT 250`,
    restaurantParams,
  )
  const foodSpotPromise = nameLike
    ? database.execute(
        `SELECT id, name, district, latitude, longitude
         FROM food_spots
         WHERE name LIKE ?
         LIMIT 100`,
        [nameLike],
      )
    : Promise.resolve([[]])

  const [[restaurants], [foodSpots]] = await Promise.all([
    restaurantPromise,
    foodSpotPromise,
  ])
  return rowsFromResults(restaurants, foodSpots)
}

async function loadProviderRows(resolvedLocation = {}, database = pool) {
  const nameLike = boundedLike(resolvedLocation?.name, 120)
  const lat = Number(resolvedLocation?.lat)
  const lng = Number(resolvedLocation?.lng)
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
  const latitudeDelta = 0.02
  const longitudeDelta = 0.02

  const clauses = []
  const params = []
  if (hasCoordinates) {
    clauses.push('(latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?)')
    params.push(
      lat - latitudeDelta,
      lat + latitudeDelta,
      lng - longitudeDelta,
      lng + longitudeDelta,
    )
  }
  if (nameLike) {
    clauses.push('name LIKE ?')
    params.push(nameLike)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' OR ')}` : ''

  const [[restaurants], [foodSpots]] = await Promise.all([
    database.execute(
      `SELECT id, name, address, district, latitude, longitude
       FROM restaurants
       ${where}
       LIMIT 250`,
      params,
    ),
    database.execute(
      `SELECT id, name, district, latitude, longitude
       FROM food_spots
       ${where}
       LIMIT 250`,
      params,
    ),
  ])
  return rowsFromResults(restaurants, foodSpots)
}

function scoreDuplicate(resolvedLocation, row) {
  const sameProviderPlaceId =
    resolvedLocation?.placeId &&
    row?.providerPlaceId &&
    String(resolvedLocation.placeId) === String(row.providerPlaceId)
  const nameScore = similarity(resolvedLocation?.name, row?.name)
  const addressScore = similarity(
    resolvedLocation?.formattedAddress,
    row?.address || row?.district,
  )
  const distance = distanceMeters(resolvedLocation, row)
  const close = distance !== null && distance <= 150
  const resolvedPhone = normalizePhone(resolvedLocation?.phone)
  const rowPhone = normalizePhone(row?.phone)
  const phoneMatch =
    Boolean(resolvedPhone) &&
    Boolean(rowPhone) &&
    resolvedPhone === rowPhone
  let confidence = nameScore * 0.58 + addressScore * 0.24
  const matchReasons = []
  if (sameProviderPlaceId) {
    confidence = 1
    matchReasons.push('same_provider_place_id')
  }
  if (phoneMatch) {
    confidence = Math.max(confidence, 0.92)
    matchReasons.push('phone_match')
  }
  if (close) {
    confidence += 0.28
    matchReasons.push('nearby_coordinates')
  }
  if (nameScore >= 0.78) matchReasons.push('name_similarity')
  if (addressScore >= 0.65) matchReasons.push('address_similarity')
  return {
    ...row,
    confidence: Math.round(Math.min(1, confidence) * 1000) / 1000,
    distanceMeters: distance === null ? null : Math.round(distance),
    matchReasons,
  }
}

export async function findDuplicateFoodMapPlace(
  resolvedLocation,
  {
    rows = null,
    database = pool,
  } = {},
) {
  if (!resolvedLocation?.name && !resolvedLocation?.formattedAddress) {
    return { match: null, candidates: [] }
  }
  const candidates = (rows || (await loadProviderRows(resolvedLocation, database)))
    .map((row) => scoreDuplicate(resolvedLocation, row))
    .filter((row) => row.confidence >= 0.45)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
  return {
    match: candidates[0]?.confidence >= 0.82 ? candidates[0] : null,
    candidates,
  }
}

function evidenceDuplicateScore(entities = {}, row = {}) {
  const address = entities?.address?.value || entities?.formattedAddress || null
  const name = entities?.placeName?.value || entities?.name || null
  const addressScore = addressSimilarity(address, row?.address || row?.district)
  const nameScore = similarity(name, row?.name)
  let confidence = 0
  const matchReasons = []

  // Address-only matching is intentionally strict. It is used to focus an
  // existing Food Map marker before any external place provider is required.
  if (addressScore >= 0.98) {
    confidence = 0.94
    matchReasons.push('exact_normalized_address')
  } else if (addressScore >= 0.9) {
    confidence = 0.88
    matchReasons.push('strong_address_similarity')
  } else if (addressScore >= 0.8 && nameScore >= 0.78) {
    confidence = 0.86
    matchReasons.push('name_and_address_similarity')
  }

  if (nameScore >= 0.9 && addressScore >= 0.72) {
    confidence = Math.max(confidence, 0.87)
    matchReasons.push('strong_name_with_address_support')
  }

  return {
    ...row,
    confidence: Math.round(Math.min(1, confidence) * 1000) / 1000,
    addressScore: Math.round(addressScore * 1000) / 1000,
    nameScore: Math.round(nameScore * 1000) / 1000,
    distanceMeters: null,
    matchReasons,
  }
}

export async function findDuplicateFoodMapPlaceFromEvidence(
  entities,
  { rows = null, database = pool } = {},
) {
  const address = entities?.address?.value || entities?.formattedAddress || null
  const name = entities?.placeName?.value || entities?.name || null
  if (!address && !name) return { match: null, candidates: [] }

  const candidates = (rows || (await loadEvidenceRows(entities, database)))
    .map((row) => evidenceDuplicateScore(entities, row))
    .filter((row) => row.confidence >= 0.8)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
  return {
    match: candidates[0]?.confidence >= 0.86 ? candidates[0] : null,
    candidates,
  }
}

export {
  scoreDuplicate as scoreDuplicateFoodMapPlace,
  evidenceDuplicateScore as scoreDuplicateFoodMapPlaceFromEvidence,
}
