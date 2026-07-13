import {
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { scoreShortsTrack2V3AddressLikelihood } from './shortsTrack2V3TesseractOcrScoringService.js'

export const SHORTS_TRACK2_V3_LATE_RESCUE_REASONS = Object.freeze({
  SUFFICIENT: 'RESCUE_SUFFICIENT',
  PARTIAL: 'RESCUE_INSUFFICIENT_PARTIAL',
  PLACE_ONLY: 'RESCUE_INSUFFICIENT_PLACE_ONLY',
  CONTEXT_NUMBER: 'RESCUE_INSUFFICIENT_CONTEXT_NUMBER',
  CONFLICT: 'RESCUE_INSUFFICIENT_CONFLICT',
  STRUCTURE: 'RESCUE_INSUFFICIENT_STRUCTURE',
  MULTI_PLACE_METADATA: 'RESCUE_INSUFFICIENT_MULTI_PLACE_METADATA',
  NO_REVIEW_EVIDENCE: 'NO_REVIEW_EVIDENCE',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function candidateText(candidate = {}) {
  return normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || candidate.placeName || '',
  ).slice(0, 8000)
}

function hasNamedStreetAfterNumber(text = '') {
  const folded = foldVietnameseText(text)
  return /(?:^|[\s,.:;])\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?\s+[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){1,5}(?:\s*,?\s*(?:phuong|p\.?|quan|q\.?|district|ward|tp\.?|thanh pho|huyen|xa)\b)/iu
    .test(folded)
}

function structuralProfile(candidate = {}) {
  const text = candidateText(candidate)
  const folded = foldVietnameseText(text)
  const tokens = detectShortsTrack2V3EvidenceTokens(text)
  const likelihood = scoreShortsTrack2V3AddressLikelihood(text)
  const features = likelihood.features || {}
  const hasWard = Boolean(
    features.hasWard || tokens.hasWard ||
    /\b(?:phuong|p\.?|ward)\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded)
  )
  const hasDistrict = Boolean(
    features.hasDistrict || tokens.hasDistrict ||
    /\b(?:quan|q\.?|district)\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded)
  )
  const hasAdmin = Boolean(
    hasWard || hasDistrict ||
    /\b(?:tp\.?|thanh pho|ho chi minh|hcm|sai gon|ha noi|huyen|xa)\b/iu.test(folded)
  )
  const hasExplicitStreetMarker = Boolean(
    features.hasExplicitStreetMarker || tokens.hasStreetLike ||
    /(?:^|[\s,.:;])(?:duong|d\.|street|st\.?|road|rd\.|hem|ngo|ngach)\b/iu.test(folded)
  )
  const hasStreet = Boolean(
    hasExplicitStreetMarker || features.hasStreetLike || hasNamedStreetAfterNumber(text)
  )
  const hasHouseNumber = Boolean(
    asArray(candidate.houseNumberAlternatives).length ||
    candidate.houseNumberToken ||
    tokens.hasHouseNumber ||
    features.hasHouseNumber
  )
  const commaSeparatedComponentCount = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length
  const hasSlashHouseNumber = Boolean(
    features.hasSlashNumber ||
    asArray(candidate.houseNumberAlternatives).some((value) => /\d\s*\/\s*\d/u.test(String(value || '')))
  )

  return {
    text,
    hasAdmin,
    hasStreet,
    hasHouseNumber,
    hasWard,
    hasDistrict,
    hasExplicitStreetMarker,
    hasSlashHouseNumber,
    namedStreetWordCount: Number(features.namedStreetWordCount || 0),
    commaSeparatedComponentCount,
    addressLikelihoodScore: Number(likelihood.score || 0),
    addressLike: Boolean(features.isAddressLike),
  }
}

function candidateSufficiency(candidate = {}, intent = {}) {
  const riskFlags = new Set(asArray(candidate.riskFlags))
  const profile = structuralProfile(candidate)
  const contextNumberRejected = riskFlags.has('CONTEXT_NUMBER_REJECTED_AS_HOUSE_NUMBER')
  const partial = riskFlags.has('PARTIAL_ADDRESS') || riskFlags.has('MISSING_STREET_NAME') || riskFlags.has('MISSING_ADMIN_COMPONENT')
  const placeOnly = candidate.type === 'PLACE_NAME_ONLY' || candidate.type === 'PLACE_LOCATION_FRAGMENT'
  const conflict = Boolean(
    candidate.houseNumberConflict || candidate.numberConflict ||
    riskFlags.has('HOUSE_NUMBER_CONFLICT') || riskFlags.has('ASR_NUMBER_CONFLICT')
  )
  const independentlyStrong = Boolean(profile.hasHouseNumber && profile.hasStreet && profile.hasAdmin)
  const lowConfidenceOcr = Boolean(
    candidate.type === 'OCR_ADDRESS_FRAGMENT' &&
    (
      riskFlags.has('LOW_CONFIDENCE_OCR') ||
      String(candidate.qualityTier || '').toUpperCase() === 'TIER_D'
    )
  )
  const multiPlaceMetadata = Boolean(
    intent?.mustNotResolve === true && candidate.type === 'METADATA_ADDRESS'
  )
  const coherentNoisyOcrStructure = Boolean(
    independentlyStrong &&
    profile.addressLike &&
    profile.addressLikelihoodScore >= 80 &&
    (
      profile.hasExplicitStreetMarker ||
      (profile.hasWard && profile.hasDistrict) ||
      (profile.hasSlashHouseNumber && profile.namedStreetWordCount >= 2) ||
      (
        profile.commaSeparatedComponentCount >= 3 &&
        profile.namedStreetWordCount >= 2
      )
    )
  )

  if (multiPlaceMetadata) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.MULTI_PLACE_METADATA }
  }
  if (contextNumberRejected) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.CONTEXT_NUMBER }
  }
  if (placeOnly) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.PLACE_ONLY }
  }
  if (partial || !profile.hasStreet) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.PARTIAL }
  }
  if (conflict && !independentlyStrong) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.CONFLICT }
  }
  if (lowConfidenceOcr && !coherentNoisyOcrStructure) {
    return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.STRUCTURE }
  }

  if (candidate.type === 'ASR_FULL_ADDRESS_REVIEW' && independentlyStrong) {
    return { sufficient: true, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.SUFFICIENT }
  }
  if (candidate.type === 'METADATA_ADDRESS' && independentlyStrong) {
    return { sufficient: true, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.SUFFICIENT }
  }
  if (independentlyStrong) {
    return { sufficient: true, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.SUFFICIENT }
  }
  return { sufficient: false, reason: SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.STRUCTURE }
}

export function evaluateShortsTrack2V3LateRescueSufficiency({ candidates = [], intent = {} } = {}) {
  const candidateItems = asArray(candidates)
  const evaluations = candidateItems.map((candidate) => ({
    candidate,
    ...candidateSufficiency(candidate, intent),
  }))
  const blocking = evaluations.filter((item) => item.sufficient)
  const nonBlocking = evaluations.filter((item) => !item.sufficient)
  const reasonPriority = [
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.MULTI_PLACE_METADATA,
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.CONTEXT_NUMBER,
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.PLACE_ONLY,
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.PARTIAL,
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.CONFLICT,
    SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.STRUCTURE,
  ]
  const reason = blocking.length
    ? SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.SUFFICIENT
    : reasonPriority.find((value) => nonBlocking.some((item) => item.reason === value)) ||
      SHORTS_TRACK2_V3_LATE_RESCUE_REASONS.NO_REVIEW_EVIDENCE

  return {
    lateRescueSufficiencyEvaluated: true,
    lateRescueSufficient: blocking.length > 0,
    lateRescueSufficiencyReason: reason,
    lateRescueBlockingCandidateCount: blocking.length,
    lateRescueNonBlockingCandidateCount: nonBlocking.length,
    lateRescueCandidateEvaluations: evaluations.map((item) => ({
      candidateId: item.candidate?.id || null,
      candidateType: item.candidate?.type || null,
      sufficient: item.sufficient,
      reason: item.reason,
    })),
  }
}

export default {
  evaluateShortsTrack2V3LateRescueSufficiency,
}
