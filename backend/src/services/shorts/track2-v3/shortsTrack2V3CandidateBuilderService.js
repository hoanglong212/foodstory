import {
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { normalizeShortsTrack2V3OcrAdminText } from './shortsTrack2V3OcrHouseNumberSafetyService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'

function safeText(value, maxLength = 1000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
}

function candidateId(type, index) {
  return `cand:${type.toLowerCase()}:${index}`
}

function splitLines(value = '') {
  return normalizeShortsTrack2V3Text(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizedOcrCandidateText(value = '') {
  return normalizeShortsTrack2V3OcrAdminText(safeText(value, 2000)).text
}

function firstHouseNumberIndex(folded = '') {
  const match = folded.match(/(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/iu)
  return match ? match.index + match[0].search(/\d/u) : -1
}

function adminTokenIndex(folded = '') {
  const candidates = [
    folded.search(/\b(?:phuong|phudng|phung|phuung|phurong|p\.?)\s*\d+\b/iu),
    folded.search(/\b(?:quan|qun|q\.?)\s*\d+\b/iu),
    folded.search(/\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon|ha noi|hanoi)\b/iu),
  ].filter((index) => index >= 0)
  return candidates.length ? Math.min(...candidates) : -1
}

function hasCityToken(folded = '') {
  return /\b(?:tp|thanh pho|hcm|ho chi minh|sai gon|saigon|ha noi|hanoi)\b/iu.test(folded)
}

function hasMenuPriceOrPromoContext(value = '') {
  const raw = safeText(value, 2000)
  const folded = foldVietnameseText(raw)
  if (!raw) return false

  return (
    /\b\d+\s*[kK]\b/u.test(raw) ||
    /\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/u.test(raw) ||
    /^\s*\d+\s*[.)]/u.test(raw) ||
    /\b(?:nen thu|thu\s*1\s*lan|quan nen thu|mon nen thu|review|top|list|tong hop)\b/iu.test(folded) ||
    /\b(?:banh canh|bun bo|com tam|pho|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua)\b/iu.test(folded)
  )
}

function looksLikeStreetSegment(segment = '') {
  const clean = String(segment || '')
    .replace(/\b(?:phuong|phudng|phung|phuung|phurong|p|quan|qun|q|ward|district|tp|hcm)\b/giu, ' ')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!clean) return false

  // OCR/menu overlays often produce fake "addresses" from text such as
  // "THỬ 1 LẦN" or "1. Bánh canh 350K". These must not be considered
  // street-like segments.
  const folded = foldVietnameseText(clean)
  if (/\b(?:banh|canh|bun|pho|com|xoi|che|lau|nuong|oc|hu|tieu|mi|tra|sua|ngon|thu|lan|nen)\b/iu.test(folded)) {
    return false
  }

  if (/\b(?:d|duong|street|st)\b\s+[\p{L}]{2,}/iu.test(folded)) return true

  const words = clean.match(/[\p{L}]{2,}/gu) || []
  return words.length >= 2
}

function hasStreetSegmentAfterHouse(value = '') {
  const folded = foldVietnameseText(value)
  const start = firstHouseNumberIndex(folded)
  if (start < 0) return false
  const end = adminTokenIndex(folded)
  const segment = folded
    .slice(start)
    .replace(/^(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?/iu, '')
    .slice(0, end > start ? end - start : undefined)

  return looksLikeStreetSegment(segment)
}

function looksLikeCompactRangeStreetSegment(segment = '') {
  const clean = String(segment || '')
    .replace(/\b(?:phuong|phudng|phung|phuung|phurong|p|quan|qun|q|ward|district|tp|hcm)\b/giu, ' ')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  const folded = foldVietnameseText(clean)
  if (!folded || /\b(?:banh|canh|bun|pho|com|xoi|che|lau|nuong|oc|hu|tieu|mi|tra|sua|ngon|phut|gio|kg|gram)\b/iu.test(folded)) {
    return false
  }
  return (clean.match(/[\p{L}]{4,}/gu) || []).length >= 1
}

function hasNoisyOcr(value = '') {
  const raw = safeText(value, 2000)
  if (!raw) return false
  return (
    /�|[\])}]\s*[.,)]|[<>[\]{}|~^_=]/u.test(raw) ||
    hasMenuPriceOrPromoContext(raw)
  )
}

function hasAddressAdmin(tokens = {}, folded = '') {
  return Boolean(tokens.hasWard || tokens.hasDistrict || hasCityToken(folded))
}

function addressStrength(value = '') {
  const signal = analyzeShortsTrack2V3AddressSignal(value)
  const tokens = detectShortsTrack2V3EvidenceTokens(signal.rawText)
  const noisy = Boolean(signal.features.noisyMenuPricePromo || hasNoisyOcr(signal.rawText))
  return {
    text: signal.rawText,
    folded: signal.folded,
    tokens,
    hasAdmin: Boolean(signal.features.hasAdmin || hasCityToken(signal.folded)),
    hasStreetComponent: Boolean(signal.features.hasStreetComponent),
    noisy,
    hasAddressFragment: Boolean(
      signal.strongAddressAnchor ||
      (
        signal.features.hasHouseNumber &&
        !signal.features.noisyMenuPricePromo &&
        (signal.features.hasStreetComponent || signal.features.hasAdmin || hasCityToken(signal.folded))
      )
    ),
    isFullAddress: Boolean(signal.strongAddressAnchor && !noisy),
    isPartialAddress: Boolean(
      signal.features.hasHouseNumber &&
      (signal.features.hasAdmin || hasCityToken(signal.folded)) &&
      !signal.features.hasStreetComponent
    ),
    isHouseStreetPartial: Boolean(
      signal.features.hasHouseNumber &&
      signal.features.hasStreetComponent &&
      !signal.features.hasAdmin &&
      !hasCityToken(signal.folded) &&
      !signal.features.noisyMenuPricePromo
    ),
    signal,
  }
}

function isPlaceNameLine(line = '') {
  const text = safeText(line, 200)
  if (!text) return false
  const folded = foldVietnameseText(text)
  const tokens = detectShortsTrack2V3EvidenceTokens(text)
  if (tokens.hasHouseNumber || tokens.hasWard || tokens.hasDistrict || hasCityToken(folded)) {
    return false
  }

  return /\b(?:quan|tiem|cafe|ca phe|nha hang|bun|pho|com|banh|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua|xe xoi)\b/iu
    .test(folded)
}

function looksLikePlacePrefix(value = '') {
  const folded = foldVietnameseText(value)
    .replace(/^\s*\d+\s*[.)-]\s*/u, '')
    .trim()
  if (!folded || /\b(?:top|list|tong hop)\b/iu.test(folded)) return false
  return /\b(?:quan|tiem|cafe|ca phe|nha hang|bun|pho|com|banh|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua)/iu
    .test(folded)
}

function extractEmbeddedPlaceAddressLine(value = '') {
  const text = safeText(value, 2000)
  if (!text || text.includes('\n')) return null

  const houseMatches = text.matchAll(
    /(?:^|[\s,.:;"'([{])(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?(?=$|[\s,.:;"')\]}\/\-])/giu,
  )
  for (const match of houseMatches) {
    const digitOffset = match[0].search(/\d/u)
    const start = Number(match.index) + digitOffset
    if (start <= 0) continue

    const fromHouse = text.slice(start)
    const houseToken = fromHouse.match(/^\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?/iu)?.[0] || ''
    if (!houseToken || /^\d+k$/iu.test(houseToken)) continue

    const foldedFromHouse = foldVietnameseText(fromHouse)
    const district = foldedFromHouse.match(/\b(?:quan|qun|q\.?)\s*\d+\b/iu)
    if (!district || district.index == null) continue

    const streetSegment = fromHouse.slice(houseToken.length, district.index)
    if (
      !looksLikeStreetSegment(streetSegment) &&
      !(houseToken.includes('-') && looksLikeCompactRangeStreetSegment(streetSegment))
    ) continue

    const city = foldedFromHouse.match(
      /\b(?:tp\.?\s*(?:hcm|ho chi minh)|thanh pho\s+ho chi minh|hcm|ho chi minh|sai gon|saigon)\b/iu,
    )
    const end = city && city.index != null && city.index > district.index
      ? city.index + city[0].length
      : fromHouse.length
    const adminNormalization = normalizeShortsTrack2V3OcrAdminText(fromHouse.slice(0, end))
    const normalizedAddress = adminNormalization.text
    const placePrefix = text.slice(0, start).replace(/[\s,.:;|/-]+$/gu, '').trim()
    if (!normalizedAddress) continue

    return {
      addressFragment: safeText(normalizedAddress),
      placeName: looksLikePlacePrefix(placePrefix) ? safeText(placePrefix, 160) : null,
      adminNormalized: adminNormalization.normalizationApplied.some((flag) =>
        ['NORMALIZED_WARD_TEXT', 'NORMALIZED_DISTRICT_TEXT', 'NORMALIZED_ADMIN_DIGIT'].includes(flag)
      ),
    }
  }

  return null
}

function addCandidate(candidates, seen, candidate) {
  const key = `${candidate.type}:${foldVietnameseText(candidate.displayText || candidate.addressFragment || '')}`
  if (seen.has(key)) return
  seen.add(key)
  candidates.push({
    id: candidateId(candidate.type, candidates.length),
    placeName: null,
    addressFragment: null,
    evidenceIds: [],
    ...candidate,
  })
}

function forceReviewOnlyAddressEvidence(evidence = {}) {
  return Boolean(
    evidence.forceReviewOnly ||
      evidence.sourceType === 'ocr_fused_nearby_frame' ||
      evidence.source === 'track2_v3_evidence_fusion',
  )
}

function buildPlacePlusPartialCandidates(evidenceItems, candidates, seen, mustNotResolve) {
  for (const evidence of evidenceItems) {
    const lines = splitLines(evidence.rawText || evidence.normalizedText)
    if (lines.length < 2) continue

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const strength = addressStrength(line)
      if (!strength.isPartialAddress) continue

      const previousPlaceLine = [...lines.slice(0, index)].reverse().find(isPlaceNameLine)
      if (!previousPlaceLine) continue

      const addressFragment = safeText(line)
      const placeName = safeText(previousPlaceLine, 160)
      addCandidate(candidates, seen, {
        type: 'OCR_PLACE_PLUS_PARTIAL_ADDRESS',
        displayText: `${placeName} - ${addressFragment}`,
        placeName,
        addressFragment,
        riskFlags: ['PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY'],
        canAutoResolve: false,
        qualityTier: 'TIER_C',
        evidenceIds: [evidence.id],
      })
    }

    const joined = lines.join(' ')
    const joinedStrength = addressStrength(joined)
    if (joinedStrength.isPartialAddress) {
      const placeLine = lines.find(isPlaceNameLine)
      if (placeLine) {
        const addressLines = lines.filter((line) => line !== placeLine)
        const addressFragment = safeText(addressLines.join(' '))
        const placeName = safeText(placeLine, 160)
        addCandidate(candidates, seen, {
          type: 'OCR_PLACE_PLUS_PARTIAL_ADDRESS',
          displayText: `${placeName} - ${addressFragment}`,
          placeName,
          addressFragment,
          riskFlags: ['PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY'],
          canAutoResolve: false,
          qualityTier: 'TIER_C',
          evidenceIds: [evidence.id],
        })
      }
    }
  }
}

function buildAddressCandidates(evidenceItems, candidates, seen, mustNotResolve, diagnostics) {
  for (const evidence of evidenceItems) {
    const rawEvidenceText = safeText(evidence.rawText || evidence.normalizedText, 2000)
    const normalizedEvidenceText = normalizedOcrCandidateText(rawEvidenceText)
    const rawLines = splitLines(rawEvidenceText)
    const normalizedLines = normalizedEvidenceText === rawEvidenceText
      ? []
      : splitLines(normalizedEvidenceText)
    const rawCandidateTexts = new Set([rawEvidenceText, ...rawLines])
    const candidatesToAnalyze = [...new Set([
      rawEvidenceText,
      ...rawLines,
      normalizedEvidenceText,
      ...normalizedLines,
    ].filter(Boolean))]

    for (const candidateText of candidatesToAnalyze) {
      const normalizedFromJoinedOcr = !rawCandidateTexts.has(candidateText)
      const joinedOcrRiskFlags = normalizedFromJoinedOcr && /^\s*\d{1,5}\p{Lu}\p{Ll}/u.test(rawEvidenceText)
        ? ['OCR_JOINED_TEXT_NORMALIZED']
        : []
      const signal = analyzeShortsTrack2V3AddressSignal(candidateText)
      const diagnostic = {
        evidenceId: evidence.id || null,
        candidateText: safeText(candidateText, 1000),
        signalClass: signal.signalClass,
        signalScore: signal.score,
        strongAddressAnchor: signal.strongAddressAnchor,
        composableAddressSignal: signal.composableAddressSignal,
        features: signal.features,
        namedAdminParsed: Boolean(signal.namedAdminAddress),
        emitted: false,
        emittedType: null,
        reasons: [...signal.reasons],
      }
      const recordEmission = (type) => {
        diagnostic.emitted = true
        diagnostic.emittedType = type
        diagnostic.reasons.push(`CANDIDATE_EMITTED_${type}`)
      }
      const namedAdminAddress = parseShortsTrack2V3NamedAdminAddress(candidateText)
      if (namedAdminAddress) {
        addCandidate(candidates, seen, {
          type: 'OCR_ADDRESS_FRAGMENT',
          displayText: namedAdminAddress.normalizedAddress,
          addressFragment: namedAdminAddress.normalizedAddress,
          extractionRule: namedAdminAddress.extractionRule,
          riskFlags: [
            'OCR_ADDRESS_FRAGMENT',
            'OCR_NAMED_ADMIN_ADDRESS',
            'OCR_NORMALIZED_ADMIN',
            ...joinedOcrRiskFlags,
            ...(namedAdminAddress.noisyAdminMarker ? ['OCR_NOISY_ADMIN_MARKER'] : []),
            ...(namedAdminAddress.joinedHouseStreet ? ['OCR_JOINED_HOUSE_STREET'] : []),
            ...(namedAdminAddress.joinedDistrictMarker ? ['OCR_JOINED_ADMIN_TEXT'] : []),
            ...(namedAdminAddress.trailingNoiseRemoved ? ['OCR_TRAILING_NOISE_STRIPPED'] : []),
            'REVIEW_ONLY',
          ],
          canAutoResolve: false,
          qualityTier: 'TIER_D',
          evidenceIds: [evidence.id],
        })
        recordEmission('OCR_ADDRESS_FRAGMENT')
        diagnostics.push(diagnostic)
        continue
      }

      const embedded = extractEmbeddedPlaceAddressLine(candidateText)
      if (embedded) {
        addCandidate(candidates, seen, {
          type: 'OCR_ADDRESS_FRAGMENT',
          displayText: embedded.addressFragment,
          addressFragment: embedded.addressFragment,
          placeName: embedded.placeName,
          riskFlags: [
            'OCR_ADDRESS_FRAGMENT',
            'OCR_PLACE_PREFIX_STRIPPED',
            ...joinedOcrRiskFlags,
            ...(embedded.adminNormalized ? ['OCR_NORMALIZED_ADMIN'] : []),
            'REVIEW_ONLY',
          ],
          canAutoResolve: false,
          qualityTier: 'TIER_D',
          evidenceIds: [evidence.id],
        })
        recordEmission('OCR_ADDRESS_FRAGMENT')
        diagnostics.push(diagnostic)
        continue
      }

      const strength = addressStrength(candidateText)
      if (!strength.hasAddressFragment) {
        diagnostic.reasons.push('NO_COMPLETE_ADDRESS_FRAGMENT_AFTER_ANALYSIS')
        diagnostics.push(diagnostic)
        continue
      }

      const forceReviewOnly = forceReviewOnlyAddressEvidence(evidence) || normalizedFromJoinedOcr

      if (strength.isFullAddress && !forceReviewOnly && !mustNotResolve) {
        addCandidate(candidates, seen, {
          type: 'FULL_ADDRESS_VERBATIM',
          displayText: safeText(candidateText),
          addressFragment: safeText(candidateText),
          riskFlags: ['VERIFY_ELIGIBLE'],
          canAutoResolve: !mustNotResolve,
          qualityTier: 'TIER_B',
          evidenceIds: [evidence.id],
        })
        recordEmission('FULL_ADDRESS_VERBATIM')
        diagnostics.push(diagnostic)
        continue
      }

      const baseRiskFlags = strength.noisy
        ? ['OCR_ADDRESS_FRAGMENT', 'NOISY_OCR', 'REVIEW_ONLY']
        : strength.isPartialAddress
          ? ['OCR_ADDRESS_FRAGMENT', 'PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY']
          : strength.isHouseStreetPartial
            ? ['OCR_ADDRESS_FRAGMENT', 'PARTIAL_ADDRESS', 'MISSING_ADMIN_COMPONENT', 'REVIEW_ONLY']
            : ['OCR_ADDRESS_FRAGMENT', 'REVIEW_ONLY']
      const riskFlags = [...baseRiskFlags, ...joinedOcrRiskFlags]
      addCandidate(candidates, seen, {
        type: 'OCR_ADDRESS_FRAGMENT',
        displayText: safeText(candidateText),
        addressFragment: safeText(candidateText),
        riskFlags,
        canAutoResolve: false,
        qualityTier: 'TIER_D',
        evidenceIds: [evidence.id],
      })
      recordEmission('OCR_ADDRESS_FRAGMENT')
      diagnostics.push(diagnostic)
    }
  }
}

function buildPlaceNameOnlyCandidates(evidenceItems, candidates, seen) {
  for (const evidence of evidenceItems) {
    const text = safeText(evidence.rawText || evidence.normalizedText)
    const strength = addressStrength(text)
    if (strength.hasAddressFragment) continue

    for (const line of splitLines(text)) {
      if (!isPlaceNameLine(line)) continue
      const placeName = safeText(line, 160)
      addCandidate(candidates, seen, {
        type: 'PLACE_NAME_ONLY',
        displayText: placeName,
        placeName,
        riskFlags: ['PLACE_NAME_ONLY', 'REVIEW_ONLY'],
        canAutoResolve: false,
        qualityTier: 'TIER_E',
        evidenceIds: [evidence.id],
      })
    }
  }
}

function candidateAddressText(candidate = {}) {
  return safeText(candidate.addressFragment || candidate.displayText || candidate.placeName, 2000)
}

function houseStreetCore(candidate = {}) {
  const signal = analyzeShortsTrack2V3AddressSignal(candidateAddressText(candidate))
  if (!signal.features?.hasHouseNumber || !signal.features?.hasStreetComponent) return null
  const streetTokens = foldVietnameseText(signal.features.streetSegment || '')
    .replace(/[^a-z]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 2)
  if (streetTokens.length < 2) return null
  return {
    houseNumber: String(signal.features.houseNumber || '').toLowerCase(),
    streetTokens,
  }
}

function editDistance(left = '', right = '') {
  const a = String(left)
  const b = String(right)
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = previous
    }
  }
  return row[b.length]
}

function fuzzyTokenMatch(left = '', right = '') {
  if (left === right) return true
  if (left.length < 3 || right.length < 3) return false
  return editDistance(left, right) <= 1
}

function compatibleOcrHouseNumber(left = '', right = '') {
  if (!left || !right) return false
  if (left === right) return true
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  return shorter.length >= 3 && longer.length === shorter.length + 1 && longer.endsWith(shorter)
}

function streetCoreSimilarity(leftTokens = [], rightTokens = []) {
  if (!leftTokens.length || !rightTokens.length) return 0
  let matches = 0
  const used = new Set()
  for (const left of leftTokens) {
    const index = rightTokens.findIndex((right, rightIndex) =>
      !used.has(rightIndex) && fuzzyTokenMatch(left, right)
    )
    if (index >= 0) {
      matches += 1
      used.add(index)
    }
  }
  return matches / Math.max(leftTokens.length, rightTokens.length)
}

function sameHouseStreetCore(left = {}, right = {}) {
  const a = houseStreetCore(left)
  const b = houseStreetCore(right)
  if (!a || !b || !compatibleOcrHouseNumber(a.houseNumber, b.houseNumber)) return false
  return streetCoreSimilarity(a.streetTokens, b.streetTokens) >= 0.5
}

function candidateLinkedEvidence(candidate = {}, evidenceItems = []) {
  const ids = new Set(Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds : [])
  if (!ids.size) return []
  return (Array.isArray(evidenceItems) ? evidenceItems : []).filter((item) => ids.has(item?.id))
}

function candidatesShareVisualScope(left = {}, right = {}, evidenceItems = [], windowSeconds = 4.5) {
  const leftIds = new Set(Array.isArray(left.evidenceIds) ? left.evidenceIds : [])
  if ((Array.isArray(right.evidenceIds) ? right.evidenceIds : []).some((id) => leftIds.has(id))) {
    return true
  }

  const leftEvidence = candidateLinkedEvidence(left, evidenceItems)
  const rightEvidence = candidateLinkedEvidence(right, evidenceItems)
  if (!leftEvidence.length || !rightEvidence.length) return false

  return leftEvidence.some((leftItem) => rightEvidence.some((rightItem) => {
    const leftTimestamp = Number(leftItem?.timestampSeconds)
    const rightTimestamp = Number(rightItem?.timestampSeconds)
    return Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) &&
      Math.abs(leftTimestamp - rightTimestamp) <= windowSeconds
  }))
}

function removeSubsumedHouseStreetPartials(candidates = [], evidenceItems = []) {
  const stronger = candidates.filter((candidate) => {
    const flags = new Set(Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [])
    if (flags.has('MISSING_ADMIN_COMPONENT')) return false
    return addressStrength(candidateAddressText(candidate)).isFullAddress ||
      Boolean(parseShortsTrack2V3NamedAdminAddress(candidateAddressText(candidate)))
  })
  if (!stronger.length) return candidates
  return candidates.filter((candidate) => {
    const signal = analyzeShortsTrack2V3AddressSignal(candidateAddressText(candidate))
    if (signal.signalClass !== 'HOUSE_STREET_PARTIAL') return true
    return !stronger.some((fullCandidate) =>
      sameHouseStreetCore(candidate, fullCandidate) &&
      candidatesShareVisualScope(candidate, fullCandidate, evidenceItems)
    )
  })
}

function buildMultiPlaceReviewCandidate(evidenceItems, candidates, seen, intent) {
  if (!intent.mustNotResolve) return

  const signals = []
  for (const evidence of evidenceItems) {
    for (const line of splitLines(evidence.rawText || evidence.normalizedText)) {
      const strength = addressStrength(line)
      if (strength.isFullAddress || parseShortsTrack2V3NamedAdminAddress(line) || isPlaceNameLine(line)) {
        signals.push({ evidence, line })
      }
    }
  }

  if (signals.length < 2) return
  const visualScopes = new Set(signals.map(({ evidence }) => {
    const timestamp = Number(evidence?.timestampSeconds)
    if (Number.isFinite(timestamp)) return `time:${Math.round(timestamp / 3)}`
    if (evidence?.segmentId) return `segment:${evidence.segmentId}`
    if (evidence?.episodeId) return `episode:${evidence.episodeId}`
    return null
  }).filter(Boolean))
  // Multiple OCR engines and preprocessing variants often describe the same
  // frame differently. Do not expose those mutations as a fake multi-place
  // aggregate; a real aggregate needs evidence from distinct visual scopes.
  if (visualScopes.size < 2) return

  addCandidate(candidates, seen, {
    type: 'MULTI_PLACE_REVIEW',
    displayText: signals.slice(0, 3).map((signal) => safeText(signal.line, 120)).join(' | '),
    riskFlags: ['MULTI_PLACE', 'REVIEW_ONLY'],
    canAutoResolve: false,
    qualityTier: 'TIER_E',
    evidenceIds: [...new Set(signals.map((signal) => signal.evidence.id))],
  })
}

export function buildShortsTrack2V3Candidates({
  evidence = [],
  intent = {},
} = {}) {
  const evidenceItems = Array.isArray(evidence) ? evidence : []
  const candidates = []
  const seen = new Set()
  const mustNotResolve = Boolean(intent.mustNotResolve)
  const diagnostics = []

  buildPlacePlusPartialCandidates(evidenceItems, candidates, seen, mustNotResolve)
  buildAddressCandidates(evidenceItems, candidates, seen, mustNotResolve, diagnostics)
  buildMultiPlaceReviewCandidate(evidenceItems, candidates, seen, intent)
  const finalCandidates = removeSubsumedHouseStreetPartials(candidates, evidenceItems)

  return {
    status: finalCandidates.length ? 'CANDIDATES' : 'NO_CANDIDATES',
    candidates: finalCandidates,
    candidateCount: finalCandidates.length,
    diagnostics: diagnostics.slice(0, 120),
    rejectionSummary: diagnostics.reduce((summary, item) => {
      if (item.emitted) return summary
      const key = item.signalClass || 'UNKNOWN'
      summary[key] = (summary[key] || 0) + 1
      return summary
    }, {}),
    rejectionReasonSummary: diagnostics.reduce((summary, item) => {
      if (item.emitted) return summary
      for (const reason of Array.isArray(item.reasons) ? item.reasons : []) {
        if (!reason || reason === 'NO_ADDRESS_SIGNAL') continue
        summary[reason] = (summary[reason] || 0) + 1
      }
      return summary
    }, {}),
  }
}
