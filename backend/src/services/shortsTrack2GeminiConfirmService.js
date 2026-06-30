const OCR_SOURCE_TYPES = new Set(['ocr_frame', 'ocr_repeated_frame'])
const ASR_SOURCE_TYPES = new Set(['asr_transcript'])
const PLACE_INFERENCE_SOURCE_TYPES = new Set(['place_name_inference'])
const ALLOWED_SOURCE_TYPES = new Set([...OCR_SOURCE_TYPES, ...ASR_SOURCE_TYPES, ...PLACE_INFERENCE_SOURCE_TYPES])
const ALLOWED_DECISIONS = new Set(['CONFIRMED', 'REJECTED', 'UNSURE'])

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function clampConfidence(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return numeric
}

function safeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => {
      if (typeof diagnostic === 'string') return { message: safeString(diagnostic, 240) }
      if (!diagnostic || typeof diagnostic !== 'object') return null
      return {
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 120) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message, 240) } : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 8)
}

function result({
  status,
  decision,
  confidence = 0,
  reason,
  explanation = '',
  diagnostics = [],
}) {
  return {
    status,
    decision,
    confidence: clampConfidence(confidence),
    reason: safeString(reason, 120),
    explanation: safeString(explanation, 500),
    diagnostics: safeDiagnostics(diagnostics),
  }
}

function extractJsonText(text) {
  const value = safeString(text, 4000)
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
  return response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || ''
}

function parseJsonResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const directKeys = ['decision', 'confidence', 'reason', 'explanation']
    if (directKeys.some((key) => Object.hasOwn(response, key))) return response
    if (response.json && typeof response.json === 'object') return response.json
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
  throw new Error('GEMINI_CLIENT_UNAVAILABLE')
}

function usablePlacesCandidate(places = {}) {
  if (places?.placeId) return { placeId: safeString(places.placeId) }
  return (Array.isArray(places?.candidates) ? places.candidates : [])
    .find((candidate) => safeString(candidate?.placeId))
}

function buildConfirmRequest({
  candidate,
  clean,
  places,
  metadata,
  sourceUrl,
  videoId,
  mode = 'OCR',
}) {
  const isAsr = mode === 'ASR'

  return {
    task: isAsr ? 'SHORTS_TRACK_2_ASR_ADDRESS_CONFIRM' : 'SHORTS_TRACK_2_OCR_ADDRESS_CONFIRM',
    responseFormat: 'json',
    schema: {
      decision: ['CONFIRMED', 'REJECTED', 'UNSURE'],
      confidence: 'number_0_to_1',
      reason: 'string',
      explanation: 'string',
    },
    rules: {
      role: 'judge_only',
      confirmOnlyIf: [
        isAsr
          ? 'ASR_TRANSCRIPT_CLEARLY_CONTAINS_SPOKEN_ADDRESS'
          : 'OCR_CANDIDATE_CLEARLY_CONTAINS_ADDRESS',
        isAsr
          ? 'CLEANED_ADDRESS_IS_SAFE_NORMALIZATION_OF_TRANSCRIPT_TEXT'
          : 'CLEANED_ADDRESS_IS_SAFE_NORMALIZATION_OF_OCR_TEXT',
        'PLACES_CANDIDATE_IS_CONSISTENT_WITH_ADDRESS',
        isAsr ? 'NO_CONFLICTING_TRANSCRIPT_EVIDENCE' : 'NO_CONFLICTING_ADDRESS_EVIDENCE',
      ],
      rejectIf: [
        isAsr ? 'TRANSCRIPT_IS_DAMAGED_OR_TRUNCATED' : 'OCR_TEXT_IS_DAMAGED_OR_TRUNCATED',
        'ADDRESS_WAS_REPAIRED_OR_COMPLETED',
        isAsr
          ? 'PLACES_CANDIDATE_CONFLICTS_WITH_TRANSCRIPT_ADDRESS'
          : 'PLACES_CANDIDATE_CONFLICTS_WITH_OCR_ADDRESS',
      ],
      forbidden: [
        'CREATE_ADDRESS',
        'REPAIR_ADDRESS',
        'ADD_MISSING_HOUSE_NUMBER',
        'ADD_MISSING_STREET',
        'ADD_MISSING_WARD_DISTRICT_OR_CITY',
        'INFER_FROM_TITLE_OR_SHOP_NAME',
      ],
    },
    input: {
      sourceType: safeString(candidate?.sourceType, 80),
      candidateAddress: safeString(candidate?.candidateAddress),
      normalizedAddress: safeString(candidate?.normalizedAddress),
      cleanedAddress: safeString(clean?.normalizedAddress),
      ...(isAsr
        ? { rawTranscriptText: safeString(candidate?.rawText, 1000) }
        : { rawOcrText: safeString(candidate?.rawText, 1000) }),
      riskFlags: Array.isArray(candidate?.riskFlags)
        ? candidate.riskFlags.map((flag) => safeString(flag, 80)).filter(Boolean)
        : [],
      placesCandidates: (Array.isArray(places?.candidates) ? places.candidates : [])
        .map((place) => ({
          placeId: safeString(place?.placeId, 120),
          displayName: safeString(place?.displayName, 200),
          formattedAddress: safeString(place?.formattedAddress, 300),
          primaryType: safeString(place?.primaryType, 120),
          businessStatus: safeString(place?.businessStatus, 120),
        }))
        .filter((place) => place.placeId)
        .slice(0, 5),
      metadata: {
        videoId: safeString(videoId || metadata?.videoId, 120),
        sourceUrl: safeString(sourceUrl || metadata?.url, 500),
      },
    },
  }
}

function firstPlaceName(placeSignals = {}) {
  return safeString(placeSignals?.signals?.placeNames?.[0] || placeSignals?.placeNames?.[0], 120)
}

function firstArea(placeSignals = {}) {
  return safeString(placeSignals?.signals?.areas?.[0] || placeSignals?.areas?.[0], 120)
}

function buildPlaceInferenceConfirmRequest({
  placeSignals,
  rankedCandidate,
  safety,
  metadata,
  sourceUrl,
  videoId,
}) {
  return {
    task: 'SHORTS_TRACK_2_PLACE_NAME_INFERENCE_CONFIRM',
    responseFormat: 'json',
    schema: {
      decision: ['CONFIRMED', 'REJECTED', 'UNSURE'],
      confidence: 'number_0_to_1',
      reason: 'string',
      explanation: 'string',
    },
    rules: {
      role: 'judge_only',
      confirmOnlyIf: [
        'METADATA_DISCUSS_ONE_SPECIFIC_PLACE',
        'EXTRACTED_PLACE_NAME_MATCHES_PLACES_DISPLAY_NAME',
        'AREA_SIGNAL_MATCHES_PLACES_ADDRESS',
        'NOT_GENERIC_LIST_OR_MULTI_PLACE_VIDEO',
        'NO_OCR_OR_ASR_CONFLICT',
      ],
      rejectIf: [
        'GENERIC_LIST_VIDEO',
        'FOOD_TOUR_OR_MULTI_PLACE_VIDEO',
        'DISH_ONLY_OR_AREA_ONLY_METADATA',
        'PLACE_NAME_DOES_NOT_MATCH_CANDIDATE',
      ],
      forbidden: [
        'INVENT_ADDRESS',
        'REPAIR_ADDRESS',
        'SELECT_FROM_WORLD_KNOWLEDGE',
        'CONFIRM_GENERIC_LIST_VIDEO',
      ],
    },
    input: {
      sourceType: 'place_name_inference',
      placeName: firstPlaceName(placeSignals),
      area: firstArea(placeSignals),
      safetyStatus: safeString(safety?.status, 40),
      safetyFlags: Array.isArray(safety?.flags)
        ? safety.flags.map((flag) => safeString(flag, 80)).filter(Boolean)
        : [],
      rankedCandidate: {
        placeId: safeString(rankedCandidate?.placeId, 120),
        displayName: safeString(rankedCandidate?.displayName, 200),
        formattedAddress: safeString(rankedCandidate?.formattedAddress, 300),
        primaryType: safeString(rankedCandidate?.primaryType, 120),
        businessStatus: safeString(rankedCandidate?.businessStatus, 120),
        score: clampConfidence(rankedCandidate?.score),
        scoreBreakdown: rankedCandidate?.scoreBreakdown || {},
        riskFlags: Array.isArray(rankedCandidate?.riskFlags)
          ? rankedCandidate.riskFlags.map((flag) => safeString(flag, 80)).filter(Boolean)
          : [],
      },
      metadata: {
        title: safeString(metadata?.title, 300),
        description: safeString(metadata?.description, 1000),
        videoId: safeString(videoId || metadata?.videoId, 120),
        sourceUrl: safeString(sourceUrl || metadata?.url, 500),
      },
    },
  }
}

async function confirmTrack2AddressWithGemini(input = {}, deps = {}, {
  allowedSourceTypes,
  mode,
  sourceExplanation,
} = {}) {
  const {
    candidate = {},
    clean = {},
    places = {},
    metadata = {},
    sourceUrl = '',
    videoId = '',
  } = input

  if (!allowedSourceTypes.has(candidate?.sourceType)) {
    return result({
      status: 'REJECTED',
      decision: 'REJECTED',
      reason: 'SOURCE_NOT_ELIGIBLE',
      explanation: sourceExplanation,
    })
  }

  if (clean?.status !== 'OK') {
    return result({
      status: 'REJECTED',
      decision: 'REJECTED',
      reason: 'CLEAN_NOT_OK',
      explanation: 'clean_result_not_ok',
    })
  }

  if (!usablePlacesCandidate(places)) {
    return result({
      status: 'OK',
      decision: 'UNSURE',
      reason: 'PLACES_NOT_CONFIRMED',
      explanation: 'places_candidate_missing',
    })
  }

  if (!deps.geminiClient) {
    return result({
      status: 'UNAVAILABLE',
      decision: 'UNSURE',
      reason: 'GEMINI_CLIENT_UNAVAILABLE',
      explanation: 'gemini_client_missing',
    })
  }

  let rawResult
  try {
    rawResult = await callGeminiJson(
      deps.geminiClient,
      buildConfirmRequest({ candidate, clean, places, metadata, sourceUrl, videoId, mode }),
    )
  } catch (error) {
    return result({
      status: 'ERROR',
      decision: 'UNSURE',
      reason: 'GEMINI_PROVIDER_ERROR',
      explanation: 'gemini_provider_error',
      diagnostics: [
        {
          code: safeString(error?.code || 'GEMINI_PROVIDER_ERROR', 120),
          message: safeString(error?.message || 'Gemini provider error', 240),
        },
      ],
    })
  }

  const decision = ALLOWED_DECISIONS.has(rawResult?.decision)
    ? rawResult.decision
    : null
  if (!decision) {
    return result({
      status: 'ERROR',
      decision: 'UNSURE',
      reason: 'GEMINI_INVALID_RESPONSE',
      explanation: 'invalid_or_missing_decision',
    })
  }

  return result({
    status: 'OK',
    decision,
    confidence: rawResult.confidence,
    reason: rawResult.reason || decision,
    explanation: rawResult.explanation,
    diagnostics: rawResult.diagnostics,
  })
}

export async function confirmTrack2OcrAddressWithGemini(input = {}, deps = {}) {
  return confirmTrack2AddressWithGemini(input, deps, {
    allowedSourceTypes: OCR_SOURCE_TYPES,
    mode: 'OCR',
    sourceExplanation: 'candidate_source_not_ocr',
  })
}

export async function confirmTrack2AsrAddressWithGemini(input = {}, deps = {}) {
  return confirmTrack2AddressWithGemini(input, deps, {
    allowedSourceTypes: ASR_SOURCE_TYPES,
    mode: 'ASR',
    sourceExplanation: 'candidate_source_not_asr',
  })
}

export async function confirmTrack2PlaceInferenceWithGemini(input = {}, deps = {}) {
  const {
    placeSignals = {},
    rankedCandidate = {},
    safety = {},
    metadata = {},
    sourceUrl = '',
    videoId = '',
  } = input

  if (safety?.status !== 'OK') {
    return result({
      status: 'REJECTED',
      decision: 'UNSURE',
      reason: 'SAFETY_NOT_OK',
      explanation: 'place_inference_safety_not_ok',
    })
  }

  if (!firstPlaceName(placeSignals)) {
    return result({
      status: 'REJECTED',
      decision: 'REJECTED',
      reason: 'MISSING_PLACE_NAME',
      explanation: 'place_name_missing',
    })
  }

  if (!firstArea(placeSignals)) {
    return result({
      status: 'OK',
      decision: 'UNSURE',
      reason: 'MISSING_AREA_SIGNAL',
      explanation: 'area_signal_missing',
    })
  }

  if (!rankedCandidate?.placeId || Number(rankedCandidate?.score) < 0.85) {
    return result({
      status: 'OK',
      decision: 'UNSURE',
      reason: 'RANKED_CANDIDATE_TOO_WEAK',
      explanation: 'ranked_candidate_score_below_threshold',
    })
  }

  if (!deps.geminiClient) {
    return result({
      status: 'UNAVAILABLE',
      decision: 'UNSURE',
      reason: 'GEMINI_CLIENT_UNAVAILABLE',
      explanation: 'gemini_client_missing',
    })
  }

  let rawResult
  try {
    rawResult = await callGeminiJson(
      deps.geminiClient,
      buildPlaceInferenceConfirmRequest({
        placeSignals,
        rankedCandidate,
        safety,
        metadata,
        sourceUrl,
        videoId,
      }),
    )
  } catch (error) {
    return result({
      status: 'ERROR',
      decision: 'UNSURE',
      reason: 'GEMINI_PROVIDER_ERROR',
      explanation: 'gemini_provider_error',
      diagnostics: [
        {
          code: safeString(error?.code || 'GEMINI_PROVIDER_ERROR', 120),
          message: safeString(error?.message || 'Gemini provider error', 240),
        },
      ],
    })
  }

  const decision = ALLOWED_DECISIONS.has(rawResult?.decision)
    ? rawResult.decision
    : null
  if (!decision) {
    return result({
      status: 'ERROR',
      decision: 'UNSURE',
      reason: 'GEMINI_INVALID_RESPONSE',
      explanation: 'invalid_or_missing_decision',
    })
  }

  return result({
    status: 'OK',
    decision,
    confidence: rawResult.confidence,
    reason: rawResult.reason || decision,
    explanation: rawResult.explanation,
    diagnostics: rawResult.diagnostics,
  })
}

export const __shortsTrack2GeminiConfirmTestUtils = {
  ALLOWED_SOURCE_TYPES,
  OCR_SOURCE_TYPES,
  ASR_SOURCE_TYPES,
  PLACE_INFERENCE_SOURCE_TYPES,
}

export default {
  confirmTrack2OcrAddressWithGemini,
  confirmTrack2AsrAddressWithGemini,
  confirmTrack2PlaceInferenceWithGemini,
}
