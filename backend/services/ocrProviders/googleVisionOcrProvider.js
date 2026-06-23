import { existsSync, statSync } from 'node:fs'

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_PROVIDER_LINES = 120
const MAX_RAW_TEXT_LENGTH = 6_000
const FEATURES = new Set([
  'document_text_detection',
  'text_detection',
])

let sharedClientPromise = null

function roundScore(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const normalized = number > 1 ? number / 100 : number
  return Math.round(Math.max(0, Math.min(1, normalized)) * 1000) / 1000
}

function cleanText(value, maximumLength = 300) {
  const text = String(value || '')
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength).trim()}...`
}

function configuredFeature(value = process.env.GOOGLE_VISION_FEATURE) {
  const feature = String(value || 'document_text_detection')
    .trim()
    .toLowerCase()
  return FEATURES.has(feature) ? feature : 'document_text_detection'
}

function credentialsConfigured({
  client,
  credentialsAvailable,
} = {}) {
  if (client) return true
  if (typeof credentialsAvailable === 'boolean') {
    return credentialsAvailable
  }
  const credentialPath = String(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  ).trim()
  if (credentialPath) {
    try {
      return existsSync(credentialPath) && statSync(credentialPath).isFile()
    } catch {
      return false
    }
  }
  return Boolean(
    String(process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
      String(process.env.GCLOUD_PROJECT || '').trim(),
  )
}

function safeResult(providerStatus, feature, durationMs = 0) {
  return {
    provider: 'google_vision',
    rawText: '',
    lines: [],
    debug: {
      durationMs,
      providerStatus,
      feature,
    },
  }
}

function normalizeBox(value) {
  const vertices = Array.isArray(value?.vertices)
    ? value.vertices
    : Array.isArray(value?.normalizedVertices)
      ? value.normalizedVertices
      : []
  if (vertices.length !== 4) return null
  const points = vertices.map((vertex) => {
    const x = Number(vertex?.x ?? 0)
    const y = Number(vertex?.y ?? 0)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  })
  return points.every(Boolean) ? points : null
}

function combinedBox(boxes) {
  const points = boxes.flat().filter(Boolean)
  if (!points.length) return null
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

function wordText(word) {
  return (word?.symbols || [])
    .map((symbol) => symbol?.text || '')
    .join('')
    .trim()
}

function wordBreak(word) {
  const symbols = Array.isArray(word?.symbols) ? word.symbols : []
  const last = symbols[symbols.length - 1]
  return String(last?.property?.detectedBreak?.type || '').toUpperCase()
}

function fullTextLines(fullTextAnnotation) {
  const lines = []
  let current = []

  const flush = () => {
    if (!current.length) return
    const text = current.map((item) => item.text).join(' ').trim()
    if (text) {
      const confidences = current
        .map((item) => item.confidence)
        .filter((value) => value !== null)
      lines.push({
        text: cleanText(text),
        confidence: confidences.length
          ? roundScore(
              confidences.reduce((sum, value) => sum + value, 0) /
                confidences.length,
            )
          : null,
        box: combinedBox(current.map((item) => item.box).filter(Boolean)),
        sourcePass: 'google_vision_full_text',
      })
    }
    current = []
  }

  for (const page of fullTextAnnotation?.pages || []) {
    for (const block of page?.blocks || []) {
      for (const paragraph of block?.paragraphs || []) {
        for (const word of paragraph?.words || []) {
          const text = wordText(word)
          if (!text) continue
          current.push({
            text,
            confidence: roundScore(word?.confidence),
            box: normalizeBox(word?.boundingBox || word?.boundingPoly),
          })
          if (
            ['LINE_BREAK', 'EOL_SURE'].includes(wordBreak(word))
          ) {
            flush()
          }
        }
        flush()
      }
      flush()
    }
    flush()
  }
  return lines
}

function textAnnotationLines(textAnnotations = []) {
  const rawText = String(textAnnotations?.[0]?.description || '')
  return rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((text) => cleanText(text))
    .filter(Boolean)
    .slice(0, MAX_PROVIDER_LINES)
    .map((text) => ({
      text,
      confidence: null,
      box: null,
      sourcePass: 'google_vision_text_annotations',
    }))
}

export function normalizeGoogleVisionResponse(response = {}) {
  const fullTextAnnotation = response?.fullTextAnnotation || null
  const textAnnotations = Array.isArray(response?.textAnnotations)
    ? response.textAnnotations
    : []
  const rawText = cleanText(
    fullTextAnnotation?.text || textAnnotations?.[0]?.description || '',
    MAX_RAW_TEXT_LENGTH,
  )
  const lines = (
    fullTextAnnotation
      ? fullTextLines(fullTextAnnotation)
      : textAnnotationLines(textAnnotations)
  )
    .filter((line) => line.text)
    .slice(0, MAX_PROVIDER_LINES)

  return { rawText, lines }
}

async function defaultClientFactory() {
  if (!sharedClientPromise) {
    sharedClientPromise = import('@google-cloud/vision')
      .then((module) => {
        const vision = module.default || module
        return new vision.ImageAnnotatorClient({
          ...(process.env.GOOGLE_CLOUD_PROJECT
            ? { projectId: process.env.GOOGLE_CLOUD_PROJECT }
            : {}),
        })
      })
      .catch((error) => {
        sharedClientPromise = null
        throw error
      })
  }
  return sharedClientPromise
}

function withTimeout(promise, timeoutMs) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Google Vision OCR timed out.')
      error.code = 'timeout'
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function missingCredentialError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === 'missing_credentials' ||
    error?.code === 401 ||
    message.includes('could not load the default credentials') ||
    message.includes('default credentials') ||
    message.includes('unauthenticated')
  )
}

export async function runGoogleVisionOcrProvider(
  { image } = {},
  {
    client = null,
    clientFactory = defaultClientFactory,
    credentialsAvailable,
    timeoutMs = Number(
      process.env.GOOGLE_VISION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
    feature = configuredFeature(),
  } = {},
) {
  const selectedFeature = configuredFeature(feature)
  if (
    !image?.buffer ||
    !Buffer.isBuffer(image.buffer) ||
    image.buffer.length === 0
  ) {
    return safeResult('error', selectedFeature)
  }
  if (!credentialsConfigured({ client, credentialsAvailable })) {
    return safeResult('missing_credentials', selectedFeature)
  }

  const startedAt = Date.now()
  try {
    const visionClient = client || (await clientFactory())
    const method =
      selectedFeature === 'text_detection'
        ? 'textDetection'
        : 'documentTextDetection'
    const request = {
      image: {
        content: image.buffer,
      },
    }
    const response = await withTimeout(
      visionClient[method](request, {
        timeout: Math.max(100, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
      }),
      Math.max(100, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
    )
    const annotation = Array.isArray(response) ? response[0] : response
    if (annotation?.error?.message) {
      const error = new Error(annotation.error.message)
      error.code = annotation.error.code || 'provider_error'
      throw error
    }
    const normalized = normalizeGoogleVisionResponse(annotation)

    return {
      provider: 'google_vision',
      rawText: normalized.rawText,
      lines: normalized.lines,
      debug: {
        durationMs: Date.now() - startedAt,
        providerStatus:
          normalized.rawText || normalized.lines.length ? 'ok' : 'empty',
        feature: selectedFeature,
      },
    }
  } catch (error) {
    return safeResult(
      error?.code === 'timeout'
        ? 'timeout'
        : missingCredentialError(error)
          ? 'missing_credentials'
          : 'error',
      selectedFeature,
      Date.now() - startedAt,
    )
  }
}

export {
  configuredFeature as configuredGoogleVisionFeature,
  credentialsConfigured as googleVisionCredentialsConfigured,
}

export default runGoogleVisionOcrProvider
