import { identifyDishFallback } from './dishFallbackService.js'
import { lookupExternalPlace } from './externalPlaceLookupService.js'
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
    ? await extractLocalOcrSignals({ image })
    : {
        text: null,
        ocrUsable: false,
        confidence: 0,
        implemented: false,
      }
  const hintSignal = cleanedHint
    ? extractTextPlaceSignal({ hint: cleanedHint })
    : null

  // These boundaries remain no-op placeholders so URL metadata cannot be
  // mistaken for a verified place or dish in Part 2.
  const [externalLookup, dishFallback] = await Promise.all([
    lookupExternalPlace({
      urlSignals,
      ocrSignals,
      hintSignal,
    }),
    identifyDishFallback({ image }),
  ])

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
    ocrUsable: ocrSignals.ocrUsable,
    hint: cleanedHint || null,
  }
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
  const common = {
    confidence: 0,
    inputSignals,
    placeReason: externalLookup.reason,
    dishReason: dishFallback.reason,
    urlExtraction,
  }

  if (
    cleanedUrl &&
    urlSignals.extractionStatus === 'success' &&
    (preferredTitle || preferredDescription)
  ) {
    return createFoodMapSocialResponse({
      ...common,
      status: 'unclear',
      confidence: 0.2,
      message:
        'I extracted some public information from this URL. Place matching will be handled in the next step.',
      steps: [
        'input_validated',
        'url_received',
        'public_url_metadata_extracted',
        cleanedHint ? 'hint_retained_for_later_matching' : null,
      ].filter(Boolean),
      warnings: [
        ...(urlSignals.warnings || []),
        'No place or dish claim was made from URL metadata.',
      ],
    })
  }

  if (image) {
    return createFoodMapSocialResponse({
      ...common,
      status: 'unclear',
      message:
        'Image and screenshot analysis is not available yet. OCR support will be added in Part 3.',
      steps: ['input_validated', 'image_received', 'ocr_deferred_part_3'],
      warnings: [
        'No image inference was run, so no place or dish claim was made.',
      ],
    })
  }

  if (cleanedUrl) {
    return createFoodMapSocialResponse({
      ...common,
      status: 'needs_screenshot_or_hint',
      message:
        'I could not extract useful public information from this URL. Upload a screenshot or type the restaurant name.',
      steps: [
        'input_validated',
        'url_received',
        `url_metadata_${urlSignals.extractionStatus || 'fetch_failed'}`,
        cleanedHint ? 'hint_retained_for_later_matching' : null,
      ].filter(Boolean),
      warnings: [
        ...(urlSignals.warnings || []),
        'No place or dish claim was made from this URL.',
      ],
    })
  }

  return createFoodMapSocialResponse({
    ...common,
    status: 'unclear',
    message:
      'The hint is not enough to verify a place yet. Add a social URL or upload a screenshot.',
    steps: [
      'input_validated',
      hintSignal?.usable
        ? 'explicit_hint_noted_for_part_4'
        : 'hint_received',
    ],
    warnings: [
      'Hint text was retained as an input signal but was not treated as a verified place.',
    ],
  })
}
