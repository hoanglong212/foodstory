import { z } from 'zod'

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_PROMPT_CHARS = 10_000
const MAX_RESPONSE_BYTES = 120_000
const MAX_TEXT_SOURCES = 20
const MAX_ARRAY_ITEMS = 8

const validatorStatusSchema = z.enum([
  'validated',
  'corrected',
  'insufficient_evidence',
  'rejected',
])

const correctedEntitiesSchema = z.object({
  placeName: z.string().trim().min(1).max(180).nullable(),
  address: z.string().trim().min(1).max(260).nullable(),
  phones: z.array(z.string().trim().min(1).max(40)).max(MAX_ARRAY_ITEMS),
  dishNames: z.array(z.string().trim().min(1).max(100)).max(MAX_ARRAY_ITEMS),
  locationHints: z
    .array(z.string().trim().min(1).max(100))
    .max(MAX_ARRAY_ITEMS),
})

const rejectedEntitySchema = z.object({
  field: z.enum([
    'placeName',
    'address',
    'phones',
    'dishNames',
    'locationHints',
  ]),
  value: z.string().trim().min(1).max(260),
  reason: z.string().trim().min(1).max(240),
})

export const geminiEvidenceValidationResponseSchema = z.object({
  status: validatorStatusSchema,
  confidence: z.number().min(0).max(1),
  correctedEntities: correctedEntitiesSchema,
  rejectedEntities: z.array(rejectedEntitySchema).max(12),
  canResolveLocation: z.boolean(),
  recommendedNextAction: z.enum(['ask_for_hint', 'none']),
  warnings: z.array(z.string().trim().min(1).max(220)).max(8),
})

const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: [
        'validated',
        'corrected',
        'insufficient_evidence',
        'rejected',
      ],
    },
    confidence: { type: 'number' },
    correctedEntities: {
      type: 'object',
      properties: {
        placeName: { type: 'string', nullable: true },
        address: { type: 'string', nullable: true },
        phones: { type: 'array', items: { type: 'string' } },
        dishNames: { type: 'array', items: { type: 'string' } },
        locationHints: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [
        'placeName',
        'address',
        'phones',
        'dishNames',
        'locationHints',
      ],
    },
    rejectedEntities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [
              'placeName',
              'address',
              'phones',
              'dishNames',
              'locationHints',
            ],
          },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['field', 'value', 'reason'],
      },
    },
    canResolveLocation: { type: 'boolean' },
    recommendedNextAction: {
      type: 'string',
      enum: ['ask_for_hint', 'none'],
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'status',
    'confidence',
    'correctedEntities',
    'rejectedEntities',
    'canResolveLocation',
    'recommendedNextAction',
    'warnings',
  ],
}

const GEMINI_LEGACY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: [
        'validated',
        'corrected',
        'insufficient_evidence',
        'rejected',
      ],
    },
    confidence: { type: 'number' },
    correctedEntities: {
      type: 'object',
      properties: {
        placeName: { type: 'string', nullable: true },
        address: { type: 'string', nullable: true },
        phones: { type: 'array', items: { type: 'string' } },
        dishNames: { type: 'array', items: { type: 'string' } },
        locationHints: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [
        'placeName',
        'address',
        'phones',
        'dishNames',
        'locationHints',
      ],
    },
    rejectedEntities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: [
              'placeName',
              'address',
              'phones',
              'dishNames',
              'locationHints',
            ],
          },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['field', 'value', 'reason'],
      },
    },
    canResolveLocation: { type: 'boolean' },
    recommendedNextAction: {
      type: 'string',
      enum: ['ask_for_hint', 'none'],
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'status',
    'confidence',
    'correctedEntities',
    'rejectedEntities',
    'canResolveLocation',
    'recommendedNextAction',
    'warnings',
  ],
}

const SYSTEM_INSTRUCTION = `
You validate food-place extraction evidence.
Use only the evidence supplied in the request. Do not browse, search, guess, or use world knowledge to identify a restaurant.
Do not invent restaurant names, addresses, phones, dishes, districts, cities, or landmarks.
Return strict JSON matching the required schema.

Validation rules:
- Descriptive social titles are not place names when they match one or more of these categories:
  - cadence_count_phrase: a number or number word is paired with a time, frequency, quantity, serving, food, venue, or ranking unit.
  - first_person_review_language: the title uses review, personal-experience, visit, recommendation, reaction, or first-person language.
  - social_content_metadata: the title contains hashtags, channel or publishing labels, episode or series labels, livestream labels, or other platform metadata.
  - no_distinctive_proper_noun: after removing generic food or venue terms, numbers, administrative locations, descriptive markers, and grammatical particles, no distinctive business-name component remains.
- Reject a title-derived placeName when these categories indicate descriptive content without a distinctive proper noun. Use the matching category names in concise rejection reasons when relevant.
- A food phrase plus a district is not a place name.
- "Quán" means shop or restaurant. It must never be normalized into "Quận", which means district.
- A placeName needs a distinctive business or name component.
- Generic food or venue labels, descriptive modifiers, counts, rankings, and social metadata are not sufficient without a distinctive proper noun.
- Channel identity and vague social-content metadata do not establish an exact location.
- Corrections must be small and copied from explicit evidence. You may remove unsupported words or split an evidenced place and district, but may not add new information.
- If reliable place or address evidence is absent, return insufficient_evidence, canResolveLocation false, and recommendedNextAction ask_for_hint.
`.trim()

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function clampScore(value) {
  return roundScore(Math.max(0, Math.min(1, Number(value) || 0)))
}

function capText(value, maximumLength = 500) {
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
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function boundedWarnings(values, maximumItems = 8) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => capText(value, 180))
        .filter(Boolean),
    ),
  ].slice(0, maximumItems)
}

function configuredMode(value = process.env.FOOD_MAP_EVIDENCE_VALIDATOR) {
  const mode = String(value || 'rule').trim().toLowerCase()
  return ['rule', 'gemini', 'hybrid'].includes(mode) ? mode : 'rule'
}

function entitySummary(entity = null) {
  return {
    value: entity?.value ? capText(entity.value, 260) : null,
    confidence: clampScore(entity?.confidence),
    source: entity?.source ? capText(entity.source, 40) : null,
    evidence: (Array.isArray(entity?.evidence)
      ? entity.evidence
      : entity?.evidence
        ? [entity.evidence]
        : []
    )
      .map((item) => capText(item, 260))
      .filter(Boolean)
      .slice(0, 4),
  }
}

function arrayEntitySummary(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      value: item?.value ? capText(item.value, 180) : null,
      ...(item?.normalized
        ? { normalized: capText(item.normalized, 40) }
        : {}),
      ...(item?.type ? { type: capText(item.type, 30) } : {}),
      confidence: clampScore(item?.confidence),
      source: item?.source ? capText(item.source, 40) : null,
      evidence: capText(
        Array.isArray(item?.evidence)
          ? item.evidence[0]
          : item?.evidence,
        260,
      ),
    }))
    .filter((item) => item.value)
    .slice(0, MAX_ARRAY_ITEMS)
}

export function buildGeminiEvidenceSummary(input = {}) {
  const urlEvidence = input.urlEvidence || {}
  const ocrEvidence = input.ocrEvidence || {}
  const ruleEntities = input.ruleEntities || {}
  const draftLocationQuery = input.draftLocationQuery || {}
  return {
    inputType: capText(input.inputType || 'unknown', 60),
    platform: capText(input.platform || 'unknown', 40),
    urlEvidence: {
      title: urlEvidence.title ? capText(urlEvidence.title, 500) : null,
      description: urlEvidence.description
        ? capText(urlEvidence.description, 700)
        : null,
      channelTitle: urlEvidence.channelTitle
        ? capText(urlEvidence.channelTitle, 300)
        : null,
      videoId: urlEvidence.videoId ? capText(urlEvidence.videoId, 32) : null,
      warnings: boundedWarnings(urlEvidence.warnings, 12),
    },
    textSources: (Array.isArray(input.textSources) ? input.textSources : [])
      .map((source) => ({
        type: capText(source?.type || 'unknown', 40),
        text: capText(source?.text, 500),
        confidence: clampScore(source?.confidence),
        source: capText(source?.source || 'unknown', 120),
      }))
      .filter((source) => source.text)
      .slice(0, MAX_TEXT_SOURCES),
    ocrEvidence: {
      text: ocrEvidence.text ? capText(ocrEvidence.text, 700) : null,
      usable:
        ocrEvidence.usable === true || ocrEvidence.ocrUsable === true,
      confidence: clampScore(ocrEvidence.confidence),
      reason: capText(ocrEvidence.reason || 'not_provided', 80),
    },
    ruleEntities: {
      placeName: entitySummary(ruleEntities.placeName),
      address: entitySummary(ruleEntities.address),
      phones: arrayEntitySummary(ruleEntities.phones),
      dishNames: arrayEntitySummary(ruleEntities.dishNames),
      locationHints: arrayEntitySummary(ruleEntities.locationHints),
    },
    draftLocationQuery: {
      query: draftLocationQuery.query
        ? capText(draftLocationQuery.query, 320)
        : null,
      score: Math.max(0, Math.round(Number(draftLocationQuery.score) || 0)),
      canResolveLocation:
        draftLocationQuery.canResolveLocation === true,
      reason: capText(
        draftLocationQuery.reason || 'insufficient_evidence',
        120,
      ),
      strategy: capText(
        draftLocationQuery.strategy || 'insufficient_evidence',
        80,
      ),
    },
  }
}

function allEvidenceText(summary) {
  return [
    summary.urlEvidence.title,
    summary.urlEvidence.description,
    summary.urlEvidence.channelTitle,
    summary.ocrEvidence.text,
    ...summary.textSources.map((source) => source.text),
    summary.ruleEntities.placeName.value,
    ...summary.ruleEntities.placeName.evidence,
    summary.ruleEntities.address.value,
    ...summary.ruleEntities.address.evidence,
    ...summary.ruleEntities.phones.flatMap((item) => [
      item.value,
      item.evidence,
    ]),
    ...summary.ruleEntities.dishNames.flatMap((item) => [
      item.value,
      item.evidence,
    ]),
    ...summary.ruleEntities.locationHints.flatMap((item) => [
      item.value,
      item.evidence,
    ]),
  ].filter(Boolean)
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

function supportedByEvidence(value, evidence, kind = 'text') {
  if (kind === 'phone') {
    const normalized = normalizePhone(value)
    return Boolean(
      normalized &&
        evidence.some((item) =>
          normalizePhone(item).includes(normalized),
        ),
    )
  }
  const normalized = normalizeText(value)
  return Boolean(
    normalized &&
      evidence.some((item) => normalizeText(item).includes(normalized)),
  )
}

function relatedToRuleCandidate(value, candidates, kind = 'text') {
  const normalized =
    kind === 'phone' ? normalizePhone(value) : normalizeText(value)
  if (!normalized) return null
  let best = null
  let bestScore = 0
  for (const candidate of candidates) {
    const candidateValue = candidate?.normalized || candidate?.value
    const candidateNormalized =
      kind === 'phone'
        ? normalizePhone(candidateValue)
        : normalizeText(candidateValue)
    if (!candidateNormalized) continue
    const exact =
      normalized === candidateNormalized ||
      normalized.includes(candidateNormalized) ||
      candidateNormalized.includes(normalized)
    const similarity =
      kind === 'phone'
        ? Number(exact)
        : exact
          ? 1
          : tokenSimilarity(normalized, candidateNormalized)
    if (similarity > bestScore) {
      best = candidate
      bestScore = similarity
    }
  }
  return bestScore >= 0.5 ? best : null
}

function emptyNamedEntity() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function evidenceForValue(value, original, evidence) {
  const originalEvidence = Array.isArray(original?.evidence)
    ? original.evidence
    : original?.evidence
      ? [original.evidence]
      : []
  return [
    ...new Set(
      [...originalEvidence, ...evidence]
        .filter((item) =>
          normalizeText(item).includes(normalizeText(value)),
        )
        .map((item) => capText(item, 220)),
    ),
  ].slice(0, 4)
}

function correctedNamedEntity(value, original, evidence, confidence) {
  if (!value) return emptyNamedEntity()
  if (
    !original?.value ||
    !supportedByEvidence(value, evidence) ||
    !relatedToRuleCandidate(value, [original])
  ) {
    return emptyNamedEntity()
  }
  return {
    value: capText(value, 260),
    confidence: clampScore(
      Math.min(Number(original.confidence || 0), confidence || 0),
    ),
    source: original.source || 'mixed',
    evidence: evidenceForValue(value, original, evidence),
  }
}

function rejectedValueSet(validation, field, kind = 'text') {
  return new Set(
    (Array.isArray(validation?.result?.rejectedEntities)
      ? validation.result.rejectedEntities
      : []
    )
      .filter((item) => item?.field === field)
      .map((item) =>
        kind === 'phone'
          ? normalizePhone(item?.value)
          : normalizeText(item?.value),
      )
      .filter(Boolean),
  )
}

function valueWasRejected(value, rejectedValues, kind = 'text') {
  const normalized =
    kind === 'phone' ? normalizePhone(value) : normalizeText(value)
  if (!normalized) return false
  for (const rejected of rejectedValues) {
    if (
      normalized === rejected ||
      normalized.includes(rejected) ||
      rejected.includes(normalized)
    ) {
      return true
    }
  }
  return false
}

function correctedArray(
  values,
  originals,
  evidence,
  confidence,
  kind,
  rejectedValues = new Set(),
) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    if (valueWasRejected(value, rejectedValues, kind)) continue
    if (!supportedByEvidence(value, evidence, kind)) continue
    const original = relatedToRuleCandidate(value, originals, kind)
    if (!original) continue
    const key =
      kind === 'phone' ? normalizePhone(value) : normalizeText(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({
      value: capText(value, kind === 'phone' ? 40 : 180),
      ...(kind === 'phone'
        ? { normalized: normalizePhone(value) }
        : {}),
      ...(kind === 'location'
        ? { type: original.type || 'unknown' }
        : {}),
      confidence: clampScore(
        Math.min(Number(original.confidence || 0), confidence || 0),
      ),
      source: original.source || 'mixed',
      evidence:
        evidenceForValue(value, original, evidence)[0] ||
        capText(original.evidence, 220),
    })
    if (result.length >= MAX_ARRAY_ITEMS) break
  }
  return result
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

export function applyGeminiEvidenceValidation(
  ruleEntities,
  validation,
  summary,
) {
  if (!validation?.applied || !validation?.result) return ruleEntities
  const evidence = allEvidenceText(summary)
  const corrected = validation.result.correctedEntities
  const confidence = validation.result.confidence
  const rejectedPlaceNames = rejectedValueSet(
    validation,
    'placeName',
  )
  const rejectedAddresses = rejectedValueSet(validation, 'address')
  const rejectedPhones = rejectedValueSet(
    validation,
    'phones',
    'phone',
  )
  const rejectedDishes = rejectedValueSet(validation, 'dishNames')
  const rejectedLocations = rejectedValueSet(
    validation,
    'locationHints',
  )
  const entities = {
    placeName: valueWasRejected(
      corrected.placeName,
      rejectedPlaceNames,
    )
      ? emptyNamedEntity()
      : correctedNamedEntity(
          corrected.placeName,
          ruleEntities.placeName,
          evidence,
          confidence,
        ),
    address: valueWasRejected(corrected.address, rejectedAddresses)
      ? emptyNamedEntity()
      : correctedNamedEntity(
          corrected.address,
          ruleEntities.address,
          evidence,
          confidence,
        ),
    phones: correctedArray(
      corrected.phones,
      ruleEntities.phones,
      evidence,
      confidence,
      'phone',
      rejectedPhones,
    ),
    dishNames: correctedArray(
      corrected.dishNames,
      ruleEntities.dishNames,
      evidence,
      confidence,
      'dish',
      rejectedDishes,
    ),
    locationHints: correctedArray(
      corrected.locationHints,
      ruleEntities.locationHints,
      evidence,
      confidence,
      'location',
      rejectedLocations,
    ),
    priceHints: Array.isArray(ruleEntities.priceHints)
      ? ruleEntities.priceHints
      : [],
    warnings: [
      ...(Array.isArray(ruleEntities.warnings)
        ? ruleEntities.warnings
        : []),
      ...boundedWarnings(validation.result.warnings),
    ],
    extractorUsed: ruleEntities.extractorUsed || 'rule',
    mergeDebug: ruleEntities.mergeDebug || {},
  }
  const status = finalStatus(entities)
  return {
    ...entities,
    status,
    confidence: clampScore(finalConfidence(entities, status)),
  }
}

function metadataSourceSupportsEntity(entity, textSources) {
  const evidence = Array.isArray(entity?.evidence)
    ? entity.evidence
    : entity?.evidence
      ? [entity.evidence]
      : []
  const metadataSources = (Array.isArray(textSources) ? textSources : [])
    .filter((source) =>
      [
        'title',
        'description',
        'og_title',
        'og_description',
        'youtube_title',
        'youtube_description',
        'youtube_channel',
      ].includes(source?.type),
    )
    .map((source) => source.text)
  return evidence.some((item) =>
    metadataSources.some((source) =>
      normalizeText(source).includes(normalizeText(item)),
    ),
  )
}

const RISKY_SOCIAL_SOURCE_TYPES = new Set([
  'title',
  'description',
  'og_title',
  'og_description',
  'twitter_title',
  'twitter_description',
  'youtube_title',
  'youtube_description',
  'youtube_channel',
  'thumbnail_ocr',
])

const GENERIC_PLACE_TOKENS = new Set([
  'quan',
  'tiem',
  'nha',
  'hang',
  'review',
  'top',
  'ngon',
  'an',
  'gi',
  'moi',
  'ngay',
  'mon',
  'official',
  'short',
  'shorts',
  'video',
  'clip',
  'nhu',
  'the',
  'nay',
  'khong',
  'can',
  'suy',
  'nghi',
])

function entityEvidenceValues(entity = null) {
  return [
    entity?.value,
    ...(Array.isArray(entity?.evidence)
      ? entity.evidence
      : entity?.evidence
        ? [entity.evidence]
        : []),
  ]
    .map((item) => capText(item, 500))
    .filter(Boolean)
}

function sourceSupportsEntity(source, entity) {
  const sourceText = normalizeText(source?.text)
  if (!sourceText) return false
  return entityEvidenceValues(entity).some((value) => {
    const normalizedValue = normalizeText(value)
    return Boolean(
      normalizedValue &&
        (
          sourceText.includes(normalizedValue) ||
          normalizedValue.includes(sourceText)
        ),
    )
  })
}

function supportingSources(entity, textSources, predicate) {
  return (Array.isArray(textSources) ? textSources : []).filter(
    (source) => predicate(source) && sourceSupportsEntity(source, entity),
  )
}

function strongSourcesForEntity(entity, textSources) {
  return supportingSources(
    entity,
    textSources,
    (source) =>
      source?.type === 'user_hint' ||
      (
        source?.type === 'ocr' &&
        source?.source === 'uploaded_image' &&
        source?.usable !== false
      ),
  )
}

function riskySourcesForEntity(entity, textSources) {
  return supportingSources(
    entity,
    textSources,
    (source) => RISKY_SOCIAL_SOURCE_TYPES.has(source?.type),
  )
}

function dishTokens(entities = {}) {
  return new Set(
    (Array.isArray(entities.dishNames) ? entities.dishNames : [])
      .flatMap((item) => normalizeText(item?.value).split(' '))
      .filter(Boolean),
  )
}

function hasDistinctivePlaceComponent(value, entities = {}) {
  const knownDishTokens = dishTokens(entities)
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .some(
      (token) =>
        /[a-z]/.test(token) &&
        token.length >= 2 &&
        !GENERIC_PLACE_TOKENS.has(token) &&
        !knownDishTokens.has(token),
    )
}

function explicitDistrictSupport(value, sources) {
  const match = normalizeText(value).match(/^quan\s+(\d{1,2})$/)
  if (!match) return true
  const number = match[1]
  return sources.some((source) => {
    const text = String(source?.text || '').toLocaleLowerCase('vi')
    return (
      new RegExp(`\\bquận\\s*\\.?\\s*${number}\\b`, 'iu').test(text) ||
      new RegExp(`\\bq\\s*\\.?\\s*${number}\\b`, 'iu').test(text) ||
      new RegExp(`\\bdistrict\\s+${number}\\b`, 'iu').test(text)
    )
  })
}

function ambiguousShopNumberSupport(value, sources) {
  const match = normalizeText(value).match(/^quan\s+(\d{1,2})$/)
  if (!match) return false
  const number = match[1]
  const hasShopNumber = sources.some((source) =>
    new RegExp(`\\bquán\\s+${number}\\b`, 'iu').test(
      String(source?.text || '').toLocaleLowerCase('vi'),
    ),
  )
  return hasShopNumber && !explicitDistrictSupport(value, sources)
}

function cloneNamedEntity(entity = null) {
  return entity?.value
    ? {
        ...entity,
        evidence: Array.isArray(entity.evidence)
          ? [...entity.evidence]
          : entity.evidence
            ? [entity.evidence]
            : [],
      }
    : emptyNamedEntity()
}

function clearAddressIsStrong(entities, textSources) {
  return Boolean(
    entities?.address?.value &&
      Number(entities.address.confidence || 0) >= 0.62 &&
      (
        strongSourcesForEntity(entities.address, textSources).length > 0 ||
        !metadataSourceSupportsEntity(entities.address, textSources)
      ),
  )
}

function strongPhoneExists(entities, textSources) {
  return (Array.isArray(entities?.phones) ? entities.phones : []).some(
    (phone) =>
      Number(phone?.confidence || 0) >= 0.72 &&
      (
        strongSourcesForEntity(phone, textSources).length > 0 ||
        !metadataSourceSupportsEntity(phone, textSources)
      ),
  )
}

function applyRiskySocialFailClosed(input = {}) {
  const entities = input.ruleEntities || {}
  const textSources = Array.isArray(input.textSources)
    ? input.textSources
    : []
  const addressIsStrong = clearAddressIsStrong(entities, textSources)
  const phoneIsStrong = strongPhoneExists(entities, textSources)
  const place = cloneNamedEntity(entities.placeName)
  const riskyPlaceSources = riskySourcesForEntity(place, textSources)
  const placeHasStrongSupport =
    strongSourcesForEntity(place, textSources).length > 0
  const placeIsDistinctive = hasDistinctivePlaceComponent(
    place.value,
    entities,
  )
  const suppressPlace = Boolean(
    place.value &&
      riskyPlaceSources.length &&
      !placeHasStrongSupport &&
      !addressIsStrong &&
      !phoneIsStrong &&
      (
        !placeIsDistinctive ||
        Number(place.confidence || 0) < 0.68 ||
        riskyPlaceSources.every(
          (source) => source?.type === 'thumbnail_ocr',
        )
      ),
  )

  const locationHints = (Array.isArray(entities.locationHints)
    ? entities.locationHints
    : []
  ).filter((location) => {
    const riskySources = riskySourcesForEntity(location, textSources)
    if (!riskySources.length) return true
    if (strongSourcesForEntity(location, textSources).length) return true
    if (addressIsStrong || phoneIsStrong) return true
    if (ambiguousShopNumberSupport(location.value, riskySources)) {
      return false
    }
    if (
      suppressPlace &&
      !explicitDistrictSupport(location.value, riskySources)
    ) {
      return false
    }
    return Number(location?.confidence || 0) >= 0.62
  })

  const removedLocationCount =
    (Array.isArray(entities.locationHints)
      ? entities.locationHints.length
      : 0) - locationHints.length
  const suppressed = suppressPlace || removedLocationCount > 0
  const finalEntities = {
    ...entities,
    placeName: suppressPlace ? emptyNamedEntity() : place,
    address: cloneNamedEntity(entities.address),
    phones: Array.isArray(entities.phones) ? [...entities.phones] : [],
    dishNames: Array.isArray(entities.dishNames)
      ? [...entities.dishNames]
      : [],
    priceHints: Array.isArray(entities.priceHints)
      ? [...entities.priceHints]
      : [],
    locationHints,
    warnings: [
      ...(Array.isArray(entities.warnings) ? entities.warnings : []),
      ...(suppressed ? ['evidence_validation_failed_closed'] : []),
    ],
  }
  const status = finalStatus(finalEntities)
  return {
    entities: {
      ...finalEntities,
      status,
      confidence: clampScore(finalConfidence(finalEntities, status)),
    },
    suppressed,
  }
}

export function shouldRunGeminiEvidenceValidation(input = {}) {
  const type = String(input.inputType || '')
  const socialInput = [
    'youtube_url',
    'generic_social_url',
    'mixed',
  ].includes(type)
  if (!socialInput) return false
  const entities = input.ruleEntities || {}
  const query = input.draftLocationQuery || {}
  if (
    entities.address?.value &&
    Number(entities.address?.confidence || 0) >= 0.62
  ) {
    return false
  }
  const placeName = entities.placeName?.value
  const metadataPlace = Boolean(
    placeName &&
      metadataSourceSupportsEntity(
        entities.placeName,
        input.textSources,
      ),
  )
  const metadataLocation = (Array.isArray(entities.locationHints)
    ? entities.locationHints
    : []
  ).some((location) =>
    metadataSourceSupportsEntity(location, input.textSources),
  )
  const borderlineQuery =
    query.canResolveLocation === true &&
    Number(query.score || 0) >= 10 &&
    Number(query.score || 0) <= 12
  const noisyOcr =
    input.ocrEvidence?.usable === true &&
    Number(input.ocrEvidence?.confidence || 0) < 0.55
  const warnings = new Set(
    (Array.isArray(input.urlEvidence?.warnings)
      ? input.urlEvidence.warnings
      : []
    ).map((warning) => String(warning || '').trim()),
  )
  const weakMetadata =
    warnings.has('weak_url_metadata') ||
    warnings.has('generic_social_metadata_limited') ||
    warnings.has('metadata_blocked_or_empty')
  const hasRiskyCandidate =
    Boolean(placeName) || metadataLocation || query.canResolveLocation === true
  return Boolean(
    hasRiskyCandidate &&
      (
        metadataPlace ||
        metadataLocation ||
        borderlineQuery ||
        noisyOcr ||
        weakMetadata
      ),
  )
}

function promptForSummary(summary) {
  return `
Validate the bounded extraction summary below.
Return exactly one complete JSON object matching the required schema.
Do not wrap the JSON in markdown fences. Do not add prose before or after the JSON.
Treat correctedEntities as the complete final set of validated rule entities.
Only retain or slightly correct values that are explicitly present in the evidence and related to an existing rule entity.
List each rejected value with a concise evidence-based reason.

Evidence summary:
${JSON.stringify(summary)}
  `.trim().slice(0, MAX_PROMPT_CHARS)
}

function safeModel(value) {
  const model = String(value || '').trim()
  return /^[A-Za-z0-9._-]{1,100}$/.test(model) ? model : ''
}

function geminiMaxOutputTokens() {
  const configured = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096)
  const value = Number.isFinite(configured) ? configured : 4096
  return Math.max(512, Math.min(8192, Math.round(value)))
}

function parseGeminiJsonText(value) {
  if (typeof value !== 'string') return value
  const raw = value.trim()
  if (!raw) {
    const error = new Error('Gemini returned an empty JSON response.')
    error.code = 'json_parse_failed'
    throw error
  }

  const candidates = []
  candidates.push(raw)

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

async function readBoundedResponse(response) {
  const text = await response.text()
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    const error = new Error('Gemini response exceeded the size limit.')
    error.code = 'api_invalid_response'
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Gemini returned invalid JSON.')
    error.code = 'api_invalid_response'
    throw error
  }
}

function responseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function providerErrorText(payload) {
  return [
    payload?.error?.status,
    payload?.error?.message,
    ...(Array.isArray(payload?.error?.details)
      ? payload.error.details.map((item) => JSON.stringify(item))
      : []),
  ]
    .join(' ')
    .slice(0, 8_000)
    .toLowerCase()
}

function providerFailure(response, payload) {
  const status = Number(response?.status || payload?.error?.code || 0)
  const providerText = providerErrorText(payload)
  let code = 'api_invalid_response'
  if (
    status === 401 ||
    /api[_ ]?key[_ ]?invalid|api key not valid|invalid api key/.test(
      providerText,
    )
  ) {
    code = 'api_key_invalid'
  } else if (
    status === 404 ||
    /model.+not found|not found.+model/.test(providerText)
  ) {
    code = 'model_not_found'
  } else if (
    status === 429 ||
    /resource_exhausted|quota.+exceed|rate limit/.test(providerText)
  ) {
    code = 'quota_exceeded'
  } else if (status === 403) {
    code = 'api_forbidden'
  } else if (status >= 500) {
    code = 'api_fetch_failed'
  }
  const error = new Error('Gemini provider request failed.')
  error.code = code
  error.status = status || null
  error.structuredOutputCompatibilityFailure = Boolean(
    status === 400 &&
      /response.?format/.test(providerText) &&
      /mime.?type/.test(providerText),
  )
  return error
}

function requestBody({
  prompt,
  systemInstruction,
  responseSchema,
  legacyStructuredOutput = false,
}) {
  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: legacyStructuredOutput
      ? {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_LEGACY_RESPONSE_SCHEMA,
          maxOutputTokens: geminiMaxOutputTokens(),
        }
      : {
          // Gemini REST uses these flat fields. Keep responseFormat as a
          // non-authoritative compatibility mirror for older unit tests/mocks;
          // Gemini ignores unknown fields and reads responseMimeType/responseSchema.
          responseMimeType: 'application/json',
          responseSchema,
          responseFormat: {
            text: {
              mimeType: 'application/json',
              schema: responseSchema,
            },
          },
          maxOutputTokens: geminiMaxOutputTokens(),
        },
  }
}

async function sendGeminiRequest({
  endpoint,
  apiKey,
  prompt,
  systemInstruction,
  responseSchema,
  signal,
  fetchImpl,
  legacyStructuredOutput = false,
}) {
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(
        requestBody({
          prompt,
          systemInstruction,
          responseSchema,
          legacyStructuredOutput,
        }),
      ),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const fetchError = new Error('Gemini request could not be completed.')
    fetchError.code = 'api_fetch_failed'
    throw fetchError
  }
  const payload = await readBoundedResponse(response)
  if (!response.ok) throw providerFailure(response, payload)
  const text = responseText(payload)
  if (process.env.GEMINI_DEBUG_RAW === 'true') {
    console.log('[GEMINI RAW meta]', {
      httpStatus: Number(response.status || 0) || null,
      finishReason: payload?.candidates?.[0]?.finishReason || null,
      textLength: text.length,
    })
    console.log('[GEMINI RAW response_text_before_parse]', text.slice(0, 8_000))
  }
  if (!text) {
    const error = new Error('Gemini response did not contain text.')
    error.code = 'api_invalid_response'
    error.status = Number(response.status || 0) || null
    throw error
  }
  return {
    text,
    httpStatus: Number(response.status || 0) || null,
  }
}

async function defaultInvokeGemini({
  prompt,
  systemInstruction,
  responseSchema,
  apiKey,
  model,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const safeModelName = safeModel(model)
    if (!safeModelName) {
      const error = new Error('Gemini model is not configured.')
      error.code = 'missing_model'
      throw error
    }
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(safeModelName)}:generateContent`
    try {
      const result = await sendGeminiRequest({
        endpoint,
        apiKey,
        prompt,
        systemInstruction,
        responseSchema,
        signal: controller.signal,
        fetchImpl,
      })
      return {
        providerResult: true,
        ...result,
        warnings: [],
      }
    } catch (error) {
      if (!error?.structuredOutputCompatibilityFailure) throw error
      const result = await sendGeminiRequest({
        endpoint,
        apiKey,
        prompt,
        systemInstruction,
        responseSchema,
        signal: controller.signal,
        fetchImpl,
        legacyStructuredOutput: true,
      })
      return {
        providerResult: true,
        ...result,
        warnings: ['gemini_structured_output_compatibility_fallback'],
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Gemini validation timed out.')
      timeoutError.code = 'api_timeout'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function withTimeout(operation, timeoutMs) {
  let timer = null
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Gemini validation timed out.')
          error.code = 'api_timeout'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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
  if (error?.name === 'AbortError') {
    return 'api_timeout'
  }
  if (error instanceof SyntaxError) return 'json_parse_failed'
  return 'api_fetch_failed'
}

function failureWarning(reason) {
  return {
    missing_api_key: 'gemini_api_key_missing',
    missing_model: 'gemini_model_missing',
    api_key_invalid: 'gemini_api_key_invalid',
    model_not_found: 'gemini_model_not_found',
    api_forbidden: 'gemini_api_forbidden',
    quota_exceeded: 'gemini_quota_exceeded',
    api_timeout: 'gemini_api_timeout',
    api_fetch_failed: 'gemini_api_fetch_failed',
    api_invalid_response: 'gemini_api_invalid_response',
    json_parse_failed: 'gemini_json_parse_failed',
    schema_validation_failed: 'gemini_schema_validation_failed',
  }[reason] || 'gemini_api_fetch_failed'
}

function geminiConfigState(options = {}) {
  const apiKey = Object.hasOwn(options, 'apiKey')
    ? options.apiKey
    : process.env.GEMINI_API_KEY
  const model = Object.hasOwn(options, 'model')
    ? options.model
    : process.env.GEMINI_MODEL
  return {
    keyConfigured: Boolean(String(apiKey || '').trim()),
    modelConfigured: Boolean(safeModel(model)),
  }
}

export async function validateFoodMapEvidenceWithGemini(
  input = {},
  {
    apiKey = process.env.GEMINI_API_KEY || '',
    model = process.env.GEMINI_MODEL || '',
    timeoutMs = Number(
      process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
    invokeGemini = defaultInvokeGemini,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const summary = buildGeminiEvidenceSummary(input)
  const config = {
    keyConfigured: Boolean(String(apiKey || '').trim()),
    modelConfigured: Boolean(safeModel(model)),
  }
  const boundedTimeout = Math.max(
    200,
    Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
  )
  if (!String(apiKey).trim()) {
    return {
      ok: false,
      reason: 'missing_api_key',
      summary,
      ...config,
      httpStatus: null,
    }
  }
  if (!config.modelConfigured) {
    return {
      ok: false,
      reason: 'missing_model',
      summary,
      ...config,
      httpStatus: null,
    }
  }
  try {
    const raw = await withTimeout(
      () =>
        invokeGemini({
          prompt: promptForSummary(summary),
          systemInstruction: SYSTEM_INSTRUCTION,
          responseSchema: GEMINI_RESPONSE_JSON_SCHEMA,
          apiKey,
          model: safeModel(model),
          timeoutMs: boundedTimeout,
          fetchImpl,
        }),
      boundedTimeout,
    )
    const providerResult = raw?.providerResult === true ? raw : null
    const providerWarnings = boundedWarnings(providerResult?.warnings)
    const responseValue = providerResult ? providerResult.text : raw
    let parsed
    try {
      parsed = parseGeminiJsonText(responseValue)
    } catch (error) {
      if (process.env.GEMINI_DEBUG_RAW === 'true') {
        console.log('[GEMINI PARSE DEBUG]', {
          error: error?.message || String(error),
          responseType: typeof responseValue,
          responseLength:
            typeof responseValue === 'string'
              ? responseValue.length
              : null,
        })
      }
      return {
        ok: false,
        reason: 'json_parse_failed',
        summary,
        ...config,
        httpStatus: providerResult?.httpStatus || null,
      }
    }
    const validated = geminiEvidenceValidationResponseSchema.safeParse(parsed)
    if (!validated.success) {
      return {
        ok: false,
        reason: 'schema_validation_failed',
        summary,
        ...config,
        httpStatus: providerResult?.httpStatus || null,
      }
    }
    return {
      ok: true,
      reason: 'success',
      ...config,
      httpStatus: providerResult?.httpStatus || null,
      result: {
        ...validated.data,
        confidence: clampScore(validated.data.confidence),
        rejectedEntities: validated.data.rejectedEntities
          .map((item) => ({
            field: item.field,
            value: capText(item.value, 180),
            reason: capText(item.reason, 180),
          }))
          .slice(0, 12),
        warnings: boundedWarnings([
          ...providerWarnings,
          ...validated.data.warnings,
        ]),
      },
      summary,
    }
  } catch (error) {
    return {
      ok: false,
      reason: failureReason(error),
      summary,
      ...config,
      httpStatus: Number(error?.status || 0) || null,
    }
  }
}

export async function runFoodMapEvidenceValidation(
  input = {},
  {
    mode = configuredMode(),
    geminiOptions = {},
  } = {},
) {
  const selectedMode = configuredMode(mode)
  const config = geminiConfigState(geminiOptions)
  if (selectedMode === 'rule') {
    return {
      provider: 'rule',
      mode: selectedMode,
      requested: false,
      applied: false,
      status: 'not_requested',
      confidence: 0,
      rejectedEntities: [],
      canResolveLocation: null,
      recommendedNextAction: 'none',
      warnings: [],
      ...config,
      httpStatus: null,
      entities: input.ruleEntities,
    }
  }
  if (
    selectedMode === 'hybrid' &&
    !shouldRunGeminiEvidenceValidation(input)
  ) {
    return {
      provider: 'gemini',
      mode: selectedMode,
      requested: false,
      applied: false,
      status: 'skipped_low_risk',
      confidence: 0,
      rejectedEntities: [],
      canResolveLocation: null,
      recommendedNextAction: 'none',
      warnings: [],
      ...config,
      httpStatus: null,
      entities: input.ruleEntities,
    }
  }

  const gemini = await validateFoodMapEvidenceWithGemini(
    input,
    geminiOptions,
  )
  if (!gemini.ok) {
    const highRiskFallback = shouldRunGeminiEvidenceValidation(input)
    const failedClosed = highRiskFallback
      ? applyRiskySocialFailClosed(input)
      : { entities: input.ruleEntities, suppressed: false }
    const warnings = [
      failureWarning(gemini.reason),
      ...(failedClosed.suppressed
        ? ['evidence_validation_failed_closed']
        : []),
    ]
    return {
      provider: 'gemini',
      mode: selectedMode,
      requested: true,
      applied: false,
      status: 'fallback',
      confidence: 0,
      rejectedEntities: [],
      canResolveLocation: highRiskFallback ? false : null,
      recommendedNextAction: highRiskFallback
        ? 'ask_for_hint'
        : 'none',
      warnings,
      keyConfigured: gemini.keyConfigured,
      modelConfigured: gemini.modelConfigured,
      httpStatus: gemini.httpStatus,
      entities: failedClosed.entities,
    }
  }

  const validation = {
    provider: 'gemini',
    mode: selectedMode,
    requested: true,
    applied: true,
    status: gemini.result.status,
    confidence: gemini.result.confidence,
    rejectedEntities: gemini.result.rejectedEntities,
    canResolveLocation: gemini.result.canResolveLocation,
    recommendedNextAction: gemini.result.recommendedNextAction,
    warnings: gemini.result.warnings,
    keyConfigured: gemini.keyConfigured,
    modelConfigured: gemini.modelConfigured,
    httpStatus: gemini.httpStatus,
    result: gemini.result,
  }
  return {
    ...validation,
    entities: applyGeminiEvidenceValidation(
      input.ruleEntities,
      validation,
      gemini.summary,
    ),
  }
}

export {
  configuredMode as configuredEvidenceValidatorMode,
  defaultInvokeGemini,
  GEMINI_RESPONSE_JSON_SCHEMA,
}
