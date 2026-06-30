import { isTruncatedEvidence, normalizeAddress } from './shortsAddressNormalizer.js'

const ALLOWED_STATUSES = new Set([
  'OK',
  'DAMAGED',
  'NO_ADDRESS',
  'MULTIPLE_ADDRESSES',
])

const ALLOWED_OPERATIONS = new Set([
  'NFKC',
  'WHITESPACE_NORMALIZATION',
  'PUNCTUATION_NORMALIZATION',
  'SAFE_ABBREVIATION_EXPANSION',
  'DECORATION_REMOVAL',
])

const MAX_CLEAN_CANDIDATE_LENGTH = 180
const HOUSE_NUMBER_PATTERN =
  /\b(?:số\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b/iu
const ADMIN_MARKER_PATTERN =
  /\b(?:Quận|Quan|Q\.|District|Phường|Phuong|P\.|Ward|TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Ho\s*Chi\s*Minh(?:\s*city)?|Hà\s*Nội|Ha\s*Noi)\b/iu
const STREET_FORM_PATTERN =
  /\b(?:đường|duong|đ\.|d\.|street|road|hẻm|hem|ngõ|ngo|phố|pho|chợ|cho)\b/iu
const DIRTY_EVIDENCE_PATTERN =
  /(?:https?:\/\/|www\.|@|(?:^|\s)#|follow|theo\s+dõi|instagram|tiktok|facebook|youtube|email|copyright|subscribe|liên\s+hệ|hotline)/iu
const ADDRESS_LABEL_PATTERN =
  /(?:^|[\s([{])(?:(?:dc|dia\s*chi|đ\/c)\s*:|(?:address|địa\s+chỉ)\s*:)/giu

function safeString(value) {
  return String(value || '').trim()
}

function normalizeSearchText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
}

function countAddressLabels(value) {
  return [...safeString(value).matchAll(ADDRESS_LABEL_PATTERN)].length
}

function hasStreetNameShape(value) {
  const text = safeString(value)
  const houseMatch = text.match(HOUSE_NUMBER_PATTERN)
  if (!houseMatch) return false

  const afterHouse = text.slice(Number(houseMatch.index || 0) + houseMatch[0].length)
  if (STREET_FORM_PATTERN.test(afterHouse)) return true

  const beforeAdmin = afterHouse.split(ADMIN_MARKER_PATTERN)[0] || ''
  const words = beforeAdmin
    .replace(/[(),.-]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => /[A-Za-zÀ-ỹĐđ]/u.test(word))
  return words.length >= 2
}

function deterministicValidation(candidate) {
  const text = safeString(candidate)
  if (!text) {
    return {
      status: 'NO_ADDRESS',
      normalizedAddress: null,
      explanation: 'empty_candidate',
      validationReason: 'empty_candidate',
    }
  }

  if (text.length > MAX_CLEAN_CANDIDATE_LENGTH) {
    return {
      status: 'DAMAGED',
      normalizedAddress: null,
      explanation: 'long_description_block',
      validationReason: 'long_description_block',
    }
  }

  if (DIRTY_EVIDENCE_PATTERN.test(text)) {
    return {
      status: 'DAMAGED',
      normalizedAddress: null,
      explanation: 'dirty_candidate_evidence',
      validationReason: 'dirty_candidate_evidence',
    }
  }

  if (countAddressLabels(text) > 1) {
    return {
      status: 'MULTIPLE_ADDRESSES',
      normalizedAddress: null,
      explanation: 'multiple_address_labels',
      validationReason: 'multiple_address_labels',
    }
  }

  if (isTruncatedEvidence(text)) {
    return {
      status: 'DAMAGED',
      normalizedAddress: null,
      explanation: 'truncated_candidate',
      validationReason: 'truncated_candidate',
    }
  }

  const normalizedText = normalizeSearchText(text)
  const addressLike =
    HOUSE_NUMBER_PATTERN.test(text) &&
    ADMIN_MARKER_PATTERN.test(text) &&
    hasStreetNameShape(text) &&
    !/\b(?:gia|price|menu|follow|subscribe)\b/iu.test(normalizedText)

  if (!addressLike) return null

  return {
    status: 'OK',
    normalizedAddress: normalizeAddress(text),
    explanation: 'deterministic_bounded_address_ok',
    validationReason: 'bounded_address_like',
  }
}

function extractJsonText(text) {
  const value = safeString(text)
  if (!value) return null
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  return start >= 0 && end > start ? value.slice(start, end + 1) : value
}

function responseText(response) {
  if (typeof response === 'string') return response
  if (!response || typeof response !== 'object') return ''
  if (typeof response.text === 'string') return response.text
  if (typeof response.output_text === 'string') return response.output_text
  if (typeof response.content === 'string') return response.content
  const candidateText = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
  return candidateText || ''
}

function parseJsonResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const directKeys = ['status', 'normalizedAddress', 'operationsApplied']
    if (directKeys.some((key) => Object.hasOwn(response, key))) {
      return response
    }
    if (response.json && typeof response.json === 'object') {
      return response.json
    }
  }

  const jsonText = extractJsonText(responseText(response))
  return jsonText ? JSON.parse(jsonText) : {}
}

async function callGeminiJson(geminiClient, request) {
  if (typeof geminiClient === 'function') return parseJsonResponse(await geminiClient(request))
  if (geminiClient && typeof geminiClient.generateJson === 'function') {
    return parseJsonResponse(await geminiClient.generateJson(request))
  }
  if (geminiClient && typeof geminiClient.generateContent === 'function') {
    return parseJsonResponse(await geminiClient.generateContent(request))
  }
  throw new Error('GEMINI_CLIENT_MISSING')
}

function buildCleanRequest({
  rawCandidate,
  sourceType,
  sourceName,
  sourceSnippet,
}) {
  return {
    task: 'SHORTS_TRACK_1_ADDRESS_CLEAN_NO_REPAIR',
    responseFormat: 'json',
    schema: {
      status: ['OK', 'DAMAGED', 'NO_ADDRESS', 'MULTIPLE_ADDRESSES'],
      normalizedAddress: 'string|null',
      operationsApplied: [...ALLOWED_OPERATIONS],
      disallowedRepairDetected: 'boolean',
      explanation: 'string',
    },
    rules: {
      allowedOperations: [...ALLOWED_OPERATIONS],
      forbidden: [
        'ADD_MISSING_HOUSE_NUMBER',
        'ADD_MISSING_DISTRICT',
        'GUESS_STREET_NAME',
        'REPAIR_OCR_DAMAGED_TEXT',
        'INFER_FROM_SHOP_NAME',
        'INFER_FROM_PLACES',
        'MERGE_MULTIPLE_ADDRESSES',
        'COMPLETE_TRUNCATED_TEXT',
      ],
    },
    input: {
      rawCandidate: safeString(rawCandidate),
      sourceType: safeString(sourceType),
      sourceName: safeString(sourceName),
      sourceSnippet: safeString(sourceSnippet),
    },
  }
}

function fallbackResult(status, explanation) {
  return {
    status,
    normalizedAddress: null,
    operationsApplied: [],
    disallowedRepairDetected: status === 'DAMAGED',
    explanation,
    validationReason: explanation,
    rawValidationReason: explanation,
  }
}

export async function cleanAddressNoRepair({
  rawCandidate,
  sourceType = '',
  sourceName = '',
  sourceSnippet = '',
  geminiClient,
} = {}) {
  const candidate = safeString(rawCandidate)
  if (!candidate) return fallbackResult('NO_ADDRESS', 'empty_candidate')

  const deterministic = deterministicValidation(candidate)
  if (deterministic) {
    return {
      status: deterministic.status,
      normalizedAddress:
        deterministic.status === 'OK' ? deterministic.normalizedAddress : null,
      operationsApplied:
        deterministic.status === 'OK'
          ? ['NFKC', 'WHITESPACE_NORMALIZATION', 'PUNCTUATION_NORMALIZATION', 'SAFE_ABBREVIATION_EXPANSION']
          : [],
      disallowedRepairDetected: deterministic.status === 'DAMAGED',
      explanation: deterministic.explanation,
      validationReason: deterministic.validationReason,
      rawValidationReason: deterministic.validationReason,
    }
  }

  if (!geminiClient) return fallbackResult('DAMAGED', 'gemini_client_missing')

  let rawResult
  try {
    rawResult = await callGeminiJson(
      geminiClient,
      buildCleanRequest({ rawCandidate: candidate, sourceType, sourceName, sourceSnippet }),
    )
  } catch {
    return fallbackResult('DAMAGED', 'provider_error')
  }

  const status = ALLOWED_STATUSES.has(rawResult.status)
    ? rawResult.status
    : 'DAMAGED'
  const operations = Array.isArray(rawResult.operationsApplied)
    ? rawResult.operationsApplied.map(safeString).filter(Boolean)
    : []
  const invalidOperations = operations.filter((operation) => !ALLOWED_OPERATIONS.has(operation))
  const normalizedAddress = safeString(rawResult.normalizedAddress)
    || (status === 'OK' ? normalizeAddress(candidate) : null)
  const repairedTruncatedEvidence = isTruncatedEvidence(candidate) && !isTruncatedEvidence(normalizedAddress)
  const disallowedRepairDetected = Boolean(
    rawResult.disallowedRepairDetected ||
    invalidOperations.length ||
    repairedTruncatedEvidence,
  )

  return {
    status,
    normalizedAddress: status === 'OK' ? normalizedAddress : null,
    operationsApplied: operations.filter((operation) => ALLOWED_OPERATIONS.has(operation)),
    disallowedRepairDetected,
    explanation: safeString(rawResult.explanation)
      || (invalidOperations.length ? 'invalid_operations' : ''),
    validationReason:
      safeString(rawResult.validationReason) ||
      (disallowedRepairDetected ? 'disallowed_repair_detected' : 'gemini_clean_result'),
    rawValidationReason:
      safeString(rawResult.validationReason) ||
      safeString(rawResult.explanation) ||
      (disallowedRepairDetected ? 'disallowed_repair_detected' : 'gemini_clean_result'),
  }
}

export default {
  cleanAddressNoRepair,
}
