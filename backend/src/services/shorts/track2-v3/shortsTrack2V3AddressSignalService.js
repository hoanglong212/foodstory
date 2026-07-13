import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'

export const SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES = Object.freeze({
  STRONG_ADDRESS_ANCHOR: 'STRONG_ADDRESS_ANCHOR',
  HOUSE_STREET_PARTIAL: 'HOUSE_STREET_PARTIAL',
  ADMIN_PARTIAL: 'ADMIN_PARTIAL',
  EXPLICIT_STREET_PARTIAL: 'EXPLICIT_STREET_PARTIAL',
  HOUSE_ADMIN_PARTIAL: 'HOUSE_ADMIN_PARTIAL',
  HOUSE_ONLY: 'HOUSE_ONLY',
  NON_ADDRESS: 'NON_ADDRESS',
})

function safeText(value, maxLength = 3000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
}

function withoutDateTimeNoise(value = '') {
  return String(value || '')
    .replace(/\b(?:\d{1,2}[-/.]){2,4}\d{2,4}\b/gu, ' ')
    .replace(/\b\d{1,2}(?::|h)\d{2}\s*[-–—]\s*\d{1,2}(?::|h)\d{2}\b/giu, ' ')
    .replace(/\b\d{1,2}h\d{2}\b/giu, ' ')
}

function measurementIngredientNoise(folded = '') {
  if (!folded) return false
  const measurementIngredientPattern = /(?:^|[\s,;|])(?:\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:m|ml|g|gr|kg|mc|mcf|muong|thia)\s*(?:hat\s+nem|bot\s+ngot|duong|nuoc\s+mam|nuoc\s+tuong|nuoc\s+loc|tieu(?:\s+xay)?|muoi)\b/iu
  if (!measurementIngredientPattern.test(folded)) return false

  // Preserve a real address such as "2M đường Nguyễn Văn Cừ, Phường 4, Quận 5".
  // The recipe ambiguity is only applied when the measurement/ingredient pattern
  // is not independently followed by named-street plus administrative structure.
  const hasAddressAdmin = /\b(?:phuong|phudng|phung|phuung|phurong|p\.?\s*\d+|quan|qun|q\.?\s*\d+|district|ward|tp\.?|thanh\s+pho)\b/iu
    .test(folded)
  const hasNamedStreetAfterMarker = /\b(?:duong|d\.|street|st\.?|road|rd\.?)\s+(?:so\s*\d+[a-z]?|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){1,5})(?=\s*(?:,|;|\||\b(?:phuong|p\.?|quan|q\.?|district|ward|tp\.?|thanh\s+pho)\b))/iu
    .test(folded)

  return !(hasAddressAdmin && hasNamedStreetAfterMarker)
}

function menuOrPromoNoise(rawText = '', folded = '') {
  if (!rawText) return false
  return Boolean(
    measurementIngredientNoise(folded) ||
    /\b\d+\s*[kK]\b/u.test(rawText) ||
    /^(?:\s*\d{1,2}\s*[.)]\s*|\s*\d{1,2}\s*-\s+)/u.test(rawText) ||
    /\b(?:top|list|tong hop|review|nen thu|mon nen thu|thu\s*\d+\s*lan)\b/iu.test(folded) ||
    /\b(?:banh canh|bun bo|com tam|pho bo|mon ngon|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua)\b/iu.test(folded)
  )
}

const HOUSE_TOKEN_PATTERN_SOURCE = String.raw`\d{1,5}(?:[a-z]\d{0,3})?(?:\/\d{1,5}(?:[a-z]\d{0,3})?)?(?:-\d{1,5}(?:[a-z]\d{0,3})?)?`

function normalizeObservedAddressSeparators(value = '') {
  return String(value || '')
    .replace(/[\\|]+/gu, ' ')
    .replace(/^\s*[([{]?\s*(?:cs|cn|co\s*so|chi\s*nhanh)\s*\d{1,3}\s*[)\]}:;,.\/-]*\s*/iu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function houseNumberMatch(folded = '') {
  const addressText = normalizeObservedAddressSeparators(withoutDateTimeNoise(folded))
    .replace(/\b(?:phuong|phudng|phung|phuung|phurong|p\.?|ward|quan|qun|q\.?|district)\s*\d+\b/giu, ' ')
    .replace(/\b\d+\s*k\b/giu, ' ')
  return addressText.match(
    new RegExp(`(?:^|[\\s,.:;])(?:so\\s*)?(${HOUSE_TOKEN_PATTERN_SOURCE})(?=$|[\\s,.:;/])`, 'iu'),
  )
}

function adminFeatures(folded = '') {
  const wardMatch = folded.match(
    /\b(?:phuong|phudng|phung|phuung|phurong|p(?:\.|\s+)|p(?=\d))\s*([\p{L}\d][\p{L}\d .'-]{0,48}?)(?=\s*(?:,|;|\||\b(?:quan|qun|q(?:\.|\s+)|q(?=\d))\b|$))/iu,
  )
  const districtMatch = folded.match(
    /\b(?:quan|qun|q(?:\.|\s+)|q(?=\d))\s*([\p{L}\d][\p{L}\d .'-]{0,48}?)(?=\s*(?:,|;|\||\(|\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon)\b|$))/iu,
  )
  const wardValue = String(wardMatch?.[1] || '').trim()
  const districtValue = String(districtMatch?.[1] || '').trim()
  const badAdminWord = /^(?:ngon|re|hot|food|quan|mon|review|top|list)$/iu
  return {
    hasWard: Boolean(wardValue && !badAdminWord.test(wardValue)),
    hasDistrict: Boolean(districtValue && !badAdminWord.test(districtValue)),
    wardValue: wardValue && !badAdminWord.test(wardValue) ? wardValue : null,
    districtValue: districtValue && !badAdminWord.test(districtValue) ? districtValue : null,
  }
}

function explicitStreetFeature(folded = '') {
  return /(?:^|[\s,;])(?:duong|d\.|street|st\.?|road|rd\.|avenue|ave\.?|hem|ngo|ngach|alley)(?=$|[\s,;])/iu
    .test(folded)
}

function streetSegmentAfterHouse(folded = '', houseToken = '', { allowCompactRangeStreet = false } = {}) {
  if (!houseToken) return { hasImplicitStreet: false, streetSegment: null }
  const normalizedFolded = normalizeObservedAddressSeparators(folded)
  const houseIndex = normalizedFolded.search(new RegExp(`(?:^|[\\s,.:;])(?:so\\s*)?${houseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,.:;/])`, 'iu'))
  if (houseIndex < 0) return { hasImplicitStreet: false, streetSegment: null }
  const fromHouse = normalizedFolded.slice(houseIndex).replace(
    new RegExp(`^(?:[\\s,.:;]*)(?:so\\s*)?${houseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu'),
    '',
  )
  const adminIndexCandidates = [
    fromHouse.search(/\b(?:phuong|phudng|phung|phuung|phurong|p\.?)\b/iu),
    fromHouse.search(/\b(?:quan|qun|q\.?)\b/iu),
    fromHouse.search(/\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon)\b/iu),
  ].filter((index) => index >= 0)
  const end = adminIndexCandidates.length ? Math.min(...adminIndexCandidates) : fromHouse.length
  const rawSegment = fromHouse.slice(0, end)
  // Internal bare numbers remain ambiguous, but a single trailing numeric suffix is
  // a common Vietnamese street form (for example 'Nai Tu 2'). Keep only that
  // bounded structure when there are already at least two lexical street tokens.
  if (/\d/u.test(rawSegment) && !explicitStreetFeature(rawSegment)) {
    const compact = rawSegment.replace(/[^\p{L}\d\s'.-]/gu, ' ').replace(/\s+/gu, ' ').trim()
    const tokens = compact.split(' ').filter(Boolean)
    const numericIndexes = tokens
      .map((token, index) => (/^\d{1,3}$/u.test(token) ? index : -1))
      .filter((index) => index >= 0)
    const lexicalCount = tokens.filter((token) => /[\p{L}]{2,}/u.test(token)).length
    const oneTrailingNumericSuffix = numericIndexes.length === 1 &&
      numericIndexes[0] === tokens.length - 1 && lexicalCount >= 2
    if (!oneTrailingNumericSuffix) {
      return { hasImplicitStreet: false, streetSegment: null }
    }
  }
  const segment = rawSegment
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!segment) return { hasImplicitStreet: false, streetSegment: null }
  if (/\b(?:banh|canh|bun|pho|com|xoi|che|lau|nuong|oc|hu|tieu|mi|tra|sua|ngon|thu|lan|nen|mon|gia)\b/iu.test(segment)) {
    return { hasImplicitStreet: false, streetSegment: null }
  }
  const words = segment.match(/[\p{L}]{2,}/gu) || []
  const compactRangeStreet = Boolean(
    allowCompactRangeStreet &&
    words.length === 1 &&
    words[0].length >= 4
  )
  return {
    hasImplicitStreet: words.length >= 2 || compactRangeStreet,
    streetSegment: words.length >= 2 || compactRangeStreet ? segment : null,
  }
}

function buildReasons(features = {}, noisy = false) {
  const reasons = []
  if (features.hasHouseNumber) reasons.push('HOUSE_FOUND')
  if (features.hasExplicitStreet) reasons.push('EXPLICIT_STREET_FOUND')
  if (features.hasImplicitStreet) reasons.push('IMPLICIT_STREET_FOUND')
  if (features.hasWard) reasons.push('WARD_FOUND')
  if (features.hasDistrict) reasons.push('DISTRICT_FOUND')
  if (features.namedAdminParsed) reasons.push('NAMED_ADMIN_ADDRESS_PARSED')
  if (noisy) reasons.push('MENU_PRICE_OR_PROMO_CONTEXT')
  if (!reasons.length) reasons.push('NO_ADDRESS_SIGNAL')
  return reasons
}

export function analyzeShortsTrack2V3AddressSignal(value = '') {
  const rawText = safeText(value)
  const folded = normalizeObservedAddressSeparators(foldVietnameseText(rawText))
    // Bounded OCR marker repair observed on Vietnamese overlays: Tesseract may
    // read "Phường" as "phusng" and attach one garbage letter. Treat only
    // this exact marker typo as admin syntax; do not fuzzy-normalize arbitrary words.
    .replace(/\b[a-z]?phusng\b[\s,.;:-]*/gu, 'phuong ')
    .replace(/\bphu\s+ong['’]?(?=\s*\d)/gu, 'phuong ')
    .replace(/\bphirong['’]?(?=\s*\d)/gu, 'phuong ')
    .replace(/\b(phuong)\s+(\d{1,2})\s*:(?=\s*\p{L})/gu, '$1 $2,')
    // Bounded OCR separator repair: apostrophes/quotes immediately after a
    // slash-style house number are frequently hallucinated between the number
    // and the first street letter. Repair only this exact boundary.
    .replace(/(\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?))["'’]+(?=\p{L})/gu, '$1 ')
  const namedAdminAddress = rawText ? parseShortsTrack2V3NamedAdminAddress(rawText) : null
  const houseMatch = houseNumberMatch(folded)
  const houseToken = String(houseMatch?.[1] || '').trim()
  const admin = adminFeatures(folded)
  const hasExplicitStreet = explicitStreetFeature(folded)
  const implicitStreet = streetSegmentAfterHouse(folded, houseToken, {
    allowCompactRangeStreet: houseToken.includes('-') && Boolean(admin.hasWard || admin.hasDistrict),
  })
  const adminMarkerIndex = folded.search(/\b(?:phuong|phudng|phung|phuung|phurong|phirong|quan|qun)\b/iu)
  const houseTokenIndex = houseToken ? folded.lastIndexOf(houseToken) : -1
  const houseTokenTrailingRemainder = houseTokenIndex >= 0
    ? folded.slice(houseTokenIndex + houseToken.length).replace(/[\s,.:;/'’")\]}-]+/gu, '')
    : ''
  const adminBeforeTrailingHouseNoise = Boolean(
    houseToken &&
      (admin.hasWard || admin.hasDistrict) &&
      !hasExplicitStreet &&
      adminMarkerIndex >= 0 &&
      houseTokenIndex > adminMarkerIndex &&
      !houseTokenTrailingRemainder
  )
  const effectiveHouseToken = adminBeforeTrailingHouseNoise ? '' : houseToken
  const noisy = menuOrPromoNoise(rawText, folded)
  const features = {
    hasHouseNumber: Boolean(effectiveHouseToken),
    houseNumber: effectiveHouseToken || null,
    hasExplicitStreet,
    hasImplicitStreet: implicitStreet.hasImplicitStreet,
    streetSegment: implicitStreet.streetSegment,
    hasStreetComponent: Boolean(hasExplicitStreet || implicitStreet.hasImplicitStreet),
    hasWard: admin.hasWard,
    hasDistrict: admin.hasDistrict,
    wardValue: admin.wardValue,
    districtValue: admin.districtValue,
    hasAdmin: Boolean(admin.hasWard || admin.hasDistrict),
    namedAdminParsed: Boolean(namedAdminAddress),
    noisyMenuPricePromo: noisy,
  }

  let signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.NON_ADDRESS
  if (namedAdminAddress || (features.hasHouseNumber && features.hasStreetComponent && features.hasAdmin)) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.STRONG_ADDRESS_ANCHOR
  } else if (features.hasHouseNumber && features.hasStreetComponent && !noisy) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.HOUSE_STREET_PARTIAL
  } else if (features.hasHouseNumber && features.hasAdmin && !noisy) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.HOUSE_ADMIN_PARTIAL
  } else if (features.hasAdmin && !features.hasHouseNumber && !noisy) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.ADMIN_PARTIAL
  } else if (features.hasExplicitStreet && !noisy) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.EXPLICIT_STREET_PARTIAL
  } else if (features.hasHouseNumber && !noisy) {
    signalClass = SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.HOUSE_ONLY
  }

  const strongAddressAnchor = signalClass === SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.STRONG_ADDRESS_ANCHOR
  const composableAddressSignal = [
    SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.STRONG_ADDRESS_ANCHOR,
    SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.HOUSE_STREET_PARTIAL,
    SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.HOUSE_ADMIN_PARTIAL,
    SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.ADMIN_PARTIAL,
    SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES.EXPLICIT_STREET_PARTIAL,
  ].includes(signalClass)

  let score = 0
  if (features.hasHouseNumber) score += 26
  if (features.hasStreetComponent) score += 30
  if (features.hasWard) score += 14
  if (features.hasDistrict) score += 16
  if (features.namedAdminParsed) score += 30
  if (features.hasHouseNumber && features.hasStreetComponent) score += 20
  if (features.hasHouseNumber && features.hasAdmin) score += 16
  if (noisy) score -= 55
  score = Math.max(0, Math.min(100, score))

  return {
    rawText,
    folded,
    signalClass,
    score,
    strongAddressAnchor,
    composableAddressSignal,
    namedAdminAddress,
    features,
    reasons: buildReasons(features, noisy),
  }
}

export function areShortsTrack2V3AddressSignalsComplementary(left = '', right = '') {
  const a = typeof left === 'string' ? analyzeShortsTrack2V3AddressSignal(left) : left
  const b = typeof right === 'string' ? analyzeShortsTrack2V3AddressSignal(right) : right
  if (!a?.composableAddressSignal || !b?.composableAddressSignal) return false
  if (a.features?.noisyMenuPricePromo || b.features?.noisyMenuPricePromo) return false

  const leftHouseStreet = Boolean(a.features?.hasHouseNumber && a.features?.hasStreetComponent)
  const rightHouseStreet = Boolean(b.features?.hasHouseNumber && b.features?.hasStreetComponent)
  const leftAdmin = Boolean(a.features?.hasAdmin)
  const rightAdmin = Boolean(b.features?.hasAdmin)
  const complementary = (leftHouseStreet && rightAdmin) || (rightHouseStreet && leftAdmin)
  if (!complementary) return false

  const houses = new Set([
    a.features?.houseNumber,
    b.features?.houseNumber,
  ].filter(Boolean))
  return houses.size <= 1
}

export default {
  SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES,
  analyzeShortsTrack2V3AddressSignal,
  areShortsTrack2V3AddressSignalsComplementary,
}
