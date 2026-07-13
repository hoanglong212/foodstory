function capText(value, maxLength = 300) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength)
}

function foldVietnamese(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function segmentsFromResult(result = {}) {
  const segments = Array.isArray(result.asrTranscriptSegments)
    ? result.asrTranscriptSegments
    : []
  if (segments.length) {
    return segments
      .map((segment, index) => ({
        id: segment?.id ?? index,
        start: Number.isFinite(Number(segment?.start)) ? Number(segment.start) : null,
        end: Number.isFinite(Number(segment?.end)) ? Number(segment.end) : null,
        text: capText(segment?.text, 800),
        source: 'asr_transcript',
      }))
      .filter((segment) => segment.text)
  }
  const transcript = capText(result.asrTranscriptText, 12000)
  if (transcript) return [{ id: 0, start: null, end: null, text: transcript, source: 'asr_transcript' }]

  const metadata = result.sourceMetadata && typeof result.sourceMetadata === 'object'
    ? result.sourceMetadata
    : {}
  return [
    { id: 'metadata:title', start: null, end: null, text: capText(metadata.title, 1000), source: 'metadata_title' },
    ...(Array.isArray(metadata.chapters) ? metadata.chapters : []).map((chapter, index) => ({
      id: `metadata:chapter:${index + 1}`,
      start: Number.isFinite(Number(chapter?.startSeconds)) ? Number(chapter.startSeconds) : null,
      end: Number.isFinite(Number(chapter?.endSeconds)) ? Number(chapter.endSeconds) : null,
      text: capText(chapter?.title, 500),
      source: 'metadata_chapter',
    })),
  ].filter((segment) => segment.text).slice(0, 41)
}

const PLACE_CUE_PATTERN = /(?:^|[\s,;])(?:quán|quan|tiệm|tiem|cà\s*phê|ca\s*phe|cafe|nhà\s*hàng|nha\s*hang)\s+([\p{L}][\p{L}\d'.-]*(?:\s+[\p{L}][\p{L}\d'.-]*){0,5}?)(?=\s+(?:đầu|dau|hôm|hom|nay|này|thi|thì|mà|ma|ở|o|tại|tai|vốn|von|đông|dong|nha|nè|ne|nghe|luôn|luon|có|co|bán|ban|là|la|thêm|them|nữa|nua)\b|[,.!?]|$)/giu
const LOCALITY_CUE_PATTERN = /(?:^|[\s,;])(?:tới|toi|đến|den|ở|o|tại|tai|khu\s+vực|khu\s+vuc)\s+([\p{L}][\p{L}\d'.-]*(?:\s+[\p{L}][\p{L}\d'.-]*){0,3}?)(?=\s+(?:mà|ma|và|va|thì|thi|là|la|để|de|nha|nè|ne|nghe|luôn|luon|nữa|nua|rồi|roi|không|khong|có|co|ăn|an|quán|quan)\b|[,.!?]|$)/giu

const GENERIC_PLACE_PHRASE = /^(?:trong\s+khu|trong\s+video|o\s+day|ở\s+đây|day|đây|do|đó|nay|này|mon|món|quan|quán)$/iu
const GENERIC_LOCALITY_PHRASE = /^(?:day|đây|do|đó|khu|khu\s+vuc|khu\s+vực|quan|quán|nha|nhà)$/iu
const FOOD_OR_RECIPE_WORDS = /\b(?:duong|hat nem|bot ngot|nuoc mam|nuoc tuong|muoi|tieu|gram|kg|muong|thia|cong thuc|cach lam)\b/iu

function collectCuePhrases(segments, pattern, { rejectGeneric, maxLength = 100 } = {}) {
  const entries = []
  for (const segment of segments) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(segment.text)) !== null) {
      const observed = capText(match[1], maxLength)
        .replace(/\s+(?:mà|ma|và|va|thì|thi|là|la|ở|o|tại|tai|ghé|ghe|đến|den|tới|toi|nha|nè|ne|nghe|luôn|luon|nữa|nua|rồi|roi)(?=\s|[,.!?]|$).*$/iu, '')
        .replace(/\s+(?:rất|rat)\s+(?:đông|dong|vắng|vang)(?=\s|[,.!?]|$).*$/iu, '')
        .trim()
      const normalized = foldVietnamese(observed)
      if (!observed || normalized.split(' ').filter(Boolean).length < 2) continue
      if (rejectGeneric?.test(normalized)) continue
      if (FOOD_OR_RECIPE_WORDS.test(normalized)) continue
      entries.push({
        observed,
        normalized,
        segmentId: segment.id,
        startSeconds: segment.start,
        endSeconds: segment.end,
        evidenceText: segment.text,
      })
    }
  }
  return entries
}

function phraseSupport(entries = []) {
  const groups = new Map()
  for (const entry of entries) {
    const group = groups.get(entry.normalized) || []
    group.push(entry)
    groups.set(entry.normalized, group)
  }
  return [...groups.values()]
    .map((items) => ({
      representative: items[0],
      supportCount: items.length,
      items,
    }))
    .sort((left, right) =>
      right.supportCount - left.supportCount ||
      right.representative.normalized.length - left.representative.normalized.length,
    )
}

function trimLocalitySuffix(place = null, locality = null) {
  if (!place?.representative?.normalized || !locality?.representative?.normalized) return place
  const localityNormalized = locality.representative.normalized
  if (!place.representative.normalized.endsWith(` ${localityNormalized}`)) return place
  const localityWordCount = locality.representative.observed.split(/\s+/u).filter(Boolean).length
  const words = place.representative.observed.split(/\s+/u).filter(Boolean)
  const observed = words.slice(0, Math.max(0, words.length - localityWordCount)).join(' ')
  if (observed.split(/\s+/u).filter(Boolean).length < 2) return place
  return {
    ...place,
    representative: {
      ...place.representative,
      observed,
      normalized: foldVietnamese(observed),
    },
  }
}

function explicitMultiSource(result = {}) {
  return Boolean(
    result.mustNotResolve ||
    result.inputClass === 'MULTI_PLACE_LISTICLE' ||
    /MULTI_PLACE|LISTICLE/iu.test(`${result.intent || ''} ${result.reason || ''}`),
  )
}

export function buildVisionAutoTrack2V3ProductClue(result = {}) {
  if (!result || typeof result !== 'object') return null
  if (result.intent === 'NO_ADDRESS_INTENT' || result.inputClass === 'RELEVANT_NEGATIVE') return null
  if (explicitMultiSource(result)) return null

  const segments = segmentsFromResult(result)
  if (!segments.length) return null

  const places = phraseSupport(collectCuePhrases(segments, PLACE_CUE_PATTERN, {
    rejectGeneric: GENERIC_PLACE_PHRASE,
    maxLength: 100,
  }))
  const localities = phraseSupport(collectCuePhrases(segments, LOCALITY_CUE_PATTERN, {
    rejectGeneric: GENERIC_LOCALITY_PHRASE,
    maxLength: 100,
  }))

  let place = places[0] || null
  const locality = localities[0] || null
  place = trimLocalitySuffix(place, locality)
  const enoughObservedSupport = Boolean(
    (place && locality) ||
    place?.supportCount >= 2 ||
    locality?.supportCount >= 2,
  )
  if (!enoughObservedSupport) return null

  const evidenceItems = [
    ...(place?.items || []),
    ...(locality?.items || []),
  ]
  const evidenceText = [...new Set(evidenceItems.map((item) => item.evidenceText).filter(Boolean))]
    .slice(0, 4)
  const timestamps = evidenceItems
    .map((item) => Number(item.startSeconds))
    .filter(Number.isFinite)
  const confidence = Math.min(
    0.68,
    0.48 +
      (place ? 0.06 : 0) +
      (locality ? 0.06 : 0) +
      Math.min(0.08, Math.max(place?.supportCount || 0, locality?.supportCount || 0) * 0.02),
  )

  return {
    kind: 'PARTIAL_LOCATION_CLUE',
    placeName: place?.representative?.observed || null,
    locality: locality?.representative?.observed || null,
    address: null,
    exactAddressRecovered: false,
    evidenceSource: segments.some((segment) => segment.source?.startsWith('metadata_'))
      ? 'public_metadata'
      : 'asr_transcript',
    evidenceText,
    timestampSeconds: timestamps.length ? Math.min(...timestamps) : null,
    observationCount: evidenceItems.length,
    confidence: Math.round(confidence * 1000) / 1000,
    reviewRequired: true,
  }
}

export default {
  buildVisionAutoTrack2V3ProductClue,
}
