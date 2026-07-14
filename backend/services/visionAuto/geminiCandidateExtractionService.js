import { z } from 'zod'
import { defaultInvokeGemini } from '../geminiEvidenceValidationService.js'
import {
  matchingVietnamAdminTokens,
  matchingVietnamStreetTokens,
  normalizeVietnameseAddressText,
  vietnamHouseNumbers,
} from './vietnamAddressLexicon.js'

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_LINES = 80
const MAX_PROMPT_CHARS = 18_000
const MAX_ARRAY_ITEMS = 24
const MAX_TEXT_LENGTH = 700
const MIN_FRAME_TEXT_SIGNAL_COUNT = 2
const MIN_ADDRESSISH_OTHER_LINE_COUNT = 1
const GEMINI_CANDIDATE_STATUSES = new Set([
  'disabled',
  'skipped_gate',
  'missing_api_key',
  'missing_model',
  'requested',
  'success',
  'timeout',
  'invalid_json',
  'provider_error',
  'no_accepted_candidates',
])
const GENERIC_STREET_TOKENS = new Set([
  'duong',
  'street',
  'road',
  'hem',
  'ngo',
  'le',
  'tran',
  'nguyen',
  'pham',
  'vo',
  'hoang',
  'dinh',
  'phu',
])

const extractionStatusSchema = z.enum([
  'extracted',
  'no_candidates',
  'insufficient_evidence',
])

const geminiCandidateSchema = z.object({
  placeName: z.string().trim().min(1).max(180).nullable(),
  dishHint: z.string().trim().min(1).max(120).nullable(),
  address: z.string().trim().min(1).max(280).nullable(),
  phone: z.string().trim().min(1).max(40).nullable(),
  timestampSeconds: z.number().min(0).max(86_400).nullable(),
  evidenceText: z.string().trim().min(1).max(700),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(260),
  reviewRequired: z.literal(true),
})

const rejectedCandidateSchema = z.object({
  text: z.string().trim().min(1).max(700),
  reason: z.string().trim().min(1).max(260),
})

export const geminiCandidateExtractionResponseSchema = z.object({
  status: extractionStatusSchema,
  candidates: z.array(geminiCandidateSchema).max(MAX_ARRAY_ITEMS),
  rejected: z.array(rejectedCandidateSchema).max(MAX_ARRAY_ITEMS),
  warnings: z.array(z.string().trim().min(1).max(220)).max(12),
})

export const GEMINI_CANDIDATE_EXTRACTION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['extracted', 'no_candidates', 'insufficient_evidence'],
    },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          placeName: { type: 'string', nullable: true },
          dishHint: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          timestampSeconds: { type: 'number', nullable: true },
          evidenceText: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
          reviewRequired: { type: 'boolean' },
        },
        required: [
          'placeName',
          'dishHint',
          'address',
          'phone',
          'timestampSeconds',
          'evidenceText',
          'confidence',
          'reason',
          'reviewRequired',
        ],
      },
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['text', 'reason'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['status', 'candidates', 'rejected', 'warnings'],
}

const SYSTEM_INSTRUCTION = `
You extract food-place candidates from bounded YouTube/video OCR evidence.
Use only the evidence supplied in the request. Do not browse, search, use world knowledge, or guess exact places.
Return strict JSON matching the required schema. Do not wrap the JSON in markdown.

Your job:
- Read noisy OCR lines and metadata.
- Extract all possible food place/address candidates supported by OCR text.
- Extract address spans from long lines that contain menu/review/price words before the address.
- Keep uncertain but supported address candidates with lower confidence and reviewRequired true.

Strict safety rules:
- Do not invent an address, street, ward, district, place name, phone, or dish.
- A candidate address must be supported by OCR text in evidenceText.
- Prefer candidates with a house number plus street/locality evidence.
- Location-only text such as just a ward, district, city, or landmark is not an address.
- Generic video title/list phrases are not place names.
- Reviewer/person phrases are not place names.
- Prices, opening hours, or short numeric fragments are not phone numbers.
- Every candidate must have reviewRequired: true.

Address patterns to notice in Vietnamese OCR:
- slash house numbers such as 45/9, 20/29, 7B/105
- possible OCR slash omission such as 7B 105 when surrounded by street/locality evidence
- numeric house numbers followed by a street phrase, such as 132 Lò Siêu
- Lô, Chung Cư, Cư Xá, Hẻm, Kiệt, Ngõ, alley/block-style addresses
- ward/district support such as Phường, P., Quận, Q., Bình Thạnh, Gò Vấp, etc.

Place name rules:
- Prefer food-place-like names near address evidence, e.g. after/quasi-after quán, hàng, tiệm, ốc, cơm, bún, phở, bò bía.
- Reject generic discovery/title phrases such as: những quán, list quán, top, bán đồ ăn, dưới, siêu rẻ, ở Sài Gòn, nên thử.
- Reject reviewer/person phrases such as: đầu bếp, chef, ghé, reviewer's name/channel identity.
- If no safe place name exists, use null.

Phone rules:
- Only return phone if OCR evidence strongly supports a Vietnamese phone number.
- Reject prices, opening hours, and fragments such as 2000 4579 or 12 00-20 00.
`.trim()

function safeBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function configuredEnabled(value = process.env.GEMINI_CANDIDATE_EXTRACTION_ENABLED) {
  return safeBool(value, false)
}

function configuredMaxLines(value = process.env.GEMINI_CANDIDATE_EXTRACTION_MAX_LINES) {
  const parsed = Number(value || DEFAULT_MAX_LINES)
  return Math.max(5, Math.min(160, Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_MAX_LINES))
}

function configuredTimeoutMs(value = process.env.GEMINI_CANDIDATE_EXTRACTION_TIMEOUT_MS) {
  const parsed = Number(value || DEFAULT_TIMEOUT_MS)
  return Math.max(1_000, Math.min(60_000, Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_TIMEOUT_MS))
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function clampScore(value) {
  return roundScore(Math.max(0, Math.min(1, Number(value) || 0)))
}

function capText(value, maximumLength = MAX_TEXT_LENGTH) {
  const text = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength).trim()}...`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLooseText(value) {
  return normalizeText(value).replace(/\//g, '')
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter(Boolean))
}

function tokenSimilarity(left, right) {
  const leftTokens = tokenSet(left)
  const rightTokens = tokenSet(right)
  if (!leftTokens.size || !rightTokens.size) return 0
  const union = new Set([...leftTokens, ...rightTokens])
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return union.size ? shared / union.size : 0
}

function uniqueStrings(values, maximumItems = 100) {
  const seen = new Set()
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const text = capText(value)
    const key = normalizeText(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= maximumItems) break
  }
  return result
}

function frameEvidenceLines(frameEvidence = []) {
  const result = []
  for (const item of Array.isArray(frameEvidence) ? frameEvidence : []) {
    const timestampSeconds = Number.isFinite(Number(item?.timestampSeconds))
      ? Number(item.timestampSeconds)
      : null
    const sourceLines = Array.isArray(item?.textLines)
      ? item.textLines
      : Array.isArray(item?.lines)
        ? item.lines
        : item?.text
          ? [item]
          : []
    for (const line of sourceLines) {
      const text = capText(line?.text)
      if (!text) continue
      result.push({
        text,
        timestampSeconds,
        confidence: clampScore(line?.confidence ?? item?.confidence),
        selectedLineType: capText(
          line?.type || line?.lineType || item?.selectedLineType || item?.type || 'unknown',
          40,
        ),
        source: capText(item?.source || 'youtube_frame_ocr', 60),
      })
    }
  }
  return result
}

function metadataValues(input = {}) {
  const values = []
  const urlEvidence = input.urlEvidence || {}
  if (urlEvidence.title) values.push({ type: 'title', text: urlEvidence.title })
  if (urlEvidence.description) values.push({ type: 'description', text: urlEvidence.description })
  if (urlEvidence.channelTitle) values.push({ type: 'channel', text: urlEvidence.channelTitle })

  const metadata = input.metadata || input.evidenceSummary?.metadata || []
  for (const item of Array.isArray(metadata) ? metadata : []) {
    if (!item?.text) continue
    values.push({
      type: capText(item.type || item.source || 'metadata', 50),
      text: item.text,
    })
  }
  return values
}

function localCandidateSummary(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      placeName: candidate?.placeName ? capText(candidate.placeName, 180) : null,
      dishHint: candidate?.dishHint ? capText(candidate.dishHint, 120) : null,
      address: candidate?.address ? capText(candidate.address, 260) : null,
      phone: candidate?.phone ? capText(candidate.phone, 40) : null,
      timestampSeconds: Number.isFinite(Number(candidate?.timestampSeconds))
        ? Number(candidate.timestampSeconds)
        : null,
      confidence: clampScore(candidate?.confidence),
      source: candidate?.source ? capText(candidate.source, 80) : null,
      evidence: uniqueStrings(Array.isArray(candidate?.evidence) ? candidate.evidence : [candidate?.evidence], 6),
    }))
    .filter((item) => item.address || item.placeName || item.phone)
    .slice(0, MAX_ARRAY_ITEMS)
}

function frameSignalTexts(summary = {}) {
  return uniqueStrings([
    ...(Array.isArray(summary.frameTexts) ? summary.frameTexts : []),
    ...(Array.isArray(summary.frameLines)
      ? summary.frameLines.map((item) => item?.text)
      : []),
  ], 160)
}

function addressishOtherLineCount(summary = {}) {
  return addressishOtherLines(summary).length
}

function addressishOtherLines(summary = {}) {
  const frameLines = Array.isArray(summary.frameLines)
    ? summary.frameLines
    : []
  return frameLines.filter((line) => {
    const type = normalizeText(line?.selectedLineType || line?.type || 'other')
    const untypedOrOther = !type || ['other', 'unknown', 'frame text', 'frame_text'].includes(type)
    if (!untypedOrOther) return false
    const text = line?.text || ''
    return Boolean(
      looksLikeAddress(text) ||
        /\b\d{1,4}[a-zA-Z]?\b.+\b(phường|phuong|p\.?|quận|quan|q\.?)\b/iu.test(text),
    )
  })
}

function normalizedDecisionStatus(input = {}) {
  return String(input.decisionStatus || input.status || '').trim().toLowerCase()
}

function normalizedAddressText(value) {
  return normalizeVietnameseAddressText(value)
}

function editDistanceAtMostTwo(left, right) {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 2) return false
  const rows = Array.from({ length: left.length + 1 }, () => [])
  for (let index = 0; index <= left.length; index += 1) rows[index][0] = index
  for (let index = 0; index <= right.length; index += 1) rows[0][index] = index
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + cost,
      )
    }
  }
  return rows[left.length][right.length] <= 2
}

function isDigitSubsequence(shorter, longer) {
  let index = 0
  for (const digit of longer) {
    if (digit === shorter[index]) index += 1
    if (index >= shorter.length) return true
  }
  return false
}

function houseNumberDigits(value) {
  const houseNumber = vietnamHouseNumbers(value)[0] || ''
  return houseNumber.replace(/\D/g, '')
}

function streetLocalitySegment(value) {
  const normalized = normalizedAddressText(value)
  if (!normalized) return ''
  const houseNumbers = vietnamHouseNumbers(value)
  let segment = normalized
  if (houseNumbers.length) {
    const house = normalizedAddressText(houseNumbers[0])
    const index = normalized.indexOf(house)
    if (index >= 0) segment = normalized.slice(index + house.length)
  }
  return segment
    .replace(/\b(?:p|phuong|q|quan|district|ward)\s*[a-z0-9].*$/u, ' ')
    .replace(/\b(?:tp hcm|tphcm|ho chi minh|ha noi|da nang|hai phong|can tho)\b.*$/u, ' ')
    .replace(/\b\d{1,4}\s*(?:k|000)\b/gu, ' ')
    .replace(/\b(?:top|list|nhung|những|quan|quán|mon|món|an|ăn|gia|giá|re|rẻ|review|shorts?)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
}

function addressGroupInfo(value) {
  const text = String(value || '').trim()
  const normalized = normalizedAddressText(text)
  const streetTokens = matchingVietnamStreetTokens(text)
  const specificStreetTokens = streetTokens.filter(
    (token) => !GENERIC_STREET_TOKENS.has(token),
  )
  const adminTokens = matchingVietnamAdminTokens(text)
  const segment = streetLocalitySegment(text)
  const streetKey = [
    ...specificStreetTokens,
    ...(segment ? [segment] : []),
  ]
    .map(normalizedAddressText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .slice(0, 3)
    .join('|')
  return {
    text,
    normalized,
    houseDigits: houseNumberDigits(text),
    streetKey,
    streetTokens: specificStreetTokens,
    adminKey: adminTokens.sort().join('|'),
  }
}

function streetKeysOverlap(left, right) {
  if (!left.streetKey || !right.streetKey) return false
  const leftParts = left.streetKey.split('|').filter(Boolean)
  const rightParts = right.streetKey.split('|').filter(Boolean)
  return leftParts.some((leftPart) =>
    rightParts.some((rightPart) => {
      const shorter = leftPart.length <= rightPart.length ? leftPart : rightPart
      const longer = leftPart.length > rightPart.length ? leftPart : rightPart
      return (
        shorter.split(' ').filter(Boolean).length >= 2 &&
        (longer === shorter || longer.startsWith(`${shorter} `))
      )
    }),
  )
}

function slashOrGluedDuplicate(left, right) {
  if (!left.houseDigits || !right.houseDigits) return false
  const shorter =
    left.houseDigits.length <= right.houseDigits.length
      ? left.houseDigits
      : right.houseDigits
  const longer =
    left.houseDigits.length > right.houseDigits.length
      ? left.houseDigits
      : right.houseDigits
  return (
    longer.length - shorter.length <= 3 &&
    (isDigitSubsequence(shorter, longer) ||
      editDistanceAtMostTwo(left.houseDigits, right.houseDigits))
  )
}

function sameAddressGroup(left, right) {
  if (!left.normalized || !right.normalized) return false
  if (left.normalized === right.normalized) return true
  if (streetKeysOverlap(left, right)) return true
  const sharedStreet = left.streetTokens.some((token) =>
    right.streetTokens.includes(token),
  )
  if (sharedStreet && (left.adminKey === right.adminKey || slashOrGluedDuplicate(left, right))) {
    return true
  }
  return false
}

function distinctAddressGroups(values = []) {
  const groups = []
  for (const value of Array.isArray(values) ? values : []) {
    const info = addressGroupInfo(
      value?.address || value?.text || value?.evidenceText || value,
    )
    if (!info.normalized) continue
    const existing = groups.find((group) => sameAddressGroup(group, info))
    if (existing) continue
    groups.push(info)
  }
  return groups
}

function localCandidateAddressValues(input = {}, summary = {}) {
  return [
    ...(Array.isArray(summary.localCandidates)
      ? summary.localCandidates.map((candidate) => candidate.address)
      : []),
    ...(Array.isArray(input.candidates)
      ? input.candidates.map((candidate) => candidate?.address)
      : []),
  ].filter(Boolean)
}

function candidateStatus(value) {
  const status = String(value || '').trim()
  return GEMINI_CANDIDATE_STATUSES.has(status) ? status : 'provider_error'
}

function providerStatusFromReason(reason) {
  if (reason === 'missing_api_key') return 'missing_api_key'
  if (reason === 'missing_model') return 'missing_model'
  if (reason === 'api_timeout') return 'timeout'
  if (
    reason === 'json_parse_failed' ||
    reason === 'schema_validation_failed' ||
    reason === 'api_invalid_response'
  ) {
    return 'invalid_json'
  }
  return 'provider_error'
}

export function evaluateGeminiCandidateExtractionGate(input = {}) {
  const enabled = configuredEnabled(input.enabled)
  const summary = buildGeminiCandidateExtractionSummary(input)
  const frameTextCount = frameSignalTexts(summary).length
  const addressishLines = addressishOtherLines(summary)
  const addressishEvidenceGroups = distinctAddressGroups(
    addressishLines.map((line) => line.text),
  )
  const localAddressGroups = distinctAddressGroups(
    localCandidateAddressValues(input, summary),
  )
  const decisionStatus = normalizedDecisionStatus(input)
  const allowedDecisionStatus = [
    'unresolved',
    'unresolved_best_effort',
    'multi_candidate',
  ].includes(decisionStatus)

  if (!enabled) {
    return {
      shouldRun: false,
      status: 'disabled',
      skipReason: 'feature_disabled',
      summary,
      frameTextCount,
      addressishOtherLineCount: addressishLines.length,
      addressishEvidenceGroupCount: addressishEvidenceGroups.length,
      localDistinctAddressGroupCount: localAddressGroups.length,
    }
  }
  if (!allowedDecisionStatus) {
    return {
      shouldRun: false,
      status: 'skipped_gate',
      skipReason: 'unsupported_decision_status',
      summary,
      frameTextCount,
      addressishOtherLineCount: addressishLines.length,
      addressishEvidenceGroupCount: addressishEvidenceGroups.length,
      localDistinctAddressGroupCount: localAddressGroups.length,
    }
  }
  if (frameTextCount < MIN_FRAME_TEXT_SIGNAL_COUNT) {
    return {
      shouldRun: false,
      status: 'skipped_gate',
      skipReason: 'insufficient_frame_texts',
      summary,
      frameTextCount,
      addressishOtherLineCount: addressishLines.length,
      addressishEvidenceGroupCount: addressishEvidenceGroups.length,
      localDistinctAddressGroupCount: localAddressGroups.length,
    }
  }
  if (addressishLines.length < MIN_ADDRESSISH_OTHER_LINE_COUNT) {
    return {
      shouldRun: false,
      status: 'skipped_gate',
      skipReason: 'no_addressish_other_lines',
      summary,
      frameTextCount,
      addressishOtherLineCount: addressishLines.length,
      addressishEvidenceGroupCount: addressishEvidenceGroups.length,
      localDistinctAddressGroupCount: localAddressGroups.length,
    }
  }
  if (localAddressGroups.length >= addressishEvidenceGroups.length) {
    return {
      shouldRun: false,
      status: 'skipped_gate',
      skipReason: 'local_candidates_cover_addressish_evidence',
      summary,
      frameTextCount,
      addressishOtherLineCount: addressishLines.length,
      addressishEvidenceGroupCount: addressishEvidenceGroups.length,
      localDistinctAddressGroupCount: localAddressGroups.length,
    }
  }
  return {
    shouldRun: true,
    status: 'requested',
    skipReason: null,
    summary,
    frameTextCount,
    addressishOtherLineCount: addressishLines.length,
    addressishEvidenceGroupCount: addressishEvidenceGroups.length,
    localDistinctAddressGroupCount: localAddressGroups.length,
  }
}

function arrayValues(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => item?.value || item?.text || item)
    .filter(Boolean)
    .map((item) => capText(item, 160))
    .slice(0, 20)
}

export function buildGeminiCandidateExtractionSummary(input = {}) {
  const maxLines = configuredMaxLines(input.maxLines)
  const frameTexts = uniqueStrings([
    ...(Array.isArray(input.frameTexts) ? input.frameTexts : []),
    ...(Array.isArray(input.evidenceSummary?.frameTexts) ? input.evidenceSummary.frameTexts : []),
  ], maxLines)
  const lineObjects = frameEvidenceLines(
    input.frameEvidence || input.evidenceSummary?.frameEvidence || [],
  )
  const remainingLineBudget = Math.max(0, maxLines - frameTexts.length)
  const frameLines = [
    ...lineObjects.slice(0, remainingLineBudget),
  ]
  const ruleEntities = input.ruleEntities || input.entities || {}
  return {
    inputType: capText(input.inputType || input.input?.type || 'youtube_url', 60),
    platform: capText(input.platform || input.input?.platform || 'youtube', 40),
    url: input.url || input.input?.url ? capText(input.url || input.input.url, 500) : null,
    metadata: metadataValues(input)
      .map((item) => ({
        type: capText(item.type || 'metadata', 60),
        text: capText(item.text, 500),
      }))
      .filter((item) => item.text)
      .slice(0, 12),
    frameTexts,
    frameLines,
    localCandidates: localCandidateSummary([
      ...(Array.isArray(input.localCandidates) ? input.localCandidates : []),
      ...(Array.isArray(input.candidates) ? input.candidates : []),
    ]),
    localEntities: {
      placeName: ruleEntities?.placeName?.value
        ? capText(ruleEntities.placeName.value, 180)
        : null,
      address: ruleEntities?.address?.value
        ? capText(ruleEntities.address.value, 260)
        : null,
      phones: arrayValues(ruleEntities?.phones),
      dishNames: arrayValues(ruleEntities?.dishNames),
      locationHints: arrayValues(ruleEntities?.locationHints),
    },
  }
}

function allEvidenceStrings(summary = {}) {
  return uniqueStrings([
    ...(Array.isArray(summary.metadata) ? summary.metadata.map((item) => item.text) : []),
    ...(Array.isArray(summary.frameTexts) ? summary.frameTexts : []),
    ...(Array.isArray(summary.frameLines) ? summary.frameLines.map((item) => item.text) : []),
    ...(Array.isArray(summary.localCandidates)
      ? summary.localCandidates.flatMap((candidate) => [
          candidate.address,
          candidate.placeName,
          candidate.phone,
          ...(Array.isArray(candidate.evidence) ? candidate.evidence : []),
        ])
      : []),
    summary.localEntities?.placeName,
    summary.localEntities?.address,
    ...(Array.isArray(summary.localEntities?.phones) ? summary.localEntities.phones : []),
    ...(Array.isArray(summary.localEntities?.dishNames) ? summary.localEntities.dishNames : []),
    ...(Array.isArray(summary.localEntities?.locationHints) ? summary.localEntities.locationHints : []),
  ], 400)
}

function valueSupportedByEvidence(value, evidence, { loose = false } = {}) {
  const normalized = loose ? normalizeLooseText(value) : normalizeText(value)
  if (!normalized) return false
  return evidence.some((item) => {
    const evidenceText = loose ? normalizeLooseText(item) : normalizeText(item)
    return Boolean(
      evidenceText &&
        (
          evidenceText.includes(normalized) ||
          normalized.includes(evidenceText) ||
          tokenSimilarity(normalized, evidenceText) >= 0.58
        ),
    )
  })
}

function looksLikeAddress(value) {
  const text = String(value || '').trim()
  const normalized = normalizeText(text)
  if (!normalized) return false

  const hasHouseNumber = /\b(?:\d{1,4}[a-zA-Z]?\s*[\/-]\s*\d{1,4}[a-zA-Z]?|\d{1,4}[a-zA-Z]?)\b/u.test(text)
  const hasBlockAddress = /\b(lô|lo|block|chung\s*cư|chung\s*cu|cư\s*xá|cu\s*xa|hẻm|hem|kiệt|kiet|ngõ|ngo)\b/iu.test(text)
  const hasStreetishTail = /\b(đường|duong|phố|pho|hẻm|hem|lò|lo|lê|le|nguyễn|nguyen|trần|tran|phường|phuong|p\.?|quận|quan|q\.?)\b/iu.test(text)
  const hasLocality = /\b(phường|phuong|p\.?\s*\d{1,2}|quận|quan|q\.?\s*\d{1,2}|bình\s*thạnh|binh\s*thanh|gò\s*vấp|go\s*vap|thủ\s*đức|thu\s*duc)\b/iu.test(text)

  if (hasBlockAddress && hasStreetishTail) return true
  if (hasHouseNumber && (hasStreetishTail || hasLocality)) return true
  return false
}

function looksLocationOnly(value) {
  const normalized = normalizeText(value)
  if (!normalized) return true
  return /^(phuong|p|quan|q|binh thanh|go vap|sai gon|hcm|tp hcm|ho chi minh)(\s+\d{1,2})?$/i.test(normalized)
}

function looksGenericPlaceName(value) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return /\b(nhung quan|list quan|top|ban do an|duoi|sieu re|o sai gon|nen thu|review|food|shorts?|fyp)\b/i.test(normalized) ||
    /\b\d{1,3}\s*(k|000|\.000)\b/i.test(normalized)
}

function looksReviewerOrPersonPhrase(value) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return /\b(dau bep|chef|ghe|kham pha|reviewer|food reviewer|channel|official)\b/i.test(normalized)
}

function cleanPlaceName(value) {
  const text = capText(value, 180)
  if (!text) return null
  if (looksGenericPlaceName(text) || looksReviewerOrPersonPhrase(text)) return null
  return text
}

function evidenceHasPhoneContext(phone, evidenceText) {
  return /\b(sđt|sdt|đt|dt|điện\s*thoại|dien\s*thoai|phone|tel|hotline|zalo)\b/iu.test(evidenceText || phone || '')
}

function looksLikeOpeningHours(value, evidenceText = '') {
  const text = `${value || ''} ${evidenceText || ''}`
  return /\b\d{1,2}\s*[:h.]?\s*\d{0,2}\s*[-–]\s*\d{1,2}\s*[:h.]?\s*\d{0,2}\b/u.test(text)
}

function cleanPhone(value, evidenceText = '') {
  const text = capText(value, 40)
  if (!text) return null
  if (looksLikeOpeningHours(text, evidenceText)) return null
  const digits = normalizePhone(text)
  if (!/^0\d{8,10}$/.test(digits)) return null
  const knownPrefix = /^(02|03|05|07|08|09)/.test(digits)
  if (!knownPrefix && !evidenceHasPhoneContext(text, evidenceText)) return null
  if (/\b\d{1,3}\s*(k|000|\.000)\b/i.test(evidenceText)) return null
  return digits
}

function cleanAddress(value) {
  const text = capText(value, 280)
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

function evidenceTextForCandidate(candidate, evidence) {
  const given = capText(candidate?.evidenceText, MAX_TEXT_LENGTH)
  if (given && valueSupportedByEvidence(given, evidence)) return given
  const values = [candidate?.address, candidate?.placeName, candidate?.dishHint]
    .filter(Boolean)
    .map(normalizeText)
    .filter(Boolean)
  if (!values.length) return given || null
  return evidence.find((item) => {
    const normalized = normalizeText(item)
    return values.some((value) => normalized.includes(value) || tokenSimilarity(normalized, value) >= 0.5)
  }) || given || null
}

function candidateKey(candidate) {
  return normalizeLooseText(candidate.address || candidate.evidenceText || candidate.placeName)
}

function dedupeCandidates(candidates = []) {
  const result = []
  const seen = new Set()
  for (const candidate of candidates) {
    const key = candidateKey(candidate)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

function validateExtractedCandidate(candidate, summary) {
  const evidence = allEvidenceStrings(summary)
  const evidenceText = evidenceTextForCandidate(candidate, evidence)
  const warnings = []
  if (!evidenceText || !valueSupportedByEvidence(evidenceText, evidence)) {
    return { accepted: false, reason: 'candidate_evidence_text_not_supported' }
  }

  const address = cleanAddress(candidate?.address)
  if (!address) {
    return { accepted: false, reason: 'candidate_missing_address' }
  }
  if (looksLocationOnly(address)) {
    return { accepted: false, reason: 'candidate_location_only_address' }
  }
  if (!looksLikeAddress(address)) {
    return { accepted: false, reason: 'candidate_address_not_address_like' }
  }
  if (!valueSupportedByEvidence(address, evidence, { loose: true })) {
    const similarity = tokenSimilarity(address, evidenceText)
    if (similarity < 0.48) {
      return { accepted: false, reason: 'candidate_address_not_supported_by_ocr' }
    }
    warnings.push('candidate_address_fuzzy_supported')
  }

  const phone = cleanPhone(candidate?.phone, evidenceText)
  const placeName = cleanPlaceName(candidate?.placeName)
  const dishHint = candidate?.dishHint && !looksGenericPlaceName(candidate.dishHint)
    ? capText(candidate.dishHint, 120)
    : null

  return {
    accepted: true,
    warnings,
    candidate: {
      placeName,
      dishHint,
      address,
      phone,
      timestampSeconds: Number.isFinite(Number(candidate?.timestampSeconds))
        ? Number(candidate.timestampSeconds)
        : null,
      confidence: clampScore(Math.min(0.92, Math.max(0.35, candidate?.confidence))),
      reason: capText(candidate?.reason || 'gemini_extracted_from_ocr_evidence', 260),
      reviewRequired: true,
      source: 'gemini_ocr_candidate_extraction',
      evidence: uniqueStrings([evidenceText, candidate?.evidenceText], 6),
      evidenceText,
    },
  }
}

function parseGeminiJsonText(value) {
  if (typeof value !== 'string') return value
  const raw = value.trim()
  if (!raw) {
    const error = new Error('Gemini returned an empty JSON response.')
    error.code = 'json_parse_failed'
    throw error
  }
  const candidates = [raw]
  const fenceStripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  if (fenceStripped && fenceStripped !== raw) candidates.push(fenceStripped)
  const objectMatch = fenceStripped.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) candidates.push(objectMatch[0].trim())

  let lastError = null
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch (error) {
      lastError = error
    }
  }
  const error = new Error('Gemini returned invalid JSON.')
  error.code = 'json_parse_failed'
  error.cause = lastError
  throw error
}

function promptForSummary(summary) {
  return `
Extract food-place candidates from this bounded OCR/metadata summary.
Return exactly one complete JSON object matching the required schema.
Do not wrap JSON in markdown. Do not add prose.
Use OCR evidence only. Do not browse, search, or use outside knowledge.

Summary:
${JSON.stringify(summary)}
  `.trim().slice(0, MAX_PROMPT_CHARS)
}

function failureReason(error) {
  const supportedReasons = new Set([
    'missing_api_key',
    'missing_model',
    'api_key_invalid',
    'model_not_found',
    'api_forbidden',
    'quota_exceeded',
    'api_timeout',
    'api_fetch_failed',
    'api_invalid_response',
    'json_parse_failed',
    'schema_validation_failed',
  ])
  if (supportedReasons.has(error?.code)) return error.code
  if (error?.name === 'AbortError') return 'api_timeout'
  if (error instanceof SyntaxError) return 'json_parse_failed'
  return 'api_fetch_failed'
}

function failureWarning(reason) {
  return {
    missing_api_key: 'gemini_candidate_api_key_missing',
    missing_model: 'gemini_candidate_model_missing',
    api_key_invalid: 'gemini_candidate_api_key_invalid',
    model_not_found: 'gemini_candidate_model_not_found',
    api_forbidden: 'gemini_candidate_api_forbidden',
    quota_exceeded: 'gemini_candidate_quota_exceeded',
    api_timeout: 'gemini_candidate_api_timeout',
    api_fetch_failed: 'gemini_candidate_api_fetch_failed',
    api_invalid_response: 'gemini_candidate_api_invalid_response',
    json_parse_failed: 'gemini_candidate_json_parse_failed',
    schema_validation_failed: 'gemini_candidate_schema_validation_failed',
  }[reason] || 'gemini_candidate_api_fetch_failed'
}

export function shouldRunGeminiCandidateExtraction(input = {}) {
  return evaluateGeminiCandidateExtractionGate(input).shouldRun
}

export async function extractVisionAutoCandidatesWithGemini(
  input = {},
  {
    apiKey = process.env.GEMINI_API_KEY || '',
    model = process.env.GEMINI_MODEL || '',
    timeoutMs = configuredTimeoutMs(),
    invokeGemini = defaultInvokeGemini,
    fetchImpl = globalThis.fetch,
    force = false,
  } = {},
) {
  const gate = evaluateGeminiCandidateExtractionGate(input)
  const summary = gate.summary
  const keyConfigured = Boolean(String(apiKey || '').trim())
  const modelConfigured = Boolean(String(model || '').trim())

  if (!force && !gate.shouldRun) {
    return {
      provider: 'gemini',
      requested: false,
      applied: false,
      status: candidateStatus(gate.status),
      skipReason: gate.skipReason,
      candidates: [],
      rejected: [],
      warnings: [],
      keyConfigured,
      modelConfigured,
      summary,
      debug: {
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
        frameTextCount: gate.frameTextCount,
        addressishOtherLineCount: gate.addressishOtherLineCount,
        addressishEvidenceGroupCount: gate.addressishEvidenceGroupCount,
        localDistinctAddressGroupCount: gate.localDistinctAddressGroupCount,
      },
    }
  }
  if (!keyConfigured) {
    return {
      provider: 'gemini',
      requested: true,
      applied: false,
      status: 'missing_api_key',
      reason: 'missing_api_key',
      skipReason: null,
      candidates: [],
      rejected: [],
      warnings: [failureWarning('missing_api_key')],
      keyConfigured,
      modelConfigured,
      summary,
      debug: {
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
      },
    }
  }
  if (!modelConfigured) {
    return {
      provider: 'gemini',
      requested: true,
      applied: false,
      status: 'missing_model',
      reason: 'missing_model',
      skipReason: null,
      candidates: [],
      rejected: [],
      warnings: [failureWarning('missing_model')],
      keyConfigured,
      modelConfigured,
      summary,
      debug: {
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
      },
    }
  }

  try {
    const raw = await invokeGemini({
      prompt: promptForSummary(summary),
      systemInstruction: SYSTEM_INSTRUCTION,
      responseSchema: GEMINI_CANDIDATE_EXTRACTION_RESPONSE_JSON_SCHEMA,
      apiKey,
      model,
      timeoutMs: configuredTimeoutMs(timeoutMs),
      fetchImpl,
    })
    const responseValue = raw?.providerResult === true ? raw.text : raw?.text || raw
    const parsed = parseGeminiJsonText(responseValue)
    const validated = geminiCandidateExtractionResponseSchema.safeParse(parsed)
    if (!validated.success) {
      return {
        provider: 'gemini',
        requested: true,
        applied: false,
        status: 'invalid_json',
        reason: 'schema_validation_failed',
        skipReason: null,
        candidates: [],
        rejected: [],
        warnings: [failureWarning('schema_validation_failed')],
        keyConfigured,
        modelConfigured,
        httpStatus: raw?.httpStatus || null,
        summary,
        debug: {
          geminiCandidateAcceptedCount: 0,
          geminiCandidateRejectedCount: 0,
        },
      }
    }

    const accepted = []
    const rejected = []
    const warnings = []
    for (const candidate of validated.data.candidates) {
      const result = validateExtractedCandidate(candidate, summary)
      if (result.accepted) {
        accepted.push(result.candidate)
        warnings.push(...result.warnings)
      } else {
        rejected.push({
          text: capText(candidate.evidenceText || candidate.address || '', 500),
          reason: result.reason,
        })
      }
    }

    return {
      provider: 'gemini',
      requested: true,
      applied: accepted.length > 0,
      status: accepted.length > 0 ? 'success' : 'no_accepted_candidates',
      skipReason: null,
      candidates: dedupeCandidates(accepted).slice(0, MAX_ARRAY_ITEMS),
      rejected: [
        ...validated.data.rejected,
        ...rejected,
      ].slice(0, MAX_ARRAY_ITEMS),
      warnings: uniqueStrings([
        ...(Array.isArray(raw?.warnings) ? raw.warnings : []),
        ...validated.data.warnings,
        ...warnings,
      ], 12),
      keyConfigured,
      modelConfigured,
      httpStatus: raw?.httpStatus || null,
      summary,
      debug: {
        geminiCandidateCount: validated.data.candidates.length,
        geminiCandidateAcceptedCount: accepted.length,
        geminiCandidateRejectedCount: rejected.length + validated.data.rejected.length,
      },
    }
  } catch (error) {
    const reason = failureReason(error)
    return {
      provider: 'gemini',
      requested: true,
      applied: false,
      status: providerStatusFromReason(reason),
      reason,
      skipReason: null,
      candidates: [],
      rejected: [],
      warnings: [failureWarning(reason)],
      keyConfigured,
      modelConfigured,
      httpStatus: Number(error?.status || 0) || null,
      summary,
      debug: {
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
      },
    }
  }
}

export function mergeGeminiCandidatesWithLocalCandidates(
  localCandidates = [],
  geminiCandidates = [],
) {
  const merged = [
    ...(Array.isArray(localCandidates) ? localCandidates : []),
    ...(Array.isArray(geminiCandidates) ? geminiCandidates : []),
  ]
  return dedupeCandidates(merged)
}

export {
  configuredEnabled as configuredGeminiCandidateExtractionEnabled,
  configuredMaxLines as configuredGeminiCandidateExtractionMaxLines,
  configuredTimeoutMs as configuredGeminiCandidateExtractionTimeoutMs,
}
