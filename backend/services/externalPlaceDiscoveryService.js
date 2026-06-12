import axios from 'axios'
import { normalizeDiscoveryText } from './foodMapExistenceService.js'

const GOOGLE_PLACES_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText'
const GOOGLE_PLACES_TIMEOUT_MS = 8_000
const MAX_SIGNAL_LENGTH = 1_000

const PLACE_PREFIX =
  /^(?:place|restaurant|cafe|coffee|shop|bakery|quán|tiệm|bếp|nhà hàng)\s*[:\-]\s*/iu
const PLACE_KEYWORDS = [
  'com tam',
  'cơm tấm',
  'banh mi',
  'bánh mì',
  'pho',
  'phở',
  'hu tieu',
  'hủ tiếu',
  'bun bo',
  'bún bò',
  'cafe',
  'coffee',
  'restaurant',
  'quan',
  'quán',
  'tiem',
  'tiệm',
  'bep',
  'bếp',
  'nha hang',
  'nhà hàng',
]
const NORMALIZED_PLACE_KEYWORDS = PLACE_KEYWORDS.map(normalizeDiscoveryText)
const GENERIC_LOCATION_LINES = new Set([
  'ho chi minh city',
  'thanh pho ho chi minh',
  'saigon',
  'sai gon',
])
const DISH_MODIFIERS = new Set([
  'bo',
  'dac',
  'ga',
  'gio',
  'hai',
  'nam',
  'nuong',
  'suon',
  'thit',
  'tom',
  'trung',
  'vien',
  'xao',
])

function cleanSignal(value, maximumLength = MAX_SIGNAL_LENGTH) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function cleanOcrSignal(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_SIGNAL_LENGTH)
}

function cleanCandidate(value) {
  return cleanSignal(value, 150)
    .replace(PLACE_PREFIX, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .replace(/\s*[|•·]\s*.*$/u, '')
    .trim()
}

function containsPlaceKeyword(value) {
  const normalized = normalizeDiscoveryText(value)
  return NORMALIZED_PLACE_KEYWORDS.some(
    (keyword) =>
      normalized === keyword ||
      normalized.startsWith(`${keyword} `) ||
      normalized.includes(` ${keyword} `),
  )
}

function isLocationOnly(value) {
  const normalized = normalizeDiscoveryText(value)
  return (
    GENERIC_LOCATION_LINES.has(normalized) ||
    /^(?:district|quan|q)\s*\d{1,2}$/i.test(normalized) ||
    /^(?:duong|street|road)\s+/i.test(normalized)
  )
}

function isDishOnly(value) {
  const normalized = normalizeDiscoveryText(value)
  if (!normalized) return true

  for (const keyword of NORMALIZED_PLACE_KEYWORDS) {
    if (normalized === keyword) return true
    if (!normalized.startsWith(`${keyword} `)) continue

    const remainder = normalized.slice(keyword.length).trim().split(' ')
    if (remainder.length && remainder.every((token) => DISH_MODIFIERS.has(token))) {
      return true
    }
  }

  return false
}

function looksCapitalized(value) {
  const words = String(value || '')
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
  if (words.length < 2) return false

  const capitalized = words.filter(
    (word) =>
      /^\p{Lu}[\p{L}\d'’-]*$/u.test(word) ||
      (/^\p{Lu}+$/u.test(word) && word.length > 1),
  ).length

  return capitalized >= Math.max(2, Math.ceil(words.length * 0.65))
}

function candidateFromText(value, source) {
  const name = cleanCandidate(value)
  const normalized = normalizeDiscoveryText(name)
  const tokens = normalized.split(' ').filter(Boolean)

  if (
    !name ||
    tokens.length < 2 ||
    isLocationOnly(name) ||
    /^https?:\/\//i.test(name) ||
    /^[@#]/.test(name) ||
    /^\+?[\d\s().-]+$/.test(name)
  ) {
    return null
  }

  const explicitPrefix = PLACE_PREFIX.test(String(value || ''))
  const placeKeyword = containsPlaceKeyword(name)
  const capitalized = looksCapitalized(name)
  if (!explicitPrefix && !placeKeyword && !capitalized) return null
  if (!explicitPrefix && isDishOnly(name)) return null

  return {
    name,
    source,
    confidence: explicitPrefix ? 0.92 : placeKeyword && capitalized ? 0.84 : 0.72,
  }
}

function quotedCandidates(value, source) {
  const candidates = []
  const pattern = /["“”'‘’]([^"“”'‘’]{3,150})["“”'‘’]/gu
  let match

  while ((match = pattern.exec(String(value || '')))) {
    const candidate = candidateFromText(match[1], source)
    if (candidate) candidates.push({ ...candidate, confidence: 0.9 })
  }

  return candidates
}

function textLines(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function extractPlaceCandidate({ ocrText = '', hint = '' } = {}) {
  const cleanedHint = cleanSignal(hint, 200)
  if (cleanedHint) {
    const quotedHint = quotedCandidates(cleanedHint, 'hint')[0]
    if (quotedHint) return quotedHint

    const hintCandidate = candidateFromText(cleanedHint, 'hint')
    if (hintCandidate) return hintCandidate
  }

  const ocrQuoted = quotedCandidates(ocrText, 'ocr')[0]
  if (ocrQuoted) return ocrQuoted

  const ocrCandidates = textLines(ocrText)
    .map((line) => candidateFromText(line, 'ocr'))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.name.length - left.name.length,
    )

  return ocrCandidates[0] || null
}

function inferCategory(value, fallback = '') {
  if (fallback) return cleanSignal(fallback, 80)
  const normalized = normalizeDiscoveryText(value)

  if (normalized.includes('com tam')) return 'Broken Rice'
  if (normalized.includes('banh mi')) return 'Banh Mi'
  if (normalized.includes('bun bo')) return 'Beef Noodle Soup'
  if (normalized.includes('hu tieu')) return 'Hu Tieu'
  if (normalized.includes('pho')) return 'Pho'
  if (normalized.includes('cafe') || normalized.includes('coffee')) return 'Cafe'
  return null
}

function extractDistrict(value) {
  const text = String(value || '')
  const districtMatch = text.match(
    /\b(?:district|quận|quan|q\.?)\s*([1-9]|1[0-2])\b/iu,
  )
  if (districtMatch) return `District ${districtMatch[1]}`

  const namedDistricts = [
    'Binh Chanh',
    'Binh Tan',
    'Binh Thanh',
    'Can Gio',
    'Cu Chi',
    'Go Vap',
    'Hoc Mon',
    'Nha Be',
    'Phu Nhuan',
    'Tan Binh',
    'Tan Phu',
    'Thu Duc',
  ]
  const normalized = normalizeDiscoveryText(text)
  return (
    namedDistricts.find((district) =>
      normalized.includes(normalizeDiscoveryText(district)),
    ) || null
  )
}

function googleCategory(place, fallback) {
  if (fallback) return cleanSignal(fallback, 80)
  const primaryType = normalizeDiscoveryText(place?.primaryType)
  const types = new Set(
    [place?.primaryType, ...(place?.types || [])].map(normalizeDiscoveryText),
  )

  if (primaryType.includes('cafe') || types.has('cafe')) return 'Cafe'
  if (types.has('bakery')) return 'Bakery'
  if (types.has('meal_takeaway')) return 'Takeaway'
  if ([...types].some((type) => type.includes('restaurant'))) return 'Restaurant'
  return cleanSignal(place?.primaryTypeDisplayName?.text, 80) || null
}

function addressComponent(place, types) {
  const component = (place?.addressComponents || []).find((item) =>
    (item.types || []).some((type) => types.includes(type)),
  )
  return cleanSignal(component?.longText, 80) || null
}

function nameTokenSimilarity(left, right) {
  const leftTokens = new Set(
    normalizeDiscoveryText(left).split(' ').filter(Boolean),
  )
  const rightTokens = new Set(
    normalizeDiscoveryText(right).split(' ').filter(Boolean),
  )
  if (!leftTokens.size || !rightTokens.size) return 0

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return (2 * shared) / (leftTokens.size + rightTokens.size)
}

function googlePlaceToExternal(place, candidate, signals) {
  const name = cleanSignal(place?.displayName?.text, 150)
  if (!name) return null

  const district =
    addressComponent(place, [
      'sublocality_level_1',
      'administrative_area_level_2',
    ]) || extractDistrict(place?.formattedAddress)
  const similarity = nameTokenSimilarity(candidate.name, name)

  return {
    name,
    dishName: signals.dishName || null,
    category: googleCategory(place, signals.category),
    address: cleanSignal(place?.formattedAddress, 255) || null,
    district,
    latitude: Number.isFinite(Number(place?.location?.latitude))
      ? Number(place.location.latitude)
      : null,
    longitude: Number.isFinite(Number(place?.location?.longitude))
      ? Number(place.location.longitude)
      : null,
    confidence: Math.round(Math.max(0.68, similarity) * 1000) / 1000,
    source: 'google_places',
    placeId: place.id || null,
  }
}

function buildGoogleTextQuery(candidate, signals) {
  const parts = [
    candidate.name,
    extractDistrict(`${signals.hint}\n${signals.ocrText}`),
  ]
  if (signals.category && !containsPlaceKeyword(candidate.name)) {
    parts.push(signals.category)
  }
  return [...new Set(parts.filter(Boolean))].join(', ')
}

function buildApiSignalCandidate(signals) {
  const foodSignal = signals.dishName || signals.category
  const context =
    signals.hint || textLines(signals.ocrText).slice(0, 3).join(' ')
  if (!foodSignal || !context) return null

  return {
    name: `${foodSignal} ${context}`,
    source: 'discovery_signals',
    confidence: 0.55,
  }
}

async function searchGooglePlaces(candidate, signals, apiKey) {
  const response = await axios.post(
    GOOGLE_PLACES_TEXT_SEARCH_URL,
    {
      textQuery: buildGoogleTextQuery(candidate, signals),
      languageCode: 'vi',
      regionCode: 'VN',
      maxResultCount: 5,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.types',
          'places.primaryType',
          'places.primaryTypeDisplayName',
          'places.addressComponents',
        ].join(','),
      },
      timeout: GOOGLE_PLACES_TIMEOUT_MS,
    },
  )

  const places = Array.isArray(response.data?.places) ? response.data.places : []
  return places
    .map((place) => googlePlaceToExternal(place, candidate, signals))
    .filter(Boolean)
    .sort(
      (left, right) =>
        nameTokenSimilarity(candidate.name, right.name) -
        nameTokenSimilarity(candidate.name, left.name),
    )[0] || null
}

function inferredExternalPlace(candidate, signals, warning = null) {
  if (!candidate) return null
  return {
    name: candidate.name,
    dishName: signals.dishName || null,
    category: inferCategory(candidate.name, signals.category),
    address: null,
    district: extractDistrict(`${signals.hint}\n${signals.ocrText}`),
    latitude: null,
    longitude: null,
    confidence: candidate.confidence,
    source: 'ocr_or_hint',
    ...(warning ? { discoveryWarning: warning } : {}),
  }
}

export async function findExternalPlace({
  ocrText = '',
  hint = '',
  dishName = '',
  category = '',
  sourceUrl = '',
} = {}) {
  const signals = {
    ocrText: cleanOcrSignal(ocrText),
    hint: cleanSignal(hint, 200),
    dishName: cleanSignal(dishName, 150),
    category: cleanSignal(category, 80),
    sourceUrl: cleanSignal(sourceUrl, 2_000),
  }
  const apiKey = cleanSignal(process.env.GOOGLE_PLACES_API_KEY, 500)
  const placeCandidate = extractPlaceCandidate(signals)
  if (!apiKey) return inferredExternalPlace(placeCandidate, signals)

  const searchCandidate = placeCandidate || buildApiSignalCandidate(signals)
  if (!searchCandidate) return null

  try {
    const googlePlace = await searchGooglePlaces(
      searchCandidate,
      signals,
      apiKey,
    )
    return googlePlace || inferredExternalPlace(placeCandidate, signals)
  } catch (error) {
    const warning =
      error.response?.data?.error?.message ||
      error.message ||
      'Google Places search failed.'
    return inferredExternalPlace(placeCandidate, signals, warning)
  }
}

// Retained for compatibility with Phase 1 imports and tests.
export function identifyExternalPlace({ hint = '' } = {}) {
  const candidate = extractPlaceCandidate({ hint })
  return candidate
    ? inferredExternalPlace(candidate, {
        hint,
        ocrText: '',
        dishName: '',
        category: '',
      })
    : null
}
