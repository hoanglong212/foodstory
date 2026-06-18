import { createRequire } from 'node:module'
import { createWorker } from 'tesseract.js'

const require = createRequire(import.meta.url)
const DEFAULT_LANGUAGE = 'vie'
const OCR_TIMEOUT_MS = Number(process.env.FOOD_MAP_OCR_TIMEOUT_MS || 20_000)
const OCR_MIN_CONFIDENCE = Number(
  process.env.FOOD_MAP_OCR_MIN_CONFIDENCE || 0.5,
)
const SUPPORTED_LANGUAGES = new Set(['eng', 'vie'])

let workerPromise = null
let recognitionQueue = Promise.resolve()

function emptyResult(reason = 'ocr_failed', warning = null) {
  return {
    text: null,
    confidence: 0,
    lines: [],
    ocrUsable: false,
    reason,
    debug: {
      rawText: '',
      cleanedText: '',
    },
    ...(warning ? { warning } : {}),
  }
}

function configuredLanguage() {
  const requested = String(
    process.env.FOOD_MAP_OCR_LANGUAGE || DEFAULT_LANGUAGE,
  )
    .trim()
    .toLowerCase()

  return SUPPORTED_LANGUAGES.has(requested) ? requested : DEFAULT_LANGUAGE
}

async function createLocalWorker() {
  const language = configuredLanguage()
  const languageData = require(`@tesseract.js-data/${language}`)

  return createWorker(language, undefined, {
    langPath: languageData.langPath,
    gzip: languageData.gzip,
    cacheMethod: 'none',
    logger: () => {},
  })
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = createLocalWorker().catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

async function resetWorker() {
  const activeWorker = workerPromise
  workerPromise = null
  if (!activeWorker) return

  try {
    const worker = await activeWorker
    await worker.terminate()
  } catch {
    // The worker may already be unavailable after a failed initialization.
  }
}

function withTimeout(promise, timeoutMs) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('OCR timed out.')
      error.code = 'ocr_timeout'
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function normalizeOcrText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})%]+$/gu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
    .trim()
}

function normalizedConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const normalized = number > 1 ? number / 100 : number
  return Math.round(Math.max(0, Math.min(1, normalized)) * 1000) / 1000
}

function textQualityReason(cleanedText) {
  if (!cleanedText) return 'no_text'

  const visibleCharacters = [...cleanedText].filter(
    (character) => !/\s/u.test(character),
  )
  const wordCharacters = visibleCharacters.filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  )
  const letterCharacters = visibleCharacters.filter((character) =>
    /\p{L}/u.test(character),
  )
  const wordFragments =
    cleanedText.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu) || []
  const meaningfulWords = wordFragments.filter(
    (word) => [...word].filter((character) => /\p{L}/u.test(character)).length >= 2,
  )
  const isolatedFragments = wordFragments.filter(
    (word) => [...word].filter((character) => /[\p{L}\p{N}]/u.test(character)).length <= 1,
  )
  const wordCharacterRatio =
    visibleCharacters.length > 0
      ? wordCharacters.length / visibleCharacters.length
      : 0
  const isolatedFragmentRatio =
    wordFragments.length > 0
      ? isolatedFragments.length / wordFragments.length
      : 1

  if (wordCharacterRatio < 0.65) return 'mostly_symbols'
  if (letterCharacters.length < 3 || meaningfulWords.length === 0) {
    return 'too_short'
  }
  if (wordFragments.length >= 3 && isolatedFragmentRatio > 0.45) {
    return 'fragmented_text'
  }

  return null
}

export function assessOcrOutput({ rawText = '', confidence = 0 } = {}) {
  const cleanedText = normalizeOcrText(rawText)
  const normalized = normalizedConfidence(confidence)
  const qualityReason = textQualityReason(cleanedText)
  const reason =
    normalized < OCR_MIN_CONFIDENCE ? 'low_confidence' : qualityReason
  const ocrUsable = !reason
  const text = ocrUsable ? cleanedText : null

  return {
    text,
    confidence: normalized,
    lines: text ? text.split('\n').filter(Boolean) : [],
    ocrUsable,
    reason: reason || 'usable',
    debug: {
      rawText: String(rawText || '').trim(),
      cleanedText,
    },
  }
}

export async function extractTextFromImage(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    return emptyResult(
      'empty_image',
      'OCR received an empty image buffer.',
    )
  }

  const recognition = recognitionQueue.then(async () => {
    const worker = await getWorker()
    return withTimeout(worker.recognize(fileBuffer), OCR_TIMEOUT_MS)
  })
  recognitionQueue = recognition.catch(() => {})

  try {
    const result = await recognition
    return assessOcrOutput({
      rawText: result?.data?.text,
      confidence: result?.data?.confidence,
    })
  } catch (error) {
    if (error?.code === 'ocr_timeout') {
      await resetWorker()
    }
    return emptyResult(
      error?.code || 'ocr_failed',
      error?.message || 'OCR could not read this image.',
    )
  }
}

export async function terminateOcrWorker() {
  await recognitionQueue.catch(() => {})
  await resetWorker()
}
