import { detectSocialPlatform } from '../socialUrlExtractionService.js'
import { emptyFoodMapEntities } from '../foodMapEntityExtractionService.js'
import { collectVisionEvidence } from './visionEvidenceCollectorService.js'
import { decideVisionAutoResult } from './visionFinalDecisionService.js'
import { extractVisionEntityCandidates } from './visionEntityExtractorService.js'
import { normalizeVisionEvidence } from './visionEvidenceNormalizerService.js'
import { validateVisionEntities } from './visionEvidenceValidatorService.js'
import { getVisionAutoConfig } from './visionAutoConfig.js'
import { resolveVisionPlaceCandidates } from './visionPlaceResolverService.js'
import { buildVisionAutoResponse } from './visionResponseBuilder.js'
import {
  extractVisionAutoCandidatesWithGemini,
  mergeGeminiCandidatesWithLocalCandidates,
} from './geminiCandidateExtractionService.js'

export class VisionAutoInputError extends Error {
  constructor(message, field = null) {
    super(message)
    this.name = 'VisionAutoInputError'
    this.code = 'VISION_AUTO_INPUT_INVALID'
    this.field = field
  }
}

export class VisionAutoDisabledError extends Error {
  constructor() {
    super('Vision Auto v2 is disabled.')
    this.name = 'VisionAutoDisabledError'
    this.code = 'VISION_AUTO_DISABLED'
  }
}

function cleanUrl(value) {
  return String(value || '').trim().slice(0, 2_000)
}

export function resolveVisionAutoInput({ image = null, url = '' } = {}) {
  const cleanedUrl = cleanUrl(url)
  if (image && cleanedUrl) {
    throw new VisionAutoInputError(
      'Provide either one uploaded image or one URL, not both.',
    )
  }
  if (!image && !cleanedUrl) {
    throw new VisionAutoInputError(
      'Provide one uploaded image or one public URL.',
    )
  }
  if (image) {
    return {
      type: 'uploaded_image',
      url: null,
      platform: null,
    }
  }

  let parsed
  try {
    parsed = new URL(cleanedUrl)
  } catch {
    throw new VisionAutoInputError(
      'URL must be a valid HTTP or HTTPS URL.',
      'url',
    )
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new VisionAutoInputError(
      'URL must be a valid HTTP or HTTPS URL.',
      'url',
    )
  }

  const platform = detectSocialPlatform(parsed)
  return {
    type:
      platform === 'youtube'
        ? 'youtube_url'
        : platform === 'web'
          ? 'blog_url'
          : 'generic_social_url',
    url: parsed.href,
    platform,
  }
}

function combinedWarnings(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .map((value) => String(value || '').slice(0, 100))
        .filter(Boolean),
    ),
  ].slice(0, 16)
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function emptyNamedEntity() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits
}

function geminiCandidateAddressCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      address: candidate?.address || null,
      confidence: roundScore(candidate?.confidence),
      source: candidate?.source || 'gemini_ocr_candidate_extraction',
      timestampSeconds: Number.isFinite(Number(candidate?.timestampSeconds))
        ? Number(candidate.timestampSeconds)
        : null,
      evidence: Array.isArray(candidate?.evidence)
        ? candidate.evidence
        : [candidate?.evidenceText || candidate?.address].filter(Boolean),
      ...(candidate?.placeName ? { placeName: candidate.placeName } : {}),
      ...(candidate?.dishHint ? { dishHint: candidate.dishHint } : {}),
      reviewRequired: true,
    }))
    .filter((candidate) => candidate.address)
}

function mergeGeminiCandidateEntities(entities = {}, geminiCandidates = []) {
  const geminiAddressCandidates =
    geminiCandidateAddressCandidates(geminiCandidates)
  const mergedAddressCandidates = mergeGeminiCandidatesWithLocalCandidates(
    entities.addressCandidates || [],
    geminiAddressCandidates,
  ).slice(0, 8)
  const nextEntities = {
    ...entities,
    addressCandidates: mergedAddressCandidates,
    warnings: combinedWarnings(
      entities.warnings,
      geminiAddressCandidates.length
        ? ['gemini_ocr_candidates_extracted']
        : [],
    ),
  }

  const existingPhones = new Set(
    (Array.isArray(entities.phones) ? entities.phones : [])
      .map((item) => normalizePhone(item?.value))
      .filter(Boolean),
  )
  const geminiPhones = (Array.isArray(geminiCandidates) ? geminiCandidates : [])
    .map((candidate) => {
      const phone = normalizePhone(candidate?.phone)
      if (!phone || existingPhones.has(phone)) return null
      existingPhones.add(phone)
      return {
        value: phone,
        confidence: Math.min(0.9, Math.max(0.6, roundScore(candidate?.confidence))),
        source: candidate?.source || 'gemini_ocr_candidate_extraction',
        evidence: Array.isArray(candidate?.evidence)
          ? candidate.evidence.slice(0, 3)
          : [candidate?.evidenceText].filter(Boolean),
      }
    })
    .filter(Boolean)
  if (geminiPhones.length) {
    nextEntities.phones = [
      ...(Array.isArray(entities.phones) ? entities.phones : []),
      ...geminiPhones,
    ].slice(0, 8)
  }

  if (mergedAddressCandidates.length >= 2) {
    nextEntities.address = emptyNamedEntity()
    nextEntities.warnings = combinedWarnings(
      nextEntities.warnings,
      ['multiple_gemini_ocr_candidates_detected'],
    )
    return nextEntities
  }

  const [singleCandidate] = mergedAddressCandidates
  if (singleCandidate && !nextEntities.address?.value) {
    nextEntities.address = {
      value: singleCandidate.address,
      confidence: Math.min(
        0.88,
        Math.max(0.62, roundScore(singleCandidate.confidence)),
      ),
      source: singleCandidate.source || 'gemini_ocr_candidate_extraction',
      evidence: Array.isArray(singleCandidate.evidence)
        ? singleCandidate.evidence.slice(0, 4)
        : [],
      timestampSeconds: Number.isFinite(Number(singleCandidate.timestampSeconds))
        ? Number(singleCandidate.timestampSeconds)
        : null,
      reviewRequired: true,
    }
  }

  return nextEntities
}

function geminiCandidateExtractionInput({
  input,
  normalizedEvidence,
  entities,
  decision,
} = {}) {
  const candidates = Array.isArray(decision?.candidates)
    ? decision.candidates
    : []
  const localCandidates = Array.isArray(entities?.addressCandidates)
    ? entities.addressCandidates
    : []
  return {
    input,
    inputType: input?.type,
    platform: input?.platform,
    url: input?.url,
    decisionStatus: decision?.status,
    currentCandidateCount: Math.max(candidates.length, localCandidates.length),
    metadata: normalizedEvidence?.metadata || [],
    frameEvidence: normalizedEvidence?.frameEvidence || [],
    frameTexts: normalizedEvidence?.frameTexts || [],
    localCandidates,
    candidates,
    ruleEntities: entities,
  }
}

async function maybeExtractGeminiCandidates({
  dependencies,
  input,
  normalizedEvidence,
  entities,
  decision,
  config,
} = {}) {
  const request = geminiCandidateExtractionInput({
    input,
    normalizedEvidence,
    entities,
    decision,
  })
  request.enabled = config.geminiCandidateExtractionEnabled
  request.maxLines = config.geminiCandidateExtractionMaxLines

  try {
    return await (
      dependencies.extractGeminiCandidates ||
      extractVisionAutoCandidatesWithGemini
    )(
      request,
      {
        timeoutMs: config.geminiCandidateExtractionTimeoutMs,
        ...(dependencies.geminiCandidateOptions || {}),
      },
    )
  } catch {
    return {
      provider: 'gemini',
      requested: true,
      applied: false,
      status: 'provider_error',
      reason: 'provider_error',
      skipReason: null,
      candidates: [],
      rejected: [],
      warnings: ['gemini_candidate_api_fetch_failed'],
      debug: {
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
      },
    }
  }
}

export async function analyzeVisionAutoV2(
  {
    image = null,
    url = '',
  } = {},
  dependencies = {},
) {
  const config = dependencies.config || getVisionAutoConfig()
  if (!config.enabled) throw new VisionAutoDisabledError()

  const input = resolveVisionAutoInput({ image, url })
  const steps = ['vision_auto_input_resolved']
  let normalizedEvidence = {
    metadata: [],
    ocrLines: [],
    frameEvidence: [],
    frameTexts: [],
    audioTexts: [],
    warnings: [],
    textSources: [],
    uploadedOcrEvidence: null,
  }

  try {
    const collection = await (
      dependencies.collectEvidence || collectVisionEvidence
    )(
      { input, image, config },
      dependencies.collectorOptions || {},
    )
    steps.push('vision_evidence_collected')

    normalizedEvidence = (
      dependencies.normalizeEvidence || normalizeVisionEvidence
    )(collection)
    steps.push('vision_evidence_normalized')

    const candidateEntities = (
      dependencies.extractEntities || extractVisionEntityCandidates
    )(
      normalizedEvidence,
      dependencies.extractorOptions || {},
    )
    steps.push('vision_entity_candidates_extracted')

    const validated = await (
      dependencies.validateEntities || validateVisionEntities
    )(
      {
        input,
        normalizedEvidence,
        candidateEntities,
        config,
      },
      dependencies.validatorOptions || {},
    )
    steps.push(
      validated.validation?.applied
        ? 'vision_evidence_validation_applied'
        : `vision_evidence_validation_${validated.validation?.status || 'not_requested'}`,
    )

    let finalEntities = validated.entities
    let placeResolution = await (
      dependencies.resolvePlaces || resolveVisionPlaceCandidates
    )(
      {
        entities: finalEntities,
        validation: validated.validation,
        config,
      },
      dependencies.placeResolverOptions || {},
    )
    steps.push(
      `vision_place_resolution_${placeResolution.resolution?.status || 'not_requested'}`,
    )

    let decision = (
      dependencies.decideResult || decideVisionAutoResult
    )({
      input,
      entities: finalEntities,
      resolution: placeResolution.resolution,
      placeCandidates: placeResolution.placeCandidates,
    })
    const geminiCandidateExtraction = await maybeExtractGeminiCandidates({
      dependencies,
      input,
      normalizedEvidence,
      entities: finalEntities,
      decision,
      config,
    })
    if (geminiCandidateExtraction?.requested === true) {
      steps.push(
        `vision_gemini_candidate_extraction_${geminiCandidateExtraction.status || 'provider_error'}`,
      )
    }

    if (
      Array.isArray(geminiCandidateExtraction?.candidates) &&
      geminiCandidateExtraction.candidates.length
    ) {
      finalEntities = mergeGeminiCandidateEntities(
        finalEntities,
        geminiCandidateExtraction.candidates,
      )
      placeResolution = await (
        dependencies.resolvePlaces || resolveVisionPlaceCandidates
      )(
        {
          entities: finalEntities,
          validation: validated.validation,
          config,
        },
        dependencies.placeResolverOptions || {},
      )
      steps.push(
        `vision_place_resolution_${placeResolution.resolution?.status || 'not_requested'}`,
      )
      decision = (
        dependencies.decideResult || decideVisionAutoResult
      )({
        input,
        entities: finalEntities,
        resolution: placeResolution.resolution,
        placeCandidates: placeResolution.placeCandidates,
      })
    }
    steps.push(`vision_final_${decision.status}`)

    const warnings = combinedWarnings(
      collection.warnings,
      normalizedEvidence.warnings,
      candidateEntities.warnings,
      finalEntities.warnings,
      validated.validation.warnings,
      geminiCandidateExtraction?.warnings,
      placeResolution.warnings,
    )

    return (
      dependencies.buildResponse || buildVisionAutoResponse
    )({
      ...decision,
      input,
      normalizedEvidence,
      entities: finalEntities,
      placeCandidates: placeResolution.placeCandidates,
      steps,
      warnings,
      debugLevel: config.debugLevel,
      debug: {
        ...(collection?.debug || {}),
        geminiOcrRepairStatus:
          validated.validation?.geminiOcrRepairStatus || 'not_requested',
        ...(geminiCandidateExtraction
          ? {
              geminiCandidateExtractionStatus:
                geminiCandidateExtraction.status || 'provider_error',
              geminiCandidateAcceptedCount: Number.isFinite(
                Number(geminiCandidateExtraction.debug?.geminiCandidateAcceptedCount),
              )
                ? Number(geminiCandidateExtraction.debug.geminiCandidateAcceptedCount)
                : Array.isArray(geminiCandidateExtraction.candidates)
                  ? geminiCandidateExtraction.candidates.length
                  : 0,
              geminiCandidateRejectedCount: Number.isFinite(
                Number(geminiCandidateExtraction.debug?.geminiCandidateRejectedCount),
              )
                ? Number(geminiCandidateExtraction.debug.geminiCandidateRejectedCount)
                : Array.isArray(geminiCandidateExtraction.rejected)
                  ? geminiCandidateExtraction.rejected.length
                  : 0,
              geminiCandidateExtractionSkipReason:
                geminiCandidateExtraction.skipReason || null,
            }
          : {}),
      },
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      throw error
    }

    steps.push('vision_auto_failed_closed')
    return (
      dependencies.buildResponse || buildVisionAutoResponse
    )({
      status: 'unresolved_best_effort',
      confidence: 0,
      input,
      normalizedEvidence,
      entities: emptyFoodMapEntities(),
      placeCandidates: [],
      bestResult: null,
      addPlaceDraft: null,
      reason: 'vision_auto_pipeline_error',
      steps,
      warnings: combinedWarnings(
        normalizedEvidence.warnings,
        ['vision_auto_internal_error'],
      ),
      debugLevel: config.debugLevel,
      debug: {
        geminiCandidateExtractionStatus:
          config.geminiCandidateExtractionEnabled === true
            ? 'skipped_gate'
            : 'disabled',
        geminiCandidateAcceptedCount: 0,
        geminiCandidateRejectedCount: 0,
        geminiCandidateExtractionSkipReason:
          config.geminiCandidateExtractionEnabled === true
            ? 'pipeline_failed_before_candidate_extraction'
            : 'feature_disabled',
        errorName: String(error?.name || 'Error').slice(0, 80),
        errorCode: String(error?.code || '').slice(0, 80) || null,
        errorMessage: String(error?.message || '').slice(0, 300),
      },
    })
  }
}

export default analyzeVisionAutoV2
