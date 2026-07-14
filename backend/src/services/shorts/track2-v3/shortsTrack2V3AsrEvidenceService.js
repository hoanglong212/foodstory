import {
  classifyShortsTrack2V3NumericContexts,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES,
} from './shortsTrack2V3NumericContextSafetyService.js'

const MAX_SEGMENTS = 500
const MAX_SEGMENT_TEXT = 1200
const MAX_WINDOW_SEGMENTS = 3

const ASR_EVIDENCE_TYPES = Object.freeze({
  TRANSCRIPT: 'ASR_TRANSCRIPT_EVIDENCE',
  FULL: 'ASR_FULL_ADDRESS',
  PARTIAL: 'ASR_PARTIAL_ADDRESS',
  PLACE_OR_DISTRICT: 'ASR_PLACE_OR_DISTRICT_ONLY',
})

const CORROBORATION_TYPES = Object.freeze({
  NEW: 'ASR_NEW_ADDRESS_EVIDENCE',
  VISUAL: 'ASR_CORROBORATES_VISUAL_FRAGMENT',
  METADATA: 'ASR_CORROBORATES_METADATA',
  CONFLICT: 'ASR_CONFLICTS_WITH_VISUAL_OR_METADATA',
  NONE: 'ASR_NO_CORROBORATION',
})

const GENERIC_STREET_FOLLOWERS = new Set([
  'a', 'hien', 'la', 'luc', 'nay', 'no', 'ngoai', 'ra', 'ruot', 've', 'xuong',
])
const LOCATION_TOKEN_STOP_WORDS = new Set([
  'ban', 'cua', 'dia', 'chi', 'duong', 'hem', 'huyen', 'khu', 'mo', 'nam', 'nha',
  'o', 'pho', 'phuong', 'quan', 'sai', 'gon', 'tai', 'thanh', 'tp', 'tren',
])

const IMPLICIT_ADDRESS_CUE_PATTERN = /\b(?:dia chi|địa chỉ|day la|đây là|de day|để đây|chinh la|chính là|quan|quán|tiem|tiệm|co so|cơ sở|chi nhanh|chi nhánh|nam o|nằm ở|nam tai|nằm tại|tai so|tại số|o so|ở số|duong|đường|hem|hẻm)\b/iu
const IMPLICIT_STREET_REJECT_WORDS = new Set([
  'banh', 'bot', 'canh', 'com', 'duong', 'ga', 'gia', 'gram', 'hat', 'kg', 'mam',
  'mi', 'ml', 'mon', 'muoi', 'nuoc', 'phan', 'phut', 'sot', 'thia', 'tom', 'tuong',
  'co', 'cay', 'day', 'hoan', 'la', 'lam', 'nha', 'nhat', 'ngon', 'roi', 'tang', 'tan',
  'phuong', 'quan', 'huyen', 'tp', 'thanh', 'pho',
])

function implicitSpokenAddressPhrase(value = '', numericContextClassifications = []) {
  const text = safeString(value, 4000)
  if (!text) return null
  const pattern = /(?:^|[\s,;:.])(\d{1,5}(?:[A-Za-z]\d{0,3})?(?:[\/-]\d{1,5}(?:[A-Za-z]\d{0,3})?)?(?:-\d{1,5}(?:[A-Za-z]\d{0,3})?)?)\s+([\p{L}][\p{L}'’.-]{1,}(?:\s+(?:[\p{L}][\p{L}'’.-]{1,}|\d{1,3})){1,4})(?=\s*(?:nha|nhe|nhé|nè|nhi|cac ban|các bạn|$|[,!?]))/giu
  const candidates = []
  for (const match of text.matchAll(pattern)) {
    const houseNumber = safeString(match[1], 40)
    const streetPhrase = safeString(match[2], 140)
      .replace(/\s+(?:nha|nhe|nhé|nè|nhi)$/iu, '')
      .replace(/\s+/gu, ' ')
      .trim()
    const foldedStreetTokens = foldText(streetPhrase).match(/[a-z0-9]{1,}/gu) || []
    const leadingDigits = Number(houseNumber.match(/^\d+/u)?.[0] || 0)
    const structurallySpecificHouse = /[A-Za-z\/-]/u.test(houseNumber)
    const lexicalTokens = foldedStreetTokens.filter((token) => /[a-z]{2,}/u.test(token))
    const numericTokens = foldedStreetTokens.filter((token) => /^\d{1,3}$/u.test(token))
    const rejected = lexicalTokens.some((token) => IMPLICIT_STREET_REJECT_WORDS.has(token))
    const unitLikeHouse = /(?:ml|kg|gr|g|mc|mcf|muong|thia)$/iu.test(houseNumber)
    const matchStart = Number(match.index || 0) + String(match[0] || '').indexOf(houseNumber)
    const localPrefix = text.slice(Math.max(0, matchStart - 80), matchStart)
    const hasLocalCue = IMPLICIT_ADDRESS_CUE_PATTERN.test(foldText(localPrefix))
    const numericContext = numericContextClassifications.find((item) =>
      Number(item?.start) === matchStart && String(item?.rawNumberToken || '') === houseNumber
    )?.contextClass || null
    const rejectedNumericContext = [
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.LIST_OR_COUNT,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PRICE_NUMBER,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.TIME_NUMBER,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.PHONE_NUMBER,
    ].includes(numericContext)
    if (
      !hasLocalCue || rejectedNumericContext ||
      (!structurallySpecificHouse && leadingDigits < 10) ||
      lexicalTokens.length < 2 || rejected || unitLikeHouse || numericTokens.length > 1
    ) continue
    if (numericTokens.length === 1 && !streetPhrase.trim().endsWith(numericTokens[0])) continue
    const addressText = safeString(`${houseNumber} ${streetPhrase}`, 180)
    const numericScore = numericContext === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE ? 4 : 0
    const cueScore = /(?:dia chi|địa chỉ|tai so|tại số|o so|ở số|nam tai|nằm tại|nam o|nằm ở)/iu.test(foldText(localPrefix)) ? 3 : 1
    candidates.push({
      addressText,
      houseNumber,
      streetPhrase,
      score: numericScore + cueScore + lexicalTokens.length + Number(structurallySpecificHouse),
      matchStart,
    })
  }
  candidates.sort((left, right) => right.score - left.score || right.matchStart - left.matchStart)
  return candidates[0] || null
}

function structuredSpokenNumberForms(value = '', numberForms = []) {
  const text = String(value || '')
  return uniqueStrings(numberForms.filter((form) => {
    if (!/[,/.-]/u.test(form)) return false
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`(?:hẻm|hem|ngõ|ngo|số|so|địa chỉ|dia chi)\\s*${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text)
  }))
}

function safeString(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function foldText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
}

function uniqueStrings(values = [], maxItems = 30) {
  return [...new Set(values.map((value) => safeString(value, 120)).filter(Boolean))]
    .slice(0, maxItems)
}

function sanitizeSegments(providerResult = {}) {
  const source = Array.isArray(providerResult.segments)
    ? providerResult.segments
    : Array.isArray(providerResult.transcript?.segments)
      ? providerResult.transcript.segments
      : []
  const segments = source.slice(0, MAX_SEGMENTS).map((segment, index) => {
    const text = safeString(segment?.text, MAX_SEGMENT_TEXT)
    if (!text) return null
    return {
      id: Number.isFinite(Number(segment?.id)) ? Number(segment.id) : index,
      start: finiteNumber(segment?.start ?? segment?.startSeconds),
      end: finiteNumber(segment?.end ?? segment?.endSeconds),
      text,
    }
  }).filter(Boolean)

  if (segments.length) return segments
  const transcriptText = safeString(
    providerResult.transcriptText || providerResult.text || providerResult.transcript?.text,
    20000,
  )
  return transcriptText ? [{ id: 0, start: null, end: null, text: transcriptText }] : []
}

function maskNonAddressNumbers(value = '') {
  return String(value || '')
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){8,11}/gu, ' ')
    .replace(/(?:^|[^\p{L}\p{N}])\d{1,5}(?:[.,]\d+)?\s*(?:k|nghin|nghìn|ngan|ngàn|dong|đồng|vnd)(?=$|[^\p{L}\p{N}])/giu, ' ')
    .replace(/(?:^|[^\p{L}\p{N}])\d{1,2}\s*(?:h|gio|giờ)(?:\s*\d{1,2})?(?=$|[^\p{L}\p{N}])/giu, ' ')
    .replace(/(?:^|[^\p{L}\p{N}])\d{1,5}\s+(?:cai|cái|con|ly|mon|món|nam|năm|nguoi|người|phan|phần|quan|quán|tiem|tiệm|to|tô)(?=$|[^\p{L}\p{N}])/giu, ' ')
}

function directlyTranscribedNumberForms(value = '') {
  const masked = maskNonAddressNumbers(value)
  return uniqueStrings(
    [...masked.matchAll(/(?:^|[^\p{L}\p{N}])(\d{1,5}(?:[,/.-]\d{1,5})?[A-Za-z]?)(?=$|[^\p{L}\p{N}])/gu)]
      .map((match) => match[1]),
  )
}

function administrativeNumberForms(value = '') {
  return uniqueStrings(
    [...String(value || '').matchAll(/(?:phường|phuong|quận|quan|huyện|huyen)\s*(\d{1,3})/giu)]
      .map((match) => match[1]),
  )
}

function streetPhrases(value = '') {
  const text = String(value || '')
  const phrases = []
  const pattern = /(?:^|[\s,;:.])(?:đường|duong|hẻm|hem|phố|pho|ngõ|ngo)\s+([^\n,;:.!?]{1,100})/giu
  for (const match of text.matchAll(pattern)) {
    const words = safeString(match[1], 100).split(/\s+/u).slice(0, 5)
    const first = foldText(words[0]).replace(/[^a-z0-9]/gu, '')
    if (!words.length || GENERIC_STREET_FOLLOWERS.has(first)) continue
    phrases.push(safeString(match[0], 140))
  }
  return uniqueStrings(phrases, 8)
}

function hasAdministrativeAnchor(value = '') {
  return Boolean(
    /(?:^|[\s,;:.])(?:phường|phuong|quận|quan|huyện|huyen)\s+(?!(?:trọng|trong|tâm|tam|lý|ly|hệ|he|sát|sat)(?:\s|$))[\p{L}\d]+/iu.test(value) ||
    /(?:^|[\s,;:.])(?:thành phố|thanh pho|tp\.?\s*hcm|tphcm|hồ chí minh|ho chi minh|sài gòn|sai gon)(?=$|[\s,;:.])/iu.test(value)
  )
}

function hasStrongLocationCue(value = '') {
  return /(?:^|[\s,;:.])(?:địa chỉ|dia chi|ở số|o so|tại số|tai so|nằm tại|nam tai|nằm ở|nam o|mở bán tại|mo ban tai)(?=$|[\s,;:.])/iu
    .test(value)
}

function areaPhrase(value = '') {
  const match = String(value || '').match(
    /(?:^|[\s,;:.])(?:ngay ở khu|ngay o khu|ở khu|o khu)\s+([^\n,;:.!?]{2,100})/iu,
  )
  if (!match) return null
  return safeString(`${match[0].split(/\s+/u).slice(0, 8).join(' ')}`, 160)
}

function hasPlaceOrDistrictOnly(value = '') {
  if (hasAdministrativeAnchor(value)) return true
  return /(?:^|[\s,;:.])(?:ở|o|tại|tai|trong)\s+[\p{Lu}Đ][\p{L}\d&.-]*/u.test(value)
}

function analyzeWindow(text = '') {
  const numberForms = directlyTranscribedNumberForms(text)
  const adminNumberForms = administrativeNumberForms(text)
  const numericContextClassifications = classifyShortsTrack2V3NumericContexts({
    text,
    sourceType: ASR_EVIDENCE_TYPES.TRANSCRIPT,
  })
  const houseNumberLikeForms = new Set(
    numericContextClassifications
      .filter((item) =>
        item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE
      )
      .map((item) => item.rawNumberToken),
  )
  const candidateNumberForms = numberForms.filter((form) =>
    !adminNumberForms.includes(form) && houseNumberLikeForms.has(form)
  )
  const nonAdministrativeNumberForms = numberForms.filter((form) =>
    !adminNumberForms.includes(form)
  )
  const implicitAddress = implicitSpokenAddressPhrase(text, numericContextClassifications)
  const streets = uniqueStrings([
    ...streetPhrases(text),
    ...(implicitAddress?.streetPhrase ? [implicitAddress.streetPhrase] : []),
  ], 8)
  const admin = hasAdministrativeAnchor(text)
  const locationCue = hasStrongLocationCue(text)
  const area = areaPhrase(text)
  const effectiveCandidateNumberForms = uniqueStrings([
    ...candidateNumberForms,
    ...structuredSpokenNumberForms(text, nonAdministrativeNumberForms),
    ...(implicitAddress?.houseNumber ? [implicitAddress.houseNumber] : []),
  ])
  const hasNumber = effectiveCandidateNumberForms.length > 0
  let classification = null

  if (implicitAddress || (hasNumber && streets.length && admin)) classification = ASR_EVIDENCE_TYPES.FULL
  else if (
    (hasNumber && streets.length) ||
    (streets.length && admin) ||
    (streets.length && locationCue) ||
    area
  ) classification = ASR_EVIDENCE_TYPES.PARTIAL
  else if (admin || hasPlaceOrDistrictOnly(text)) classification = ASR_EVIDENCE_TYPES.PLACE_OR_DISTRICT

  const ambiguousSeparator = candidateNumberForms.some((form) => form.includes(','))
  const spokenNumberUncertain = Boolean(nonAdministrativeNumberForms.length > 1 || ambiguousSeparator)
  return {
    classification,
    numberForms,
    adminNumberForms,
    candidateNumberForms: effectiveCandidateNumberForms,
    numericContextClassifications,
    streetPhrases: streets,
    hasAdministrativeAnchor: admin,
    hasStrongLocationCue: locationCue,
    areaPhrase: area,
    spokenNumberUncertain,
    numberConflict: false,
    numberAlternatives: [...effectiveCandidateNumberForms],
    addressText: implicitAddress?.addressText || null,
    implicitStreetPhrase: implicitAddress?.streetPhrase || null,
  }
}

function neighboringWindows(segments = []) {
  const windows = []
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    for (let size = 1; size <= MAX_WINDOW_SEGMENTS; size += 1) {
      const selected = segments.slice(startIndex, startIndex + size)
      if (selected.length !== size) continue
      const hasLargeGap = selected.some((segment, index) => {
        if (index === 0) return false
        const previous = selected[index - 1]
        return previous.end != null && segment.start != null && segment.start - previous.end > 5
      })
      if (hasLargeGap) continue
      const rawText = selected.map((segment) => segment.text).join(' ').trim()
      const analysis = analyzeWindow(rawText)
      if (!analysis.classification) continue
      const rank = analysis.classification === ASR_EVIDENCE_TYPES.FULL
        ? 300
        : analysis.classification === ASR_EVIDENCE_TYPES.PARTIAL
          ? 200
          : 100
      const structureScore = Number(Boolean(analysis.candidateNumberForms.length)) +
        Number(Boolean(analysis.streetPhrases.length)) +
        Number(analysis.hasAdministrativeAnchor) +
        Number(analysis.hasStrongLocationCue) +
        Number(Boolean(analysis.areaPhrase))
      windows.push({
        rawText,
        start: selected[0].start,
        end: selected[selected.length - 1].end,
        rawSegments: selected.map((segment) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
        })),
        segmentIds: selected.map((segment) => segment.id),
        segmentCount: selected.length,
        rank: rank + structureScore,
        ...analysis,
      })
    }
  }
  return windows.sort((left, right) =>
    right.rank - left.rank || left.segmentCount - right.segmentCount ||
    Number(left.start ?? 0) - Number(right.start ?? 0)
  )
}

function evidenceFromWindow(window, providerResult, index = 0) {
  const evidenceType = window.classification
  return {
    id: `ev:asr:${index}`,
    source: 'track2_v3_asr',
    sourceType: ASR_EVIDENCE_TYPES.TRANSCRIPT,
    evidenceType,
    transcriptSource: safeString(providerResult.provider || 'faster-whisper', 80),
    provider: safeString(providerResult.provider || 'faster-whisper', 80),
    model: safeString(providerResult.model, 120) || null,
    rawText: window.rawText,
    normalizedText: window.rawText,
    rawSegments: window.rawSegments,
    segmentStart: window.start,
    segmentEnd: window.end,
    segmentIds: window.segmentIds,
    directlyTranscribedNumberForms: window.numberForms,
    administrativeNumberForms: window.adminNumberForms,
    candidateNumberForms: window.candidateNumberForms,
    numericContextClassifications: window.numericContextClassifications,
    numberAlternatives: window.numberAlternatives,
    spokenNumberUncertain: window.spokenNumberUncertain,
    numberConflict: window.numberConflict,
    addressText: window.addressText || null,
    implicitStreetPhrase: window.implicitStreetPhrase || null,
    riskFlags: [
      'ASR_TRANSCRIPT_EVIDENCE',
      evidenceType,
      ...(window.spokenNumberUncertain ? ['ASR_SPOKEN_NUMBER_UNCERTAIN'] : []),
      'REVIEW_ONLY',
    ],
    forceReviewOnly: true,
  }
}

function locationTokens(value = '') {
  return new Set(
    (foldText(value).match(/[a-z0-9]{2,}/gu) || [])
      .filter((token) => !LOCATION_TOKEN_STOP_WORDS.has(token) && !/^\d+$/u.test(token)),
  )
}

function numberComponents(form = '') {
  return new Set(String(form || '').match(/\d+/gu) || [])
}

function formsShareComponents(left = '', right = '') {
  const leftParts = numberComponents(left)
  const rightParts = numberComponents(right)
  return leftParts.size > 0 && leftParts.size === rightParts.size &&
    [...leftParts].every((part) => rightParts.has(part))
}

function bestSourceRelationship(evidence, sourceTexts = []) {
  const asrTokens = locationTokens(evidence.rawText)
  const asrForms = evidence.candidateNumberForms || evidence.directlyTranscribedNumberForms || []
  let best = null
  for (const rawText of sourceTexts.map((value) => safeString(value, 2000)).filter(Boolean)) {
    const overlap = [...asrTokens].filter((token) => locationTokens(rawText).has(token))
    const sourceAdministrativeForms = administrativeNumberForms(rawText)
    const sourceForms = directlyTranscribedNumberForms(rawText)
      .filter((form) => !sourceAdministrativeForms.includes(form))
    const equivalentPairs = []
    for (const asrForm of asrForms) {
      for (const sourceForm of sourceForms) {
        if (formsShareComponents(asrForm, sourceForm)) equivalentPairs.push([asrForm, sourceForm])
      }
    }
    const score = overlap.length + (equivalentPairs.length ? 4 : 0)
    if (!best || score > best.score) best = { rawText, overlap, sourceForms, equivalentPairs, score }
  }
  return best
}

export function corroborateShortsTrack2V3AsrEvidence({
  evidence = null,
  visualTexts = [],
  metadataTexts = [],
} = {}) {
  if (!evidence || ![ASR_EVIDENCE_TYPES.FULL, ASR_EVIDENCE_TYPES.PARTIAL].includes(evidence.evidenceType)) {
    return {
      type: CORROBORATION_TYPES.NONE,
      numberAlternatives: evidence?.numberAlternatives || [],
      spokenNumberUncertain: Boolean(evidence?.spokenNumberUncertain),
      numberConflict: Boolean(evidence?.numberConflict),
    }
  }

  const visual = bestSourceRelationship(evidence, visualTexts)
  const metadata = bestSourceRelationship(evidence, metadataTexts)
  const selected = visual?.score >= (metadata?.score ?? -1) ? visual : metadata
  const selectedSource = selected === visual ? 'visual' : 'metadata'
  const hasStrongNumberCorroboration = Boolean(selected?.equivalentPairs.length && selected.overlap.length >= 2)
  const hasStrongTextCorroboration = Boolean(selected?.overlap.length >= 3)
  const differentEquivalentForms = selected?.equivalentPairs.filter(([left, right]) => left !== right) || []
  let type = CORROBORATION_TYPES.NEW
  if (hasStrongNumberCorroboration || hasStrongTextCorroboration) {
    type = selectedSource === 'visual' ? CORROBORATION_TYPES.VISUAL : CORROBORATION_TYPES.METADATA
  } else if (
    selected?.overlap.length >= 2 &&
    (evidence.candidateNumberForms || []).length &&
    selected.sourceForms.length &&
    !selected.equivalentPairs.length
  ) {
    type = CORROBORATION_TYPES.CONFLICT
  }
  const relationshipEstablished = [
    CORROBORATION_TYPES.VISUAL,
    CORROBORATION_TYPES.METADATA,
    CORROBORATION_TYPES.CONFLICT,
  ].includes(type)
  const numberAlternatives = uniqueStrings([
    ...(evidence.numberAlternatives || []),
    ...(relationshipEstablished ? selected?.sourceForms || [] : []),
  ])
  const numberConflict = relationshipEstablished && differentEquivalentForms.length > 0
  const spokenNumberUncertain = Boolean(evidence.spokenNumberUncertain || numberConflict)

  return {
    type,
    matchedSource: selectedSource,
    matchedRawText: selected?.rawText || null,
    overlappingLocationTokens: selected?.overlap || [],
    numberAlternatives,
    spokenNumberUncertain,
    numberConflict: Boolean(numberConflict || type === CORROBORATION_TYPES.CONFLICT),
  }
}

export function extractShortsTrack2V3AsrEvidence(providerResult = {}) {
  const segments = sanitizeSegments(providerResult)
  const transcriptText = safeString(
    providerResult.transcriptText || providerResult.text || providerResult.transcript?.text ||
      segments.map((segment) => segment.text).join(' '),
    20000,
  )
  const windows = neighboringWindows(segments)
  const strongest = windows[0] || null
  const addressEvidence = strongest && [ASR_EVIDENCE_TYPES.FULL, ASR_EVIDENCE_TYPES.PARTIAL]
    .includes(strongest.classification)
    ? [evidenceFromWindow(strongest, providerResult)]
    : []
  const placeOrDistrictEvidence = strongest?.classification === ASR_EVIDENCE_TYPES.PLACE_OR_DISTRICT
    ? [evidenceFromWindow(strongest, providerResult)]
    : []
  const evidenceBucket = strongest?.classification || 'ASR_NO_ADDRESS_SPEECH_OBSERVED'

  return {
    transcriptText,
    segments,
    strongestWindow: strongest,
    addressEvidence,
    placeOrDistrictEvidence,
    evidenceBucket,
    fullAddressEvidenceCount: addressEvidence.filter((item) => item.evidenceType === ASR_EVIDENCE_TYPES.FULL).length,
    partialAddressEvidenceCount: addressEvidence.filter((item) => item.evidenceType === ASR_EVIDENCE_TYPES.PARTIAL).length,
    placeOrDistrictEvidenceCount: placeOrDistrictEvidence.length,
  }
}

export function buildShortsTrack2V3AsrReviewCandidates(evidenceItems = []) {
  return (Array.isArray(evidenceItems) ? evidenceItems : [])
    .filter((evidence) => evidence?.evidenceType === ASR_EVIDENCE_TYPES.FULL)
    .map((evidence, index) => ({
      id: `cand:asr_full_address_review:${index}`,
      type: 'ASR_FULL_ADDRESS_REVIEW',
      displayText: evidence.addressText || evidence.rawText,
      addressFragment: evidence.addressText || evidence.rawText,
      placeName: null,
      evidenceIds: [evidence.id],
      evidenceSource: 'asr_transcript',
      evidenceType: evidence.evidenceType,
      evidenceText: evidence.rawText,
      rawAsrEvidenceText: evidence.rawText,
      rawAsrSegments: (evidence.rawSegments || []).map((segment) => ({ ...segment })),
      segmentStart: evidence.segmentStart,
      segmentEnd: evidence.segmentEnd,
      asrProvider: evidence.provider,
      asrModel: evidence.model,
      directlyTranscribedNumberForms: [...evidence.directlyTranscribedNumberForms],
      numericContextClassifications: (evidence.numericContextClassifications || [])
        .map((item) => ({ ...item })),
      numberAlternatives: [...evidence.numberAlternatives],
      spokenNumberUncertain: Boolean(evidence.spokenNumberUncertain),
      numberConflict: Boolean(evidence.numberConflict),
      houseNumberAlternatives: [...evidence.numberAlternatives],
      houseNumberConflict: Boolean(evidence.numberConflict),
      riskFlags: [...new Set([
        ...(evidence.riskFlags || []),
        'ASR_DERIVED_CANDIDATE',
        'REVIEW_ONLY',
      ])],
      canAutoResolve: false,
      qualityTier: 'TIER_D',
    }))
}

export {
  ASR_EVIDENCE_TYPES,
  CORROBORATION_TYPES,
  directlyTranscribedNumberForms,
}

export default {
  extractShortsTrack2V3AsrEvidence,
  buildShortsTrack2V3AsrReviewCandidates,
  corroborateShortsTrack2V3AsrEvidence,
}
