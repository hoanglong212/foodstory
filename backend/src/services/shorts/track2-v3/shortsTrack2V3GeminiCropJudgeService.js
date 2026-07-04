import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

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
      error.diagnostics = googleHttpDiagnostics({
        status: response.status,
        payload,
        requestDiagnostics: {
          ...requestDiagnostics,
          imageBytes: request.imageBytes,
          base64Length: request.base64Length,
          requestBodyApproxBytes: request.requestBodyApproxBytes,
        },
        apiKey,
      })
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
  const deadline = Date.now() + normalized.timeoutMs

  for (const page of pages) {
    const publicPagePath = path.relative(outputDir, page.pagePath).replace(/\\/gu, '/')
    let requestDiagnostics = {
      endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
      model: normalized.model,
      pagePath: publicPagePath,
      mimeType: GEMINI_CROP_JUDGE_MIME_TYPE,
    }
    try {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new Error('GEMINI_CROP_JUDGE_TIMEOUT')
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
        error.diagnostics = requestDiagnostics
        throw error
      }
      called = true
      const rawResponse = interact
        ? await interact({
            prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
            imagePath: prepared.sentPagePath,
            imageBuffer: prepared.imageBuffer,
            model: normalized.model,
            timeoutMs: remainingMs,
            pageNumber: page.pageNumber,
            cropIds: page.crops.map((crop) => crop.cropId),
            endpointType: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT_TYPE,
            requestDiagnostics,
          })
        : await defaultInteractionsRequest({
            imageBuffer: prepared.imageBuffer,
            prompt: SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_PROMPT,
            model: normalized.model,
            apiKey,
            timeoutMs: remainingMs,
            fetchImpl: deps.fetch || globalThis.fetch,
            requestDiagnostics,
          })
      const parsed = parseShortsTrack2V3GeminiCropJudgeResponse(rawResponse)
      const pageValidation = validateShortsTrack2V3GeminiCropIds({
        selectedCropIds: parsed.selectedCropIds,
        availableCrops: page.crops,
        maxSelectedCrops: normalized.maxSelectedCrops,
      })
      requestedCropIds.push(...pageValidation.validCropIds)
      rejectedCropIds.push(...pageValidation.rejectedCropIds)
      pageResults.push({
        pageNumber: page.pageNumber,
        status: 'OK',
        selectedCropIds: pageValidation.validCropIds,
        rejectedCropIds: pageValidation.rejectedCropIds,
        requestDiagnostics,
      })
    } catch (error) {
      const code = safeString(error?.message, 120) || 'GEMINI_CROP_JUDGE_ERROR'
      const sanitizedError = providerError(
        code.startsWith('GEMINI_CROP_JUDGE_') ? code : 'GEMINI_CROP_JUDGE_ERROR',
        code.startsWith('GEMINI_CROP_JUDGE_')
          ? 'Gemini crop judge failed safely for one contact-sheet page.'
          : 'Gemini crop judge failed safely.',
        error?.diagnostics || requestDiagnostics,
      )
      errors.push(sanitizedError)
      pageResults.push({
        pageNumber: page.pageNumber,
        status: 'ERROR',
        selectedCropIds: [],
        rejectedCropIds: [],
        error: sanitizedError,
      })
    }
  }

  const validation = validateShortsTrack2V3GeminiCropIds({
    selectedCropIds: requestedCropIds,
    availableCrops: boundedCrops,
    maxSelectedCrops: normalized.maxSelectedCrops,
  })
  const result = {
    ...base,
    called,
    status: errors.length === pages.length ? 'ERROR' : 'OK',
    reason: errors.length === pages.length
      ? 'GEMINI_CROP_JUDGE_REQUEST_FAILED'
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
