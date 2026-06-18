import { extractFoodMapEntities } from './foodMapEntityExtractionService.js'
import { buildFoodMapLocationQuery } from './foodMapLocationQueryService.js'
import { extractLocalOcrSignals } from './localOcrService.js'
import {
  createFoodMapSocialResponse,
} from './foodMapSocialDecisionService.js'
import { extractSocialUrlSignals } from './socialUrlExtractionService.js'
import { extractTextPlaceSignal } from './textPlaceSignalExtractor.js'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function analyzeFoodMapSocialDiscovery({
  image = null,
  url = '',
  hint = '',
} = {}, dependencies = {}) {
  const extractUrlSignals =
    dependencies.extractSocialUrlSignals || extractSocialUrlSignals
  const extractOcrSignals =
    dependencies.extractLocalOcrSignals || extractLocalOcrSignals
  const extractEntities =
    dependencies.extractFoodMapEntities || extractFoodMapEntities
  const buildLocationQuery =
    dependencies.buildFoodMapLocationQuery || buildFoodMapLocationQuery
  const cleanedUrl = cleanText(url)
  const cleanedHint = cleanText(hint)
  const urlSignals = cleanedUrl
    ? await extractUrlSignals({ url: cleanedUrl })
    : {
        finalUrl: null,
        platform: null,
        title: null,
        description: null,
        ogTitle: null,
        ogDescription: null,
        twitterTitle: null,
        twitterDescription: null,
        extractionStatus: null,
        warnings: [],
      }
  const ocrSignals = image
    ? await extractOcrSignals({ image })
    : {
        text: null,
        usable: false,
        ocrUsable: false,
        confidence: 0,
        reason: 'not_provided',
        lines: [],
        warnings: [],
        debug: { implemented: false },
        implemented: false,
      }
  const hintSignal = cleanedHint
    ? extractTextPlaceSignal({ hint: cleanedHint })
    : null

  const preferredTitle =
    urlSignals.ogTitle || urlSignals.twitterTitle || urlSignals.title || null
  const preferredDescription =
    urlSignals.ogDescription ||
    urlSignals.twitterDescription ||
    urlSignals.description ||
    null
  const inputSignals = {
    url: cleanedUrl || null,
    platform: urlSignals.platform,
    title: preferredTitle,
    description: preferredDescription,
    ocrText: ocrSignals.text,
    ocrUsable: ocrSignals.usable === true || ocrSignals.ocrUsable === true,
    hint: cleanedHint || null,
  }
  const textSources = [
    cleanedHint
      ? {
          type: 'hint',
          text: cleanedHint,
          confidence: hintSignal?.usable ? hintSignal.confidence : 0,
          usable: true,
        }
      : null,
    preferredTitle
      ? {
          type: 'url_title',
          text: preferredTitle,
          confidence: 0.2,
          usable: true,
        }
      : null,
    preferredDescription
      ? {
          type: 'url_description',
          text: preferredDescription,
          confidence: 0.2,
          usable: true,
        }
      : null,
    urlSignals.rawTextSnippet
      ? {
          type: 'url_visible_text',
          text: urlSignals.rawTextSnippet,
          confidence: 0.15,
          usable: true,
        }
      : null,
    ocrSignals.text
      ? {
          type: 'ocr',
          text: ocrSignals.text,
          confidence: ocrSignals.confidence,
          usable: inputSignals.ocrUsable,
        }
      : null,
  ].filter(Boolean)
  const urlExtraction = cleanedUrl
    ? {
        status: urlSignals.extractionStatus,
        finalUrl: urlSignals.finalUrl || null,
        canonicalUrl: urlSignals.canonicalUrl || null,
        siteName: urlSignals.siteName || null,
        warnings: Array.isArray(urlSignals.warnings)
          ? urlSignals.warnings
          : [],
      }
    : null
  const entities = extractEntities({
    inputSignals,
    ocrEvidence: ocrSignals,
    textSources,
    debug: {
      urlExtraction,
    },
  })
  const locationQuery = buildLocationQuery(entities)
  const hasReliableEntities = entities.status !== 'unclear'
  const entitySteps = [
    'entity_extraction_started',
    hasReliableEntities
      ? 'entity_extraction_completed'
      : 'entity_extraction_no_reliable_entities',
    locationQuery.canResolveLocation
      ? 'location_query_ready'
      : 'location_query_insufficient_evidence',
  ]
  const entityWarnings = [
    ...(Array.isArray(entities.warnings) ? entities.warnings : []),
    'No Food Map database matching, geocoding, or draft creation was performed.',
  ]
  const common = {
    confidence: hasReliableEntities ? entities.confidence : 0,
    inputSignals,
    placeReason:
      'Phase 4 extracted text entities only. Food Map matching is planned for Phase 5.',
    dishReason:
      'Dish names are exposed under entities.dishNames only; visual dish fallback remains disabled.',
    urlExtraction,
    ocrEvidence: ocrSignals,
    textSources,
    entities,
    locationQuery,
  }
  const ocrStep = image
    ? inputSignals.ocrUsable
      ? 'local_ocr_completed'
      : 'local_ocr_no_reliable_text'
    : null
  const ocrWarnings = image && Array.isArray(ocrSignals.warnings)
    ? ocrSignals.warnings
    : []

  const statusForEvidence = (fallbackStatus) =>
    hasReliableEntities ? entities.status : fallbackStatus
  const confidenceForEvidence = (fallbackConfidence = 0) =>
    hasReliableEntities ? entities.confidence : fallbackConfidence
  const messageForEvidence = (fallbackMessage) => {
    if (entities.status === 'address_found') {
      return 'I extracted a likely address from the available text evidence. Food Map matching and geocoding are not part of this phase.'
    }
    if (entities.status === 'place_name_found') {
      return 'I extracted a likely place name from the available text evidence. Food Map matching is not part of this phase.'
    }
    if (entities.status === 'dish_only') {
      return 'I extracted likely dish text from the available evidence, but not a reliable place name or address yet.'
    }
    return fallbackMessage
  }

  if (
    cleanedUrl &&
    urlSignals.extractionStatus === 'success' &&
    (preferredTitle || preferredDescription)
  ) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('unclear'),
      confidence: confidenceForEvidence(0.2),
      message: messageForEvidence(
        image
          ? 'I extracted public URL information and local OCR evidence, but no reliable entity yet.'
          : 'I extracted some public information from this URL, but no reliable entity yet.',
      ),
      steps: [
        'input_validated',
        'url_received',
        'public_url_metadata_extracted',
        image ? 'image_received' : null,
        ocrStep,
        cleanedHint ? 'hint_retained_for_later_matching' : null,
        ...entitySteps,
      ].filter(Boolean),
      warnings: [
        ...(urlSignals.warnings || []),
        ...ocrWarnings,
        ...entityWarnings,
      ],
    })
  }

  if (image) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('unclear'),
      confidence: confidenceForEvidence(0),
      message: messageForEvidence(
        inputSignals.ocrUsable
          ? 'I extracted local OCR evidence from this image, but no reliable entity yet.'
          : 'I could not find reliable text in this image. Upload a clearer screenshot or add a hint.',
      ),
      steps: ['input_validated', 'image_received', ocrStep, ...entitySteps],
      warnings: [
        ...ocrWarnings,
        ...entityWarnings,
      ],
    })
  }

  if (cleanedUrl) {
    return createFoodMapSocialResponse({
      ...common,
      status: statusForEvidence('needs_screenshot_or_hint'),
      confidence: confidenceForEvidence(0),
      message: messageForEvidence(
        'I could not extract useful public information from this URL. Upload a screenshot or type the restaurant name.',
      ),
      steps: [
        'input_validated',
        'url_received',
        `url_metadata_${urlSignals.extractionStatus || 'fetch_failed'}`,
        cleanedHint ? 'hint_retained_for_later_matching' : null,
        ...entitySteps,
      ].filter(Boolean),
      warnings: [
        ...(urlSignals.warnings || []),
        ...entityWarnings,
      ],
    })
  }

  return createFoodMapSocialResponse({
    ...common,
    status: statusForEvidence('unclear'),
    confidence: confidenceForEvidence(0),
    message: messageForEvidence(
      'The hint is not enough to identify a reliable entity yet. Add a social URL or upload a screenshot.',
    ),
    steps: [
      'input_validated',
      hintSignal?.usable
        ? 'explicit_hint_noted_for_part_4'
        : 'hint_received',
      ...entitySteps,
    ],
    warnings: [
      ...entityWarnings,
    ],
  })
}
