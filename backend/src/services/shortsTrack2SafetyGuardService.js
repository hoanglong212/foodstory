import { safePreNormalize } from './shortsAddressNormalizer.js'

const GENERIC_LIST_PATTERNS = [
  /\btop(?:\s*\d+)?\b/i,
  /\btong\s+hop\b/i,
  /\bnhung\s+quan\b/i,
  /\bcac\s+quan\b/i,
  /\bquan\s+ngon\b/i,
  /\bmon\s+ngon\b/i,
  /\bnen\s+thu\b/i,
  /\brat\s+nhieu\s+quan\b/i,
  /\bfood\s*tour\b/i,
  /\ban\s+sap\b/i,
  /\breview\s+nhieu\s+quan\b/i,
  /\bphan\s*\d+\b/i,
  /\bpart\s*\d+\b/i,
  /\bep\s*\d+\b/i,
  /\bepisode\b/i,
  /\bseries\b/i,
]

const DISH_PATTERNS = [
  /\b(?:pho|bun|banh|com|mi|hu\s*tieu|lau|che|tra\s*sua|ca\s*phe|coffee|milk\s*tea|noodle|rice|cake)\b/i,
]

const AREA_PATTERN =
  /\b(?:quan|district|q\.?)\s*\d{1,2}|\b(?:phuong|ward|p\.?)\s*\d{1,2}|\b(?:binh\s*thanh|go\s*vap|tan\s*binh|thu\s*duc|hcm|ho\s*chi\s*minh|sai\s*gon|ha\s*noi|hanoi)\b/i

const ADDRESS_LINE_PATTERN =
  /\b(?:dia\s*chi|address|dc|d\/c)\s*:|\b\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?\s+(?:duong|d\.|street|hem|ngo|alley|lane)\b/i

function safeString(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength)
}

function foldText(value) {
  return safePreNormalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.,:;#@\s/-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function metadataText(metadata = {}) {
  return [
    metadata.title,
    metadata.descriptionRawFromYoutube,
    metadata.description,
    metadata.pageMetadataText,
    ...(Array.isArray(metadata.jsonldObjects)
      ? metadata.jsonldObjects.flatMap((item) => [item?.name, item?.description, item?.address?.streetAddress])
      : []),
  ].map((value) => safeString(value, 1500)).filter(Boolean)
}

function diagnostic(code, message, extra = {}) {
  return {
    code,
    message,
    ...extra,
  }
}

function hasGenericListSignal(text) {
  return GENERIC_LIST_PATTERNS.some((pattern) => pattern.test(text))
}

function hasDishSignal(text) {
  return DISH_PATTERNS.some((pattern) => pattern.test(text))
}

function hasAreaSignal(text) {
  return AREA_PATTERN.test(text)
}

function countAddressLines(text) {
  return safeString(text, 4000)
    .split(/\r?\n|[;|]+/u)
    .map(foldText)
    .filter((line) => ADDRESS_LINE_PATTERN.test(line))
    .length
}

function countPlaceBullets(text) {
  return safeString(text, 4000)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)])\s*\S+/u.test(line))
    .filter((line) => !ADDRESS_LINE_PATTERN.test(foldText(line)))
    .length
}

function result(status, reason, flags, diagnostics = []) {
  return {
    status,
    reason,
    flags: [...new Set(flags)],
    diagnostics,
  }
}

export function evaluateTrack2InferenceSafety(input = {}) {
  const {
    metadata = {},
    ocrCandidateExtraction = {},
    ocrVerification = null,
    asrCandidateExtraction = {},
    asrVerification = null,
  } = input
  const flags = []
  const diagnostics = []
  const texts = metadataText(metadata)
  const joined = foldText(texts.join('\n'))
  const title = foldText(metadata.title)
  const description = [
    metadata.descriptionRawFromYoutube,
    metadata.description,
    metadata.pageMetadataText,
  ].map((value) => safeString(value, 2000)).filter(Boolean).join('\n')
  const foldedDescription = foldText(description)

  if (ocrVerification?.status === 'OK' && ocrVerification?.verifiedCandidates?.length) {
    flags.push('OCR_CONFLICT')
    return result('BLOCKED', 'OCR_ALREADY_RESOLVED', flags, [
      diagnostic('OCR_ALREADY_RESOLVED', 'OCR verification already resolved Track 2'),
    ])
  }

  if (asrVerification?.status === 'OK' && asrVerification?.verifiedCandidates?.length) {
    flags.push('ASR_CONFLICT')
    return result('BLOCKED', 'ASR_ALREADY_RESOLVED', flags, [
      diagnostic('ASR_ALREADY_RESOLVED', 'ASR verification already resolved Track 2'),
    ])
  }

  if (ocrCandidateExtraction?.status === 'NEEDS_REVIEW' || ocrVerification?.status === 'NEEDS_REVIEW') {
    flags.push('OCR_NEEDS_REVIEW')
    return result('NEEDS_REVIEW', 'OCR_NEEDS_REVIEW', flags)
  }

  if (asrCandidateExtraction?.status === 'NEEDS_REVIEW' || asrVerification?.status === 'NEEDS_REVIEW') {
    flags.push('ASR_NEEDS_REVIEW')
    return result('NEEDS_REVIEW', 'ASR_NEEDS_REVIEW', flags)
  }

  if (Array.isArray(ocrCandidateExtraction?.candidates) && ocrCandidateExtraction.candidates.length > 0) {
    flags.push('OCR_CONFLICT')
    return result('BLOCKED', 'OCR_ADDRESS_CANDIDATE_PRESENT', flags)
  }

  if (Array.isArray(asrCandidateExtraction?.candidates) && asrCandidateExtraction.candidates.length > 0) {
    flags.push('ASR_CONFLICT')
    return result('BLOCKED', 'ASR_ADDRESS_CANDIDATE_PRESENT', flags)
  }

  if (countAddressLines(description) > 1) {
    flags.push('DESCRIPTION_HAS_MULTIPLE_ADDRESSES')
    return result('NEEDS_REVIEW', 'DESCRIPTION_HAS_MULTIPLE_ADDRESSES', flags)
  }

  if (countPlaceBullets(description) > 1) {
    flags.push('DESCRIPTION_HAS_MULTIPLE_PLACES')
    flags.push('MULTI_PLACE_LIKELY')
    return result('NEEDS_REVIEW', 'DESCRIPTION_HAS_MULTIPLE_PLACES', flags)
  }

  if (hasGenericListSignal(title) || hasGenericListSignal(foldedDescription)) {
    flags.push('GENERIC_LIST_TITLE')
    flags.push('MULTI_PLACE_LIKELY')
    return result('BLOCKED', 'MULTI_PLACE_OR_LIST_VIDEO', flags)
  }

  const hasDish = hasDishSignal(joined)
  const hasArea = hasAreaSignal(joined)
  const hasPossibleName = /\b(?:quan|tiem|cafe|coffee|bistro|restaurant)\s+[a-z0-9]{2,}|\b[a-z0-9]{2,}\s+(?:cafe|coffee|restaurant|bistro)\b/i.test(joined)

  if (hasDish && !hasPossibleName) {
    flags.push('DISH_ONLY_SIGNAL')
    return result('BLOCKED', 'DISH_ONLY_SIGNAL', flags)
  }

  if (hasArea && !hasPossibleName) {
    flags.push('AREA_ONLY_SIGNAL')
    return result('BLOCKED', 'AREA_ONLY_SIGNAL', flags)
  }

  if (!hasPossibleName || !hasArea) {
    flags.push('INSUFFICIENT_SINGLE_PLACE_SIGNAL')
    return result('BLOCKED', 'INSUFFICIENT_SINGLE_PLACE_SIGNAL', flags)
  }

  return result('OK', 'SINGLE_PLACE_SIGNAL_SAFE', flags, diagnostics)
}

export const __shortsTrack2SafetyGuardTestUtils = {
  foldText,
}

export default {
  evaluateTrack2InferenceSafety,
}
