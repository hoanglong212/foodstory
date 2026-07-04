import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'

const CONTIGUOUS_HOUSE_NUMBER_PATTERN = /\b\d{1,5}(?:\/\d{1,5})+\b/gu
const SPLIT_HOUSE_NUMBER_PATTERN = /\b\d{1,5}\s+\d{1,4}\/\d{1,5}\b/gu
const PLAIN_HOUSE_NUMBER_PATTERN = /\b\d{1,5}[a-z]?\b/giu
const DATE_TIME_PATTERNS = Object.freeze([
  /\b(?:\d{1,2}[-/.]){2,4}\d{2,4}\b/gu,
  /\b\d{1,2}(?::|h)\d{2}\s*[-â€“â€”]\s*\d{1,2}(?::|h)\d{2}\b/giu,
  /\b\d{1,2}-\d{2}-\d{1,2}\/\d{2}\b/gu,
  /\b\d{1,2}h\d{2}\b/giu,
])

function safeString(value, maxLength = 2000) {
  return String(value ?? '').slice(0, maxLength)
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function replaceTracked(text, pattern, replacement, flag, applied) {
  const next = text.replace(pattern, replacement)
  if (next !== text) applied.push(flag)
  return next
}

export function normalizeShortsTrack2V3OcrAdminText(value = '') {
  const original = safeString(value)
  const normalizationApplied = []
  let text = original

  text = replaceTracked(
    text,
    /\b(?:phÆ°á»ng|phuÃ¶ng)\b/giu,
    'Phường',
    'NORMALIZED_WARD_TEXT',
    normalizationApplied,
  )
  text = text.replace(
    /\b(?:phường|phuòng|phuöng|phưdng|phưng|phuưng|phưròng|phÆ°á»ng|phuÃ²ng|phÆ°dng|phÆ°ng|phuÆ°ng|phÆ°rÃ²ng|phuÃ¶ng|phuong|phudng|phung|phuung|phurong)\s*([0-9o]{1,2})\b/giu,
    (match, digits) => {
      const normalizedDigits = String(digits).replace(/o/giu, '0')
      if (match !== `Phường ${normalizedDigits}`) normalizationApplied.push('NORMALIZED_WARD_TEXT')
      if (/o/iu.test(String(digits))) normalizationApplied.push('NORMALIZED_ADMIN_DIGIT')
      return `Phường ${normalizedDigits}`
    },
  )
  text = text.replace(
    /\b(?:quận|quân|quáº­n|quÃ¢n|quan|qun|q\.?)[\s.]*([0-9o]{1,2})\b/giu,
    (match, digits) => {
      const normalizedDigits = String(digits).replace(/o/giu, '0')
      if (/o/iu.test(String(digits))) normalizationApplied.push('NORMALIZED_ADMIN_DIGIT')
      if (match !== `Quận ${normalizedDigits}`) normalizationApplied.push('NORMALIZED_DISTRICT_TEXT')
      return `Quận ${normalizedDigits}`
    },
  )
  text = text.replace(
    /(^|[\s,;])(\d{1,5}(?:\/\d{1,5})?\s+)(?:d\.|đ\.|Ä‘\.|duong|đuong|Ä‘uong|u\.)\s+(?=\p{L}{2,})/giu,
    (match, prefix, house) => {
      normalizationApplied.push('NORMALIZED_STREET_MARKER')
      return `${prefix}${house}Đ. `
    },
  )

  const spaced = text
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s+([,.;:])/gu, '$1')
    .trim()
  if (spaced !== text) normalizationApplied.push('NORMALIZED_SPACING')

  return {
    text: spaced,
    normalizationApplied: unique(normalizationApplied),
  }
}

export function stripShortsTrack2V3DateTimeNoise(value = '') {
  const removed = []
  let text = normalizeShortsTrack2V3Text(value)
  for (const pattern of DATE_TIME_PATTERNS) {
    text = text.replace(pattern, (match) => {
      removed.push(match)
      return ' '
    })
  }
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/gu, ' ').replace(/^[,;:\s-]+|[,;:\s-]+$/gu, '').trim())
    .filter(Boolean)
    .join('\n')
  return {
    text,
    removed: unique(removed),
    dateTimeRemoved: removed.length > 0,
  }
}

function lineBounds(text, index) {
  const start = Math.max(0, text.lastIndexOf('\n', index - 1) + 1)
  const newline = text.indexOf('\n', index)
  return { start, end: newline >= 0 ? newline : text.length }
}

function contextSignature(text, observation) {
  if (!observation) return null
  const bounds = lineBounds(text, observation.index)
  const line = text.slice(bounds.start, bounds.end)
  const localIndex = Math.max(0, observation.index - bounds.start)
  const afterHouse = line.slice(localIndex + observation.token.length)
  const normalized = normalizeShortsTrack2V3OcrAdminText(afterHouse).text
  const foldedText = foldVietnameseText(normalized)
    .replace(/\b(?:phuong|quan)\s*([0-9o]+)\b/giu, (match, digits) =>
      match.replace(String(digits), String(digits).replace(/o/giu, '0'))
    )
  const adminBounded = foldedText.match(
    /^(.{0,140}?\bquan\s*[0-9o]+\b)/iu,
  )?.[1] || foldedText.match(
    /^(.{0,140}?\bphuong\s*[0-9o]+\b)/iu,
  )?.[1] || foldedText.slice(0, 100)
  const folded = adminBounded.replace(/[^a-z0-9]+/gu, '').slice(0, 160)
  return folded ? `context:${folded}` : null
}

function overlapsRanges(index, end, ranges = []) {
  return ranges.some(([start, stop]) => index < stop && end > start)
}

function isPlainAddressNumber(text, match) {
  const index = match.index ?? 0
  const end = index + match[0].length
  const before = text.slice(Math.max(0, index - 2), index)
  const afterCharacter = text.slice(end, end + 1)
  if (/[\d/.:h-]\s*$/iu.test(before) || /^[\d/.:h)-]/iu.test(afterCharacter)) return false
  if (/^[kKoO]\b/u.test(text.slice(end))) return false

  const bounds = lineBounds(text, index)
  const namedAdminAddress = parseShortsTrack2V3NamedAdminAddress(
    text.slice(bounds.start, bounds.end),
  )
  if (namedAdminAddress?.houseNumber === match[0]) return true

  const after = text.slice(end, Math.min(text.length, end + 240))
  const foldedAfter = foldVietnameseText(normalizeShortsTrack2V3OcrAdminText(after).text)
  const adminPattern = /\b(?:phuong|phudng|phung|phuung|phurong|quan|qun|q\.?)\s*\d+\b/iu
  const adminMatch = foldedAfter.match(adminPattern)
  if (!adminMatch) return false
  const beforeAdmin = foldedAfter.slice(0, adminMatch.index)
  const hasStreetMarker = /(?:^|[\s,;])(?:duong|d\.?|u\.)(?=$|[\s,;])/iu.test(beforeAdmin)
  const streetWords = beforeAdmin.match(/[a-z]{2,}/giu) || []
  return hasStreetMarker || streetWords.length >= 2
}

export function extractShortsTrack2V3HouseNumberObservations(value = '') {
  const text = stripShortsTrack2V3DateTimeNoise(value).text
  if (!text) return []
  const observations = []
  const occupiedRanges = []

  for (const match of text.matchAll(SPLIT_HOUSE_NUMBER_PATTERN)) {
    const token = match[0].replace(/[ \t]+/gu, ' ')
    const index = match.index ?? 0
    const end = index + match[0].length
    occupiedRanges.push([index, end])
    observations.push({
      token,
      index,
      end,
      kind: 'split_digit_fragments',
      exactContiguousToken: false,
      longDigitRun: false,
    })
  }

  for (const match of text.matchAll(CONTIGUOUS_HOUSE_NUMBER_PATTERN)) {
    const index = match.index ?? 0
    const end = index + match[0].length
    if (overlapsRanges(index, end, occupiedRanges)) continue
    const token = match[0]
    const prefix = token.split('/')[0]
    occupiedRanges.push([index, end])
    observations.push({
      token,
      index,
      end,
      kind: 'contiguous_token',
      exactContiguousToken: true,
      longDigitRun: prefix.length >= 5,
    })
  }

  for (const match of text.matchAll(PLAIN_HOUSE_NUMBER_PATTERN)) {
    const index = match.index ?? 0
    const end = index + match[0].length
    if (overlapsRanges(index, end, occupiedRanges) || !isPlainAddressNumber(text, match)) continue
    occupiedRanges.push([index, end])
    observations.push({
      token: match[0],
      index,
      end,
      kind: 'plain_address_number',
      exactContiguousToken: true,
      longDigitRun: match[0].replace(/\D/gu, '').length >= 5,
    })
  }

  return observations
    .sort((left, right) => left.index - right.index)
    .map((observation) => ({
      ...observation,
      contextSignature: contextSignature(text, observation),
    }))
}

function baseOcrEvidence(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).filter((item) =>
    item && ['local_paddleocr', 'local_easyocr', 'local_tesseract'].includes(item.source)
  )
}

function candidateEvidence(candidate = {}, evidence = []) {
  const ids = new Set(Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds : [])
  const direct = (Array.isArray(evidence) ? evidence : []).filter((item) => ids.has(item?.id))
  const referencedIds = new Set(direct.flatMap((item) =>
    Array.isArray(item?.evidenceIds) ? item.evidenceIds : []
  ))
  return baseOcrEvidence(evidence).filter((item) =>
    ids.has(item.id) || referencedIds.has(item.id)
  )
}

function observationRecords(evidence = []) {
  return baseOcrEvidence(evidence).flatMap((item) =>
    extractShortsTrack2V3HouseNumberObservations(item.rawText || item.normalizedText)
      .map((observation) => ({
        ...observation,
        evidenceId: item.id,
        source: item.source,
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
      }))
  )
}

function exactTokenSupported(observation, evidenceItems) {
  if (!observation?.token) return false
  return evidenceItems.some((item) =>
    extractShortsTrack2V3HouseNumberObservations(item.rawText || item.normalizedText)
      .some((sourceObservation) =>
        sourceObservation.token === observation.token &&
        sourceObservation.kind === observation.kind
      )
  )
}

function cleanAdminText(value = '') {
  const folded = foldVietnameseText(value)
  return /\bphuong\s+\d+\b/u.test(folded) && /\bquan\s+\d+\b/u.test(folded)
}

function cleanPlaceName(value = '') {
  const text = safeString(value, 200).trim()
  return Boolean(text && !/[*?_|~]/u.test(text) && /\p{L}{2,}/u.test(text))
}

export function analyzeShortsTrack2V3HouseNumberCandidate(candidate = {}, evidence = []) {
  const originalAddressFragment = normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || '',
  )
  const normalized = normalizeShortsTrack2V3OcrAdminText(originalAddressFragment)
  const withoutDateTime = stripShortsTrack2V3DateTimeNoise(normalized.text)
  const candidateObservation = extractShortsTrack2V3HouseNumberObservations(
    originalAddressFragment,
  )[0] || null
  const sourceEvidence = candidateEvidence(candidate, evidence)
  const records = observationRecords(evidence)
  const sameContextRecords = candidateObservation?.contextSignature
    ? records.filter((record) => record.contextSignature === candidateObservation.contextSignature)
    : records
  const houseNumberAlternatives = unique(sameContextRecords.map((record) => record.token)).slice(0, 12)
  const houseNumberConflict = houseNumberAlternatives.length > 1
  const exactEvidenceToken = exactTokenSupported(candidateObservation, sourceEvidence)
  const collapsedCandidateToken = candidateObservation?.token.replace(/\s+/gu, '') || ''
  const conflictsWithSplitAlternative = Boolean(
    candidateObservation?.kind === 'contiguous_token' &&
      sameContextRecords.some((record) =>
        record.kind === 'split_digit_fragments' &&
        record.token.replace(/\s+/gu, '') === collapsedCandidateToken
      ),
  )
  const splitDigitFragments = candidateObservation?.kind === 'split_digit_fragments'
  const unsupportedMergedToken = Boolean(
    candidateObservation?.kind === 'contiguous_token' && !exactEvidenceToken,
  )
  const noisyHouseNumber = Boolean(
    candidateObservation && (
      splitDigitFragments ||
      unsupportedMergedToken ||
      conflictsWithSplitAlternative ||
      houseNumberConflict
    )
  )
  const supportingRecords = candidateObservation
    ? sameContextRecords.filter((record) =>
        record.token === candidateObservation.token && record.kind === candidateObservation.kind
      )
    : []
  const supportingEngineCount = new Set(supportingRecords.map((record) => record.source)).size
  const hasTimeArtifact = withoutDateTime.dateTimeRemoved

  let selectionAdjustment = exactEvidenceToken ? 8 : -100
  if (candidateObservation?.kind === 'contiguous_token' || candidateObservation?.kind === 'plain_address_number') {
    selectionAdjustment += 5
  }
  if (splitDigitFragments) selectionAdjustment -= 8
  if (houseNumberConflict) selectionAdjustment -= 8
  if (candidateObservation?.longDigitRun && houseNumberConflict) selectionAdjustment -= 45
  if (conflictsWithSplitAlternative) selectionAdjustment -= 35
  if (cleanAdminText(withoutDateTime.text)) selectionAdjustment += 6
  if (!hasTimeArtifact && cleanAdminText(withoutDateTime.text)) selectionAdjustment += 3
  if (hasTimeArtifact) selectionAdjustment -= 6
  selectionAdjustment += Math.min(
    18,
    Math.max(0, supportingRecords.length - 1) * 2 +
      Math.max(0, supportingEngineCount - 1) * 5,
  )
  if (cleanPlaceName(candidate.placeName)) selectionAdjustment += 5
  else if (candidate.placeName) selectionAdjustment -= 5

  return {
    originalAddressFragment,
    normalizedAddressFragment: withoutDateTime.text,
    houseNumberToken: candidateObservation?.token || null,
    houseNumberAlternatives,
    houseNumberConflict,
    normalizationApplied: unique([
      ...normalized.normalizationApplied,
      ...(withoutDateTime.dateTimeRemoved ? ['REMOVED_DATE_TIME_NOISE'] : []),
    ]),
    dateTimeNoiseRemoved: withoutDateTime.removed,
    exactEvidenceToken,
    noisyHouseNumber,
    selectionAdjustment,
    contextSignature: candidateObservation?.contextSignature || null,
  }
}

export default {
  analyzeShortsTrack2V3HouseNumberCandidate,
  extractShortsTrack2V3HouseNumberObservations,
  normalizeShortsTrack2V3OcrAdminText,
  stripShortsTrack2V3DateTimeNoise,
}
