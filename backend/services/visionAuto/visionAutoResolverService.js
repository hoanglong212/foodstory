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

    const placeResolution = await (
      dependencies.resolvePlaces || resolveVisionPlaceCandidates
    )(
      {
        entities: validated.entities,
        validation: validated.validation,
        config,
      },
      dependencies.placeResolverOptions || {},
    )
    steps.push(
      `vision_place_resolution_${placeResolution.resolution?.status || 'not_requested'}`,
    )

    const decision = (
      dependencies.decideResult || decideVisionAutoResult
    )({
      input,
      entities: validated.entities,
      resolution: placeResolution.resolution,
      placeCandidates: placeResolution.placeCandidates,
    })
    steps.push(`vision_final_${decision.status}`)

    const warnings = combinedWarnings(
      collection.warnings,
      normalizedEvidence.warnings,
      candidateEntities.warnings,
      validated.entities.warnings,
      validated.validation.warnings,
      placeResolution.warnings,
    )

    return (
      dependencies.buildResponse || buildVisionAutoResponse
    )({
      ...decision,
      input,
      normalizedEvidence,
      entities: validated.entities,
      placeCandidates: placeResolution.placeCandidates,
      steps,
      warnings,
      debugLevel: config.debugLevel,
      debug: {
        ...(collection?.debug || {}),
        geminiOcrRepairStatus:
          validated.validation?.geminiOcrRepairStatus || 'not_requested',
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
        errorName: String(error?.name || 'Error').slice(0, 80),
        errorCode: String(error?.code || '').slice(0, 80) || null,
        errorMessage: String(error?.message || '').slice(0, 300),
      },
    })
  }
}

export default analyzeVisionAutoV2
