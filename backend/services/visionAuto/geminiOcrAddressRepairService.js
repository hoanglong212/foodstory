import { defaultInvokeGemini } from '../geminiEvidenceValidationService.js'
import {
  hasLikelyDamagedAddressPrefix,
  hasVietnamAddressLabel,
  hasVietnamAdminOrArea,
  hasVietnamHouseNumber,
  hasVietnamStreetName,
  isVietnamAddressEvidence,
  isWeakVietnamAddressText,
  matchingVietnamAdminTokens,
  matchingVietnamStreetTokens,
  normalizeVietnameseAddressText,
  vietnamHouseNumbers,
} from './vietnamAddressLexicon.js'

const DEFAULT_TIMEOUT_MS = 12_000
const MAX_RESPONSE_BYTES = 80_000

const GEMINI_OCR_ADDRESS_REPAIR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    address: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
    needsVerification: { type: 'boolean' },
  },
  required: [
    'address',
    'confidence',
    'reason',
    'needsVerification',
  ],
}

const SYSTEM_INSTRUCTION = `
You repair Vietnamese food-place address OCR from YouTube frames.
Use ONLY the supplied OCR lines and metadata. Do not browse or use outside knowledge.
Your job is to normalize an address only when the OCR clearly contains one.
Return strict JSON matching the schema.

Rules:
- Do not invent a restaurant name.
- Do not invent a street or district that is not visible in the OCR/metadata.
- You may remove OCR characters that clearly came from a damaged address label,
  but only when the remaining house number, street, and area are supported.
- A leading "D", "DC", or similar damaged address label must not automatically
  become part of the house number.
- Keep review confidence below 0.9 unless the full address is very clear.
- If the OCR text is just food narration, menu text, random symbols, or not enough for an address, return address null and confidence 0.
- Reject promotional or location-only text without a house number and street,
  including review summaries, "thêm N quán", district-only, or ward-only text.
- Set needsVerification true for every repaired OCR address.
`.trim()

function capText(value, maximumLength = 700) {
  const text = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength).trim()}...`
}

function normalizeText(value) {
  return normalizeVietnameseAddressText(value)
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function safeModel(value) {
  const model = String(value || '').trim()
  return /^[A-Za-z0-9._-]{1,100}$/.test(model) ? model : ''
}

function boundedWarnings(values, maximumItems = 8) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => capText(value, 120))
        .filter(Boolean),
    ),
  ].slice(0, maximumItems)
}

function collectOcrLines(normalizedEvidence = {}) {
  const values = []
  for (const item of Array.isArray(normalizedEvidence.frameEvidence)
    ? normalizedEvidence.frameEvidence
    : []) {
    values.push({
      text: capText(item?.evidenceText || item?.text, 260),
      confidence: roundScore(item?.confidence),
      type: capText(item?.type || item?.lineType || 'other', 40),
      source: 'youtube_frame_ocr',
      timestampSeconds: Number.isFinite(Number(item?.timestampSeconds))
        ? Number(item.timestampSeconds)
        : null,
    })
  }
  for (const text of Array.isArray(normalizedEvidence.frameTexts)
    ? normalizedEvidence.frameTexts
    : []) {
    values.push({
      text: capText(text, 260),
      confidence: 0.55,
      type: 'frame_text',
      source: 'youtube_frame_ocr',
      timestampSeconds: null,
    })
  }
  for (const text of Array.isArray(normalizedEvidence.ocrLines)
    ? normalizedEvidence.ocrLines
    : []) {
    values.push({
      text: capText(text, 260),
      confidence: 0.45,
      type: 'ocr_line',
      source: 'thumbnail_or_uploaded_ocr',
      timestampSeconds: null,
    })
  }

  const seen = new Set()
  return values
    .filter((item) => item.text)
    .filter((item) => {
      const key = normalizeText(item.text)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 18)
}

function metadataSummary(normalizedEvidence = {}) {
  return (Array.isArray(normalizedEvidence.metadata)
    ? normalizedEvidence.metadata
    : [])
    .map((item) => ({
      type: capText(item?.type || 'metadata', 40),
      text: capText(item?.text, 400),
      confidence: roundScore(item?.confidence),
    }))
    .filter((item) => item.text)
    .slice(0, 8)
}

function hasAddressishOcrLine(lines = []) {
  return (Array.isArray(lines) ? lines : []).some((item) => {
    const text = item?.text
    if (!text || isWeakVietnamAddressText(text)) return false
    return Boolean(
      hasVietnamHouseNumber(text) &&
        hasVietnamStreetName(text) &&
        (hasVietnamAdminOrArea(text) || hasVietnamAddressLabel(text)),
    )
  })
}

function cleanAddress(value) {
  return capText(value, 260)
    .replace(/^(?:đ\/?c|d\/?c|dc|địa\s*chỉ|dia\s*chi|address)\s*[:.-]?\s*/iu, '')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isVietnamAddressLike(value) {
  const text = normalizeText(value)
  const garbage = /\b(es|lu|ra|p\s*\d{2,})\b/.test(text) || /[0-9]\.[0-9]/.test(text)
  return Boolean(
    !garbage &&
      isVietnamAddressEvidence(value, {
        requireArea: true,
        allowAddressLabel: false,
      }),
  )
}

function evidenceSupportsAddress(address, lines = []) {
  const evidenceText = normalizeText(lines.map((item) => item.text).join(' '))
  const addressText = normalizeText(address)
  if (!addressText || !evidenceText) return false

  const streetTokens = matchingVietnamStreetTokens(address)
  if (!streetTokens.some((token) => evidenceText.includes(token))) return false

  const adminTokens = matchingVietnamAdminTokens(address).filter(
    (token) => !token.endsWith('_number'),
  )
  if (
    adminTokens.length &&
    !adminTokens.some((token) => evidenceText.includes(token))
  ) {
    return false
  }

  const houseNumber = vietnamHouseNumbers(address)[0] || ''
  if (!houseNumber) return false
  const evidenceNumbers = vietnamHouseNumbers(evidenceText)
  return evidenceNumbers.some(
    (number) =>
      number === houseNumber ||
      (Math.abs(number.length - houseNumber.length) === 1 &&
        (number.endsWith(houseNumber) || houseNumber.endsWith(number))),
  )
}

function supportingEvidenceLine(address, lines = []) {
  return (
    (Array.isArray(lines) ? lines : []).find((item) =>
      evidenceSupportsAddress(address, [item]),
    )?.text || null
  )
}

function suspiciousCurrentAddress(candidateEntities = {}, lines = []) {
  const address = candidateEntities?.address
  if (!address?.value || address.source !== 'youtube_frame_ocr') return false
  const evidence = [
    ...(Array.isArray(address.evidence) ? address.evidence : []),
    ...lines.map((item) => item?.text),
  ].filter(Boolean)
  return evidence.some((value) => hasLikelyDamagedAddressPrefix(value))
}

function locationHintsFromAddress(address) {
  const text = normalizeText(address)
  const hints = []
  if (/\bquan\s*1\b|\bq\s*1\b/.test(text)) hints.push('quận 1')
  if (/\btp\s*hcm\b|\bhcm\b|\bho chi minh\b/.test(text)) hints.push('tp.hcm')
  if (/\bhai phong\b/.test(text)) hints.push('hai phong')
  if (/\bnguyen thai binh\b/.test(text)) hints.push('nguyễn thái bình')
  return [...new Set(hints)].slice(0, 6)
}

function responseText(payload) {
  if (typeof payload === 'string') return payload
  return ''
}

function parseRepairResponse(raw) {
  const text = responseText(raw)
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    const error = new Error('Gemini OCR repair response too large.')
    error.code = 'api_invalid_response'
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const error = new Error('Gemini OCR repair returned invalid JSON.')
    error.code = 'json_parse_failed'
    throw error
  }
  return {
    address:
      typeof parsed?.address === 'string' && parsed.address.trim()
        ? cleanAddress(parsed.address)
        : null,
    confidence: roundScore(parsed?.confidence),
    reason: capText(parsed?.reason, 180),
    needsVerification: parsed?.needsVerification === true,
  }
}

function promptForRepair({ lines, metadata, currentEntities }) {
  return `
Repair OCR address evidence from a YouTube food video.
Return JSON only.

OCR lines:
${JSON.stringify(lines)}

Metadata:
${JSON.stringify(metadata)}

Current raw rule candidate:
${JSON.stringify({
  placeName: currentEntities?.placeName?.value || null,
  address: currentEntities?.address?.value || null,
  addressSource: currentEntities?.address?.source || null,
  addressEvidence: Array.isArray(currentEntities?.address?.evidence)
    ? currentEntities.address.evidence.slice(0, 4)
    : [],
  locationHints: (currentEntities?.locationHints || []).map((item) => item?.value).filter(Boolean),
})}
  `.trim().slice(0, 8_000)
}

function mergeRepairedAddress(entities, repair) {
  const address = cleanAddress(repair.address)
  const existingLocations = Array.isArray(entities.locationHints)
    ? entities.locationHints
    : []
  const repairedHints = locationHintsFromAddress(address)
  const seenHints = new Set(existingLocations.map((item) => normalizeText(item?.value)))
  const locationHints = [...existingLocations]
  for (const hint of repairedHints) {
    const key = normalizeText(hint)
    if (!key || seenHints.has(key)) continue
    seenHints.add(key)
    locationHints.push({
      value: hint,
      confidence: Math.min(0.82, Math.max(0.62, repair.confidence - 0.05)),
      source: 'gemini_ocr_repair',
      evidence: [repair.evidenceLine || address],
      type: key.includes('quan') || key.startsWith('q ') ? 'district' : 'area',
    })
  }
  return {
    ...entities,
    address: {
      value: address,
      confidence: Math.min(0.88, Math.max(0.72, repair.confidence || 0.78)),
      source: 'gemini_ocr_repair',
      evidence: [repair.evidenceLine || address],
      reviewRequired: true,
      needsVerification: true,
    },
    locationHints: locationHints.slice(0, 8),
    warnings: [
      ...(Array.isArray(entities.warnings) ? entities.warnings : []),
      'gemini_ocr_address_repaired',
    ],
  }
}

function failureWarning(error) {
  const code = String(error?.code || '').toLowerCase()
  if (/timeout/.test(code)) return 'gemini_ocr_repair_timeout'
  if (/api_key/.test(code)) return 'gemini_ocr_repair_api_key_invalid'
  if (/quota/.test(code)) return 'gemini_ocr_repair_quota_exceeded'
  if (/model/.test(code)) return 'gemini_ocr_repair_model_error'
  if (/json|schema|invalid/.test(code)) return 'gemini_ocr_repair_invalid_response'
  return 'gemini_ocr_repair_failed'
}

export async function repairOcrAddressWithGemini(
  {
    normalizedEvidence = {},
    candidateEntities = {},
    config = {},
  } = {},
  {
    apiKey = process.env.GEMINI_API_KEY || '',
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs = Number(
      config.geminiOcrAddressRepairTimeoutMs ||
        process.env.GEMINI_OCR_ADDRESS_REPAIR_TIMEOUT_MS ||
        process.env.GEMINI_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS,
    ),
    invokeGemini = defaultInvokeGemini,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const lines = collectOcrLines(normalizedEvidence)
  const currentAddressSuspicious = suspiciousCurrentAddress(
    candidateEntities,
    lines,
  )
  if (config.geminiOcrAddressRepairEnabled === false) {
    return {
      applied: false,
      status: 'disabled',
      rejectedCurrentAddress: currentAddressSuspicious,
      warnings: [],
    }
  }
  if ((candidateEntities?.addressCandidates || []).length >= 2) {
    return { applied: false, status: 'multiple_addresses_present', warnings: [] }
  }

  if (candidateEntities?.address?.value && !currentAddressSuspicious) {
    return { applied: false, status: 'address_already_present', warnings: [] }
  }

  if (!hasAddressishOcrLine(lines)) {
    return {
      applied: false,
      status: 'no_addressish_ocr',
      rejectedCurrentAddress: currentAddressSuspicious,
      warnings: [],
    }
  }
  if (!String(apiKey || '').trim() || !safeModel(model)) {
    return {
      applied: false,
      status: 'missing_config',
      rejectedCurrentAddress: currentAddressSuspicious,
      warnings: ['gemini_ocr_repair_not_configured'],
    }
  }

  try {
    const boundedTimeout = Math.max(500, Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
    const raw = await invokeGemini({
      prompt: promptForRepair({
        lines,
        metadata: metadataSummary(normalizedEvidence),
        currentEntities: candidateEntities,
      }),
      systemInstruction: SYSTEM_INSTRUCTION,
      responseSchema: GEMINI_OCR_ADDRESS_REPAIR_RESPONSE_SCHEMA,
      apiKey: String(apiKey).trim(),
      model: safeModel(model),
      timeoutMs: boundedTimeout,
      fetchImpl,
    })
    const repair = parseRepairResponse(raw?.providerResult === true ? raw.text : raw)
    if (!repair.address || repair.confidence < 0.68) {
      return {
        applied: false,
        status: 'insufficient_repair',
        rejectedCurrentAddress: currentAddressSuspicious,
        warnings: [],
      }
    }
    if (!isVietnamAddressLike(repair.address)) {
      return {
        applied: false,
        status: 'unsafe_repair_shape',
        rejectedCurrentAddress: currentAddressSuspicious,
        warnings: ['gemini_ocr_repair_rejected_shape'],
      }
    }
    if (!evidenceSupportsAddress(repair.address, lines)) {
      return {
        applied: false,
        status: 'unsupported_repair',
        rejectedCurrentAddress: currentAddressSuspicious,
        warnings: ['gemini_ocr_repair_rejected_unsupported'],
      }
    }
    repair.evidenceLine = supportingEvidenceLine(repair.address, lines)
    repair.needsVerification = true

    return {
      applied: true,
      status: 'applied',
      rejectedCurrentAddress: false,
      repair,
      entities: mergeRepairedAddress(candidateEntities, repair),
      warnings: ['gemini_ocr_address_repaired'],
    }
  } catch (error) {
    return {
      applied: false,
      status: 'provider_error',
      rejectedCurrentAddress: currentAddressSuspicious,
      warnings: [failureWarning(error)],
    }
  }
}

export default repairOcrAddressWithGemini

export const __geminiOcrAddressRepairTestUtils = {
  evidenceSupportsAddress,
  hasAddressishOcrLine,
  suspiciousCurrentAddress,
}
