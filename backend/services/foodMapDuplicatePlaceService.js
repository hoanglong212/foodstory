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

async function loadRows(database = pool) {
  const [[restaurants], [foodSpots]] = await Promise.all([
    database.execute(
      `SELECT id, name, address, district, latitude, longitude
       FROM restaurants`,
    ),
    database.execute(
      `SELECT id, name, district, latitude, longitude
       FROM food_spots`,
    ),
  ])
  return [
    ...restaurants.map((row) => ({
      sourceType: 'restaurant',
      sourceId: row.id,
      name: row.name,
      address: row.address,
      district: row.district,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    })),
    ...foodSpots.map((row) => ({
      sourceType: 'food_spot',
      sourceId: row.id,
      name: row.name,
      address: null,
      district: row.district,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    })),
  ]
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
  if (!resolvedLocation?.name) return { match: null, candidates: [] }
  const candidates = (rows || (await loadRows(database)))
    .map((row) => scoreDuplicate(resolvedLocation, row))
    .filter((row) => row.confidence >= 0.45)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
  return {
    match: candidates[0]?.confidence >= 0.82 ? candidates[0] : null,
    candidates,
  }
}

export { scoreDuplicate as scoreDuplicateFoodMapPlace }
