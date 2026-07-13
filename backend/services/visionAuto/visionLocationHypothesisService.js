const MEASUREMENT_PATTERN = /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:g|gr|kg|ml|l|muong|muỗng|thia|thìa|phut|phút|gio|giờ|do|độ|cm|mm)\b/iu
const RECIPE_CONTEXT_PATTERN = /\b(?:hat\s+nem|hạt\s+nêm|nuoc\s+mam|nước\s+mắm|nguyen\s+lieu|nguyên\s+liệu|cach\s+lam|cách\s+làm|lam\s+banh|làm\s+bánh)\b/iu

function text(value, maximumLength = 320) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength)
}

export function normalizeVisionLocationText(value) {
  return text(value, 500)
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizedTokens(value) {
  return normalizeVisionLocationText(value).split(' ').filter(Boolean)
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizedTokens(left))
  const rightTokens = new Set(normalizedTokens(right))
  if (!leftTokens.size || !rightTokens.size) return 0
  let shared = 0
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1
  return shared / new Set([...leftTokens, ...rightTokens]).size
}

function addressParts(value) {
  const original = text(value)
  const normalized = normalizeVisionLocationText(original)
  const withoutHouse = normalized
    .replace(/^(?:so\s*)?\d{1,6}(?:[a-z]|[/-]\d{1,6}[a-z]?)?\s*/u, '')
    .trim()
  const ward = withoutHouse.match(/\b(?:phuong|p|ward)\s*([a-z0-9]{1,24})\b/u)?.[1] || null
  const district = withoutHouse.match(/\b(?:quan|q|district)\s*([a-z0-9]{1,24})\b/u)?.[1] || null
  const city = withoutHouse.match(/\b(?:thanh pho|tp|city|tinh|province)\s*([a-z0-9]{2,40})\b/u)?.[1] || null
  const stop = withoutHouse.search(/\b(?:phuong|p|ward|quan|q|district|thanh pho|tp|city|tinh|province)\b/u)
  const street = (stop >= 0 ? withoutHouse.slice(0, stop) : withoutHouse)
    .replace(/\b(?:duong|street|road|hem|ngo)\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return { original, normalized, street, ward, district, city }
}

function observationFrom(value = {}) {
  const address = text(
    value.address || value.addressFragment || value.formattedAddress || '',
  )
  const placeName = text(value.placeName || value.name || '')
  const locality = text(value.locality || value.locationHint || '')
  const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0))
  const timestampSeconds = Number.isFinite(Number(value.timestampSeconds))
    ? Number(value.timestampSeconds)
    : null
  return {
    address,
    placeName,
    locality,
    confidence,
    timestampSeconds,
    segmentId: text(value.segmentId, 80) || null,
    episodeId: text(value.episodeId, 80) || null,
    source: text(value.source, 80) || null,
    evidenceSource: text(value.evidenceSource || value.source, 80) || null,
  }
}

export function isRecipeMeasurementObservation(observation = {}) {
  const value = `${observation?.address || ''} ${observation?.placeName || ''}`
  return MEASUREMENT_PATTERN.test(value) || RECIPE_CONTEXT_PATTERN.test(value)
}

function meaningfulObservation(observation) {
  if (!observation || isRecipeMeasurementObservation(observation)) return false
  if (observation.address) return addressParts(observation.address).street.split(' ').length >= 2
  return Boolean(
    observation.placeName &&
      (observation.locality || normalizedTokens(observation.placeName).length >= 2),
  )
}

function administrativeCompatibility(left, right) {
  const leftParts = addressParts(left.address || left.locality)
  const rightParts = addressParts(right.address || right.locality)
  const sameWard = leftParts.ward && rightParts.ward && leftParts.ward === rightParts.ward
  const sameDistrict = leftParts.district && rightParts.district && leftParts.district === rightParts.district
  const districtConflict = leftParts.district && rightParts.district && leftParts.district !== rightParts.district
  const cityConflict = leftParts.city && rightParts.city && leftParts.city !== rightParts.city
  if (cityConflict) return false
  if (districtConflict && !sameWard) return false
  return true
}

function temporalCompatibility(left, right, sourceMayContainMultiplePlaces) {
  if (
    sourceMayContainMultiplePlaces &&
    left.segmentId &&
    right.segmentId &&
    left.segmentId !== right.segmentId
  ) {
    return false
  }
  if (left.segmentId && right.segmentId && left.segmentId === right.segmentId) return true
  if (left.episodeId && right.episodeId && left.episodeId === right.episodeId) return true
  if (left.timestampSeconds !== null && right.timestampSeconds !== null) {
    return Math.abs(left.timestampSeconds - right.timestampSeconds) <= 14
  }
  return !sourceMayContainMultiplePlaces
}

function streetCompatibility(left, right) {
  const leftStreet = addressParts(left.address).street
  const rightStreet = addressParts(right.address).street
  if (!leftStreet || !rightStreet) return Boolean(left.placeName && right.placeName && tokenSimilarity(left.placeName, right.placeName) >= 0.75)
  if (leftStreet === rightStreet) return true
  const similarity = tokenSimilarity(leftStreet, rightStreet)
  const leftTokens = normalizedTokens(leftStreet)
  const rightTokens = normalizedTokens(rightStreet)
  const sharedPrefix = leftTokens.length >= 2 && rightTokens.length >= 2 && leftTokens[0] === rightTokens[0]
  return similarity >= 0.6 || (sharedPrefix && similarity >= 0.45)
}

function compatiblePlaceNames(left, right) {
  if (!left.placeName || !right.placeName) return true
  return tokenSimilarity(left.placeName, right.placeName) >= 0.55
}

export function sameVisionLocationHypothesis(left, right, { sourceMayContainMultiplePlaces = false } = {}) {
  if (!left || !right) return false
  const sameAddress = left.address && right.address && normalizeVisionLocationText(left.address) === normalizeVisionLocationText(right.address)
  if (
    sourceMayContainMultiplePlaces &&
    left.segmentId &&
    right.segmentId &&
    left.segmentId !== right.segmentId
  ) return false
  if (sameAddress) return true
  return (
    streetCompatibility(left, right) &&
    compatiblePlaceNames(left, right) &&
    administrativeCompatibility(left, right) &&
    temporalCompatibility(left, right, sourceMayContainMultiplePlaces)
  )
}

function representative(observations) {
  return [...observations].sort((left, right) => {
    const leftParts = addressParts(left.address)
    const rightParts = addressParts(right.address)
    const leftCompleteness = Number(Boolean(leftParts.ward)) + Number(Boolean(leftParts.district)) + Number(Boolean(leftParts.city))
    const rightCompleteness = Number(Boolean(rightParts.ward)) + Number(Boolean(rightParts.district)) + Number(Boolean(rightParts.city))
    return right.confidence - left.confidence || rightCompleteness - leftCompleteness || right.address.length - left.address.length
  })[0]
}

export function buildVisionLocationHypotheses(observations = [], { sourceMayContainMultiplePlaces = false } = {}) {
  const clusters = []
  for (const source of Array.isArray(observations) ? observations : []) {
    const observation = observationFrom(source)
    if (!meaningfulObservation(observation)) continue
    const cluster = clusters.find((candidate) => candidate.observations.some((member) => sameVisionLocationHypothesis(member, observation, { sourceMayContainMultiplePlaces })))
    if (cluster) cluster.observations.push(observation)
    else clusters.push({ observations: [observation] })
  }

  return clusters.map((cluster, index) => {
    const selected = representative(cluster.observations)
    const parts = addressParts(selected.address || selected.locality)
    return {
      id: `hypothesis-${index + 1}`,
      address: selected.address || null,
      placeName: selected.placeName || null,
      locality: selected.locality || null,
      confidence: Math.round(Math.max(...cluster.observations.map((item) => item.confidence), 0) * 1000) / 1000,
      source: selected.source || null,
      segmentId: selected.segmentId || null,
      episodeId: selected.episodeId || null,
      timestampSeconds: selected.timestampSeconds,
      streetCore: parts.street || null,
      ward: parts.ward || null,
      district: parts.district || null,
      city: parts.city || null,
      observationCount: cluster.observations.length,
      sources: [...new Set(cluster.observations.map((item) => item.evidenceSource).filter(Boolean))].slice(0, 4),
    }
  })
}

export function buildVisionLocationHypothesesFromEntities(entities = {}, options = {}) {
  const candidates = Array.isArray(entities.addressCandidates) ? entities.addressCandidates : []
  const observations = candidates.length
    ? candidates
    : [{
        address: entities?.address?.value || null,
        placeName: entities?.placeName?.value || null,
        locality: Array.isArray(entities?.locationHints) ? entities.locationHints[0]?.value : null,
        confidence: Math.max(Number(entities?.address?.confidence || 0), Number(entities?.placeName?.confidence || 0)),
        source: entities?.address?.source || entities?.placeName?.source || null,
      }]
  return buildVisionLocationHypotheses(observations, options)
}
