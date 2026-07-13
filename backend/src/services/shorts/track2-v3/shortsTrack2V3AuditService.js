import { detectShortsTrack2V3EvidenceTokens } from './shortsTrack2V3EvidenceStoreService.js'

export const TRACK2_V3_AUDIT_CATEGORIES = Object.freeze([
  'overlay_full_address',
  'overlay_partial_address',
  'generic_caption_only',
  'metadata_only',
  'audio_only',
  'multi_candidate',
  'no_address_expected',
  'hard_ocr',
  'metadata_multi_location',
  'metadata_single_address',
  'visual_screen_pinned_address',
  'place_name_area_hint',
  'nonfood_address_like',
])

export const TRACK2_V3_AUDIT_EXPECTED_OUTCOMES = Object.freeze([
  'REVIEW_CANDIDATE',
  'CORRECT_UNRESOLVED',
  'MULTI_REVIEW',
  'METADATA_NEEDED',
  'SELECTOR_OR_OCR_MISSED',
  'HARD_OCR_REVIEW',
  'GENERIC_REJECTED',
  'NONFOOD_REJECTED',
  'METADATA_MULTI_REVIEW',
  'METADATA_REVIEW_CANDIDATE',
  'VISUAL_OCR_REVIEW_CANDIDATE',
  'SELECTOR_MISSED_VISIBLE_ADDRESS',
  'PLACE_HINT_REVIEW_OR_UNRESOLVED',
  'CORRECT_UNRESOLVED_NONFOOD',
])

export const TRACK2_V3_AUDIT_CLOSURE_STATUSES = Object.freeze([
  'PASSED_EXPECTED_REVIEW_CANDIDATE',
  'PASSED_EXPECTED_UNRESOLVED',
  'PASSED_EXPECTED_REJECTION',
  'FAILED_MISSING_EXPECTED_CANDIDATE',
  'FAILED_FALSE_CANDIDATE',
  'FAILED_UNSUPPORTED_HOUSE_NUMBER',
  'NEEDS_METADATA_EVIDENCE',
  'NEEDS_SELECTOR_REVIEW',
  'NEEDS_HIGH_RES_OCR',
  'NEEDS_PARSER_RELAXATION',
  'NEEDS_DATE_TIME_FILTERING',
  'UNKNOWN',
])

export const TRACK2_V3_AUDIT_FAILURE_CATEGORIES = Object.freeze([
  'GOOD_CANDIDATE',
  'REVIEW_ONLY_CANDIDATE',
  'NO_CANDIDATE',
  'SELECTOR_MISSED_TEXT',
  'OCR_NOISY',
  'OCR_HOUSE_NUMBER_CONFLICT',
  'GENERIC_CAPTION_ONLY',
  'PARSER_TOO_STRICT',
  'PROVIDER_ERROR',
  'UNSUPPORTED_VIDEO',
  'NO_ADDRESS_EXPECTED',
  'UNKNOWN',
])

const VALID_EXPECTED_RESOLUTIONS = new Set(['CANDIDATES', 'UNRESOLVED', 'ANY'])
const VALID_EXPECTED_OUTCOMES = new Set(TRACK2_V3_AUDIT_EXPECTED_OUTCOMES)
const REVIEW_RISK_FLAGS = new Set([
  'REVIEW_ONLY',
  'LOW_CONFIDENCE_OCR',
  'NOISY_OCR',
  'NOISY_HOUSE_NUMBER',
  'PARTIAL_ADDRESS',
  'MISSING_STREET_NAME',
])
const UNSUPPORTED_VIDEO_CODES = /(?:UNSUPPORTED|VIDEO_TOO_LONG|YTDLP|DOWNLOAD_FAILED|NO_VIDEO|FRAME_EXTRACTION_FAILED)/iu

function safeString(value, maxLength = 2000) {
  if (value == null) return ''
  return String(value).trim().slice(0, maxLength)
}

function safeStringArray(value, maxItems = 20, maxLength = 500) {
  return (Array.isArray(value) ? value : [])
    .slice(0, maxItems)
    .map((item) => safeString(item, maxLength))
    .filter(Boolean)
}

function sanitizeNumericContextClassifications(value = []) {
  return (Array.isArray(value) ? value : []).slice(0, 100).map((item) => ({
    rawNumberToken: safeString(item?.rawNumberToken, 80) || null,
    contextClass: safeString(item?.contextClass, 120) || null,
    boundedSourceText: safeString(item?.boundedSourceText, 500) || null,
    sourceType: safeString(item?.sourceType, 120) || null,
    sourceId: safeString(item?.sourceId, 160) || null,
  })).filter((item) => item.rawNumberToken && item.contextClass)
}

function numberMetric(result = {}, key, fallback = 0) {
  const direct = Number(result?.[key])
  if (Number.isFinite(direct)) return direct
  const parsed = Number(result.metrics?.[key])
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeReasonCounts(value = {}) {
  if (!value || typeof value !== 'object') return {}
  const counts = {}
  for (const [reason, count] of Object.entries(value)) {
    const safeReason = safeString(reason, 160)
    const parsed = Number(count)
    if (!safeReason || !Number.isFinite(parsed) || parsed <= 0) continue
    counts[safeReason] = (counts[safeReason] || 0) + parsed
  }
  return counts
}

function addReasonCounts(target = {}, source = {}) {
  for (const [reason, count] of Object.entries(safeReasonCounts(source))) {
    target[reason] = (target[reason] || 0) + count
  }
}

function sanitizeLocalOcrEngineDiagnostics(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).slice(0, 8).map(([key, run]) => [
    safeString(key, 120),
    {
      provider: safeString(run?.provider || key, 120) || null,
      status: safeString(run?.status, 40) || null,
      imageCountSent: Math.max(0, Number(run?.imageCountSent || 0)),
      runtimeMs: Math.max(0, Number(run?.runtimeMs || 0)),
      attemptCount: Math.max(0, Number(run?.attemptCount || 0)),
      fastAttemptCount: Math.max(0, Number(run?.fastAttemptCount || 0)),
      deepAttemptCount: Math.max(0, Number(run?.deepAttemptCount || 0)),
      deepPassImageCount: Math.max(0, Number(run?.deepPassImageCount || 0)),
      addressRankedInput: Boolean(run?.addressRankedInput),
    },
  ]).filter(([key]) => key))
}

function candidateCount(result = {}) {
  const candidates = Array.isArray(result.candidates) ? result.candidates : []
  return numberMetric(result, 'candidateCount', candidates.length)
}

function evidenceCount(result = {}) {
  const evidence = Array.isArray(result.evidence) ? result.evidence : []
  return numberMetric(result, 'evidenceCount', evidence.length)
}

function providerCalled(result = {}, key) {
  return Boolean(
    result?.[key] ||
    result?.providerCalls?.[key] ||
    result?.metrics?.[key],
  )
}

function sanitizeProviderErrors(value = []) {
  const optionalInteger = (input) => {
    if (input == null || input === '') return null
    const number = Number(input)
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null
  }
  return (Array.isArray(value) ? value : []).slice(0, 20).map((error) => ({
    provider: safeString(error?.provider, 120) || null,
    code: safeString(error?.code, 160) || 'PROVIDER_ERROR',
    message: safeString(error?.message, 500) || null,
    strategy: safeString(error?.strategy, 80) || null,
    attempt: optionalInteger(error?.attempt),
    httpStatus: optionalInteger(error?.httpStatus),
    googleErrorStatus: safeString(error?.googleErrorStatus, 120) || null,
    googleErrorCode: error?.googleErrorCode ?? null,
    googleErrorMessage: safeString(error?.googleErrorMessage, 1000) || null,
    fieldViolations: (Array.isArray(error?.fieldViolations)
      ? error.fieldViolations
      : []).slice(0, 20).map((violation) => ({
        field: safeString(violation?.field, 300) || null,
        description: safeString(violation?.description, 500) || null,
      })),
    endpointType: safeString(error?.endpointType, 40) || null,
    model: safeString(error?.model, 120) || null,
    pagePath: safeString(error?.pagePath, 2000) || null,
    originalBytes: optionalInteger(error?.originalBytes),
    sentBytes: optionalInteger(error?.sentBytes),
    imageBytes: optionalInteger(error?.imageBytes),
    base64Length: optionalInteger(error?.base64Length),
    requestBodyApproxBytes: optionalInteger(error?.requestBodyApproxBytes),
    mimeType: safeString(error?.mimeType, 80) || null,
    transportErrorMessage: safeString(error?.transportErrorMessage, 500) || null,
    providerErrorClass: safeString(error?.providerErrorClass, 120) || null,
    pageIndex: optionalInteger(error?.pageIndex),
    pageNumber: optionalInteger(error?.pageNumber),
    attemptNumber: optionalInteger(error?.attemptNumber),
    attemptRuntimeMs: optionalInteger(error?.attemptRuntimeMs),
    retryAfterPresent: Boolean(error?.retryAfterPresent),
    retryAfterRaw: safeString(error?.retryAfterRaw, 120) || null,
    retryAfterMs: optionalInteger(error?.retryAfterMs),
    retryAfterUsed: Boolean(error?.retryAfterUsed),
    retryDelayMs: optionalInteger(error?.retryDelayMs),
    finalPageStatus: safeString(error?.finalPageStatus, 80) || null,
    queueWaitMs: optionalInteger(error?.queueWaitMs),
    providerRuntimeMs: optionalInteger(error?.providerRuntimeMs),
  }))
}

function sanitizeGeminiPageResults(value = []) {
  const optionalInteger = (input) => {
    if (input == null || input === '') return null
    const number = Number(input)
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null
  }
  return (Array.isArray(value) ? value : []).slice(0, 20).map((page) => ({
    pageIndex: optionalInteger(page?.pageIndex),
    pageNumber: optionalInteger(page?.pageNumber),
    pagePath: safeString(page?.pagePath, 2000) || null,
    status: safeString(page?.status, 40) || null,
    pageStatus: safeString(page?.pageStatus, 80) || null,
    attemptCount: optionalInteger(page?.attemptCount) || 0,
    selectedCropIds: safeStringArray(page?.selectedCropIds, 100, 200),
    rejectedCropIds: safeStringArray(page?.rejectedCropIds, 100, 200),
    providerErrorClass: safeString(page?.providerErrorClass, 120) || null,
    httpStatus: optionalInteger(page?.httpStatus),
    retryDelays: (Array.isArray(page?.retryDelays) ? page.retryDelays : [])
      .slice(0, 10)
      .map((item) => optionalInteger(item))
      .filter((item) => item != null),
    retryAfterUsed: Boolean(page?.retryAfterUsed),
    queueWaitMs: optionalInteger(page?.queueWaitMs) || 0,
    providerRuntimeMs: optionalInteger(page?.providerRuntimeMs) || 0,
    backoffMs: optionalInteger(page?.backoffMs) || 0,
    dedupHit: Boolean(page?.dedupHit),
    attempts: (Array.isArray(page?.attempts) ? page.attempts : []).slice(0, 10).map((attempt) => ({
      attemptNumber: optionalInteger(attempt?.attemptNumber),
      status: safeString(attempt?.status, 40) || null,
      providerErrorClass: safeString(attempt?.providerErrorClass, 120) || null,
      httpStatus: optionalInteger(attempt?.httpStatus),
      retryAfterPresent: Boolean(attempt?.retryAfterPresent),
      retryAfterRaw: safeString(attempt?.retryAfterRaw, 120) || null,
      retryAfterMs: optionalInteger(attempt?.retryAfterMs),
      retryAfterUsed: Boolean(attempt?.retryAfterUsed),
      retryDelayMs: optionalInteger(attempt?.retryDelayMs) || 0,
      queueWaitMs: optionalInteger(attempt?.queueWaitMs) || 0,
      providerRuntimeMs: optionalInteger(attempt?.providerRuntimeMs) || 0,
      attemptRuntimeMs: optionalInteger(attempt?.attemptRuntimeMs) || 0,
    })),
  }))
}

function summarizeCandidate(candidate = {}) {
  return {
    type: safeString(candidate.type, 160) || null,
    displayText: safeString(candidate.displayText, 500) || null,
    addressFragment: safeString(candidate.addressFragment, 500) || null,
    placeName: safeString(candidate.placeName, 300) || null,
    evidenceSource: safeString(candidate.evidenceSource, 120) || null,
    evidenceSources: safeStringArray(candidate.evidenceSources, 20, 120),
    evidenceText: safeString(candidate.evidenceText, 1000) || null,
    evidenceTexts: safeStringArray(candidate.evidenceTexts, 20, 1000),
    riskFlags: safeStringArray(candidate.riskFlags, 30, 120),
    canAutoResolve: Boolean(candidate.canAutoResolve),
    houseNumberAlternatives: safeStringArray(candidate.houseNumberAlternatives, 20, 80),
    houseNumberConflict: Boolean(candidate.houseNumberConflict),
    evidenceType: safeString(candidate.evidenceType, 120) || null,
    rawAsrEvidenceText: safeString(candidate.rawAsrEvidenceText, 1000) || null,
    rawAsrSegments: (Array.isArray(candidate.rawAsrSegments) ? candidate.rawAsrSegments : [])
      .slice(0, 3)
      .map((segment) => ({
        start: Number.isFinite(Number(segment?.start)) ? Number(segment.start) : null,
        end: Number.isFinite(Number(segment?.end)) ? Number(segment.end) : null,
        text: safeString(segment?.text, 1000),
      }))
      .filter((segment) => segment.text),
    segmentStart: Number.isFinite(Number(candidate.segmentStart))
      ? Number(candidate.segmentStart)
      : null,
    segmentEnd: Number.isFinite(Number(candidate.segmentEnd))
      ? Number(candidate.segmentEnd)
      : null,
    asrProvider: safeString(candidate.asrProvider, 120) || null,
    asrModel: safeString(candidate.asrModel, 120) || null,
    directlyTranscribedNumberForms: safeStringArray(
      candidate.directlyTranscribedNumberForms,
      20,
      80,
    ),
    numberAlternatives: safeStringArray(candidate.numberAlternatives, 20, 80),
    spokenNumberUncertain: Boolean(candidate.spokenNumberUncertain),
    numberConflict: Boolean(candidate.numberConflict),
    normalizationApplied: safeStringArray(candidate.normalizationApplied, 20, 120),
    dateTimeNoiseRemoved: safeStringArray(candidate.dateTimeNoiseRemoved, 20, 120),
    numericContextClassifications: sanitizeNumericContextClassifications(
      candidate.numericContextClassifications,
    ),
  }
}

function uniqueStrings(values = [], maxItems = 50) {
  return [...new Set(values.map((value) => safeString(value, 500)).filter(Boolean))].slice(0, maxItems)
}

function textContainsAddressLikeEvidence(value = '') {
  const tokens = detectShortsTrack2V3EvidenceTokens(safeString(value, 2000))
  return Boolean(tokens.hasHouseNumber && (tokens.hasStreetLike || tokens.hasWard || tokens.hasDistrict))
}

function textContainsDateTimeHouseNumber(value = '') {
  const token = safeString(value, 200)
  return Boolean(
    /^(?:\d{1,2}[-/.]){2,4}\d{2,4}$/u.test(token) ||
    /^\d{1,2}-\d{2}-\d{1,2}\/\d{2}$/u.test(token) ||
    /^\d{1,2}(?::|h)\d{2}(?:[-–—]\d{1,2}(?::|h)\d{2})?$/iu.test(token)
  )
}

function categoryExpectedSafety(item = {}) {
  const legacy = item.expected || {}
  const expectedSafety = item.expectedSafety || {}
  return {
    mustNotResolve: Boolean(expectedSafety.mustNotResolve ?? legacy.mustNotResolve),
    mustNotAutoResolve: Boolean(expectedSafety.mustNotAutoResolve ?? true),
    mustNotContainUnsupportedHouseNumber: Boolean(
      expectedSafety.mustNotContainUnsupportedHouseNumber,
    ),
    unsupportedHouseNumbers: safeStringArray(expectedSafety.unsupportedHouseNumbers, 20, 80),
  }
}

function containsUnsupportedHouseNumber(text = '', houseNumber = '') {
  const escaped = safeString(houseNumber, 80).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  if (!escaped) return false
  return new RegExp(`(?:^|[^0-9])${escaped}(?=$|[^0-9])`, 'u').test(text)
}

export function parseShortsTrack2V3AuditFixture(value) {
  let fixture = value
  if (typeof value === 'string') {
    try {
      fixture = JSON.parse(value)
    } catch (error) {
      throw new Error(`Invalid Track 2 V3 audit fixture JSON: ${error.message}`)
    }
  }
  const fixtureCases = Array.isArray(fixture) ? fixture : fixture?.cases
  if (!Array.isArray(fixtureCases)) {
    throw new Error('Track 2 V3 audit fixture must be a case array or contain a cases array')
  }

  const ids = new Set()
  const cases = fixtureCases.filter((item) => item?.enabled !== false).map((item, index) => {
    const prefix = `Track 2 V3 audit fixture case ${index + 1}`
    const id = safeString(item?.id, 160)
    const url = safeString(item?.url, 2000)
    const category = safeString(item?.category, 120)
    const expectedResolution = safeString(item?.expectedResolution, 40) || 'ANY'
    const expectedOutcome = safeString(item?.expectedOutcome, 80)
    if (!id) throw new Error(`${prefix} requires id`)
    if (ids.has(id)) throw new Error(`${prefix} has duplicate id: ${id}`)
    if (!/^https:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+/u.test(url)) {
      throw new Error(`${prefix} requires a public YouTube Shorts URL`)
    }
    if (!TRACK2_V3_AUDIT_CATEGORIES.includes(category)) {
      throw new Error(`${prefix} has unsupported category: ${category || '(empty)'}`)
    }
    if (!VALID_EXPECTED_RESOLUTIONS.has(expectedResolution)) {
      throw new Error(`${prefix} has unsupported expectedResolution: ${expectedResolution}`)
    }
    if (!VALID_EXPECTED_OUTCOMES.has(expectedOutcome)) {
      throw new Error(`${prefix} has unsupported expectedOutcome: ${expectedOutcome || '(empty)'}`)
    }
    ids.add(id)
    return {
      id,
      url,
      category,
      expectedResolution,
      expectedOutcome,
      expectedSafety: categoryExpectedSafety(item),
      notes: safeString(item?.notes, 2000),
      expectedEvidenceSource: safeString(item?.expectedEvidenceSource, 120) || null,
      expectedCandidateMin: Number.isFinite(Number(item?.expectedCandidateMin))
        ? Math.max(0, Number(item.expectedCandidateMin))
        : null,
      expectedAddressContains: safeStringArray(item?.expectedAddressContains, 20, 200),
      expectedAddressContainsAny: safeStringArray(item?.expectedAddressContainsAny, 20, 200),
      expectedSeedContainsAny: safeStringArray(item?.expectedSeedContainsAny, 20, 200),
      requiresManualFrameValidation: Boolean(item?.requiresManualFrameValidation),
      mustNotCreateFoodCandidate: Boolean(item?.mustNotCreateFoodCandidate),
      placesAllowedOnlyIfEnabled: Boolean(item?.placesAllowedOnlyIfEnabled),
      canAutoResolve: Boolean(item?.canAutoResolve),
    }
  })

  return {
    version: safeString(fixture?.version, 120) || 'track2-v3-grouped-audit-v1',
    notes: safeString(fixture?.notes, 2000),
    cases,
  }
}

export function classifyShortsTrack2V3AuditFailure(caseSummary = {}) {
  const candidateTotal = Number(caseSummary.candidateCount || 0)
  const providerErrors = Array.isArray(caseSummary.providerErrors)
    ? caseSummary.providerErrors
    : []
  const providerCodes = providerErrors.map((error) => error?.code).filter(Boolean).join(' ')
  const snippets = Array.isArray(caseSummary.localOcrBestSnippets)
    ? caseSummary.localOcrBestSnippets
    : []
  const riskFlags = new Set(caseSummary.riskFlags || [])
  const droppedReasons = caseSummary.droppedCandidateReasons || {}

  if (UNSUPPORTED_VIDEO_CODES.test(providerCodes)) return 'UNSUPPORTED_VIDEO'
  if (providerErrors.length > 0 && candidateTotal === 0) return 'PROVIDER_ERROR'
  if (caseSummary.houseNumberConflict) return 'OCR_HOUSE_NUMBER_CONFLICT'

  if (candidateTotal === 0) {
    if (caseSummary.category === 'no_address_expected') return 'NO_ADDRESS_EXPECTED'
    if (
      caseSummary.category === 'generic_caption_only' ||
      Number(droppedReasons.INTRO_OR_CAPTION_ONLY || 0) > 0
    ) {
      return 'GENERIC_CAPTION_ONLY'
    }
    if (
      ['overlay_full_address', 'overlay_partial_address', 'hard_ocr'].includes(caseSummary.category) &&
      Number(caseSummary.selectedImageCount || 0) === 0
    ) {
      return 'SELECTOR_MISSED_TEXT'
    }
    if (snippets.some(textContainsAddressLikeEvidence)) return 'PARSER_TOO_STRICT'
    if (caseSummary.category === 'hard_ocr' && snippets.length > 0) return 'OCR_NOISY'
    return 'NO_CANDIDATE'
  }

  if (
    caseSummary.houseNumberAlternatives?.length > 1 ||
    [...riskFlags].some((flag) => ['LOW_CONFIDENCE_OCR', 'NOISY_OCR', 'NOISY_HOUSE_NUMBER'].includes(flag))
  ) {
    return 'OCR_NOISY'
  }
  if (caseSummary.canAutoResolve && ![...riskFlags].some((flag) => REVIEW_RISK_FLAGS.has(flag))) {
    return 'GOOD_CANDIDATE'
  }
  if ([...riskFlags].some((flag) => REVIEW_RISK_FLAGS.has(flag)) || !caseSummary.canAutoResolve) {
    return 'REVIEW_ONLY_CANDIDATE'
  }
  return 'UNKNOWN'
}

function hasMetadataExpectation(caseSummary = {}) {
  return [
    'METADATA_NEEDED',
    'METADATA_MULTI_REVIEW',
    'METADATA_REVIEW_CANDIDATE',
  ].includes(caseSummary.expectedOutcome) ||
    /\b(?:search snippet|metadata)\b/iu.test(safeString(caseSummary.notes, 2000))
}

function hasVisualAddressEvidence(caseSummary = {}) {
  return (caseSummary.localOcrBestSnippets || []).some(textContainsAddressLikeEvidence)
}

function hasMultiReviewCandidate(caseSummary = {}) {
  return Number(caseSummary.candidateCount || 0) >= 2 ||
    (caseSummary.candidates || []).some((candidate) => candidate.type === 'MULTI_PLACE_REVIEW')
}

function foldAuditText(value = '') {
  return safeString(value, 5000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
}

function metadataAddressExpectationSatisfied(caseSummary = {}) {
  const candidateText = foldAuditText((caseSummary.candidates || [])
    .flatMap((candidate) => [candidate.displayText, candidate.addressFragment, candidate.placeName])
    .filter(Boolean)
    .join('\n'))
  const required = caseSummary.expectedAddressContains || []
  const any = caseSummary.expectedAddressContainsAny || []
  return required.every((token) => candidateText.includes(foldAuditText(token))) &&
    (any.length === 0 || any.some((token) => candidateText.includes(foldAuditText(token))))
}

function closureActionHint(status) {
  const hints = {
    PASSED_EXPECTED_REVIEW_CANDIDATE: 'Keep the candidate review-only and retain its raw OCR evidence.',
    PASSED_EXPECTED_UNRESOLVED: 'No parser change is needed for this correctly unresolved case.',
    PASSED_EXPECTED_REJECTION: 'Keep the current negative or generic-caption rejection gate.',
    FAILED_MISSING_EXPECTED_CANDIDATE: 'Inspect visual address anchors and candidate construction for this case class.',
    FAILED_FALSE_CANDIDATE: 'Tighten food, caption, or negative-case gating before widening extraction.',
    FAILED_UNSUPPORTED_HOUSE_NUMBER: 'Remove unsupported house-number inference and preserve only raw OCR alternatives.',
    NEEDS_METADATA_EVIDENCE: 'Add a later metadata evidence adapter; do not relax the visual OCR parser for this case.',
    NEEDS_SELECTOR_REVIEW: 'Review frame and crop selection before changing OCR parsing rules.',
    NEEDS_HIGH_RES_OCR: 'Evaluate bounded high-resolution OCR for this visual case.',
    NEEDS_PARSER_RELAXATION: 'Calibrate noisy Vietnamese address anchors while keeping review-only safety flags.',
    NEEDS_DATE_TIME_FILTERING: 'Remove date and time tokens before house-number analysis.',
    UNKNOWN: 'Inspect the case evidence and expected outcome manually.',
  }
  return hints[status] || hints.UNKNOWN
}

function expectedOutcomeSatisfied(caseSummary, status) {
  if (status.startsWith('PASSED_EXPECTED_')) return true
  if (caseSummary.expectedOutcome === 'METADATA_NEEDED' && status === 'NEEDS_METADATA_EVIDENCE') {
    return true
  }
  if (
    ['METADATA_MULTI_REVIEW', 'METADATA_REVIEW_CANDIDATE'].includes(caseSummary.expectedOutcome) &&
    ['NEEDS_METADATA_EVIDENCE', 'PASSED_EXPECTED_REVIEW_CANDIDATE'].includes(status)
  ) {
    return true
  }
  if (
    caseSummary.expectedOutcome === 'SELECTOR_OR_OCR_MISSED' &&
    ['NEEDS_SELECTOR_REVIEW', 'NEEDS_HIGH_RES_OCR'].includes(status)
  ) {
    return true
  }
  if (
    caseSummary.expectedOutcome === 'SELECTOR_MISSED_VISIBLE_ADDRESS' &&
    ['NEEDS_SELECTOR_REVIEW', 'PASSED_EXPECTED_REVIEW_CANDIDATE'].includes(status)
  ) {
    return true
  }
  return false
}

export function classifyShortsTrack2V3AuditCaseClosure(caseSummary = {}) {
  const candidateTotal = Number(caseSummary.candidateCount || 0)
  const visualAddress = hasVisualAddressEvidence(caseSummary)
  const hasSnippets = (caseSummary.localOcrBestSnippets || []).length > 0
  const dateTimeHouseNumberBug = (caseSummary.houseNumberAlternatives || [])
    .some(textContainsDateTimeHouseNumber)
  let caseClosureStatus = 'UNKNOWN'

  if (caseSummary.unsupportedHouseNumberFound) {
    caseClosureStatus = 'FAILED_UNSUPPORTED_HOUSE_NUMBER'
  } else if (dateTimeHouseNumberBug) {
    caseClosureStatus = 'NEEDS_DATE_TIME_FILTERING'
  } else {
    switch (caseSummary.expectedOutcome) {
      case 'GENERIC_REJECTED':
      case 'NONFOOD_REJECTED':
      case 'CORRECT_UNRESOLVED_NONFOOD':
        caseClosureStatus = candidateTotal === 0
          ? 'PASSED_EXPECTED_REJECTION'
          : 'FAILED_FALSE_CANDIDATE'
        break
      case 'CORRECT_UNRESOLVED':
        caseClosureStatus = candidateTotal === 0 && caseSummary.resolution === 'UNRESOLVED'
          ? 'PASSED_EXPECTED_UNRESOLVED'
          : 'FAILED_FALSE_CANDIDATE'
        break
      case 'MULTI_REVIEW':
        if (hasMultiReviewCandidate(caseSummary)) {
          caseClosureStatus = 'PASSED_EXPECTED_REVIEW_CANDIDATE'
        } else if (hasMetadataExpectation(caseSummary) || !visualAddress) {
          caseClosureStatus = 'NEEDS_METADATA_EVIDENCE'
        } else {
          caseClosureStatus = 'FAILED_MISSING_EXPECTED_CANDIDATE'
        }
        break
      case 'METADATA_NEEDED':
      case 'METADATA_MULTI_REVIEW':
      case 'METADATA_REVIEW_CANDIDATE':
        if (candidateTotal > 0) {
          const expectedMinimum = Number(caseSummary.expectedCandidateMin || 1)
          caseClosureStatus = candidateTotal >= expectedMinimum &&
            metadataAddressExpectationSatisfied(caseSummary)
            ? 'PASSED_EXPECTED_REVIEW_CANDIDATE'
            : 'NEEDS_METADATA_EVIDENCE'
        } else if (!visualAddress) {
          caseClosureStatus = 'NEEDS_METADATA_EVIDENCE'
        } else {
          caseClosureStatus = 'NEEDS_PARSER_RELAXATION'
        }
        break
      case 'SELECTOR_OR_OCR_MISSED':
        if (candidateTotal > 0) {
          caseClosureStatus = 'PASSED_EXPECTED_REVIEW_CANDIDATE'
        } else if (Number(caseSummary.selectedImageCount || 0) === 0) {
          caseClosureStatus = 'NEEDS_SELECTOR_REVIEW'
        } else if (!visualAddress) {
          caseClosureStatus = 'NEEDS_HIGH_RES_OCR'
        } else {
          caseClosureStatus = 'NEEDS_PARSER_RELAXATION'
        }
        break
      case 'SELECTOR_MISSED_VISIBLE_ADDRESS':
        caseClosureStatus = candidateTotal > 0 && !caseSummary.canAutoResolve
          ? 'PASSED_EXPECTED_REVIEW_CANDIDATE'
          : 'NEEDS_SELECTOR_REVIEW'
        break
      case 'REVIEW_CANDIDATE':
      case 'HARD_OCR_REVIEW':
      case 'VISUAL_OCR_REVIEW_CANDIDATE':
        if (candidateTotal > 0 && !caseSummary.canAutoResolve) {
          caseClosureStatus = 'PASSED_EXPECTED_REVIEW_CANDIDATE'
        } else if (visualAddress) {
          caseClosureStatus = 'NEEDS_PARSER_RELAXATION'
        } else if (caseSummary.expectedOutcome === 'HARD_OCR_REVIEW' && hasSnippets) {
          caseClosureStatus = 'NEEDS_HIGH_RES_OCR'
        } else if (Number(caseSummary.selectedImageCount || 0) === 0) {
          caseClosureStatus = 'NEEDS_SELECTOR_REVIEW'
        } else {
          caseClosureStatus = 'FAILED_MISSING_EXPECTED_CANDIDATE'
        }
        break
      case 'PLACE_HINT_REVIEW_OR_UNRESOLVED':
        caseClosureStatus = candidateTotal > 0 && !caseSummary.canAutoResolve
          ? 'PASSED_EXPECTED_REVIEW_CANDIDATE'
          : candidateTotal === 0 && caseSummary.resolution === 'UNRESOLVED'
            ? 'PASSED_EXPECTED_UNRESOLVED'
            : 'FAILED_FALSE_CANDIDATE'
        break
      default:
        caseClosureStatus = 'UNKNOWN'
    }
  }

  const hasMetadataCandidate = (caseSummary.candidates || []).some((candidate) =>
    ['youtube_description', 'youtube_title', 'search_snippet'].includes(candidate.evidenceSource) ||
    (candidate.evidenceSources || []).some((source) =>
      ['youtube_description', 'youtube_title', 'search_snippet'].includes(source)
    )
  )
  const evidenceSourceHint = caseClosureStatus === 'NEEDS_METADATA_EVIDENCE' || hasMetadataCandidate
    ? 'metadata'
    : candidateTotal > 0 || hasSnippets
      ? 'visual_ocr'
      : 'unknown'
  const shouldFixNow = [
    'FAILED_MISSING_EXPECTED_CANDIDATE',
    'FAILED_FALSE_CANDIDATE',
    'FAILED_UNSUPPORTED_HOUSE_NUMBER',
    'NEEDS_PARSER_RELAXATION',
    'NEEDS_DATE_TIME_FILTERING',
  ].includes(caseClosureStatus)

  return {
    caseClosureStatus,
    caseActionHint: closureActionHint(caseClosureStatus),
    evidenceSourceHint,
    shouldFixNow,
    expectedOutcomeSatisfied: expectedOutcomeSatisfied(caseSummary, caseClosureStatus),
    dateTimeHouseNumberBug,
  }
}

export function summarizeShortsTrack2V3AuditCase(item = {}, result = {}) {
  const expectedSafety = categoryExpectedSafety(item)
  const candidates = (Array.isArray(result.candidates) ? result.candidates : []).map(summarizeCandidate)
  const providerErrors = sanitizeProviderErrors(result.providerErrors)
  const resolution = safeString(result.resolution, 120) || 'UNKNOWN'
  const keptCandidateCount = numberMetric(result, 'keptCandidateCount', candidateCount(result))
  const droppedCandidateCount = numberMetric(result, 'droppedCandidateCount', 0)
  const rawCandidateCount = numberMetric(
    result,
    'rawCandidateCount',
    keptCandidateCount + droppedCandidateCount,
  )
  const riskFlags = uniqueStrings(candidates.flatMap((candidate) => candidate.riskFlags), 50)
  const asrNumberAlternatives = safeStringArray(
    result.asrNumberAlternatives || result.debug?.asrNumberAlternatives,
    30,
    80,
  )
  const houseNumberAlternatives = uniqueStrings(
    [
      ...candidates.flatMap((candidate) => candidate.houseNumberAlternatives),
      ...asrNumberAlternatives,
    ],
    30,
  )
  const bestCandidate = candidates[0] || null
  const canAutoResolve = Boolean(
    result.canAutoResolve || candidates.some((candidate) => candidate.canAutoResolve),
  )
  const candidateText = candidates
    .flatMap((candidate) => [candidate.displayText, candidate.addressFragment, candidate.placeName])
    .filter(Boolean)
    .join('\n')
  const unsupportedHouseNumberFound = expectedSafety.mustNotContainUnsupportedHouseNumber &&
    expectedSafety.unsupportedHouseNumbers.some((houseNumber) =>
      containsUnsupportedHouseNumber(candidateText, houseNumber)
    )
  const localOcrBestSnippets = safeStringArray(
    result.localOcrBestSnippets || result.debug?.localOcrBestSnippets || result.debug?.bestOcrSnippets,
    20,
    500,
  )

  const caseSummary = {
    id: safeString(item.id, 160),
    url: safeString(item.url, 2000),
    videoId: safeString(result.videoId || item.videoId, 160) || null,
    category: safeString(item.category, 120) || 'UNKNOWN',
    expectedResolution: safeString(item.expectedResolution, 40) || 'ANY',
    expectedOutcome: safeString(item.expectedOutcome, 80) || null,
    expectedEvidenceSource: safeString(item.expectedEvidenceSource, 120) || null,
    expectedCandidateMin: item.expectedCandidateMin != null && Number.isFinite(Number(item.expectedCandidateMin))
      ? Number(item.expectedCandidateMin)
      : null,
    expectedAddressContains: safeStringArray(item.expectedAddressContains, 20, 200),
    expectedAddressContainsAny: safeStringArray(item.expectedAddressContainsAny, 20, 200),
    expectedSeedContainsAny: safeStringArray(item.expectedSeedContainsAny, 20, 200),
    requiresManualFrameValidation: Boolean(item.requiresManualFrameValidation),
    mustNotCreateFoodCandidate: Boolean(item.mustNotCreateFoodCandidate),
    placesAllowedOnlyIfEnabled: Boolean(item.placesAllowedOnlyIfEnabled),
    expectedSafety,
    notes: safeString(item.notes, 2000) || null,
    track: safeString(result.track, 120) || null,
    inputClass: safeString(result.inputClass || result.debug?.inputClass, 80) || null,
    resolution,
    reason: safeString(result.reason, 240) || null,
    candidateCount: candidateCount(result),
    rawCandidateCount,
    keptCandidateCount,
    droppedCandidateCount,
    droppedCandidateReasons: safeReasonCounts(result.debug?.droppedCandidateReasons),
    weakCandidateCount: numberMetric(result, 'weakCandidateCount', droppedCandidateCount),
    addressAnchoredCandidateCount: numberMetric(result, 'addressAnchoredCandidateCount', keptCandidateCount),
    evidenceCount: evidenceCount(result),
    ocrTextBlockCount: numberMetric(result, 'ocrTextBlockCount'),
    selectedImageCount: Array.isArray(result.selectedImages)
      ? result.selectedImages.length
      : numberMetric(result, 'selectedImageCount', 0),
    ocrBoostRan: Boolean(result.metrics?.ocrBoostRan || result.debug?.ocrBoostRan),
    bestCandidate,
    riskFlags,
    canAutoResolve,
    localOcrCalled: providerCalled(result, 'localOcrCalled'),
    localOcrProvider: safeString(result.localOcrProvider || result.debug?.localOcrProvider, 120) || null,
    localOcrBestSnippets,
    localOcrEngineDiagnostics: sanitizeLocalOcrEngineDiagnostics(
      result.localOcrEngineDiagnostics || result.debug?.localOcrEngineDiagnostics,
    ),
    temporalEpisodeEnabled: Boolean(
      result.temporalEpisodeEnabled ?? result.debug?.temporalEpisodeEnabled,
    ),
    temporalEpisodeCount: numberMetric(result, 'temporalEpisodeCount', 0),
    temporalUniqueRegionCount: numberMetric(result, 'temporalUniqueRegionCount', 0),
    temporalEpisodeReductionRatio: Number.isFinite(Number(
      result.temporalEpisodeReductionRatio ?? result.debug?.temporalEpisodeReductionRatio,
    ))
      ? Number(result.temporalEpisodeReductionRatio ?? result.debug?.temporalEpisodeReductionRatio)
      : null,
    adaptiveFrameSamplingEnabled: Boolean(
      result.adaptiveFrameSamplingEnabled ?? result.debug?.adaptiveFrameSamplingEnabled,
    ),
    adaptiveFrameSamplingRan: Boolean(
      result.adaptiveFrameSamplingRan ?? result.debug?.adaptiveFrameSamplingRan,
    ),
    adaptiveFrameCount: numberMetric(result, 'adaptiveFrameCount', 0),
    adaptiveCropCount: numberMetric(result, 'adaptiveCropCount', 0),
    adaptiveSelectedCropIds: safeStringArray(
      result.adaptiveSelectedCropIds || result.debug?.adaptiveSelectedCropIds,
      100,
      200,
    ),
    ocrTextBlockCountFromAdaptiveFrames: numberMetric(
      result,
      'ocrTextBlockCountFromAdaptiveFrames',
      0,
    ),
    ocrSnippetsFromAdaptiveFrames: safeStringArray(
      result.ocrSnippetsFromAdaptiveFrames || result.debug?.ocrSnippetsFromAdaptiveFrames,
      20,
      500,
    ),
    candidateCountFromAdaptiveFrames: numberMetric(
      result,
      'candidateCountFromAdaptiveFrames',
      0,
    ),
    adaptiveSamplingReason: safeString(
      result.adaptiveSamplingReason || result.debug?.adaptiveSamplingReason,
      240,
    ) || null,
    tailOverlayEscalationEnabled: Boolean(
      result.tailOverlayEscalationEnabled ?? result.debug?.tailOverlayEscalationEnabled,
    ),
    tailOverlayEscalationRan: Boolean(
      result.tailOverlayEscalationRan ?? result.debug?.tailOverlayEscalationRan,
    ),
    tailOverlayFrameIds: safeStringArray(
      result.tailOverlayFrameIds || result.debug?.tailOverlayFrameIds,
      2,
      160,
    ),
    tailOverlayFrameTimestamps: (
      Array.isArray(result.tailOverlayFrameTimestamps)
        ? result.tailOverlayFrameTimestamps
        : Array.isArray(result.debug?.tailOverlayFrameTimestamps)
          ? result.debug.tailOverlayFrameTimestamps
          : []
    ).slice(0, 2).map((value) => Number(value)).filter(Number.isFinite),
    tailOverlayCropIds: safeStringArray(
      result.tailOverlayCropIds || result.debug?.tailOverlayCropIds,
      4,
      160,
    ),
    tailOverlayCropCount: numberMetric(result, 'tailOverlayCropCount', 0),
    tailOverlayOcrTextBlockCount: numberMetric(result, 'tailOverlayOcrTextBlockCount', 0),
    tailOverlayOcrSnippets: safeStringArray(
      result.tailOverlayOcrSnippets || result.debug?.tailOverlayOcrSnippets,
      12,
      500,
    ),
    candidateCountFromTailOverlay: numberMetric(
      result,
      'candidateCountFromTailOverlay',
      0,
    ),
    tailOverlayEscalationReason: safeString(
      result.tailOverlayEscalationReason || result.debug?.tailOverlayEscalationReason,
      240,
    ) || null,
    tailOverlayProviderErrors: sanitizeProviderErrors(
      result.tailOverlayProviderErrors || result.debug?.tailOverlayProviderErrors,
    ),
    providerErrors,
    houseNumberAlternatives,
    houseNumberConflict:
      candidates.some((candidate) => candidate.houseNumberConflict) ||
      Boolean(result.asrNumberConflict ?? result.debug?.asrNumberConflict),
    googleVisionCalled: providerCalled(result, 'googleVisionCalled'),
    placesCalled: providerCalled(result, 'placesCalled'),
    geminiCalled: providerCalled(result, 'geminiCalled'),
    asrCalled: providerCalled(result, 'asrCalled'),
    asrFallbackEnabled: Boolean(
      result.asrFallbackEnabled ?? result.debug?.asrFallbackEnabled,
    ),
    asrFallbackRan: Boolean(result.asrFallbackRan ?? result.debug?.asrFallbackRan),
    asrFallbackReason: safeString(
      result.asrFallbackReason || result.debug?.asrFallbackReason,
      160,
    ) || null,
    preAsrKeptCandidateCount: numberMetric(result, 'preAsrKeptCandidateCount', 0),
    preAsrLateRescueSufficient: Boolean(
      result.preAsrLateRescueSufficient ?? result.debug?.preAsrLateRescueSufficient,
    ),
    preAsrLateRescueSufficiencyReason: safeString(
      result.preAsrLateRescueSufficiencyReason || result.debug?.preAsrLateRescueSufficiencyReason,
      160,
    ) || null,
    preAsrLateRescueBlockingCandidateCount: numberMetric(
      result,
      'preAsrLateRescueBlockingCandidateCount',
      0,
    ),
    preAsrLateRescueNonBlockingCandidateCount: numberMetric(
      result,
      'preAsrLateRescueNonBlockingCandidateCount',
      0,
    ),
    lateRescueSufficiencyEvaluated: Boolean(
      result.lateRescueSufficiencyEvaluated ?? result.debug?.lateRescueSufficiencyEvaluated,
    ),
    lateRescueSufficient: Boolean(
      result.lateRescueSufficient ?? result.debug?.lateRescueSufficient,
    ),
    lateRescueSufficiencyReason: safeString(
      result.lateRescueSufficiencyReason || result.debug?.lateRescueSufficiencyReason,
      160,
    ) || null,
    lateRescueBlockingCandidateCount: numberMetric(
      result,
      'lateRescueBlockingCandidateCount',
      0,
    ),
    lateRescueNonBlockingCandidateCount: numberMetric(
      result,
      'lateRescueNonBlockingCandidateCount',
      0,
    ),
    numericContextClassifications: sanitizeNumericContextClassifications(
      result.numericContextClassifications || result.debug?.numericContextClassifications,
    ),
    contextNumberRejectedAsHouseNumberCount: numberMetric(
      result,
      'contextNumberRejectedAsHouseNumberCount',
      0,
    ),
    floorNumberRejectedAsHouseNumberCount: numberMetric(
      result,
      'floorNumberRejectedAsHouseNumberCount',
      0,
    ),
    priceNumberRejectedAsHouseNumberCount: numberMetric(
      result,
      'priceNumberRejectedAsHouseNumberCount',
      0,
    ),
    asrProvider: safeString(result.asrProvider || result.debug?.asrProvider, 120) || null,
    asrModel: safeString(result.asrModel || result.debug?.asrModel, 120) || null,
    asrDevice: safeString(result.asrDevice || result.debug?.asrDevice, 80) || null,
    asrComputeType: safeString(
      result.asrComputeType || result.debug?.asrComputeType,
      80,
    ) || null,
    asrRequestedLanguage: safeString(
      result.asrRequestedLanguage || result.debug?.asrRequestedLanguage,
      40,
    ) || null,
    asrDetectedLanguage: safeString(
      result.asrDetectedLanguage || result.debug?.asrDetectedLanguage,
      40,
    ) || null,
    asrTranscriptSegmentCount: numberMetric(result, 'asrTranscriptSegmentCount', 0),
    asrTranscriptBestSnippets: safeStringArray(
      result.asrTranscriptBestSnippets || result.debug?.asrTranscriptBestSnippets,
      12,
      1000,
    ),
    asrAddressEvidenceCount: numberMetric(result, 'asrAddressEvidenceCount', 0),
    asrFullAddressEvidenceCount: numberMetric(result, 'asrFullAddressEvidenceCount', 0),
    asrPartialAddressEvidenceCount: numberMetric(
      result,
      'asrPartialAddressEvidenceCount',
      0,
    ),
    asrPlaceOrDistrictEvidenceCount: numberMetric(
      result,
      'asrPlaceOrDistrictEvidenceCount',
      0,
    ),
    candidateCountFromAsr: numberMetric(result, 'candidateCountFromAsr', 0),
    asrEvidenceBucket: safeString(
      result.asrEvidenceBucket || result.debug?.asrEvidenceBucket,
      120,
    ) || null,
    asrCorroborationType: safeString(
      result.asrCorroborationType || result.debug?.asrCorroborationType,
      160,
    ) || null,
    asrDirectlyTranscribedNumberForms: safeStringArray(
      result.asrDirectlyTranscribedNumberForms ||
        result.debug?.asrDirectlyTranscribedNumberForms,
      30,
      80,
    ),
    asrNumberAlternatives,
    asrSpokenNumberUncertain: Boolean(
      result.asrSpokenNumberUncertain ?? result.debug?.asrSpokenNumberUncertain,
    ),
    asrNumberConflict: Boolean(result.asrNumberConflict ?? result.debug?.asrNumberConflict),
    asrProviderErrors: sanitizeProviderErrors(
      result.asrProviderErrors || result.debug?.asrProviderErrors,
    ),
    asrRuntimeMs: numberMetric(result, 'asrRuntimeMs', 0),
    asrWindowCountProcessed: numberMetric(result, 'asrWindowCountProcessed', 0),
    asrWindowSecondsProcessed: numberMetric(result, 'asrWindowSecondsProcessed', 0),
    asrFullAudioFallbackRan: Boolean(
      result.asrFullAudioFallbackRan ?? result.debug?.asrFullAudioFallbackRan,
    ),
    asrAudioDurationSeconds: Number.isFinite(Number(
      result.asrAudioDurationSeconds ?? result.debug?.asrAudioDurationSeconds,
    ))
      ? Number(result.asrAudioDurationSeconds ?? result.debug?.asrAudioDurationSeconds)
      : null,
    asrModelLoadCount: numberMetric(result, 'asrModelLoadCount', 0),
    asrModelReused: Boolean(result.asrModelReused ?? result.debug?.asrModelReused),
    asrUsedSharedVideo: Boolean(
      result.asrUsedSharedVideo ?? result.debug?.asrUsedSharedVideo,
    ),
    asrIndependentDownloadCount: numberMetric(result, 'asrIndependentDownloadCount', 0),
    mediaAcquisitionCalled: Boolean(
      result.mediaAcquisitionCalled ?? result.debug?.mediaAcquisitionCalled,
    ),
    mediaAcquisitionStatus: safeString(
      result.mediaAcquisitionStatus || result.debug?.mediaAcquisitionStatus,
      80,
    ) || null,
    mediaAcquisitionAttemptCount: numberMetric(
      result,
      'mediaAcquisitionAttemptCount',
      0,
    ),
    mediaAcquisitionAttempts: (
      Array.isArray(result.mediaAcquisitionAttempts)
        ? result.mediaAcquisitionAttempts
        : Array.isArray(result.debug?.mediaAcquisitionAttempts)
          ? result.debug.mediaAcquisitionAttempts
          : []
    ).slice(0, 2).map((attempt) => ({
      attempt: Number(attempt?.attempt || 0),
      strategy: safeString(attempt?.strategy, 80) || null,
      startedAt: safeString(attempt?.startedAt, 80) || null,
      runtimeMs: Math.max(0, Number(attempt?.runtimeMs || 0)),
      status: safeString(attempt?.status, 40) || null,
      errorCode: safeString(attempt?.errorCode, 120) || null,
    })),
    mediaAcquisitionStrategies: safeStringArray(
      result.mediaAcquisitionStrategies || result.debug?.mediaAcquisitionStrategies,
      2,
      80,
    ),
    mediaAcquisitionSuccessfulStrategy: safeString(
      result.mediaAcquisitionSuccessfulStrategy ||
        result.debug?.mediaAcquisitionSuccessfulStrategy,
      80,
    ) || null,
    mediaAcquisitionRuntimeMs: numberMetric(result, 'mediaAcquisitionRuntimeMs', 0),
    mediaReuseCount: numberMetric(result, 'mediaReuseCount', 0),
    mediaVideoAvailable: Boolean(
      result.mediaVideoAvailable ?? result.debug?.mediaVideoAvailable,
    ),
    mediaDurationAvailable: Boolean(
      result.mediaDurationAvailable ?? result.debug?.mediaDurationAvailable,
    ),
    mediaAudioExtractionCalled: Boolean(
      result.mediaAudioExtractionCalled ?? result.debug?.mediaAudioExtractionCalled,
    ),
    mediaAudioExtractionStatus: safeString(
      result.mediaAudioExtractionStatus || result.debug?.mediaAudioExtractionStatus,
      80,
    ) || null,
    mediaProviderErrors: sanitizeProviderErrors(
      result.mediaProviderErrors || result.debug?.mediaProviderErrors,
    ),
    mediaVisualUsedSharedVideo: Boolean(
      result.mediaVisualUsedSharedVideo ?? result.debug?.mediaVisualUsedSharedVideo,
    ),
    mediaAsrUsedSharedVideo: Boolean(
      result.mediaAsrUsedSharedVideo ?? result.debug?.mediaAsrUsedSharedVideo,
    ),
    mediaAsrIndependentDownloadCount: numberMetric(
      result,
      'mediaAsrIndependentDownloadCount',
      0,
    ),
    mediaSecondDownloadCount: numberMetric(result, 'mediaSecondDownloadCount', 0),
    caseRuntimeMs: numberMetric(result, 'latencyMs', 0),
    geminiCropJudgeEnabled: Boolean(
      result.geminiCropJudgeEnabled ?? result.debug?.geminiCropJudgeEnabled,
    ),
    geminiCropJudgeCalled: Boolean(
      result.geminiCropJudgeCalled ?? result.debug?.geminiCropJudgeCalled,
    ),
    geminiCropJudgeProvider: safeString(
      result.geminiCropJudgeProvider || result.debug?.geminiCropJudgeProvider,
      120,
    ) || null,
    geminiCropJudgeSelectedCropIds: safeStringArray(
      result.geminiCropJudgeSelectedCropIds || result.debug?.geminiCropJudgeSelectedCropIds,
      100,
      200,
    ),
    geminiCropJudgeRejectedCropIds: safeStringArray(
      result.geminiCropJudgeRejectedCropIds || result.debug?.geminiCropJudgeRejectedCropIds,
      100,
      200,
    ),
    geminiCropJudgeContactSheetPaths: safeStringArray(
      result.geminiCropJudgeContactSheetPaths || result.debug?.geminiCropJudgeContactSheetPaths,
      20,
      1000,
    ),
    geminiCropJudgeResultPath: safeString(
      result.geminiCropJudgeResultPath || result.debug?.geminiCropJudgeResultPath,
      1000,
    ) || null,
    geminiCropJudgeErrors: sanitizeProviderErrors(
      result.geminiCropJudgeErrors || result.debug?.geminiCropJudgeErrors,
    ),
    geminiCropJudgeAggregateStatus: safeString(
      result.geminiCropJudgeAggregateStatus || result.debug?.geminiCropJudgeAggregateStatus,
      120,
    ) || null,
    geminiCropJudgeRequestedPageCount: numberMetric(
      result,
      'geminiCropJudgeRequestedPageCount',
      0,
    ),
    geminiCropJudgeSuccessfulPageCount: numberMetric(
      result,
      'geminiCropJudgeSuccessfulPageCount',
      0,
    ),
    geminiCropJudgeFailedPageCount: numberMetric(
      result,
      'geminiCropJudgeFailedPageCount',
      0,
    ),
    geminiCropJudgePartialSuccess: Boolean(
      result.geminiCropJudgePartialSuccess ?? result.debug?.geminiCropJudgePartialSuccess,
    ),
    geminiCropJudgeTotalAttemptCount: numberMetric(
      result,
      'geminiCropJudgeTotalAttemptCount',
      0,
    ),
    geminiCropJudgeRetryCount: numberMetric(result, 'geminiCropJudgeRetryCount', 0),
    geminiCropJudgeRateLimitCount: numberMetric(
      result,
      'geminiCropJudgeRateLimitCount',
      0,
    ),
    geminiCropJudgeTimeoutCount: numberMetric(result, 'geminiCropJudgeTimeoutCount', 0),
    geminiCropJudgeServerErrorCount: numberMetric(
      result,
      'geminiCropJudgeServerErrorCount',
      0,
    ),
    geminiCropJudgeQueueWaitMs: numberMetric(result, 'geminiCropJudgeQueueWaitMs', 0),
    geminiCropJudgeProviderRuntimeMs: numberMetric(
      result,
      'geminiCropJudgeProviderRuntimeMs',
      0,
    ),
    geminiCropJudgeBackoffMs: numberMetric(result, 'geminiCropJudgeBackoffMs', 0),
    geminiCropJudgeMaxObservedConcurrency: numberMetric(
      result,
      'geminiCropJudgeMaxObservedConcurrency',
      0,
    ),
    geminiCropJudgeDedupHitCount: numberMetric(result, 'geminiCropJudgeDedupHitCount', 0),
    geminiCropJudgePageResults: sanitizeGeminiPageResults(
      result.geminiCropJudgePageResults || result.debug?.geminiCropJudgePageResults,
    ),
    ocrTextBlockCountFromGeminiSelectedCrops: numberMetric(
      result,
      'ocrTextBlockCountFromGeminiSelectedCrops',
      0,
    ),
    ocrSnippetsFromGeminiSelectedCrops: safeStringArray(
      result.ocrSnippetsFromGeminiSelectedCrops ||
        result.debug?.ocrSnippetsFromGeminiSelectedCrops,
      20,
      500,
    ),
    candidateCountFromGeminiSelectedCrops: numberMetric(
      result,
      'candidateCountFromGeminiSelectedCrops',
      0,
    ),
    selectorDiagnosticsPath: safeString(
      result.selectorDiagnosticsPath || result.debug?.selectorDiagnosticsPath,
      1000,
    ) || null,
    contactSheetPath: safeString(
      result.contactSheetPath || result.debug?.contactSheetPath,
      1000,
    ) || null,
    generatedCropCount: numberMetric(result, 'generatedCropCount', 0),
    selectedCropIds: safeStringArray(
      result.selectedCropIds || result.debug?.selectedCropIds,
      100,
      200,
    ),
    cropRegionCounts: safeReasonCounts(
      result.cropRegionCounts || result.debug?.cropRegionCounts,
    ),
    selectorDiagnosis: safeString(
      result.selectorDiagnosis || result.debug?.selectorDiagnosis,
      120,
    ) || 'UNKNOWN',
    unsupportedHouseNumberFound,
    candidates,
    falseResolved: resolution === 'RESOLVED',
    autoResolved: resolution === 'RESOLVED' || canAutoResolve,
  }
  caseSummary.failureCategory = classifyShortsTrack2V3AuditFailure(caseSummary)
  Object.assign(caseSummary, classifyShortsTrack2V3AuditCaseClosure(caseSummary))
  caseSummary.expectedOutcomeEvaluated = !caseSummary.requiresManualFrameValidation
  return caseSummary
}

function auditFailureResult(error) {
  return {
    track: 'TRACK_2_V3',
    resolution: 'UNRESOLVED',
    reason: 'AUDIT_CASE_FAILED',
    candidates: [],
    providerErrors: [{
      provider: 'audit_runner',
      code: 'AUDIT_CASE_FAILED',
      message: safeString(error?.message || error, 500) || 'Audit case failed safely.',
    }],
    providerCalls: {
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      localOcrCalled: false,
      asrCalled: false,
    },
  }
}

export async function runShortsTrack2V3AuditCases(cases = [], runCase, options = {}) {
  if (typeof runCase !== 'function') {
    throw new TypeError('runShortsTrack2V3AuditCases requires a runCase function')
  }
  const results = []
  for (const [index, item] of (Array.isArray(cases) ? cases : []).entries()) {
    let entry
    try {
      entry = { case: item, result: await runCase(item, index) }
    } catch (error) {
      entry = { case: item, result: auditFailureResult(error) }
    }
    results.push(entry)
    if (typeof options.onCaseComplete === 'function') {
      await options.onCaseComplete(entry, index)
    }
  }
  return results
}

function emptyBreakdown(category) {
  return {
    category,
    total: 0,
    resolvedCount: 0,
    candidatesCount: 0,
    needsReviewCount: 0,
    unresolvedCount: 0,
    falseResolvedCount: 0,
    providerErrorCount: 0,
    ocrTextBlockTotal: 0,
    evidenceTotal: 0,
    candidateTotal: 0,
    rawCandidateTotal: 0,
    keptCandidateTotal: 0,
    droppedCandidateTotal: 0,
    weakCandidateTotal: 0,
    addressAnchoredCandidateTotal: 0,
    droppedCandidateReasons: {},
  }
}

function increment(target = {}, key = 'UNKNOWN') {
  target[key] = (target[key] || 0) + 1
}

function addCase(summary, caseSummary) {
  const resolution = caseSummary.resolution || 'UNKNOWN'
  const category = caseSummary.category || 'UNKNOWN'
  if (!summary.byCategory[category]) summary.byCategory[category] = emptyBreakdown(category)

  increment(summary.byResolution, resolution)
  increment(summary.byFailureCategory, caseSummary.failureCategory || 'UNKNOWN')
  increment(summary.byCaseClosureStatus, caseSummary.caseClosureStatus || 'UNKNOWN')
  increment(summary.bySelectorDiagnosis, caseSummary.selectorDiagnosis || 'UNKNOWN')
  increment(summary.byProvider, caseSummary.localOcrProvider || 'not_called')
  summary.totalCases += 1
  if (caseSummary.falseResolved) summary.falseResolveCount += 1
  if (caseSummary.autoResolved) summary.autoResolveCount += 1
  if (caseSummary.houseNumberConflict) summary.casesWithHouseNumberConflict += 1
  if (caseSummary.asrFallbackRan) summary.asrFallbackInvocationCount += 1
  if (caseSummary.asrFallbackRan && caseSummary.preAsrLateRescueNonBlockingCandidateCount > 0) {
    summary.urlsWhereAsrRanDespiteNonBlockingReviewEvidence += 1
  }
  if (caseSummary.asrFallbackReason === 'RESCUE_SUFFICIENT') {
    summary.urlsSkippedDueRescueSufficient += 1
  }
  summary.lateRescueBlockingCandidateTotal += caseSummary.lateRescueBlockingCandidateCount
  summary.lateRescueNonBlockingCandidateTotal += caseSummary.lateRescueNonBlockingCandidateCount
  summary.contextNumberRejectedAsHouseNumberCount += caseSummary.contextNumberRejectedAsHouseNumberCount
  summary.floorNumberRejectedAsHouseNumberCount += caseSummary.floorNumberRejectedAsHouseNumberCount
  summary.priceNumberRejectedAsHouseNumberCount += caseSummary.priceNumberRejectedAsHouseNumberCount
  if (caseSummary.asrTranscriptSegmentCount > 0) summary.asrSuccessfulTranscriptionCount += 1
  if (caseSummary.asrProviderErrors.length > 0) summary.asrProviderFailureCount += 1
  if (caseSummary.candidateCountFromAsr > 0) summary.urlsWithAsrCandidates += 1
  if (caseSummary.asrFullAddressEvidenceCount > 0) summary.urlsWithAsrFullEvidence += 1
  if (caseSummary.asrPartialAddressEvidenceCount > 0) summary.urlsWithAsrPartialEvidence += 1
  if (caseSummary.asrPlaceOrDistrictEvidenceCount > 0) {
    summary.urlsWithAsrPlaceOrDistrictEvidence += 1
  }
  if (caseSummary.asrEvidenceBucket === 'ASR_NO_ADDRESS_SPEECH_OBSERVED') {
    summary.urlsWithAsrNoAddressSpeech += 1
  }
  if (caseSummary.asrSpokenNumberUncertain) summary.asrSpokenNumberUncertainCount += 1
  if (caseSummary.asrNumberConflict) summary.asrNumberConflictCount += 1
  if (caseSummary.asrFallbackRan) {
    increment(summary.asrCorroborationCounts, caseSummary.asrCorroborationType || 'ASR_NO_CORROBORATION')
  }
  summary.totalAsrRuntimeMs += caseSummary.asrRuntimeMs
  summary.totalAsrAudioDurationSeconds += Number(caseSummary.asrAudioDurationSeconds || 0)
  summary.asrModelLoadCount = Math.max(summary.asrModelLoadCount, caseSummary.asrModelLoadCount)
  if (caseSummary.asrModelReused) summary.asrProviderProcessReused = true
  if (caseSummary.mediaAcquisitionCalled) summary.mediaAcquisitionCalledCount += 1
  summary.mediaAcquisitionAttemptTotal += caseSummary.mediaAcquisitionAttemptCount
  summary.totalMediaAcquisitionRuntimeMs += caseSummary.mediaAcquisitionRuntimeMs
  summary.totalMediaReuseCount += caseSummary.mediaReuseCount
  summary.mediaSecondDownloadCount += caseSummary.mediaSecondDownloadCount
  summary.asrIndependentDownloadCount += caseSummary.mediaAsrIndependentDownloadCount
  if (caseSummary.mediaAcquisitionAttemptCount > 1) summary.urlsRequiringMediaRetry += 1
  if (caseSummary.mediaAcquisitionSuccessfulStrategy === 'FALLBACK_FORMAT') {
    summary.urlsUsingFallbackFormat += 1
  }
  if (caseSummary.mediaVisualUsedSharedVideo && caseSummary.mediaAsrUsedSharedVideo) {
    summary.visualToAsrMediaReuseCount += 1
  }
  if (caseSummary.mediaProviderErrors.length > 0) summary.urlsWithMediaProviderErrors += 1
  if (caseSummary.caseRuntimeMs > 0) summary.caseRuntimeMsValues.push(caseSummary.caseRuntimeMs)
  if (caseSummary.candidateCount > 0) summary.casesWithCandidates += 1
  else summary.casesWithNoCandidate += 1
  if (caseSummary.unsupportedHouseNumberFound) summary.casesWithUnsupportedHouseNumber += 1
  if (caseSummary.caseClosureStatus === 'NEEDS_METADATA_EVIDENCE') summary.casesNeedingMetadata += 1
  if (caseSummary.caseClosureStatus === 'NEEDS_SELECTOR_REVIEW') summary.casesNeedingSelectorReview += 1
  if (caseSummary.caseClosureStatus === 'NEEDS_HIGH_RES_OCR') summary.casesNeedingHighResOcr += 1
  if (caseSummary.caseClosureStatus === 'NEEDS_PARSER_RELAXATION') summary.casesNeedingParserRelaxation += 1
  if (caseSummary.dateTimeHouseNumberBug) summary.casesWithDateTimeHouseNumberBug += 1
  if (caseSummary.requiresManualFrameValidation) {
    summary.manualValidationCaseCount += 1
  } else if (caseSummary.expectedOutcomeSatisfied) {
    summary.expectedOutcomePassCount += 1
  } else {
    summary.expectedOutcomeFailCount += 1
  }
  if (
    ['NONFOOD_REJECTED', 'CORRECT_UNRESOLVED', 'CORRECT_UNRESOLVED_NONFOOD'].includes(caseSummary.expectedOutcome) &&
    ['PASSED_EXPECTED_REJECTION', 'PASSED_EXPECTED_UNRESOLVED'].includes(caseSummary.caseClosureStatus)
  ) {
    summary.correctedNegativeCases += 1
  }
  if (
    caseSummary.expectedOutcome === 'GENERIC_REJECTED' &&
    caseSummary.caseClosureStatus === 'PASSED_EXPECTED_REJECTION'
  ) {
    summary.correctlyRejectedGenericCaptions += 1
  }
  if (
    caseSummary.googleVisionCalled ||
    caseSummary.placesCalled ||
    caseSummary.geminiCalled ||
    (caseSummary.asrCalled && !caseSummary.asrFallbackEnabled)
  ) {
    summary.providerBoundaryViolationCount += 1
  }

  const targets = [summary, summary.byCategory[category]]
  for (const target of targets) {
    target.total += 1
    if (resolution === 'RESOLVED') target.resolvedCount += 1
    else if (resolution === 'CANDIDATES') target.candidatesCount += 1
    else if (resolution === 'NEEDS_REVIEW') target.needsReviewCount += 1
    else if (resolution === 'UNRESOLVED') target.unresolvedCount += 1
    if (caseSummary.falseResolved) target.falseResolvedCount += 1
    if (caseSummary.providerErrors.length > 0) target.providerErrorCount += 1
    target.ocrTextBlockTotal += caseSummary.ocrTextBlockCount
    target.evidenceTotal += caseSummary.evidenceCount
    target.candidateTotal += caseSummary.candidateCount
    target.rawCandidateTotal += caseSummary.rawCandidateCount
    target.keptCandidateTotal += caseSummary.keptCandidateCount
    target.droppedCandidateTotal += caseSummary.droppedCandidateCount
    target.weakCandidateTotal += caseSummary.weakCandidateCount
    target.addressAnchoredCandidateTotal += caseSummary.addressAnchoredCandidateCount
    addReasonCounts(target.droppedCandidateReasons, caseSummary.droppedCandidateReasons)
  }
}

function categoryTotals(summary = {}, key) {
  return Object.fromEntries(
    Object.entries(summary.byCategory || {}).map(([category, breakdown]) => [
      category,
      Number(breakdown?.[key] || 0),
    ]),
  )
}

function recommendationHints(summary = {}) {
  const failures = summary.byFailureCategory || {}
  const hints = []
  if (Number(summary.casesNeedingMetadata || 0) > 0) {
    hints.push('Implement metadata evidence extraction next; these cases lack sufficient visual address evidence.')
  }
  if (Number(summary.casesNeedingParserRelaxation || 0) > 0) {
    hints.push('Improve parser normalization for address-like OCR that is still missing review candidates.')
  }
  if (Number(summary.casesNeedingHighResOcr || 0) > 0) {
    hints.push('Evaluate bounded high-resolution OCR for cases whose selected crops contain no usable address anchors.')
  }
  if (Number(summary.casesWithDateTimeHouseNumberBug || 0) > 0) {
    hints.push('Fix date and time filtering before any further house-number calibration.')
  }
  if ((summary.cases || []).some((item) =>
    ['GENERIC_REJECTED', 'NONFOOD_REJECTED'].includes(item.expectedOutcome) &&
    item.caseClosureStatus === 'FAILED_FALSE_CANDIDATE'
  )) {
    hints.push('Tighten food and address gating because a negative or generic-caption case produced a candidate.')
  }
  if (Number(failures.SELECTOR_MISSED_TEXT || 0) > 0) {
    hints.push('Improve frame and crop selection for cases where the selector missed visible overlay text.')
  }
  if (Number(failures.OCR_NOISY || 0) + Number(failures.OCR_HOUSE_NUMBER_CONFLICT || 0) > 0) {
    hints.push('Evaluate high-resolution crop enhancement for noisy OCR and house-number conflicts.')
  }
  if (Number(failures.GENERIC_CAPTION_ONLY || 0) > 0) {
    hints.push('Improve generic caption filtering without turning caption text into location evidence.')
  }
  if (Number(failures.PARSER_TOO_STRICT || 0) > 0) {
    hints.push('Review parser thresholds because address-like OCR snippets were present without candidates.')
  }
  if (Number(failures.UNSUPPORTED_VIDEO || 0) > 0) {
    hints.push('Restore Shorts download or frame extraction support before drawing OCR conclusions from unsupported-video cases.')
  }
  if (Number(failures.PROVIDER_ERROR || 0) > 0) {
    hints.push('Stabilize the failing local OCR or frame provider before changing candidate rules.')
  }
  if (summary.cases.some((item) => item.category === 'audio_only' && !item.asrFallbackEnabled)) {
    hints.push('Audio-only cases remain deferred; evaluate ASR in a later explicitly scoped phase.')
  }
  if (hints.length === 0) {
    hints.push('No dominant failure pattern was detected in this audit run.')
  }
  return hints
}

export function buildShortsTrack2V3AuditSummary(results = []) {
  const summary = {
    totalCases: 0,
    byResolution: {},
    byFailureCategory: Object.fromEntries(
      TRACK2_V3_AUDIT_FAILURE_CATEGORIES.map((category) => [category, 0]),
    ),
    byProvider: {},
    byCaseClosureStatus: Object.fromEntries(
      TRACK2_V3_AUDIT_CLOSURE_STATUSES.map((status) => [status, 0]),
    ),
    bySelectorDiagnosis: {},
    falseResolveCount: 0,
    autoResolveCount: 0,
    providerErrorCount: 0,
    casesWithHouseNumberConflict: 0,
    casesWithNoCandidate: 0,
    casesWithCandidates: 0,
    casesWithUnsupportedHouseNumber: 0,
    providerBoundaryViolationCount: 0,
    asrFallbackInvocationCount: 0,
    urlsWhereAsrRanDespiteNonBlockingReviewEvidence: 0,
    urlsSkippedDueRescueSufficient: 0,
    lateRescueBlockingCandidateTotal: 0,
    lateRescueNonBlockingCandidateTotal: 0,
    contextNumberRejectedAsHouseNumberCount: 0,
    floorNumberRejectedAsHouseNumberCount: 0,
    priceNumberRejectedAsHouseNumberCount: 0,
    asrSuccessfulTranscriptionCount: 0,
    asrProviderFailureCount: 0,
    urlsWithAsrCandidates: 0,
    urlsWithAsrFullEvidence: 0,
    urlsWithAsrPartialEvidence: 0,
    urlsWithAsrPlaceOrDistrictEvidence: 0,
    urlsWithAsrNoAddressSpeech: 0,
    asrCorroborationCounts: {},
    asrSpokenNumberUncertainCount: 0,
    asrNumberConflictCount: 0,
    totalAsrRuntimeMs: 0,
    totalAsrAudioDurationSeconds: 0,
    asrModelLoadCount: 0,
    asrProviderProcessReused: false,
    mediaAcquisitionCalledCount: 0,
    mediaAcquisitionAttemptTotal: 0,
    urlsRequiringMediaRetry: 0,
    urlsUsingFallbackFormat: 0,
    visualToAsrMediaReuseCount: 0,
    mediaSecondDownloadCount: 0,
    asrIndependentDownloadCount: 0,
    urlsWithMediaProviderErrors: 0,
    totalMediaAcquisitionRuntimeMs: 0,
    totalMediaReuseCount: 0,
    medianCaseRuntimeMs: 0,
    p90CaseRuntimeMs: 0,
    caseRuntimeMsValues: [],
    casesNeedingMetadata: 0,
    casesNeedingSelectorReview: 0,
    casesNeedingHighResOcr: 0,
    casesNeedingParserRelaxation: 0,
    casesWithDateTimeHouseNumberBug: 0,
    correctedNegativeCases: 0,
    correctlyRejectedGenericCaptions: 0,
    expectedOutcomePassCount: 0,
    expectedOutcomeFailCount: 0,
    manualValidationCaseCount: 0,
    total: 0,
    resolvedCount: 0,
    candidatesCount: 0,
    needsReviewCount: 0,
    unresolvedCount: 0,
    falseResolvedCount: 0,
    ocrTextBlockTotal: 0,
    evidenceTotal: 0,
    candidateTotal: 0,
    rawCandidateTotal: 0,
    keptCandidateTotal: 0,
    droppedCandidateTotal: 0,
    weakCandidateTotal: 0,
    addressAnchoredCandidateTotal: 0,
    droppedCandidateReasons: {},
    byCategory: {},
    candidateCountByCategory: {},
    droppedCandidateCountByCategory: {},
    recommendationHints: [],
    cases: [],
  }

  for (const entry of Array.isArray(results) ? results : []) {
    const caseSummary = entry?.result
      ? summarizeShortsTrack2V3AuditCase(entry.case || entry.item, entry.result)
      : entry
    if (!caseSummary || typeof caseSummary !== 'object') continue
    if (!caseSummary.failureCategory) {
      caseSummary.failureCategory = classifyShortsTrack2V3AuditFailure(caseSummary)
    }
    if (!caseSummary.caseClosureStatus) {
      Object.assign(caseSummary, classifyShortsTrack2V3AuditCaseClosure(caseSummary))
    }
    summary.cases.push(caseSummary)
    addCase(summary, caseSummary)
  }

  summary.falseResolvedCount = summary.falseResolveCount
  summary.averageAsrRuntimeMsPerTranscribedVideo = summary.asrSuccessfulTranscriptionCount > 0
    ? summary.totalAsrRuntimeMs / summary.asrSuccessfulTranscriptionCount
    : 0
  const sortedCaseRuntimes = [...summary.caseRuntimeMsValues].sort((left, right) => left - right)
  const runtimePercentile = (percentile) => {
    if (!sortedCaseRuntimes.length) return 0
    const index = Math.max(0, Math.ceil(percentile * sortedCaseRuntimes.length) - 1)
    return sortedCaseRuntimes[index]
  }
  summary.completedUrlCount = summary.totalCases
  summary.medianCaseRuntimeMs = runtimePercentile(0.5)
  summary.p90CaseRuntimeMs = runtimePercentile(0.9)
  delete summary.caseRuntimeMsValues
  summary.candidateCountByCategory = categoryTotals(summary, 'candidateTotal')
  summary.droppedCandidateCountByCategory = categoryTotals(summary, 'droppedCandidateTotal')
  summary.recommendationHints = recommendationHints(summary)
  return summary
}

function csvCell(value) {
  const text = Array.isArray(value)
    ? value.join('|')
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? '')
  return `"${text.replace(/"/gu, '""')}"`
}

export function buildShortsTrack2V3AuditCsv(cases = []) {
  const columns = [
    'id',
    'url',
    'videoId',
    'category',
    'expectedOutcome',
    'resolution',
    'failureCategory',
    'caseClosureStatus',
    'caseActionHint',
    'evidenceSourceHint',
    'shouldFixNow',
    'candidateCount',
    'keptCandidateCount',
    'droppedCandidateCount',
    'bestCandidate',
    'riskFlags',
    'canAutoResolve',
    'localOcrProvider',
    'localOcrBestSnippets',
    'adaptiveFrameSamplingEnabled',
    'adaptiveFrameSamplingRan',
    'adaptiveFrameCount',
    'adaptiveCropCount',
    'adaptiveSelectedCropIds',
    'ocrTextBlockCountFromAdaptiveFrames',
    'ocrSnippetsFromAdaptiveFrames',
    'candidateCountFromAdaptiveFrames',
    'adaptiveSamplingReason',
    'tailOverlayEscalationEnabled',
    'tailOverlayEscalationRan',
    'tailOverlayFrameIds',
    'tailOverlayFrameTimestamps',
    'tailOverlayCropIds',
    'tailOverlayCropCount',
    'tailOverlayOcrTextBlockCount',
    'tailOverlayOcrSnippets',
    'candidateCountFromTailOverlay',
    'tailOverlayEscalationReason',
    'tailOverlayProviderErrors',
    'providerErrors',
    'houseNumberAlternatives',
    'houseNumberConflict',
    'googleVisionCalled',
    'placesCalled',
    'geminiCalled',
    'asrCalled',
    'asrFallbackEnabled',
    'asrFallbackRan',
    'asrFallbackReason',
    'preAsrKeptCandidateCount',
    'preAsrLateRescueSufficient',
    'preAsrLateRescueSufficiencyReason',
    'preAsrLateRescueBlockingCandidateCount',
    'preAsrLateRescueNonBlockingCandidateCount',
    'lateRescueSufficiencyEvaluated',
    'lateRescueSufficient',
    'lateRescueSufficiencyReason',
    'lateRescueBlockingCandidateCount',
    'lateRescueNonBlockingCandidateCount',
    'numericContextClassifications',
    'contextNumberRejectedAsHouseNumberCount',
    'floorNumberRejectedAsHouseNumberCount',
    'priceNumberRejectedAsHouseNumberCount',
    'asrProvider',
    'asrModel',
    'asrDevice',
    'asrComputeType',
    'asrRequestedLanguage',
    'asrDetectedLanguage',
    'asrTranscriptSegmentCount',
    'asrTranscriptBestSnippets',
    'asrAddressEvidenceCount',
    'asrFullAddressEvidenceCount',
    'asrPartialAddressEvidenceCount',
    'asrPlaceOrDistrictEvidenceCount',
    'candidateCountFromAsr',
    'asrEvidenceBucket',
    'asrCorroborationType',
    'asrDirectlyTranscribedNumberForms',
    'asrNumberAlternatives',
    'asrSpokenNumberUncertain',
    'asrNumberConflict',
    'asrProviderErrors',
    'asrRuntimeMs',
    'asrAudioDurationSeconds',
    'asrModelLoadCount',
    'asrModelReused',
    'asrUsedSharedVideo',
    'asrIndependentDownloadCount',
    'mediaAcquisitionCalled',
    'mediaAcquisitionStatus',
    'mediaAcquisitionAttemptCount',
    'mediaAcquisitionAttempts',
    'mediaAcquisitionStrategies',
    'mediaAcquisitionSuccessfulStrategy',
    'mediaAcquisitionRuntimeMs',
    'mediaReuseCount',
    'mediaVideoAvailable',
    'mediaDurationAvailable',
    'mediaAudioExtractionCalled',
    'mediaAudioExtractionStatus',
    'mediaProviderErrors',
    'mediaVisualUsedSharedVideo',
    'mediaAsrUsedSharedVideo',
    'mediaAsrIndependentDownloadCount',
    'mediaSecondDownloadCount',
    'caseRuntimeMs',
    'geminiCropJudgeEnabled',
    'geminiCropJudgeCalled',
    'geminiCropJudgeProvider',
    'geminiCropJudgeSelectedCropIds',
    'geminiCropJudgeRejectedCropIds',
    'geminiCropJudgeContactSheetPaths',
    'geminiCropJudgeResultPath',
    'geminiCropJudgeErrors',
    'geminiCropJudgeAggregateStatus',
    'geminiCropJudgeRequestedPageCount',
    'geminiCropJudgeSuccessfulPageCount',
    'geminiCropJudgeFailedPageCount',
    'geminiCropJudgePartialSuccess',
    'geminiCropJudgeTotalAttemptCount',
    'geminiCropJudgeRetryCount',
    'geminiCropJudgeRateLimitCount',
    'geminiCropJudgeTimeoutCount',
    'geminiCropJudgeServerErrorCount',
    'geminiCropJudgeQueueWaitMs',
    'geminiCropJudgeProviderRuntimeMs',
    'geminiCropJudgeBackoffMs',
    'geminiCropJudgeMaxObservedConcurrency',
    'geminiCropJudgeDedupHitCount',
    'geminiCropJudgePageResults',
    'ocrTextBlockCountFromGeminiSelectedCrops',
    'ocrSnippetsFromGeminiSelectedCrops',
    'candidateCountFromGeminiSelectedCrops',
    'selectorDiagnosticsPath',
    'contactSheetPath',
    'generatedCropCount',
    'selectedCropIds',
    'cropRegionCounts',
    'selectorDiagnosis',
  ]
  const rows = [columns.map(csvCell).join(',')]
  for (const item of Array.isArray(cases) ? cases : []) {
    rows.push(columns.map((column) => csvCell(item?.[column])).join(','))
  }
  return `${rows.join('\n')}\n`
}

export function assertShortsTrack2V3AuditSafe(summary = {}) {
  const violations = []
  if (Number(summary.falseResolveCount ?? summary.falseResolvedCount ?? 0) > 0) {
    violations.push(`falseResolveCount=${summary.falseResolveCount ?? summary.falseResolvedCount}`)
  }
  if (Number(summary.autoResolveCount || 0) > 0) {
    violations.push(`autoResolveCount=${summary.autoResolveCount}`)
  }
  if (Number(summary.providerBoundaryViolationCount || 0) > 0) {
    violations.push(`providerBoundaryViolationCount=${summary.providerBoundaryViolationCount}`)
  }
  if (Number(summary.casesWithUnsupportedHouseNumber || 0) > 0) {
    violations.push(`casesWithUnsupportedHouseNumber=${summary.casesWithUnsupportedHouseNumber}`)
  }
  if (violations.length > 0) {
    throw new Error(`Track 2 V3 audit failed: ${violations.join(', ')}`)
  }
  return summary
}

export default {
  parseShortsTrack2V3AuditFixture,
  classifyShortsTrack2V3AuditFailure,
  classifyShortsTrack2V3AuditCaseClosure,
  summarizeShortsTrack2V3AuditCase,
  runShortsTrack2V3AuditCases,
  buildShortsTrack2V3AuditSummary,
  buildShortsTrack2V3AuditCsv,
  assertShortsTrack2V3AuditSafe,
}
