const ENTITY_STATUSES = new Set([
  'address_found',
  'place_name_found',
  'dish_only',
  'unclear',
])
const ADDRESS_CONFIDENCE_THRESHOLD = 0.62
const PLACE_CONFIDENCE_THRESHOLD = 0.5
const MAX_PLACE_NAME_CHARS = 80
const MAX_PLACE_NAME_TOKENS = 9
const MAX_EVIDENCE_ITEMS = 4
const MAX_ARRAY_ITEMS = 8

const DISH_TERMS = [
  'cơm tấm',
  'cơm gà',
  'cơm sườn',
  'bún bò',
  'bún riêu',
  'bún mắm',
  'phở',
  'hủ tiếu',
  'bánh mì chảo',
  'bánh mì',
  'mì quảng',
  'bún đậu',
  'bánh cuốn',
  'gỏi cuốn',
  'xôi',
  'cháo',
  'lẩu',
  'bò kho',
  'bánh xèo',
]

const VENUE_WORDS = [
  'quán',
  'quan',
  'tiệm',
  'tiem',
  'cafe',
  'coffee',
  'cà phê',
  'ca phe',
  'nhà hàng',
  'nha hang',
  'restaurant',
  'bếp',
  'bep',
]

const NAMED_DISTRICT_TERMS = [
  'binh chanh',
  'binh tan',
  'binh thanh',
  'can gio',
  'cu chi',
  'go vap',
  'hoc mon',
  'nha be',
  'phu nhuan',
  'tan binh',
  'tan phu',
  'thu duc',
]

const CITY_TERMS = [
  'ba ria',
  'can tho',
  'da lat',
  'da nang',
  'hai phong',
  'ha noi',
  'ho chi minh',
  'hue',
  'nha trang',
  'sai gon',
  'saigon',
  'tp hcm',
  'tphcm',
  'vung tau',
]

const SOURCE_MAP = {
  hint: 'hint',
  ocr: 'ocr',
  url_title: 'title',
  title: 'title',
  url_description: 'description',
  description: 'description',
  url_visible_text: 'description',
  visible_text: 'description',
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function clampScore(value) {
  return roundScore(Math.max(0, Math.min(1, Number(value) || 0)))
}

function capString(value, maximumLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maximumLength) return text
  return `${text.slice(0, maximumLength).trim()}...`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanEvidenceText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sourceName(value) {
  return SOURCE_MAP[value] || value || 'mixed'
}

function sourceConfidence(source, fallback = 0.35) {
  if (source === 'ocr') return 0.55
  if (source === 'hint') return 0.55
  if (source === 'title') return 0.45
  if (source === 'description') return 0.35
  return fallback
}

function splitEvidenceLines(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function addEvidence(items, item) {
  const text = cleanEvidenceText(item?.text)
  if (!text) return
  const source = sourceName(item.source)
  const kind = item.kind || 'text'
  const normalized = normalizeText(`${source} ${kind} ${item.lineType || ''} ${text}`)
  if (items.some((existing) => existing.key === normalized)) return

  items.push({
    key: normalized,
    text,
    source,
    kind,
    lineType: item.lineType || null,
    confidence: clampScore(
      Number.isFinite(Number(item.confidence))
        ? item.confidence
        : sourceConfidence(source),
    ),
  })
}

function collectEvidence({ inputSignals = {}, ocrEvidence = {}, textSources = [] }) {
  const items = []
  const hasTieredOcr =
    Object.hasOwn(ocrEvidence || {}, 'strongLines') ||
    Object.hasOwn(ocrEvidence || {}, 'weakLines')

  if (hasTieredOcr) {
    for (const line of Array.isArray(ocrEvidence?.strongLines)
      ? ocrEvidence.strongLines
      : []) {
      addEvidence(items, {
        text: line?.text,
        source: 'ocr',
        kind: 'ocr_strong_line',
        lineType: line?.type || null,
        confidence: line?.confidence,
      })
    }
    for (const line of Array.isArray(ocrEvidence?.weakLines)
      ? ocrEvidence.weakLines
      : []) {
      addEvidence(items, {
        text: line?.text,
        source: 'ocr',
        kind: 'ocr_weak_line',
        lineType: line?.type || null,
        confidence: Math.min(
          0.36,
          Number(line?.confidence || 0) * 0.55,
        ),
      })
    }
  } else {
    for (const line of Array.isArray(ocrEvidence?.lines) ? ocrEvidence.lines : []) {
      addEvidence(items, {
        text: line?.text,
        source: 'ocr',
        kind: 'ocr_line',
        lineType: line?.type || null,
        confidence: line?.confidence,
      })
    }

    if (ocrEvidence?.text) {
      for (const line of splitEvidenceLines(ocrEvidence.text)) {
        addEvidence(items, {
          text: line,
          source: 'ocr',
          kind: 'ocr_text_line',
          confidence: ocrEvidence.confidence,
        })
      }
    }
  }

  addEvidence(items, {
    text: inputSignals.title,
    source: 'title',
    kind: 'title',
    confidence: 0.45,
  })
  addEvidence(items, {
    text: inputSignals.description,
    source: 'description',
    kind: 'description',
    confidence: 0.35,
  })
  addEvidence(items, {
    text: inputSignals.hint,
    source: 'hint',
    kind: 'hint',
    confidence: 0.55,
  })

  for (const source of Array.isArray(textSources) ? textSources : []) {
    const mappedSource = sourceName(source?.type)
    if (hasTieredOcr && mappedSource === 'ocr') continue
    const kind = source?.type === 'ocr' ? 'ocr_text_source' : 'text_source'
    const lines = kind === 'ocr_text_source'
      ? splitEvidenceLines(source?.text)
      : [source?.text]
    for (const line of lines) {
      addEvidence(items, {
        text: line,
        source: mappedSource,
        kind,
        confidence: source?.confidence,
      })
    }
  }

  return items
}

function emptyEntity() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function compactEvidence(values) {
  return [...new Set(values.map((value) => capString(value, 180)).filter(Boolean))]
    .slice(0, MAX_EVIDENCE_ITEMS)
}

function addressText(value) {
  return cleanEvidenceText(value)
    .replace(
      /(?:delivery|giao hang|ship|phone|tel|dt|đt)\s*[:.-]?\s*(?:\+?84|0)(?:[\s.()/-]*\d){8,10}/giu,
      '',
    )
    .replace(/^(?:dc|đc|dia chi|địa chỉ|address)\s*[:.-]\s*/iu, '')
    .trim()
}

function hasPhoneShape(value) {
  return /(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/u.test(value)
}

function addressScore(item) {
  if (item.kind === 'ocr_weak_line') return null
  const value = addressText(item.text)
  const normalized = normalizeText(value)
  if (!value || hasPhoneShape(value)) return null

  const hasHouseNumber = /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/i.test(value)
  if (!hasHouseNumber) return null

  const hasStreetShape =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s+[a-zA-ZÀ-ỹ]{2,}(?:\s+[a-zA-ZÀ-ỹ]{2,}){0,5}/u.test(
      value,
    )
  const hasStreetWord =
    /\b(?:duong|street|st|road|rd|avenue|ave|boulevard|blvd|highway|hwy|hem|ngo)\b/.test(
      normalized,
    )
  const hasWard = /\b(?:p|phuong|ward)\s*\.?\s*\d{1,2}\b/.test(normalized)
  const hasDistrict =
    /\b(?:q|quan|district)\s*\.?\s*\d{1,2}\b/.test(normalized) ||
    NAMED_DISTRICT_TERMS.some((district) =>
      new RegExp(`\\b${district}\\b`).test(normalized),
    )
  const hasCity = CITY_TERMS.some((city) =>
    new RegExp(`\\b${city}\\b`).test(normalized),
  )
  const hasLocation = hasWard || hasDistrict || hasCity

  if (!hasStreetWord && !hasWard && !hasDistrict && !hasCity) return null
  if (
    item.lineType === 'phone' &&
    !(hasStreetWord && (hasWard || hasDistrict))
  ) {
    return null
  }

  let score = 0.18
  if (item.lineType === 'address') score += 0.25
  if (item.source === 'ocr') score += 0.05
  if (hasHouseNumber) score += 0.22
  if (hasStreetShape) score += 0.18
  if (hasStreetWord) score += 0.1
  if (hasWard) score += 0.1
  if (hasDistrict) score += 0.12
  if (hasCity) score += 0.1
  if (/[,.]/.test(value)) score += 0.03
  if (!hasLocation && item.lineType !== 'address') score -= 0.15

  return {
    value,
    confidence: clampScore(score),
    source: item.source,
    evidence: [item.text],
  }
}

function extractAddress(items) {
  const candidates = items
    .map(addressScore)
    .filter(
      (candidate) =>
        candidate && candidate.confidence >= ADDRESS_CONFIDENCE_THRESHOLD,
    )
    .sort((left, right) => right.confidence - left.confidence)

  const best = candidates[0]
  if (!best) return emptyEntity()
  return {
    value: capString(best.value, 220),
    confidence: roundScore(best.confidence),
    source: best.source,
    evidence: compactEvidence(best.evidence),
  }
}

function normalizePhone(raw) {
  const text = String(raw || '').trim()
  const digits = text.replace(/\D/g, '')
  if (!digits) return ''
  if (/^\s*\+/.test(text) && digits.startsWith('84')) return `+${digits}`
  return digits
}

function isVietnamesePhone(normalized) {
  const digits = String(normalized || '').replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  return /^0[35789]\d{8}$/.test(local) || /^02\d{8,9}$/.test(local)
}

function hasPhoneContext(value) {
  return /\b(?:phone|tel|telephone|hotline|delivery|ship|call|dt|dien thoai|giao hang|lien he)\b/.test(
    normalizeText(value),
  )
}

function extractPhones(items) {
  const phones = new Map()
  const phonePatterns = [
    /(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/gu,
    /(?<!\d)(?:\d[\s.()/-]*){7}\d(?![\s.()/-]*\d)/gu,
  ]

  for (const item of items) {
    for (const phonePattern of phonePatterns) {
      for (const match of item.text.matchAll(phonePattern)) {
        const value = capString(match[0], 40)
        const normalized = normalizePhone(value)
        const contextualLocal =
          normalized.replace(/\D/g, '').length === 8 &&
          hasPhoneContext(item.text)
        if (!isVietnamesePhone(normalized) && !contextualLocal) continue
        const confidence = clampScore(
          (contextualLocal ? 0.64 : 0.72) +
            (item.lineType === 'phone' ? 0.15 : 0) +
            (item.source === 'ocr' ? 0.05 : 0),
        )
        const existing = phones.get(normalized)
        if (!existing || confidence > existing.confidence) {
          phones.set(normalized, {
            value,
            normalized,
            confidence,
            source: item.source,
            evidence: capString(item.text, 180),
          })
        }
      }
    }
  }

  return [...phones.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_ARRAY_ITEMS)
}

const NORMALIZED_DISH_TERMS = DISH_TERMS
  .map((term) => ({
    value: term,
    normalized: normalizeText(term),
  }))
  .sort((left, right) => right.normalized.length - left.normalized.length)

function dishMatches(normalized) {
  return NORMALIZED_DISH_TERMS.filter((term) =>
    new RegExp(`\\b${term.normalized.replace(/\s+/g, '\\s+')}\\b`).test(
      normalized,
    ),
  )
}

function cleanPlaceText(value) {
  return cleanEvidenceText(value)
    .replace(/^(?:place|restaurant|quan|quán|tiem|tiệm)\s*[:.-]\s*/iu, '')
    .split(/\s(?:review|ở|o|tại|tai)\s/iu)[0]
    .split(/\s[-|–—]\s/u)[0]
    .trim()
}

function meaningfulExtraWords(normalized, matches) {
  let reduced = normalized
  for (const match of matches) {
    reduced = reduced.replace(
      new RegExp(`\\b${match.normalized.replace(/\s+/g, '\\s+')}\\b`, 'g'),
      ' ',
    )
  }
  reduced = reduced
    .replace(/\b(?:quan|quán|tiem|tiệm|cafe|coffee|ca|phe|nha|hang|restaurant|com|tam)\b/g, ' ')
    .replace(/\b\d+[a-z]?\b/g, ' ')
    .replace(/\b(?:k|vnd|d|đ)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return reduced.split(' ').filter((word) => word.length >= 2)
}

function tokenCount(value) {
  const normalized = normalizeText(value)
  return normalized ? normalized.split(' ').length : 0
}

function repeatedTokenRatio(normalized) {
  const tokens = normalized.split(' ').filter((token) => token.length >= 2)
  if (tokens.length < 4) return 0
  const unique = new Set(tokens)
  return 1 - unique.size / tokens.length
}

function containsDistinctiveNumber(normalized) {
  return /\b\d{2,5}[a-z]?\b/.test(normalized)
}

function sourceAllowsPlaceName(item, value) {
  if (['title', 'hint', 'text_source'].includes(item.kind)) return true
  if (item.kind === 'description') return value.length <= 80
  if (['ocr_line', 'ocr_strong_line'].includes(item.kind)) {
    return item.lineType === 'sign'
  }
  if (item.kind === 'ocr_weak_line') return false
  if (item.kind === 'ocr_text_line') {
    return value.length <= 60 && tokenCount(value) <= 7
  }
  if (item.kind === 'ocr_text_source') {
    return value.length <= 45 && tokenCount(value) <= 6
  }
  return false
}

function menuBlockReason({ item, value, normalized, matches, prices }) {
  const count = tokenCount(value)
  if (value.length > MAX_PLACE_NAME_CHARS) return 'too_long'
  if (count > MAX_PLACE_NAME_TOKENS) return 'too_many_tokens'
  if (prices.length >= 2) return 'multiple_prices'
  if (matches.length >= 3) return 'multiple_dishes'
  if (matches.length >= 2 && (prices.length || count > 6)) {
    return 'menu_like_dish_list'
  }
  if (repeatedTokenRatio(normalized) >= 0.35) return 'repeated_ocr_noise'
  if (!sourceAllowsPlaceName(item, value)) return 'unbounded_source'
  return null
}

function placeCandidate(item) {
  const value = cleanPlaceText(item.text)
  const normalized = normalizeText(value)
  if (!value || normalized.length < 4 || hasPhoneShape(value)) return null
  if (addressScore(item)?.confidence >= ADDRESS_CONFIDENCE_THRESHOLD) return null

  const matches = dishMatches(normalized)
  const hasVenueWord = VENUE_WORDS.some((word) =>
    new RegExp(`\\b${normalizeText(word).replace(/\s+/g, '\\s+')}\\b`).test(
      normalized,
    ),
  )
  if (!matches.length && !hasVenueWord) return null

  const prices = extractPrices([item])
  const extraWords = meaningfulExtraWords(normalized, matches)
  const hasDistinctiveNumber = containsDistinctiveNumber(normalized)
  if (
    menuBlockReason({
      item,
      value,
      normalized,
      matches,
      prices,
    })
  ) {
    return null
  }
  const simpleDishOnly =
    matches.length > 0 &&
    !hasVenueWord &&
    extraWords.length < 2
  const menuLike =
    matches.length > 1 &&
    prices.length > 0 &&
    extraWords.length < 2
  if (simpleDishOnly || menuLike) return null

  let confidence = item.confidence || sourceConfidence(item.source)
  if (item.lineType === 'sign') confidence += 0.24
  if (hasVenueWord) confidence += 0.16
  if (matches.length) confidence += 0.14
  if (extraWords.length >= 2) confidence += 0.12
  if (hasDistinctiveNumber && item.lineType === 'sign') confidence += 0.06
  if (item.source === 'title' || item.source === 'hint') confidence += 0.04
  if (item.kind === 'ocr_text_line') confidence -= 0.08
  if (item.kind === 'ocr_text_source') confidence -= 0.16

  if (item.source === 'ocr') {
    const cap = item.lineType === 'sign' ? 0.86 : 0.72
    confidence = Math.min(confidence, cap)
  }

  return {
    value,
    confidence: clampScore(confidence),
    source: item.source,
    evidence: [item.text],
  }
}

function extractPlaceName(items) {
  const candidates = items
    .map(placeCandidate)
    .filter(
      (candidate) =>
        candidate && candidate.confidence >= PLACE_CONFIDENCE_THRESHOLD,
    )
    .sort((left, right) => right.confidence - left.confidence)

  const best = candidates[0]
  if (!best) return emptyEntity()
  return {
    value: capString(best.value, 160),
    confidence: roundScore(best.confidence),
    source: best.source,
    evidence: compactEvidence(best.evidence),
  }
}

function extractDishNames(items) {
  const dishes = new Map()

  for (const item of items) {
    const normalized = normalizeText(item.text)
    for (const match of dishMatches(normalized)) {
      let confidence =
        (item.confidence || sourceConfidence(item.source)) +
          (item.lineType === 'sign' ? 0.08 : 0) +
          0.18
      if (item.source === 'ocr') confidence = Math.min(confidence, 0.92)
      confidence = clampScore(confidence)
      const existing = dishes.get(match.normalized)
      if (!existing || confidence > existing.confidence) {
        dishes.set(match.normalized, {
          value: match.value,
          confidence,
          source: item.source,
          evidence: capString(item.text, 180),
        })
      }
    }
  }

  return [...dishes.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_ARRAY_ITEMS)
}

function extractPrices(items) {
  const prices = new Map()
  const patterns = [
    /\b\d{1,3}\s*[kK](?:\s*[-–]\s*\d{1,3}\s*[kK]?)?\b/gu,
    /\b\d{1,3}(?:[.,]\d{3})(?:\s*(?:đ|d|vnd))?\b/giu,
  ]

  for (const item of items) {
    const phoneRanges = [...item.text.matchAll(/(?:\+?84|0)(?:[\s.()/-]*\d){8,10}\b/gu)]
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
      }))
    for (const pattern of patterns) {
      for (const match of item.text.matchAll(pattern)) {
        const start = match.index
        const end = match.index + match[0].length
        if (
          phoneRanges.some(
            (range) => start >= range.start && end <= range.end,
          )
        ) {
          continue
        }
        const value = capString(match[0], 40)
        const key = normalizeText(value)
        const confidence = clampScore(
          (item.confidence || sourceConfidence(item.source)) + 0.18,
        )
        const existing = prices.get(key)
        if (!existing || confidence > existing.confidence) {
          prices.set(key, {
            value,
            confidence,
            source: item.source,
            evidence: capString(item.text, 180),
          })
        }
      }
    }
  }

  return [...prices.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_ARRAY_ITEMS)
}

function addLocation(locations, item, value, type, confidence) {
  const cleaned = capString(value, 80)
  const key = `${type}:${normalizeText(cleaned)}`
  const candidate = {
    value: cleaned,
    type,
    confidence: clampScore(confidence),
    source: item.source,
    evidence: capString(item.text, 180),
  }
  const existing = locations.get(key)
  if (!existing || candidate.confidence > existing.confidence) {
    locations.set(key, candidate)
  }
}

function extractLocationHints(items) {
  const locations = new Map()

  for (const item of items) {
    const normalized = normalizeText(item.text)
    const base = (item.confidence || sourceConfidence(item.source)) * 0.55

    for (const match of normalized.matchAll(/\b(?:p|phuong|ward)\s*\.?\s*\d{1,2}\b/g)) {
      addLocation(locations, item, match[0], 'ward', base + 0.22)
    }
    for (const match of normalized.matchAll(/\b(?:q|quan|district)\s*\.?\s*\d{1,2}\b/g)) {
      addLocation(locations, item, match[0], 'district', base + 0.24)
    }
    for (const district of NAMED_DISTRICT_TERMS) {
      if (new RegExp(`\\b${district}\\b`).test(normalized)) {
        addLocation(locations, item, district, 'district', base + 0.26)
      }
    }
    for (const city of CITY_TERMS) {
      if (new RegExp(`\\b${city}\\b`).test(normalized)) {
        addLocation(locations, item, city, 'city', base + 0.24)
      }
    }
  }

  return [...locations.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_ARRAY_ITEMS)
}

function overallStatus({ address, placeName, dishNames }) {
  if (address.value && address.confidence >= ADDRESS_CONFIDENCE_THRESHOLD) {
    return 'address_found'
  }
  if (placeName.value && placeName.confidence >= PLACE_CONFIDENCE_THRESHOLD) {
    return 'place_name_found'
  }
  if (dishNames.length) return 'dish_only'
  return 'unclear'
}

function overallConfidence({ status, address, placeName, dishNames, phones, locationHints }) {
  if (status === 'address_found') return address.confidence
  if (status === 'place_name_found') return placeName.confidence
  if (status === 'dish_only') {
    return roundScore(Math.max(...dishNames.map((dish) => dish.confidence), 0))
  }
  return roundScore(
    Math.max(
      ...phones.map((phone) => phone.confidence * 0.7),
      ...locationHints.map((location) => location.confidence * 0.45),
      0,
    ),
  )
}

export function extractFoodMapEntities({
  inputSignals = {},
  ocrEvidence = {},
  textSources = [],
} = {}) {
  const items = collectEvidence({ inputSignals, ocrEvidence, textSources })
  const address = extractAddress(items)
  const placeName = extractPlaceName(items)
  const phones = extractPhones(items)
  const dishNames = extractDishNames(items)
  const priceHints = extractPrices(items)
  const locationHints = extractLocationHints(items)
  const status = overallStatus({ address, placeName, dishNames })
  const confidence = overallConfidence({
    status,
    address,
    placeName,
    dishNames,
    phones,
    locationHints,
  })

  if (!ENTITY_STATUSES.has(status)) {
    throw new Error(`Unsupported entity extraction status: ${status}`)
  }

  return {
    address,
    placeName,
    phones,
    dishNames,
    priceHints,
    locationHints,
    confidence,
    status,
    warnings: [],
  }
}

export function emptyFoodMapEntities() {
  return {
    address: emptyEntity(),
    placeName: emptyEntity(),
    phones: [],
    dishNames: [],
    priceHints: [],
    locationHints: [],
    confidence: 0,
    status: 'unclear',
    warnings: [],
  }
}
