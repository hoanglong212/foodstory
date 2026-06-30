function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function entityValue(entity) {
  return typeof entity?.value === 'string' ? entity.value.trim() : ''
}

function strongDraftEvidence(input, entities = {}) {
  const addressStrong =
    entityValue(entities.address) &&
    Number(entities.address.confidence || 0) >= 0.62
  const placeStrong =
    entityValue(entities.placeName) &&
    Number(entities.placeName.confidence || 0) >= 0.62
  const uploadedPlace =
    input?.type === 'uploaded_image' &&
    entities.placeName?.source === 'ocr'
  const placeContext = Boolean(
    addressStrong ||
      (entities.phones || []).some(
        (item) => Number(item?.confidence || 0) >= 0.72,
      ),
  )
  return Boolean(addressStrong || (placeStrong && (uploadedPlace || placeContext)))
}

function entityConfidence(entities = {}) {
  return roundScore(
    Math.max(
      Number(entities.address?.confidence || 0),
      Number(entities.placeName?.confidence || 0),
      ...(entities.phones || []).map((item) => Number(item?.confidence || 0)),
      0,
    ),
  )
}

function multiAddressCandidates(entities = {}) {
  return (Array.isArray(entities.addressCandidates)
    ? entities.addressCandidates
    : []
  )
    .filter(
      (candidate) =>
        candidate?.address &&
        Number.isFinite(Number(candidate?.timestampSeconds)),
    )
    .slice(0, 8)
}

function draftFrom({ input, entities, candidate = null, confidence }) {
  return {
    name: candidate?.name || entityValue(entities.placeName) || null,
    address:
      candidate?.formattedAddress || entityValue(entities.address) || null,
    phone:
      candidate?.phone ||
      (entities.phones || []).find((item) => item?.value)?.value ||
      null,
    dishNames: (entities.dishNames || [])
      .map((item) => item?.value)
      .filter(Boolean)
      .slice(0, 8),
    locationHints: (entities.locationHints || [])
      .map((item) => item?.value)
      .filter(Boolean)
      .slice(0, 8),
    sourceUrl: input?.url || null,
    confidence,
  }
}

export function decideVisionAutoResult({
  input,
  entities = {},
  resolution = {},
  placeCandidates = [],
} = {}) {
  const candidates = Array.isArray(placeCandidates) ? placeCandidates : []
  const bestCandidate = resolution?.resolvedLocation || candidates[0] || null
  const addressCandidates = multiAddressCandidates(entities)

  if (addressCandidates.length >= 2) {
    return {
      status: 'multi_candidate',
      confidence: roundScore(
        Math.max(
          ...addressCandidates.map((item) => Number(item?.confidence || 0)),
          0,
        ),
      ),
      candidates: addressCandidates,
      bestResult: null,
      addPlaceDraft: null,
      reviewRequired: true,
      reason: 'multiple_distinct_frame_addresses_detected',
    }
  }

  if (
    resolution?.status === 'resolved' &&
    bestCandidate &&
    Number(bestCandidate.confidence || resolution.confidence || 0) >= 0.5
  ) {
    return {
      status: 'matched_place',
      confidence: roundScore(
        bestCandidate.confidence || resolution.confidence,
      ),
      bestResult: bestCandidate,
      addPlaceDraft: null,
      reason: 'A strong provider candidate matched the validated evidence.',
    }
  }

  if (resolution?.status === 'multiple_candidates' && bestCandidate) {
    if (!strongDraftEvidence(input, entities)) {
      return {
        status: 'unresolved_best_effort',
        confidence: entityConfidence(entities),
        bestResult: null,
        addPlaceDraft: null,
        reason: 'insufficient_strong_place_evidence',
      }
    }
    const confidence = roundScore(
      Math.max(
        Number(bestCandidate.confidence || 0),
        entityConfidence(entities),
      ),
    )
    return {
      status: 'draft_candidate',
      confidence,
      bestResult: bestCandidate,
      addPlaceDraft: draftFrom({
        input,
        entities,
        candidate: bestCandidate,
        confidence,
      }),
      reason:
        'Several plausible places remain, so the best candidate is review-only.',
    }
  }

  if (resolution?.status === 'not_found') {
    return {
      status: 'unresolved_best_effort',
      confidence: entityConfidence(entities),
      bestResult: null,
      addPlaceDraft: null,
      reason: 'insufficient_strong_place_evidence',
    }
  }

  if (strongDraftEvidence(input, entities)) {
    const confidence = entityConfidence(entities)
    const frameAddressOrContact =
      entities.address?.source === 'youtube_frame_ocr' ||
      entities.address?.source === 'gemini_ocr_repair' ||
      entities.address?.source === 'gemini_ocr_candidate_extraction' ||
      (entities.phones || []).some(
        (item) =>
          item?.source === 'youtube_frame_ocr' ||
          item?.source === 'gemini_ocr_candidate_extraction',
      )
    return {
      status: 'draft_candidate',
      confidence,
      bestResult: null,
      addPlaceDraft: draftFrom({
        input,
        entities,
        confidence,
      }),
      reason: frameAddressOrContact
        ? 'clear_address_or_contact_from_youtube_frame'
        : 'Strong local evidence supports a review-only draft, but no place match was forced.',
    }
  }

  return {
    status: 'unresolved_best_effort',
    confidence: entityConfidence(entities),
    bestResult: null,
    addPlaceDraft: null,
    reason: 'insufficient_strong_place_evidence',
  }
}
