import { normalizeShortsTrack2V3Text } from './shortsTrack2V3EvidenceStoreService.js'

export const SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES = Object.freeze({
  HOUSE_NUMBER_LIKE: 'HOUSE_NUMBER_LIKE',
  PRICE: 'PRICE',
  OPENING_HOUR: 'OPENING_HOUR',
  PHONE: 'PHONE',
  FLOOR_OR_LEVEL: 'FLOOR_OR_LEVEL',
  LIST_OR_COUNT: 'LIST_OR_COUNT',
  ADMIN_NUMBER: 'ADMIN_NUMBER',
  AMBIGUOUS_CONTEXT_NUMBER: 'AMBIGUOUS_CONTEXT_NUMBER',
})

const HOUSE_TOKEN_PATTERN_SOURCE = String.raw`\d{1,5}(?:[a-z]\d{0,3})?(?:\/\d{1,5}(?:[a-z]\d{0,3})?)?(?:-\d{1,5}(?:[a-z]\d{0,3})?)?`
const NUMBER_PATTERN = new RegExp(`\\d{8,11}|${HOUSE_TOKEN_PATTERN_SOURCE}`, 'giu')
const NON_HOUSE_CONTEXTS = new Set([
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.OPENING_HOUR,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PHONE,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.FLOOR_OR_LEVEL,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.LIST_OR_COUNT,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER,
])

function safeText(value, maxLength = 12000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
}

function folded(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
}

function boundedContext(text, start, end, radius = 48) {
  return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius))
}

function looksLikeMeasurementIngredientContext({ before = '', after = '', rawNumberToken = '' } = {}) {
  const token = folded(rawNumberToken)
  const measurementToken = /^(?:\d+(?:[.,]\d+)?|\d+\/\d+)(?:m|ml|g|gr|kg|mc|mcf)$/iu.test(token)
  const ingredientAfter = /^\s*[-,:;]?\s*(?:duong|hat nem|bot ngot|nuoc mam|nuoc tuong|nuoc loc|tieu|muoi)\b/iu.test(after)
  return measurementToken || ingredientAfter && /(?:^|\s)(?:m|ml|g|gr|kg|mc|mcf)\s*$/iu.test(before)
}

function branchLabelBefore(before = '') {
  return /(?:^|[\s([{])(?:cs|cn|co\s*so|chi\s*nhanh)\s*\d{1,3}\s*[\\|/:;,.()\[\]{}-]*\s*$/iu.test(before)
}

function namedStreetImmediatelyAfter(after = '') {
  const clean = String(after || '')
    .replace(/[\\|]+/gu, ' ')
    .replace(/^\s*[/:;,.()\[\]{}-]+\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
  const match = clean.match(/^([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){1,5})(?=$|[\s,;|)\]}])/iu)
  if (!match) return false
  const words = match[1].match(/[\p{L}]{2,}/gu) || []
  return words.length >= 2 && !/^(?:hat\s+nem|nuoc\s+mam|nuoc\s+tuong|nuoc\s+loc|bot\s+ngot)$/iu.test(folded(match[1]))
}

function classifyToken({ text, rawNumberToken, start, end }) {
  const before = folded(text.slice(Math.max(0, start - 48), start))
  const after = folded(text.slice(end, Math.min(text.length, end + 72)))
  const local = folded(boundedContext(text, start, end, 48))
  const compactDigits = rawNumberToken.replace(/\D/gu, '')

  if (looksLikeMeasurementIngredientContext({ before, after, rawNumberToken })) {
    return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.AMBIGUOUS_CONTEXT_NUMBER
  }

  if (
    compactDigits.length >= 8 ||
    /(?:goi|dien thoai|sdt|phone|hotline)\s*(?:so\s*)?$/iu.test(before) ||
    /^(?:\s*de\s+(?:dat|lien he|goi))/iu.test(after)
  ) return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PHONE

  if (/(?:tang|lau|floor|level)\s*(?:tret\s*)?$/iu.test(before) || /ground\s+floor/iu.test(local)) {
    return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.FLOOR_OR_LEVEL
  }

  if (
    /(?:gia|chi|combo)\s*(?:tu\s*)?$/iu.test(before) ||
    /^(?:\s*)(?:k\b|nghin\b|ngan\b|dong\b|vnd\b|vnđ\b)/iu.test(after)
  ) return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE

  if (
    /(?:tu|luc|mo cua|ban tu)\s*$/iu.test(before) && /^\s*(?:gio|h\b|:)/iu.test(after) ||
    /(?:gio|h)\s*(?:sang|toi|dem)?\s*$/iu.test(before) ||
    /^\s*(?:gio|h\b|:\d{2})/iu.test(after)
  ) return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.OPENING_HOUR

  if (/(?:^|[\s,.(])(?:quan|q\.?|phuong|p\.?|ward|district|huyen|xa)\s*$/iu.test(before)) {
    return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER
  }

  if (
    /(?:top|list|phan|part|so luong|(?:mon|lan|phan)\s+thu|khua|cat|rach|ke)\s*$/iu.test(before) ||
    /^\s*(?:mon|quan|dia diem|nguoi)\b/iu.test(after)
  ) return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.LIST_OR_COUNT

  const directlyIntroduced = /(?:dia chi|tai so|o so|nam tai so|nam o so|so)\s*$/iu.test(before)
  const streetMarkerAfter = /^\s*[-,:;]?\s*(?:duong|d\.|street|st\.?|road|rd\.|hem|ngo|ngach)\b/iu.test(after)
  const namedStreetBeforeAdmin = /^\s*[-,:;]?\s*[\p{L}][\p{L}\s'.-]{2,80}?(?:,|\s)+(?:phuong|p\.?|quan|q\.?|ward|district|tp\.?|thanh pho|huyen|xa)\b/iu
    .test(after)
  const compoundHouseNumber = /[\/-]/u.test(rawNumberToken)
  const structuredAlphanumericHouse = /^\d{1,5}[a-z]\d{0,3}$/iu.test(rawNumberToken)
  const branchAddressContext = branchLabelBefore(before) && namedStreetImmediatelyAfter(after)
  const structuredHouseBeforeNamedStreet = (compoundHouseNumber || structuredAlphanumericHouse) &&
    namedStreetImmediatelyAfter(after)

  if (
    directlyIntroduced ||
    streetMarkerAfter ||
    namedStreetBeforeAdmin ||
    compoundHouseNumber ||
    branchAddressContext ||
    structuredHouseBeforeNamedStreet
  ) {
    return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE
  }

  if (/(?:buffet|combo)\s*[-:]?\s*$/iu.test(before)) {
    return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE
  }

  return SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.AMBIGUOUS_CONTEXT_NUMBER
}

export function classifyShortsTrack2V3NumericContexts({
  text = '',
  sourceType = null,
  sourceId = null,
} = {}) {
  const rawText = safeText(text)
  const classifications = []
  NUMBER_PATTERN.lastIndex = 0
  let match
  while ((match = NUMBER_PATTERN.exec(rawText)) !== null) {
    let rawNumberToken = match[0]
    let end = match.index + rawNumberToken.length
    if (/^\d+[kK]$/u.test(rawNumberToken)) {
      rawNumberToken = rawNumberToken.slice(0, -1)
      end -= 1
    }
    classifications.push({
      rawNumberToken,
      contextClass: classifyToken({
        text: rawText,
        rawNumberToken,
        start: match.index,
        end,
      }),
      boundedSourceText: boundedContext(rawText, match.index, end),
      sourceType: sourceType || null,
      sourceId: sourceId || null,
      start: match.index,
      end,
    })
  }
  return classifications
}

export function isShortsTrack2V3RejectedHouseNumberContext(contextClass) {
  return NON_HOUSE_CONTEXTS.has(contextClass)
}

export default {
  classifyShortsTrack2V3NumericContexts,
  isShortsTrack2V3RejectedHouseNumberContext,
}
