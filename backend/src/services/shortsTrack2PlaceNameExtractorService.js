import { safePreNormalize } from './shortsAddressNormalizer.js'

const AREA_PATTERN =
  /\b(?:quan|district|q\.?)\s*\d{1,2}|\b(?:phuong|ward|p\.?)\s*\d{1,2}|\b(?:binh\s*thanh|go\s*vap|tan\s*binh|thu\s*duc|hcm|ho\s*chi\s*minh|sai\s*gon|ha\s*noi|hanoi)\b/ig
const SOCIAL_NOISE_PATTERN =
  /https?:\/\/|www\.|facebook|instagram|tiktok|youtube|@|(?:^|\s)#|follow|subscribe|email|contact|copyright/i
const ADDRESS_PATTERN =
  /\b(?:dia\s*chi|address|dc|d\/c)\s*:|\b\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?\s+(?:duong|d\.|street|hem|ngo|alley|lane)\b/i
const GENERIC_PATTERN =
  /\b(?:top(?:\s*\d+)?|tong\s+hop|nhung\s+quan|cac\s+quan|quan\s+ngon|mon\s+ngon|nen\s+thu|food\s*tour|an\s+sap|review\s+nhieu\s+quan|phan\s*\d+|part\s*\d+|ep\s*\d+|episode|series)\b/i
const DISH_ONLY_PATTERN =
  /^(?:pho|bun|banh|com|mi|hu\s*tieu|lau|che|tra\s*sua|ca\s*phe|coffee|milk\s*tea)(?:\s+[a-z0-9]+){0,3}$/i

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function foldText(value) {
  return safePreNormalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.,:;#@\s&'/-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function stripArea(value) {
  return safePreNormalize(value)
    .replace(/\b(?:tai|o|ở|tại)\s+(?:quan|district|q\.?)\s*\d{1,2}.*$/iu, '')
    .replace(/\b(?:quan|district|q\.?)\s*\d{1,2}.*$/iu, '')
    .replace(/\b(?:binh\s*thanh|go\s*vap|tan\s*binh|thu\s*duc|hcm|ho\s*chi\s*minh|sai\s*gon|ha\s*noi|hanoi)\b.*$/iu, '')
    .replace(/[-|:]+$/u, '')
    .trim()
}

function textLines(value) {
  return safeString(value, 3000)
    .split(/\r?\n|[;|]+/u)
    .map((line) => safePreNormalize(line))
    .filter(Boolean)
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values.map((item) => safePreNormalize(item)).filter(Boolean)) {
    const key = foldText(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function areaSignalsFrom(text) {
  const folded = foldText(text)
  const matches = []
  resetAreaPattern()
  for (const match of folded.matchAll(AREA_PATTERN)) {
    matches.push(match[0])
  }
  resetAreaPattern()
  return matches
}

function looksOnlyArea(value) {
  const folded = foldText(value)
  resetAreaPattern()
  const matched = Boolean(folded && AREA_PATTERN.test(folded.replace(/^o\s+|^tai\s+/i, '')))
  resetAreaPattern()
  return matched
}

function resetAreaPattern() {
  AREA_PATTERN.lastIndex = 0
}

function isSafePlaceName(value) {
  const text = safePreNormalize(value)
  const folded = foldText(text)
  if (text.length < 2 || text.length > 80) return false
  if (SOCIAL_NOISE_PATTERN.test(text)) return false
  if (ADDRESS_PATTERN.test(folded)) return false
  if (GENERIC_PATTERN.test(folded)) return false
  if (DISH_ONLY_PATTERN.test(folded)) return false
  resetAreaPattern()
  if (looksOnlyArea(text)) return false
  if (!/[a-z\p{L}]/iu.test(text)) return false
  return true
}

function descriptionLineBeforeAddress(description) {
  const lines = textLines(description)
  const candidates = []
  for (let index = 1; index < lines.length; index += 1) {
    const current = foldText(lines[index])
    if (ADDRESS_PATTERN.test(current)) candidates.push(lines[index - 1])
  }
  return candidates
}

function firstCleanDescriptionLine(description) {
  return textLines(description)
    .find((line) => isSafePlaceName(stripArea(line))) || ''
}

function jsonLdNames(metadata = {}) {
  return (Array.isArray(metadata.jsonldObjects) ? metadata.jsonldObjects : [])
    .flatMap((item) => [item?.name, item?.headline])
    .filter(Boolean)
}

function hasMultiplePlaces(text) {
  const folded = foldText(text)
  if (/\s+(?:vs|va|,)\s+/.test(folded) && /\b(?:quan|tiem|cafe|coffee|restaurant|bistro)\b/.test(folded)) {
    return true
  }
  return textLines(text).filter((line) => /^[-*]|\d+[.)]/u.test(line)).length > 1
}

function result(status, reason, signals, diagnostics = []) {
  return {
    status,
    reason,
    signals: {
      placeNames: uniqueStrings(signals.placeNames).slice(0, 4),
      areas: uniqueStrings(signals.areas).slice(0, 6),
      dishes: uniqueStrings(signals.dishes).slice(0, 4),
      sourceFields: uniqueStrings(signals.sourceFields).slice(0, 8),
    },
    diagnostics,
  }
}

export function extractPlaceNameSignals(metadata = {}, context = {}) {
  void context

  const title = safeString(metadata.title, 300)
  const description = safeString(metadata.descriptionRawFromYoutube || metadata.description, 3000)
  const pageMetadataText = safeString(metadata.pageMetadataText, 2000)
  const combined = [title, description, pageMetadataText].filter(Boolean).join('\n')
  const foldedCombined = foldText(combined)
  const signals = {
    placeNames: [],
    areas: [],
    dishes: [],
    sourceFields: [],
  }

  if (GENERIC_PATTERN.test(foldText(title)) || GENERIC_PATTERN.test(foldedCombined)) {
    return result('BLOCKED', 'GENERIC_LIST_METADATA', signals)
  }

  if (hasMultiplePlaces(title) || hasMultiplePlaces(description)) {
    return result('NEEDS_REVIEW', 'MULTIPLE_PLACE_SIGNALS', signals)
  }

  signals.areas.push(...areaSignalsFrom(combined))
  resetAreaPattern()

  for (const value of [
    ...descriptionLineBeforeAddress(description),
    firstCleanDescriptionLine(description),
    stripArea(title),
    ...jsonLdNames(metadata),
  ]) {
    const candidate = stripArea(value)
    if (isSafePlaceName(candidate)) signals.placeNames.push(candidate)
  }

  const dishMatches = foldedCombined.match(/\b(?:pho|bun|banh|com|mi|hu\s*tieu|lau|che|tra\s*sua|ca\s*phe|coffee|milk\s*tea)\b/ig)
  if (dishMatches) signals.dishes.push(...dishMatches)

  if (signals.placeNames.length) {
    if (title) signals.sourceFields.push('title')
    if (description) signals.sourceFields.push('description')
    if (jsonLdNames(metadata).length) signals.sourceFields.push('jsonld')
  }

  if (!signals.placeNames.length) {
    return result('NO_SIGNALS', 'NO_SAFE_PLACE_NAME_SIGNAL', signals)
  }

  if (!signals.areas.length) {
    return result('OK', 'PLACE_NAME_WITHOUT_AREA_SIGNAL', signals)
  }

  return result('OK', 'PLACE_NAME_SIGNALS_FOUND', signals)
}

export const __shortsTrack2PlaceNameExtractorTestUtils = {
  foldText,
  isSafePlaceName,
}

export default {
  extractPlaceNameSignals,
}
