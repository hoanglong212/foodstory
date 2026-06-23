import OpenAI from 'openai'
import { z } from 'zod'
import {
  emptyFoodMapEntities,
  extractFoodMapEntities,
} from './foodMapEntityExtractionService.js'

const DEFAULT_TIMEOUT_MS = 7_000
const MAX_SOURCE_ITEMS = 20
const MAX_SOURCE_TEXT_LENGTH = 700
const MAX_PROMPT_CHARS = 7_000

const entitySchema = z.object({
  value: z.string().trim().min(1).max(300).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(300)).max(6),
})

const arrayEntitySchema = z.object({
  value: z.string().trim().min(1).max(180),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  type: z
    .enum(['ward', 'district', 'city', 'landmark', 'unknown'])
    .optional(),
})

const groqResponseSchema = z.object({
  placeName: entitySchema,
  address: entitySchema,
  phones: z.array(arrayEntitySchema).max(8),
  dishNames: z.array(arrayEntitySchema).max(8),
  priceHints: z.array(arrayEntitySchema).max(8),
  locationHints: z.array(arrayEntitySchema).max(8),
  warnings: z.array(z.string().max(220)).max(8).default([]),
})

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function capText(value, maximumLength = MAX_SOURCE_TEXT_LENGTH) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength).trim()}...`
}

function configuredMode(value = process.env.ENTITY_EXTRACTOR_MODE) {
  const mode = String(value || 'rule').trim().toLowerCase()
  return ['rule', 'groq', 'hybrid'].includes(mode) ? mode : 'rule'
}

function collectCleanSources({
  inputSignals = {},
  ocrEvidence = {},
  textSources = [],
} = {}) {
  const sources = []
  const add = (type, text) => {
    const cleaned = capText(text)
    const key = `${type}:${normalizeText(cleaned)}`
    if (
      !cleaned ||
      !normalizeText(cleaned) ||
      sources.some((source) => source.key === key)
    ) {
      return
    }
    sources.push({ key, type, text: cleaned })
  }

  for (const line of Array.isArray(ocrEvidence?.debug?.finalSelection?.selectedLines)
    ? ocrEvidence.debug.finalSelection.selectedLines
    : []) {
    add('ocr_selected', line?.text)
  }
  for (const line of Array.isArray(ocrEvidence?.strongLines)
    ? ocrEvidence.strongLines
    : []) {
    add('ocr_strong', line?.text)
  }
  if (!sources.some((source) => source.type.startsWith('ocr'))) {
    add('ocr_final', ocrEvidence?.text)
  }
  add('title', inputSignals.title)
  add('description', inputSignals.description)
  const hasFirstClassHint = (Array.isArray(textSources) ? textSources : [])
    .some(
      (source) =>
        source?.type === 'user_hint' &&
        normalizeText(source?.text) === normalizeText(inputSignals.hint),
    )
  if (!hasFirstClassHint) add('hint', inputSignals.hint)
  for (const source of Array.isArray(textSources) ? textSources : []) {
    if (source?.type === 'ocr' && sources.some((item) => item.type.startsWith('ocr'))) {
      continue
    }
    add(source?.type || 'text', source?.text)
  }

  return sources.slice(0, MAX_SOURCE_ITEMS)
}

function evidenceSupported(evidence, sources) {
  const normalizedEvidence = normalizeText(evidence)
  if (!normalizedEvidence) return false
  return sources.some((source) => {
    const normalizedSource = normalizeText(source.text)
    return (
      normalizedSource === normalizedEvidence ||
      normalizedSource.includes(normalizedEvidence)
    )
  })
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeText(left).split(' ').filter(Boolean))
  const rightTokens = new Set(normalizeText(right).split(' ').filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  const union = new Set([...leftTokens, ...rightTokens])
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return union.size ? shared / union.size : 0
}

function valueSupportedByEvidence(value, evidence, kind = 'text') {
  if (kind === 'phone') {
    const normalizedValue = normalizePhone(value)
    return evidence.some((item) =>
      normalizePhone(item).includes(normalizedValue),
    )
  }
  const normalizedValue = normalizeText(value)
  if (!normalizedValue) return false
  return evidence.some((item) => {
    const normalizedEvidence = normalizeText(item)
    return (
      normalizedEvidence === normalizedValue ||
      normalizedEvidence.includes(normalizedValue) ||
      normalizedValue.includes(normalizedEvidence) ||
      tokenSimilarity(normalizedValue, normalizedEvidence) >= 0.6
    )
  })
}

function supportedEvidence(items, sources) {
  return [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .filter((item) => evidenceSupported(item, sources))
        .map((item) => capText(item, 220)),
    ),
  ].slice(0, 4)
}

function validateNamedEntity(entity, sources) {
  if (!entity?.value) {
    return {
      value: null,
      confidence: 0,
      source: null,
      evidence: [],
    }
  }
  const evidence = supportedEvidence(entity.evidence, sources)
  if (
    !evidence.length ||
    !valueSupportedByEvidence(entity.value, evidence)
  ) {
    return null
  }
  return {
    value: capText(entity.value, 300),
    confidence: roundScore(entity.confidence),
    source: 'mixed',
    evidence,
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function validateArrayEntities(items, sources, kind) {
  const values = []
  const seen = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const evidence = supportedEvidence(item?.evidence, sources)
    if (!evidence.length) continue
    const value = capText(item?.value, 180)
    if (!valueSupportedByEvidence(value, evidence, kind)) continue
    const normalized =
      kind === 'phone' ? normalizePhone(value) : normalizeText(value)
    if (!value || !normalized || seen.has(normalized)) continue
    if (
      kind === 'phone' &&
      !/^0[35789]\d{8}$/.test(normalized) &&
      !/^02\d{8,9}$/.test(normalized)
    ) {
      continue
    }
    seen.add(normalized)
    values.push({
      value,
      ...(kind === 'phone' ? { normalized } : {}),
      ...(kind === 'location'
        ? {
            type: [
              'ward',
              'district',
              'city',
              'landmark',
              'unknown',
            ].includes(item?.type)
              ? item.type
              : 'unknown',
          }
        : {}),
      confidence: roundScore(item.confidence),
      source: 'mixed',
      evidence: evidence[0],
    })
  }
  return values.slice(0, 8)
}

function validateGroqEntities(payload, sources) {
  const placeName = validateNamedEntity(payload.placeName, sources)
  const address = validateNamedEntity(payload.address, sources)
  const warnings = [...payload.warnings]
  if (payload.placeName?.value && !placeName) {
    warnings.push('Rejected a place name without matching source evidence.')
  }
  if (payload.address?.value && !address) {
    warnings.push('Rejected an address without matching source evidence.')
  }

  return {
    placeName:
      placeName || {
        value: null,
        confidence: 0,
        source: null,
        evidence: [],
      },
    address:
      address || {
        value: null,
        confidence: 0,
        source: null,
        evidence: [],
      },
    phones: validateArrayEntities(payload.phones, sources, 'phone'),
    dishNames: validateArrayEntities(payload.dishNames, sources, 'dish'),
    priceHints: validateArrayEntities(payload.priceHints, sources, 'price'),
    locationHints: validateArrayEntities(
      payload.locationHints,
      sources,
      'location',
    ),
    warnings: [...new Set(warnings)].slice(0, 8),
  }
}

function promptForSources(sources) {
  const sourceText = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.type}: ${source.text}`,
    )
    .join('\n')
  return `
Extract Vietnamese food-place entities from the evidence below.
Return JSON only.
Do not guess or invent missing names, addresses, phones, dishes, prices, or locations.
Every non-null entity must quote one or more evidence strings copied from the input.
Preserve uncertainty. Use null when unsure.
You may correct an obvious OCR variant only when the quoted evidence supports that correction.

Required JSON shape:
{
  "placeName": {"value": string|null, "confidence": number, "evidence": string[]},
  "address": {"value": string|null, "confidence": number, "evidence": string[]},
  "phones": [{"value": string, "confidence": number, "evidence": string[]}],
  "dishNames": [{"value": string, "confidence": number, "evidence": string[]}],
  "priceHints": [{"value": string, "confidence": number, "evidence": string[]}],
  "locationHints": [{"value": string, "type": "ward"|"district"|"city"|"landmark"|"unknown", "confidence": number, "evidence": string[]}],
  "warnings": string[]
}

Evidence:
${sourceText}
  `.trim().slice(0, MAX_PROMPT_CHARS)
}

async function defaultInvokeGroq({ prompt, timeoutMs }) {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error('GROQ_API_KEY is not configured.')
    error.code = 'missing_api_key'
    throw error
  }
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: timeoutMs,
  })
  const response = await client.chat.completions.create({
    model: process.env.GROQ_ENTITY_MODEL || 'llama-3.1-8b-instant',
    temperature: 0,
    max_tokens: 900,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a conservative evidence-backed entity extractor. Output JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  })
  return response?.choices?.[0]?.message?.content || ''
}

export async function extractGroqFoodMapEntities(
  input = {},
  {
    invokeGroq = defaultInvokeGroq,
    timeoutMs = Number(
      process.env.ENTITY_EXTRACTOR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
  } = {},
) {
  const sources = collectCleanSources(input)
  if (!sources.length) {
    return {
      ok: false,
      reason: 'no_clean_evidence',
      entities: emptyFoodMapEntities(),
    }
  }

  try {
    const raw = await invokeGroq({
      prompt: promptForSources(sources),
      timeoutMs,
      sources,
    })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const result = groqResponseSchema.safeParse(parsed)
    if (!result.success) {
      return {
        ok: false,
        reason: 'invalid_schema',
        entities: emptyFoodMapEntities(),
      }
    }
    return {
      ok: true,
      reason: 'success',
      entities: validateGroqEntities(result.data, sources),
      sourceCount: sources.length,
    }
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.code === 'missing_api_key'
          ? 'missing_api_key'
          : error instanceof SyntaxError
            ? 'invalid_json'
            : error?.name === 'AbortError'
              ? 'timeout'
              : 'provider_error',
      entities: emptyFoodMapEntities(),
    }
  }
}

function normalizedEntityValue(item) {
  return normalizeText(item?.normalized || item?.value)
}

function mergeArrays(ruleItems = [], groqItems = []) {
  const merged = [...ruleItems]
  for (const item of groqItems) {
    const key = normalizedEntityValue(item)
    const index = merged.findIndex(
      (existing) => normalizedEntityValue(existing) === key,
    )
    if (index === -1) {
      merged.push(item)
    } else if (
      Number(item?.confidence || 0) >
      Number(merged[index]?.confidence || 0)
    ) {
      merged[index] = {
        ...item,
        source: merged[index]?.source || item.source,
      }
    }
  }
  return merged.slice(0, 8)
}

function mergeNamedEntity(ruleEntity, groqEntity, strongThreshold) {
  if (
    ruleEntity?.value &&
    Number(ruleEntity?.confidence || 0) >= strongThreshold
  ) {
    return ruleEntity
  }
  if (
    groqEntity?.value &&
    Number(groqEntity?.confidence || 0) >
      Number(ruleEntity?.confidence || 0)
  ) {
    return groqEntity
  }
  return ruleEntity
}

function finalStatus(entities) {
  if (entities.address?.value && entities.address.confidence >= 0.62) {
    return 'address_found'
  }
  if (entities.placeName?.value && entities.placeName.confidence >= 0.5) {
    return 'place_name_found'
  }
  if (entities.dishNames.length) return 'dish_only'
  return 'unclear'
}

function finalConfidence(entities, status) {
  if (status === 'address_found') return entities.address.confidence
  if (status === 'place_name_found') return entities.placeName.confidence
  if (status === 'dish_only') {
    return Math.max(
      0,
      ...entities.dishNames.map((item) => Number(item.confidence || 0)),
    )
  }
  return 0
}

export async function extractFoodMapEntitiesHybrid(
  input = {},
  {
    mode = configuredMode(),
    ruleExtractor = extractFoodMapEntities,
    groqOptions = {},
  } = {},
) {
  const selectedMode = configuredMode(mode)
  const rule = ruleExtractor(input)
  if (selectedMode === 'rule') {
    return {
      ...rule,
      extractorUsed: 'rule',
      mergeDebug: {
        mode: selectedMode,
        groqStatus: 'not_requested',
      },
    }
  }

  const groq = await extractGroqFoodMapEntities(input, groqOptions)
  if (!groq.ok) {
    return {
      ...rule,
      warnings: [
        ...(rule.warnings || []),
        `Groq extraction fallback: ${groq.reason}.`,
      ],
      extractorUsed: 'rule_fallback',
      mergeDebug: {
        mode: selectedMode,
        groqStatus: groq.reason,
      },
    }
  }

  const base =
    selectedMode === 'groq'
      ? emptyFoodMapEntities()
      : rule
  const merged = {
    address: mergeNamedEntity(base.address, groq.entities.address, 0.76),
    placeName: mergeNamedEntity(
      base.placeName,
      groq.entities.placeName,
      0.72,
    ),
    phones: mergeArrays(base.phones, groq.entities.phones),
    dishNames: mergeArrays(base.dishNames, groq.entities.dishNames),
    priceHints: mergeArrays(base.priceHints, groq.entities.priceHints),
    locationHints: mergeArrays(
      base.locationHints,
      groq.entities.locationHints,
    ),
    warnings: [
      ...(base.warnings || []),
      ...(groq.entities.warnings || []),
    ],
  }
  const status = finalStatus(merged)
  return {
    ...merged,
    status,
    confidence: roundScore(finalConfidence(merged, status)),
    extractorUsed: selectedMode === 'groq' ? 'groq' : 'hybrid',
    mergeDebug: {
      mode: selectedMode,
      groqStatus: groq.reason,
      groqSourceCount: groq.sourceCount || 0,
      ruleStatus: rule.status,
    },
  }
}

export {
  collectCleanSources,
  configuredMode as configuredEntityExtractorMode,
  groqResponseSchema,
}
