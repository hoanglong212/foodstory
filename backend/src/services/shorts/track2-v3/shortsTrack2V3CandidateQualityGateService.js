import {
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'
import {
  classifyShortsTrack2V3NumericContexts,
  isShortsTrack2V3RejectedHouseNumberContext,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES,
} from './shortsTrack2V3NumericContextSafetyService.js'

export const SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS = Object.freeze({
  ADDRESS_ANCHORED: 'ADDRESS_ANCHORED',
  PLACE_PLUS_ADDRESS: 'PLACE_PLUS_ADDRESS',
  MULTI_PLACE_REVIEW: 'MULTI_PLACE_REVIEW',
  CLEAN_FULL_ADDRESS: 'CLEAN_FULL_ADDRESS',
  NOISY_NAMED_ADMIN_ADDRESS: 'NOISY_NAMED_ADMIN_ADDRESS',
  ASR_FULL_ADDRESS_REVIEW: 'ASR_FULL_ADDRESS_REVIEW',
  PARTIAL_HOUSE_STREET_REVIEW: 'PARTIAL_HOUSE_STREET_REVIEW',
})

export const SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS = Object.freeze({
  GENERIC_FOOD_TEXT_ONLY: 'GENERIC_FOOD_TEXT_ONLY',
  MENU_PRICE_TIME_ONLY: 'MENU_PRICE_TIME_ONLY',
  PLACE_NAME_ONLY_WITHOUT_ADDRESS: 'PLACE_NAME_ONLY_WITHOUT_ADDRESS',
  INTRO_OR_CAPTION_ONLY: 'INTRO_OR_CAPTION_ONLY',
  NO_ADDRESS_ANCHOR: 'NO_ADDRESS_ANCHOR',
  MUST_NOT_RESOLVE_SINGLE_PLACE: 'MUST_NOT_RESOLVE_SINGLE_PLACE',
  WEAK_NO_EVIDENCE_CANDIDATE: 'WEAK_NO_EVIDENCE_CANDIDATE',
  DUPLICATE_ADDRESS_CANDIDATE: 'DUPLICATE_ADDRESS_CANDIDATE',
  NON_FOOD_NEGATIVE: 'NON_FOOD_NEGATIVE',
  CONTEXT_NUMBER_NOT_HOUSE_NUMBER: 'CONTEXT_NUMBER_NOT_HOUSE_NUMBER',
  WEAK_IMPLICIT_STREET_PARTIAL: 'WEAK_IMPLICIT_STREET_PARTIAL',
})

function safeText(value, maxLength = 4000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
}

function splitLines(value = '') {
  return safeText(value, 12000)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function countReasons(decisions = [], keep) {
  const counts = {}
  for (const decision of decisions) {
    if (decision.keep !== keep) continue
    const reason = decision.reason || 'UNKNOWN'
    counts[reason] = (counts[reason] || 0) + 1
  }
  return counts
}

function firstHouseNumberIndex(folded = '') {
  const match = folded.match(/(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/iu)
  return match ? match.index + match[0].search(/\d/u) : -1
}

function hasCityOrProvinceToken(folded = '') {
  return /\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon|ha noi|hanoi|tinh|huyen|xa)\b/iu
    .test(folded)
}

function hasStreetMarker(folded = '') {
  return /(?:^|[\s,.:;])(?:duong|d\.|street|st\.?|road|rd\.|avenue|ave\.?|hem|ngo|ngach|alley)(?=$|[\s,.:;-])/iu
    .test(folded)
}

function looksLikeStreetSegment(segment = '') {
  const clean = String(segment || '')
    .replace(/\b(?:phuong|phudng|phung|phuung|phurong|p|quan|qun|q|ward|district|tp|hcm|tinh|huyen|xa)\b/giu, ' ')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!clean) return false

  const folded = foldVietnameseText(clean)
  if (/\b(?:banh|canh|bun|pho|com|xoi|che|lau|nuong|oc|hu|tieu|mi|tra|sua|ngon|thu|lan|nen|review|top|list)\b/iu
    .test(folded)) {
    return false
  }

  if (hasStreetMarker(folded)) return true
  const words = clean.match(/[\p{L}]{2,}/gu) || []
  return words.length >= 2
}

function hasStreetSegmentAfterHouse(value = '') {
  const folded = foldVietnameseText(value)
  const start = firstHouseNumberIndex(folded)
  if (start < 0) return false
  const adminIndex = [
    folded.search(/\b(?:phuong|phudng|phung|phuung|phurong|p\.?)\s*\d+\b/iu),
    folded.search(/\b(?:quan|qun|q\.?)\s*\d+\b/iu),
    folded.search(/\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon|ha noi|hanoi|tinh|huyen|xa)\b/iu),
  ].filter((index) => index >= 0)
  const end = adminIndex.length ? Math.min(...adminIndex) : folded.length
  const segment = folded
    .slice(start, end)
    .replace(/^(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?/iu, '')

  return looksLikeStreetSegment(segment)
}

function addressProfile(value = '') {
  const text = safeText(value, 8000)
  const folded = foldVietnameseText(text)
  const tokens = detectShortsTrack2V3EvidenceTokens(text)
  const hasAdmin = Boolean(tokens.hasWard || tokens.hasDistrict || hasCityOrProvinceToken(folded))
  const hasSlashAddress = /(?:^|[\s,.:;])\d{1,5}[a-z]?\/\d{1,5}[a-z]?(?=$|[\s,.:;/-])/iu
    .test(folded)
  const hasStreetComponent = Boolean(tokens.hasStreetLike || hasStreetMarker(folded) || hasStreetSegmentAfterHouse(text))
  const hasHouseNumber = Boolean(tokens.hasHouseNumber)
  const isCleanFullAddress = Boolean(hasHouseNumber && hasAdmin && hasStreetComponent)
  const isPartialAddress = Boolean(hasHouseNumber && hasAdmin && !hasStreetComponent)
  const isHouseStreetPartial = Boolean(hasHouseNumber && hasStreetComponent && !hasAdmin)
  const hasAddressAnchor = Boolean(
    isCleanFullAddress ||
      (hasHouseNumber && hasAdmin && hasSlashAddress) ||
      (hasHouseNumber && hasAdmin && hasStreetComponent),
  )

  return {
    text,
    folded,
    tokens,
    hasAdmin,
    hasStreetComponent,
    hasHouseNumber,
    hasSlashAddress,
    hasAddressAnchor,
    isCleanFullAddress,
    isPartialAddress,
    isHouseStreetPartial,
  }
}

function candidateDisplayText(candidate = {}) {
  return safeText([
    candidate.displayText,
    candidate.addressFragment,
    candidate.placeName,
  ].filter(Boolean).join('\n'), 8000)
}

function evidenceForCandidate(candidate = {}, evidenceItems = []) {
  const ids = new Set(asArray(candidate.evidenceIds).filter(Boolean))
  if (!ids.size) return []
  return evidenceItems.filter((item) => ids.has(item.id))
}

function evidenceText(evidence = {}) {
  return safeText(evidence.rawText || evidence.normalizedText || '', 8000)
}

function hasAttributedAsrFullEvidence(candidate = {}, evidenceItems = []) {
  if (candidate.type !== 'ASR_FULL_ADDRESS_REVIEW') return false
  const linkedEvidence = evidenceForCandidate(candidate, evidenceItems)
  return linkedEvidence.some((evidence) =>
    evidence?.sourceType === 'ASR_TRANSCRIPT_EVIDENCE' &&
    evidence?.evidenceType === 'ASR_FULL_ADDRESS' &&
    evidence?.forceReviewOnly === true &&
    evidenceText(evidence) === safeText(candidate.rawAsrEvidenceText || candidate.addressFragment, 8000)
  )
}

function isPlaceNameLine(line = '') {
  const text = safeText(line, 300)
  if (!text) return false
  const profile = addressProfile(text)
  if (profile.hasHouseNumber || profile.hasAdmin) return false

  return /\b(?:quan|tiem|cafe|ca phe|nha hang|bun|pho|com|banh|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua|xe xoi)\b/iu
    .test(profile.folded)
}

function hasMenuPriceOrTime(text = '') {
  const raw = safeText(text, 4000)
  const folded = foldVietnameseText(raw)
  return Boolean(
    /\b\d+\s*k\b/iu.test(folded) ||
      /\b\d{1,2}[:h]\d{2}\s*(?:-|den|toi)\s*\d{1,2}[:h]\d{2}\b/iu.test(folded) ||
      /^\s*\d+\s*[.)]/u.test(raw),
  )
}

function hasFoodTerms(text = '') {
  return /\b(?:banh|canh|bun|pho|com|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua|chao|nem|bo vien|banh duc)\b/iu
    .test(foldVietnameseText(text))
}

function hasIntroOrListTerms(text = '') {
  return /\b(?:sai gon ve dem|thuong se them gi nhat|nen thu|thu\s*1\s*lan|review|top|list|tong hop|phan\s*\d+|quan ngon|mon ngon)\b/iu
    .test(foldVietnameseText(text))
}

function sourceTextForCandidate(candidate = {}, evidenceItems = []) {
  return evidenceForCandidate(candidate, evidenceItems)
    .map(evidenceText)
    .filter(Boolean)
    .join('\n')
}

function firstHouseLineProfile(value = '', houseNumber = '') {
  const rawText = safeText(value, 8000)
  const escapedHouse = String(houseNumber || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  if (!rawText || !escapedHouse) return null
  const housePattern = new RegExp(
    `(?:^|[\\s,.:;])(?:s[oố]\\s*)?(${escapedHouse})(?=$|[\\s,.:;/-])`,
    'iu',
  )
  for (const line of splitLines(rawText)) {
    const match = line.match(housePattern)
    if (!match || match.index == null) continue
    const digitOffset = match[0].search(/\d/u)
    const houseStart = match.index + Math.max(0, digitOffset)
    const prefix = line.slice(0, houseStart)
    const afterHouse = line.slice(houseStart + match[1].length)
    const prefixFolded = foldVietnameseText(prefix)
      .replace(/[^a-z]+/gu, ' ')
      .trim()
    const allowedAddressPrefix = !prefixFolded || /^(?:dc|d c|dia chi|address|so|s)$/iu.test(prefixFolded)
    const streetWords = afterHouse.match(/[\p{L}]{2,}/gu) || []
    const properNameWordCount = streetWords.filter((word) => /^\p{Lu}/u.test(word)).length
    return {
      allowedAddressPrefix,
      streetWordCount: streetWords.length,
      properNameWordCount,
      properNameLike: streetWords.length >= 2 && properNameWordCount >= 1,
    }
  }
  return null
}

function linkedEvidenceQualityFlags(candidate = {}, evidenceItems = []) {
  return new Set(evidenceForCandidate(candidate, evidenceItems).flatMap((item) =>
    asArray(item?.providerMetadata?.qualityFlags)
  ))
}

function hasBoundedBranchLabelAddressContext(candidate = {}, evidenceItems = [], signal = {}, numericSafety = {}) {
  if (signal.signalClass !== 'HOUSE_STREET_PARTIAL') return false
  if (signal.features?.noisyMenuPricePromo) return false

  const houseNumber = safeText(signal.features?.houseNumber, 80)
  const streetWords = safeText(signal.features?.streetSegment, 240).match(/[\p{L}]{2,}/gu) || []
  if (!houseNumber || streetWords.length < 2) return false

  const houseSupported = asArray(numericSafety.classifications).some((item) =>
    safeText(item.rawNumberToken, 80).toLowerCase() === houseNumber.toLowerCase() &&
    item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE
  )
  if (!houseSupported) return false

  const observedText = [candidateDisplayText(candidate), sourceTextForCandidate(candidate, evidenceItems)]
    .filter(Boolean)
    .join('\n')
  const folded = foldVietnameseText(observedText)
  const branchPrefix = /(?:^|[\s([{])(?:cs|cn|co\s*so|chi\s*nhanh)\s*\d{1,3}\s*[\\|/:;,.()\[\]{}-]+\s*\d{1,5}/imu
  return branchPrefix.test(folded)
}

function weakImplicitHouseStreetPartial(candidate = {}, evidenceItems = [], signal = {}, numericSafety = {}) {
  if (signal.signalClass !== 'HOUSE_STREET_PARTIAL') return false
  const houseNumber = safeText(signal.features?.houseNumber, 80)
  if (!houseNumber || houseNumber.includes('/')) return false
  const earlyQualityFlags = linkedEvidenceQualityFlags(candidate, evidenceItems)
  const noisySingleDigitExplicitStreet = Boolean(
    signal.features?.hasExplicitStreet &&
    /^\d[a-z]?$/iu.test(houseNumber) &&
    (earlyQualityFlags.has('OCR_GARBAGE_TOKENS') || earlyQualityFlags.has('LOW_PROVIDER_CONFIDENCE'))
  )
  if (signal.features?.hasExplicitStreet && !noisySingleDigitExplicitStreet) return false

  if (hasBoundedBranchLabelAddressContext(candidate, evidenceItems, signal, numericSafety)) {
    return false
  }

  const digits = houseNumber.replace(/\D/gu, '')
  if (digits && /^0+$/u.test(digits)) return true

  const lineProfile = firstHouseLineProfile(candidateDisplayText(candidate), houseNumber)
  if (lineProfile && !lineProfile.allowedAddressPrefix) return true

  const linkedEvidence = evidenceForCandidate(candidate, evidenceItems)
  const maxSupportCount = Math.max(
    0,
    ...linkedEvidence.map((item) => Number(item?.supportCount || 0)),
  )
  const maxConfidence = Math.max(
    0,
    ...linkedEvidence.map((item) => Number(item?.confidence || 0)),
  )
  const providerBestAddressLines = linkedEvidence
    .map((item) => safeText(item?.providerMetadata?.bestAddressLine, 500))
    .filter(Boolean)
  const providerBestLineSupportsAddress = providerBestAddressLines.some((line) => {
    const bestLineSignal = analyzeShortsTrack2V3AddressSignal(line)
    return bestLineSignal.strongAddressAnchor || bestLineSignal.signalClass === 'HOUSE_STREET_PARTIAL'
  })

  const qualityFlags = linkedEvidenceQualityFlags(candidate, evidenceItems)
  const candidateRiskFlags = new Set(asArray(candidate.riskFlags))
  const garbageEvidence = candidateRiskFlags.has('NOISY_OCR') ||
    qualityFlags.has('OCR_GARBAGE_TOKENS') ||
    qualityFlags.has('OCR_LONG_NOISY_TEXT')
  const substantialHouseToken = houseNumber.replace(/\D/gu, '').length >= 2 || /[\/-]/u.test(houseNumber)
  const streetWordCount = safeText(signal.features?.streetSegment, 240).match(/[\p{L}]{2,}/gu)?.length || 0
  const recoverableReviewOnlyPartial = Boolean(
    substantialHouseToken &&
      streetWordCount >= 2 &&
      providerBestLineSupportsAddress &&
      (maxSupportCount >= 2 || maxConfidence >= 0.35) &&
      (signal.features?.hasExplicitStreet || lineProfile?.properNameLike) &&
      !signal.features?.noisyMenuPricePromo
  )
  if (garbageEvidence && !recoverableReviewOnlyPartial) return true

  const singleDigitHouse = /^\d[a-z]?$/iu.test(houseNumber)
  if (singleDigitHouse && !lineProfile?.properNameLike) return true

  const houseNumberSupported = asArray(numericSafety.classifications).some((item) =>
    safeText(item.rawNumberToken, 80).toLowerCase() === houseNumber.toLowerCase() &&
    item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE
  )
  if (
    singleDigitHouse &&
    !houseNumberSupported &&
    maxSupportCount <= 1 &&
    maxConfidence > 0 &&
    maxConfidence < 0.35
  ) return true
  const lowProviderEvidenceOnly = linkedEvidence.length > 0 && linkedEvidence.every((item) => {
    const flags = new Set(asArray(item?.providerMetadata?.qualityFlags))
    return item?.providerMetadata?.lowConfidence === true || flags.has('LOW_PROVIDER_CONFIDENCE')
  })
  if (
    !houseNumberSupported &&
    lowProviderEvidenceOnly &&
    providerBestAddressLines.length > 0 &&
    !providerBestLineSupportsAddress
  ) return true
  if (maxConfidence > 0 && maxConfidence < 0.35 && !lineProfile?.properNameLike) return true

  return false
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((value) => safeText(value, 80)).filter(Boolean))]
}

function numericContextKey(item = {}) {
  return [item.rawNumberToken, item.contextClass, item.sourceType, item.sourceId, item.start, item.end].join('|')
}

function numericContextSafetyForCandidate(candidate = {}, evidenceItems = []) {
  if (candidate.type === 'ASR_FULL_ADDRESS_REVIEW') {
    return {
      candidate,
      classifications: [],
      rejectedClaimedNumbers: [],
      rejectedAsHouseNumber: false,
    }
  }

  const linkedEvidence = evidenceForCandidate(candidate, evidenceItems)
  const classifications = []
  for (const item of linkedEvidence) {
    classifications.push(...classifyShortsTrack2V3NumericContexts({
      text: evidenceText(item),
      sourceType: item.sourceType || item.source || 'evidence',
      sourceId: item.id || null,
    }))
  }
  const candidateClassifications = classifyShortsTrack2V3NumericContexts({
    text: candidateDisplayText(candidate),
    sourceType: candidate.sourceType || candidate.type || 'candidate',
    sourceId: candidate.id || null,
  })
  classifications.push(...candidateClassifications)
  const uniqueClassifications = [...new Map(
    classifications.map((item) => [numericContextKey(item), item]),
  ).values()]

  const explicitClaimedNumbers = uniqueStrings([
    candidate.houseNumberToken,
    ...asArray(candidate.houseNumberAlternatives),
  ])
  const inferredClaimedNumber = candidateClassifications.find((item) =>
    item.contextClass !== SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER
  )?.rawNumberToken
  const claimedNumbers = explicitClaimedNumbers.length
    ? explicitClaimedNumbers
    : uniqueStrings([inferredClaimedNumber])
  const classificationsByToken = new Map()
  for (const item of uniqueClassifications) {
    const records = classificationsByToken.get(item.rawNumberToken) || []
    records.push(item)
    classificationsByToken.set(item.rawNumberToken, records)
  }
  const supportedClaimedNumbers = claimedNumbers.filter((token) =>
    (classificationsByToken.get(token) || []).some((item) =>
      item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE
    )
  )
  const rejectedClaimedNumbers = claimedNumbers.filter((token) => {
    const records = classificationsByToken.get(token) || []
    return records.length > 0 &&
      !records.some((item) => item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE) &&
      records.some((item) => isShortsTrack2V3RejectedHouseNumberContext(item.contextClass))
  })
  const rejectedAsHouseNumber = Boolean(
    claimedNumbers.length && !supportedClaimedNumbers.length && rejectedClaimedNumbers.length
  )
  const retainedAlternatives = uniqueStrings(asArray(candidate.houseNumberAlternatives)).filter((token) =>
    !rejectedClaimedNumbers.includes(token)
  )
  const retainedHouseNumberToken = rejectedClaimedNumbers.includes(safeText(candidate.houseNumberToken, 80))
    ? null
    : candidate.houseNumberToken || null
  const rejectedClasses = [...new Set(uniqueClassifications
    .filter((item) => rejectedClaimedNumbers.includes(item.rawNumberToken))
    .map((item) => item.contextClass))]
  const riskFlags = new Set(asArray(candidate.riskFlags))
  if (rejectedClaimedNumbers.length) riskFlags.add('CONTEXT_NUMBER_REJECTED_AS_HOUSE_NUMBER')
  if (rejectedClasses.includes(SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE)) {
    riskFlags.add('PRICE_CONTEXT_NUMBER')
  }
  if (rejectedClasses.includes(SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.FLOOR_OR_LEVEL)) {
    riskFlags.add('FLOOR_OR_LEVEL_CONTEXT_NUMBER')
  }

  return {
    candidate: {
      ...candidate,
      houseNumberToken: retainedHouseNumberToken,
      houseNumberAlternatives: retainedAlternatives,
      numericContextClassifications: uniqueClassifications,
      riskFlags: [...riskFlags],
    },
    classifications: uniqueClassifications,
    rejectedClaimedNumbers,
    rejectedClasses,
    rejectedAsHouseNumber,
  }
}

function allEvidenceText(evidenceItems = []) {
  return evidenceItems.map(evidenceText).filter(Boolean).join('\n')
}

function hasGenuineMultiPlaceReviewEvidence(candidate = {}, evidenceItems = [], intent = {}) {
  if (intent.intent !== 'MULTI_PLACE_OR_LIST') return false

  const sourceText = sourceTextForCandidate(candidate, evidenceItems) || allEvidenceText(evidenceItems)
  const lines = splitLines([candidateDisplayText(candidate), sourceText].filter(Boolean).join('\n'))
  const placeSignals = []
  const addressSignals = []

  for (const line of lines) {
    const profile = addressProfile(line)
    if (profile.hasAddressAnchor) addressSignals.push(line)
    else if (isPlaceNameLine(line) && !hasIntroOrListTerms(line)) placeSignals.push(line)
  }

  return addressSignals.length >= 1 && (addressSignals.length + placeSignals.length) >= 2
}

function fixtureCategory(context = {}) {
  return safeText(context.fixtureCase?.category, 120)
}

function effectiveMustNotResolve(intent = {}, context = {}) {
  return Boolean(intent.mustNotResolve || context.fixtureCase?.expected?.mustNotResolve)
}

function summarizeDroppedCandidate(decision = {}) {
  const candidate = decision.candidate || {}
  return {
    id: safeText(candidate.id, 120) || null,
    type: safeText(candidate.type, 120) || null,
    reason: decision.reason,
    displayText: safeText(candidate.displayText || candidate.addressFragment || candidate.placeName, 240),
  }
}

function compactKey(value = '') {
  return foldVietnameseText(value)
    .replace(/\b(?:online|official|www|com|vn|hanoionline)\b/giu, ' ')
    .replace(/[^a-z0-9]+/giu, '')
    .slice(0, 180)
}

function rangeAddressVariantKey(candidate = {}) {
  const folded = foldVietnameseText(candidateDisplayText(candidate))
  const match = folded.match(/(?:^|[\s,.:;"'([{])\d{1,5}[a-z]?-(\d{1,5}[a-z]?)\s+([a-z]{4,})/iu)
  return match ? `range-variant:${match[1].toLowerCase()}:${match[2].toLowerCase()}` : null
}

function canonicalAddressKey(candidate = {}, { collapseRangeVariants = false } = {}) {
  if (candidate.type === 'MULTI_PLACE_REVIEW') {
    return `multi:${compactKey(candidateDisplayText(candidate))}`
  }

  if (collapseRangeVariants) {
    const rangeVariantKey = rangeAddressVariantKey(candidate)
    if (rangeVariantKey) return rangeVariantKey
  }

  const folded = foldVietnameseText(candidateDisplayText(candidate))
    .replace(/\s+/gu, ' ')
    .trim()
  const start = firstHouseNumberIndex(folded)
  if (start < 0) return `${candidate.type || 'candidate'}:${compactKey(folded)}`

  const fromHouse = folded.slice(start).slice(0, 220)
  const adminMatch = fromHouse.match(
    /^(.{0,160}?\b(?:phuong|p\.?|quan|q\.?|tp|thanh pho|hcm|ho chi minh|sai gon|saigon|ha noi|hanoi|tinh|huyen|xa)\b(?:\s*\d+)?)/iu,
  )
  const base = adminMatch?.[1] || fromHouse.slice(0, 90)
  return `address:${compactKey(base)}`
}

function candidateQualityScore(decision = {}, evidenceItems = []) {
  const candidate = decision.candidate || {}
  let score = 0
  if (decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.CLEAN_FULL_ADDRESS) score += 40
  if (decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PLACE_PLUS_ADDRESS) score += 35
  if (decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED) score += 30
  if (decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.MULTI_PLACE_REVIEW) score += 20
  if (candidate.type === 'FULL_ADDRESS_VERBATIM') score += 8
  if (candidate.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS') score += 6
  if (candidate.type === 'OCR_ADDRESS_FRAGMENT') score += 4
  if (Array.isArray(candidate.riskFlags) && candidate.riskFlags.includes('NOISY_OCR')) score -= 5
  const linkedEvidence = evidenceForCandidate(candidate, evidenceItems)
  score += Math.max(0, ...linkedEvidence.map((item) => Number(item?.confidence || 0))) * 20
  score -= candidateDisplayText(candidate).length / 1000
  return score
}

function applyAddressDedupe(decisions = [], { collapseRangeVariants = false, evidenceItems = [] } = {}) {
  const finalDecisions = decisions.map((decision) => ({ ...decision }))
  const bestByKey = new Map()

  for (let index = 0; index < finalDecisions.length; index += 1) {
    const decision = finalDecisions[index]
    if (!decision.keep) continue

    const key = canonicalAddressKey(decision.candidate, { collapseRangeVariants })
    const existingIndex = bestByKey.get(key)
    if (existingIndex === undefined) {
      bestByKey.set(key, index)
      continue
    }

    const existing = finalDecisions[existingIndex]
    if (candidateQualityScore(decision, evidenceItems) > candidateQualityScore(existing, evidenceItems)) {
      existing.keep = false
      existing.reason = SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.DUPLICATE_ADDRESS_CANDIDATE
      bestByKey.set(key, index)
    } else {
      decision.keep = false
      decision.reason = SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.DUPLICATE_ADDRESS_CANDIDATE
    }
  }

  return finalDecisions
}

export function evaluateShortsTrack2V3CandidateQuality({
  candidate = {},
  evidence = [],
  intent = {},
  context = {},
} = {}) {
  const evidenceItems = asArray(evidence)
  const numericSafety = numericContextSafetyForCandidate(candidate, evidenceItems)
  candidate = numericSafety.candidate
  const text = candidateDisplayText(candidate)
  const sourceText = sourceTextForCandidate(candidate, evidenceItems)
  const combinedText = [text, sourceText].filter(Boolean).join('\n')
  const candidateProfile = addressProfile(text)
  const combinedProfile = addressProfile(combinedText)
  const category = fixtureCategory(context)
  const mustNotResolve = effectiveMustNotResolve(intent, context)
  const namedAdminAddress = parseShortsTrack2V3NamedAdminAddress(text) ||
    evidenceForCandidate(candidate, evidenceItems)
      .map(evidenceText)
      .map(parseShortsTrack2V3NamedAdminAddress)
      .find(Boolean)
  const validatedNamedAdminAddress = Boolean(
    namedAdminAddress && asArray(candidate.riskFlags).includes('OCR_NAMED_ADMIN_ADDRESS'),
  )

  if (numericSafety.rejectedAsHouseNumber) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.CONTEXT_NUMBER_NOT_HOUSE_NUMBER,
      addressAnchored: false,
      numericContextClassifications: numericSafety.classifications,
      rejectedClaimedNumbers: numericSafety.rejectedClaimedNumbers,
      rejectedClasses: numericSafety.rejectedClasses,
    }
  }

  if (category === 'no_address_expected') {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NON_FOOD_NEGATIVE,
      addressAnchored: false,
    }
  }

  if (hasAttributedAsrFullEvidence(candidate, evidenceItems)) {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ASR_FULL_ADDRESS_REVIEW,
      addressAnchored: true,
    }
  }

  if (candidate.type === 'MULTI_PLACE_REVIEW') {
    if (hasGenuineMultiPlaceReviewEvidence(candidate, evidenceItems, intent)) {
      return {
        keep: true,
        reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.MULTI_PLACE_REVIEW,
        addressAnchored: true,
      }
    }
    return {
      keep: false,
      reason: combinedProfile.hasAddressAnchor
        ? SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NO_ADDRESS_ANCHOR
        : SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NO_ADDRESS_ANCHOR,
      addressAnchored: false,
    }
  }

  if (validatedNamedAdminAddress) {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.NOISY_NAMED_ADMIN_ADDRESS,
      addressAnchored: true,
    }
  }

  const candidateAddressSignal = analyzeShortsTrack2V3AddressSignal(
    candidate.addressFragment || candidate.displayText || candidate.placeName || '',
  )
  const reviewOnlyHouseStreetPartial = Boolean(
    candidate.type === 'OCR_ADDRESS_FRAGMENT' &&
    candidateAddressSignal.signalClass === 'HOUSE_STREET_PARTIAL' &&
    asArray(candidate.riskFlags).includes('REVIEW_ONLY')
  )
  const relevantNegativeIntent = intent?.intent === 'NO_ADDRESS_INTENT'

  if (relevantNegativeIntent && !candidateAddressSignal.strongAddressAnchor) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NON_FOOD_NEGATIVE,
      addressAnchored: false,
    }
  }

  if (candidateProfile.isCleanFullAddress && candidate.type === 'FULL_ADDRESS_VERBATIM') {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.CLEAN_FULL_ADDRESS,
      addressAnchored: true,
    }
  }

  if (candidateAddressSignal.strongAddressAnchor) {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED,
      addressAnchored: true,
    }
  }

  if (reviewOnlyHouseStreetPartial) {
    if (weakImplicitHouseStreetPartial(candidate, evidenceItems, candidateAddressSignal, numericSafety)) {
      return {
        keep: false,
        reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.WEAK_IMPLICIT_STREET_PARTIAL,
        addressAnchored: false,
      }
    }
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PARTIAL_HOUSE_STREET_REVIEW,
      addressAnchored: false,
    }
  }

  if (mustNotResolve) {
    if (candidateProfile.hasAddressAnchor) {
      return {
        keep: true,
        reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED,
        addressAnchored: true,
      }
    }
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.MUST_NOT_RESOLVE_SINGLE_PLACE,
      addressAnchored: candidateProfile.hasAddressAnchor,
    }
  }

  if (candidate.type === 'PLACE_NAME_ONLY' || (candidate.placeName && !candidate.addressFragment && !candidateProfile.hasAddressAnchor)) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.PLACE_NAME_ONLY_WITHOUT_ADDRESS,
      addressAnchored: false,
    }
  }

  if (candidate.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS' && candidateProfile.isPartialAddress) {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PLACE_PLUS_ADDRESS,
      addressAnchored: true,
    }
  }

  if (candidateProfile.hasAddressAnchor) {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED,
      addressAnchored: true,
    }
  }

  if (category === 'NO_EVIDENCE' && !candidateProfile.hasAddressAnchor) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.WEAK_NO_EVIDENCE_CANDIDATE,
      addressAnchored: false,
    }
  }

  if (hasMenuPriceOrTime(text) && hasFoodTerms(text)) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.MENU_PRICE_TIME_ONLY,
      addressAnchored: false,
    }
  }

  if (hasIntroOrListTerms(text) && !candidateProfile.hasAddressAnchor) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.INTRO_OR_CAPTION_ONLY,
      addressAnchored: false,
    }
  }

  if (hasFoodTerms(text) && !candidateProfile.hasAddressAnchor) {
    return {
      keep: false,
      reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.GENERIC_FOOD_TEXT_ONLY,
      addressAnchored: false,
    }
  }

  return {
    keep: false,
    reason: SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS.NO_ADDRESS_ANCHOR,
    addressAnchored: false,
  }
}

function candidateReviewRank(candidate = {}) {
  const text = candidateDisplayText(candidate)
  const signal = analyzeShortsTrack2V3AddressSignal(text)
  const flags = new Set(asArray(candidate.riskFlags))
  let score = 0

  if (candidate.type === 'METADATA_ADDRESS') score += 1000
  if (candidate.type === 'ASR_FULL_ADDRESS_REVIEW') score += 760
  if (candidate.qualityGateReason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.CLEAN_FULL_ADDRESS) score += 620
  if (candidate.qualityGateReason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PLACE_PLUS_ADDRESS) score += 560
  if (candidate.qualityGateReason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.NOISY_NAMED_ADMIN_ADDRESS) score += 520
  if (candidate.qualityGateReason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ADDRESS_ANCHORED) score += 500
  if (candidate.qualityGateReason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.PARTIAL_HOUSE_STREET_REVIEW) score += 260
  if (candidate.type === 'MULTI_PLACE_REVIEW') score += 180

  if (signal.strongAddressAnchor) score += 180
  if (signal.features?.hasHouseNumber) score += 60
  if (signal.features?.hasStreetComponent) score += 80
  if (signal.features?.hasWard) score += 55
  if (signal.features?.hasDistrict) score += 60
  if (signal.features?.namedAdminParsed) score += 70
  score += Math.min(30, asArray(candidate.evidenceIds).length * 5)

  if (flags.has('NOISY_OCR')) score -= 110
  if (flags.has('NOISY_HOUSE_NUMBER')) score -= 120
  if (flags.has('LOW_CONFIDENCE_OCR')) score -= 25
  if (flags.has('MISSING_ADMIN_COMPONENT')) score -= 30
  if (flags.has('MISSING_STREET_NAME')) score -= 45

  const houseDigits = safeText(signal.features?.houseNumber, 80).replace(/\D/gu, '')
  if (houseDigits && /^0+$/u.test(houseDigits)) score -= 300
  return score
}

export function rankShortsTrack2V3CandidatesForReview(candidates = []) {
  return asArray(candidates)
    .map((candidate, index) => ({ candidate, index, score: candidateReviewRank(candidate) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.candidate)
}

export function applyShortsTrack2V3CandidateQualityGate({
  candidates = [],
  evidence = [],
  intent = {},
  context = {},
} = {}) {
  const rawCandidates = asArray(candidates)
  const evidenceItems = asArray(evidence)
  const mustNotResolve = effectiveMustNotResolve(intent, context)
  const initialDecisions = rawCandidates.map((rawCandidate) => {
    const numericSafety = numericContextSafetyForCandidate(rawCandidate, evidenceItems)
    return {
      candidate: numericSafety.candidate,
      ...evaluateShortsTrack2V3CandidateQuality({
      candidate: numericSafety.candidate,
      evidence: evidenceItems,
      intent,
      context,
      }),
      numericContextClassifications: numericSafety.classifications,
      rejectedClaimedNumbers: numericSafety.rejectedClaimedNumbers,
      rejectedClasses: numericSafety.rejectedClasses,
    }
  })
  const decisions = applyAddressDedupe(initialDecisions, {
    collapseRangeVariants: intent?.intent !== 'MULTI_PLACE_OR_LIST' &&
      intent?.inputClass !== 'MULTI_PLACE_LISTICLE',
    evidenceItems,
  })
  const keptCandidates = decisions
    .filter((decision) => decision.keep)
    .map((decision) => {
      const candidate = {
        ...decision.candidate,
        qualityGateReason: decision.reason,
      }
      const forceReviewOnly = Boolean(
        (mustNotResolve && decision.addressAnchored) ||
          decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.NOISY_NAMED_ADMIN_ADDRESS ||
          decision.reason === SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.ASR_FULL_ADDRESS_REVIEW,
      )
      if (!forceReviewOnly) return candidate
      return {
        ...candidate,
        canAutoResolve: false,
        riskFlags: [...new Set([
          ...asArray(candidate.riskFlags),
          'REVIEW_ONLY',
        ])],
      }
    })
  const droppedDecisions = decisions.filter((decision) => !decision.keep)

  return {
    status: rawCandidates.length === keptCandidates.length ? 'PASS_THROUGH' : 'FILTERED',
    candidateQualityGateRan: true,
    candidates: keptCandidates,
    rawCandidates,
    droppedCandidates: droppedDecisions.map(summarizeDroppedCandidate),
    decisions: decisions.map((decision) => ({
      candidateId: decision.candidate?.id || null,
      type: decision.candidate?.type || null,
      keep: decision.keep,
      reason: decision.reason,
      addressAnchored: Boolean(decision.addressAnchored),
      numericContextClassifications: decision.numericContextClassifications || [],
      rejectedClaimedNumbers: decision.rejectedClaimedNumbers || [],
    })),
    keptCandidateReasons: countReasons(decisions, true),
    droppedCandidateReasons: countReasons(decisions, false),
    rawCandidateCount: rawCandidates.length,
    keptCandidateCount: keptCandidates.length,
    droppedCandidateCount: droppedDecisions.length,
    weakCandidateCount: droppedDecisions.length,
    addressAnchoredCandidateCount: decisions.filter((decision) => decision.keep && decision.addressAnchored).length,
    numericContextClassifications: decisions.flatMap((decision) =>
      decision.numericContextClassifications || []
    ),
    contextNumberRejectedAsHouseNumberCount: decisions.reduce((count, decision) =>
      count + (decision.rejectedClaimedNumbers?.length || 0), 0
    ),
    floorNumberRejectedAsHouseNumberCount: decisions.reduce((count, decision) =>
      count + (decision.rejectedClasses || []).filter((contextClass) =>
        contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.FLOOR_OR_LEVEL
      ).length, 0
    ),
    priceNumberRejectedAsHouseNumberCount: decisions.reduce((count, decision) =>
      count + (decision.rejectedClasses || []).filter((contextClass) =>
        contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE
      ).length, 0
    ),
  }
}

export default {
  applyShortsTrack2V3CandidateQualityGate,
  evaluateShortsTrack2V3CandidateQuality,
  rankShortsTrack2V3CandidatesForReview,
}
