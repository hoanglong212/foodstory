import {
  isDescriptiveSocialTitle,
} from '../foodMapEntityExtractionService.js'
import { buildFoodMapLocationQuery } from '../foodMapLocationQueryService.js'
import { runFoodMapEvidenceValidation } from '../geminiEvidenceValidationService.js'
import { repairOcrAddressWithGemini } from './geminiOcrAddressRepairService.js'

const RISKY_SOURCE_TYPES = new Set([
  'title',
  'description',
  'og_title',
  'og_description',
  'youtube_title',
  'youtube_description',
  'youtube_channel',
  'thumbnail_ocr',
  'frame_ocr',
  'youtube_frame_ocr',
  'audio_transcript',
])

const GENERIC_PLACE_TOKENS = new Set([
  'an',
  'cafe',
  'coffee',
  'hang',
  'nha',
  'quan',
  'restaurant',
  'tiem',
])

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function emptyNamedEntity() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
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

function cloneArray(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    evidence: Array.isArray(item?.evidence)
      ? [...item.evidence]
      : item?.evidence
        ? [item.evidence]
        : [],
  }))
}

function entityEvidence(entity = null) {
  return [
    entity?.value,
    ...(Array.isArray(entity?.evidence)
      ? entity.evidence
      : entity?.evidence
        ? [entity.evidence]
        : []),
  ].filter(Boolean)
}

function sourceSupportsEntity(source, entity) {
  const sourceText = normalizeText(source?.text)
  if (!sourceText) return false
  return entityEvidence(entity).some((value) => {
    const normalized = normalizeText(value)
    return Boolean(
      normalized &&
        (sourceText.includes(normalized) || normalized.includes(sourceText)),
    )
  })
}

function supportingSources(entity, textSources) {
  return (Array.isArray(textSources) ? textSources : []).filter((source) =>
    sourceSupportsEntity(source, entity),
  )
}

function explicitDistrictSupported(entity, textSources) {
  const match = normalizeText(entity?.value).match(/^quan\s+(\d{1,2})$/)
  if (!match) return true
  const number = match[1]
  return supportingSources(entity, textSources).some((source) => {
    const text = String(source?.text || '').toLocaleLowerCase('vi')
    return (
      new RegExp(`\\bquận\\s*\\.?\\s*${number}\\b`, 'iu').test(text) ||
      new RegExp(`\\bq\\s*\\.?\\s*${number}\\b`, 'iu').test(text) ||
      new RegExp(`\\bdistrict\\s+${number}\\b`, 'iu').test(text)
    )
  })
}

function isDescriptiveTitlePlace(entity, textSources) {
  if (!entity?.value) return false
  const sources = supportingSources(entity, textSources)
  const titleSources = sources.filter((source) =>
    ['title', 'og_title', 'youtube_title'].includes(source?.type),
  )
  if (!titleSources.length) return false
  const hasNonRiskySupport = sources.some(
    (source) => !RISKY_SOURCE_TYPES.has(source?.type),
  )
  if (hasNonRiskySupport) return false
  return titleSources.some(
    (source) => isDescriptiveSocialTitle(source.text).isDescriptive,
  )
}

function placeIsDishAndLocationOnly(entities = {}) {
  const value = normalizeText(entities.placeName?.value)
  if (!value) return false
  const allowed = new Set(GENERIC_PLACE_TOKENS)
  for (const item of [
    ...(Array.isArray(entities.dishNames) ? entities.dishNames : []),
    ...(Array.isArray(entities.locationHints) ? entities.locationHints : []),
  ]) {
    for (const token of normalizeText(item?.value).split(' ').filter(Boolean)) {
      allowed.add(token)
    }
  }
  const tokens = value.split(' ').filter(Boolean)
  return tokens.length > 0 && tokens.every((token) => allowed.has(token))
}

function structuredSupport(entity, textSources) {
  return supportingSources(entity, textSources).some(
    (source) =>
      source?.type === 'json_ld' &&
      Number(source?.confidence || 0) >= 0.65,
  )
}

function riskySocialProviderFailureGuard(entities, input, validation) {
  const socialInput = [
    'youtube_url',
    'generic_social_url',
  ].includes(input?.type || input?.inputType)
  const providerFailed =
    validation?.requested === true &&
    validation?.applied !== true &&
    ['fallback', 'error', 'provider_error'].includes(validation?.status)
  if (!socialInput || !providerFailed) return entities

  const textSources = input?.textSources || []
  const strongAddress =
    entities.address?.value &&
    Number(entities.address.confidence || 0) >= 0.72 &&
    structuredSupport(entities.address, textSources)
  const placeSources = supportingSources(entities.placeName, textSources)
  const placeOnlyRisky =
    placeSources.length > 0 &&
    placeSources.every((source) => RISKY_SOURCE_TYPES.has(source?.type))

  return {
    ...entities,
    placeName:
      placeOnlyRisky && !structuredSupport(entities.placeName, textSources)
        ? emptyNamedEntity()
        : entities.placeName,
    locationHints: strongAddress
      ? entities.locationHints
      : (entities.locationHints || []).filter((item) =>
          explicitDistrictSupported(item, textSources),
        ),
    warnings: [
      ...(entities.warnings || []),
      ...(placeOnlyRisky ? ['evidence_validation_failed_closed'] : []),
    ],
  }
}

function rejectedValues(validation, field) {
  return new Set(
    (Array.isArray(validation?.rejectedEntities)
      ? validation.rejectedEntities
      : []
    )
      .filter((item) => item?.field === field)
      .map((item) => normalizeText(item?.value))
      .filter(Boolean),
  )
}

function removeRejectedEntities(entities, validation) {
  const rejectedPlaceNames = rejectedValues(validation, 'placeName')
  const rejectedAddresses = rejectedValues(validation, 'address')
  const rejectedPhones = rejectedValues(validation, 'phones')
  const rejectedDishes = rejectedValues(validation, 'dishNames')
  const rejectedLocations = rejectedValues(validation, 'locationHints')
  const rejected = (value, values) => values.has(normalizeText(value))

  return {
    ...entities,
    placeName: rejected(entities.placeName?.value, rejectedPlaceNames)
      ? emptyNamedEntity()
      : entities.placeName,
    address: rejected(entities.address?.value, rejectedAddresses)
      ? emptyNamedEntity()
      : entities.address,
    phones: (entities.phones || []).filter(
      (item) => !rejected(item?.value, rejectedPhones),
    ),
    dishNames: (entities.dishNames || []).filter(
      (item) => !rejected(item?.value, rejectedDishes),
    ),
    locationHints: (entities.locationHints || []).filter(
      (item) => !rejected(item?.value, rejectedLocations),
    ),
  }
}

function finalStatus(entities) {
  if (
    entities.address?.value &&
    Number(entities.address.confidence || 0) >= 0.62
  ) {
    return 'address_found'
  }
  if (
    entities.placeName?.value &&
    Number(entities.placeName.confidence || 0) >= 0.5
  ) {
    return 'place_name_found'
  }
  if (entities.dishNames?.length) return 'dish_only'
  return 'unclear'
}

function finalConfidence(entities, status) {
  if (status === 'address_found') return entities.address.confidence
  if (status === 'place_name_found') return entities.placeName.confidence
  if (status === 'dish_only') {
    return Math.max(
      0,
      ...(entities.dishNames || []).map((item) => Number(item.confidence || 0)),
    )
  }
  return 0
}

export function applyVisionEntitySafetyGuards(
  input,
  sourceEntities = {},
  validation = null,
) {
  const textSources = input?.textSources || []
  let entities = {
    ...sourceEntities,
    placeName: cloneNamedEntity(sourceEntities.placeName),
    address: cloneNamedEntity(sourceEntities.address),
    phones: cloneArray(sourceEntities.phones),
    dishNames: cloneArray(sourceEntities.dishNames),
    locationHints: cloneArray(sourceEntities.locationHints),
    priceHints: cloneArray(sourceEntities.priceHints),
    addressCandidates: cloneArray(sourceEntities.addressCandidates),
    warnings: [...(sourceEntities.warnings || [])],
  }

  if (
    isDescriptiveTitlePlace(entities.placeName, textSources) ||
    placeIsDishAndLocationOnly(entities)
  ) {
    entities.placeName = emptyNamedEntity()
    entities.warnings.push('unsafe_place_candidate_rejected')
  }

  const originalLocationCount = entities.locationHints.length
  entities.locationHints = entities.locationHints.filter((item) =>
    explicitDistrictSupported(item, textSources),
  )
  if (entities.locationHints.length !== originalLocationCount) {
    entities.warnings.push('ambiguous_quan_location_rejected')
  }

  entities = removeRejectedEntities(entities, validation)
  entities = riskySocialProviderFailureGuard(entities, input, validation)
  const status = finalStatus(entities)
  return {
    ...entities,
    status,
    confidence: roundScore(finalConfidence(entities, status)),
    warnings: [...new Set(entities.warnings)].slice(0, 12),
  }
}

export async function validateVisionEntities(
  {
    input,
    normalizedEvidence = {},
    candidateEntities = {},
    config = {},
  } = {},
  {
    runValidator = runFoodMapEvidenceValidation,
    geminiOptions = {},
  } = {},
) {
  const validationInput = {
    inputType: input?.type,
    textSources: normalizedEvidence.textSources || [],
    ocrEvidence: normalizedEvidence.uploadedOcrEvidence || {},
  }
  let guardedCandidates = applyVisionEntitySafetyGuards(
    validationInput,
    candidateEntities,
  )

  const ocrRepair = await repairOcrAddressWithGemini({
    normalizedEvidence,
    candidateEntities: guardedCandidates,
    config,
  }, geminiOptions?.ocrAddressRepairOptions || {})

  if (ocrRepair?.applied === true && ocrRepair.entities) {
    guardedCandidates = applyVisionEntitySafetyGuards(
      validationInput,
      ocrRepair.entities,
    )
  } else if (ocrRepair?.rejectedCurrentAddress === true) {
    guardedCandidates = {
      ...guardedCandidates,
      address: emptyNamedEntity(),
      warnings: [
        ...new Set([
          ...(guardedCandidates.warnings || []),
          'suspicious_frame_address_rejected',
        ]),
      ],
    }
  }

  validationInput.ruleEntities = guardedCandidates
  validationInput.draftLocationQuery = buildFoodMapLocationQuery({
    entities: guardedCandidates,
  })

  let validation
  try {
    validation = await runValidator(validationInput, {
      mode: config.evidenceValidator,
      geminiOptions,
    })
  } catch {
    validation = {
      provider: 'gemini',
      mode: config.evidenceValidator,
      requested: true,
      applied: false,
      status: 'provider_error',
      confidence: 0,
      rejectedEntities: [],
      canResolveLocation: false,
      warnings: ['gemini_provider_error', ...(ocrRepair?.warnings || [])],
      entities: guardedCandidates,
    }
  }

  const finalEntities = applyVisionEntitySafetyGuards(
    validationInput,
    validation?.entities || guardedCandidates,
    validation,
  )

  return {
    entities: finalEntities,
    validation: {
      provider: validation?.provider || 'rule',
      mode: validation?.mode || config.evidenceValidator || 'rule',
      requested: validation?.requested === true,
      applied: validation?.applied === true,
      status: validation?.status || 'not_requested',
      confidence: roundScore(validation?.confidence),
      canResolveLocation:
        typeof validation?.canResolveLocation === 'boolean'
          ? validation.canResolveLocation
          : null,
      rejectedEntities: (Array.isArray(validation?.rejectedEntities)
        ? validation.rejectedEntities
        : []
      )
        .map((item) => ({
          field: String(item?.field || '').slice(0, 40),
          value: String(item?.value || '').slice(0, 180),
          reason: String(item?.reason || '').slice(0, 180),
        }))
        .filter((item) => item.field && item.value)
        .slice(0, 12),
      warnings: [
        ...new Set(
          [
            ...(Array.isArray(validation?.warnings) ? validation.warnings : []),
            ...(Array.isArray(ocrRepair?.warnings) ? ocrRepair.warnings : []),
          ]
            .map((item) => String(item || '').slice(0, 100))
            .filter(Boolean),
        ),
      ].slice(0, 8),
      keyConfigured: validation?.keyConfigured === true,
      modelConfigured: validation?.modelConfigured === true,
      httpStatus: Number.isFinite(Number(validation?.httpStatus))
        ? Number(validation.httpStatus)
        : null,
      geminiOcrRepairStatus: String(
        ocrRepair?.status || 'not_requested',
      ).slice(0, 60),
      geminiOcrRepairApplied: ocrRepair?.applied === true,
    },
  }
}
