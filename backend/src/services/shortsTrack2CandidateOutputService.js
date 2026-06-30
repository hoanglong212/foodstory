import { normalizeAddress } from './shortsAddressNormalizer.js'

const MAX_CANDIDATES = 5
const VALID_SOURCE_TYPES = new Set([
  'ocr_frame',
  'ocr_repeated_frame',
  'asr_transcript',
  'place_name_inference',
])

function safeString(value, maxLength) {
  const text = String(value || '').trim()
  return text ? text.slice(0, maxLength) : null
}

function safeEvidenceText(value, maxLength = 500) {
  const text = safeString(value, maxLength * 2)
  if (!text) return null
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[REDACTED_EMAIL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/gu, '[REDACTED_API_KEY]')
    .replace(/https?:\/\/[^\s)\]}>"]+/giu, '[REDACTED_URL]')
    .slice(0, maxLength)
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function confidenceOrNull(value) {
  const numeric = finiteNumberOrNull(value)
  if (numeric === null) return null
  return Math.max(0, Math.min(1, numeric))
}

function safeRiskFlags(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((flag) => safeString(flag, 120))
    .filter(Boolean))]
    .slice(0, 12)
}

function placeDetails(candidate = {}) {
  const places = candidate?.places || {}
  const nested = (Array.isArray(places.candidates) ? places.candidates : [])
    .find((item) => safeString(item?.placeId, 160)) || {}
  return {
    placeId: safeString(candidate.placeId || places.placeId || nested.placeId, 160),
    formattedAddress: safeString(
      candidate.formattedAddress || places.formattedAddress || nested.formattedAddress,
      300,
    ),
    placeName: safeString(
      candidate.placeName || candidate.displayName || places.displayName || nested.displayName,
      200,
    ),
  }
}

function evidenceSource(sourceType) {
  if (sourceType === 'ocr_frame' || sourceType === 'ocr_repeated_frame') return 'ocr'
  if (sourceType === 'asr_transcript') return 'asr'
  if (sourceType === 'place_name_inference') return 'places'
  return 'metadata'
}

function normalizeCandidate(candidate = {}, verificationReason = null) {
  const sourceType = VALID_SOURCE_TYPES.has(candidate.sourceType)
    ? candidate.sourceType
    : 'place_name_inference'
  const details = placeDetails(candidate)
  const candidateAddress = safeString(candidate.candidateAddress, 300)
  const normalizedAddress = safeString(
    candidate.normalizedAddress || (candidateAddress ? normalizeAddress(candidateAddress) : ''),
    300,
  )
  const rawText = safeEvidenceText(candidate.rawText, 500)
  const timestampSeconds = finiteNumberOrNull(candidate.timestampSeconds)
  const frameIndex = finiteNumberOrNull(candidate.frameIndex)
  const source = evidenceSource(sourceType)
  const evidenceText = source === 'places'
    ? details.formattedAddress || details.placeName
    : rawText || candidateAddress || details.placeName

  return {
    sourceType,
    candidateAddress,
    placeName: details.placeName,
    normalizedAddress,
    formattedAddress: details.formattedAddress,
    placeId: details.placeId,
    timestampSeconds,
    frameIndex,
    rawText,
    confidence: confidenceOrNull(
      candidate.confidence ?? candidate.ocrConfidence ?? candidate.transcriptConfidence ?? candidate.score,
    ),
    riskFlags: safeRiskFlags(candidate.riskFlags),
    verificationReason: safeString(
      verificationReason || candidate.verificationReason || candidate.extractionRule,
      160,
    ),
    placeVerificationStatus: safeString(candidate.placeVerificationStatus, 120),
    evidence: {
      source,
      text: safeEvidenceText(evidenceText, 500),
      timestampSeconds,
      frameIndex,
    },
  }
}

function dedupeKey(candidate = {}) {
  const identity = candidate.normalizedAddress ||
    candidate.candidateAddress ||
    candidate.placeId ||
    candidate.placeName ||
    ''
  return [
    String(identity).toLowerCase(),
    candidate.sourceType || '',
    candidate.timestampSeconds ?? '',
  ].join('|')
}

function candidateReasons(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.candidate)
    .map((item) => ({ candidate: item.candidate, reason: item.reason }))
}

export function buildTrack2CandidateOutput({
  ocrExtraction = {},
  ocrVerification = null,
  asrExtraction = null,
  asrVerification = null,
  placeCandidates = [],
  placeReason = null,
} = {}) {
  const ranked = [
    ...(ocrVerification?.verifiedCandidates || []).map((candidate) => ({
      candidate,
      reason: candidate.verificationReason || 'OCR_ADDRESS_CONFIRMED',
    })),
    ...(asrVerification?.verifiedCandidates || []).map((candidate) => ({
      candidate,
      reason: candidate.verificationReason || 'ASR_ADDRESS_CONFIRMED',
    })),
    ...candidateReasons(ocrVerification?.unresolvedCandidates),
    ...candidateReasons(asrVerification?.unresolvedCandidates),
    ...candidateReasons(ocrVerification?.rejectedCandidates),
    ...candidateReasons(asrVerification?.rejectedCandidates),
    ...(ocrExtraction?.candidates || []).map((candidate) => ({ candidate, reason: 'OCR_NOT_VERIFIED' })),
    ...(asrExtraction?.candidates || []).map((candidate) => ({ candidate, reason: 'ASR_NOT_VERIFIED' })),
    ...(Array.isArray(placeCandidates) ? placeCandidates : []).map((candidate) => ({
      candidate: { ...candidate, sourceType: 'place_name_inference' },
      reason: placeReason || 'PLACE_NAME_CANDIDATE',
    })),
  ]

  const seen = new Set()
  const output = []
  for (const item of ranked) {
    const candidate = normalizeCandidate(item.candidate, item.reason)
    const key = dedupeKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(candidate)
    if (output.length >= MAX_CANDIDATES) break
  }
  return output
}

export const __shortsTrack2CandidateOutputTestUtils = {
  dedupeKey,
  normalizeCandidate,
}

export default {
  buildTrack2CandidateOutput,
}
