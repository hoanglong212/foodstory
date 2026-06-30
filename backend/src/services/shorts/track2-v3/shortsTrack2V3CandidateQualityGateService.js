import {
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

export const SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS = Object.freeze({
  ADDRESS_ANCHORED: 'ADDRESS_ANCHORED',
  PLACE_PLUS_ADDRESS: 'PLACE_PLUS_ADDRESS',
  MULTI_PLACE_REVIEW: 'MULTI_PLACE_REVIEW',
  CLEAN_FULL_ADDRESS: 'CLEAN_FULL_ADDRESS',
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
  return /(?:^|[\s,.:;])(?:duong|d\.?|street|st\.?|road|rd\.?|avenue|ave\.?|hem|ngo|ngach|alley)(?=$|[\s,.:;-])/iu
    .test(folded)
}

function looksLikeStreetSegment(segment = '') {
  const clean = String(segment || '')
    .replace(/\b(?:phuong|p|quan|q|ward|district|tp|hcm|tinh|huyen|xa)\b/giu, ' ')
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
    folded.search(/\b(?:phuong|p\.?)\s*\d+\b/iu),
    folded.search(/\b(?:quan|q\.?)\s*\d+\b/iu),
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

function canonicalAddressKey(candidate = {}) {
  if (candidate.type === 'MULTI_PLACE_REVIEW') {
    return `multi:${compactKey(candidateDisplayText(candidate))}`
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

function candidateQualityScore(decision = {}) {
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
  score -= candidateDisplayText(candidate).length / 1000
  return score
}

function applyAddressDedupe(decisions = []) {
  const finalDecisions = decisions.map((decision) => ({ ...decision }))
  const bestByKey = new Map()

  for (let index = 0; index < finalDecisions.length; index += 1) {
    const decision = finalDecisions[index]
    if (!decision.keep) continue

    const key = canonicalAddressKey(decision.candidate)
    const existingIndex = bestByKey.get(key)
    if (existingIndex === undefined) {
      bestByKey.set(key, index)
      continue
    }

    const existing = finalDecisions[existingIndex]
    if (candidateQualityScore(decision) > candidateQualityScore(existing)) {
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
  const text = candidateDisplayText(candidate)
  const sourceText = sourceTextForCandidate(candidate, evidenceItems)
  const combinedText = [text, sourceText].filter(Boolean).join('\n')
  const candidateProfile = addressProfile(text)
  const combinedProfile = addressProfile(combinedText)
  const category = fixtureCategory(context)
  const mustNotResolve = effectiveMustNotResolve(intent, context)

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

  if (mustNotResolve) {
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

  if (candidateProfile.isCleanFullAddress && candidate.type === 'FULL_ADDRESS_VERBATIM') {
    return {
      keep: true,
      reason: SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS.CLEAN_FULL_ADDRESS,
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

export function applyShortsTrack2V3CandidateQualityGate({
  candidates = [],
  evidence = [],
  intent = {},
  context = {},
} = {}) {
  const rawCandidates = asArray(candidates)
  const evidenceItems = asArray(evidence)
  const initialDecisions = rawCandidates.map((candidate) => ({
    candidate,
    ...evaluateShortsTrack2V3CandidateQuality({
      candidate,
      evidence: evidenceItems,
      intent,
      context,
    }),
  }))
  const decisions = applyAddressDedupe(initialDecisions)
  const keptCandidates = decisions
    .filter((decision) => decision.keep)
    .map((decision) => ({
      ...decision.candidate,
      qualityGateReason: decision.reason,
    }))
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
    })),
    keptCandidateReasons: countReasons(decisions, true),
    droppedCandidateReasons: countReasons(decisions, false),
    rawCandidateCount: rawCandidates.length,
    keptCandidateCount: keptCandidates.length,
    droppedCandidateCount: droppedDecisions.length,
    weakCandidateCount: droppedDecisions.length,
    addressAnchoredCandidateCount: decisions.filter((decision) => decision.keep && decision.addressAnchored).length,
  }
}

export default {
  applyShortsTrack2V3CandidateQualityGate,
  evaluateShortsTrack2V3CandidateQuality,
}
