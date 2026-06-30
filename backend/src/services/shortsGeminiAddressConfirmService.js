const ELIGIBLE_SOURCE_TYPES = new Set([
  'title',
  'description',
  'page_metadata',
  'jsonld',
])

const ALLOWED_DECISIONS = new Set([
  'CONFIRMED',
  'REJECT_TO_TRACK2',
  'UNSURE',
])

const ALLOWED_REASON_CODES = new Set([
  'EXACT_HOUSE_NUMBER',
  'STREET_MATCH',
  'DISTRICT_MATCH',
  'CITY_MATCH',
  'NAME_MATCH',
  'TYPE_MATCH',
  'SOURCE_NOT_ELIGIBLE',
  'REPAIR_NEEDED',
  'CONFLICTING_CANDIDATES',
  'TRUNCATED_EVIDENCE',
  'LOW_CONFIDENCE',
  'NO_PLACES_MATCH',
])

function safeString(value) {
  return String(value || '').trim()
}

function clampConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
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
    const directKeys = ['decision', 'confidence', 'bestPlaceId', 'reasonCodes']
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

function safeReasonCodes(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(safeString)
    .filter((code) => ALLOWED_REASON_CODES.has(code))
}

function fallbackResult(decision, reasonCodes, explanation) {
  return {
    decision,
    confidence: 0,
    bestPlaceId: null,
    reasonCodes,
    explanation,
  }
}

function buildConfirmRequest({
  sourceType,
  rawCandidate,
  normalizedCandidate,
  cleanedAddress,
  sourceReason,
  shopName,
  placeNameContexts,
  placesCandidates,
}) {
  return {
    task: 'SHORTS_TRACK_1_EXPLICIT_ADDRESS_CONFIRM',
    responseFormat: 'json',
    schema: {
      decision: ['CONFIRMED', 'REJECT_TO_TRACK2', 'UNSURE'],
      confidence: 'number_0_to_1',
      bestPlaceId: 'string|null',
      reasonCodes: [...ALLOWED_REASON_CODES],
      explanation: 'string',
    },
    rules: {
      role: 'judge_only',
      acceptOnlyIf: [
        'PLACE_CANDIDATE_MATCHES_ORIGINAL_ADDRESS',
        'HOUSE_NUMBER_STREET_AND_LOCAL_ADMIN_DO_NOT_CONFLICT',
        'SOURCE_EVIDENCE_REMAINS_TRACK_1_ELIGIBLE',
        'CONFIDENCE_IS_AT_LEAST_0_90_FOR_FINAL_TRACK_1',
      ],
      rejectIf: [
        'HOUSE_NUMBER_STREET_OR_LOCAL_ADMIN_CONFLICTS',
        'PLACE_IS_ONLY_NEARBY_OR_UNRELATED',
        'SOURCE_IS_NOT_TRACK_1_ELIGIBLE',
        'ADDRESS_WAS_REPAIRED_OR_INFERRED',
      ],
      forbidden: [
        'CREATE_ADDRESS',
        'REWRITE_ADDRESS',
        'REPAIR_ADDRESS',
        'INFER_MISSING_ADDRESS_PARTS',
      ],
    },
    input: {
      sourceType: safeString(sourceType),
      evidenceSource: safeString(sourceType),
      sourceReason: safeString(sourceReason),
      rawCandidate: safeString(rawCandidate),
      normalizedCandidate: safeString(normalizedCandidate),
      originalCandidateAddress: safeString(rawCandidate),
      cleanedAddress: safeString(cleanedAddress || normalizedCandidate),
      shopName: safeString(shopName),
      placeNameContexts: (Array.isArray(placeNameContexts) ? placeNameContexts : [])
        .map((item) => ({
          name: safeString(item?.name),
          source: safeString(item?.source),
        }))
        .filter((item) => item.name)
        .slice(0, 2),
      placesCandidates: Array.isArray(placesCandidates) ? placesCandidates : [],
    },
  }
}

export async function confirmExplicitAddressWithGemini({
  sourceType = '',
  rawCandidate = '',
  normalizedCandidate = '',
  cleanedAddress = '',
  sourceReason = '',
  shopName = '',
  placeNameContexts = [],
  placesCandidates = [],
  geminiClient,
} = {}) {
  if (!ELIGIBLE_SOURCE_TYPES.has(sourceType)) {
    return fallbackResult('REJECT_TO_TRACK2', ['SOURCE_NOT_ELIGIBLE'], 'source_not_eligible')
  }

  if (!Array.isArray(placesCandidates) || placesCandidates.length === 0) {
    return fallbackResult('REJECT_TO_TRACK2', ['NO_PLACES_MATCH'], 'no_places_match')
  }

  if (!geminiClient) {
    return fallbackResult('UNSURE', ['NO_PLACES_MATCH'], 'gemini_client_missing')
  }

  let rawResult
  try {
    rawResult = await callGeminiJson(
      geminiClient,
      buildConfirmRequest({
        sourceType,
        rawCandidate,
        normalizedCandidate,
        cleanedAddress,
        sourceReason,
        shopName,
        placeNameContexts,
        placesCandidates,
      }),
    )
  } catch {
    return fallbackResult('UNSURE', [], 'provider_error')
  }

  const decision = ALLOWED_DECISIONS.has(rawResult.decision)
    ? rawResult.decision
    : 'UNSURE'

  return {
    decision,
    confidence: clampConfidence(rawResult.confidence),
    bestPlaceId: safeString(rawResult.bestPlaceId) || null,
    reasonCodes: safeReasonCodes(rawResult.reasonCodes),
    explanation: safeString(rawResult.explanation),
  }
}

export const __shortsGeminiAddressConfirmTestUtils = {
  ALLOWED_REASON_CODES,
  ELIGIBLE_SOURCE_TYPES,
}

export default {
  confirmExplicitAddressWithGemini,
}
