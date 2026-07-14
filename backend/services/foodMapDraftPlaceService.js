import pool from '../db.js'
import {
  findDuplicateFoodMapPlace,
} from './foodMapDuplicatePlaceService.js'

const MIN_DRAFT_CONFIDENCE = 0.68

function jsonValue(value, maximumLength = 12_000) {
  try {
    const json = JSON.stringify(value ?? null)
    return json.length <= maximumLength
      ? json
      : JSON.stringify({ truncated: true })
  } catch {
    return JSON.stringify({ serializationFailed: true })
  }
}

export async function createFoodMapDraftPlace(
  {
    userId = null,
    sourceType,
    sourceUrl = null,
    sourceImageUrl = null,
    resolvedLocation,
    entities,
    confidence,
    evidence,
  },
  { database = pool } = {},
) {
  const dishes = (entities?.dishNames || [])
    .map((dish) => dish?.value)
    .filter(Boolean)
    .slice(0, 8)
  const phone = entities?.phones?.[0]?.normalized ||
    entities?.phones?.[0]?.value ||
    resolvedLocation?.phone ||
    null
  const [result] = await database.execute(
    `INSERT INTO draft_places (
       user_id, source_type, source_url, source_image_url,
       suggested_name, suggested_address, suggested_phone,
       suggested_dishes, lat, lng, provider_place_id, provider,
       confidence, evidence, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      userId,
      sourceType,
      sourceUrl,
      sourceImageUrl,
      resolvedLocation?.name || entities?.placeName?.value || null,
      resolvedLocation?.formattedAddress || entities?.address?.value || null,
      phone,
      jsonValue(dishes),
      resolvedLocation?.lat ?? null,
      resolvedLocation?.lng ?? null,
      resolvedLocation?.placeId || null,
      resolvedLocation?.source || null,
      confidence,
      jsonValue(evidence),
    ],
  )
  return {
    id: result.insertId,
    status: 'pending',
    suggestedName:
      resolvedLocation?.name || entities?.placeName?.value || null,
    suggestedAddress:
      resolvedLocation?.formattedAddress || entities?.address?.value || null,
    suggestedPhone: phone,
    suggestedDishes: dishes,
    lat: resolvedLocation?.lat ?? null,
    lng: resolvedLocation?.lng ?? null,
    providerPlaceId: resolvedLocation?.placeId || null,
    provider: resolvedLocation?.source || null,
    confidence,
  }
}

export async function integrateResolvedFoodMapPlace(
  {
    locationResolution,
    entities,
    locationQuery,
    sourceType = 'unknown',
    sourceUrl = null,
    sourceImageUrl = null,
    userId = null,
  } = {},
  {
    findDuplicate = findDuplicateFoodMapPlace,
    createDraft = createFoodMapDraftPlace,
    minimumDraftConfidence = MIN_DRAFT_CONFIDENCE,
  } = {},
) {
  if (
    locationResolution?.status !== 'resolved' ||
    !locationResolution?.resolvedLocation
  ) {
    return {
      action: 'none',
      matchedPlace: null,
      draftPlace: null,
      reason: 'location_not_resolved',
    }
  }
  const confidence = Math.min(
    Number(locationResolution.confidence || 0),
    Number(locationQuery?.confidence || 0),
  )
  if (confidence < minimumDraftConfidence) {
    return {
      action: 'none',
      matchedPlace: null,
      draftPlace: null,
      reason: 'confidence_too_low_for_draft',
    }
  }

  const duplicate = await findDuplicate(
    locationResolution.resolvedLocation,
  )
  if (duplicate?.match) {
    return {
      action: 'focus_existing_place',
      matchedPlace: duplicate.match,
      draftPlace: null,
      reason: 'existing_food_map_place_matched',
    }
  }

  const draftPlace = await createDraft({
    userId,
    sourceType,
    sourceUrl,
    sourceImageUrl,
    resolvedLocation: locationResolution.resolvedLocation,
    entities,
    confidence,
    evidence: {
      entities,
      locationQuery,
      locationResolution: {
        status: locationResolution.status,
        confidence: locationResolution.confidence,
        resolvedLocation: locationResolution.resolvedLocation,
      },
    },
  })
  return {
    action: 'review_draft_place',
    matchedPlace: null,
    draftPlace,
    reason: 'draft_created_for_user_review',
  }
}

export { MIN_DRAFT_CONFIDENCE }
