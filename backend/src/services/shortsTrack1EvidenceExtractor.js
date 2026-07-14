import {
  isTruncatedEvidence,
  normalizeAddress,
  safePreNormalize,
} from './shortsAddressNormalizer.js'

const ALLOWED_PREFIXES = ['ĐC:', 'Địa chỉ:', 'Address:']
const SOURCE_ORDER = ['description', 'page_metadata', 'title']

const HOUSE_NUMBER_PATTERN = String.raw`\b(?:số\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b`
const ADMIN_MARKER_PATTERN =
  /\b(?:Quận|Quan|Q\.|District|Phường|Phuong|P\.|TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Hà\s*Nội|Ha\s*Noi)\b/iu
const DISTRICT_OR_WARD_MARKER_PATTERN =
  /\b(?:Quận|Quan|Q\.|District|Phường|Phuong|P\.|Ward)\b/iu
const LOCAL_ADMIN_CLAUSE_PATTERN =
  /(?:,|\()\s*(?:[A-ZÀ-ỸĐ][\p{L}\p{M}'’.+-]*\s*){1,4}\)?(?:\s*$|[,)]|$)/u
const INELIGIBLE_ADDRESS_LABEL_PATTERN =
  /(?:^|[\s([{])(?:(?:dc|dia\s*chi|đ\/c)\s*:|(?:address|địa\s+chỉ)\s+:)/iu
const STREET_FORM_PATTERN =
  /\b(?:đường|duong|đ\.|d\.|street|road|hẻm|hem|ngõ|ngo|phố|pho|chợ|cho)\b/iu
const EXACT_PREFIX_BOUNDARIES = [
  /\r?\n/u,
  /►/u,
  /◄/u,
  /\|/u,
  /;/u,
  /-{8,}/u,
  /\bGiá\s+trung\s+bình\s*:/iu,
  /\bGiờ\s+mở\s+cửa\s*:/iu,
  /\bFollow\b/iu,
  /\bTheo\s+dõi\b/iu,
  /\bINSTAGRAM\b/iu,
  /\bTikTok\b/u,
  /\bTiktok\b/u,
  /\bLinkedin\b/iu,
  /\bBusiness\s+Inquiries\b/iu,
  /\bBusiness\s+Inquires\b/iu,
  /\bLiên\s+hệ\b/iu,
  /https?:\/\//iu,
]
const CLEAR_DESCRIPTION_NOISE_PATTERN =
  /(?:https?:\/\/|www\.|@|(?:^|\s)#|follow|theo\s+dõi|instagram|tiktok|linkedin|facebook|youtube|email|copyright|do\s+not\s+reup|đăng\s+ký|subscribe|liên\s+hệ|hotline|fax|đt\s*:)/iu
const SEPARATOR_PATTERN = /^\s*[-_.=]{3,}\s*$/u
const ADDRESS_TERMINAL_PATTERNS = [
  /\([^)]*(?:Quận|Quan|Q\.|District|Phường|Phuong|P\.|Ward|TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Hà\s*Nội|Ha\s*Noi)[^)]*\)/iu,
  /(?:Phường|Phuong|P\.|Ward)\s*[^,()]{1,60},\s*(?:Quận|Quan|Q\.|District)\s*[^,()]{1,60},\s*(?:TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Ho\s*Chi\s*Minh(?:\s*city)?|Hà\s*Nội|Ha\s*Noi)/iu,
  /(?:Quận|Quan|Q\.|District)\s*[^,()]{1,60},\s*(?:TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Ho\s*Chi\s*Minh(?:\s*city)?|Hà\s*Nội|Ha\s*Noi)/iu,
]
const CLEAR_DESCRIPTION_MAX_HOUSE_INDEX = 180
const MAX_ADDRESS_CANDIDATE_LENGTH = 180

function compactSignal(signal = {}) {
  return Object.fromEntries(
    Object.entries(signal).filter(([, value]) => value !== undefined),
  )
}

function sourceTextValues({ title, description, pageMetadataText } = {}) {
  return {
    title: String(title || ''),
    description: String(description || ''),
    page_metadata: String(pageMetadataText || ''),
  }
}

function earliestBoundaryIndex(text) {
  return EXACT_PREFIX_BOUNDARIES.reduce((earliest, boundary) => {
    const match = boundary.exec(text)
    if (!match) return earliest
    const index = Number(match.index || 0)
    return earliest === -1 || index < earliest ? index : earliest
  }, -1)
}

function boundedPrefixCandidate(text) {
  const boundaryIndex = earliestBoundaryIndex(text)
  const bounded = boundaryIndex >= 0
    ? text.slice(0, boundaryIndex)
    : text
  return safePreNormalize(bounded)
}

function extractAfterPrefix(text, prefix) {
  const value = String(text || '')
  const index = value.indexOf(prefix)
  if (index < 0) return null

  const afterPrefix = value.slice(index + prefix.length)
  const candidate = boundedPrefixCandidate(afterPrefix)
  if (candidate) return candidate

  return clearDescriptionUnits(afterPrefix)
    .map((unit) => extractAddressCandidateFromUnit(unit, { maxHouseIndex: 80 }))
    .find(Boolean) || null
}

function hasHouseNumber(text) {
  return new RegExp(HOUSE_NUMBER_PATTERN, 'iu').test(text)
}

function hasAdmin(text) {
  return ADMIN_MARKER_PATTERN.test(text) ||
    LOCAL_ADMIN_CLAUSE_PATTERN.test(safePreNormalize(text))
}

function hasDistrictOrWard(text) {
  return DISTRICT_OR_WARD_MARKER_PATTERN.test(text)
}

function hasIneligibleAddressLabel(text) {
  return INELIGIBLE_ADDRESS_LABEL_PATTERN.test(safePreNormalize(text))
}

function hasStreetNameShape(text) {
  const normalized = safePreNormalize(text)
  const houseMatch = normalized.match(new RegExp(HOUSE_NUMBER_PATTERN, 'iu'))
  if (!houseMatch) return false

  const afterHouse = normalized.slice(
    Number(houseMatch.index || 0) + houseMatch[0].length,
  )
  const beforeAdmin = afterHouse.split(ADMIN_MARKER_PATTERN)[0] || ''
  const words = beforeAdmin
    .replace(/[(),.-]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => /[A-Za-zÀ-ỹĐđ]/u.test(word))
  if (STREET_FORM_PATTERN.test(beforeAdmin)) {
    return words.length >= 1
  }

  const capitalizedWords = words.filter((word) => /^[A-ZÀ-ỸĐ]/u.test(word))
  return words.length >= 2 && capitalizedWords.length >= 2
}

function isNoiseUnit(text) {
  const normalized = safePreNormalize(text)
  return !normalized ||
    SEPARATOR_PATTERN.test(normalized) ||
    CLEAR_DESCRIPTION_NOISE_PATTERN.test(normalized)
}

function clearDescriptionUnits(text) {
  return String(text || '')
    .split(/\r?\n/u)
    .flatMap((line) => line.split(/[|;]/u))
    .map((line) => line.trim())
    .filter(Boolean)
}

function terminalEndIndex(tail) {
  let end = -1
  for (const pattern of ADDRESS_TERMINAL_PATTERNS) {
    const match = tail.match(pattern)
    if (!match) continue
    const nextEnd = Number(match.index || 0) + match[0].length
    end = Math.max(end, nextEnd)
  }
  return end
}

function extractAddressCandidateFromUnit(unit, { maxHouseIndex = CLEAR_DESCRIPTION_MAX_HOUSE_INDEX } = {}) {
  if (isNoiseUnit(unit)) return null

  const normalized = safePreNormalize(unit)
  const houseRegex = new RegExp(HOUSE_NUMBER_PATTERN, 'igu')
  for (const match of normalized.matchAll(houseRegex)) {
    const start = Number(match.index || 0)
    if (start > maxHouseIndex) continue

    const tail = normalized
      .slice(start)
      .replace(/^(?:số|so)\s+/iu, '')
      .trim()
    const end = terminalEndIndex(tail)
    if (end < 0) continue

    const candidate = safePreNormalize(tail.slice(0, end))
    if (
      candidate.length <= MAX_ADDRESS_CANDIDATE_LENGTH &&
      hasHouseNumber(candidate) &&
      hasStreetNameShape(candidate) &&
      hasAdmin(candidate) &&
      hasDistrictOrWard(candidate)
    ) {
      return candidate
    }
  }

  return null
}

export function findExactPrefixAddress(text) {
  for (const prefix of ALLOWED_PREFIXES) {
    const candidate = extractAfterPrefix(text, prefix)
    if (!candidate) continue
    return {
      prefix,
      candidateAddress: candidate,
      normalizedAddress: isTruncatedEvidence(candidate)
        ? null
        : normalizeAddress(candidate),
      truncated: isTruncatedEvidence(candidate),
    }
  }
  return null
}

export function isClearDescriptionAddress(text) {
  const normalized = safePreNormalize(text)
  if (!normalized || hasIneligibleAddressLabel(normalized)) {
    return {
      ok: false,
      candidateAddress: null,
      normalizedAddress: null,
      truncated: false,
    }
  }

  for (const unit of clearDescriptionUnits(text)) {
    const candidate = extractAddressCandidateFromUnit(unit)
    if (!candidate) continue
    if (isTruncatedEvidence(candidate)) {
      return {
        ok: false,
        candidateAddress: candidate,
        normalizedAddress: null,
        truncated: true,
      }
    }
    return {
      ok: true,
      candidateAddress: candidate,
      normalizedAddress: normalizeAddress(candidate),
      truncated: false,
    }
  }

  return {
    ok: false,
    candidateAddress: null,
    normalizedAddress: null,
    truncated: false,
  }
}

function jsonldAddressValue(value) {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) {
    return value.map(jsonldAddressValue).find(Boolean) || null
  }
  if (typeof value !== 'object') return null

  const parts = [
    value.streetAddress,
    value.addressLocality,
    value.addressRegion,
    value.postalCode,
    value.addressCountry,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function findJsonldAddress(objects = []) {
  const stack = Array.isArray(objects) ? [...objects] : [objects]
  while (stack.length) {
    const current = stack.shift()
    if (!current || typeof current !== 'object') continue
    if (Object.hasOwn(current, 'address')) {
      const value = jsonldAddressValue(current.address)
      if (value) return value
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) stack.push(...value)
        else stack.push(value)
      }
    }
  }
  return null
}

export function extractTrack1Evidence({
  title = '',
  description = '',
  pageMetadataText = '',
  jsonldObjects = [],
} = {}) {
  const signals = []
  const texts = sourceTextValues({ title, description, pageMetadataText })

  for (const source of SOURCE_ORDER) {
    const exact = findExactPrefixAddress(texts[source])
    if (!exact) continue
    signals.push(compactSignal({
      source,
      rule: 'EXACT_PREFIX',
      prefix: exact.prefix,
      accepted: !exact.truncated,
      reason: exact.truncated ? 'TRUNCATED_EVIDENCE' : 'EXPLICIT_LABEL',
    }))
    if (exact.truncated) {
      return {
        accepted: false,
        reason: 'TRUNCATED_EVIDENCE',
        evidenceSource: source,
        candidateAddress: exact.candidateAddress,
        normalizedAddress: null,
        signals,
      }
    }
    return {
      accepted: true,
      reason: 'EXPLICIT_LABEL',
      evidenceSource: source,
      candidateAddress: exact.candidateAddress,
      normalizedAddress: exact.normalizedAddress,
      confidence: 0.95,
      signals,
    }
  }

  const jsonldAddress = findJsonldAddress(jsonldObjects)
  if (jsonldAddress) {
    const truncated = isTruncatedEvidence(jsonldAddress)
    signals.push({
      source: 'jsonld',
      rule: 'JSONLD_ADDRESS',
      accepted: !truncated,
      reason: truncated ? 'TRUNCATED_EVIDENCE' : 'JSONLD_ADDRESS',
    })
    if (truncated) {
      return {
        accepted: false,
        reason: 'TRUNCATED_EVIDENCE',
        evidenceSource: 'jsonld',
        candidateAddress: jsonldAddress,
        normalizedAddress: null,
        signals,
      }
    }
    return {
      accepted: true,
      reason: 'JSONLD_ADDRESS',
      evidenceSource: 'jsonld',
      candidateAddress: jsonldAddress,
      normalizedAddress: normalizeAddress(jsonldAddress),
      confidence: 0.92,
      signals,
    }
  }

  const descriptionAddress = isClearDescriptionAddress(description)
  signals.push({
    source: 'description',
    rule: 'CLEAR_DESCRIPTION',
    accepted: descriptionAddress.ok,
    reason: descriptionAddress.truncated
      ? 'TRUNCATED_EVIDENCE'
      : descriptionAddress.ok
        ? 'CLEAR_DESCRIPTION'
        : 'NO_CLEAR_DESCRIPTION',
  })
  if (descriptionAddress.truncated) {
    return {
      accepted: false,
      reason: 'TRUNCATED_EVIDENCE',
      evidenceSource: 'description',
      candidateAddress: description,
      normalizedAddress: null,
      signals,
    }
  }
  if (descriptionAddress.ok) {
    return {
      accepted: true,
      reason: 'CLEAR_DESCRIPTION',
      evidenceSource: 'description',
      candidateAddress: descriptionAddress.candidateAddress,
      normalizedAddress: descriptionAddress.normalizedAddress,
      confidence: 0.9,
      signals,
    }
  }

  return {
    accepted: false,
    reason: 'NO_EXPLICIT_EVIDENCE',
    evidenceSource: null,
    candidateAddress: null,
    normalizedAddress: null,
    signals,
  }
}

export const __shortsTrack1EvidenceTestUtils = {
  ALLOWED_PREFIXES,
  hasHouseNumber,
  hasStreetNameShape,
  hasAdmin,
  hasIneligibleAddressLabel,
}
