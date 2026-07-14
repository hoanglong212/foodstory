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

const VENUE_CLASSIFICATION_TERMS = [
  'quán',
  'tiệm',
  'tiem',
  'cafe',
  'coffee',
  'cà phê',
  'ca phe',
  'nhà hàng',
  'nha hang',
  'cửa hàng',
  'cua hang',
  'quầy',
  'quay',
  'restaurant',
  'bếp',
  'bep',
  // "quan" alone is ambiguous after accent loss. "quan an" is retained
  // because the complete phrase is an unambiguous unaccented venue label.
  'quan an',
]

const DESCRIPTIVE_TITLE_NUMBER_WORDS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'tư',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
  'mười',
  'chục',
  'trăm',
  'nghìn',
  'ngàn',
  'triệu',
]

const DESCRIPTIVE_TITLE_UNIT_TERMS = [
  'ngày',
  'tuần',
  'tháng',
  'năm',
  'lần',
  'người',
  'quán',
  'món',
  'điểm',
  'bước',
  'tiếng',
  'giờ',
  'phút',
  'ngàn',
  'triệu',
  'suất',
  'phần',
  'tô',
  'tô bún',
]

const DESCRIPTIVE_TITLE_REVIEW_MARKERS = [
  'ăn thử',
  'thử',
  'review',
  'đánh giá',
  'trải nghiệm',
  'khám phá',
  'ghé',
  'ghé thăm',
  'mình',
  'tôi',
  'tao',
  'tớ',
  'chúng mình',
  'chúng tôi',
  'theo mình',
  'theo tôi',
  'cảm nhận',
  'chia sẻ',
  'vlog',
]

const DESCRIPTIVE_TITLE_METADATA_KEYWORDS = [
  'shorts',
  'official',
  'channel',
  'vlog',
  'tập',
  'phần',
  'ep.',
  'episode',
  'series',
  'playlist',
  'livestream',
  'live',
]

const DESCRIPTIVE_TITLE_PARTICLES = [
  'và',
  'với',
  'hay',
  'hoặc',
  'là',
  'ở',
  'tại',
  'để',
]

const DESCRIPTIVE_TITLE_ORDINAL_TERMS = [
  'top',
  'thứ',
  'hạng',
]

const DESCRIPTIVE_TITLE_GENERIC_FOOD_TERMS = [
  'ngon',
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

const STREET_INDICATOR_TERMS = [
  'duong',
  'street',
  'st',
  'road',
  'rd',
  'avenue',
  'ave',
  'boulevard',
  'blvd',
  'highway',
  'hwy',
  'hem',
  'ngo',
]

const ADDRESS_WORD_EXCLUSIONS = new Set([
  ...STREET_INDICATOR_TERMS,
  'address',
  'dc',
  'dia',
  'chi',
  'p',
  'phuong',
  'ward',
  'q',
  'quan',
  'district',
  'tp',
  'thanh',
  'pho',
  'city',
  'province',
  'tinh',
])

const SOURCE_MAP = {
  hint: 'hint',
  user_hint: 'hint',
  ocr: 'ocr',
  image_ocr: 'ocr',
  thumbnail_ocr: 'ocr',
  frame_ocr: 'youtube_frame_ocr',
  youtube_frame_ocr: 'youtube_frame_ocr',
  url_title: 'title',
  title: 'title',
  og_title: 'title',
  youtube_title: 'title',
  url_description: 'description',
  description: 'description',
  og_description: 'description',
  youtube_description: 'description',
  youtube_channel: 'description',
  youtube_published_at: 'description',
  json_ld: 'description',
  article_text: 'description',
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

function normalizeClassificationText(value) {
  // Classification must retain Vietnamese accents so "quán" and "quận"
  // remain different words. Accent stripping is still used elsewhere for
  // fuzzy comparison after the semantic class has already been established.
  return cleanEvidenceText(value)
    .normalize('NFC')
    .toLocaleLowerCase('vi')
}

function escapePattern(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function classificationPhrasePattern(phrase) {
  const source = String(phrase || '')
    .trim()
    .split(/\s+/)
    .map(escapePattern)
    .join('\\s+')
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:${source})(?=$|[^\\p{L}\\p{N}])`,
    'iu',
  )
}

function hasVenueIndicator(value) {
  const classified = normalizeClassificationText(value)
  return VENUE_CLASSIFICATION_TERMS.some((term) =>
    classificationPhrasePattern(term).test(classified),
  )
}

function matchedAdministrativeValues(value, type) {
  const classified = normalizeClassificationText(value)
  const patterns =
    type === 'ward'
      ? [
          /(?:^|[^\p{L}\p{N}])(?<value>phường\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
          /(?:^|[^\p{L}\p{N}])(?<value>p\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
          /(?:^|[^\p{L}\p{N}])(?<value>ward\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
        ]
      : [
          /(?:^|[^\p{L}\p{N}])(?<value>quận\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
          /(?:^|[^\p{L}\p{N}])(?<value>q\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
          /(?:^|[^\p{L}\p{N}])(?<value>district\s*\.?\s*\d{1,2})(?=$|[^\p{L}\p{N}])/giu,
        ]
  const values = []

  for (const pattern of patterns) {
    for (const match of classified.matchAll(pattern)) {
      const matchedValue = cleanEvidenceText(match.groups?.value)
      if (matchedValue) values.push(matchedValue)
    }
  }

  return [...new Set(values)]
}

function explicitNamedDistrictValues(value) {
  const tokens =
    normalizeClassificationText(value).match(/[\p{L}\p{N}]+/gu) || []
  const values = []

  for (let index = 0; index < tokens.length; index += 1) {
    if (!['quận', 'district'].includes(tokens[index])) continue

    for (const district of NAMED_DISTRICT_TERMS) {
      const districtTokens = district.split(' ')
      const followingTokens = tokens
        .slice(index + 1, index + 1 + districtTokens.length)
        .map(normalizeText)
      if (followingTokens.join(' ') !== district) continue

      values.push(
        [tokens[index], ...tokens.slice(
          index + 1,
          index + 1 + districtTokens.length,
        )].join(' '),
      )
    }
  }

  return [...new Set(values)]
}

function hasAmbiguousQuanNumber(value) {
  // Unaccented "quan" cannot safely identify either quán or quận. Requiring
  // an accented word or explicit Q./district shorthand prevents guessing.
  return /(?:^|[^\p{L}\p{N}])quan\s*\.?\s*\d{1,2}(?=$|[^\p{L}\p{N}])/iu.test(
    normalizeClassificationText(value),
  )
}

function hasNumberImmediatelyAfterVenue(value) {
  const venuePattern = VENUE_CLASSIFICATION_TERMS
    .map((term) =>
      term
        .split(/\s+/)
        .map(escapePattern)
        .join('\\s+'),
    )
    .join('|')
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:${venuePattern})\\s*[:.-]?\\s*\\d{1,5}(?=$|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(normalizeClassificationText(value))
}

function hasClassificationPhrase(value, phrases) {
  const classified = normalizeClassificationText(value)
  return phrases.some((phrase) =>
    classificationPhrasePattern(phrase).test(classified),
  )
}

function hasCadenceCountPhrase(value) {
  const tokens = normalizeText(value).split(' ').filter(Boolean)
  const numberWords = new Set(
    DESCRIPTIVE_TITLE_NUMBER_WORDS.map(normalizeText),
  )
  const unitTokens = DESCRIPTIVE_TITLE_UNIT_TERMS
    .map((term) => normalizeText(term).split(' ').filter(Boolean))
    .sort((left, right) => right.length - left.length)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const isNumber =
      /^\d+(?:st|nd|rd|th)?$/i.test(token) ||
      numberWords.has(token)
    if (!isNumber) continue

    for (let distance = 1; distance <= 2; distance += 1) {
      for (const unit of unitTokens) {
        const candidate = tokens.slice(
          index + distance,
          index + distance + unit.length,
        )
        if (candidate.join(' ') === unit.join(' ')) return true
      }
    }
  }

  return false
}

function removeNormalizedPhrases(value, phrases) {
  let reduced = value
  const normalizedPhrases = phrases
    .map(normalizeText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)

  for (const phrase of normalizedPhrases) {
    reduced = reduced.replace(
      new RegExp(`\\b${escapePattern(phrase).replace(/\s+/g, '\\s+')}\\b`, 'g'),
      ' ',
    )
  }

  return reduced
}

function lacksDistinctiveProperNoun(value) {
  const classified = normalizeClassificationText(value)
  const withoutHashtags = classified.replace(
    /#[\p{L}\p{N}_]+/gu,
    ' ',
  )
  let reduced = normalizeText(withoutHashtags)

  const removableTerms = [
    ...DISH_TERMS,
    ...DESCRIPTIVE_TITLE_NUMBER_WORDS,
    ...DESCRIPTIVE_TITLE_UNIT_TERMS,
    ...DESCRIPTIVE_TITLE_REVIEW_MARKERS,
    ...DESCRIPTIVE_TITLE_METADATA_KEYWORDS,
    ...DESCRIPTIVE_TITLE_PARTICLES,
    ...DESCRIPTIVE_TITLE_ORDINAL_TERMS,
    ...DESCRIPTIVE_TITLE_GENERIC_FOOD_TERMS,
    ...CITY_TERMS,
  ]

  if (hasVenueIndicator(value)) {
    // Venue terms are removed only after the existing accent-aware classifier
    // confirms the phrase, so bare unaccented "quan" is never guessed here.
    removableTerms.push(...VENUE_CLASSIFICATION_TERMS)
  }

  removableTerms.push(
    ...matchedAdministrativeValues(value, 'ward'),
    ...matchedAdministrativeValues(value, 'district'),
    ...explicitNamedDistrictValues(value),
  )

  reduced = removeNormalizedPhrases(reduced, removableTerms)
    .replace(/\b\d+(?:st|nd|rd|th)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return reduced.replace(/\s+/g, '').length < 2
}

function isDescriptiveSocialTitle(text) {
  const value = cleanEvidenceText(text)
  if (!value) {
    return {
      isDescriptive: false,
      reasons: [],
      confidence: 0,
    }
  }

  const reasons = []
  let confidence = 0

  if (hasCadenceCountPhrase(value)) {
    reasons.push('cadence_count_phrase')
    confidence += 0.6
  }
  if (hasClassificationPhrase(value, DESCRIPTIVE_TITLE_REVIEW_MARKERS)) {
    reasons.push('first_person_review_language')
    confidence += 0.5
  }
  if (
    /#[\p{L}\p{N}_]+/u.test(value) ||
    hasClassificationPhrase(value, DESCRIPTIVE_TITLE_METADATA_KEYWORDS)
  ) {
    reasons.push('social_content_metadata')
    confidence += 0.4
  }
  if (lacksDistinctiveProperNoun(value)) {
    reasons.push('no_distinctive_proper_noun')
    confidence += 0.3
  }

  confidence = clampScore(confidence)
  return {
    isDescriptive: confidence >= 0.4,
    reasons,
    confidence,
  }
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
  if (source === 'youtube_frame_ocr') return 0.68
  if (source === 'hint') return 0.95
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
    evidenceText: cleanEvidenceText(item.evidenceText || text),
    source,
    kind,
    lineType: item.lineType || null,
    supportCount: Math.max(
      1,
      Math.min(8, Math.round(Number(item.supportCount) || 1)),
    ),
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
  const hasFirstClassHint = (Array.isArray(textSources) ? textSources : [])
    .some(
      (source) =>
        source?.type === 'user_hint' &&
        normalizeText(source?.text) === normalizeText(inputSignals.hint),
    )
  if (!hasFirstClassHint) {
    addEvidence(items, {
      text: inputSignals.hint,
      source: 'hint',
      kind: 'hint',
      confidence: 0.95,
    })
  }

  for (const source of Array.isArray(textSources) ? textSources : []) {
    const mappedSource = sourceName(source?.type)
    if (
      hasTieredOcr &&
      ['ocr', 'image_ocr'].includes(source?.type)
    ) {
      continue
    }
    const kind =
      source?.type === 'ocr'
        ? 'ocr_text_source'
        : ['frame_ocr', 'youtube_frame_ocr'].includes(source?.type)
          ? 'frame_ocr_line'
          : 'text_source'
    const lines = kind === 'ocr_text_source'
      ? splitEvidenceLines(source?.text)
      : [source?.text]
    for (const line of lines) {
      addEvidence(items, {
        text: line,
        source: mappedSource,
        kind,
        lineType: source?.lineType || null,
        supportCount: source?.supportCount,
        confidence: source?.confidence,
        evidenceText: source?.evidenceText,
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

function trimEntitySegment(value) {
  return cleanEvidenceText(value)
    .replace(/^[\s,;:|/–—-]+/u, '')
    .replace(/[\s,;:|/–—-]+$/u, '')
    .trim()
}

function addressLabelPresent(value) {
  return /^(?:dc|đc|d\/c|dia chi|địa chỉ|address)\s*[:.-]\s*/iu.test(
    cleanEvidenceText(value),
  )
}

function removePhoneEvidence(value) {
  const source = cleanEvidenceText(value)
  const matches = phoneCandidates(source).sort(
    (left, right) => right.index - left.index,
  )
  let cleaned = source
  for (const match of matches) {
    cleaned = `${cleaned.slice(0, match.index)} ${cleaned.slice(match.end)}`
  }
  return cleaned
    .replace(
      /(?:phone|tel|telephone|hotline|delivery|ship|call|dt|đt|sđt|sdt|dien thoai|điện thoại|giao hang|giao hàng|lien he|liên hệ)\s*[:.-]?\s*$/giu,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function addressText(value) {
  return removePhoneEvidence(value)
    .replace(/^(?:dc|đc|d\/c|dia chi|địa chỉ|address)\s*[:.-]\s*/iu, '')
    .trim()
}

function houseNumberMatches(value) {
  const matches = []
  for (const match of String(value || '').matchAll(
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/giu,
  )) {
    const token = normalizeText(match[0])
    const after = String(value || '').slice(match.index + match[0].length)
    if (
      /k$/i.test(token) ||
      /^\s*(?:k|vnd|đ|d)\b/iu.test(after)
    ) {
      continue
    }
    matches.push(match)
  }
  return matches
}

function hasStreetIndicator(value) {
  const source = cleanEvidenceText(value)
  const normalized = normalizeText(source)
  return (
    STREET_INDICATOR_TERMS.some((term) =>
      new RegExp(`\\b${term}\\b`).test(normalized),
    ) ||
    /(?:^|[\s,;])(?:đ|d)\s*\.(?=\s*[\p{L}\d])/iu.test(source)
  )
}

function hasAdminEvidence(value) {
  const normalized = normalizeText(value)
  return (
    matchedAdministrativeValues(value, 'ward').length > 0 ||
    matchedAdministrativeValues(value, 'district').length > 0 ||
    explicitNamedDistrictValues(value).length > 0 ||
    /\b(?:thanh pho|city|province|tinh|tp hcm|tphcm)\b/.test(normalized) ||
    NAMED_DISTRICT_TERMS.some((district) =>
      new RegExp(`\\b${district}\\b`).test(normalized),
    ) ||
    CITY_TERMS.some((city) =>
      new RegExp(`\\b${city}\\b`).test(normalized),
    )
  )
}

function streetNameWordCount(value) {
  const normalized = normalizeText(value).replace(
    /^(?:so\s*)?\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s*/,
    '',
  )
  return normalized
    .split(' ')
    .filter(
      (word) =>
        /^[a-z]{2,}$/.test(word) &&
        !ADDRESS_WORD_EXCLUSIONS.has(word),
    )
    .length
}

function addressFeatures(value) {
  const source = trimEntitySegment(value)
  const numbers = houseNumberMatches(source)
  const hasHouseNumber = numbers.length > 0
  return {
    hasHouseNumber,
    hasStreetIndicator: hasStreetIndicator(source),
    hasAdmin: hasAdminEvidence(source),
    streetNameWords: hasHouseNumber ? streetNameWordCount(source) : 0,
  }
}

function addressCandidate(item) {
  if (item.kind === 'ocr_weak_line') return null
  const original = cleanEvidenceText(item.text)
  const normalizedOriginal = normalizeText(original)
  if (
    item.source === 'youtube_frame_ocr' &&
    frameCaptionOrMenuText(
      item,
      normalizedOriginal,
      dishMatches(normalizedOriginal),
    )
  ) {
    return null
  }
  const cleaned = addressText(original)
  const labelPresent = addressLabelPresent(original)
  const candidates = []

  for (const match of houseNumberMatches(cleaned)) {
    const value = trimEntitySegment(cleaned.slice(match.index))
    const prefix = trimEntitySegment(cleaned.slice(0, match.index))
    const features = addressFeatures(value)
    const plausibleStreet =
      features.hasStreetIndicator ||
      features.hasAdmin ||
      features.streetNameWords >= 2 ||
      (
        features.streetNameWords >= 1 &&
        (item.lineType === 'address' || labelPresent)
      )
    if (!features.hasHouseNumber || !plausibleStreet) continue
    if (item.lineType === 'phone' && !features.hasStreetIndicator && !features.hasAdmin) {
      continue
    }
    if (tokenCount(value) > 16 || value.length > 180) continue

    let score = 0.2
    if (item.lineType === 'address') score += 0.18
    if (item.source === 'ocr') score += 0.04
    if (item.source === 'youtube_frame_ocr') {
      score += 0.08
      score += Math.min(0.12, Math.max(0, item.supportCount - 1) * 0.05)
    }
    if (features.hasHouseNumber) score += 0.18
    if (features.hasStreetIndicator) score += 0.18
    if (features.hasAdmin) score += 0.14
    if (features.streetNameWords >= 2) score += 0.2
    else if (features.streetNameWords === 1) score += 0.08
    if (labelPresent) score += 0.1
    if (/[,.]/.test(value)) score += 0.02

    candidates.push({
      value,
      prefix,
      confidence: clampScore(score),
      source: item.source,
      evidence: [item.evidenceText || item.text],
    })
  }

  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      right.value.length - left.value.length,
  )[0] || null
}

function hasPhoneShape(value) {
  return phoneCandidates(value).length > 0
}

function addressScore(item) {
  return addressCandidate(item)
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
  if (digits.startsWith('84')) return `0${digits.slice(2)}`
  return digits
}

function phoneKind(raw, normalized) {
  const source = String(raw || '')
  const digits = String(normalized || '').replace(/\D/g, '')
  const parenthesizedArea = /^\s*\(\s*0?\d{2,3}\s*\)/u.test(source)
  if (
    parenthesizedArea &&
    digits.length >= 9 &&
    digits.length <= 11
  ) {
    return 'legacy_landline'
  }
  if (/^0[35789]\d{8}$/.test(digits)) return 'mobile'
  if (/^02\d{8,9}$/.test(digits)) return 'landline'
  if (digits.length === 8) return 'local_contact'
  return null
}

function hasPhoneContext(value) {
  return /\b(?:phone|tel|telephone|hotline|delivery|ship|call|dt|sdt|so dien thoai|dien thoai|giao hang|lien he)\b/.test(
    normalizeText(value),
  )
}

function phoneCandidates(
  value,
  { allowAdjacentSeparatedPhones = false } = {},
) {
  const source = String(value || '')
  const matches = []
  const trailingDigits = allowAdjacentSeparatedPhones
    ? '(?![\\s.()]*\\d)'
    : '(?![\\s.()/-]*\\d)'
  const patterns = [
    /(?<!\d)\(\s*0?\d{2,3}\s*\)(?:[\s./-]*\d){7,8}(?![\s./-]*\d)/gu,
    new RegExp(
      `(?<!\\d)(?:\\+?84|0)(?:[\\s.()/-]*\\d){8,10}${trailingDigits}`,
      'gu',
    ),
    new RegExp(
      `(?<!\\d)(?:\\d[\\s.()/-]*){7}\\d${trailingDigits}`,
      'gu',
    ),
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[0]
      const normalized = normalizePhone(raw)
      const kind = phoneKind(raw, normalized)
      if (!kind) continue
      const start = Number(match.index || 0)
      const end = start + raw.length
      if (
        matches.some(
          (existing) =>
            existing.normalized === normalized ||
            (start >= existing.index && end <= existing.end),
        )
      ) {
        continue
      }
      matches.push({
        raw,
        normalized,
        kind,
        index: start,
        end,
      })
    }
  }

  return matches.sort((left, right) => left.index - right.index)
}

function hasPhoneSupportingContext(item, candidate) {
  const normalized = normalizeText(item.text)
  const hasVenue = hasVenueIndicator(item.text)
  const addressContext =
    houseNumberMatches(removePhoneEvidence(item.text)).length > 0 &&
    (hasStreetIndicator(item.text) || hasAdminEvidence(item.text))
  return (
    hasPhoneContext(item.text) ||
    addressContext ||
    hasVenue ||
    dishMatches(normalized).length > 0
  )
}

function extractPhones(items) {
  const phones = new Map()
  const frameAddressContext = items.some((item) => {
    if (item.source !== 'youtube_frame_ocr') return false
    const candidate = addressCandidate(item)
    return Boolean(
      candidate &&
        candidate.confidence >= ADDRESS_CONFIDENCE_THRESHOLD,
    )
  })

  for (const item of items) {
    for (const candidate of phoneCandidates(item.text, {
      allowAdjacentSeparatedPhones:
        item.source === 'youtube_frame_ocr',
    })) {
      const separatedFramePhone =
        item.source === 'youtube_frame_ocr' &&
        frameAddressContext &&
        /[\s./-]/.test(candidate.raw)
      if (
        !hasPhoneSupportingContext(item, candidate) &&
        !separatedFramePhone
      ) {
        continue
      }
      const contextual = hasPhoneContext(item.text)
      const confidence = clampScore(
        (candidate.kind === 'local_contact' ? 0.62 : 0.68) +
          Number(contextual) * 0.12 +
          Number(separatedFramePhone) * 0.08 +
          Number(candidate.kind === 'legacy_landline') * 0.06 +
          Number(item.lineType === 'phone') * 0.04 +
          Number(item.source === 'ocr') * 0.03 +
          Number(item.source === 'youtube_frame_ocr') * 0.08,
      )
      const existing = phones.get(candidate.normalized)
      if (!existing || confidence > existing.confidence) {
        phones.set(candidate.normalized, {
          value: capString(candidate.raw, 40),
          normalized: candidate.normalized,
          confidence,
          source: item.source,
          evidence: capString(item.evidenceText || item.text, 180),
        })
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
    .replace(/[\s,;:|/–—-]+$/u, '')
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

function frameCaptionOrMenuText(item, normalized, matches) {
  if (
    item.source !== 'youtube_frame_ocr' &&
    item.kind !== 'frame_ocr_line'
  ) {
    return false
  }
  const tokens = normalized.split(' ').filter(Boolean)
  const scheduleOrMenu =
    /\b(?:thu hai|thu ba|thu tu|thu nam|thu sau|thu bay|chu nhat|tuan|mon)\b/.test(
      normalized,
    )
  const conversational =
    /\b(?:nay|la|nhau|vua|du|thiet|co|khong|roi|luon|day|kia)\b/.test(
      normalized,
    )
  if (scheduleOrMenu) return true
  if (
    conversational &&
    (
      hasVenueIndicator(item.text) ||
      matches.length > 0 ||
      tokens.length >= 3
    )
  ) {
    return true
  }
  return false
}

function sourceAllowsPlaceName(item, value, mixedAddressPrefix = false) {
  if (mixedAddressPrefix) {
    return value.length <= 60 && tokenCount(value) <= 8
  }
  if (['title', 'hint', 'text_source'].includes(item.kind)) return true
  if (item.kind === 'description') return value.length <= 80
  if (['ocr_line', 'ocr_strong_line'].includes(item.kind)) {
    return item.lineType === 'sign'
  }
  if (item.kind === 'frame_ocr_line') {
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

function menuBlockReason({
  item,
  value,
  normalized,
  matches,
  prices,
  mixedAddressPrefix = false,
}) {
  const count = tokenCount(value)
  if (value.length > MAX_PLACE_NAME_CHARS) return 'too_long'
  if (count > MAX_PLACE_NAME_TOKENS) return 'too_many_tokens'
  if (prices.length >= 2) return 'multiple_prices'
  if (matches.length >= 3) return 'multiple_dishes'
  if (matches.length >= 2 && (prices.length || count > 6)) {
    return 'menu_like_dish_list'
  }
  if (repeatedTokenRatio(normalized) >= 0.35) return 'repeated_ocr_noise'
  if (!sourceAllowsPlaceName(item, value, mixedAddressPrefix)) {
    return 'unbounded_source'
  }
  return null
}

function placeCandidate(item) {
  const mixedAddress = addressCandidate(item)
  if (mixedAddress && !mixedAddress.prefix) return null
  const value = cleanPlaceText(
    mixedAddress?.prefix || item.text,
  )
  const normalized = normalizeText(value)
  if (!value || normalized.length < 4 || hasPhoneShape(value)) return null

  const matches = dishMatches(normalized)
  const hasVenueWord = hasVenueIndicator(item.text)
  if (!matches.length && !hasVenueWord) return null
  if (frameCaptionOrMenuText(item, normalized, matches)) return null

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
      mixedAddressPrefix: Boolean(mixedAddress?.prefix),
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
  if (item.source === 'youtube_frame_ocr') {
    const cap = item.lineType === 'sign' ? 0.94 : 0.78
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
  const candidates = []
  const warnings = new Set()

  for (const item of items) {
    const titleCheck =
      item.source === 'title'
        ? isDescriptiveSocialTitle(item.text)
        : null

    if (titleCheck?.isDescriptive && titleCheck.confidence >= 0.7) {
      // Strong descriptive-title evidence is metadata about content, not a
      // business identity, so it must not enter place-name scoring at all.
      for (const reason of titleCheck.reasons) warnings.add(reason)
      continue
    }

    const candidate = placeCandidate(item)
    if (!candidate) continue

    if (titleCheck?.isDescriptive && titleCheck.confidence >= 0.4) {
      // Borderline titles may contain a real name, but their review language
      // makes the extracted value unsafe to score like direct venue evidence.
      candidate.confidence = Math.min(
        candidate.confidence * 0.4,
        titleCheck.confidence,
      )
      candidate.allowLowConfidence = true
      for (const reason of titleCheck.reasons) {
        warnings.add(`low_confidence_${reason}`)
      }
    }

    if (
      candidate.confidence >= PLACE_CONFIDENCE_THRESHOLD ||
      candidate.allowLowConfidence
    ) {
      candidates.push(candidate)
    }
  }

  candidates.sort((left, right) => right.confidence - left.confidence)

  const best = candidates[0]
  if (!best) {
    return {
      entity: emptyEntity(),
      warnings: [...warnings],
    }
  }
  return {
    entity: {
      value: capString(best.value, 160),
      confidence: roundScore(best.confidence),
      source: best.source,
      evidence: compactEvidence(best.evidence),
    },
    warnings: [...warnings],
  }
}

function extractDishNames(items) {
  const dishes = new Map()

  for (const item of items) {
    if (
      item.kind === 'ocr_weak_line' &&
      item.lineType === 'address'
    ) {
      continue
    }
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
  const warnings = new Set()

  for (const item of items) {
    const normalized = normalizeText(item.text)
    const base = (item.confidence || sourceConfidence(item.source)) * 0.55
    const hasVenue = hasVenueIndicator(item.text)
    const hasAddressContext = Boolean(addressCandidate(item))
    const explicitNamedDistricts = explicitNamedDistrictValues(item.text)

    for (const value of matchedAdministrativeValues(item.text, 'ward')) {
      addLocation(locations, item, value, 'ward', base + 0.22)
    }
    for (const value of matchedAdministrativeValues(item.text, 'district')) {
      addLocation(locations, item, value, 'district', base + 0.24)
    }
    for (const value of explicitNamedDistricts) {
      addLocation(locations, item, value, 'district', base + 0.26)
    }

    if (hasNumberImmediatelyAfterVenue(item.text)) {
      // A number attached to a venue label is usually branding, a branch, or
      // descriptive wording. It must not be reinterpreted as a district.
      warnings.add('venue_number_not_district')
    }
    if (hasAmbiguousQuanNumber(item.text)) {
      // The original evidence has no accents, so choosing between quán and
      // quận would be an unsupported location claim.
      warnings.add('ambiguous_quan_token')
    }

    for (const district of NAMED_DISTRICT_TERMS) {
      const explicitlyMatched = explicitNamedDistricts
        .some((value) => normalizeText(value).endsWith(district))
      if (
        !explicitlyMatched &&
        hasAddressContext &&
        !hasVenue &&
        new RegExp(`\\b${district}\\b`).test(normalized)
      ) {
        addLocation(locations, item, district, 'district', base + 0.26)
      }
    }
    for (const city of CITY_TERMS) {
      if (new RegExp(`\\b${city}\\b`).test(normalized)) {
        addLocation(locations, item, city, 'city', base + 0.24)
      }
    }
  }

  return {
    values: [...locations.values()]
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, MAX_ARRAY_ITEMS),
    warnings: [...warnings],
  }
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
  const placeExtraction = extractPlaceName(items)
  const placeName = placeExtraction.entity
  const phones = extractPhones(items)
  const dishNames = extractDishNames(items)
  const priceHints = extractPrices(items)
  const locationExtraction = extractLocationHints(items)
  const locationHints = locationExtraction.values
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
    warnings: [
      ...new Set([
        ...placeExtraction.warnings,
        ...locationExtraction.warnings,
      ]),
    ],
  }
}

export { isDescriptiveSocialTitle }

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
