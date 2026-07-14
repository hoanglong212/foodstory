import {
  buildLocalOcrEvidenceFromProviderResult,
} from '../localOcrService.js'
import {
  applyFinalOcrEvidenceSelection,
} from '../foodMapOcrEvidenceSelector.js'
import { runGoogleVisionOcrProvider } from './googleVisionOcrProvider.js'
import { runTesseractOcrProvider } from './tesseractOcrProvider.js'

const PROVIDERS = new Set(['google_vision', 'tesseract', 'hybrid'])

function configuredProvider(value = process.env.OCR_PROVIDER) {
  const provider = String(value || 'tesseract').trim().toLowerCase()
  return PROVIDERS.has(provider) ? provider : 'tesseract'
}

function fallbackEnabled(value = process.env.OCR_FALLBACK_TO_TESSERACT) {
  if (value === undefined || value === null || value === '') return true
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase())
}

function providerEvidence(result) {
  if (result?.evidence) return result.evidence
  return buildLocalOcrEvidenceFromProviderResult(result)
}

function resultUsable(result) {
  return providerEvidence(result)?.usable === true
}

function fallbackReason(result) {
  const status = result?.debug?.providerStatus
  if (status && !['ok', 'success'].includes(status)) return status
  return result?.lines?.length ? 'low_quality_output' : 'empty_output'
}

export async function runOcrProvider(
  { image } = {},
  {
    provider = configuredProvider(),
    fallbackToTesseract = fallbackEnabled(),
    googleVisionProvider = runGoogleVisionOcrProvider,
    tesseractProvider = runTesseractOcrProvider,
    googleVisionOptions = {},
    tesseractOptions = {},
  } = {},
) {
  const selectedProvider = configuredProvider(provider)
  if (selectedProvider === 'tesseract') {
    const result = await tesseractProvider(
      { image },
      tesseractOptions,
    )
    return {
      ...result,
      debug: {
        ...(result.debug || {}),
        providerUsed: 'tesseract',
        fallbackReason: null,
      },
    }
  }

  const googleVision = await googleVisionProvider(
    { image },
    googleVisionOptions,
  )
  if (resultUsable(googleVision)) {
    return {
      ...googleVision,
      debug: {
        ...(googleVision.debug || {}),
        providerUsed: 'google_vision',
        fallbackReason: null,
      },
    }
  }

  if (!fallbackToTesseract) {
    return {
      ...googleVision,
      debug: {
        ...(googleVision.debug || {}),
        providerUsed: 'google_vision',
        fallbackReason: null,
      },
    }
  }

  const reason = fallbackReason(googleVision)
  const tesseract = await tesseractProvider(
    { image },
    tesseractOptions,
  )
  return {
    ...tesseract,
    debug: {
      ...(tesseract.debug || {}),
      providerUsed: 'tesseract',
      fallbackReason: reason,
      attemptedProvider: 'google_vision',
    },
  }
}

export async function extractOcrEvidenceWithProvider(
  { image } = {},
  options = {},
) {
  const result = await runOcrProvider({ image }, options)
  const evidence = applyFinalOcrEvidenceSelection(
    providerEvidence(result),
    result?.debug?.providerUsed || result?.provider || null,
  )

  return {
    ...evidence,
    debug: {
      ...(evidence.debug || {}),
      providerMode: configuredProvider(options.provider),
      providerUsed:
        result?.debug?.providerUsed || result?.provider || 'tesseract',
      fallbackReason: result?.debug?.fallbackReason || null,
      providerStatus: result?.debug?.providerStatus || null,
      providerDurationMs: Number(result?.debug?.durationMs || 0),
    },
  }
}

export {
  configuredProvider,
  runGoogleVisionOcrProvider,
  runTesseractOcrProvider,
}
