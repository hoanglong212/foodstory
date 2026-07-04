const METADATA_SOURCE_FIELDS = Object.freeze([
  ['youtube_description', ['description', 'descriptionRawFromYoutube']],
  ['youtube_title', ['title']],
  ['search_snippet', ['searchSnippet', 'serpSnippet', 'pageMetadataText']],
])

const LOCATION_LABEL_PATTERN = /^(location\s*\d*|địa\s*chỉ|dia\s*chi|address|cơ\s*sở\s*\d*|co\s*so\s*\d*|chi\s*nhánh\s*\d*|chi\s*nhanh\s*\d*|cn\s*\d+)\s*[:：-]\s*(.*)$/iu
const HOUSE_NUMBER_PATTERN = /(^|[\s(])([0-9]{1,5}[a-z]?(?:\s*\/\s*[0-9]{1,5}[a-z0-9]*)?)(?=\s)/giu
const PHONE_OR_CONTACT_PATTERN = /\b(?:phone|tel|hotline|zalo)\b|(?:\+?84|0)[0-9 .-]{8,13}/iu
const PRICE_PATTERN = /\b(?:giá|gia|vnd|đồng|dong|ngàn|ngan|nghìn|nghin)\b|\b[0-9]{1,4}\s*k\b/iu
const DATE_TIME_PATTERN = /\b(?:[0-9]{1,2}[:h][0-9]{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/iu

function safeString(value, maxLength = 12000) {
  return String(value ?? '')
    .replace(/\u0000/gu, '')
    .normalize('NFC')
    .trim()
    .slice(0, maxLength)
}

function normalizeLines(value) {
  return safeString(value)
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
}

function foldText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
}

function stripLineMarker(value) {
  return safeString(value, 2000)
    .replace(/^[\s\-–—•*📍🔻🔸▪◦]+/u, '')
    .trim()
}

function firstMetadataValue(input = {}, aliases = []) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  for (const key of aliases) {
    const value = safeString(input[key] ?? metadata[key])
    if (value) return value
  }
  return ''
}

function metadataSources(input = {}) {
  const seen = new Set()
  const sources = []
  for (const [source, aliases] of METADATA_SOURCE_FIELDS) {
    const text = firstMetadataValue(input, aliases)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    sources.push({ source, text })
  }
  return sources
}

function hasFoodContext(value) {
  const text = foldText(value)
  return /\b(?:am thuc|banh|banh mi|bot chien|bun|ca phe|cafe|com|com tam|drink|food|food story|hu tieu|mi|mon ngon|nuoc mia|pho|quan an|restaurant|sandwich|street food|tra sua|xe nuoc)\b/u.test(text)
}

function hasAddressAnchor(value) {
  const folded = foldText(value)
  const hasStreetMarker = /(?:^|[\s,])d\.\s*|\b(?:duong|hem|ngo|ngach|street|road|avenue)\b/u.test(folded)
  const hasAdminMarker = /\b(?:phuong|quan|district|thanh pho|ho chi minh|tp\.?\s*hcm|binh thanh|phu nhuan|tan binh|go vap|thu duc)\b|\b[qp]\.?\s*[0-9]{1,2}\b/u.test(folded)
  return hasStreetMarker || hasAdminMarker
}

function hasProperStreetName(value) {
  const firstPart = safeString(value, 500).split(',')[0]
  const words = firstPart.match(/\p{Lu}[\p{L}'’-]*/gu) || []
  return words.length >= 2
}

function cleanAddressFragment(value) {
  return safeString(value, 1000)
    .replace(/^[\s(:-]+/u, '')
    .replace(/[\s)\].;]+$/u, '')
    .trim()
}

function addressFromLine(value) {
  const line = stripLineMarker(value)
  if (!line) return null

  for (const match of line.matchAll(HOUSE_NUMBER_PATTERN)) {
    const prefixLength = match[1]?.length || 0
    const start = Number(match.index || 0) + prefixLength
    if (start > 0 && line.slice(0, start).trimEnd().at(-1) !== '(') continue
    const houseNumber = safeString(match[2], 80).replace(/\s*\/\s*/gu, '/')
    const addressFragment = cleanAddressFragment(line.slice(start))
    if (!addressFragment || !addressFragment.startsWith(match[2])) continue
    if (!hasAddressAnchor(addressFragment) && !hasProperStreetName(addressFragment.slice(match[2].length))) {
      continue
    }
    if (
      !hasAddressAnchor(addressFragment) &&
      (PHONE_OR_CONTACT_PATTERN.test(addressFragment) ||
        PRICE_PATTERN.test(addressFragment) ||
        DATE_TIME_PATTERN.test(addressFragment))
    ) {
      continue
    }
    return {
      addressFragment,
      houseNumber,
      start,
    }
  }
  return null
}

function cleanPlaceName(value) {
  const placeName = safeString(value, 300)
    .replace(/^[\s(:-]+|[\s(:-]+$/gu, '')
    .trim()
  if (!placeName || placeName.length < 2 || placeName.length > 160) return ''
  if (!/\p{L}/u.test(placeName)) return ''
  if (addressFromLine(placeName)) return ''
  if (PHONE_OR_CONTACT_PATTERN.test(placeName) || PRICE_PATTERN.test(placeName)) return ''
  return placeName
}

function locationLabel(value) {
  const match = stripLineMarker(value).match(LOCATION_LABEL_PATTERN)
  if (!match) return null
  return {
    label: safeString(match[1], 80),
    remainder: safeString(match[2], 1000),
  }
}

function addressSignature(value) {
  return foldText(value).replace(/[^a-z0-9]+/gu, '')
}

function evidenceFromSource({ source, text, videoId, foodContext }) {
  const lines = normalizeLines(text)
  const evidence = []
  let pendingPlaceName = ''
  let pendingLabelLine = ''

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const label = locationLabel(line)
    const candidateLine = label ? label.remainder : stripLineMarker(line)
    const labelKind = foldText(label?.label)
    const inlineAddress = addressFromLine(candidateLine)
    const address = label && !/^(?:dia chi|address)$/u.test(labelKind) && inlineAddress?.start !== 0
      ? null
      : inlineAddress

    if (label && !address) {
      pendingPlaceName = cleanPlaceName(label.remainder)
      pendingLabelLine = line
      continue
    }

    if (!address) continue

    const prefix = cleanPlaceName(candidateLine.slice(0, address.start))
    const previousLine = index > 0 ? cleanPlaceName(stripLineMarker(lines[index - 1])) : ''
    const placeName = prefix || pendingPlaceName || previousLine
    const evidenceText = [pendingLabelLine, line].filter(Boolean).join('\n') || line
    evidence.push({
      type: 'METADATA_TEXT',
      source,
      text: evidenceText,
      evidenceText,
      normalizedText: safeString(evidenceText, 2000),
      addressFragment: address.addressFragment,
      placeName: placeName || null,
      videoId: safeString(videoId, 160) || null,
      houseNumberAlternatives: [address.houseNumber],
      houseNumberConflict: false,
      riskFlags: ['REVIEW_ONLY'],
      foodContext,
    })
    pendingPlaceName = ''
    pendingLabelLine = ''
  }

  return evidence
}

export function extractMetadataEvidence(input = {}) {
  const sources = metadataSources(input)
  const videoId = input.videoId || input.metadata?.videoId || null
  const combinedText = [
    ...sources.map((item) => item.text),
    firstMetadataValue(input, ['channelTitle']),
  ].filter(Boolean).join('\n')
  const foodContext = hasFoodContext(combinedText)
  const seen = new Set()
  const evidence = []

  for (const source of sources) {
    for (const item of evidenceFromSource({ ...source, videoId, foodContext })) {
      const key = `${item.source}|${addressSignature(item.addressFragment)}`
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push({
        id: `metadata:${item.source}:${evidence.length}`,
        ...item,
      })
    }
  }
  return evidence
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => safeString(value, 1000)).filter(Boolean))]
}

export function buildMetadataCandidatesFromEvidence(input = {}) {
  const options = Array.isArray(input) ? { evidence: input } : input
  const evidence = Array.isArray(options.evidence)
    ? options.evidence
    : extractMetadataEvidence(options)
  const requireFoodContext = options.requireFoodContext === true
  const candidates = []
  const byAddress = new Map()

  for (const item of evidence) {
    if (item?.type !== 'METADATA_TEXT' || !item.addressFragment) continue
    if (requireFoodContext && item.foodContext !== true) continue
    const signature = addressSignature(item.addressFragment)
    if (!signature) continue
    const candidate = {
      id: `metadata-candidate:${candidates.length}`,
      type: 'METADATA_ADDRESS',
      displayText: [item.placeName, item.addressFragment].filter(Boolean).join(' — '),
      placeName: item.placeName || null,
      addressFragment: item.addressFragment,
      evidenceSource: item.source,
      evidenceSources: [item.source],
      evidenceText: item.evidenceText || item.text,
      evidenceTexts: [item.evidenceText || item.text].filter(Boolean),
      evidenceIds: [item.id].filter(Boolean),
      sourceType: 'metadata_text',
      riskFlags: ['REVIEW_ONLY', 'METADATA_EVIDENCE'],
      canAutoResolve: false,
      houseNumberAlternatives: uniqueStrings(item.houseNumberAlternatives),
      houseNumberConflict: false,
    }
    const existingIndex = byAddress.get(signature)
    if (existingIndex == null) {
      byAddress.set(signature, candidates.length)
      candidates.push(candidate)
      continue
    }
    const existing = candidates[existingIndex]
    existing.evidenceSources = uniqueStrings([...existing.evidenceSources, item.source])
    existing.evidenceTexts = uniqueStrings([...existing.evidenceTexts, item.evidenceText || item.text])
    existing.evidenceIds = uniqueStrings([...existing.evidenceIds, item.id])
  }
  return candidates
}

function candidateSignature(candidate = {}) {
  return addressSignature(candidate.addressFragment || candidate.displayText || '')
}

function candidateEvidenceSource(candidate = {}) {
  if (candidate.evidenceSource) return candidate.evidenceSource
  return String(candidate.type || '').startsWith('OCR_') ? 'visual_ocr' : ''
}

export function mergeMetadataCandidatesWithExisting(metadataCandidates = [], existingCandidates = []) {
  const merged = []
  const bySignature = new Map()

  for (const candidate of [...metadataCandidates, ...existingCandidates]) {
    if (!candidate || typeof candidate !== 'object') continue
    const signature = candidateSignature(candidate) || `candidate:${merged.length}`
    const existingIndex = bySignature.get(signature)
    if (existingIndex == null) {
      bySignature.set(signature, merged.length)
      merged.push({
        ...candidate,
        canAutoResolve: candidate.type === 'METADATA_ADDRESS'
          ? false
          : Boolean(candidate.canAutoResolve),
      })
      continue
    }
    const existing = merged[existingIndex]
    const source = candidateEvidenceSource(candidate)
    merged[existingIndex] = {
      ...existing,
      riskFlags: uniqueStrings([...(existing.riskFlags || []), ...(candidate.riskFlags || [])]),
      evidenceSources: uniqueStrings([
        ...(existing.evidenceSources || [existing.evidenceSource]),
        ...(candidate.evidenceSources || [source]),
      ]),
      evidenceTexts: uniqueStrings([
        ...(existing.evidenceTexts || [existing.evidenceText]),
        ...(candidate.evidenceTexts || [candidate.evidenceText]),
      ]),
      evidenceIds: uniqueStrings([...(existing.evidenceIds || []), ...(candidate.evidenceIds || [])]),
      houseNumberAlternatives: uniqueStrings([
        ...(existing.houseNumberAlternatives || []),
        ...(candidate.houseNumberAlternatives || []),
      ]),
      houseNumberConflict: Boolean(existing.houseNumberConflict || candidate.houseNumberConflict),
      canAutoResolve: false,
    }
  }
  return merged
}

export default {
  extractMetadataEvidence,
  buildMetadataCandidatesFromEvidence,
  mergeMetadataCandidatesWithExisting,
}
