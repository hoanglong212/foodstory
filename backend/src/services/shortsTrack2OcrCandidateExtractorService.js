import {
  isTruncatedEvidence,
  normalizeAddress,
  safePreNormalize,
} from './shortsAddressNormalizer.js'

const HOUSE_NUMBER_PATTERN =
  /\b(?:số\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b/iu
const STREET_MARKER_PATTERN =
  /\b(?:đường|duong|đ\.|d\.|hẻm|hem|ngõ|ngo|ngách|ngach|phố|pho|street|st\.?|road|rd\.?|alley|lane)\b/iu
const ADMIN_MARKER_PATTERN =
  /\b(?:phường|phuong|p\.|quận|quan|q\.|tp\.?|thành\s*phố|thanh\s*pho|district|ward|hcmc?|hồ\s*chí\s*minh|ho\s*chi\s*minh|hà\s*nội|ha\s*noi)\b/iu
const BARE_STREET_PREFIX_PATTERN =
  /^(?:số\s*)?\d{2,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\s+[\p{L}][\p{L}\d'’.\- ]{2,80},/iu
const DISTRICT_OR_WARD_COMPONENT_PATTERN =
  /(?:^|[\s,])(?:phường|phuong|p\.?|quận|quan|q\.?|district|ward)\s*[\p{L}\d]/iu
const CITY_OR_PROVINCE_COMPONENT_PATTERN =
  /(?:^|[\s,])(?:tp\.?|thành\s*phố|thanh\s*pho|tỉnh|tinh|hcmc?|hồ\s*chí\s*minh|ho\s*chi\s*minh|hà\s*nội|ha\s*noi)\b/iu
const EXPLICIT_LABEL_PATTERN =
  /(?:^|[\s|•*\-–—])(?:địa\s*chỉ|dia\s*chi|đc|dc|address)\s*:/iu
const SOCIAL_NOISE_PATTERN =
  /(?:https?:\/\/|www\.|facebook|instagram|tiktok|youtube|@|(?:^|\s)#|follow|theo\s*dõi|liên\s*hệ|contact|email|copyright|subscribe)/iu
const CONTACT_BOUNDARY_PATTERN =
  /\s+(?:hotline|phone|sđt|sdt|số\s*điện\s*thoại|giá|price|follow|facebook|instagram|tiktok|youtube|liên\s*hệ|contact|email)\b/iu

const LOW_CONFIDENCE_THRESHOLD = 0.65
const MAX_CANDIDATE_LENGTH = 180
const MAX_RAW_TEXT_LENGTH = 600
const MAX_RAW_LINES = 8

function safeString(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function confidenceOrNull(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return numeric
}

function diagnostic(code, message, extra = {}) {
  return {
    code,
    message,
    ...extra,
  }
}

function textBlocks(ocrResult = {}) {
  return (Array.isArray(ocrResult?.textBlocks) ? ocrResult.textBlocks : [])
    .map((block) => ({
      frameIndex: finiteNumberOrNull(block?.frameIndex),
      timestampSeconds: finiteNumberOrNull(block?.timestampSeconds),
      text: safeString(block?.text),
      confidence: confidenceOrNull(block?.confidence),
    }))
    .filter((block) => block.text)
}

function textLines(rawText) {
  return safeString(rawText)
    .split(/\r?\n/u)
    .map((line) => safePreNormalize(line))
    .filter(Boolean)
}

function hasHouseNumber(value) {
  return HOUSE_NUMBER_PATTERN.test(safePreNormalize(value))
}

function hasStreetMarker(value) {
  return STREET_MARKER_PATTERN.test(safePreNormalize(value))
}

function hasAdminMarker(value) {
  return ADMIN_MARKER_PATTERN.test(safePreNormalize(value))
}

function hasSafeVietnamBareStreetShape(value) {
  const normalized = safePreNormalize(value)
  return (
    hasHouseNumber(normalized) &&
    BARE_STREET_PREFIX_PATTERN.test(normalized) &&
    DISTRICT_OR_WARD_COMPONENT_PATTERN.test(normalized) &&
    CITY_OR_PROVINCE_COMPONENT_PATTERN.test(normalized)
  )
}

function hasAddressLikeShape(value, { explicitLabel = false } = {}) {
  const hasHouse = hasHouseNumber(value)
  const hasStreet = hasStreetMarker(value)
  const hasAdmin = hasAdminMarker(value)
  const hasBareStreetShape = hasSafeVietnamBareStreetShape(value)

  if (explicitLabel) {
    return hasHouse && (hasStreet || hasAdmin)
  }

  return hasHouse && hasAdmin && (hasStreet || hasBareStreetShape)
}

function boundExplicitTail(tail) {
  return safePreNormalize(String(tail || '').split(CONTACT_BOUNDARY_PATTERN)[0])
}

function explicitCandidateFromLine(line, nextLine = '') {
  const normalized = safePreNormalize(line)
  const match = EXPLICIT_LABEL_PATTERN.exec(normalized)
  if (!match) return null

  const tail = boundExplicitTail(normalized.slice(match.index + match[0].length))
  if (tail) return tail

  return boundExplicitTail(nextLine)
}

function lineCandidates(block) {
  const lines = textLines(block.text)
  const candidates = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1] || ''
    const explicit = explicitCandidateFromLine(line, nextLine)

    if (explicit) {
      candidates.push({
        candidateAddress: explicit,
        rawLine: line,
        extractionRule: 'OCR_EXPLICIT_LABEL',
        explicitLabel: true,
      })
      continue
    }

    if (hasAddressLikeShape(line)) {
      const bareStreetShape =
        !hasStreetMarker(line) && hasSafeVietnamBareStreetShape(line)
      candidates.push({
        candidateAddress: line,
        rawLine: line,
        extractionRule: bareStreetShape
          ? 'OCR_VIETNAM_BARE_STREET_FULL'
          : 'OCR_ADDRESS_LIKE_FULL',
        explicitLabel: false,
      })
      continue
    }

    if (nextLine) {
      const joinedLines = safePreNormalize(`${line}, ${nextLine}`)
      if (hasSafeVietnamBareStreetShape(joinedLines)) {
        candidates.push({
          candidateAddress: joinedLines,
          rawLine: `${line}\n${nextLine}`,
          extractionRule: 'OCR_JOINED_VIETNAM_ADDRESS',
          explicitLabel: false,
        })
        index += 1
      }
    }
  }

  return candidates
}

function riskFlagsFor({ candidateAddress, rawText, confidence, multiple = false }) {
  const flags = []
  const normalizedCandidate = safePreNormalize(candidateAddress)
  const normalizedRaw = safePreNormalize(rawText)

  if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) flags.push('LOW_OCR_CONFIDENCE')
  if (isTruncatedEvidence(normalizedCandidate) || isTruncatedEvidence(normalizedRaw)) flags.push('TRUNCATED_TEXT')
  if (SOCIAL_NOISE_PATTERN.test(normalizedRaw)) flags.push('POSSIBLE_SOCIAL_NOISE')
  if (SOCIAL_NOISE_PATTERN.test(normalizedCandidate)) flags.push('DIRTY_TEXT')
  if (!hasAdminMarker(normalizedCandidate)) flags.push('MISSING_ADMIN_MARKER')
  if (
    !hasStreetMarker(normalizedCandidate) &&
    !hasSafeVietnamBareStreetShape(normalizedCandidate)
  ) {
    flags.push('MISSING_STREET_MARKER')
  }
  if (!hasHouseNumber(normalizedCandidate)) flags.push('MISSING_HOUSE_NUMBER')
  if (normalizedRaw.length > MAX_RAW_TEXT_LENGTH || normalizedCandidate.length > MAX_CANDIDATE_LENGTH) {
    flags.push('LONG_TEXT')
  }
  if (multiple) flags.push('MULTIPLE_ADDRESS_LIKE_LINES')

  return [...new Set(flags)]
}

function isCandidateRejected({
  candidateAddress,
  rawText,
  explicitLabel,
  riskFlags,
}) {
  const lines = textLines(rawText)
  if (!candidateAddress) return true
  if (riskFlags.includes('TRUNCATED_TEXT')) return true
  if (riskFlags.includes('DIRTY_TEXT')) return true
  if (riskFlags.includes('LONG_TEXT')) return true
  if (lines.length > MAX_RAW_LINES) return true
  if (!hasAddressLikeShape(candidateAddress, { explicitLabel })) return true
  return false
}

function createCandidate(rawCandidate, block, { multiple = false } = {}) {
  const candidateAddress = safePreNormalize(rawCandidate.candidateAddress)
  const riskFlags = riskFlagsFor({
    candidateAddress,
    rawText: block.text,
    confidence: block.confidence,
    multiple,
  })

  if (isCandidateRejected({
    candidateAddress,
    rawText: block.text,
    explicitLabel: rawCandidate.explicitLabel,
    riskFlags,
  })) {
    return {
      rejected: true,
      diagnostics: [
        diagnostic('OCR_CANDIDATE_REJECTED', 'OCR candidate did not pass Phase 3 safety rules', {
          riskFlags,
          extractionRule: rawCandidate.extractionRule,
        }),
      ],
    }
  }

  return {
    rejected: false,
    candidate: {
      sourceType: 'ocr_frame',
      candidateAddress,
      normalizedAddress: normalizeAddress(candidateAddress),
      rawText: block.text,
      timestampSeconds: block.timestampSeconds,
      frameIndex: block.frameIndex,
      ocrConfidence: block.confidence,
      extractionRule: multiple ? 'OCR_MULTIPLE_ADDRESSES' : rawCandidate.extractionRule,
      riskFlags,
    },
    diagnostics: [],
  }
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  const unique = []

  for (const candidate of candidates) {
    const key = normalizeAddress(candidate.candidateAddress).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
  }

  return unique
}

export function extractOcrAddressCandidates(ocrResult, context = {}) {
  void context

  const blocks = textBlocks(ocrResult)
  if (!blocks.length) {
    return {
      status: 'NO_TEXT',
      reason: 'NO_OCR_TEXT',
      candidates: [],
      diagnostics: [],
    }
  }

  const rawMatches = []
  const diagnostics = []

  for (const block of blocks) {
    const matches = lineCandidates(block)
    for (const match of matches) {
      rawMatches.push({ match, block })
    }
  }

  if (!rawMatches.length) {
    const hasOnlySocialNoise = blocks.some((block) => SOCIAL_NOISE_PATTERN.test(block.text))
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_OCR_ADDRESS_CANDIDATE',
      candidates: [],
      diagnostics: hasOnlySocialNoise
        ? [diagnostic('POSSIBLE_SOCIAL_NOISE', 'OCR text contained social or link noise')]
        : [],
    }
  }

  const multiple = rawMatches.length > 1
  const candidates = []
  for (const item of rawMatches) {
    const result = createCandidate(item.match, item.block, { multiple })
    diagnostics.push(...result.diagnostics)
    if (!result.rejected) candidates.push(result.candidate)
  }

  const uniqueCandidates = dedupeCandidates(candidates)
  const uniqueMultiple = uniqueCandidates.length > 1

  if (!uniqueCandidates.length) {
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_OCR_ADDRESS_CANDIDATE',
      candidates: [],
      diagnostics,
    }
  }

  if (uniqueMultiple) {
    const reviewCandidates = uniqueCandidates.map((candidate) => ({
      ...candidate,
      extractionRule: 'OCR_MULTIPLE_ADDRESSES',
      riskFlags: [...new Set([...candidate.riskFlags, 'MULTIPLE_ADDRESS_LIKE_LINES'])],
    }))

    return {
      status: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_OCR_ADDRESS_CANDIDATES',
      candidates: reviewCandidates,
      diagnostics: [
        ...diagnostics,
        diagnostic('MULTIPLE_OCR_ADDRESS_CANDIDATES', 'Multiple OCR address-like candidates were found'),
      ],
    }
  }

  return {
    status: 'OK',
    reason: 'OCR_ADDRESS_CANDIDATES_FOUND',
    candidates: uniqueCandidates,
    diagnostics,
  }
}

export default {
  extractOcrAddressCandidates,
}
