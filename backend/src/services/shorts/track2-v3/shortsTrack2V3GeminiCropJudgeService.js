import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import {
  createShortsTrack2V3GeminiRequestScheduler,
} from './shortsTrack2V3GeminiRequestSchedulerService.js'

const CROPS_PER_PAGE = 48
const CONTACT_SHEET_COLUMNS = 4
const TILE_WIDTH = 320
const TILE_HEIGHT = 235
const THUMB_WIDTH = 300
const THUMB_HEIGHT = 178
const MIN_GEMINI_CONTACT_SHEET_WIDTH = 900

export const SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions'
export const SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE = 'INTERACTIONS'
const GEMINI_CROP_JUDGE_MIME_TYPE = 'image/jpeg'

export const SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROVIDER = 'gemini'

export const SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES = Object.freeze({
  COMPLETE_SUCCESS: 'GEMINI_COMPLETE_SUCCESS',
  PARTIAL_PAGE_SUCCESS: 'GEMINI_PARTIAL_PAGE_SUCCESS',
  COMPLETE_PROVIDER_FAILURE: 'GEMINI_COMPLETE_PROVIDER_FAILURE',
  NO_LIKELY_ADDRESS_CROP: 'GEMINI_NO_LIKELY_ADDRESS_CROP',
})

export const SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES = Object.freeze({
  RATE_LIMITED: 'GEMINI_RATE_LIMITED',
  PROVIDER_TIMEOUT: 'GEMINI_PROVIDER_TIMEOUT',
  PROVIDER_SERVER_ERROR: 'GEMINI_PROVIDER_SERVER_ERROR',
  PROVIDER_CLIENT_ERROR: 'GEMINI_PROVIDER_CLIENT_ERROR',
  PROVIDER_UNAVAILABLE: 'GEMINI_PROVIDER_UNAVAILABLE',
  RESPONSE_INVALID: 'GEMINI_RESPONSE_INVALID',
  RESPONSE_SCHEMA_INVALID: 'GEMINI_RESPONSE_SCHEMA_INVALID',
  PAGE_PAYLOAD_TOO_LARGE: 'GEMINI_PAGE_PAYLOAD_TOO_LARGE',
})

export const SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT = `You are selecting image crops for OCR.
You will see a contact sheet of numbered crops from a Vietnamese food video.
Return only crop IDs that likely contain a visible address or location line.

Look for:
- house numbers
- street names
- P. / Phường
- Q. / Quận
- Đ. / Đường
- Vietnamese address-like text
- address strips overlaid on screen

Do not extract the address.
Do not infer missing text.
Do not guess.
Do not select food-only, price-only, phone-only, title-only, or face-only crops.
Return JSON only.

Expected JSON:
{
  "selectedCropIds": ["crop-273", "crop-277"]
}`

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function uniqueStrings(values = [], limit = 100) {
  const seen = new Set()
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const clean = safeString(value, 200)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    result.push(clean)
    if (result.length >= limit) break
  }
  return result
}

function xmlEscape(value) {
  return safeString(value, 500)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

function normalizeConfig(config = {}) {
  return {
    enabled: config.track2V3GeminiCropJudgeEnabled === true,
    model: safeString(config.geminiCropJudgeModel, 120) || 'gemini-3.5-flash',
    maxPages: boundedInteger(config.geminiCropJudgeMaxPages, 6, { min: 1, max: 20 }),
    maxSelectedCrops: boundedInteger(config.geminiCropJudgeMaxSelectedCrops, 8, {
      min: 1,
      max: 60,
    }),
    timeoutMs: boundedInteger(config.geminiCropJudgeTimeoutMs, 60000, {
      min: 1000,
      max: 180000,
    }),
    maxRequestBytes: boundedInteger(config.geminiCropJudgeMaxRequestBytes, 12000000, {
      min: 1024,
      max: 19000000,
    }),
    maxImageBytes: boundedInteger(config.geminiCropJudgeMaxImageBytes, 4000000, {
      min: 1024,
      max: 12000000,
    }),
    jpegQuality: boundedInteger(config.geminiCropJudgeJpegQuality, 80, {
      min: 40,
      max: 95,
    }),
    maxConcurrency: boundedInteger(config.geminiCropJudgeMaxConcurrency, 1, {
      min: 1,
      max: 8,
    }),
    maxAttempts: boundedInteger(config.geminiCropJudgeMaxAttempts, 3, {
      min: 1,
      max: 5,
    }),
    retryBaseDelayMs: boundedInteger(config.geminiCropJudgeRetryBaseDelayMs, 2000, {
      min: 0,
      max: 30000,
    }),
    retryMaxDelayMs: boundedInteger(config.geminiCropJudgeRetryMaxDelayMs, 30000, {
      min: 0,
      max: 120000,
    }),
  }
}

function extractGeminiResponseText(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && Array.isArray(value.selectedCropIds)) {
    return JSON.stringify(value)
  }
  const outputText = safeString(value?.output_text, 20000)
  if (outputText) return outputText
  const stepText = (Array.isArray(value?.steps) ? value.steps : [])
    .flatMap((step) => Array.isArray(step?.content) ? step.content : [])
    .map((content) => safeString(content?.text, 20000))
    .filter(Boolean)
    .join('\n')
  if (stepText) return stepText
  const parts = value?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => safeString(part?.text, 10000)).filter(Boolean).join('\n')
}

export function parseShortsTrack2V3GeminiCropJudgeResponse(value) {
  const raw = extractGeminiResponseText(value)
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim()
  if (!raw) throw new Error('GEMINI_CROP_JUDGE_EMPTY_RESPONSE')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('GEMINI_CROP_JUDGE_INVALID_JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GEMINI_CROP_JUDGE_INVALID_JSON')
  }
  if (!Array.isArray(parsed.selectedCropIds)) {
    throw new Error('GEMINI_CROP_JUDGE_SCHEMA_INVALID')
  }

  return {
    selectedCropIds: uniqueStrings(parsed.selectedCropIds, 100),
  }
}

export function validateShortsTrack2V3GeminiCropIds({
  selectedCropIds = [],
  availableCrops = [],
  maxSelectedCrops = 8,
} = {}) {
  const cropsById = new Map(
    (Array.isArray(availableCrops) ? availableCrops : [])
      .map((crop) => [safeString(crop?.cropId, 200), crop])
      .filter(([cropId]) => cropId),
  )
  const requested = uniqueStrings(selectedCropIds, 200)
  const validCropIds = []
  const rejectedCropIds = []
  const cap = boundedInteger(maxSelectedCrops, 8, { min: 1, max: 60 })

  for (const cropId of requested) {
    if (!cropsById.has(cropId) || validCropIds.length >= cap) {
      rejectedCropIds.push(cropId)
      continue
    }
    validCropIds.push(cropId)
  }

  return {
    validCropIds,
    rejectedCropIds,
    selectedCrops: validCropIds.map((cropId) => cropsById.get(cropId)),
  }
}

function cropPath(crop = {}, outputDir = '') {
  const value = safeString(crop.cropPath || crop.imagePath || crop.path, 2000)
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.resolve(outputDir, value)
}

function normalizeCrops(crops = [], outputDir = '') {
  const seen = new Set()
  return (Array.isArray(crops) ? crops : []).map((crop, index) => {
    const cropId = safeString(crop?.cropId, 200)
    const imagePath = cropPath(crop, outputDir)
    if (!cropId || !imagePath || seen.has(cropId)) return null
    seen.add(cropId)
    return {
      ...crop,
      cropId,
      cropPath: imagePath,
      imagePath,
      path: imagePath,
      frameId: safeString(crop.frameId, 80) || `frame-${finiteNumber(crop.frameIndex, index)}`,
      frameIndex: finiteNumber(crop.frameIndex, finiteNumber(crop.frameId?.match(/\d+/u)?.[0], index)),
      timestampSeconds: finiteNumber(crop.timestampSeconds, null),
      regionType: safeString(crop.regionType || crop.variant || crop.cropVariant, 120) || 'unknown',
      variant: safeString(crop.variant || crop.regionType || crop.cropVariant, 120) || 'unknown',
      sourceType: 'gemini_crop_judge_selected',
    }
  }).filter(Boolean)
}

function frameLabel(crop = {}) {
  const direct = safeString(crop.frameId, 80).replace(/^frame-/u, 'f')
  return direct || `f${finiteNumber(crop.frameIndex, 0)}`
}

async function contactSheetTile(crop, imageTool) {
  const thumbnail = await imageTool(crop.cropPath)
    .resize({
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      fit: 'contain',
      background: { r: 18, g: 18, b: 18 },
    })
    .jpeg({ quality: 82 })
    .toBuffer()
  const timestamp = finiteNumber(crop.timestampSeconds, 0).toFixed(3)
  const firstLine = `${crop.cropId} | ${frameLabel(crop)} | t${timestamp}`
  const secondLine = safeString(crop.regionType, 120)
  const label = Buffer.from(`
    <svg width="${THUMB_WIDTH}" height="45" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#202020"/>
      <text x="5" y="17" fill="#ffffff" font-family="Arial" font-size="12">${xmlEscape(firstLine)}</text>
      <text x="5" y="36" fill="#d7d7d7" font-family="Arial" font-size="11">${xmlEscape(secondLine)}</text>
    </svg>
  `)
  return imageTool({
    create: {
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      channels: 3,
      background: { r: 8, g: 8, b: 8 },
    },
  }).composite([
    { input: thumbnail, left: 10, top: 7 },
    { input: label, left: 10, top: 186 },
  ]).jpeg({ quality: 86 }).toBuffer()
}

async function writeContactSheetPage(crops, targetPath, imageTool) {
  const tiles = await Promise.all(crops.map((crop) => contactSheetTile(crop, imageTool)))
  const columns = Math.min(CONTACT_SHEET_COLUMNS, tiles.length)
  const rows = Math.ceil(tiles.length / columns)
  await imageTool({
    create: {
      width: columns * TILE_WIDTH,
      height: rows * TILE_HEIGHT,
      channels: 3,
      background: { r: 4, g: 4, b: 4 },
    },
  }).composite(tiles.map((input, index) => ({
    input,
    left: (index % columns) * TILE_WIDTH,
    top: Math.floor(index / columns) * TILE_HEIGHT,
  }))).jpeg({ quality: 88 }).toFile(targetPath)
}

function safeDiagnosticString(value, maxLength = 1000, secrets = []) {
  let result = safeString(value, maxLength)
  for (const secret of secrets.map((item) => safeString(item, 2000)).filter(Boolean)) {
    result = result.split(secret).join('[REDACTED]')
  }
  return result
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/giu, '[REDACTED_IMAGE_DATA]')
    .replace(/[a-z0-9+/]{160,}={0,2}/giu, '[REDACTED_BASE64]')
}

function safeInteger(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null
}

function sanitizeFieldViolations(details = [], secrets = []) {
  const violations = []
  for (const detail of Array.isArray(details) ? details : []) {
    const values = Array.isArray(detail?.fieldViolations)
      ? detail.fieldViolations
      : Array.isArray(detail?.field_violations)
        ? detail.field_violations
        : []
    for (const violation of values) {
      const field = safeDiagnosticString(violation?.field, 300, secrets)
      const description = safeDiagnosticString(violation?.description, 500, secrets)
      if (!field && !description) continue
      violations.push({ field: field || null, description: description || null })
      if (violations.length >= 20) return violations
    }
  }
  return violations
}

function providerError(code, message, diagnostics = {}) {
  return {
    provider: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROVIDER,
    code: safeString(code, 120),
    message: safeString(message, 300),
    providerErrorClass: safeString(diagnostics.providerErrorClass, 120) || null,
    httpStatus: safeInteger(diagnostics.httpStatus),
    googleErrorStatus: safeString(diagnostics.googleErrorStatus, 120) || null,
    googleErrorCode: diagnostics.googleErrorCode ?? null,
    googleErrorMessage: safeString(diagnostics.googleErrorMessage, 1000) || null,
    fieldViolations: Array.isArray(diagnostics.fieldViolations)
      ? diagnostics.fieldViolations.slice(0, 20)
      : [],
    endpointType: safeString(
      diagnostics.endpointType || SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
      40,
    ),
    model: safeString(diagnostics.model, 120) || null,
    pagePath: safeString(diagnostics.pagePath, 2000) || null,
    pageIndex: safeInteger(diagnostics.pageIndex),
    pageNumber: safeInteger(diagnostics.pageNumber),
    attemptNumber: safeInteger(diagnostics.attemptNumber),
    attemptRuntimeMs: safeInteger(diagnostics.attemptRuntimeMs),
    retryAfterPresent: Boolean(diagnostics.retryAfterPresent),
    retryAfterRaw: safeString(diagnostics.retryAfterRaw, 120) || null,
    retryAfterMs: safeInteger(diagnostics.retryAfterMs),
    retryAfterUsed: Boolean(diagnostics.retryAfterUsed),
    retryDelayMs: safeInteger(diagnostics.retryDelayMs),
    finalPageStatus: safeString(diagnostics.finalPageStatus, 80) || null,
    queueWaitMs: safeInteger(diagnostics.queueWaitMs),
    providerRuntimeMs: safeInteger(diagnostics.providerRuntimeMs),
    originalBytes: safeInteger(diagnostics.originalBytes),
    sentBytes: safeInteger(diagnostics.sentBytes),
    imageBytes: safeInteger(diagnostics.imageBytes),
    base64Length: safeInteger(diagnostics.base64Length),
    requestBodyApproxBytes: safeInteger(diagnostics.requestBodyApproxBytes),
    mimeType: safeString(diagnostics.mimeType || GEMINI_CROP_JUDGE_MIME_TYPE, 80),
    transportErrorMessage: safeString(diagnostics.transportErrorMessage, 500) || null,
  }
}

function buildInteractionsRequest({ imageBuffer, prompt, model }) {
  const imageBase64 = imageBuffer.toString('base64')
  const body = {
    model,
    store: false,
    input: [
      { type: 'text', text: prompt },
      { type: 'image', mime_type: GEMINI_CROP_JUDGE_MIME_TYPE, data: imageBase64 },
    ],
  }
  const serializedBody = JSON.stringify(body)
  return {
    body,
    serializedBody,
    imageBytes: imageBuffer.length,
    base64Length: imageBase64.length,
    requestBodyApproxBytes: Buffer.byteLength(serializedBody, 'utf8'),
  }
}

function requestFitsLimits(metrics, config) {
  return metrics.imageBytes <= config.maxImageBytes &&
    metrics.requestBodyApproxBytes <= config.maxRequestBytes
}

async function prepareContactSheetForGemini({
  pagePath,
  prompt,
  model,
  config,
  imageTool,
}) {
  const originalBuffer = await fs.readFile(pagePath)
  const originalMetrics = buildInteractionsRequest({ imageBuffer: originalBuffer, prompt, model })
  const common = {
    originalBytes: originalBuffer.length,
    mimeType: GEMINI_CROP_JUDGE_MIME_TYPE,
  }
  if (requestFitsLimits(originalMetrics, config)) {
    return {
      ...common,
      sendable: true,
      recompressed: false,
      sentPagePath: pagePath,
      imageBuffer: originalBuffer,
      sentBytes: originalBuffer.length,
      imageBytes: originalMetrics.imageBytes,
      base64Length: originalMetrics.base64Length,
      requestBodyApproxBytes: originalMetrics.requestBodyApproxBytes,
    }
  }

  const metadata = await imageTool(originalBuffer).metadata()
  const originalWidth = safeInteger(metadata?.width) || MIN_GEMINI_CONTACT_SHEET_WIDTH
  const scales = [1, 0.9, 0.8, 0.72]
  const qualities = uniqueStrings([
    String(config.jpegQuality),
    String(Math.max(65, config.jpegQuality - 10)),
    String(Math.max(55, config.jpegQuality - 20)),
    '50',
  ]).map((value) => Number(value))
  let best = null
  for (const scale of scales) {
    const width = Math.max(
      Math.min(originalWidth, MIN_GEMINI_CONTACT_SHEET_WIDTH),
      Math.round(originalWidth * scale),
    )
    for (const quality of qualities) {
      const imageBuffer = await imageTool(originalBuffer)
        .resize({ width, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      const metrics = buildInteractionsRequest({ imageBuffer, prompt, model })
      if (!best || metrics.requestBodyApproxBytes < best.requestBodyApproxBytes) {
        best = { imageBuffer, width, quality, ...metrics }
      }
      if (requestFitsLimits(metrics, config)) {
        best = { imageBuffer, width, quality, ...metrics }
        break
      }
    }
    if (best && requestFitsLimits(best, config)) break
  }

  const sentPagePath = pagePath.replace(/\.jpg$/iu, '-gemini.jpg')
  if (best?.imageBuffer) await fs.writeFile(sentPagePath, best.imageBuffer)
  return {
    ...common,
    sendable: Boolean(best && requestFitsLimits(best, config)),
    recompressed: true,
    sentPagePath,
    imageBuffer: best?.imageBuffer || null,
    sentBytes: best?.imageBytes ?? null,
    imageBytes: best?.imageBytes ?? null,
    base64Length: best?.base64Length ?? null,
    requestBodyApproxBytes: best?.requestBodyApproxBytes ?? null,
    sentWidth: best?.width ?? null,
    jpegQuality: best?.quality ?? null,
  }
}

function googleHttpDiagnostics({ status, payload, requestDiagnostics, apiKey }) {
  const googleError = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : payload && typeof payload === 'object'
      ? payload
      : {}
  const secrets = [apiKey]
  const rawGoogleCode = googleError?.code
  return {
    ...requestDiagnostics,
    httpStatus: safeInteger(status),
    googleErrorStatus: safeDiagnosticString(googleError?.status, 120, secrets) || null,
    googleErrorCode: Number.isFinite(Number(rawGoogleCode))
      ? Number(rawGoogleCode)
      : safeDiagnosticString(rawGoogleCode, 120, secrets) || null,
    googleErrorMessage: safeDiagnosticString(googleError?.message, 1000, secrets) || null,
    fieldViolations: sanitizeFieldViolations(googleError?.details, secrets),
  }
}

async function defaultInteractionsRequest({
  imageBuffer,
  prompt,
  model,
  apiKey,
  timeoutMs,
  fetchImpl,
  requestDiagnostics,
}) {
  const request = buildInteractionsRequest({ imageBuffer, prompt, model })
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: request.serializedBody,
      signal: controller.signal,
    })
    const responseText = await response.text()
    let payload = null
    try {
      payload = responseText ? JSON.parse(responseText) : null
    } catch {
      payload = null
    }
    if (!response.ok) {
      const error = new Error(`GEMINI_CROP_JUDGE_HTTP_${response.status}`)
      const retryAfterRaw = safeDiagnosticString(response?.headers?.get?.('retry-after'), 120, [apiKey]) || null
      error.diagnostics = {
        ...googleHttpDiagnostics({
          status: response.status,
          payload,
          requestDiagnostics: {
            ...requestDiagnostics,
            imageBytes: request.imageBytes,
            base64Length: request.base64Length,
            requestBodyApproxBytes: request.requestBodyApproxBytes,
          },
          apiKey,
        }),
        retryAfterPresent: Boolean(retryAfterRaw),
        retryAfterRaw,
      }
      throw error
    }
    return payload
  } catch (error) {
    if (error?.diagnostics) throw error
    const isTimeout = error?.name === 'AbortError' ||
      safeString(error?.code, 80) === 'ABORT_ERR' ||
      /abort|timeout/iu.test(safeString(error?.message, 300))
    const wrapped = new Error(
      isTimeout ? 'GEMINI_CROP_JUDGE_TIMEOUT' : 'GEMINI_CROP_JUDGE_NETWORK_ERROR',
    )
    wrapped.diagnostics = {
      ...requestDiagnostics,
      imageBytes: request.imageBytes,
      base64Length: request.base64Length,
      requestBodyApproxBytes: request.requestBodyApproxBytes,
      transportErrorMessage: safeDiagnosticString(error?.message, 500, [apiKey]) || null,
    }
    throw wrapped
  } finally {
    clearTimeout(timeoutId)
  }
}


function classifyGeminiProviderError(error = {}) {
  const code = safeString(error?.message, 160)
  const httpStatus = safeInteger(error?.diagnostics?.httpStatus)
  if (code === 'GEMINI_CROP_JUDGE_REQUEST_TOO_LARGE') {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PAGE_PAYLOAD_TOO_LARGE
  }
  if (code === 'GEMINI_CROP_JUDGE_SCHEMA_INVALID') {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RESPONSE_SCHEMA_INVALID
  }
  if (
    code === 'GEMINI_CROP_JUDGE_EMPTY_RESPONSE' ||
    code === 'GEMINI_CROP_JUDGE_INVALID_JSON'
  ) {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RESPONSE_INVALID
  }
  if (code === 'GEMINI_CROP_JUDGE_TIMEOUT') {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_TIMEOUT
  }
  if (httpStatus === 429) {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RATE_LIMITED
  }
  if ([500, 502, 503, 504].includes(httpStatus)) {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_SERVER_ERROR
  }
  if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) {
    return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_CLIENT_ERROR
  }
  return SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_UNAVAILABLE
}


function isGeminiQuotaExhaustion(error = {}, providerErrorClass = null) {
  if (providerErrorClass !== SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RATE_LIMITED) return false
  const diagnostics = error?.diagnostics || {}
  const message = [
    error?.message,
    diagnostics.googleErrorMessage,
    diagnostics.transportErrorMessage,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  return /(?:exceeded|exhausted).{0,80}quota|quota.{0,80}(?:exceeded|exhausted)|free[_ -]?tier[_ -]?requests/u.test(message)
}

function isRetryableGeminiProviderError(providerErrorClass) {
  return [
    SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RATE_LIMITED,
    SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_TIMEOUT,
    SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_SERVER_ERROR,
    SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_UNAVAILABLE,
  ].includes(providerErrorClass)
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  const raw = safeString(value, 120)
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  const retryAt = Date.parse(raw)
  if (!Number.isFinite(retryAt)) return null
  return Math.max(0, retryAt - nowMs)
}

function buildGeminiRetryDelay({
  error,
  attemptNumber,
  config,
  nowMs,
  random = Math.random,
}) {
  const retryAfterMs = parseRetryAfterMs(error?.diagnostics?.retryAfterRaw, nowMs)
  if (retryAfterMs != null) {
    return {
      delayMs: Math.min(retryAfterMs, config.retryMaxDelayMs),
      retryAfterMs,
      retryAfterUsed: true,
    }
  }

  const exponential = Math.min(
    config.retryMaxDelayMs,
    config.retryBaseDelayMs * (2 ** Math.max(0, attemptNumber - 1)),
  )
  const jitterCap = Math.min(1000, Math.max(0, Math.round(exponential * 0.2)))
  const jitter = jitterCap > 0
    ? Math.floor(Math.max(0, Math.min(1, Number(random()) || 0)) * (jitterCap + 1))
    : 0
  return {
    delayMs: Math.min(config.retryMaxDelayMs, exponential + jitter),
    retryAfterMs: null,
    retryAfterUsed: false,
  }
}

function geminiRequestIdentity({ model, prompt, imageBuffer }) {
  return createHash('sha256')
    .update(safeString(model, 120))
    .update('\0')
    .update(prompt)
    .update('\0')
    .update(imageBuffer)
    .digest('hex')
}

async function defaultSleep(ms) {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function attachPageExecutionDiagnostics(error, diagnostics = {}) {
  try {
    error.pageExecutionDiagnostics = diagnostics
    error.diagnostics = {
      ...(error?.diagnostics || {}),
      providerErrorClass: diagnostics.providerErrorClass ||
        classifyGeminiProviderError(error),
      attemptNumber: diagnostics.attemptNumber || null,
      retryAfterPresent: Boolean(diagnostics.retryAfterPresent),
      retryAfterRaw: diagnostics.retryAfterRaw || error?.diagnostics?.retryAfterRaw || null,
      retryAfterMs: diagnostics.retryAfterMs ?? null,
      retryAfterUsed: Boolean(diagnostics.retryAfterUsed),
      retryDelayMs: diagnostics.retryDelayMs ?? null,
      queueWaitMs: diagnostics.queueWaitMs ?? null,
      providerRuntimeMs: diagnostics.providerRuntimeMs ?? null,
      finalPageStatus: 'ERROR',
    }
  } catch {
    // Keep the original provider error if it cannot be annotated.
  }
  return error
}

async function executeGeminiPageWithRetry({
  page,
  prepared,
  requestDiagnostics,
  interact,
  apiKey,
  config,
  requestScheduler,
  deps = {},
}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now
  const sleep = typeof deps.sleep === 'function' ? deps.sleep : defaultSleep
  const random = typeof deps.random === 'function' ? deps.random : Math.random
  const startedAt = now()
  const deadline = startedAt + config.timeoutMs
  const attempts = []
  let totalQueueWaitMs = 0
  let totalProviderRuntimeMs = 0
  let totalBackoffMs = 0

  const requestKey = geminiRequestIdentity({
    model: config.model,
    prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
    imageBuffer: prepared.imageBuffer,
  })

  const deduped = await requestScheduler.dedupe(requestKey, async () => {
    let lastError = null
    for (let attemptNumber = 1; attemptNumber <= config.maxAttempts; attemptNumber += 1) {
      const remainingBeforeQueueMs = deadline - now()
      if (remainingBeforeQueueMs <= 0) {
        const timeoutError = new Error('GEMINI_CROP_JUDGE_TIMEOUT')
        throw attachPageExecutionDiagnostics(timeoutError, {
          attempts,
          attemptNumber: Math.max(1, attemptNumber - 1),
          providerErrorClass:
            SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_TIMEOUT,
          queueWaitMs: totalQueueWaitMs,
          providerRuntimeMs: totalProviderRuntimeMs,
          backoffMs: totalBackoffMs,
        })
      }

      const attemptStartedAt = now()
      try {
        const scheduled = await requestScheduler.schedule(async () => {
          const remainingMs = deadline - now()
          if (remainingMs <= 0) throw new Error('GEMINI_CROP_JUDGE_TIMEOUT')
          return interact
            ? interact({
                prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
                imagePath: prepared.sentPagePath,
                imageBuffer: prepared.imageBuffer,
                model: config.model,
                timeoutMs: remainingMs,
                pageNumber: page.pageNumber,
                cropIds: page.crops.map((crop) => crop.cropId),
                endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
                requestDiagnostics: {
                  ...requestDiagnostics,
                  attemptNumber,
                  pageNumber: page.pageNumber,
                  pageIndex: page.pageNumber - 1,
                },
              })
            : defaultInteractionsRequest({
                imageBuffer: prepared.imageBuffer,
                prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
                model: config.model,
                apiKey,
                timeoutMs: remainingMs,
                fetchImpl: deps.fetch || globalThis.fetch,
                requestDiagnostics: {
                  ...requestDiagnostics,
                  attemptNumber,
                  pageNumber: page.pageNumber,
                  pageIndex: page.pageNumber - 1,
                },
              })
        })
        totalQueueWaitMs += Number(scheduled.queueWaitMs || 0)
        totalProviderRuntimeMs += Number(scheduled.executionMs || 0)
        const parsed = parseShortsTrack2V3GeminiCropJudgeResponse(scheduled.value)
        attempts.push({
          attemptNumber,
          status: 'OK',
          providerErrorClass: null,
          httpStatus: 200,
          retryAfterPresent: false,
          retryAfterMs: null,
          retryAfterUsed: false,
          retryDelayMs: 0,
          queueWaitMs: Number(scheduled.queueWaitMs || 0),
          providerRuntimeMs: Number(scheduled.executionMs || 0),
          attemptRuntimeMs: Math.max(0, now() - attemptStartedAt),
        })
        return {
          parsed,
          attempts,
          queueWaitMs: totalQueueWaitMs,
          providerRuntimeMs: totalProviderRuntimeMs,
          backoffMs: totalBackoffMs,
        }
      } catch (error) {
        lastError = error
        const schedulerDiagnostics = error?.geminiSchedulerDiagnostics || {}
        const attemptQueueWaitMs = Number(schedulerDiagnostics.queueWaitMs || 0)
        const attemptProviderRuntimeMs = Number(schedulerDiagnostics.executionMs || 0)
        totalQueueWaitMs += attemptQueueWaitMs
        totalProviderRuntimeMs += attemptProviderRuntimeMs
        const providerErrorClass = classifyGeminiProviderError(error)
        const retryPlan = buildGeminiRetryDelay({
          error,
          attemptNumber,
          config,
          nowMs: now(),
          random,
        })
        const retryable = isRetryableGeminiProviderError(providerErrorClass)
        const canAttemptAgain = retryable && attemptNumber < config.maxAttempts
        const remainingMs = deadline - now()
        const retryDelayMs = canAttemptAgain
          ? Math.min(Math.max(0, remainingMs), retryPlan.delayMs)
          : 0
        attempts.push({
          attemptNumber,
          status: 'ERROR',
          providerErrorClass,
          httpStatus: safeInteger(error?.diagnostics?.httpStatus),
          retryAfterPresent: Boolean(error?.diagnostics?.retryAfterPresent),
          retryAfterRaw: safeString(error?.diagnostics?.retryAfterRaw, 120) || null,
          retryAfterMs: retryPlan.retryAfterMs,
          retryAfterUsed: retryPlan.retryAfterUsed,
          retryDelayMs,
          queueWaitMs: attemptQueueWaitMs,
          providerRuntimeMs: attemptProviderRuntimeMs,
          attemptRuntimeMs: Math.max(0, now() - attemptStartedAt),
        })

        if (!canAttemptAgain || retryDelayMs >= remainingMs) {
          throw attachPageExecutionDiagnostics(error, {
            attempts,
            attemptNumber,
            providerErrorClass,
            retryAfterPresent: Boolean(error?.diagnostics?.retryAfterPresent),
            retryAfterRaw: safeString(error?.diagnostics?.retryAfterRaw, 120) || null,
            retryAfterMs: retryPlan.retryAfterMs,
            retryAfterUsed: retryPlan.retryAfterUsed,
            retryDelayMs,
            queueWaitMs: totalQueueWaitMs,
            providerRuntimeMs: totalProviderRuntimeMs,
            backoffMs: totalBackoffMs,
          })
        }

        totalBackoffMs += retryDelayMs
        await sleep(retryDelayMs)
      }
    }

    throw attachPageExecutionDiagnostics(
      lastError || new Error('GEMINI_CROP_JUDGE_ERROR'),
      {
        attempts,
        attemptNumber: config.maxAttempts,
        providerErrorClass: classifyGeminiProviderError(lastError),
        queueWaitMs: totalQueueWaitMs,
        providerRuntimeMs: totalProviderRuntimeMs,
        backoffMs: totalBackoffMs,
      },
    )
  })

  return {
    ...deduped,
    totalRuntimeMs: Math.max(0, now() - startedAt),
  }
}

async function writeResult(resultPath, value) {
  if (!resultPath) return null
  await fs.mkdir(path.dirname(resultPath), { recursive: true })
  await fs.writeFile(resultPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return resultPath
}

export async function runShortsTrack2V3GeminiCropJudge({
  allCrops = [],
  outputDir = '',
  config = {},
  env = process.env,
  deps = {},
} = {}) {
  const normalized = normalizeConfig(config)
  const artifactDir = outputDir ? path.join(outputDir, 'gemini-crop-judge') : ''
  const resultPath = artifactDir ? path.join(artifactDir, 'result.json') : null
  const base = {
    enabled: normalized.enabled,
    called: false,
    provider: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROVIDER,
    model: normalized.model,
    endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
    selectedCropIds: [],
    rejectedCropIds: [],
    selectedCrops: [],
    contactSheetPaths: [],
    pageArtifacts: [],
    pageResults: [],
    geminiCropJudgeAggregateStatus: null,
    geminiCropJudgeRequestedPageCount: 0,
    geminiCropJudgeSuccessfulPageCount: 0,
    geminiCropJudgeFailedPageCount: 0,
    geminiCropJudgePartialSuccess: false,
    geminiCropJudgeTotalAttemptCount: 0,
    geminiCropJudgeRetryCount: 0,
    geminiCropJudgeRateLimitCount: 0,
    geminiCropJudgeTimeoutCount: 0,
    geminiCropJudgeServerErrorCount: 0,
    geminiCropJudgeQueueWaitMs: 0,
    geminiCropJudgeProviderRuntimeMs: 0,
    geminiCropJudgeBackoffMs: 0,
    geminiCropJudgeMaxObservedConcurrency: 0,
    geminiCropJudgeDedupHitCount: 0,
    resultPath,
    errors: [],
  }

  if (!normalized.enabled) {
    return { ...base, status: 'DISABLED', reason: 'GEMINI_CROP_JUDGE_DISABLED', resultPath: null }
  }

  const crops = normalizeCrops(allCrops, outputDir)
  if (!crops.length) {
    const result = { ...base, status: 'NOT_RUN', reason: 'GEMINI_CROP_JUDGE_NO_CROPS' }
    await writeResult(resultPath, result)
    return result
  }

  const apiKey = safeString(env?.GEMINI_API_KEY, 1000)
  const interact = typeof deps.geminiCropJudgeInteract === 'function'
    ? deps.geminiCropJudgeInteract
    : null
  if (!apiKey && !interact) {
    const result = {
      ...base,
      status: 'UNAVAILABLE',
      reason: 'GEMINI_CROP_JUDGE_PROVIDER_UNAVAILABLE',
      errors: [providerError(
        'GEMINI_CROP_JUDGE_PROVIDER_UNAVAILABLE',
        'Gemini crop judge is unavailable because GEMINI_API_KEY is not configured.',
      )],
    }
    await writeResult(resultPath, result)
    return result
  }

  await fs.mkdir(artifactDir, { recursive: true })
  const pages = []
  const cropLimit = normalized.maxPages * CROPS_PER_PAGE
  const boundedCrops = crops.slice(0, cropLimit)
  for (let offset = 0; offset < boundedCrops.length; offset += CROPS_PER_PAGE) {
    const pageCrops = boundedCrops.slice(offset, offset + CROPS_PER_PAGE)
    const pageNumber = pages.length + 1
    const pagePath = path.join(
      artifactDir,
      `contact-sheet-page-${String(pageNumber).padStart(2, '0')}.jpg`,
    )
    await writeContactSheetPage(pageCrops, pagePath, deps.sharp || sharp)
    pages.push({ pageNumber, pagePath, crops: pageCrops })
  }

  const requestedCropIds = []
  const rejectedCropIds = []
  const pageResults = []
  const pageArtifacts = []
  const errors = []
  let called = false
  let circuitBreakerTripped = false
  let circuitBreakerReason = null
  let skippedPageCount = 0
  const requestScheduler = deps.geminiCropJudgeRequestScheduler ||
    createShortsTrack2V3GeminiRequestScheduler({
      maxConcurrency: normalized.maxConcurrency,
      now: typeof deps.now === 'function' ? deps.now : Date.now,
    })

  for (const page of pages) {
    const publicPagePath = path.relative(outputDir, page.pagePath).replace(/\\/gu, '/')
    let requestDiagnostics = {
      endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
      model: normalized.model,
      pagePath: publicPagePath,
      pageNumber: page.pageNumber,
      pageIndex: page.pageNumber - 1,
      mimeType: GEMINI_CROP_JUDGE_MIME_TYPE,
    }
    try {
      const prepared = await prepareContactSheetForGemini({
        pagePath: page.pagePath,
        prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
        model: normalized.model,
        config: normalized,
        imageTool: deps.sharp || sharp,
      })
      const publicSentPagePath = path.relative(outputDir, prepared.sentPagePath).replace(/\\/gu, '/')
      requestDiagnostics = {
        ...requestDiagnostics,
        originalBytes: prepared.originalBytes,
        sentBytes: prepared.sentBytes,
        imageBytes: prepared.imageBytes,
        base64Length: prepared.base64Length,
        requestBodyApproxBytes: prepared.requestBodyApproxBytes,
      }
      const pageArtifact = {
        pageNumber: page.pageNumber,
        pagePath: publicPagePath,
        sentPagePath: publicSentPagePath,
        originalBytes: prepared.originalBytes,
        sentBytes: prepared.sentBytes,
        recompressed: prepared.recompressed,
        sendable: prepared.sendable,
        imageBytes: prepared.imageBytes,
        base64Length: prepared.base64Length,
        requestBodyApproxBytes: prepared.requestBodyApproxBytes,
        mimeType: prepared.mimeType,
        endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
        model: normalized.model,
      }
      pageArtifacts.push(pageArtifact)
      if (!prepared.sendable) {
        const error = new Error('GEMINI_CROP_JUDGE_REQUEST_TOO_LARGE')
        error.diagnostics = {
          ...requestDiagnostics,
          providerErrorClass:
            SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PAGE_PAYLOAD_TOO_LARGE,
        }
        throw error
      }

      const execution = await executeGeminiPageWithRetry({
        page,
        prepared,
        requestDiagnostics,
        interact,
        apiKey,
        config: normalized,
        requestScheduler,
        deps,
      })
      const attempts = Array.isArray(execution.attempts) ? execution.attempts : []
      called = called || attempts.length > 0
      const pageValidation = validateShortsTrack2V3GeminiCropIds({
        selectedCropIds: execution.parsed.selectedCropIds,
        availableCrops: page.crops,
        maxSelectedCrops: normalized.maxSelectedCrops,
      })
      requestedCropIds.push(...pageValidation.validCropIds)
      rejectedCropIds.push(...pageValidation.rejectedCropIds)
      pageResults.push({
        pageNumber: page.pageNumber,
        pageIndex: page.pageNumber - 1,
        pagePath: publicPagePath,
        status: 'OK',
        pageStatus: 'SUCCESS',
        selectedCropIds: pageValidation.validCropIds,
        rejectedCropIds: pageValidation.rejectedCropIds,
        attemptCount: attempts.length,
        attempts,
        providerErrorClass: null,
        httpStatus: 200,
        retryDelays: attempts.filter((attempt) => attempt.retryDelayMs > 0)
          .map((attempt) => attempt.retryDelayMs),
        retryAfterUsed: attempts.some((attempt) => attempt.retryAfterUsed),
        queueWaitMs: Number(execution.queueWaitMs || 0),
        providerRuntimeMs: Number(execution.providerRuntimeMs || 0),
        backoffMs: Number(execution.backoffMs || 0),
        dedupHit: Boolean(execution.dedupHit),
        requestDiagnostics,
      })
    } catch (error) {
      const code = safeString(error?.message, 120) || 'GEMINI_CROP_JUDGE_ERROR'
      const execution = error?.pageExecutionDiagnostics || {}
      const attempts = Array.isArray(execution.attempts) ? execution.attempts : []
      called = called || attempts.length > 0
      const providerErrorClass = execution.providerErrorClass || classifyGeminiProviderError(error)
      const finalAttempt = attempts.at(-1) || {}
      const sanitizedError = providerError(
        code.startsWith('GEMINI_CROP_JUDGE_') ? code : 'GEMINI_CROP_JUDGE_ERROR',
        code.startsWith('GEMINI_CROP_JUDGE_')
          ? 'Gemini crop judge failed safely for one contact-sheet page.'
          : 'Gemini crop judge failed safely.',
        {
          ...(error?.diagnostics || requestDiagnostics),
          providerErrorClass,
          pageNumber: page.pageNumber,
          pageIndex: page.pageNumber - 1,
          attemptNumber: finalAttempt.attemptNumber || execution.attemptNumber || null,
          attemptRuntimeMs: finalAttempt.attemptRuntimeMs || null,
          retryAfterPresent: Boolean(finalAttempt.retryAfterPresent),
          retryAfterRaw: finalAttempt.retryAfterRaw || null,
          retryAfterMs: finalAttempt.retryAfterMs ?? null,
          retryAfterUsed: Boolean(finalAttempt.retryAfterUsed),
          retryDelayMs: finalAttempt.retryDelayMs ?? null,
          queueWaitMs: execution.queueWaitMs ?? null,
          providerRuntimeMs: execution.providerRuntimeMs ?? null,
          finalPageStatus: 'ERROR',
        },
      )
      errors.push(sanitizedError)
      pageResults.push({
        pageNumber: page.pageNumber,
        pageIndex: page.pageNumber - 1,
        pagePath: publicPagePath,
        status: 'ERROR',
        pageStatus: 'FAILED',
        selectedCropIds: [],
        rejectedCropIds: [],
        attemptCount: attempts.length,
        attempts,
        providerErrorClass,
        httpStatus: sanitizedError.httpStatus,
        retryDelays: attempts.filter((attempt) => attempt.retryDelayMs > 0)
          .map((attempt) => attempt.retryDelayMs),
        retryAfterUsed: attempts.some((attempt) => attempt.retryAfterUsed),
        queueWaitMs: Number(execution.queueWaitMs || 0),
        providerRuntimeMs: Number(execution.providerRuntimeMs || 0),
        backoffMs: Number(execution.backoffMs || 0),
        dedupHit: false,
        error: sanitizedError,
      })

      if (requestedCropIds.length === 0 && isGeminiQuotaExhaustion(error, providerErrorClass)) {
        circuitBreakerTripped = true
        circuitBreakerReason = 'GEMINI_QUOTA_EXHAUSTED'
        skippedPageCount = Math.max(0, pages.length - page.pageNumber)
        break
      }
    }
  }

  const validation = validateShortsTrack2V3GeminiCropIds({
    selectedCropIds: requestedCropIds,
    availableCrops: boundedCrops,
    maxSelectedCrops: normalized.maxSelectedCrops,
  })
  const successfulPageCount = pageResults.filter((page) => page.status === 'OK').length
  const failedPageCount = pageResults.filter((page) => page.status === 'ERROR').length
  const allAttempts = pageResults.flatMap((page) => Array.isArray(page.attempts) ? page.attempts : [])
  const schedulerDiagnostics = typeof requestScheduler.diagnostics === 'function'
    ? requestScheduler.diagnostics()
    : {}
  const aggregateStatus = successfulPageCount === 0
    ? SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.COMPLETE_PROVIDER_FAILURE
    : failedPageCount > 0
      ? SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.PARTIAL_PAGE_SUCCESS
      : validation.validCropIds.length > 0
        ? SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.COMPLETE_SUCCESS
        : SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.NO_LIKELY_ADDRESS_CROP
  const result = {
    ...base,
    called,
    status: aggregateStatus ===
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.COMPLETE_PROVIDER_FAILURE
      ? 'ERROR'
      : aggregateStatus ===
          SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.PARTIAL_PAGE_SUCCESS
        ? 'PARTIAL'
        : 'OK',
    reason: aggregateStatus ===
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.COMPLETE_PROVIDER_FAILURE
      ? 'GEMINI_CROP_JUDGE_REQUEST_FAILED'
      : aggregateStatus ===
          SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.PARTIAL_PAGE_SUCCESS
        ? 'GEMINI_CROP_JUDGE_PARTIAL_PAGE_SUCCESS'
        : validation.validCropIds.length
          ? 'GEMINI_CROP_JUDGE_SELECTED_CROPS'
          : 'GEMINI_CROP_JUDGE_NO_LIKELY_ADDRESS_CROPS',
    selectedCropIds: validation.validCropIds,
    rejectedCropIds: uniqueStrings([
      ...rejectedCropIds,
      ...validation.rejectedCropIds,
    ], 200),
    selectedCrops: validation.selectedCrops,
    contactSheetPaths: pages.map((page) => page.pagePath),
    pageArtifacts,
    errors,
    pageResults,
    geminiCropJudgeAggregateStatus: aggregateStatus,
    geminiCropJudgeRequestedPageCount: pages.length,
    geminiCropJudgeSuccessfulPageCount: successfulPageCount,
    geminiCropJudgeFailedPageCount: failedPageCount,
    geminiCropJudgePartialSuccess: successfulPageCount > 0 && failedPageCount > 0,
    geminiCropJudgeCircuitBreakerTripped: circuitBreakerTripped,
    geminiCropJudgeCircuitBreakerReason: circuitBreakerReason,
    geminiCropJudgeSkippedPageCount: skippedPageCount,
    geminiCropJudgeTotalAttemptCount: allAttempts.length,
    geminiCropJudgeRetryCount: allAttempts.filter((attempt) => attempt.attemptNumber > 1).length,
    geminiCropJudgeRateLimitCount: allAttempts.filter((attempt) =>
      attempt.providerErrorClass ===
        SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RATE_LIMITED
    ).length,
    geminiCropJudgeTimeoutCount: allAttempts.filter((attempt) =>
      attempt.providerErrorClass ===
        SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_TIMEOUT
    ).length,
    geminiCropJudgeServerErrorCount: allAttempts.filter((attempt) =>
      attempt.providerErrorClass ===
        SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_SERVER_ERROR
    ).length,
    geminiCropJudgeQueueWaitMs: Number(schedulerDiagnostics.queueWaitMs || 0),
    geminiCropJudgeProviderRuntimeMs: Number(schedulerDiagnostics.requestExecutionMs || 0),
    geminiCropJudgeBackoffMs: pageResults.reduce(
      (total, page) => total + Number(page.backoffMs || 0),
      0,
    ),
    geminiCropJudgeMaxObservedConcurrency: Number(
      schedulerDiagnostics.maxObservedConcurrency || 0,
    ),
    geminiCropJudgeDedupHitCount: Number(schedulerDiagnostics.dedupHitCount || 0),
  }
  await writeResult(resultPath, {
    ...result,
    selectedCrops: result.selectedCrops.map((crop) => ({
      cropId: crop.cropId,
      frameId: crop.frameId,
      frameIndex: crop.frameIndex,
      timestampSeconds: crop.timestampSeconds,
      regionType: crop.regionType,
      cropPath: path.relative(outputDir, crop.cropPath).replace(/\\/gu, '/'),
    })),
    contactSheetPaths: result.contactSheetPaths.map((item) =>
      path.relative(outputDir, item).replace(/\\/gu, '/')
    ),
    resultPath: path.relative(outputDir, resultPath).replace(/\\/gu, '/'),
  })
  return result
}

export default {
  parseShortsTrack2V3GeminiCropJudgeResponse,
  runShortsTrack2V3GeminiCropJudge,
  validateShortsTrack2V3GeminiCropIds,
}
