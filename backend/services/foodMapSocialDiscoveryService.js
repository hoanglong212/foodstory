import {
  extractFoodMapEntitiesHybrid,
} from './groqEntityExtractionService.js'
import { buildFoodMapLocationQuery } from './foodMapLocationQueryService.js'
import {
  resolveFoodMapLocation,
} from './foodMapLocationResolutionService.js'
import {
  integrateResolvedFoodMapPlace,
} from './foodMapDraftPlaceService.js'
import {
  buildFoodMapNextAction,
} from './foodMapNextActionService.js'
import {
  extractOcrEvidenceWithProvider,
} from './ocrProviders/index.js'
import {
  createFoodMapSocialResponse,
} from './foodMapSocialDecisionService.js'
import {
  resolveSocialInput,
} from './socialInputResolverService.js'
import {
  runFoodMapEvidenceValidation,
} from './geminiEvidenceValidationService.js'
import { extractTextPlaceSignal } from './textPlaceSignalExtractor.js'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function emptyOcrEvidence(reason = 'not_provided') {
  return {
    text: null,
    usable: false,
    ocrUsable: false,
    confidence: 0,
    reason,
    lines: [],
    strongLines: [],
    weakLines: [],
    warnings: [],
    debug: { implemented: false },
    implemented: false,
  }
}

function sourceText(sources, types) {
  for (const type of types) {
    const selected = sources.find(
      (source) => source?.type === type && source?.text,
    )
    if (selected?.text) return selected.text
  }
  return null
}

function mediaSummary(mediaSources = []) {
  return mediaSources.slice(0, 8).map((media) => ({
    type: media?.type || 'unknown',
    source: media?.source || 'unknown',
    hasUrl: Boolean(media?.url),
    hasBuffer: Buffer.isBuffer(media?.buffer),
    mimeType: media?.mimeType || null,
  }))
}

function sourceSummary(textSources = []) {
  return textSources.slice(0, 24).map((source) => ({
    type: source?.type || 'unknown',
    text: String(source?.text || '').slice(0, 700),
    confidence: Number(source?.confidence || 0),
    source: source?.source || 'unknown',
  }))
}

function metadataEvidenceAvailable(textSources = []) {
  return textSources.some((source) =>
    [
      'title',
      'description',
      'og_title',
      'og_description',
      'youtube_title',
      'youtube_description',
      'youtube_channel',
      'json_ld',
      'article_text',
      'thumbnail_ocr',
    ].includes(source?.type),
  )
}

function applyEvidenceValidationGate(locationQuery, evidenceValidation) {
  if (
    !(
      evidenceValidation?.applied === true ||
      (
        evidenceValidation?.requested === true &&
        evidenceValidation?.status === 'fallback'
      )
    ) ||
    evidenceValidation?.canResolveLocation !== false ||
    locationQuery?.canResolveLocation !== true
  ) {
    return locationQuery
  }
  return {
    ...locationQuery,
    query: null,
    canResolveLocation: false,
    confidence: Math.min(0.49, Number(locationQuery.confidence || 0)),
    score: Math.min(9, Number(locationQuery.score || 0)),
    reason: 'evidence_validator_rejected_location',
    strategy: 'insufficient_evidence',
    warnings: [
      ...(Array.isArray(locationQuery.warnings)
        ? locationQuery.warnings
        : []),
      'Gemini evidence validation rejected location resolution.',
    ],
  }
}

export async function analyzeFoodMapSocialDiscovery(
  {
    image = null,
    url = '',
    hint = '',
  } = {},
  dependencies = {},
) {
  const extractOcrSignals =
    dependencies.extractOcrSignals ||
    dependencies.extractLocalOcrSignals ||
    extractOcrEvidenceWithProvider
  const extractEntities =
    dependencies.extractFoodMapEntities ||
    dependencies.extractFoodMapEntitiesHybrid ||
    extractFoodMapEntitiesHybrid
  const buildLocationQuery =
    dependencies.buildFoodMapLocationQuery || buildFoodMapLocationQuery
  const resolveLocation =
    dependencies.resolveFoodMapLocation || resolveFoodMapLocation
  const integratePlace =
    dependencies.integrateResolvedFoodMapPlace ||
    integrateResolvedFoodMapPlace
  const buildNextAction =
    dependencies.buildFoodMapNextAction || buildFoodMapNextAction
  const validateEvidence =
    dependencies.validateFoodMapEvidence ||
    runFoodMapEvidenceValidation
  const cleanedUrl = cleanText(url)
  const cleanedHint = cleanText(hint)
  const resolveInput =
    dependencies.resolveSocialInput ||
    ((input) =>
      resolveSocialInput(input, {
        ...(dependencies.extractSocialUrlSignals
          ? { extractUrlSignals: dependencies.extractSocialUrlSignals }
          : {}),
        ...(dependencies.blogUrlProvider
          ? { blogProvider: dependencies.blogUrlProvider }
          : {}),
        ...(dependencies.youtubeUrlProvider
          ? { youtubeProvider: dependencies.youtubeUrlProvider }
          : {}),
        ...(dependencies.genericSocialUrlProvider
          ? { genericSocialProvider: dependencies.genericSocialUrlProvider }
          : {}),
        ...(dependencies.downloadSocialMedia
          ? { downloadMedia: dependencies.downloadSocialMedia }
          : {}),
        ...(dependencies.extractMetadataOcr
          ? { extractMetadataOcr: dependencies.extractMetadataOcr }
          : {}),
        ...(Object.hasOwn(dependencies, 'metadataOcrEnabled')
          ? { metadataOcrEnabled: dependencies.metadataOcrEnabled }
          : {}),
        providerOptions: dependencies.socialProviderOptions || {},
      }))
  const resolvedInput = await resolveInput({
    url: cleanedUrl,
    image,
    hint: cleanedHint,
  })
  const uploadedOcr = image
    ? await extractOcrSignals({ image })
    : emptyOcrEvidence()
  const metadataOcr =
    resolvedInput?.mediaOcrEvidence || emptyOcrEvidence()
  const ocrSignals = image
    ? uploadedOcr
    : metadataOcr?.usable
      ? metadataOcr
      : emptyOcrEvidence(
          resolvedInput?.debug?.metadataOcrStatus === 'disabled'
            ? 'not_provided'
            : metadataOcr?.reason || 'not_provided',
        )
  const hintSignal = cleanedHint
    ? extractTextPlaceSignal({ hint: cleanedHint })
    : null
  const resolvedTextSources = Array.isArray(resolvedInput?.textSources)
    ? resolvedInput.textSources
    : []
  const preferredTitle = sourceText(resolvedTextSources, [
    'youtube_title',
    'og_title',
    'title',
  ])
  const preferredDescription = sourceText(resolvedTextSources, [
    'youtube_description',
    'og_description',
    'description',
    'json_ld',
    'article_text',
  ])
  const inputSignals = {
    url: resolvedInput?.sourceUrl || cleanedUrl || null,
    platform: resolvedInput?.platform || null,
    title: preferredTitle,
    description: preferredDescription,
    ocrText: ocrSignals.text,
    ocrUsable:
      ocrSignals.usable === true || ocrSignals.ocrUsable === true,
    hint: cleanedHint || null,
  }
  const textSources = [
    ...resolvedTextSources,
    image && uploadedOcr.text
      ? {
          type: 'ocr',
          text: uploadedOcr.text,
          confidence: uploadedOcr.confidence,
          source: 'uploaded_image',
          usable: uploadedOcr.usable === true,
        }
      : null,
  ].filter(Boolean)
  const sourceAnalysis = {
    inputType: resolvedInput?.inputType || (image ? 'image' : 'hint_only'),
    platform: resolvedInput?.platform || 'unknown',
    provider: resolvedInput?.debug?.provider || null,
    sourceUrl: resolvedInput?.sourceUrl || cleanedUrl || null,
    hintProvided: Boolean(cleanedHint),
    textSourcesSummary: sourceSummary(textSources),
    mediaSourcesSummary: mediaSummary(resolvedInput?.mediaSources || []),
    warnings: Array.isArray(resolvedInput?.warnings)
      ? resolvedInput.warnings
      : [],
  }
  const urlExtraction = cleanedUrl
    ? {
        status: resolvedInput?.debug?.extractionStatus || 'unknown',
        finalUrl: resolvedInput?.sourceUrl || cleanedUrl,
        canonicalUrl: resolvedInput?.debug?.canonicalUrl || null,
        siteName: resolvedInput?.debug?.siteName || null,
        warnings: sourceAnalysis.warnings,
      }
    : null
  const urlEvidence = cleanedUrl
    ? resolvedInput?.debug?.urlEvidence || {
        platform: sourceAnalysis.platform,
        provider: sourceAnalysis.provider,
        resolvedInputType: sourceAnalysis.inputType,
        extractionStatus: urlExtraction?.status || 'unknown',
        videoId: resolvedInput?.debug?.videoId || null,
        title: preferredTitle,
        description: preferredDescription,
        channelTitle: sourceText(resolvedTextSources, ['youtube_channel']),
        publishedAt: sourceText(resolvedTextSources, [
          'youtube_published_at',
        ]),
        ogTitle: sourceText(resolvedTextSources, ['og_title']),
        ogDescription: sourceText(resolvedTextSources, ['og_description']),
        jsonLdEvidence: resolvedTextSources
          .filter((source) => source?.type === 'json_ld')
          .map((source) => source.text)
          .slice(0, 5),
        thumbnailUrl:
          resolvedInput?.mediaSources?.find((media) =>
            ['thumbnail', 'og_image'].includes(media?.type),
          )?.url || null,
        thumbnailOcrStatus:
          resolvedInput?.debug?.metadataOcrStatus || 'not_available',
        warnings: sourceAnalysis.warnings,
      }
    : null
  const ruleEntities = await extractEntities({
    inputSignals,
    ocrEvidence: ocrSignals,
    textSources,
    debug: {
      urlExtraction,
      sourceAnalysis,
    },
  })
  const draftLocationQuery = buildLocationQuery({
    entities: ruleEntities,
    finalOcrEvidence: ocrSignals,
    textSources,
    metadata: {
      title: preferredTitle,
      description: preferredDescription,
    },
    userHint: cleanedHint || null,
  })
  const evidenceValidation = await validateEvidence(
    {
      inputType: sourceAnalysis.inputType,
      platform: sourceAnalysis.platform,
      urlEvidence,
      textSources,
      ocrEvidence: ocrSignals,
      ruleEntities,
      draftLocationQuery,
    },
    {
      ...(Object.hasOwn(dependencies, 'evidenceValidatorMode')
        ? { mode: dependencies.evidenceValidatorMode }
        : {}),
      geminiOptions:
        dependencies.geminiEvidenceValidationOptions || {},
    },
  )
  const entities = evidenceValidation?.entities || ruleEntities
  const rebuiltLocationQuery = buildLocationQuery({
    entities,
    finalOcrEvidence: ocrSignals,
    textSources,
    metadata: {
      title: preferredTitle,
      description: preferredDescription,
    },
    userHint: cleanedHint || null,
  })
  const locationQuery = applyEvidenceValidationGate(
    rebuiltLocationQuery,
    evidenceValidation,
  )
  const locationResolution = locationQuery.canResolveLocation
    ? await resolveLocation({
        locationQuery,
        entities,
      })
    : {
        status: 'provider_disabled',
        resolvedLocation: null,
        candidates: [],
        confidence: 0,
        reason: 'location_query_not_ready',
        warnings: [],
      }
  const integration =
    locationResolution.status === 'resolved'
      ? await integratePlace({
          locationResolution,
          entities,
          locationQuery,
          sourceType: image ? 'image' : cleanedUrl ? 'url' : 'hint',
          sourceUrl: resolvedInput?.sourceUrl || cleanedUrl || null,
          sourceImageUrl:
            resolvedInput?.mediaSources?.find((media) => media?.url)?.url ||
            null,
        })
      : {
          action: 'none',
          matchedPlace: null,
          draftPlace: null,
          reason: 'location_not_resolved',
        }
  const nextAction = buildNextAction({
    integration,
    locationResolution,
    locationQuery,
    entities,
    ocrEvidence: ocrSignals,
    metadataOcrEvidence: metadataOcr,
    imageProvided: Boolean(image),
    sourceAnalysis,
    evidenceValidation,
  })
  const hasReliableEntities = entities.status !== 'unclear'
  const entitySteps = [
    'social_input_resolved',
    cleanedUrl
      ? `social_provider_${resolvedInput?.debug?.provider || 'unknown'}`
      : null,
    image ? 'uploaded_image_received' : null,
    resolvedInput?.debug?.metadataOcrStatus === 'usable'
      ? 'metadata_image_ocr_completed'
      : null,
    'entity_extraction_started',
    hasReliableEntities
      ? 'entity_extraction_completed'
      : 'entity_extraction_no_reliable_entities',
    evidenceValidation?.requested
      ? `evidence_validation_${evidenceValidation.status}`
      : null,
    locationQuery.canResolveLocation
      ? 'location_query_ready'
      : 'location_query_insufficient_evidence',
    locationQuery.canResolveLocation
      ? `location_resolution_${locationResolution.status}`
      : null,
    integration.action !== 'none' ? integration.action : null,
  ].filter(Boolean)
  const warnings = [
    ...sourceAnalysis.warnings,
    ...(Array.isArray(uploadedOcr.warnings) ? uploadedOcr.warnings : []),
    ...(Array.isArray(metadataOcr.warnings) ? metadataOcr.warnings : []),
    ...(Array.isArray(entities.warnings) ? entities.warnings : []),
    ...(Array.isArray(evidenceValidation?.warnings)
      ? evidenceValidation.warnings
      : []),
    ...(Array.isArray(locationResolution.warnings)
      ? locationResolution.warnings
      : []),
    ...(locationResolution.status === 'provider_disabled'
      ? ['Location resolution provider is disabled.']
      : []),
  ]
  const resolvedStatus =
    integration.action === 'focus_existing_place'
      ? 'place_found_in_foodmap'
      : integration.action === 'review_draft_place'
        ? 'place_found_not_in_foodmap'
        : null
  const common = {
    confidence: hasReliableEntities ? entities.confidence : 0,
    inputSignals,
    placeReason:
      integration.reason || 'No confirmed Food Map place match was produced.',
    dishReason:
      'Dish names are exposed under entities.dishNames only; visual dish fallback remains disabled.',
    urlExtraction,
    urlEvidence,
    evidenceValidation,
    sourceAnalysis,
    ocrEvidence: ocrSignals,
    textSources,
    entities,
    locationQuery,
    locationResolution,
    nextAction,
    matchedPlace: integration.matchedPlace,
    draftPlace: integration.draftPlace,
  }
  const ocrStep = image
    ? inputSignals.ocrUsable
      ? 'local_ocr_completed'
      : 'local_ocr_no_reliable_text'
    : null
  const statusForEvidence = (fallbackStatus) =>
    resolvedStatus || (hasReliableEntities ? entities.status : fallbackStatus)
  const confidenceForEvidence = (fallbackConfidence = 0) =>
    hasReliableEntities ? entities.confidence : fallbackConfidence
  const messageForEvidence = (fallbackMessage) => {
    if (entities.status === 'address_found') {
      return 'I extracted a likely address from the available evidence.'
    }
    if (entities.status === 'place_name_found') {
      return 'I extracted a likely place name from the available evidence.'
    }
    if (entities.status === 'dish_only') {
      return 'I found dish evidence, but not enough reliable place evidence yet.'
    }
    return fallbackMessage
  }
  const hasUrlEvidence = metadataEvidenceAvailable(resolvedTextSources)

  if (cleanedUrl && hasUrlEvidence) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('unclear'),
      confidence: confidenceForEvidence(0.2),
      message: messageForEvidence(
        image
          ? 'I extracted public URL information and image evidence.'
          : 'I extracted public information from this URL.',
      ),
      steps: [
        'input_validated',
        'url_received',
        'public_url_metadata_extracted',
        ocrStep,
        ...entitySteps,
      ].filter(Boolean),
      warnings,
    })
  }

  if (image) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('unclear'),
      confidence: confidenceForEvidence(0),
      message: messageForEvidence(
        inputSignals.ocrUsable
          ? 'I extracted OCR evidence from this image.'
          : 'I could not find reliable text in this image. Upload a clearer screenshot or add a hint.',
      ),
      steps: ['input_validated', ocrStep, ...entitySteps].filter(Boolean),
      warnings,
    })
  }

  if (cleanedUrl) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('needs_screenshot_or_hint'),
      confidence: confidenceForEvidence(0),
      message: messageForEvidence(
        'I could not extract enough public information from this URL. Add a restaurant or area hint, or upload a clear screenshot.',
      ),
      steps: [
        'input_validated',
        'url_received',
        `url_metadata_${resolvedInput?.debug?.extractionStatus || 'fetch_failed'}`,
        ...entitySteps,
      ].filter(Boolean),
      warnings,
    })
  }

  return createFoodMapSocialResponse({
    ...common,
    status: statusForEvidence('unclear'),
    confidence: confidenceForEvidence(0),
    message: messageForEvidence(
      'The hint is not enough to identify a reliable place yet. Add a URL or upload a screenshot.',
    ),
    steps: [
      'input_validated',
      hintSignal?.usable
        ? 'explicit_hint_noted_for_part_4'
        : 'hint_received',
      ...entitySteps,
    ],
    warnings,
  })
}
