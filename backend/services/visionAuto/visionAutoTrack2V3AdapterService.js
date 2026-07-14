import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { analyzeShortsTrack2V3AddressSignal } from '../../src/services/shorts/track2-v3/shortsTrack2V3AddressSignalService.js'
import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import {
  applyShortsTrack2V3CandidateQualityGate,
  rankShortsTrack2V3CandidatesForReview,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'
import {
  buildShortsTrack2V3AsrReviewCandidates,
  extractShortsTrack2V3AsrEvidence,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrEvidenceService.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'
import { decideVisionAutoResult } from './visionFinalDecisionService.js'
import { resolveVisionLocationHypotheses } from './visionPlaceResolverService.js'
import { buildVisionLocationHypotheses } from './visionLocationHypothesisService.js'
import { buildVisionAutoResponse } from './visionResponseBuilder.js'
import { buildVisionAutoTrack2V3ProductClue } from './visionAutoTrack2V3ProductClueService.js'

function capText(value, maxLength = 300) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function roundScore(value, fallback = 0.62) {
  const parsed = Number(value)
  const safe = Number.isFinite(parsed) ? parsed : fallback
  return Math.round(Math.max(0, Math.min(1, safe)) * 1000) / 1000
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function normalizeComparableText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateAddress(candidate = {}) {
  const value = safeObject(candidate)
  return capText(
    value.addressFragment ||
      value.displayText ||
      value.formattedAddress ||
      '',
    300,
  )
}

function candidatePlaceName(candidate = {}) {
  const value = safeObject(candidate)
  return capText(value.placeName || value.name || '', 180)
}

function candidateRiskFlags(candidate = {}) {
  return Array.isArray(candidate?.riskFlags)
    ? candidate.riskFlags.map((value) => capText(value, 80)).filter(Boolean)
    : []
}

function candidateConfidence(candidate = {}) {
  if (Number.isFinite(Number(candidate?.confidence))) {
    return roundScore(candidate.confidence)
  }
  const flags = new Set(candidateRiskFlags(candidate))
  if (flags.has('NOISY_OCR') || flags.has('MISSING_STREET_NAME')) return 0.58
  if (flags.has('PARTIAL_ADDRESS')) return 0.6
  if (candidate?.type === 'FULL_ADDRESS_VERBATIM' || flags.has('VERIFY_ELIGIBLE')) {
    return 0.74
  }
  if (candidate?.type === 'ASR_FULL_ADDRESS_REVIEW') return 0.66
  if (candidate?.type === 'OCR_ADDRESS_FRAGMENT') return 0.64
  return candidateAddress(candidate) ? 0.62 : 0
}

const STRUCTURED_HOUSE_TOKEN_SOURCE = String.raw`\d{1,5}(?:[a-z]\d{0,3})?(?:\/\d{1,5}(?:[a-z]\d{0,3})?)?(?:-\d{1,5}(?:[a-z]\d{0,3})?)?`
const STRONG_REVIEW_REASONS = new Set([
  'ASR_FULL_ADDRESS_REVIEW',
  'ADDRESS_ANCHORED',
  'CLEAN_FULL_ADDRESS',
  'PLACE_PLUS_ADDRESS',
])

function track2IntentContext(result = {}) {
  const weakDescriptionTemplate = result.intentReason === 'DESCRIPTION_ADDRESSES_OF_PLACES'
  if (weakDescriptionTemplate) {
    return {
      intent: 'SINGLE_PLACE_LIKELY',
      inputClass: 'SINGLE_PLACE',
      mustNotResolve: false,
      originalIntent: result.intent || null,
      weakDescriptionTemplate: true,
    }
  }
  return {
    intent: result.intent || null,
    inputClass: result.inputClass || result.debug?.inputClass || null,
    mustNotResolve: result.mustNotResolve === true,
    originalIntent: result.intent || null,
    weakDescriptionTemplate: false,
  }
}

function explicitMultiFromTrack2(result = {}) {
  const intent = track2IntentContext(result)
  return Boolean(
    intent.mustNotResolve ||
    intent.inputClass === 'MULTI_PLACE_LISTICLE' ||
    /MULTI_PLACE|LISTICLE/iu.test(`${intent.intent || ''} ${result.reason || ''}`)
  )
}

function exactObservedAddressSubspan(candidate = {}) {
  const address = candidateAddress(candidate)
  if (!address) return candidate

  const match = address.match(
    new RegExp(`(?:^|[\\s,.;:])([1-9])\\s+((?:\\d{1,5}[a-z]\\d{0,3}|\\d{1,5}\\/\\d{1,5}[a-z]?|\\d{1,5}-\\d{1,5}[a-z]?)\\s+.+)$`, 'iu'),
  )
  const structuredAddress = capText(match?.[2], 300)
  const observedRemainder = structuredAddress
    .replace(/\s*[-–—]\s*\d{1,2}[:h]\d{2}\s*[-–—]\s*\d{1,2}[:h]\d{2}.*$/iu, '')
    .trim()
  if (!observedRemainder || !address.includes(observedRemainder)) return candidate

  const fullSignal = analyzeShortsTrack2V3AddressSignal(address)
  const remainderSignal = analyzeShortsTrack2V3AddressSignal(observedRemainder)
  if (
    !remainderSignal.composableAddressSignal ||
    remainderSignal.score < fullSignal.score + 12
  ) {
    return candidate
  }

  return {
    ...candidate,
    displayText: observedRemainder,
    addressFragment: observedRemainder,
    publicObservedSubspanUsed: true,
  }
}

function normalizeObservedCandidateForPublicDisplay(candidate = {}) {
  const address = candidateAddress(candidate)
  const observedText = address
  if (!hasBoundedBranchPrefix(address) && !hasBoundedBranchPrefix(observedText)) return candidate

  const normalized = capText(
    address
      .replace(/[\\|]+/gu, ' ')
      .replace(/^\s*[([{]?\s*(?:cs|cn|cơ\s*sở|co\s*so|chi\s*nhánh|chi\s*nhanh)\s*\d{1,3}\s*[)\]}:;,.\/-]*\s*/iu, '')
      .replace(/[()\[\]{}]+/gu, ' ')
      .replace(/\s+/gu, ' '),
    300,
  )
  if (!normalized || !analyzeShortsTrack2V3AddressSignal(normalized).composableAddressSignal) {
    return candidate
  }
  return {
    ...candidate,
    displayText: normalized,
    addressFragment: normalized,
    publicObservedSeparatorNormalization: true,
  }
}

function gateObservedCandidatesIndividuallyForPublic(candidates = [], evidence = [], intent = {}) {
  const gateIntent = {
    ...intent,
    // Track 2 candidates have already passed the core pipeline. Re-evaluate each
    // candidate independently so current safety rules can reject stale garbage,
    // but do not let list-level dedupe/mustNotResolve semantics erase temporal
    // observations needed for public location-hypothesis clustering.
    mustNotResolve: false,
  }
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate === 'object')
    .flatMap((candidate) => {
      const gate = applyShortsTrack2V3CandidateQualityGate({
        candidates: [candidate],
        evidence,
        intent: gateIntent,
      })
      return Array.isArray(gate.candidates) ? gate.candidates : []
    })
}

function multiPlaceObservedReviewFallback(candidate = {}, evidence = []) {
  if (!candidate || typeof candidate !== 'object') return false
  if (candidate.type === 'METADATA_ADDRESS' || candidate.type === 'MULTI_PLACE_REVIEW') return false
  const address = candidateAddress(candidate)
  if (!address) return false
  const signal = analyzeShortsTrack2V3AddressSignal(address)
  if (!signal.composableAddressSignal || signal.features?.noisyMenuPricePromo) return false
  const temporal = candidateTemporalContext(candidate, evidence)
  if (!temporal.segmentId && !temporal.episodeId && temporal.timestampSeconds == null) return false
  return publicHypothesisUsable(candidate, evidence)
}

function rebuildCandidatesFromObservedEvidence(result = {}, evidence = []) {
  const intent = track2IntentContext(result)
  const originalCandidates = (Array.isArray(result.candidates) ? result.candidates : [])
    .filter((candidate) => candidate && typeof candidate === 'object')
    .filter((candidate) => !(intent.mustNotResolve && candidate?.type === 'METADATA_ADDRESS'))
    .map(exactObservedAddressSubspan)
  const independentlyGated = gateObservedCandidatesIndividuallyForPublic(
    originalCandidates,
    evidence,
    intent,
  )
  const gatedKeys = new Set(independentlyGated.map((candidate) =>
    `${candidateAddress(candidate)}|${(candidate.evidenceIds || []).join(',')}`
  ))
  const multiPlaceReviewFallbacks = intent.mustNotResolve
    ? originalCandidates.filter((candidate) => {
        const key = `${candidateAddress(candidate)}|${(candidate.evidenceIds || []).join(',')}`
        return !gatedKeys.has(key) && multiPlaceObservedReviewFallback(candidate, evidence)
      })
    : []
  const originalKept = rankShortsTrack2V3CandidatesForReview([
    ...independentlyGated,
    ...multiPlaceReviewFallbacks,
  ]).map(normalizeObservedCandidateForPublicDisplay)

  if (originalKept.length) return originalKept

  // On a confirmed multi-place source, metadata/contact evidence must not be
  // rebuilt into an item location. Visual/ASR item evidence may still recover a
  // bounded review hypothesis for one observed branch/segment.
  const recoveryEvidence = intent.mustNotResolve
    ? evidence.filter((item) =>
        item?.sourceType !== 'metadata_text' &&
        !String(item?.id || '').startsWith('metadata:')
      )
    : evidence
  const rebuilt = buildShortsTrack2V3Candidates({ evidence: recoveryEvidence, intent })
  const rebuiltCandidates = (Array.isArray(rebuilt.candidates) ? rebuilt.candidates : [])
    .map(exactObservedAddressSubspan)
  const rebuiltGate = applyShortsTrack2V3CandidateQualityGate({
    candidates: rebuiltCandidates,
    evidence,
    intent,
  })
  const rebuiltKept = rankShortsTrack2V3CandidatesForReview(rebuiltGate.candidates || [])
    .map(normalizeObservedCandidateForPublicDisplay)
  if (!intent.mustNotResolve) return rebuiltKept

  return rebuiltKept.filter((candidate) => {
    if (candidate.type === 'ASR_FULL_ADDRESS_REVIEW') return true
    const linkedText = candidateEvidence(candidate, evidence).map(evidenceText).join('\n')
    return hasBoundedBranchPrefix(linkedText || candidateAddress(candidate))
  })
}

function recoverAsrReviewCandidates(result = {}, evidence = []) {
  if (!capText(result.asrTranscriptText, 20000)) {
    return { candidates: [], evidence: [], extraction: null }
  }
  if (result.intent === 'NO_ADDRESS_INTENT' || result.inputClass === 'RELEVANT_NEGATIVE') {
    return { candidates: [], evidence: [], extraction: null }
  }

  const extraction = extractShortsTrack2V3AsrEvidence({
    transcriptText: result.asrTranscriptText,
    segments: Array.isArray(result.asrTranscriptSegments) ? result.asrTranscriptSegments : [],
    provider: result.asrProvider || 'track2_v3_asr',
    model: result.asrModel || null,
    language: result.asrDetectedLanguage || result.asrRequestedLanguage || null,
  })
  const asrEvidence = Array.isArray(extraction.addressEvidence) ? extraction.addressEvidence : []
  if (!asrEvidence.length) return { candidates: [], evidence: [], extraction }

  const rawCandidates = buildShortsTrack2V3AsrReviewCandidates(asrEvidence)
  const allEvidence = [...evidence, ...asrEvidence]
  const gated = applyShortsTrack2V3CandidateQualityGate({
    candidates: rawCandidates,
    evidence: allEvidence,
    intent: track2IntentContext(result),
  })
  return {
    candidates: rankShortsTrack2V3CandidatesForReview(gated.candidates || []),
    evidence: asrEvidence,
    extraction,
  }
}

function distinctAddressCandidates(
  candidates = [],
  allEvidence = [],
  { preserveSegments = false } = {},
) {
  const seen = new Set()
  const result = []
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate !== 'object') continue
    const address = candidateAddress(candidate)
    const addressKey = normalizeComparableText(address)
    if (!addressKey) continue
    const context = preserveSegments
      ? candidateTemporalContext(candidate, allEvidence)
      : {}
    const scope = preserveSegments
      ? context.segmentId || context.episodeId || 'unsegmented'
      : 'global'
    const key = `${scope}|${addressKey}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

function bestAddressCandidate(candidates = [], allEvidence = []) {
  return [...distinctAddressCandidates(candidates, allEvidence)]
    .sort((left, right) =>
      candidateRepresentativeScore(right, allEvidence) -
      candidateRepresentativeScore(left, allEvidence)
    )[0] || null
}

function evidenceText(evidence = {}) {
  return capText(evidence.rawText || evidence.normalizedText || evidence.text || '', 220)
}

function evidenceMap(evidence = []) {
  const map = new Map()
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (item?.id) map.set(String(item.id), item)
  }
  return map
}

function candidateEvidence(candidate = {}, allEvidence = []) {
  const byId = evidenceMap(allEvidence)
  return (Array.isArray(candidate?.evidenceIds) ? candidate.evidenceIds : [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
}

function candidateTemporalContext(candidate = {}, allEvidence = []) {
  const related = candidateEvidence(candidate, allEvidence)
  const first = related[0] || {}
  const timestampSeconds = related
    .map((item) => Number(item?.timestampSeconds))
    .find(Number.isFinite)
  const startSeconds = related
    .map((item) => Number(item?.startSeconds))
    .find(Number.isFinite)
  const endSeconds = related
    .map((item) => Number(item?.endSeconds))
    .find(Number.isFinite)
  return {
    timestampSeconds: Number.isFinite(timestampSeconds) ? timestampSeconds : null,
    segmentId: first.segmentId || null,
    episodeId: first.episodeId || null,
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : null,
    endSeconds: Number.isFinite(endSeconds) ? endSeconds : null,
  }
}


function leadingHouseNumber(value = '') {
  const text = String(value || '').trim()
  const match = text.match(
    /^(?:s[oố]\s*)?(\d{1,5}[a-z]?(?:\s*\/\s*\d{1,5}[a-z]?)?(?:\s*-\s*\d{1,5}[a-z]?)?)\b/iu,
  )
  return match ? match[1].replace(/\s+/g, '') : null
}

function observedAddressCore(value = '') {
  const text = capText(value, 300)
  if (!text) return ''
  const houseNumber = leadingHouseNumber(text)
  if (!houseNumber) return text
  const match = text.match(
    /^(?:s[oố]\s*)?\d{1,5}[a-z]?(?:\s*\/\s*\d{1,5}[a-z]?)?(?:\s*-\s*\d{1,5}[a-z]?)?\s*(.*)$/iu,
  )
  return capText(match?.[1] || text, 300)
}

function candidateStreetCore(candidate = {}) {
  const address = candidateAddress(candidate)
  const withoutHouse = observedAddressCore(address)
  return normalizeComparableText(withoutHouse)
    .replace(/\b(?:phuong|p|ward|quan|q|district|tp|thanh pho)\b.*$/u, ' ')
    .replace(/\b(?:duong|street|road|hem|ngo|alley)\b/gu, ' ')
    .split(' ')
    .filter((token) => token && !/^\d+$/.test(token) && token.length > 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function boundedEditDistance(left = '', right = '', maximum = 1) {
  const a = String(left || '')
  const b = String(right || '')
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    let rowMinimum = current[0]
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      )
      rowMinimum = Math.min(rowMinimum, current[column])
    }
    if (rowMinimum > maximum) return maximum + 1
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length]
}

function compatibleStreetToken(left = '', right = '') {
  if (!left || !right) return false
  if (left === right) return true
  const shortest = Math.min(left.length, right.length)
  if (
    shortest >= 4 &&
    Math.abs(left.length - right.length) <= 2 &&
    (left.startsWith(right) || right.startsWith(left))
  ) {
    return true
  }
  return Math.max(left.length, right.length) >= 3 && boundedEditDistance(left, right, 1) <= 1
}

function streetCoreCompatible(left = '', right = '') {
  if (!left || !right) return false
  if (left === right) return true
  const leftTokens = left.split(' ').filter(Boolean)
  const rightTokens = right.split(' ').filter(Boolean)
  if (Math.min(leftTokens.length, rightTokens.length) < 2) return false

  const used = new Set()
  let matched = 0
  for (const leftToken of leftTokens) {
    const index = rightTokens.findIndex(
      (rightToken, candidateIndex) =>
        !used.has(candidateIndex) && compatibleStreetToken(leftToken, rightToken),
    )
    if (index >= 0) {
      used.add(index)
      matched += 1
    }
  }
  if (matched / Math.min(leftTokens.length, rightTokens.length) >= 0.75) return true

  const collapse = (value = '') => String(value || '').replace(/\s+/g, '')
  const bigrams = (value = '') => {
    const text = collapse(value)
    return Array.from({ length: Math.max(0, text.length - 1) }, (_, index) =>
      text.slice(index, index + 2),
    )
  }
  const leftBigrams = bigrams(left)
  const rightBigrams = bigrams(right)
  if (!leftBigrams.length || !rightBigrams.length || matched < 1) return false
  const counts = new Map()
  for (const gram of leftBigrams) counts.set(gram, (counts.get(gram) || 0) + 1)
  let overlap = 0
  for (const gram of rightBigrams) {
    if ((counts.get(gram) || 0) <= 0) continue
    overlap += 1
    counts.set(gram, counts.get(gram) - 1)
  }
  const dice = (2 * overlap) / (leftBigrams.length + rightBigrams.length)
  return dice >= 0.82
}

function explicitAdminContext(value = '') {
  const text = normalizeComparableText(value)
  const ward = text.match(/\b(?:phuong|p|ward)\s*([a-z0-9]+)\b/u)?.[1] || null
  const district = text.match(/\b(?:quan|q|district)\s*([a-z0-9]+)\b/u)?.[1] || null
  const city = [
    ['ho chi minh', 'ho_chi_minh'],
    ['hcm', 'ho_chi_minh'],
    ['ha noi', 'ha_noi'],
    ['da nang', 'da_nang'],
    ['can tho', 'can_tho'],
    ['da lat', 'da_lat'],
  ].find(([needle]) => text.includes(needle))?.[1] || null
  return { ward, district, city }
}

function adminContextsCompatible(left = {}, right = {}) {
  for (const key of ['ward', 'district', 'city']) {
    if (left?.[key] && right?.[key] && left[key] !== right[key]) return false
  }
  return true
}

function placeNamesCompatible(left = {}, right = {}) {
  const leftName = normalizeComparableText(candidatePlaceName(left))
  const rightName = normalizeComparableText(candidatePlaceName(right))
  if (!leftName || !rightName) return true
  return streetCoreCompatible(leftName, rightName) || leftName === rightName
}

function hypothesisTemporalCompatible(left = {}, right = {}, allEvidence = [], explicitMulti = false) {
  const leftContext = candidateTemporalContext(left, allEvidence)
  const rightContext = candidateTemporalContext(right, allEvidence)

  if (
    explicitMulti &&
    leftContext.segmentId &&
    rightContext.segmentId &&
    leftContext.segmentId !== rightContext.segmentId
  ) {
    return false
  }
  if (
    leftContext.segmentId &&
    rightContext.segmentId &&
    leftContext.segmentId === rightContext.segmentId
  ) {
    return true
  }

  const leftTime = Number(leftContext.timestampSeconds)
  const rightTime = Number(rightContext.timestampSeconds)
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return Math.abs(leftTime - rightTime) <= 8
  }
  return false
}

function candidatesBelongToSameLocationHypothesis(
  left = {},
  right = {},
  allEvidence = [],
  { explicitMulti = false } = {},
) {
  const leftAddress = candidateAddress(left)
  const rightAddress = candidateAddress(right)
  if (!leftAddress || !rightAddress) return false

  const exactSameAddress = normalizeComparableText(leftAddress) === normalizeComparableText(rightAddress)
  if (
    explicitMulti &&
    candidateTemporalContext(left, allEvidence).segmentId &&
    candidateTemporalContext(right, allEvidence).segmentId &&
    candidateTemporalContext(left, allEvidence).segmentId !==
      candidateTemporalContext(right, allEvidence).segmentId
  ) {
    return false
  }
  if (exactSameAddress) return true

  const leftStreet = candidateStreetCore(left)
  const rightStreet = candidateStreetCore(right)
  if (!streetCoreCompatible(leftStreet, rightStreet)) return false
  if (!placeNamesCompatible(left, right)) return false
  if (
    !adminContextsCompatible(
      explicitAdminContext(leftAddress),
      explicitAdminContext(rightAddress),
    )
  ) {
    return false
  }
  return hypothesisTemporalCompatible(left, right, allEvidence, explicitMulti)
}

function candidateRepresentativeScore(candidate = {}, allEvidence = []) {
  const address = candidateAddress(candidate)
  const admin = explicitAdminContext(address)
  const adminSupport = ['ward', 'district', 'city'].filter((key) => admin[key]).length
  const streetTokens = candidateStreetCore(candidate).split(' ').filter(Boolean).length
  const flags = new Set(candidateRiskFlags(candidate))
  const reason = capText(candidate.qualityGateReason, 80)
  const reasonBonus = reason === 'ASR_FULL_ADDRESS_REVIEW'
    ? 42
    : reason === 'CLEAN_FULL_ADDRESS'
      ? 38
      : reason === 'ADDRESS_ANCHORED'
        ? 34
        : reason === 'PLACE_PLUS_ADDRESS'
          ? 30
          : reason === 'PARTIAL_HOUSE_STREET_REVIEW'
            ? 12
            : 0
  const reasonPenalty = reason === 'NOISY_NAMED_ADMIN_ADDRESS' ? 48 : 0
  const semanticSignal = analyzeShortsTrack2V3AddressSignal(address)
  return (
    candidateConfidence(candidate) * 100 +
    reasonBonus -
    reasonPenalty +
    adminSupport * 12 +
    Math.min(5, streetTokens) * 2 +
    Math.min(4, candidateEvidence(candidate, allEvidence).length) +
    Math.min(20, Number(semanticSignal.score || 0) / 5) -
    (flags.has('NOISY_OCR') ? 8 : 0) -
    (flags.has('OCR_GARBAGE_TOKENS') ? 12 : 0)
  )
}

function hasBoundedBranchPrefix(value = '') {
  return /(?:^|[\s([{])(?:cs|cn|co\s*so|chi\s*nhanh)\s*\d{1,3}\s*[\\|/:;,.()\[\]{}-]+\s*\d{1,5}/iu
    .test(normalizeComparableText(String(value || '').replace(/[\\|]+/gu, ' '))) ||
    /(?:^|[\s([{])(?:cs|cn|cơ\s*sở|chi\s*nhánh)\s*\d{1,3}\s*[\\|/:;,.()\[\]{}-]+\s*\d{1,5}/iu
      .test(String(value || ''))
}

function publicHypothesisUsable(candidate = {}, allEvidence = []) {
  const address = candidateAddress(candidate)
  if (!address) return false
  const reason = capText(candidate.qualityGateReason, 80)
  if (candidate.type === 'METADATA_ADDRESS' || STRONG_REVIEW_REASONS.has(reason)) return true

  const signal = analyzeShortsTrack2V3AddressSignal(address)
  if (signal.strongAddressAnchor) return true
  if (signal.signalClass !== 'HOUSE_STREET_PARTIAL') return false

  const streetTokens = candidateStreetCore(candidate).split(' ').filter(Boolean)
  const structuredHouse = new RegExp(`^(?:s[oố]\s*)?${STRUCTURED_HOUSE_TOKEN_SOURCE}`, 'iu')
    .test(address) && /[a-z\/-]/iu.test(leadingHouseNumber(address) || '')
  const branchObserved = hasBoundedBranchPrefix(
    [address, ...candidateEvidence(candidate, allEvidence).map(evidenceText)].join('\n'),
  )
  return Boolean(
    streetTokens.length >= 2 &&
    (streetTokens.some((token) => token.length >= 4) || structuredHouse || branchObserved)
  )
}

function prunePublicLocationHypotheses(candidates = [], allEvidence = [], { explicitMulti = false } = {}) {
  const usable = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => publicHypothesisUsable(candidate, allEvidence))
    .filter((candidate) =>
      !(explicitMulti && capText(candidate.qualityGateReason, 80) === 'NOISY_NAMED_ADMIN_ADDRESS')
    )
    .sort((left, right) =>
      candidateRepresentativeScore(right, allEvidence) -
      candidateRepresentativeScore(left, allEvidence)
    )
  if (explicitMulti || usable.length <= 1) return usable

  const strongest = usable[0]
  const strongestReason = capText(strongest?.qualityGateReason, 80)
  if (strongest?.type === 'METADATA_ADDRESS' || strongestReason === 'ASR_FULL_ADDRESS_REVIEW') {
    return [strongest]
  }
  const strongExists = STRONG_REVIEW_REASONS.has(strongestReason)
  if (!strongExists) return usable
  const strongestScore = candidateRepresentativeScore(strongest, allEvidence)

  return usable.filter((candidate, index) => {
    if (index === 0) return true
    const reason = capText(candidate.qualityGateReason, 80)
    if (reason === 'NOISY_NAMED_ADMIN_ADDRESS') return false
    if (reason === 'PARTIAL_HOUSE_STREET_REVIEW') {
      return candidateRepresentativeScore(candidate, allEvidence) >= strongestScore - 10
    }
    return true
  })
}

function buildLocationHypotheses(
  candidates = [],
  allEvidence = [],
  { explicitMulti = false } = {},
) {
  const sourceCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate === 'object')
    .filter((candidate) => candidate.type !== 'MULTI_PLACE_REVIEW')
    .filter((candidate) => candidateAddress(candidate))
  const clusters = []

  for (const candidate of sourceCandidates) {
    const cluster = clusters.find((item) =>
      item.members.some((member) =>
        candidatesBelongToSameLocationHypothesis(
          member,
          candidate,
          allEvidence,
          { explicitMulti },
        ),
      ),
    )
    if (cluster) cluster.members.push(candidate)
    else clusters.push({ members: [candidate] })
  }

  return clusters.map(({ members }, index) => {
    const representative = [...members].sort(
      (left, right) =>
        candidateRepresentativeScore(right, allEvidence) -
        candidateRepresentativeScore(left, allEvidence),
    )[0]
    const houseNumberAlternatives = [...new Set(
      members
        .flatMap((candidate) => [
          leadingHouseNumber(candidateAddress(candidate)),
          ...(Array.isArray(candidate.houseNumberAlternatives)
            ? candidate.houseNumberAlternatives
            : []),
        ])
        .map((value) => capText(value, 40))
        .filter(Boolean),
    )].slice(0, 6)
    const houseNumberConflict = Boolean(
      houseNumberAlternatives.length > 1 ||
      members.some((candidate) => candidate.houseNumberConflict === true),
    )
    const representativeAddress = candidateAddress(representative)
    const address = houseNumberConflict
      ? observedAddressCore(representativeAddress)
      : representativeAddress
    const evidenceIds = [...new Set(
      members.flatMap((candidate) =>
        Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds : [],
      ),
    )].slice(0, 12)

    return {
      ...representative,
      id: representative.id || `location-hypothesis:${index}`,
      addressFragment: address,
      displayText: address,
      evidenceIds,
      confidence: Math.max(...members.map((candidate) => candidateConfidence(candidate))),
      houseNumberConflict,
      houseNumberAlternatives,
      observationCount: members.length,
      reviewRequired: true,
    }
  })
}

function frameEvidenceFromTrack2(evidence = []) {
  return (Array.isArray(evidence) ? evidence : [])
    .map((item) => {
      const text = evidenceText(item)
      if (!text) return null
      const timestampSeconds = Number.isFinite(Number(item.timestampSeconds))
        ? Number(item.timestampSeconds)
        : null
      return {
        source: item.source || item.provider || 'track2_v3_visual_evidence',
        timestampSeconds,
        timestamps: timestampSeconds == null ? [] : [timestampSeconds],
        text,
        type: item.type || item.sourceType || 'other',
        confidence: roundScore(item.confidence, 0.5),
        supportCount: Number.isFinite(Number(item.supportCount))
          ? Number(item.supportCount)
          : 1,
        warnings: Array.isArray(item.riskFlags) ? item.riskFlags : [],
      }
    })
    .filter(Boolean)
    .slice(0, 16)
}

function ocrLinesFromTrack2(evidence = []) {
  return frameEvidenceFromTrack2(evidence)
    .map((item) => item.text)
    .filter(Boolean)
    .slice(0, 20)
}

function audioTextsFromTrack2(result = {}) {
  const debug = result.debug || {}
  const segmentTexts = (Array.isArray(result.asrTranscriptSegments)
    ? result.asrTranscriptSegments
    : [])
    .map((segment) => segment?.text)
    .filter(Boolean)
  const values = [
    ...(Array.isArray(result.asrTranscriptBestSnippets) ? result.asrTranscriptBestSnippets : []),
    ...segmentTexts.slice(-8),
    ...(Array.isArray(debug.asrBestSnippets) ? debug.asrBestSnippets : []),
    ...(Array.isArray(debug.asrTranscripts) ? debug.asrTranscripts : []),
    result.asrTranscriptText,
  ]
  return [...new Set(values.map((value) => capText(value, 220)).filter(Boolean))]
    .slice(0, 12)
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  if (/^0[35789]\d{8}$/.test(local) || /^02\d{8,9}$/.test(local)) return local
  return null
}

function phonesFromTrack2Evidence(evidence = []) {
  const seen = new Set()
  const phones = []
  const pattern = /(?:\+?84|0)(?:[\s.-]?\d){9,10}\b/g
  for (const item of Array.isArray(evidence) ? evidence : []) {
    const text = evidenceText(item)
    for (const match of text.matchAll(pattern)) {
      const value = normalizePhone(match[0])
      if (!value || seen.has(value)) continue
      seen.add(value)
      phones.push({
        value,
        normalized: value,
        confidence: 0.72,
        source: 'track2_v3',
        evidence: [text],
      })
      if (phones.length >= 4) return phones
    }
  }
  return phones
}

function warningsFromTrack2(result = {}, extraWarnings = []) {
  const warnings = []
  for (const error of Array.isArray(result.providerErrors) ? result.providerErrors : []) {
    const code = capText(error?.code || error?.reason || 'track2_v3_provider_warning', 100)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
    if (code) warnings.push(code)
  }
  if (result.mustNotResolve) warnings.push('track2_v3_review_only')
  if (result.debug?.lateRescueSufficient === false) warnings.push('track2_v3_late_rescue_insufficient')
  warnings.push(...(Array.isArray(extraWarnings) ? extraWarnings : []))
  return [...new Set(warnings.map((value) => capText(value, 100)).filter(Boolean))].slice(0, 16)
}

function emptyNamedEntity() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function track2Entities(result = {}, candidates = [], evidenceOverride = null) {
  const visualEvidence = Array.isArray(evidenceOverride)
    ? evidenceOverride
    : Array.isArray(result.evidence)
      ? result.evidence
      : []
  const explicitMulti = explicitMultiFromTrack2(result)
  const scopedCandidates = buildLocationHypotheses(candidates, visualEvidence, { explicitMulti })
  const bestCandidate = bestAddressCandidate(scopedCandidates, visualEvidence)
  const isMulti = scopedCandidates.length > 1
  const addressCandidates = scopedCandidates.map((candidate) => {
    const context = candidateTemporalContext(candidate, visualEvidence)
    return {
      address: candidateAddress(candidate),
      confidence: candidateConfidence(candidate),
      source: 'track2_v3',
      timestampSeconds: context.timestampSeconds,
      evidence: candidateEvidence(candidate, visualEvidence)
        .map((item) => evidenceText(item))
        .filter(Boolean)
        .slice(0, 4),
      ...(candidatePlaceName(candidate) ? { placeName: candidatePlaceName(candidate) } : {}),
      ...context,
      houseNumberConflict: candidate.houseNumberConflict === true,
      houseNumberAlternatives: Array.isArray(candidate.houseNumberAlternatives)
        ? candidate.houseNumberAlternatives.slice(0, 6)
        : [],
      observationCount: Math.max(1, Number(candidate.observationCount) || 1),
      reviewRequired: true,
    }
  })
  const address = candidateAddress(bestCandidate)
  const placeName = candidatePlaceName(bestCandidate)
  const confidence = candidateConfidence(bestCandidate)

  return {
    placeName: placeName && !isMulti
      ? {
          value: placeName,
          confidence: Math.max(0.6, confidence - 0.05),
          source: 'track2_v3',
          evidence: [placeName],
        }
      : emptyNamedEntity(),
    address: address && !isMulti
      ? {
          value: address,
          confidence,
          source: 'track2_v3',
          evidence: [address],
          reviewRequired: true,
        }
      : emptyNamedEntity(),
    phones: phonesFromTrack2Evidence(visualEvidence),
    dishNames: [],
    locationHints: [],
    priceHints: [],
    addressCandidates,
    warnings: [],
    status: address && !isMulti ? 'address_found' : 'unclear',
    confidence: address && !isMulti ? confidence : 0,
  }
}

function localBestResult(match = {}, providerResult = {}) {
  return {
    name: match.name || providerResult.name || null,
    formattedAddress: match.address || match.district || providerResult.formattedAddress || null,
    phone: providerResult.phone || null,
    lat: Number.isFinite(Number(match.lat)) ? Number(match.lat) : providerResult.lat ?? null,
    lng: Number.isFinite(Number(match.lng)) ? Number(match.lng) : providerResult.lng ?? null,
    placeId: providerResult.placeId || null,
    source: 'food_map_local',
    sourceType: match.sourceType || null,
    sourceId: match.sourceId ?? null,
    confidence: roundScore(match.confidence, providerResult.confidence || 0.82),
    matchReasons: Array.isArray(match.matchReasons) ? match.matchReasons.slice(0, 8) : [],
  }
}

function track2ResolverContext(track2Result = {}) {
  const result = safeObject(track2Result)
  const visualEvidence = Array.isArray(result.evidence) ? result.evidence : []
  const explicitMulti = explicitMultiFromTrack2(result)
  let candidates = rebuildCandidatesFromObservedEvidence(result, visualEvidence)
  let outputCandidates = prunePublicLocationHypotheses(
    buildLocationHypotheses(candidates, visualEvidence, { explicitMulti }),
    visualEvidence,
    { explicitMulti },
  )
  if (!outputCandidates.length) {
    const asrRecovery = recoverAsrReviewCandidates(result, visualEvidence)
    if (asrRecovery.candidates.length) {
      const allEvidence = [...visualEvidence, ...asrRecovery.evidence]
      candidates = [...candidates, ...asrRecovery.candidates]
      outputCandidates = prunePublicLocationHypotheses(
        buildLocationHypotheses(candidates, allEvidence, { explicitMulti }),
        allEvidence,
        { explicitMulti },
      )
    }
  }
  const hypotheses = buildVisionLocationHypotheses(
    outputCandidates.map((candidate) => {
      const context = candidateTemporalContext(candidate, visualEvidence)
      return {
        address: candidateAddress(candidate),
        placeName: candidatePlaceName(candidate),
        confidence: candidateConfidence(candidate),
        source: 'track2_v3',
        ...context,
      }
    }),
    { sourceMayContainMultiplePlaces: explicitMulti },
  )
  const reviewCandidates = outputCandidates.map((candidate, index) => {
    const temporalContext = candidateTemporalContext(candidate, visualEvidence)
    return {
      id: candidate.id || `track2-v3-review:${index + 1}`,
      placeName: candidatePlaceName(candidate) || null,
      address: candidateAddress(candidate),
      confidence: candidateConfidence(candidate),
      timestampSeconds: temporalContext.timestampSeconds,
      reviewRequired: true,
      canAutoResolve: false,
    }
  }).filter((candidate) => Boolean(candidate.address))
  if (!reviewCandidates.length) {
    const productClue = buildVisionAutoTrack2V3ProductClue(result)
    if (productClue?.locality) {
      reviewCandidates.push({
        id: 'track2-v3-product-clue:1',
        placeName: productClue.placeName || null,
        address: productClue.locality,
        confidence: productClue.confidence,
        timestampSeconds: productClue.timestampSeconds,
        reviewRequired: true,
        canAutoResolve: false,
      })
    }
  }
  return {
    hypotheses,
    reviewCandidates,
    isMultiPlace: explicitMulti,
    locationHypothesisCount: hypotheses.length,
    warnings: warningsFromTrack2(result),
  }
}

async function resolveTrack2V3PlaceOutcome({
  input,
  track2Result,
  config,
  dependencies,
} = {}) {
  const context = track2ResolverContext(track2Result)
  const resolvePlaces = dependencies.resolvePlaces || resolveVisionLocationHypotheses
  let placeResolution
  try {
    placeResolution = await resolvePlaces(
      { hypotheses: context.hypotheses, config, signal: dependencies.signal || null },
      {
        ...(dependencies.placeResolverOptions || {}),
        ...(dependencies.findDuplicateFoodMapPlaceFromEvidence
          ? { findLocalMatch: dependencies.findDuplicateFoodMapPlaceFromEvidence }
          : {}),
      },
    )
  } catch {
    placeResolution = {
      resolution: { status: 'not_found', confidence: 0 },
      placeCandidates: [],
      localMatches: [],
      warnings: ['track2_v3_place_resolution_unavailable'],
    }
  }
  const decision = decideVisionAutoResult({
    resolution: placeResolution.resolution,
    placeCandidates: placeResolution.placeCandidates,
    sourceContext: { isMultiPlace: context.isMultiPlace },
  })
  return {
    decision,
    placeCandidates: placeResolution.placeCandidates || [],
    sourceContext: { isMultiPlace: context.isMultiPlace, resolvedCount: (placeResolution.placeCandidates || []).length },
    warnings: [...context.warnings, ...(placeResolution.warnings || [])],
    resolutionStatus: placeResolution.resolution?.status || 'not_found',
    localDuplicateMatched: (placeResolution.localMatches || []).length > 0,
    locationHypothesisCount: context.locationHypothesisCount,
  }
}

function augmentDraft(draft = null, bestResult = null, input = {}) {
  if (!draft) return null
  const provider = safeObject(bestResult)
  return {
    ...draft,
    sourceUrl: draft.sourceUrl || input?.url || null,
    reviewRequired: true,
    ...(Number.isFinite(Number(provider.lat)) ? { lat: Number(provider.lat) } : {}),
    ...(Number.isFinite(Number(provider.lng)) ? { lng: Number(provider.lng) } : {}),
    ...(provider.placeId ? { providerPlaceId: capText(provider.placeId, 255) } : {}),
    ...(provider.source ? { provider: capText(provider.source, 80) } : {}),
  }
}

export function shouldUseVisionAutoTrack2V3({ input, config = {}, env = process.env } = {}) {
  if (input?.type !== 'youtube_url') return false
  if (config.youtubeTrack2V3Enabled !== true) return false
  return getShortsTrack2V3Config(env).enabled === true
}

export function mapShortsTrack2V3ToVisionAutoResponse({
  input,
  track2Result = {},
  debugLevel = 'summary',
  placeOutcome = null,
} = {}) {
  const result = safeObject(track2Result)
  const context = track2ResolverContext(result)
  const fallbackDecision = decideVisionAutoResult({
    resolution: { status: 'not_found' },
    placeCandidates: [],
    sourceContext: { isMultiPlace: context.isMultiPlace },
  })
  const decision = safeObject(placeOutcome?.decision).status
    ? placeOutcome.decision
    : fallbackDecision
  const publicDecision = decision.status === 'not_found' && context.reviewCandidates.length
    ? { status: 'review_candidates' }
    : decision
  return buildVisionAutoResponse({
    ...publicDecision,
    input,
    reviewCandidates: context.reviewCandidates,
    sourceContext: placeOutcome?.sourceContext || {
      isMultiPlace: context.isMultiPlace,
    },
    warnings: [...context.warnings, ...(placeOutcome?.warnings || [])],
    debugLevel,
    steps: [
      'vision_auto_input_resolved',
      'vision_auto_youtube_track2_v3_routed',
      `vision_place_resolution_${placeOutcome?.resolutionStatus || 'not_found'}`,
      `vision_final_${publicDecision.status}`,
    ],
  })
}

function boundedProductInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? Math.round(number) : fallback))
}

export function buildVisionAutoTrack2V3ProductConfig(
  normalConfig = {},
  requestDeadlineMs = 150_000,
  runtimeGates = {},
) {
  const deadlineMs = boundedProductInteger(requestDeadlineMs, 150_000, 30_000, 180_000)
  const productConfig = {
    ...normalConfig,
    mediaAcquisitionTimeoutMs: Math.min(
      boundedProductInteger(normalConfig.mediaAcquisitionTimeoutMs, 60_000, 10_000, 90_000),
      Math.max(10_000, deadlineMs - 20_000),
    ),
    mediaAcquisitionMaxAttempts: boundedProductInteger(normalConfig.mediaAcquisitionMaxAttempts, 2, 1, 2),
    smartOverlayTimeoutMs: Math.min(
      boundedProductInteger(normalConfig.smartOverlayTimeoutMs, 60_000, 15_000, 120_000),
      Math.max(15_000, deadlineMs - 15_000),
    ),
    maxSmartOverlayFrames: boundedProductInteger(normalConfig.maxSmartOverlayFrames, 60, 24, 60),
    maxSmartOverlaySelectedImages: boundedProductInteger(normalConfig.maxSmartOverlaySelectedImages, 24, 12, 24),
    cheapFrameCount: boundedProductInteger(normalConfig.cheapFrameCount, 8, 6, 12),
    maxOcrImages: boundedProductInteger(normalConfig.maxOcrImages, 16, 12, 28),
    maxLocalOcrImages: boundedProductInteger(normalConfig.maxLocalOcrImages, 24, 12, 30),
    maxPaddleOcrImages: boundedProductInteger(normalConfig.maxPaddleOcrImages, 6, 1, 12),
    maxEasyOcrImages: boundedProductInteger(normalConfig.maxEasyOcrImages, 6, 1, 12),
    maxTesseractDeepPassImages: boundedProductInteger(normalConfig.maxTesseractDeepPassImages, 3, 0, 8),
    localOcrTimeoutMs: boundedProductInteger(normalConfig.localOcrTimeoutMs, 30_000, 8_000, 60_000),
    // Preserve enabled rescue stages from the authoritative Track 2 config.
    // The product boundary limits work; it must not silently disable evidence collection.
    track2V3OcrBoostEnabled: normalConfig.track2V3OcrBoostEnabled === true,
    ocrBoostEnabled: normalConfig.ocrBoostEnabled === true,
    adaptiveFrameSamplingEnabled: normalConfig.adaptiveFrameSamplingEnabled === true,
    asrFallbackEnabled: normalConfig.asrFallbackEnabled === true,
    windowedAsrEnabled: normalConfig.windowedAsrEnabled === true,
  }

  // Track 2 has its own granular switches, but Vision Auto also has parent
  // provider gates. A disabled parent must win; otherwise the job can enter a
  // long Gemini/ASR rescue path that health reports as disabled and exhaust
  // the public request deadline.
  if (runtimeGates.asrEffectiveEnabled === false) {
    productConfig.asrFallbackEnabled = false
  }
  if (runtimeGates.geminiEffectiveEnabled === false) {
    productConfig.track2V3GeminiVisionEnabled = false
    productConfig.track2V3GeminiCropJudgeEnabled = false
  }

  return productConfig
}

export async function analyzeVisionAutoYoutubeWithTrack2V3({ input, config = {}, dependencies = {} } = {}) {
  // Vision Auto is already routed to Track 2 V3. Calling the legacy two-track
  // wrapper first repeats slow Track 1 acquisition before the canonical media
  // session can hydrate the URL. Direct V3 routing preserves the existing V3
  // lifecycle while keeping the request deadline meaningful.
  const runner = dependencies.runShortsPipeline || dependencies.runShortsTrack2V3Pipeline || runShortsTrack2V3Pipeline
  const normalConfig = getShortsTrack2V3Config(dependencies.env || process.env)
  const productConfig = buildVisionAutoTrack2V3ProductConfig(normalConfig, config.requestDeadlineMs, {
    asrEffectiveEnabled: config.asrEffectiveEnabled,
    geminiEffectiveEnabled: config.geminiEffectiveEnabled,
  })
  productConfig.maxDurationSeconds = Math.max(
    15,
    Math.min(
      Number(normalConfig.maxDurationSeconds || 180),
      Number(input?.maxDurationSec || config.maxVideoDurationSeconds || 180),
    ),
  )
  const track2Result = await runner(
    dependencies.runShortsPipeline ? input.url : { url: input.url, sourceUrl: input.url },
    {
    ...dependencies.track2V3Options,
    env: dependencies.env || process.env,
    track2V3Config: dependencies.track2V3Config || productConfig,
    signal: dependencies.signal || null,
    requestDeadlineMs: config.requestDeadlineMs,
    },
  )
  const placeOutcome = await resolveTrack2V3PlaceOutcome({
    input,
    track2Result,
    config,
    dependencies,
  })
  return mapShortsTrack2V3ToVisionAutoResponse({
    input,
    track2Result,
    debugLevel: config.debugLevel,
    placeOutcome,
  })
}

export default {
  shouldUseVisionAutoTrack2V3,
  analyzeVisionAutoYoutubeWithTrack2V3,
  mapShortsTrack2V3ToVisionAutoResponse,
}
