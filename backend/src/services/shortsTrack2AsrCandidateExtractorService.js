import {
  isTruncatedEvidence,
  normalizeAddress,
  safePreNormalize,
} from './shortsAddressNormalizer.js'

const HOUSE_NUMBER_PATTERN =
  /\b(?:số\s*(?:nhà\s*)?)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b/iu
const STREET_MARKER_PATTERN =
  /(?:^|[\s,;:()[\]{}])(?:đường|duong|đ\.|d\.|hẻm|hem|ngõ|ngo|ngách|ngach|phố|pho|street|st\.?|road|rd\.?|alley|lane)(?=$|[\s,.;:()[\]{}])/iu
const ADMIN_MARKER_PATTERN =
  /\b(?:phường|phuong|p\.|quận|quan|q\.|tp\.?|thành\s*phố|thanh\s*pho|district|ward|hcmc?|hồ\s*chí\s*minh|ho\s*chi\s*minh|sài\s*gòn|sai\s*gon|hà\s*nội|ha\s*noi)\b/iu
const EXPLICIT_ADDRESS_PATTERN =
  /(?:^|[\s|•*\-–—])(?:(?:địa\s*chỉ|dia\s*chi)\s*(?:là|la|ở|o|tại|tai)|(?:đc|dc)\s*(?:là|la)|address\s+is)\s+/iu
const SPOKEN_ADDRESS_PATTERN =
  /(?:^|[\s|•*\-–—])(?:(?:quán|quan|tiệm|tiem)\s*(?:nằm\s*)?(?:ở|o|tại|tai)|(?:tại|tai)\s+số|số\s*nhà)\s+/iu
const ADDRESS_LIKE_PHRASE_PATTERN =
  /(?:^|[\s|•*\-–—])(?:số\s*(?:nhà\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\s+(?:đường|duong|đ\.|d\.|hẻm|hem|ngõ|ngo|phố|pho|street|alley|lane))/iu
const SOCIAL_NOISE_PATTERN =
  /(?:https?:\/\/|www\.|facebook|instagram|tiktok|youtube|@|(?:^|\s)#|follow|subscribe|theo\s*dõi|liên\s*hệ|contact|email|copyright)/iu
const UNCERTAIN_PATTERN =
  /\b(?:không\s*rõ|khong\s*ro|không\s*chắc|khong\s*chac|hình\s*như|hinh\s*nhu|có\s*lẽ|co\s*le|nghe\s*không\s*rõ|nghe\s*khong\s*ro)\b/iu
const TAIL_BOUNDARY_PATTERN =
  /\s+(?:giờ|gio|mở\s*cửa|mo\s*cua|giá|gia|price|menu|follow|facebook|instagram|tiktok|youtube|liên\s*hệ|lien\s*he|contact|email|nha|nhé|nhe|ngon|quá|qua)\b/iu

const LOW_CONFIDENCE_THRESHOLD = 0.65
const MAX_CANDIDATE_LENGTH = 220
const MAX_TRANSCRIPT_LENGTH = 1200
const MAX_RAW_LINES = 8

function safeString(value, maxLength = 4000) {
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

function transcriptItems(asrResult = {}) {
  const transcript = asrResult?.transcript
  if (!transcript || typeof transcript !== 'object') return []

  const text = safeString(transcript.text)
  const confidence = confidenceOrNull(transcript.confidence)
  const items = []

  if (text) {
    items.push({
      text,
      timestampSeconds: null,
      confidence,
    })
  }

  for (const segment of Array.isArray(transcript.segments) ? transcript.segments : []) {
    const segmentText = safeString(segment?.text)
    if (!segmentText) continue
    items.push({
      text: segmentText,
      timestampSeconds: finiteNumberOrNull(segment?.startSeconds),
      confidence: confidenceOrNull(segment?.confidence) ?? confidence,
    })
  }

  return items
}

function textLines(rawText) {
  return safeString(rawText)
    .split(/\r?\n|[;|]+/u)
    .map((line) => safePreNormalize(line))
    .filter(Boolean)
}

function hasHouseNumber(value) {
  const normalized = safePreNormalize(value)
  if (!HOUSE_NUMBER_PATTERN.test(normalized)) return false
  return /^(?:số\s*(?:nhà\s*)?)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b/iu.test(normalized)
}

function hasStreetMarker(value) {
  return STREET_MARKER_PATTERN.test(safePreNormalize(value))
}

function hasAdminMarker(value) {
  return ADMIN_MARKER_PATTERN.test(safePreNormalize(value))
}

function hasFullAddressShape(value) {
  return hasHouseNumber(value) && hasStreetMarker(value) && hasAdminMarker(value)
}

function boundTail(tail) {
  return safePreNormalize(String(tail || '').split(TAIL_BOUNDARY_PATTERN)[0])
}

function candidateFromPattern(line, pattern, extractionRule) {
  const normalized = safePreNormalize(line)
  const match = pattern.exec(normalized)
  if (!match) return null

  let tail = normalized.slice(match.index + match[0].length)
  if (pattern === SPOKEN_ADDRESS_PATTERN && /(?:tại|tai)\s+số\s*$/iu.test(match[0])) {
    tail = `số ${tail}`
  }
  if (pattern === SPOKEN_ADDRESS_PATTERN && /số\s*nhà\s*$/iu.test(match[0])) {
    tail = `số nhà ${tail}`
  }

  const candidateAddress = boundTail(tail)
  return candidateAddress
    ? {
        candidateAddress,
        rawLine: line,
        extractionRule,
      }
    : null
}

function lineCandidates(item) {
  const candidates = []

  for (const line of textLines(item.text)) {
    const explicit = candidateFromPattern(line, EXPLICIT_ADDRESS_PATTERN, 'ASR_EXPLICIT_ADDRESS_LABEL')
    if (explicit) {
      candidates.push(explicit)
      continue
    }

    const spoken = candidateFromPattern(line, SPOKEN_ADDRESS_PATTERN, 'ASR_SPOKEN_ADDRESS_PHRASE')
    if (spoken) {
      candidates.push(spoken)
      continue
    }

    const addressLike = candidateFromPattern(line, ADDRESS_LIKE_PHRASE_PATTERN, 'ASR_SPOKEN_ADDRESS_PHRASE')
    if (addressLike) candidates.push(addressLike)
  }

  return candidates
}

function riskFlagsFor({ candidateAddress, rawText, confidence, multiple = false }) {
  const flags = []
  const normalizedCandidate = safePreNormalize(candidateAddress)
  const normalizedRaw = safePreNormalize(rawText)

  if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) flags.push('LOW_TRANSCRIPT_CONFIDENCE')
  if (isTruncatedEvidence(normalizedCandidate) || isTruncatedEvidence(normalizedRaw)) {
    flags.push('TRUNCATED_TRANSCRIPT')
  }
  if (SOCIAL_NOISE_PATTERN.test(normalizedRaw) || UNCERTAIN_PATTERN.test(normalizedRaw)) {
    flags.push('POSSIBLE_ASR_ERROR')
  }
  if (SOCIAL_NOISE_PATTERN.test(normalizedCandidate) || UNCERTAIN_PATTERN.test(normalizedCandidate)) {
    flags.push('DIRTY_TRANSCRIPT')
  }
  if (!hasAdminMarker(normalizedCandidate)) flags.push('MISSING_ADMIN_MARKER')
  if (!hasStreetMarker(normalizedCandidate)) flags.push('MISSING_STREET_MARKER')
  if (!hasHouseNumber(normalizedCandidate)) flags.push('MISSING_HOUSE_NUMBER')
  if (normalizedRaw.length > MAX_TRANSCRIPT_LENGTH || normalizedCandidate.length > MAX_CANDIDATE_LENGTH) {
    flags.push('LONG_TRANSCRIPT')
  }
  if (multiple) flags.push('MULTIPLE_ADDRESS_LIKE_PHRASES')

  return [...new Set(flags)]
}

function isCandidateRejected({
  candidateAddress,
  rawText,
  riskFlags,
}) {
  const lines = textLines(rawText)
  if (!candidateAddress) return true
  if (riskFlags.includes('TRUNCATED_TRANSCRIPT')) return true
  if (riskFlags.includes('DIRTY_TRANSCRIPT')) return true
  if (riskFlags.includes('LONG_TRANSCRIPT')) return true
  if (riskFlags.includes('POSSIBLE_ASR_ERROR')) return true
  if (lines.length > MAX_RAW_LINES) return true
  if (!hasFullAddressShape(candidateAddress)) return true
  return false
}

function createCandidate(rawCandidate, item, { multiple = false } = {}) {
  const candidateAddress = safePreNormalize(rawCandidate.candidateAddress)
  const riskFlags = riskFlagsFor({
    candidateAddress,
    rawText: item.text,
    confidence: item.confidence,
    multiple,
  })

  if (isCandidateRejected({
    candidateAddress,
    rawText: item.text,
    riskFlags,
  })) {
    return {
      rejected: true,
      diagnostics: [
        diagnostic('ASR_CANDIDATE_REJECTED', 'ASR candidate did not pass Phase 5 safety rules', {
          riskFlags,
          extractionRule: rawCandidate.extractionRule,
        }),
      ],
    }
  }

  return {
    rejected: false,
    candidate: {
      sourceType: 'asr_transcript',
      candidateAddress,
      normalizedAddress: normalizeAddress(candidateAddress),
      rawText: item.text,
      timestampSeconds: item.timestampSeconds,
      transcriptConfidence: item.confidence,
      extractionRule: multiple ? 'ASR_MULTIPLE_ADDRESSES' : rawCandidate.extractionRule,
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

export function extractAsrAddressCandidates(asrResult, context = {}) {
  void context

  const items = transcriptItems(asrResult)
  if (!items.length) {
    return {
      status: 'NO_TRANSCRIPT',
      reason: 'NO_ASR_TRANSCRIPT',
      candidates: [],
      diagnostics: [],
    }
  }

  const rawMatches = []
  const diagnostics = []

  for (const item of items) {
    const matches = lineCandidates(item)
    for (const match of matches) rawMatches.push({ match, item })
  }

  if (!rawMatches.length) {
    const possibleNoise = items.some((item) => SOCIAL_NOISE_PATTERN.test(item.text) || UNCERTAIN_PATTERN.test(item.text))
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_ASR_ADDRESS_CANDIDATE',
      candidates: [],
      diagnostics: possibleNoise
        ? [diagnostic('POSSIBLE_ASR_ERROR', 'ASR transcript contained noisy or uncertain text')]
        : [],
    }
  }

  const multiple = rawMatches.length > 1
  const candidates = []
  for (const item of rawMatches) {
    const result = createCandidate(item.match, item.item, { multiple })
    diagnostics.push(...result.diagnostics)
    if (!result.rejected) candidates.push(result.candidate)
  }

  const uniqueCandidates = dedupeCandidates(candidates)
  const uniqueMultiple = uniqueCandidates.length > 1

  if (!uniqueCandidates.length) {
    return {
      status: 'NO_CANDIDATES',
      reason: 'NO_ASR_ADDRESS_CANDIDATE',
      candidates: [],
      diagnostics,
    }
  }

  if (uniqueMultiple) {
    const reviewCandidates = uniqueCandidates.map((candidate) => ({
      ...candidate,
      extractionRule: 'ASR_MULTIPLE_ADDRESSES',
      riskFlags: [...new Set([...candidate.riskFlags, 'MULTIPLE_ADDRESS_LIKE_PHRASES'])],
    }))

    return {
      status: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_ASR_ADDRESS_CANDIDATES',
      candidates: reviewCandidates,
      diagnostics: [
        ...diagnostics,
        diagnostic('MULTIPLE_ASR_ADDRESS_CANDIDATES', 'Multiple ASR address-like candidates were found'),
      ],
    }
  }

  return {
    status: 'OK',
    reason: 'ASR_ADDRESS_CANDIDATES_FOUND',
    candidates: uniqueCandidates,
    diagnostics,
  }
}

export default {
  extractAsrAddressCandidates,
}
