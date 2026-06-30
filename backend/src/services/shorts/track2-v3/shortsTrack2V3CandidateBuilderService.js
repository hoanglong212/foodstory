import {
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

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

function firstHouseNumberIndex(folded = '') {
  const match = folded.match(/(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/iu)
  return match ? match.index + match[0].search(/\d/u) : -1
}

function adminTokenIndex(folded = '') {
  const candidates = [
    folded.search(/\b(?:phuong|p\.?)\s*\d+\b/iu),
    folded.search(/\b(?:quan|q\.?)\s*\d+\b/iu),
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
    .replace(/\b(?:phuong|p|quan|q|ward|district|tp|hcm)\b/giu, ' ')
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
    .replace(/^(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?/iu, '')
    .slice(0, end > start ? end - start : undefined)

  return looksLikeStreetSegment(segment)
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
  const text = safeText(value)
  const folded = foldVietnameseText(text)
  const tokens = detectShortsTrack2V3EvidenceTokens(text)
  const hasAdmin = hasAddressAdmin(tokens, folded)
  const hasStreetComponent = Boolean(tokens.hasStreetLike || hasStreetSegmentAfterHouse(text))
  const noisy = hasNoisyOcr(text)

  return {
    text,
    folded,
    tokens,
    hasAdmin,
    hasStreetComponent,
    noisy,
    hasAddressFragment: Boolean(tokens.hasHouseNumber && (hasAdmin || hasStreetComponent)),
    isFullAddress: Boolean(tokens.hasHouseNumber && hasAdmin && hasStreetComponent && !noisy),
    isPartialAddress: Boolean(tokens.hasHouseNumber && hasAdmin && !hasStreetComponent),
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

function buildAddressCandidates(evidenceItems, candidates, seen, mustNotResolve) {
  for (const evidence of evidenceItems) {
    const text = safeText(evidence.rawText || evidence.normalizedText)
    const lines = splitLines(text)
    const candidatesToAnalyze = [text, ...lines].filter(Boolean)

    for (const candidateText of candidatesToAnalyze) {
      const strength = addressStrength(candidateText)
      if (!strength.hasAddressFragment) continue

      if (strength.isFullAddress) {
        addCandidate(candidates, seen, {
          type: 'FULL_ADDRESS_VERBATIM',
          displayText: safeText(candidateText),
          addressFragment: safeText(candidateText),
          riskFlags: ['VERIFY_ELIGIBLE'],
          canAutoResolve: !mustNotResolve,
          qualityTier: 'TIER_B',
          evidenceIds: [evidence.id],
        })
        continue
      }

      const riskFlags = strength.noisy
        ? ['NOISY_OCR', 'REVIEW_ONLY']
        : ['PARTIAL_ADDRESS', 'REVIEW_ONLY']
      addCandidate(candidates, seen, {
        type: 'OCR_ADDRESS_FRAGMENT',
        displayText: safeText(candidateText),
        addressFragment: safeText(candidateText),
        riskFlags,
        canAutoResolve: false,
        qualityTier: 'TIER_D',
        evidenceIds: [evidence.id],
      })
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

function buildMultiPlaceReviewCandidate(evidenceItems, candidates, seen, intent) {
  if (!intent.mustNotResolve) return

  const signals = []
  for (const evidence of evidenceItems) {
    for (const line of splitLines(evidence.rawText || evidence.normalizedText)) {
      const strength = addressStrength(line)
      if (strength.hasAddressFragment || isPlaceNameLine(line)) {
        signals.push({ evidence, line })
      }
    }
  }

  if (signals.length < 2) return

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

  buildPlacePlusPartialCandidates(evidenceItems, candidates, seen, mustNotResolve)
  buildAddressCandidates(evidenceItems, candidates, seen, mustNotResolve)
  buildPlaceNameOnlyCandidates(evidenceItems, candidates, seen)
  buildMultiPlaceReviewCandidate(evidenceItems, candidates, seen, intent)

  return {
    status: candidates.length ? 'CANDIDATES' : 'NO_CANDIDATES',
    candidates,
    candidateCount: candidates.length,
  }
}
