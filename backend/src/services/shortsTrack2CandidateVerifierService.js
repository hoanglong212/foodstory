import { normalizeAddress } from './shortsAddressNormalizer.js'
import { cleanAddressNoRepair as defaultCleanAddressNoRepair } from './shortsGeminiAddressCleanService.js'
import { confirmAddressWithPlaces as defaultConfirmAddressWithPlaces } from './shortsPlacesConfirmService.js'
import {
  confirmTrack2AsrAddressWithGemini as defaultConfirmTrack2AsrAddressWithGemini,
  confirmTrack2OcrAddressWithGemini as defaultConfirmTrack2OcrAddressWithGemini,
} from './shortsTrack2GeminiConfirmService.js'

const OCR_SOURCE_TYPES = new Set(['ocr_frame', 'ocr_repeated_frame'])
const ASR_SOURCE_TYPES = new Set(['asr_transcript'])
const HARD_RISK_FLAGS = new Set(['TRUNCATED_TEXT', 'DIRTY_TEXT', 'MULTIPLE_ADDRESS_LIKE_LINES'])
const HARD_ASR_RISK_FLAGS = new Set([
  'TRUNCATED_TRANSCRIPT',
  'DIRTY_TRANSCRIPT',
  'MULTIPLE_ADDRESS_LIKE_PHRASES',
])

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => {
      if (typeof diagnostic === 'string') return { message: safeString(diagnostic, 240) }
      if (!diagnostic || typeof diagnostic !== 'object') return null
      return {
        ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 120) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message, 240) } : {}),
        ...(Number.isFinite(Number(diagnostic.httpStatus))
          ? { httpStatus: Number(diagnostic.httpStatus) }
          : {}),
        ...(typeof diagnostic.apiKeyPresent === 'boolean'
          ? { apiKeyPresent: diagnostic.apiKeyPresent }
          : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 20)
}

function candidateReason(candidate, reason) {
  return {
    candidate,
    reason,
  }
}

function hasHardRisk(candidate = {}) {
  return (Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [])
    .some((flag) => HARD_RISK_FLAGS.has(flag))
}

function hasHardAsrRisk(candidate = {}) {
  return (Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [])
    .some((flag) => HARD_ASR_RISK_FLAGS.has(flag))
}

function usablePlaceCandidate(places = {}) {
  if (places?.placeId) {
    return {
      placeId: safeString(places.placeId),
      displayName: safeString(places.displayName || places.name, 200),
      formattedAddress: safeString(places.formattedAddress, 300),
    }
  }
  return (Array.isArray(places?.candidates) ? places.candidates : [])
    .find((candidate) => safeString(candidate?.placeId))
}

function placesProviderError(places = {}) {
  return places?.status === 'PLACES_PROVIDER_ERROR' || places?.error === 'PLACES_PROVIDER_ERROR'
}

function placesNotConfirmed(places = {}) {
  return places?.status === 'PLACES_EMPTY_RESULT' ||
    places?.status === 'NO_PLACES_MATCH' ||
    !usablePlaceCandidate(places)
}

function cleanRejected(clean = {}, candidate = {}) {
  if (clean.status !== 'OK') return true
  if (!clean.normalizedAddress) return true
  if (clean.disallowedRepairDetected) return true
  return normalizeAddress(candidate.candidateAddress) !== normalizeAddress(clean.normalizedAddress)
}

function verifiedCandidate({
  candidate,
  clean,
  places,
  confirm,
}) {
  const place = usablePlaceCandidate(places) || {}
  return {
    sourceType: candidate.sourceType,
    candidateAddress: candidate.candidateAddress,
    normalizedAddress: clean.normalizedAddress,
    rawText: candidate.rawText,
    timestampSeconds: candidate.timestampSeconds,
    frameIndex: candidate.frameIndex,
    ocrConfidence: candidate.ocrConfidence,
    extractionRule: candidate.extractionRule,
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [],
    confidence: Number(confirm.confidence) || 0,
    address: clean.normalizedAddress,
    addressSource: 'ocr_frame',
    placeId: safeString(place.placeId),
    placeName: safeString(place.displayName || place.name, 200),
    formattedAddress: safeString(place.formattedAddress, 300),
    placeVerificationStatus: 'PLACES_MATCHED',
    verificationReason: 'OCR_ADDRESS_CONFIRMED',
    clean,
    places,
    confirm,
  }
}

function verifiedAsrCandidate({
  candidate,
  clean,
  places,
  confirm,
}) {
  const place = usablePlaceCandidate(places) || {}
  return {
    sourceType: candidate.sourceType,
    candidateAddress: candidate.candidateAddress,
    normalizedAddress: clean.normalizedAddress,
    rawText: candidate.rawText,
    timestampSeconds: candidate.timestampSeconds,
    transcriptConfidence: candidate.transcriptConfidence,
    extractionRule: candidate.extractionRule,
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [],
    confidence: Number(confirm.confidence) || 0,
    address: clean.normalizedAddress,
    addressSource: 'asr_transcript',
    placeId: safeString(place.placeId),
    placeName: safeString(place.displayName || place.name, 200),
    formattedAddress: safeString(place.formattedAddress, 300),
    placeVerificationStatus: 'PLACES_MATCHED',
    verificationReason: 'ASR_ADDRESS_CONFIRMED',
    clean,
    places,
    confirm,
  }
}

function summarizeReason({
  verifiedCandidates,
  rejectedCandidates,
  unresolvedCandidates,
  providerError,
  candidateExtractionStatus,
}) {
  if (verifiedCandidates.length > 1) return 'MULTIPLE_VERIFIED_OCR_CANDIDATES'
  if (
    verifiedCandidates.length === 1 &&
    unresolvedCandidates.length === 0 &&
    (candidateExtractionStatus !== 'NEEDS_REVIEW' || rejectedCandidates.length > 0)
  ) {
    return 'OCR_ADDRESS_CONFIRMED'
  }
  if (providerError === 'PLACES_PROVIDER_ERROR') return 'PLACES_PROVIDER_ERROR'
  if (unresolvedCandidates.some((item) => item.reason === 'PLACES_NOT_CONFIRMED')) {
    return 'PLACES_NOT_CONFIRMED'
  }
  if (unresolvedCandidates.some((item) => item.reason === 'GEMINI_TRACK2_UNAVAILABLE')) {
    return 'GEMINI_TRACK2_UNAVAILABLE'
  }
  if (unresolvedCandidates.some((item) => item.reason === 'GEMINI_TRACK2_UNSURE')) {
    return 'GEMINI_TRACK2_UNSURE'
  }
  if (rejectedCandidates.some((item) => item.reason === 'GEMINI_TRACK2_REJECTED')) {
    return 'GEMINI_TRACK2_REJECTED'
  }
  return 'OCR_CANDIDATES_UNVERIFIED'
}

function finalStatus({
  verifiedCandidates,
  rejectedCandidates,
  unresolvedCandidates,
  candidateExtractionStatus,
  providerError,
}) {
  if (verifiedCandidates.length > 1) return 'NEEDS_REVIEW'
  if (verifiedCandidates.length === 1 && unresolvedCandidates.length === 0) {
    if (candidateExtractionStatus === 'NEEDS_REVIEW' && rejectedCandidates.length === 0) {
      return 'NEEDS_REVIEW'
    }
    return 'OK'
  }
  if (candidateExtractionStatus === 'NEEDS_REVIEW' && unresolvedCandidates.length > 0) return 'NEEDS_REVIEW'
  if (providerError) return 'ERROR'
  return 'OK'
}

function summarizeAsrReason({
  verifiedCandidates,
  rejectedCandidates,
  unresolvedCandidates,
  providerError,
  candidateExtractionStatus,
}) {
  if (verifiedCandidates.length > 1) return 'MULTIPLE_VERIFIED_ASR_CANDIDATES'
  if (
    verifiedCandidates.length === 1 &&
    unresolvedCandidates.length === 0 &&
    (candidateExtractionStatus !== 'NEEDS_REVIEW' || rejectedCandidates.length > 0)
  ) {
    return 'ASR_ADDRESS_CONFIRMED'
  }
  if (providerError === 'PLACES_PROVIDER_ERROR') return 'PLACES_PROVIDER_ERROR'
  if (unresolvedCandidates.some((item) => item.reason === 'ASR_PLACES_NOT_CONFIRMED')) {
    return 'ASR_PLACES_NOT_CONFIRMED'
  }
  if (unresolvedCandidates.some((item) => item.reason === 'ASR_GEMINI_UNSURE')) {
    return 'ASR_GEMINI_UNSURE'
  }
  if (rejectedCandidates.some((item) => item.reason === 'ASR_GEMINI_REJECTED')) {
    return 'ASR_GEMINI_REJECTED'
  }
  return 'ASR_CANDIDATES_UNVERIFIED'
}

function finalAsrStatus({
  verifiedCandidates,
  rejectedCandidates,
  unresolvedCandidates,
  candidateExtractionStatus,
  providerError,
}) {
  if (verifiedCandidates.length > 1) return 'NEEDS_REVIEW'
  if (verifiedCandidates.length === 1 && unresolvedCandidates.length === 0) {
    if (candidateExtractionStatus === 'NEEDS_REVIEW' && rejectedCandidates.length === 0) {
      return 'NEEDS_REVIEW'
    }
    return 'OK'
  }
  if (candidateExtractionStatus === 'NEEDS_REVIEW' && unresolvedCandidates.length > 0) return 'NEEDS_REVIEW'
  if (providerError) return 'ERROR'
  return 'OK'
}

export async function verifyOcrAddressCandidates(candidateExtractionResult, context = {}, deps = {}) {
  const candidates = Array.isArray(candidateExtractionResult?.candidates)
    ? candidateExtractionResult.candidates
    : []

  if (!candidates.length) {
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_OCR_ADDRESS_CANDIDATE',
      verifiedCandidates: [],
      rejectedCandidates: [],
      unresolvedCandidates: [],
      diagnostics: [],
    }
  }

  const cleanAddressNoRepair = deps.cleanAddressNoRepair || defaultCleanAddressNoRepair
  const confirmAddressWithPlaces = deps.confirmAddressWithPlaces || defaultConfirmAddressWithPlaces
  const confirmTrack2OcrAddressWithGemini =
    deps.confirmTrack2OcrAddressWithGemini || defaultConfirmTrack2OcrAddressWithGemini
  const verifiedCandidates = []
  const rejectedCandidates = []
  const unresolvedCandidates = []
  const diagnostics = []
  let providerError = null

  for (const candidate of candidates) {
    if (!OCR_SOURCE_TYPES.has(candidate?.sourceType)) {
      rejectedCandidates.push(candidateReason(candidate, 'SOURCE_NOT_ELIGIBLE'))
      continue
    }

    let clean
    try {
      clean = await cleanAddressNoRepair({
        rawCandidate: candidate.candidateAddress,
        sourceType: candidate.sourceType,
        sourceName: candidate.extractionRule,
        sourceSnippet: candidate.candidateAddress,
        geminiClient: deps.geminiClient,
      })
    } catch (error) {
      rejectedCandidates.push(candidateReason(candidate, 'CLEAN_NOT_OK'))
      diagnostics.push({
        stage: 'clean',
        code: 'CLEAN_PROVIDER_ERROR',
        message: safeString(error?.message || 'clean failed', 240),
      })
      continue
    }

    if (cleanRejected(clean, candidate) || hasHardRisk(candidate)) {
      rejectedCandidates.push(candidateReason({
        ...candidate,
        clean,
      }, clean?.disallowedRepairDetected ? 'REPAIR_DETECTED' : 'CLEAN_NOT_OK'))
      continue
    }

    let places
    try {
      places = await confirmAddressWithPlaces({
        normalizedAddress: clean.normalizedAddress,
        candidateAddress: candidate.candidateAddress,
        metadata: {},
        placeNameContexts: [],
        shopName: '',
        googlePlacesApiKey: deps.googlePlacesApiKey,
        fetch: deps.fetch,
      })
    } catch (error) {
      providerError = 'PLACES_PROVIDER_ERROR'
      unresolvedCandidates.push(candidateReason({ ...candidate, clean }, 'PLACES_PROVIDER_ERROR'))
      diagnostics.push({
        stage: 'places',
        code: 'PLACES_PROVIDER_ERROR',
        message: safeString(error?.message || 'places failed', 240),
      })
      continue
    }

    diagnostics.push(...safeDiagnostics(places?.diagnostics).map((diagnostic) => ({
      stage: 'places',
      ...diagnostic,
    })))

    if (placesProviderError(places)) {
      providerError = 'PLACES_PROVIDER_ERROR'
      unresolvedCandidates.push(candidateReason({ ...candidate, clean, places }, 'PLACES_PROVIDER_ERROR'))
      continue
    }

    if (placesNotConfirmed(places)) {
      unresolvedCandidates.push(candidateReason({ ...candidate, clean, places }, 'PLACES_NOT_CONFIRMED'))
      continue
    }

    const confirm = await confirmTrack2OcrAddressWithGemini({
      candidate,
      clean,
      places,
      metadata: context.metadata || {},
      sourceUrl: context.sourceUrl || '',
      videoId: context.videoId || '',
    }, deps)

    diagnostics.push(...safeDiagnostics(confirm?.diagnostics).map((diagnostic) => ({
      stage: 'confirm',
      ...diagnostic,
    })))

    if (confirm.decision === 'CONFIRMED' && Number(confirm.confidence) >= 0.85) {
      verifiedCandidates.push(verifiedCandidate({ candidate, clean, places, confirm }))
      continue
    }

    if (confirm.decision === 'REJECTED') {
      rejectedCandidates.push(candidateReason({ ...candidate, clean, places, confirm }, 'GEMINI_TRACK2_REJECTED'))
      continue
    }

    unresolvedCandidates.push(candidateReason({
      ...candidate,
      clean,
      places,
      confirm,
    }, confirm.status === 'UNAVAILABLE' ? 'GEMINI_TRACK2_UNAVAILABLE' : 'GEMINI_TRACK2_UNSURE'))
  }

  const status = finalStatus({
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    candidateExtractionStatus: candidateExtractionResult?.status,
    providerError,
  })
  const reason = summarizeReason({
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    providerError,
    candidateExtractionStatus: candidateExtractionResult?.status,
  })

  return {
    status,
    reason,
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    diagnostics: safeDiagnostics(diagnostics),
  }
}

export async function verifyAsrAddressCandidates(candidateExtractionResult, context = {}, deps = {}) {
  const candidates = Array.isArray(candidateExtractionResult?.candidates)
    ? candidateExtractionResult.candidates
    : []

  if (!candidates.length) {
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_ASR_ADDRESS_CANDIDATE',
      verifiedCandidates: [],
      rejectedCandidates: [],
      unresolvedCandidates: [],
      diagnostics: [],
    }
  }

  const cleanAddressNoRepair = deps.cleanAddressNoRepair || defaultCleanAddressNoRepair
  const confirmAddressWithPlaces = deps.confirmAddressWithPlaces || defaultConfirmAddressWithPlaces
  const confirmTrack2AsrAddressWithGemini =
    deps.confirmTrack2AsrAddressWithGemini || defaultConfirmTrack2AsrAddressWithGemini
  const verifiedCandidates = []
  const rejectedCandidates = []
  const unresolvedCandidates = []
  const diagnostics = []
  let providerError = null

  for (const candidate of candidates) {
    if (!ASR_SOURCE_TYPES.has(candidate?.sourceType)) {
      rejectedCandidates.push(candidateReason(candidate, 'SOURCE_NOT_ELIGIBLE'))
      continue
    }

    let clean
    try {
      clean = await cleanAddressNoRepair({
        rawCandidate: candidate.candidateAddress,
        sourceType: candidate.sourceType,
        sourceName: candidate.extractionRule,
        sourceSnippet: candidate.candidateAddress,
        geminiClient: deps.geminiClient,
      })
    } catch (error) {
      rejectedCandidates.push(candidateReason(candidate, 'CLEAN_NOT_OK'))
      diagnostics.push({
        stage: 'clean',
        code: 'CLEAN_PROVIDER_ERROR',
        message: safeString(error?.message || 'clean failed', 240),
      })
      continue
    }

    if (cleanRejected(clean, candidate) || hasHardAsrRisk(candidate)) {
      rejectedCandidates.push(candidateReason({
        ...candidate,
        clean,
      }, clean?.disallowedRepairDetected ? 'REPAIR_DETECTED' : 'CLEAN_NOT_OK'))
      continue
    }

    let places
    try {
      places = await confirmAddressWithPlaces({
        normalizedAddress: clean.normalizedAddress,
        candidateAddress: candidate.candidateAddress,
        metadata: {},
        placeNameContexts: [],
        shopName: '',
        googlePlacesApiKey: deps.googlePlacesApiKey,
        fetch: deps.fetch,
      })
    } catch (error) {
      providerError = 'PLACES_PROVIDER_ERROR'
      unresolvedCandidates.push(candidateReason({ ...candidate, clean }, 'PLACES_PROVIDER_ERROR'))
      diagnostics.push({
        stage: 'places',
        code: 'PLACES_PROVIDER_ERROR',
        message: safeString(error?.message || 'places failed', 240),
      })
      continue
    }

    diagnostics.push(...safeDiagnostics(places?.diagnostics).map((diagnostic) => ({
      stage: 'places',
      ...diagnostic,
    })))

    if (placesProviderError(places)) {
      providerError = 'PLACES_PROVIDER_ERROR'
      unresolvedCandidates.push(candidateReason({ ...candidate, clean, places }, 'PLACES_PROVIDER_ERROR'))
      continue
    }

    if (placesNotConfirmed(places)) {
      unresolvedCandidates.push(candidateReason({ ...candidate, clean, places }, 'ASR_PLACES_NOT_CONFIRMED'))
      continue
    }

    const confirm = await confirmTrack2AsrAddressWithGemini({
      candidate,
      clean,
      places,
      metadata: context.metadata || {},
      sourceUrl: context.sourceUrl || '',
      videoId: context.videoId || '',
    }, deps)

    diagnostics.push(...safeDiagnostics(confirm?.diagnostics).map((diagnostic) => ({
      stage: 'confirm',
      ...diagnostic,
    })))

    if (confirm.decision === 'CONFIRMED' && Number(confirm.confidence) >= 0.85) {
      verifiedCandidates.push(verifiedAsrCandidate({ candidate, clean, places, confirm }))
      continue
    }

    if (confirm.decision === 'REJECTED') {
      rejectedCandidates.push(candidateReason({ ...candidate, clean, places, confirm }, 'ASR_GEMINI_REJECTED'))
      continue
    }

    unresolvedCandidates.push(candidateReason({
      ...candidate,
      clean,
      places,
      confirm,
    }, 'ASR_GEMINI_UNSURE'))
  }

  const status = finalAsrStatus({
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    candidateExtractionStatus: candidateExtractionResult?.status,
    providerError,
  })
  const reason = summarizeAsrReason({
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    providerError,
    candidateExtractionStatus: candidateExtractionResult?.status,
  })

  return {
    status,
    reason,
    verifiedCandidates,
    rejectedCandidates,
    unresolvedCandidates,
    diagnostics: safeDiagnostics(diagnostics),
  }
}

export const __shortsTrack2CandidateVerifierTestUtils = {
  HARD_RISK_FLAGS,
  HARD_ASR_RISK_FLAGS,
}

export default {
  verifyOcrAddressCandidates,
  verifyAsrAddressCandidates,
}
