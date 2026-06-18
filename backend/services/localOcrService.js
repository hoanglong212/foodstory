import { createRequire } from 'node:module'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'

const require = createRequire(import.meta.url)

const SUPPORTED_LANGUAGES = new Set(['vie', 'eng'])
const DEFAULT_LANGUAGES = ['vie', 'eng']
const DEFAULT_TIMEOUT_MS = Number(
  process.env.FOOD_MAP_SOCIAL_OCR_TIMEOUT_MS || 12_000,
)
const DEFAULT_MAX_PASSES = Number(
  process.env.FOOD_MAP_SOCIAL_OCR_MAX_PASSES || 16,
)
const MIN_CONFIDENCE = Number(
  process.env.FOOD_MAP_SOCIAL_OCR_MIN_CONFIDENCE || 0.45,
)
const MAX_TEXT_LENGTH = 1_500
const MAX_DEBUG_TEXT_LENGTH = 600
const MAX_DEBUG_PASSES = 16
const MAX_LINES = 20
const MAX_BUFFER_BYTES = 5 * 1024 * 1024
const LARGE_IMAGE_PIXELS = 8_000_000
const LARGE_IMAGE_SIDE = 3_000
const OCR_MAX_IMAGE_SIDE = 2_400
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])
const LINE_TYPES = new Set(['address', 'phone', 'sign', 'other'])
const MAX_LINE_LENGTH = 180
const MIN_LINE_QUALITY = 0.26
const MAX_STRONG_LINES = 8
const MAX_WEAK_LINES = 4
const MAX_REJECTED_DEBUG_LINES = 12

const FOOD_TERMS = [
  'banh mi',
  'bo kho',
  'bun bo',
  'ca',
  'cafe',
  'com ga',
  'com suon',
  'com tam',
  'ga',
  'hu tieu',
  'mi',
  'pho',
]

const LOCATION_TERMS = [
  'city',
  'district',
  'phuong',
  'province',
  'quan',
  'thanh pho',
  'tinh',
  'ward',
]

const OCR_DOMAIN_TERMS = [
  'banh mi',
  'bo kho',
  'bun bo',
  'ca',
  'cafe',
  'com ga',
  'com suon',
  'com tam',
  'city',
  'district',
  'duong',
  'hem',
  'hu tieu',
  'mi',
  'ngo',
  'pho',
  'phuong',
  'province',
  'quan',
  'so',
  'street',
  'thanh pho',
  'tinh',
  'ward',
]

let recognitionQueue = Promise.resolve()
const workerPromises = new Map()

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizedConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const normalized = number > 1 ? number / 100 : number
  return roundScore(Math.max(0, Math.min(1, normalized)))
}

function capString(value, maximumLength) {
  const text = String(value || '').trim()
  if (text.length <= maximumLength) return text
  return `${text.slice(0, maximumLength).trim()}...`
}

function cleanLine(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/([|_~=*#])\1{2,}/g, '$1')
    .replace(/([.,:;!?-])\1{2,}/g, '$1')
    .replace(/(?:^|\s)[^\p{L}\p{N}+]{1,4}(?=\s|$)/gu, ' ')
    .replace(/^[^\p{L}\p{N}+]+|[^\p{L}\p{N})%]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeMultilineText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
    .join('\n')
    .trim()
}

function normalizeLineKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhoneEvidence(value) {
  const source = String(value || '')
  let normalized = source.replace(
    /(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/gu,
    (match) => {
      const digits = match.replace(/\D/g, '')
      if (!digits) return match
      const validPhone = normalizedVietnamesePhone(match)
      if (!validPhone && !hasPhoneContext(source)) return match
      if (validPhone) return validPhone
      if (match.trim().startsWith('+') && digits.startsWith('84')) {
        return `+${digits}`
      }
      return digits
    },
  )
  const localContact = contextualLocalContact(source)
  if (localContact) {
    normalized = normalized.replace(
      localContact.raw,
      localContact.normalized,
    )
  }
  return normalized
}

function normalizeCommonCharacterConfusions(value) {
  return String(value || '').replace(
    /(?<=\p{L})0(?=\p{L})/gu,
    'O',
  )
}

function boundedLineSegments(value) {
  const source = cleanLine(
    normalizeCommonCharacterConfusions(normalizePhoneEvidence(value)),
  )
  if (!source) return []
  if (source.length <= MAX_LINE_LENGTH) return [source]

  const words = source.split(/\s+/).filter(Boolean)
  const segments = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > MAX_LINE_LENGTH && current) {
      segments.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) segments.push(current)
  return segments.slice(0, 4)
}

function textWords(value) {
  return normalizeLineKey(value)
    .split(' ')
    .filter((word) => word.length >= 2 || /^\d+$/.test(word))
}

function repeatedTokenRatio(value) {
  const words = textWords(value)
  if (words.length < 2) return 0
  return 1 - new Set(words).size / words.length
}

function tokenSimilarity(left, right) {
  const leftWords = new Set(textWords(left))
  const rightWords = new Set(textWords(right))
  if (!leftWords.size || !rightWords.size) return 0

  let intersection = 0
  for (const word of leftWords) {
    if (rightWords.has(word)) intersection += 1
  }
  return intersection / (leftWords.size + rightWords.size - intersection)
}

function domainSignalCount(value) {
  const normalized = normalizeLineKey(value)
  if (!normalized) return 0
  return OCR_DOMAIN_TERMS.reduce((count, term) => {
    const normalizedTerm = normalizeLineKey(term)
    if (!normalizedTerm) return count
    const pattern = normalizedTerm
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return count + Number(new RegExp(`\\b${pattern}\\b`).test(normalized))
  }, 0)
}

function phoneLike(value) {
  return Boolean(contactEvidence(value))
}

function normalizedVietnamesePhone(value) {
  const match = String(value || '').match(
    /(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/u,
  )
  if (!match) return null
  const digits = match[0].replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  if (/^0[35789]\d{8}$/.test(local) || /^02\d{8,9}$/.test(local)) {
    return local
  }
  return null
}

function hasPhoneContext(value) {
  return /\b(?:phone|tel|telephone|hotline|delivery|ship|call|dt|dien thoai|giao hang|lien he)\b/i.test(
    normalizeLineKey(value),
  )
}

function contextualLocalContact(value) {
  if (!hasPhoneContext(value)) return null
  const source = String(value || '')
  for (const match of source.matchAll(
    /(?<!\d)(?:\d[\s.()/-]*){7}\d(?![\s.()/-]*\d)/gu,
  )) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length === 8) {
      return {
        raw: match[0],
        normalized: digits,
        kind: 'local_contact',
        hasContext: true,
      }
    }
  }
  return null
}

function contactEvidence(value) {
  const phone = normalizedVietnamesePhone(value)
  if (phone) {
    return {
      normalized: phone,
      kind: phone.startsWith('02') ? 'landline' : 'mobile',
      hasContext: hasPhoneContext(value),
    }
  }
  return contextualLocalContact(value)
}

function priceSignalCount(value) {
  return (
    String(value || '').match(/\b\d{1,3}\s*(?:k|vnd|đ|d)\b/giu) || []
  ).length
}

function foodSignalCount(value) {
  const normalized = normalizeLineKey(value)
  return FOOD_TERMS.reduce((count, term) => {
    const pattern = normalizeLineKey(term)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return count + Number(new RegExp(`\\b${pattern}\\b`).test(normalized))
  }, 0)
}

function specificFoodSignalCount(value) {
  const ambiguousTerms = new Set(['ca', 'ga', 'mi'])
  const normalized = normalizeLineKey(value)
  return FOOD_TERMS.reduce((count, term) => {
    const normalizedTerm = normalizeLineKey(term)
    if (ambiguousTerms.has(normalizedTerm)) return count
    const pattern = normalizedTerm
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return count + Number(new RegExp(`\\b${pattern}\\b`).test(normalized))
  }, 0)
}

function locationSignalCount(value) {
  const normalized = normalizeLineKey(value)
  return LOCATION_TERMS.reduce((count, term) => {
    const pattern = normalizeLineKey(term)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return count + Number(new RegExp(`\\b${pattern}\\b`).test(normalized))
  }, 0)
}

function addressEvidenceParts(value) {
  const normalized = normalizeLineKey(value)
  const hasHouseNumber =
    /\b(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/.test(
      normalized,
    )
  const hasAddressKeyword =
    /\b(?:duong|pho|street|st|road|rd|avenue|ave|boulevard|blvd|hem|ngo|so|address)\b/.test(
      normalized,
    )
  const hasAdminToken =
    /\b(?:p|q)\s*\.?\s*\d{1,2}\b/.test(
      normalized,
    ) ||
    /\b(?:phuong|ward|quan|district)(?:\s+\d{1,2})?\b/.test(
      normalized,
    ) ||
    /\b(?:tp\s*hcm|tphcm|hcm|thanh pho|city|province|tinh)\b/.test(
      normalized,
    )
  const leadingHouseNumber =
    /^(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/.test(
      normalized,
    )
  const numberOnly =
    hasHouseNumber &&
    !hasAddressKeyword &&
    !hasAdminToken &&
    textWords(normalized).length <= 2
  const streetFragment =
    hasAddressKeyword &&
    !hasHouseNumber &&
    textWords(normalized).length >= 2
  const streetLike =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s+[a-z]{2,}(?:\s+[a-z]{2,}){1,5}\b/.test(
      normalized,
    )
  return {
    hasHouseNumber,
    hasAddressKeyword,
    hasAdminToken,
    leadingHouseNumber,
    numberOnly,
    streetFragment,
    streetLike,
    strong:
      hasHouseNumber &&
      (hasAddressKeyword || streetLike) &&
      hasAdminToken,
    partial:
      hasHouseNumber || hasAddressKeyword || hasAdminToken || streetLike,
  }
}

function addressLike(value) {
  return addressEvidenceParts(value).partial
}

function readableCharacterRatio(value) {
  const visible = [...String(value || '')].filter(
    (character) => !/\s/u.test(character),
  )
  if (!visible.length) return 0
  const readable = visible.filter((character) =>
    /[\p{L}\p{N}+.,:/()-]/u.test(character),
  )
  return readable.length / visible.length
}

function symbolCharacterRatio(value) {
  const visible = [...String(value || '')].filter(
    (character) => !/\s/u.test(character),
  )
  if (!visible.length) return 1
  const symbols = visible.filter(
    (character) => !/[\p{L}\p{N}+.,:/()-]/u.test(character),
  )
  return symbols.length / visible.length
}

function lineQuality(line) {
  const text = cleanLine(line?.text)
  if (!text) return 0

  const words = textWords(text)
  const confidence = normalizedConfidence(line?.confidence)
  const readableRatio = readableCharacterRatio(text)
  const symbolRatio = symbolCharacterRatio(text)
  const repeatedRatio = repeatedTokenRatio(text)
  const contact = contactEvidence(text)
  const addressParts = addressEvidenceParts(text)
  const signals =
    Number(Boolean(contact)) +
    Number(addressParts.partial) +
    Math.min(2, domainSignalCount(text))

  let score =
    confidence * 0.42 +
    Math.min(words.length, 8) * 0.035 +
    readableRatio * 0.22 +
    Math.min(signals, 3) * 0.07

  if (words.length < 2 && !contact) score -= 0.2
  if (text.length > MAX_LINE_LENGTH) score -= 0.14
  if (repeatedRatio >= 0.35) score -= repeatedRatio * 0.55
  if (symbolRatio > 0.24) score -= symbolRatio * 0.5
  if (!contact && /\d{7,}/.test(normalizeLineKey(text))) score -= 0.25

  return roundScore(Math.max(0, Math.min(1, score)))
}

function configuredLanguages() {
  const requested = String(
    process.env.FOOD_MAP_SOCIAL_OCR_LANGUAGES || '',
  )
    .split(/[,+\s]+/)
    .map((language) => language.trim().toLowerCase())
    .filter((language) => SUPPORTED_LANGUAGES.has(language))

  return requested.length ? [...new Set(requested)] : DEFAULT_LANGUAGES
}

function languageData(language) {
  const data = require(`@tesseract.js-data/${language}`)
  return {
    langPath: data.langPath,
    gzip: data.gzip,
  }
}

function createLocalWorker(language) {
  const data = languageData(language)
  return createWorker(language, undefined, {
    langPath: data.langPath,
    gzip: data.gzip,
    cacheMethod: 'none',
    logger: () => {},
  })
}

function getWorker(language) {
  if (!workerPromises.has(language)) {
    workerPromises.set(
      language,
      createLocalWorker(language).catch((error) => {
        workerPromises.delete(language)
        throw error
      }),
    )
  }

  return workerPromises.get(language)
}

async function resetWorker(language) {
  const activeWorker = workerPromises.get(language)
  workerPromises.delete(language)
  if (!activeWorker) return

  try {
    const worker = await activeWorker
    await worker.terminate()
  } catch {
    // A timed-out or failed worker may already be gone.
  }
}

function withTimeout(promise, timeoutMs) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Local OCR timed out.')
      error.code = 'timeout'
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function recognizeWithLocalTesseract({
  buffer,
  language,
  psm,
  rectangle = null,
}) {
  const recognition = recognitionQueue.then(async () => {
    const worker = await getWorker(language)
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    return worker.recognize(
      buffer,
      rectangle ? { rectangle } : {},
      { text: true, blocks: true },
    )
  })

  recognitionQueue = recognition.catch(() => {})
  return recognition
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16)
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return {}
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function parseJpegDimensions(buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2) break

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }
    offset += 2 + length
  }
  return {}
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return {}
  const chunk = buffer.toString('ascii', 12, 16)
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    }
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    const start = 20
    if (
      buffer[start + 3] === 0x9d &&
      buffer[start + 4] === 0x01 &&
      buffer[start + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(start + 6) & 0x3fff,
        height: buffer.readUInt16LE(start + 8) & 0x3fff,
      }
    }
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const b0 = buffer[21]
    const b1 = buffer[22]
    const b2 = buffer[23]
    const b3 = buffer[24]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  return {}
}

function detectImage(buffer, mimetype = '') {
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) {
    return { format: 'gif', mimetype: 'image/gif' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return {
      format: 'jpeg',
      mimetype: 'image/jpeg',
      ...parseJpegDimensions(buffer),
    }
  }
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer.toString('ascii', 1, 4) === 'PNG'
  ) {
    return {
      format: 'png',
      mimetype: 'image/png',
      ...parsePngDimensions(buffer),
    }
  }
  if (
    buffer.length >= 16 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return {
      format: 'webp',
      mimetype: 'image/webp',
      ...parseWebpDimensions(buffer),
    }
  }

  if (mimetype === 'image/jpeg') return { format: 'jpeg', mimetype }
  if (mimetype === 'image/png') return { format: 'png', mimetype }
  if (mimetype === 'image/webp') return { format: 'webp', mimetype }
  if (mimetype === 'image/gif') return { format: 'gif', mimetype }
  return { format: null, mimetype: mimetype || null }
}

function imageDebug(prepared = {}) {
  return {
    mimetype: prepared.mimetype || null,
    format: prepared.format || null,
    size: prepared.size || 0,
    width: Number.isFinite(prepared.width) ? prepared.width : null,
    height: Number.isFinite(prepared.height) ? prepared.height : null,
    resized: prepared.resized === true,
    autoRotated: prepared.autoRotated === true,
    variants: Array.isArray(prepared.variants)
      ? prepared.variants.map((variant) => ({
          label: variant.label,
          format: variant.format,
          size: variant.size,
          width: variant.width,
          height: variant.height,
          resized: variant.resized === true,
          autoRotated: variant.autoRotated === true,
        }))
      : [],
  }
}

function failureEvidence(reason, { warnings = [], debug = {}, confidence = 0 } = {}) {
  return {
    text: null,
    usable: false,
    ocrUsable: false,
    confidence: roundScore(confidence),
    reason,
    lines: [],
    strongLines: [],
    weakLines: [],
    warnings,
    debug: {
      implemented: true,
      engine: 'tesseract.js',
      ...debug,
    },
    implemented: true,
  }
}

function prepareImage(image) {
  if (!image?.buffer || !Buffer.isBuffer(image.buffer)) {
    return {
      error: failureEvidence('unsupported_image', {
        warnings: ['No image buffer was provided for local OCR.'],
      }),
    }
  }

  if (image.buffer.length === 0 || image.buffer.length > MAX_BUFFER_BYTES) {
    return {
      error: failureEvidence('unsupported_image', {
        warnings: ['The image is empty or exceeds the local OCR size limit.'],
        debug: {
          image: {
            mimetype: image.mimetype || null,
            size: image.buffer.length,
          },
        },
      }),
    }
  }

  const buffer = Buffer.from(image.buffer)
  const detected = detectImage(buffer, image.mimetype)
  const warnings = []

  if (detected.format === 'gif') {
    return {
      error: failureEvidence('unsupported_image', {
        warnings: [
          'GIF screenshots are not OCR processed because animated frames are ambiguous. Upload a PNG, JPEG, or WebP screenshot.',
        ],
        debug: {
          image: {
            mimetype: detected.mimetype || image.mimetype || null,
            format: 'gif',
            size: buffer.length,
          },
        },
      }),
    }
  }

  if (!ALLOWED_FORMATS.has(detected.format)) {
    return {
      error: failureEvidence('unsupported_image', {
        warnings: ['The image format is not supported for local OCR.'],
        debug: {
          image: {
            mimetype: detected.mimetype || image.mimetype || null,
            format: detected.format || null,
            size: buffer.length,
          },
        },
      }),
    }
  }

  if (image.mimetype && detected.mimetype && image.mimetype !== detected.mimetype) {
    warnings.push('The uploaded MIME type differed from the image signature.')
  }

  const prepared = {
    buffer,
    format: detected.format,
    mimetype: detected.mimetype || image.mimetype || null,
    size: buffer.length,
    width: Number.isFinite(detected.width) ? detected.width : null,
    height: Number.isFinite(detected.height) ? detected.height : null,
    warnings,
  }

  const pixelCount =
    Number.isFinite(prepared.width) && Number.isFinite(prepared.height)
      ? prepared.width * prepared.height
      : 0
  if (
    pixelCount > LARGE_IMAGE_PIXELS ||
    prepared.width > LARGE_IMAGE_SIDE ||
    prepared.height > LARGE_IMAGE_SIDE
  ) {
    warnings.push(
      'The image is large; local OCR creates bounded preprocessing variants before recognition.',
    )
  }

  return { prepared }
}

async function createSharpVariant(prepared, label, transform) {
  let pipeline = sharp(prepared.buffer, {
    failOn: 'none',
    limitInputPixels: LARGE_IMAGE_PIXELS * 8,
  })
    .rotate()
    .resize({
      width: OCR_MAX_IMAGE_SIDE,
      height: OCR_MAX_IMAGE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })

  pipeline = transform(pipeline)
  const { data, info } = await pipeline
    .png({ compressionLevel: 6 })
    .toBuffer({ resolveWithObject: true })

  const sourceWidth = Number(prepared.width) || info.width
  const sourceHeight = Number(prepared.height) || info.height
  return {
    label,
    buffer: data,
    format: info.format || 'png',
    mimetype: 'image/png',
    size: data.length,
    width: info.width,
    height: info.height,
    resized: info.width < sourceWidth || info.height < sourceHeight,
    autoRotated: true,
  }
}

export async function preprocessLocalOcrImage({ image } = {}) {
  const preparedResult = prepareImage(image)
  if (preparedResult.error) return preparedResult

  const { prepared } = preparedResult
  const variants = [
    {
      label: 'original',
      buffer: prepared.buffer,
      format: prepared.format,
      mimetype: prepared.mimetype,
      size: prepared.size,
      width: prepared.width,
      height: prepared.height,
      resized: false,
      autoRotated: false,
    },
  ]
  const warnings = [...prepared.warnings]
  const definitions = [
    ['normalized', (pipeline) => pipeline.normalize()],
    [
      'grayscale',
      (pipeline) => pipeline.greyscale().normalize(),
    ],
    [
      'sharpened',
      (pipeline) => pipeline.normalize().sharpen({ sigma: 1.1 }),
    ],
    [
      'threshold',
      (pipeline) => pipeline.greyscale().normalize().threshold(170),
    ],
  ]

  for (const [label, transform] of definitions) {
    try {
      variants.push(
        await createSharpVariant(prepared, label, transform),
      )
    } catch {
      warnings.push(`Local OCR could not create the ${label} image variant.`)
    }
  }

  const preferred =
    variants.find((variant) => variant.label === 'normalized') || variants[0]
  return {
    prepared: {
      ...prepared,
      width: preferred.width,
      height: preferred.height,
      resized: preferred.resized,
      autoRotated: preferred.autoRotated,
      variants,
      warnings,
    },
  }
}

function ratioRectangle(width, height, {
  left = 0,
  top = 0,
  cropWidth = 1,
  cropHeight = 1,
}) {
  const x = Math.max(0, Math.floor(width * left))
  const y = Math.max(0, Math.floor(height * top))
  return {
    left: x,
    top: y,
    width: Math.max(1, Math.min(width - x, Math.ceil(width * cropWidth))),
    height: Math.max(1, Math.min(height - y, Math.ceil(height * cropHeight))),
  }
}

function buildPasses(prepared, languages, maxPasses) {
  const variants = new Map(
    (prepared.variants || []).map((variant) => [variant.label, variant]),
  )
  const preferredLanguage = languages.includes('vie') ? 'vie' : languages[0]
  const alternateLanguage =
    languages.find((language) => language !== preferredLanguage) ||
    preferredLanguage
  const definitions = [
    {
      label: 'normalized_full_sparse',
      variant: 'normalized',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
    },
    {
      label: 'normalized_full_sparse_alt',
      variant: 'normalized',
      psm: PSM.SPARSE_TEXT,
      language: alternateLanguage,
    },
    {
      label: 'original_full_sparse',
      variant: 'original',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
    },
    {
      label: 'grayscale_full_sparse',
      variant: 'grayscale',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
    },
    {
      label: 'sharpened_top_sparse',
      variant: 'sharpened',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
      region: { top: 0, cropHeight: 0.38 },
    },
    {
      label: 'normalized_top_sparse_alt',
      variant: 'normalized',
      psm: PSM.SPARSE_TEXT,
      language: alternateLanguage,
      region: { top: 0, cropHeight: 0.38 },
    },
    {
      label: 'original_upper_strip_auto',
      variant: 'original',
      psm: PSM.AUTO,
      language: preferredLanguage,
      region: {
        left: 0,
        top: 0.13,
        cropWidth: 0.76,
        cropHeight: 0.1,
      },
    },
    {
      label: 'original_upper_strip_auto_alt',
      variant: 'original',
      psm: PSM.AUTO,
      language: alternateLanguage,
      region: {
        left: 0,
        top: 0.13,
        cropWidth: 0.76,
        cropHeight: 0.1,
      },
    },
    {
      label: 'grayscale_middle_block',
      variant: 'grayscale',
      psm: PSM.SINGLE_BLOCK,
      language: preferredLanguage,
      region: { top: 0.28, cropHeight: 0.44 },
    },
    {
      label: 'normalized_middle_sparse_alt',
      variant: 'normalized',
      psm: PSM.SPARSE_TEXT,
      language: alternateLanguage,
      region: { top: 0.28, cropHeight: 0.44 },
    },
    {
      label: 'sharpened_bottom_sparse',
      variant: 'sharpened',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
      region: { top: 0.62, cropHeight: 0.38 },
    },
    {
      label: 'normalized_bottom_sparse_alt',
      variant: 'normalized',
      psm: PSM.SPARSE_TEXT,
      language: alternateLanguage,
      region: { top: 0.62, cropHeight: 0.38 },
    },
    {
      label: 'threshold_top_block',
      variant: 'threshold',
      psm: PSM.SINGLE_BLOCK,
      language: preferredLanguage,
      region: { top: 0, cropHeight: 0.38 },
    },
    {
      label: 'original_full_auto_alt',
      variant: 'original',
      psm: PSM.AUTO,
      language: alternateLanguage,
    },
    {
      label: 'sharpened_center_sparse',
      variant: 'sharpened',
      psm: PSM.SPARSE_TEXT,
      language: preferredLanguage,
      region: {
        left: 0.1,
        top: 0.15,
        cropWidth: 0.8,
        cropHeight: 0.7,
      },
    },
    {
      label: 'normalized_center_block',
      variant: 'normalized',
      psm: PSM.SINGLE_BLOCK,
      language: preferredLanguage,
      region: {
        left: 0.08,
        top: 0.18,
        cropWidth: 0.84,
        cropHeight: 0.64,
      },
    },
  ]

  const passes = []
  for (const definition of definitions) {
    if (passes.length >= maxPasses) break
    const variant =
      variants.get(definition.variant) ||
      variants.get('normalized') ||
      variants.get('original')
    if (!variant) continue

    const hasDimensions =
      Number.isFinite(variant.width) && Number.isFinite(variant.height)
    if (definition.region && !hasDimensions) continue

    passes.push({
      label: definition.label,
      variant: variant.label,
      buffer: variant.buffer,
      psm: definition.psm,
      language: definition.language,
      rectangle: definition.region
        ? ratioRectangle(
            variant.width,
            variant.height,
            definition.region,
          )
        : null,
    })
  }

  return passes
}

function lineType(text) {
  const value = String(text || '')

  if (contactEvidence(value)) return 'phone'
  if (addressLike(value)) return 'address'

  const letters = [...value].filter((character) => /\p{L}/u.test(character))
  const uppercase = letters.filter((character) => character === character.toUpperCase())
  const words = textWords(value)
  const priceCount = (
    value.match(/\b\d{1,3}\s*(?:k|vnd|đ|d)\b/giu) || []
  ).length
  const hasFoodVenueWord =
    /\b(?:quan|quán|cafe|coffee|restaurant|nhà hàng|nha hang|tiệm|tiem|bếp|bep|bakery)\b/iu.test(
      value,
    )
  if (
    value.length <= 100 &&
    letters.length >= 3 &&
    words.length <= 10 &&
    priceCount < 2 &&
    (
      hasFoodVenueWord ||
      (domainSignalCount(value) > 0 && uppercase.length / letters.length >= 0.55) ||
      uppercase.length / letters.length >= 0.72
    )
  ) {
    return 'sign'
  }

  return 'other'
}

function extractResultLines(data, fallbackText) {
  const lines = []

  if (Array.isArray(data?.blocks)) {
    for (const block of data.blocks) {
      for (const paragraph of block?.paragraphs || []) {
        for (const line of paragraph?.lines || []) {
          for (const text of boundedLineSegments(line.text)) {
            lines.push({
              text,
              confidence: normalizedConfidence(line.confidence),
            })
          }
        }
      }
    }
  }

  if (!lines.length) {
    for (const text of String(fallbackText || '').split('\n')) {
      for (const segment of boundedLineSegments(text)) {
        lines.push({
          text: segment,
          confidence: normalizedConfidence(data?.confidence),
        })
      }
    }
  }

  return lines
}

function dedupeLines(lines) {
  const candidates = []
  for (const line of lines) {
    const text = cleanLine(line.text)
    const key = normalizeLineKey(text)
    if (!text || !key) continue

    const confidence = normalizedConfidence(line.confidence)
    const candidate = {
      text,
      confidence,
      type: lineType(text),
    }
    candidate.quality = lineQuality(candidate)
    const existingIndex = candidates.findIndex((existing) => {
      const existingKey = normalizeLineKey(existing.text)
      return (
        existingKey === key ||
        (
          Math.min(existingKey.length, key.length) >= 8 &&
          (
            existingKey.includes(key) ||
            key.includes(existingKey) ||
            tokenSimilarity(existing.text, text) >= 0.86
          )
        )
      )
    })

    if (existingIndex === -1) {
      candidates.push(candidate)
      continue
    }

    const existing = candidates[existingIndex]
    if (
      candidate.quality > existing.quality ||
      (
        candidate.quality === existing.quality &&
        candidate.confidence > existing.confidence
      )
    ) {
      candidates[existingIndex] = candidate
    }
  }

  return candidates
    .sort(
      (left, right) =>
        right.quality - left.quality ||
        right.confidence - left.confidence,
    )
    .slice(0, MAX_LINES)
    .map(({ quality: _quality, ...line }) => line)
}

function textQualityWarning(text, lines = []) {
  if (!text) return null
  const visible = [...text].filter((character) => !/\s/u.test(character))
  if (!visible.length) return 'no_visible_characters'

  const wordCharacters = visible.filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  )
  const letters = visible.filter((character) => /\p{L}/u.test(character))
  const wordRatio = wordCharacters.length / visible.length
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu) || []
  const meaningfulWords = words.filter(
    (word) => [...word].filter((character) => /\p{L}/u.test(character)).length >= 2,
  )
  const hasUsefulSignal = lines.some(
    (line) =>
      lineType(line.text) !== 'other' ||
      domainSignalCount(line.text) > 0,
  )
  const repetition = repeatedTokenRatio(text)

  if (wordRatio < 0.6) return 'mostly_symbols'
  if (letters.length < 3 || meaningfulWords.length === 0) return 'too_short'
  if (repetition >= 0.48 && !hasUsefulSignal) return 'repeated_garbage'
  if (meaningfulWords.length > 100 && !hasUsefulSignal) return 'unbounded_text'
  return null
}

function averageLineConfidence(lines, pageConfidence) {
  const confidentLines = lines
    .map((line) => Number(line.confidence))
    .filter((confidence) => Number.isFinite(confidence) && confidence > 0)
  if (!confidentLines.length) return pageConfidence
  const average =
    confidentLines.reduce((sum, confidence) => sum + confidence, 0) /
    confidentLines.length
  return roundScore(Math.max(average, pageConfidence * 0.85))
}

function evidenceQuality(text, lines, rawConfidence) {
  const words = textWords(text)
  const qualities = lines.map((line) => lineQuality(line))
  const averageQuality = qualities.length
    ? qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length
    : 0
  const usefulLines = lines.filter(
    (line) => lineQuality(line) >= MIN_LINE_QUALITY,
  )
  const signalLines = lines.filter(
    (line) =>
      phoneLike(line.text) ||
      addressLike(line.text) ||
      domainSignalCount(line.text) > 0,
  )
  const readableRatio = readableCharacterRatio(text)
  const repetition = repeatedTokenRatio(text)
  const longLineCount = lines.filter(
    (line) => String(line.text || '').length > MAX_LINE_LENGTH * 0.85,
  ).length
  const hugeMergedBlock = lines.length <= 2 && words.length > 45

  let score =
    averageQuality * 0.48 +
    Math.min(words.length / 16, 1) * 0.14 +
    Math.min(usefulLines.length / 5, 1) * 0.12 +
    Math.min(signalLines.length / 3, 1) * 0.14 +
    readableRatio * 0.08 +
    normalizedConfidence(rawConfidence) * 0.04

  if (words.length < 2 && !signalLines.length) score -= 0.24
  if (repetition >= 0.3) score -= repetition * 0.42
  if (hugeMergedBlock) score -= 0.18
  if (longLineCount >= 2) score -= 0.08

  return {
    score: roundScore(Math.max(0, Math.min(1, score))),
    readableWordCount: words.length,
    usefulLineCount: usefulLines.length,
    signalLineCount: signalLines.length,
    readableCharacterRatio: roundScore(readableRatio),
    repeatedTokenRatio: roundScore(repetition),
    hugeMergedBlock,
  }
}

function assessRecognitionResult(result, pass) {
  const data = result?.data || result || {}
  const rawText = normalizeMultilineText(data.text)
  const rawLines = extractResultLines(data, rawText)
  const lines = dedupeLines(rawLines)
  const text = capString(
    lines.length ? lines.map((line) => line.text).join('\n') : rawText,
    MAX_TEXT_LENGTH,
  )
  const pageConfidence = normalizedConfidence(data.confidence)
  const rawConfidence = averageLineConfidence(lines, pageConfidence)
  const quality = evidenceQuality(text, lines, rawConfidence)
  const confidence = roundScore(
    rawConfidence * 0.45 + quality.score * 0.55,
  )
  const qualityWarning = textQualityWarning(text, lines)
  const hasStrongSignal = quality.signalLineCount > 0
  const usable =
    Boolean(text) &&
    !qualityWarning &&
    quality.score >= 0.4 &&
    (rawConfidence >= MIN_CONFIDENCE || hasStrongSignal)
  const reason = !text ? 'no_text' : usable ? 'usable' : 'low_confidence'

  return {
    text: usable ? text : null,
    usable,
    ocrUsable: usable,
    confidence,
    reason,
    lines: usable ? lines : [],
    candidateLines: lines,
    warnings: qualityWarning ? [qualityWarning] : [],
    debug: {
      pass: pass.label,
      variant: pass.variant,
      boundedCrop: Boolean(pass.rectangle),
      language: pass.language,
      psm: pass.psm,
      rawText: capString(rawText, MAX_DEBUG_TEXT_LENGTH),
      cleanedText: capString(text, MAX_DEBUG_TEXT_LENGTH),
      lineCount: lines.length,
      pageConfidence,
      rawConfidence,
      qualityScore: quality.score,
      quality,
    },
    implemented: true,
  }
}

function passDebug(pass, assessment, error = null) {
  return {
    label: pass.label,
    variant: pass.variant || null,
    language: pass.language,
    psm: pass.psm,
    rectangle: pass.rectangle || null,
    confidence: assessment?.confidence || 0,
    rawConfidence: assessment?.debug?.rawConfidence || 0,
    qualityScore: assessment?.debug?.qualityScore || 0,
    lineCount: Array.isArray(assessment?.candidateLines)
      ? assessment.candidateLines.length
      : 0,
    textSnippet: capString(
      assessment?.debug?.cleanedText || assessment?.debug?.rawText || '',
      180,
    ),
    reason: assessment?.reason || error?.code || 'ocr_error',
  }
}

function assessmentHasText(assessment) {
  return Boolean(
    assessment?.debug?.cleanedText ||
      assessment?.debug?.rawText ||
      assessment?.candidateLines?.length,
  )
}

function chooseBestAssessment(assessments) {
  const usable = assessments
    .filter((assessment) => assessment.usable)
    .sort(
      (left, right) =>
        (right.debug?.qualityScore || 0) -
          (left.debug?.qualityScore || 0) ||
        right.confidence - left.confidence ||
        right.lines.length - left.lines.length,
    )[0]
  if (usable) return usable

  const candidates = assessments.filter(Boolean)
  const withText = candidates.filter(assessmentHasText)

  return (withText.length ? withText : candidates)
    .filter(Boolean)
    .sort(
      (left, right) =>
        Number(assessmentHasText(right)) - Number(assessmentHasText(left)) ||
        Number(right.reason === 'low_confidence') -
          Number(left.reason === 'low_confidence') ||
        (right.debug?.qualityScore || 0) -
          (left.debug?.qualityScore || 0) ||
        right.confidence - left.confidence ||
        (right.candidateLines?.length || 0) -
          (left.candidateLines?.length || 0),
    )[0]
}

function lineSimilarity(left, right) {
  const leftKey = normalizeLineKey(left)
  const rightKey = normalizeLineKey(right)
  if (!leftKey || !rightKey) return 0
  if (leftKey === rightKey) return 1

  const containment =
    leftKey.includes(rightKey) || rightKey.includes(leftKey)
      ? Math.min(leftKey.length, rightKey.length) /
        Math.max(leftKey.length, rightKey.length)
      : 0
  return Math.max(containment, tokenSimilarity(left, right))
}

function occurrenceRank(occurrence) {
  return (
    occurrence.quality +
    normalizedConfidence(occurrence.confidence) * 0.12 +
    Number(Boolean(contactEvidence(occurrence.text))) * 0.18 +
    Number(addressEvidenceParts(occurrence.text).strong) * 0.14
  )
}

function clusterTypeForText(text, type = lineType(text)) {
  if (contactEvidence(text)) return 'contact'
  const addressParts = addressEvidenceParts(text)
  if (addressParts.strong || addressParts.partial) return 'address_admin'
  if (foodSignalCount(text) > 0 || priceSignalCount(text) > 0) {
    return 'menu'
  }
  if (locationSignalCount(text) > 0) return 'weak_location'
  if (type === 'sign') return 'sign_business'
  return 'garbage'
}

function canonicalContactText(displayText) {
  const contact = contactEvidence(displayText)
  if (!contact) return displayText
  const source = String(displayText || '')
  const numberPattern =
    contact.kind === 'local_contact'
      ? /(?<!\d)(?:\d[\s.()/-]*){7}\d(?![\s.()/-]*\d)/u
      : /(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/u
  return cleanLine(source.replace(numberPattern, contact.normalized))
}

function evidenceVariants(occurrences, displayText) {
  const variants = []
  const displayContact = contactEvidence(displayText)?.normalized
  for (const occurrence of occurrences
    .slice()
    .sort((left, right) => occurrenceRank(right) - occurrenceRank(left))) {
    const occurrenceContact = contactEvidence(occurrence.text)?.normalized
    if (
      lineSimilarity(occurrence.text, displayText) < 0.45 &&
      !(displayContact && occurrenceContact === displayContact)
    ) {
      continue
    }
    const key = normalizeLineKey(occurrence.text)
    if (
      !key ||
      variants.some((variant) => normalizeLineKey(variant.text) === key)
    ) {
      continue
    }
    variants.push({
      text: capString(occurrence.text, 180),
      confidence: roundScore(occurrence.confidence),
      pass: occurrence.pass,
      variant: occurrence.variant,
    })
    if (variants.length >= 5) break
  }
  return variants
}

function clusterLineCandidates(assessments) {
  const clusters = []

  for (const assessment of assessments) {
    for (const line of assessment?.candidateLines || []) {
      const text = cleanLine(line?.text)
      if (!text || !normalizeLineKey(text)) continue

      const confidence = normalizedConfidence(line?.confidence)
      const type = LINE_TYPES.has(line?.type) ? line.type : lineType(text)
      const occurrence = {
        text: capString(text, 300),
        confidence,
        type,
        quality: lineQuality({ text, confidence, type }),
        pass: assessment?.debug?.pass || 'unknown',
        variant: assessment?.debug?.variant || 'unknown',
        boundedCrop: assessment?.debug?.boundedCrop === true,
      }
      let cluster = clusters.find(
        (candidate) => {
          const occurrencePhone = contactEvidence(text)?.normalized
          const canonicalCandidatePhone =
            contactEvidence(candidate.representative.text)?.normalized
          return (
            (canonicalCandidatePhone &&
              occurrencePhone &&
              canonicalCandidatePhone === occurrencePhone) ||
            lineSimilarity(candidate.representative.text, text) >= 0.64
          )
        },
      )

      if (!cluster) {
        cluster = {
          representative: occurrence,
          occurrences: [],
          passes: new Set(),
          variants: new Set(),
        }
        clusters.push(cluster)
      }

      cluster.occurrences.push(occurrence)
      cluster.passes.add(occurrence.pass)
      cluster.variants.add(occurrence.variant)
      if (
        occurrenceRank(occurrence) >
        occurrenceRank(cluster.representative)
      ) {
        cluster.representative = occurrence
      }
    }
  }

  return clusters.map((cluster) => {
    const displayText = cluster.representative.text
    const clusterType = clusterTypeForText(
      displayText,
      cluster.representative.type,
    )
    return {
      text:
        clusterType === 'contact'
          ? canonicalContactText(displayText)
          : displayText,
      displayText,
      evidenceVariants: evidenceVariants(
        cluster.occurrences,
        displayText,
      ),
      confidence: roundScore(
        Math.max(
          ...cluster.occurrences.map((occurrence) => occurrence.confidence),
          0,
        ),
      ),
      type: cluster.representative.type,
      clusterType,
      quality: cluster.representative.quality,
      supportCount: cluster.passes.size,
      variantCount: cluster.variants.size,
      boundedCrop: cluster.occurrences.some(
        (occurrence) => occurrence.boundedCrop,
      ),
      passes: cluster.passes,
      variants: cluster.variants,
      synthetic: false,
    }
  })
}

function addGroupedAddressCandidate(clusters) {
  if (clusters.some((cluster) => addressEvidenceParts(cluster.text).strong)) {
    return clusters
  }

  const addressClusters = clusters.filter(
    (cluster) => !contactEvidence(cluster.text),
  )
  const numberCandidate = addressClusters
    .filter((cluster) => {
      const parts = addressEvidenceParts(cluster.text)
      return (
        parts.numberOnly ||
        (
          parts.hasHouseNumber &&
          parts.leadingHouseNumber &&
          (
            parts.hasAddressKeyword ||
            (
              parts.streetLike &&
              cluster.quality >= 0.52 &&
              readableCharacterRatio(cluster.text) >= 0.78 &&
              foodSignalCount(cluster.text) === 0 &&
              priceSignalCount(cluster.text) === 0
            )
          )
        )
      )
    })
    .sort((left, right) => right.quality - left.quality)[0]
  const streetCandidate = addressClusters
    .filter((cluster) => {
      const parts = addressEvidenceParts(cluster.text)
      return (
        (parts.hasAddressKeyword || parts.streetLike) &&
        cluster !== numberCandidate
      )
    })
    .sort((left, right) => right.quality - left.quality)[0]
  const numberHasStreet = numberCandidate
    ? (() => {
        const parts = addressEvidenceParts(numberCandidate.text)
        return parts.hasAddressKeyword || parts.streetLike
      })()
    : false
  const adminCandidate = addressClusters
    .filter((cluster) => {
      const parts = addressEvidenceParts(cluster.text)
      return (
        parts.hasAdminToken &&
        cluster !== numberCandidate &&
        cluster !== streetCandidate
      )
    })
    .sort((left, right) => right.quality - left.quality)[0]

  if (
    !numberCandidate ||
    (!numberHasStreet && !streetCandidate) ||
    !adminCandidate
  ) {
    return clusters
  }

  const components = [
    numberCandidate,
    numberHasStreet ? null : streetCandidate,
    adminCandidate,
  ].filter(Boolean)
  const componentTexts = components
    .map((component) => component.text)
    .filter(
      (text, index, values) =>
        values.findIndex((candidate) => lineSimilarity(candidate, text) >= 0.8) ===
        index,
    )
  const text = capString(componentTexts.join(', '), 300)
  const confidence = roundScore(
    components.reduce((sum, component) => sum + component.confidence, 0) /
      components.length,
  )
  const passes = new Set(components.flatMap((component) => [...component.passes]))
  const variants = new Set(
    components.flatMap((component) => [...component.variants]),
  )

  return [
    ...clusters,
    {
      text,
      displayText: text,
      evidenceVariants: components.map((component) => ({
        text: component.displayText || component.text,
        confidence: component.confidence,
        pass: [...component.passes][0] || 'unknown',
        variant: [...component.variants][0] || 'unknown',
      })),
      confidence,
      type: 'address',
      clusterType: 'address_admin',
      quality: lineQuality({ text, confidence, type: 'address' }),
      supportCount: passes.size,
      variantCount: variants.size,
      boundedCrop: components.some((component) => component.boundedCrop),
      passes,
      variants,
      synthetic: true,
      componentTexts,
    },
  ]
}

function classifyLineCluster(cluster) {
  const text = cluster.text
  const words = textWords(text)
  const readableRatio = readableCharacterRatio(text)
  const symbolRatio = symbolCharacterRatio(text)
  const repeatedRatio = repeatedTokenRatio(text)
  const contact = contactEvidence(text)
  const numericNoise =
    /\b\d{7,12}\b/.test(normalizeLineKey(text)) &&
    !contact &&
    !hasPhoneContext(text)
  const addressParts = addressEvidenceParts(text)
  const foods = foodSignalCount(text)
  const specificFoods = specificFoodSignalCount(text)
  const locations = locationSignalCount(text)
  const prices = priceSignalCount(text)
  const domainSignals = domainSignalCount(text)
  const hasVenueWord =
    /\b(?:quan|cafe|coffee|restaurant|nha hang|tiem|bep|bakery)\b/.test(
      normalizeLineKey(text),
    )
  const locationOnly =
    locations > 0 &&
    foods === 0 &&
    !hasVenueWord &&
    !addressParts.hasHouseNumber &&
    words.length <= 4
  const ambiguousLocationFood =
    locations > 0 &&
    foods > 0 &&
    prices === 0 &&
    !hasVenueWord &&
    cluster.supportCount < 2
  const usefulAddressFragment =
    (
      addressParts.hasAddressKeyword ||
      addressParts.hasAdminToken ||
      (
        addressParts.hasHouseNumber &&
        addressParts.streetLike &&
        foods === 0 &&
        prices === 0 &&
        (
          cluster.supportCount >= 2 ||
          (cluster.confidence >= 0.55 && cluster.quality >= 0.55)
        )
      )
    ) &&
    (
      words.length >= 2 ||
      addressParts.hasHouseNumber ||
      addressParts.hasAdminToken
    )
  const cleanMenuLine =
    foods > 0 &&
    (specificFoods > 0 || prices > 0 || cluster.supportCount >= 2) &&
    prices > 0 &&
    words.length >= 2 &&
    words.length <= 12 &&
    readableRatio >= 0.72 &&
    symbolRatio <= 0.22
  const cleanSignLine =
    cluster.type === 'sign' &&
    words.length >= 2 &&
    words.length <= 9 &&
    readableRatio >= 0.78 &&
    symbolRatio <= 0.18 &&
    repeatedRatio < 0.25 &&
    prices < 2 &&
    !locationOnly &&
    !ambiguousLocationFood &&
    (
      cluster.supportCount >= 2 ||
      domainSignals > 0 ||
      hasVenueWord
    )
  const cleanShortSignFragment =
    cluster.type === 'sign' &&
    words.length >= 2 &&
    words.length <= 6 &&
    readableRatio >= 0.82 &&
    symbolRatio <= 0.12 &&
    cluster.quality >= 0.42 &&
    (
      cluster.supportCount >= 2 ||
      domainSignals > 0 ||
      hasVenueWord
    )
  const hugeMergedBlock =
    words.length > 28 ||
    (words.length > 18 && (symbolRatio > 0.18 || repeatedRatio > 0.22))

  let score =
    cluster.quality * 0.56 +
    cluster.confidence * 0.12 +
    Math.min(cluster.supportCount - 1, 3) * 0.07 +
    Math.min(cluster.variantCount - 1, 2) * 0.025 +
    Number(cluster.boundedCrop) * 0.035 +
    Number(Boolean(contact)) * 0.28 +
    Number(addressParts.strong) * 0.22 +
    Number(cleanMenuLine) * 0.13 +
    Number(cleanSignLine) * 0.12

  if (numericNoise) score -= 0.32
  if (symbolRatio > 0.28) score -= symbolRatio * 0.5
  if (repeatedRatio > 0.32) score -= repeatedRatio * 0.55
  if (words.length < 2 && !contact) score -= 0.22
  if (hugeMergedBlock) score -= 0.28
  score = roundScore(Math.max(0, Math.min(1, score)))
  const usefulFoodFragment =
    foods > 0 &&
    (specificFoods > 0 || prices > 0 || cluster.supportCount >= 2) &&
    (
      (words.length >= 2 && score >= 0.3) ||
      (cluster.supportCount >= 2 && score >= 0.25) ||
      (prices > 0 && score >= 0.3)
    )

  let tier = 'rejected'
  let reason = 'insufficient_readability'

  if (hugeMergedBlock) {
    reason = 'unbounded_merged_block'
  } else if (numericNoise) {
    reason = 'invalid_phone_without_context'
  } else if (symbolRatio > 0.42 || readableRatio < 0.55) {
    reason = 'mostly_symbols'
  } else if (repeatedRatio >= 0.5 && !contact && !addressParts.strong) {
    reason = 'repeated_garbage'
  } else if (!words.length) {
    reason = 'no_readable_words'
  } else if (
    contact ||
    addressParts.strong ||
    cleanMenuLine ||
    cleanSignLine ||
    (score >= 0.72 && cluster.supportCount >= 2 && domainSignals > 0)
  ) {
    tier = 'strong'
    reason = contact
      ? contact.kind === 'local_contact'
        ? 'contextual_local_contact'
        : 'valid_vietnamese_phone'
      : addressParts.strong
        ? 'supported_address'
        : cleanMenuLine
          ? 'clean_menu_line'
          : 'clean_sign_consensus'
  } else if (
    usefulAddressFragment ||
    usefulFoodFragment ||
    locationOnly ||
    (cleanShortSignFragment && score >= 0.35) ||
    (hasPhoneContext(text) && /\d{6,}/.test(normalizeLineKey(text))) ||
    (
      cluster.supportCount >= 2 &&
      words.length >= 2 &&
      readableRatio >= 0.68 &&
      score >= 0.4 &&
      (cluster.type !== 'other' || domainSignals > 0)
    ) ||
    (
      cluster.supportCount >= 3 &&
      words.length >= 2 &&
      readableRatio >= 0.75 &&
      score >= 0.55
    ) ||
    (domainSignals > 0 && score >= 0.4)
  ) {
    tier = 'weak'
    reason = usefulAddressFragment
      ? 'partial_address'
      : usefulFoodFragment
        ? 'partial_food_or_menu'
        : locationOnly
          ? 'location_only'
          : cleanShortSignFragment
            ? 'clean_short_sign_fragment'
        : 'useful_low_confidence_context'
  }

  return {
    ...cluster,
    clusterType:
      cluster.clusterType || clusterTypeForText(text, cluster.type),
    quality: score,
    tier,
    reason,
  }
}

function publicFilteredLine(line) {
  return {
    text: capString(line.text, 300),
    displayText: capString(line.displayText || line.text, 300),
    confidence: roundScore(line.confidence),
    type: LINE_TYPES.has(line.type) ? line.type : 'other',
    clusterType: line.clusterType || clusterTypeForText(line.text, line.type),
    quality: roundScore(line.quality),
    supportCount: Math.max(1, Number(line.supportCount) || 1),
    tier: line.tier,
    evidenceVariants: Array.isArray(line.evidenceVariants)
      ? line.evidenceVariants.slice(0, 5).map((variant) => ({
          text: capString(variant.text, 180),
          confidence: roundScore(variant.confidence),
          pass: capString(variant.pass, 80),
          variant: capString(variant.variant, 40),
        }))
      : [],
  }
}

function selectDistinctLines(lines, maximum, against = []) {
  const selected = []
  for (const line of lines) {
    if (
      [...against, ...selected].some(
        (existing) => lineSimilarity(existing.text, line.text) >= 0.68,
      )
    ) {
      continue
    }
    selected.push(line)
    if (selected.length >= maximum) break
  }
  return selected
}

export function filterOcrEvidenceLines(assessments = []) {
  const groupedClusters = addGroupedAddressCandidate(
    clusterLineCandidates(assessments),
  )
  const consumedAddressComponents = groupedClusters
    .filter((cluster) => cluster.synthetic && cluster.clusterType === 'address_admin')
    .flatMap((cluster) => cluster.componentTexts || [])
  const canonicalClusters = groupedClusters.filter(
    (cluster) =>
      cluster.synthetic ||
      !consumedAddressComponents.some(
        (text) => lineSimilarity(text, cluster.text) >= 0.8,
      ),
  )
  const classified = canonicalClusters
    .map(classifyLineCluster)
    .sort(
      (left, right) =>
        right.quality - left.quality ||
        right.supportCount - left.supportCount ||
        right.confidence - left.confidence,
    )

  const strongLines = selectDistinctLines(
    classified.filter((line) => line.tier === 'strong'),
    MAX_STRONG_LINES,
  )
  const weakCandidates = classified.filter(
    (line) =>
      line.tier === 'weak' &&
      (
        line.type !== 'other' ||
        domainSignalCount(line.text) > 0 ||
        line.supportCount >= 2
      ),
  )
  const weakLines = selectDistinctLines(
    weakCandidates,
    MAX_WEAK_LINES,
    strongLines,
  )
  const rejectedLines = classified
    .filter((line) => line.tier === 'rejected')
    .slice(0, MAX_REJECTED_DEBUG_LINES)
    .map((line) => ({
      text: capString(line.text, 180),
      displayText: capString(line.displayText || line.text, 180),
      clusterType: line.clusterType,
      confidence: roundScore(line.confidence),
      quality: roundScore(line.quality),
      supportCount: line.supportCount,
      reason: line.reason,
      evidenceVariants: (line.evidenceVariants || []).slice(0, 3),
    }))

  return {
    strongLines: strongLines.map(publicFilteredLine),
    weakLines: weakLines.map(publicFilteredLine),
    rejectedLines,
    rejectedCount: classified.filter((line) => line.tier === 'rejected').length,
    canonicalClusters: classified.slice(0, 16).map((line) => ({
      text: capString(line.text, 180),
      displayText: capString(line.displayText || line.text, 180),
      clusterType: line.clusterType,
      tier: line.tier,
      quality: roundScore(line.quality),
      confidence: roundScore(line.confidence),
      supportCount: line.supportCount,
      evidenceVariants: (line.evidenceVariants || []).slice(0, 5),
    })),
  }
}

function publicEvidence(assessment, { warnings, debug, assessments = [] }) {
  const evidenceWarnings = [
    ...new Set([
      ...(Array.isArray(warnings) ? warnings : []),
      ...(Array.isArray(assessment?.warnings) ? assessment.warnings : []),
    ]),
  ]
  const filtered = filterOcrEvidenceLines(assessments)
  const lines = [...filtered.strongLines, ...filtered.weakLines]
  const usable = lines.length > 0
  const text = usable
    ? capString(lines.map((line) => line.text).join('\n'), MAX_TEXT_LENGTH)
    : null
  const confidence = lines.length
    ? Math.max(
        ...lines.map((line) => {
          const combined =
            line.confidence * 0.45 + line.quality * 0.55
          return line.tier === 'weak' ? Math.min(0.49, combined) : combined
        }),
      )
    : 0

  return {
    text,
    usable,
    ocrUsable: usable,
    confidence: roundScore(confidence),
    reason: usable ? 'usable' : assessment?.reason || 'low_confidence',
    lines,
    strongLines: filtered.strongLines,
    weakLines: filtered.weakLines,
    warnings: evidenceWarnings,
    debug: {
      ...debug,
      lineFiltering: {
        strongCount: filtered.strongLines.length,
        weakCount: filtered.weakLines.length,
        rejectedCount: filtered.rejectedCount,
      },
      canonicalClusters: filtered.canonicalClusters,
      rejectedLines: filtered.rejectedLines,
    },
    implemented: true,
  }
}

export async function extractLocalOcrSignals(
  { image } = {},
  {
    recognizeImage = recognizeWithLocalTesseract,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPasses = DEFAULT_MAX_PASSES,
  } = {},
) {
  const preparedResult = await preprocessLocalOcrImage({ image })
  if (preparedResult.error) return preparedResult.error

  const { prepared } = preparedResult
  const baseWarnings = [...prepared.warnings]
  const languages = configuredLanguages()
  const passTemplates = buildPasses(prepared, languages, maxPasses)
  const assessments = []
  const passes = []

  for (const pass of passTemplates) {
    try {
      const result = await withTimeout(
        recognizeImage({
          buffer: pass.buffer,
          language: pass.language,
          psm: pass.psm,
          rectangle: pass.rectangle,
          label: pass.label,
          variant: pass.variant,
        }),
        timeoutMs,
      )
      const assessment = assessRecognitionResult(result, pass)
      assessments.push(assessment)
      passes.push(passDebug(pass, assessment))
    } catch (error) {
      if (error?.code === 'timeout') {
        if (recognizeImage === recognizeWithLocalTesseract) {
          await resetWorker(pass.language)
        }
        const debug = {
          implemented: true,
          engine: 'tesseract.js',
          image: imageDebug(prepared),
          selectedPass: null,
          passes: [
            ...passes,
            passDebug(pass, null, error),
          ].slice(0, MAX_DEBUG_PASSES),
        }
        return failureEvidence('timeout', {
          warnings: [...baseWarnings, 'Local OCR timed out.'],
          debug,
        })
      }

      passes.push(passDebug(pass, null, error))
    }
  }

  const best = chooseBestAssessment(assessments)
  const debug = {
    implemented: true,
    engine: 'tesseract.js',
    image: imageDebug(prepared),
    selectedPass: best?.debug?.pass || null,
    selectedVariant: best?.debug?.variant || null,
    selectedQualityScore: best?.debug?.qualityScore || 0,
    passes: passes.slice(0, MAX_DEBUG_PASSES),
    rawText: capString(best?.debug?.rawText || '', MAX_DEBUG_TEXT_LENGTH),
    cleanedText: capString(best?.debug?.cleanedText || '', MAX_DEBUG_TEXT_LENGTH),
  }

  if (!best) {
    return failureEvidence('ocr_error', {
      warnings: [...baseWarnings, 'Local OCR could not process this image.'],
      debug,
    })
  }

  return publicEvidence(best, {
    warnings: baseWarnings,
    debug,
    assessments,
  })
}

export async function terminateLocalOcrWorkers() {
  await recognitionQueue.catch(() => {})
  await Promise.all([...workerPromises.keys()].map((language) => resetWorker(language)))
}
