import {
  findDuplicateFoodMapPlace,
  findDuplicateFoodMapPlaceFromEvidence,
} from '../foodMapDuplicatePlaceService.js'
import { resolveGeoapifyPlace } from './providers/geoapifyPlaceProvider.js'

function text(value, max = 320) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function coordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function localPlace(candidate = {}, hypothesis = {}) {
  candidate = candidate || {}
  const sourceType = text(candidate.sourceType, 40)
  const sourceId = candidate.sourceId ?? null
  const name = text(candidate.name, 180)
  const formattedAddress = text(candidate.address || candidate.district, 320)
  if (!sourceType || sourceId === null || !name || !formattedAddress) return null
  return {
    sourceType: 'foodstory',
    sourceId: String(sourceId),
    id: `foodstory:${sourceType}:${sourceId}`,
    localSourceType: sourceType,
    name,
    formattedAddress,
    lat: coordinate(candidate.lat),
    lng: coordinate(candidate.lng),
    category: text(candidate.category, 100) || null,
    image: text(candidate.image, 1000) || null,
    rating: Number.isFinite(Number(candidate.rating)) ? Number(candidate.rating) : null,
    existsInFoodStory: true,
    confidence: Number(candidate.confidence || hypothesis.confidence || 0),
    matchReasons: Array.isArray(candidate.matchReasons) ? candidate.matchReasons.slice(0, 4) : [],
  }
}

function externalPlace(candidate = {}) {
  candidate = candidate || {}
  const providerPlaceId = text(candidate.providerPlaceId || candidate.placeId, 255)
  const name = text(candidate.name, 180)
  const formattedAddress = text(candidate.formattedAddress, 320)
  const lat = coordinate(candidate.lat)
  const lng = coordinate(candidate.lng)
  if (!providerPlaceId || !name || !formattedAddress || lat === null || lng === null) return null
  return {
    sourceType: 'external',
    provider: 'geoapify',
    providerPlaceId,
    id: `geoapify:${providerPlaceId}`,
    name,
    formattedAddress,
    lat,
    lng,
    categories: Array.isArray(candidate.categories) ? candidate.categories.slice(0, 8) : [],
    existsInFoodStory: false,
    confidence: Number(candidate.confidence || 0),
    matchReasons: Array.isArray(candidate.matchReasons) ? candidate.matchReasons.slice(0, 4) : [],
  }
}

function hypothesisEntities(hypothesis = {}) {
  return {
    address: { value: hypothesis.address || null, confidence: hypothesis.confidence || 0 },
    placeName: { value: hypothesis.placeName || null, confidence: hypothesis.confidence || 0 },
    locationHints: [hypothesis.locality, hypothesis.ward, hypothesis.district, hypothesis.city].filter(Boolean).map((value) => ({ value })),
  }
}

function uniquePlaces(values = []) {
  const seen = new Set()
  return values.filter(Boolean).filter((place) => {
    if (seen.has(place.id)) return false
    seen.add(place.id)
    return true
  }).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)).slice(0, 8)
}

/**
 * The resolver boundary. Internal hypotheses are first matched against
 * FoodStory, then (only when configured) against Geoapify. The public caller
 * receives place records only; no evidence or OCR-shaped candidate survives.
 */
export async function resolveVisionLocationHypotheses(
  { hypotheses = [], config = {}, signal } = {},
  {
    findLocalMatch = findDuplicateFoodMapPlaceFromEvidence,
    findExternalDuplicate = findDuplicateFoodMapPlace,
    resolveExternal = resolveGeoapifyPlace,
    providerOptions = {},
  } = {},
) {
  const places = []
  const warnings = []
  let providerUnavailable = false
  for (const hypothesis of (Array.isArray(hypotheses) ? hypotheses : []).slice(0, 6)) {
    if (signal?.aborted) throw Object.assign(new Error('Vision Auto aborted'), { name: 'AbortError' })
    const entities = hypothesisEntities(hypothesis)
    if (config.localResolverEnabled !== false) {
      try {
        const local = await findLocalMatch(entities)
        const record = localPlace(local?.match, hypothesis)
        if (record) {
          places.push(record)
          continue
        }
      } catch {
        warnings.push('local_resolver_unavailable')
      }
    }

    if (!config.externalResolverEnabled || config.externalProvider !== 'geoapify') {
      providerUnavailable = true
      continue
    }
    try {
      const external = await resolveExternal(hypothesis, { config, signal, ...providerOptions })
      for (const rawCandidate of external?.candidates || []) {
        const externalRecord = externalPlace(rawCandidate)
        if (!externalRecord) continue
        const duplicate = await findExternalDuplicate(externalRecord)
        const existing = localPlace(duplicate?.match, hypothesis)
        places.push(existing || externalRecord)
      }
    } catch (error) {
      providerUnavailable = true
      if (error?.name === 'AbortError') throw error
      warnings.push(error?.code === 'provider_timeout' ? 'provider_timeout' : 'provider_unavailable')
    }
  }
  const placeCandidates = uniquePlaces(places)
  return {
    placeCandidates,
    resolution: {
      status: placeCandidates.length ? 'resolved_places' : 'not_found',
      reason: placeCandidates.length ? 'resolver_returned_real_place_records' : providerUnavailable ? 'provider_unavailable' : 'no_resolver_match',
    },
    warnings: [...new Set(warnings)].slice(0, 8),
  }
}

// Kept for callers which may still import the old function. It cannot route
// to Google Places; Vision Auto's only external provider is Geoapify.
export async function resolveVisionPlaceCandidates({ entities = {}, config = {}, signal } = {}, options = {}) {
  const hypotheses = [{
    address: entities?.address?.value || null,
    placeName: entities?.placeName?.value || null,
    locality: Array.isArray(entities?.locationHints) ? entities.locationHints[0]?.value : null,
    confidence: Math.max(Number(entities?.address?.confidence || 0), Number(entities?.placeName?.confidence || 0)),
  }]
  const result = await resolveVisionLocationHypotheses({ hypotheses, config, signal }, options)
  return { placeCandidates: result.placeCandidates, resolution: result.resolution, warnings: result.warnings }
}
