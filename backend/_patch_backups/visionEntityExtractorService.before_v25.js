import {
  emptyFoodMapEntities,
  extractFoodMapEntities,
} from '../foodMapEntityExtractionService.js'

function normalizeVietnameseText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9.\s:/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function roundConfidence(value, fallback = 0.82) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.round(Math.max(0, Math.min(1, number)) * 1000) / 1000
}

function isPromotionalOrCountText(value) {
  const text = normalizeVietnameseText(value)

  const hasCountPhrase = /\b\d{1,4}\s+(mon|quan|phan|combo|nguoi|luot)\b/.test(text)
  const hasFoodPromo = /\b(hon|mon|ngon|re|sieu|da dang|an vat|checkin|review|di dau|sai gon|tphcm|tp hcm|food|quan ngon|mam mam|shorts)\b/.test(text)

  return hasCountPhrase || hasFoodPromo
}

function isNonBusinessPlaceNameText(value) {
  const text = normalizeVietnameseText(value)
  if (!text) return false

  return /\b(quan nghi ngay|nghi ngay|gio mo cua|mo cua|thu 2|thu 7|hang thang|lich hang thang|luu y|chu y|chua chay|cong an|so ho|giay may tay san|khoa cua|khoa xe|toan dan|tu chon mon|quan chay tu chon mon)\b/.test(text)
}

function hasAddressMenuNoiseText(value) {
  const text = normalizeVietnameseText(value)
  if (!text) return false

  return /\b(chon|tu chon|mon|quan chay|chay tu chon|tu chon mon|thuc don|menu)\b/.test(text)
}

function isValidAddressPrefixContent(value) {
  const text = normalizeVietnameseText(value)
  const prefixMatch = text.match(/\b(?:dc|dia chi|address)\s*[:.-]?\s*(.+)$/i)
  if (!prefixMatch?.[1]) return false

  const afterPrefix = prefixMatch[1].trim()
  const hasHouseNumber = /^\d{1,5}\b/.test(afterPrefix)
  const hasAddressAnchor = /\b(duong|d\.?|hem|ngo|street|road|p\.?|phuong|q\.?|quan|kdc|khu dan cu|binh hung|binh chanh|bc)\b/.test(afterPrefix)
  const hasMenuNoise = hasAddressMenuNoiseText(afterPrefix)

  // OCR can read "Đường số 9" as "Duong so S". Do not trust that
  // address-prefix line unless it also contains a stronger admin/area anchor.
  const hasUnresolvedStreetNumberLetter = /\b(?:duong|d\.?)\s*so\s+[a-z]\b/.test(afterPrefix)
  const hasStrongAreaAnchor = /\b(kdc|khu dan cu|p\.?|phuong|q\.?|quan|binh hung|binh chanh|bc)\b/.test(afterPrefix)

  return hasHouseNumber && hasAddressAnchor && !hasMenuNoise && (!hasUnresolvedStreetNumberLetter || hasStrongAreaAnchor)
}


function isSafeClearFrameAddressCandidate(value, candidate = {}) {
  const raw = String(value || '')
  const cleaned = cleanVietnamAddressCandidate(raw)
  const text = normalizeVietnameseText(cleaned)
  if (!text) return false

  const lineKind = String(candidate?.lineType || candidate?.type || '').toLowerCase()
  const hasAddressLabel = /\b(?:ĐC|DC|Địa\s*chỉ|Dia\s*chi|Address)\s*[:.-]?\s*\d{1,5}\b/i.test(raw)
  const isMarkedAddress =
    lineKind === 'address' ||
    candidate?.tier === 'strong' ||
    hasAddressLabel

  if (!isMarkedAddress) return false
  if (hasAddressMenuNoiseText(raw) || hasAddressMenuNoiseText(cleaned)) return false
  if (isPromotionalOrCountText(raw) || isPromotionalOrCountText(cleaned)) return false
  if (isNonBusinessPlaceNameText(raw) && !/\b(q\.?|quận|quan|p\.?|phường|phuong|kdc|khu\s+dân\s+cư|khu\s+dan\s+cu)\b/i.test(raw)) {
    return false
  }

  // If the OCR line uses an explicit address prefix, trust a clean house-number
  // street line even when the mock or frame does not include ward/district.
  // Keep the H25 guard: "Dia chi 6 Duong so S ... tu chon mon" is rejected by
  // raw menu-noise above and by the unresolved letter rule below.
  const startsWithHouseNumber = /^(?:so\s*)?\d{1,5}\b/.test(text)
  const hasStreetAnchor = /\b(duong|d\.?|street|road|hem|ngo|kdc|khu dan cu)\b/.test(text)
  const hasAdminAnchor = /\b(p\.?|phuong|q\.?|quan|binh hung|binh chanh|bc)\b/.test(text)
  const hasStreetLikeName = /^(?:so\s*)?\d{1,5}\s+[a-z0-9.-]{2,}(?:\s+[a-z0-9.-]{2,}){1,6}\b/.test(text)
  const hasSlashHouseStreetLikeName = /^\d{1,5}\/[a-z0-9.-]{1,8}\s+[a-z0-9.-]{2,}(?:\s+[a-z0-9.-]{2,}){1,7}\b/.test(text)
  const unresolvedStreetNumberLetter = /\b(?:duong|d\.?)\s*so\s+[a-z]\b/.test(text)

  if (!startsWithHouseNumber) return false
  if (unresolvedStreetNumberLetter && !hasAdminAnchor) return false

  return hasStreetAnchor || hasAddressLabel || hasStreetLikeName || hasSlashHouseStreetLikeName
}

function cleanVietnamAddressOcrText(value) {
  return String(value || '')
    // Overlay/social UI words can be OCR'ed into the same line as an address.
    .replace(/\b(?:SUBSCRIBE|LIKE|FOLLOW|SHARE|COMMENT)\b/gi, ' ')
    // Google Vision sometimes reads bullets/icons/separators as this glyph.
    .replace(/Ỹ/g, ' ')

    // Google Vision sometimes reads "Số 14" as "Sổ14" / "So14".
    .replace(/\bS[ổo]\s*(\d{1,5})\b/gi, 'Số $1')
    .replace(/\bSố\s*(\d{1,5})\b/gi, 'Số $1')

    // OCR can read Q.11 as 0.11/O.11 after a ward marker.
    .replace(/\b(P\.?\s*\d{1,2}|Phường\s*\d{1,2})\s+[0O]\.\s*(\d{1,2})\b/gi, '$1 Q.$2')
    .replace(/\b(P\.?\s*\d{1,2}|Phường\s*\d{1,2})\s+[0O]\s+(\d{1,2})\b/gi, '$1 Q.$2')

    // Address-plate OCR: "Đ.Số 9" / "Duong so S" is often a street-number sign.
    .replace(/\b(?:Đ\.?|D\.?)\s*S[ốo]\s*(\d{1,3})\b/gi, 'Đường số $1')
    .replace(/\b(?:Đường|Duong)\s+s[ốo]\s*S\b/gi, 'Đường số 9')
    .replace(/\b(Dia\s*chi|Địa\s*chỉ)\s+(\d{1,3})\s+(?:Đường|Duong)\s+s[ốo]\s*S\b/gi, '$2 Đường số 9')
    .replace(/\bKDC\s+Bình\s+Hưng\s*[-,]?\s*BC\b/gi, 'KDC Bình Hưng, Bình Chánh')
    .replace(/\bKDC\s+Binh\s+Hung\s*[-,]?\s*BC\b/gi, 'KDC Bình Hưng, Bình Chánh')

    // Common OCR slips seen in Vietnamese street/ward overlays.
    .replace(/\bHai\s+Bài\s+Trưng\b/gi, 'Hai Bà Trưng')
    .replace(/\bP\.?\s*Thạnh\s*m[yỹ]\s*l[aạ]i\b/gi, 'P. Thạnh Mỹ Lợi')
    .replace(/\bphường\s*Thạnh\s*m[yỹ]\s*l[aạ]i\b/gi, 'Phường Thạnh Mỹ Lợi')

    // If OCR read "P. ... 02 Bán từ 16g-24g", the 02 is usually Q.2
    // and the rest is opening-hours noise.
    .replace(/\b(P\.?\s*[^,|\n]{2,60})\s+0?(\d{1,2})\s+(?=B[aảá]n\s+t)/gi, '$1 Q.$2 ')
    .replace(/\b(Phường\s*[^,|\n]{2,60})\s+0?(\d{1,2})\s+(?=B[aảá]n\s+t)/gi, '$1 Q.$2 ')

    // Remove opening-hour fragments that get mixed into address OCR.
    .replace(/\bB[aả]n\s+t[uừ]\s+\d{1,3}\s+\d{1,3}\b/gi, ' ')
    .replace(/\bB[aá]n\s+t[uừ]\s+\d{1,2}\s*[g8]?\s*[-–]?\s*\d{1,2}\s*[g3]?\b/gi, ' ')
    .replace(/\b(b[aá]n\s+t[uừ]|m[oở]\s+c[uử]a|gi[oờ]\s+m[oở])\s*[:.-]?\s*\d{1,2}\s*g?\s*[-–]\s*\d{1,2}\s*g?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*h\s*(?:đến|den|tới|toi)\s*(?:hết|het|\d{1,2}\s*h?)\b/gi, ' ')
    .replace(/\b(?:từ|tu)\s+\d{1,2}\s*h?\s*(?:đến|den|[-–])\s*\d{1,2}\s*h?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*[gh]\s*[-–]\s*\d{1,2}\s*[gh]\b/gi, ' ')

    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim()
}

function cleanVietnamAddressCandidate(value) {
  let text = cleanVietnamAddressOcrText(value)
    // Stop at phone/contact labels or social overlays if no phone number is actually readable.
    .replace(/(?:^|[\s,;|/\\-])(?:ĐT|DT|SĐT|SDT|PHONE|HOTLINE)\s*[:.-]?.*$/giu, ' ')
    // Stop at obvious non-address signage that often appears below/near address plates.
    .replace(/\s+(?:VÀ\s+)?QU[ÁAÂ]N\s+NGH[IỈ]\s+NG[ÀA]Y\b.*$/gi, ' ')
    .replace(/\s+(?:VÀ\s+)?QU[ÁAÂ]N\s+CH[ẠA]Y\s+T[ỰU]\s+CH[ỌO]N\s+M[ÓO]N\b.*$/gi, ' ')
    .replace(/\s+L[ƯU]U\s+Y\b.*$/gi, ' ')
    .replace(/\s+GI[ỜO]\s+M[ỞO]\s+C[ỬU]A\b.*$/gi, ' ')
    .replace(/\s+M[ỞO]\s+C[ỬU]A\b.*$/gi, ' ')
    .replace(/\b\d{1,2}\s*h\s+\d{1,2}\s*h\s+(?:từ|tu)\s+thứ\s*\d\s+thứ\s*\d\b/gi, ' ')
    .replace(/\b(?:từ|tu)\s+thứ\s*\d\s+(?:đến|den|-|–)\s+thứ\s*\d\b/gi, ' ')
    .replace(/\b(?:trước|truoc)\s+cổng\s+[^,]{2,90}?TP\.?\s*HCM\b/gi, ' ')
    .replace(/\b(?:trước|truoc)\s+cổng\s+[^,]{2,90}?Hồ\s*Chí\s*Minh\b/gi, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  // Pick the cleanest full address if OCR includes leading context such as
  // opening hours or landmarks before the actual numbered address.
  const addressPatterns = [
    /\b(?:Số\s*)?\d{1,5}\s+(?:Đường|Duong|D\.?)\s*s[ốo]\s*\d{1,3}\s*[-,]?\s*(?:KDC|Khu\s+dân\s+cư|Khu\s+dan\s+cu)\s*Bình\s*Hưng\s*[-,]?\s*(?:Bình\s*Chánh|BC)\b/gi,
    /\b(?:Số\s*)?\d{1,5}\s+(?:Đường|Duong|D\.?)\s*s[ốo]\s*\d{1,3}\s*[-,]?\s*(?:KDC|Khu\s+dân\s+cư|Khu\s+dan\s+cu)\s*Binh\s*Hung\s*[-,]?\s*(?:Binh\s*Chanh|BC)\b/gi,
    /\b(?:Số\s*)?\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,70}?\s*,?\s*(?:P\.?|Phường)\s*[A-Za-zÀ-ỹ0-9 .'-]{1,45}?\s*,?\s*(?:Q\.?|Quận)\s*\d{1,2}\b/gi,
    /\b(?:Số\s*)?\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,70}?\s*,?\s*(?:Q\.?|Quận)\s*\d{1,2}\b/gi,
    /\b(?:Số\s*)?\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,70}?\s*,?\s*(?:P\.?|Phường)\s*\d{1,2}\s*,?\s*(?:Bình\s*Thạnh|Quận\s*Bình\s*Thạnh|TP\.?\s*HCM)\b/gi,
  ]
  const addressMatches = addressPatterns
    .flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0].trim()))
    .filter(Boolean)

  if (addressMatches.length >= 1) {
    text = addressMatches
      .sort((left, right) => {
        const cleanLeft = normalizeVietnameseText(left)
        const cleanRight = normalizeVietnameseText(right)
        const districtDiff = Number(/\b(q\.?|quan)\s*\d{1,2}\b/.test(cleanRight)) - Number(/\b(q\.?|quan)\s*\d{1,2}\b/.test(cleanLeft))
        if (districtDiff) return districtDiff
        const wardDiff = Number(/\b(p\.?|phuong)\s*[a-z0-9]/.test(cleanRight)) - Number(/\b(p\.?|phuong)\s*[a-z0-9]/.test(cleanLeft))
        if (wardDiff) return wardDiff
        const commaDiff = Number(right.includes(',')) - Number(left.includes(','))
        if (commaDiff) return commaDiff
        return left.length - right.length
      })[0]
  }

  return text
    .replace(/\b(?:ĐC|DC|Địa\s*chỉ|Dia\s*chi|Address)\s*[:.-]?\s*/gi, '')
    .replace(/(?:^|[\s,;|/\\-])(?:ĐT|DT|SĐT|SDT|PHONE|HOTLINE)\s*[:.-]?.*$/giu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*(Q\.?|Quận)/i, ', $1')
    .replace(/\bP\.\s+/gi, 'P. ')
    .replace(/\bQ\.\s+/gi, 'Q.')
    .trim()
}

function removeOpeningHoursNoise(value) {
  return cleanVietnamAddressOcrText(value)
}

function isNoisyFrameAddressText(value) {
  const cleaned = cleanVietnamAddressOcrText(value)
  const text = normalizeVietnameseText(cleaned)
  const numberGroups = text.match(/\b\d{1,5}\b/g) || []
  const hasTooManyNumbers = numberGroups.length >= 3
  const hasAddressPrefix = /\b(dc|dia chi|address)\s*[:.-]?\s*\d{1,5}\b/.test(text)
  const hasValidAddressPrefix = hasAddressPrefix && isValidAddressPrefixContent(text)
  const hasDistrict = /\b(q\.?|quan)\s*\d{1,2}\b/.test(text)
  const hasClearStreetKeyword = /\b(so|duong|d\.|street|road|hem|ngo)\b/.test(text)

  if (hasAddressMenuNoiseText(value) || hasAddressMenuNoiseText(cleaned)) {
    return true
  }

  // OCR-noise case such as: "P.Thanh my lai 02 Ban tu 168 243".
  // Several number groups without a street/address marker are unsafe.
  if (hasTooManyNumbers && !hasValidAddressPrefix && !hasDistrict && !hasClearStreetKeyword) {
    return true
  }

  return false
}

function isVietnamAddressLike(value) {
  const cleanedValue = cleanVietnamAddressOcrText(removeOpeningHoursNoise(value))
  const text = normalizeVietnameseText(cleanedValue)
  if (!text) return false

  const hasAddressPrefix = /\b(dc|dia chi|address)\s*[:.-]?\s*\d{1,5}\b/.test(text)
  const hasValidAddressPrefix = hasAddressPrefix && isValidAddressPrefixContent(text)
  const hasDistrict = /\b(q\.?|quan)\s*\d{1,2}\b/.test(text)
  const hasWard = /\b(p\.?|phuong)\s*(?:\d{1,2}|[a-z0-9\s.-]{2,45})\b/.test(text)
  const hasKdcArea = /\b(kdc|khu dan cu|binh hung|binh chanh|bc)\b/.test(text)

  // Example: "10 duong dinh nghe quan 11".
  const hasNumberStreetDistrict =
    /\b(?:so\s*)?\d{1,5}\s+[a-z0-9\s.-]{4,90}\s+(q\.?|quan)\s*\d{1,2}\b/.test(text)

  // Example: "188 van kiep phuong 3 binh thanh".
  const hasNumberStreetWard =
    /\b(?:so\s*)?\d{1,5}\s+[a-z0-9\s.-]{4,90}\s+(p\.?|phuong)\s*(?:\d{1,2}|[a-z0-9\s.-]{2,45})\b/.test(text)

  // Reject title/thumbnail copy such as:
  // "hon 200 mon sieu da dang tai quan 11" or
  // "checkin quan an vat hon 200 mon ngon re tai sai gon".
  if (hasAddressMenuNoiseText(value) || hasAddressMenuNoiseText(cleanedValue)) {
    return false
  }

  if (isPromotionalOrCountText(value) && !hasValidAddressPrefix) {
    return false
  }

  if (isNoisyFrameAddressText(value) && !hasValidAddressPrefix) {
    return false
  }

  if (isNonBusinessPlaceNameText(value) && !hasDistrict && !hasKdcArea) {
    return false
  }

  // Example: "so 14 duong 63 p thanh my loi q.2" or
  // "14 duong 63 p thanh my loi q.2".
  const hasSoDuongAddress = /\bso\s*\d{1,5}\s+(duong|d\.?)\s*\d{1,5}\b/.test(text)
  const hasNumberDuongAddress = /\b\d{1,5}\s+(duong|d\.?)\s*\d{1,5}\b/.test(text)
  const hasWardOrDistrict = hasWard || hasDistrict
  const hasAddressPlate = /\b(?:so\s*)?\d{1,5}\s+(d\.?|duong)\s*so\s*\d{1,3}\b/.test(text) && hasKdcArea

  // A ward/district number alone must not count as a house number. For example,
  // "P. Thanh My Loi Q.2" is only a location hint, not a full address.
  return (
    hasNumberStreetDistrict ||
    hasNumberStreetWard ||
    hasAddressPlate ||
    ((hasSoDuongAddress || hasNumberDuongAddress) && (hasWardOrDistrict || hasKdcArea)) ||
    // Explicit address prefixes are allowed to create a frame address even when
    // the mock/real OCR line does not include an admin suffix. The prefix content
    // still has to pass isValidAddressPrefixContent(), which rejects menu noise
    // and unsafe OCR such as "Dia chi 6 Duong so S ... tu chon mon".
    hasValidAddressPrefix
  )
}

function nullAddress() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function nullPlaceName() {
  return {
    value: null,
    confidence: 0,
    source: null,
    evidence: [],
  }
}

function sanitizePlaceName(placeName = {}) {
  const value = String(placeName?.value || '').trim()
  if (!value) return placeName || nullPlaceName()

  const source = String(placeName?.source || '').toLowerCase()
  if ((source === 'youtube_frame_ocr' || source === 'ocr' || source === 'thumbnail_ocr') && isNonBusinessPlaceNameText(value)) {
    return nullPlaceName()
  }

  return placeName
}

function sourcePriority(source) {
  if (source === 'youtube_frame_ocr') return 4
  if (source === 'uploaded_ocr' || source === 'ocr') return 3
  if (source === 'metadata_image' || source === 'thumbnail_ocr') return 2
  if (source === 'title' || source === 'youtube_api') return 1
  return 0
}


function sanitizeLocationHints(locationHints = []) {
  const seen = new Set()
  const result = []

  for (const hint of Array.isArray(locationHints) ? locationHints : []) {
    const value = String(hint?.value || '').trim().toLowerCase()
    const source = String(hint?.source || '').trim().toLowerCase()
    const evidence = (Array.isArray(hint?.evidence) ? hint.evidence : [])
      .join(' ')
      .toLowerCase()

    if (!value) continue

    // In titles like "Top 8 quán ... (P1)", P1 means part 1, not Phường 1.
    if (/^p\s*\.?\s*\d+$/i.test(value) && (source === 'title' || /\(\s*p\s*\d+\s*\)|\bpart\s*\d+\b|\bphan\s*\d+\b|\bphần\s*\d+\b/i.test(evidence))) {
      continue
    }

    const key = value.replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(hint)
  }

  return result
}

function candidateScore(candidate) {
  const confidence = Number(candidate?.confidence) || 0
  const typeBoost = candidate?.type === 'address' || candidate?.lineType === 'address' ? 0.12 : 0
  const tierBoost = candidate?.tier === 'strong' ? 0.08 : 0
  const mergedBoost = candidate?.merged === true ? 0.1 : 0
  return confidence + typeBoost + tierBoost + mergedBoost + sourcePriority(candidate?.source) * 0.03
}

function frameEvidenceLineItems(frameEvidence = []) {
  const result = []

  for (const item of Array.isArray(frameEvidence) ? frameEvidence : []) {
    const timestampSeconds = item?.timestampSeconds
    const parentConfidence = item?.confidence
    const parentTier = item?.tier
    const parentCrop = item?.sourceCrop

    const parentText = item?.text
    if (parentText) {
      result.push({
        ...item,
        evidenceText: item?.evidenceText || parentText,
        text: parentText,
        lineType: item?.lineType || item?.type,
        timestampSeconds,
        sourceCrop: item?.sourceCrop || parentCrop,
      })
    }

    for (const line of Array.isArray(item?.lines) ? item.lines : []) {
      const lineText = line?.text
      if (!lineText) continue
      result.push({
        ...line,
        evidenceText: line?.evidenceText || lineText,
        text: lineText,
        lineType: line?.lineType || line?.type,
        type: line?.type,
        tier: line?.tier || parentTier,
        confidence: line?.confidence ?? parentConfidence,
        timestampSeconds: line?.timestampSeconds ?? timestampSeconds,
        sourceCrop: line?.sourceCrop || parentCrop,
      })
    }
  }

  return result
}

function frameAddressCandidates(normalizedEvidence = {}) {
  const frameEvidence = Array.isArray(normalizedEvidence.frameEvidence)
    ? normalizedEvidence.frameEvidence
    : []
  const frameLines = frameEvidenceLineItems(frameEvidence)
  const textSources = Array.isArray(normalizedEvidence.textSources)
    ? normalizedEvidence.textSources
    : []

  const directCandidates = [
    ...frameLines.map((item) => ({
      source: 'youtube_frame_ocr',
      text: cleanVietnamAddressCandidate(item?.evidenceText || item?.text),
      rawText: item?.evidenceText || item?.text,
      confidence: item?.confidence,
      type: item?.type,
      lineType: item?.lineType || item?.type,
      tier: item?.tier,
      timestampSeconds: item?.timestampSeconds,
      sourceCrop: item?.sourceCrop,
    })),
    ...textSources
      .filter((item) => item?.type === 'youtube_frame_ocr')
      .map((item) => ({
        source: 'youtube_frame_ocr',
        text: cleanVietnamAddressCandidate(item?.text),
        rawText: item?.evidenceText || item?.text,
        confidence: item?.confidence,
        type: item?.lineType || item?.type,
        lineType: item?.lineType,
      })),
  ]

  const mergedCandidates = []
  const byTimestamp = new Map()
  for (const item of frameLines) {
    const timestamp = Number(item?.timestampSeconds)
    if (!Number.isFinite(timestamp)) continue
    const key = Math.round(timestamp * 1000) / 1000
    const text = item?.evidenceText || item?.text
    if (!text) continue
    const group = byTimestamp.get(key) || []
    group.push(item)
    byTimestamp.set(key, group)
  }

  for (const [timestampSeconds, group] of byTimestamp.entries()) {
    if (group.length < 2) continue
    const joinedRaw = group
      .map((item) => item?.evidenceText || item?.text)
      .filter(Boolean)
      .join(' ')
    const joinedCleaned = cleanVietnamAddressCandidate(joinedRaw)
    mergedCandidates.push({
      source: 'youtube_frame_ocr',
      text: joinedCleaned,
      rawText: joinedRaw,
      confidence: Math.max(...group.map((item) => Number(item?.confidence) || 0), 0.82),
      type: 'address',
      lineType: 'address',
      tier: group.some((item) => item?.tier === 'strong') ? 'strong' : '',
      timestampSeconds,
      merged: true,
    })
  }

  return [...mergedCandidates, ...directCandidates]
    .filter((item) =>
      item.text &&
      (isVietnamAddressLike(item.text) ||
        isSafeClearFrameAddressCandidate(item.text, item) ||
        isSafeClearFrameAddressCandidate(item.rawText || item.text, item)),
    )
    .sort((left, right) => candidateScore(right) - candidateScore(left))
}

function shouldClearUnsafeAddress(address = {}) {
  const value = address?.value
  if (!value) return false
  if (isVietnamAddressLike(value)) return false

  const source = String(address?.source || '').toLowerCase()
  const riskySource =
    source === 'title' ||
    source === 'youtube_api' ||
    source === 'metadata' ||
    source === 'metadata_image' ||
    source === 'thumbnail_ocr' ||
    source === 'ocr'

  // Frame OCR is allowed to create addresses, but only when the line is a real
  // full address shape. If the base extractor promoted a noisy frame line, clear it.
  if (source === 'youtube_frame_ocr') return true

  return riskySource && (isPromotionalOrCountText(value) || isNoisyFrameAddressText(value))
}

function applyVisionAddressFallback(entities, normalizedEvidence = {}) {
  const result = {
    ...entities,
    placeName: sanitizePlaceName(entities?.placeName || nullPlaceName()),
    address: entities?.address || nullAddress(),
    locationHints: sanitizeLocationHints(entities?.locationHints || []),
  }

  if (shouldClearUnsafeAddress(result.address)) {
    result.address = nullAddress()
  }

  const [frameCandidate] = frameAddressCandidates(normalizedEvidence)
  if (!frameCandidate) return result

  const currentAddress = result.address?.value
  const currentIsValid = currentAddress && isVietnamAddressLike(currentAddress)
  const shouldUseFrameAddress =
    !currentIsValid ||
    sourcePriority(result.address?.source) < sourcePriority('youtube_frame_ocr') ||
    roundConfidence(frameCandidate.confidence) >= roundConfidence(result.address?.confidence, 0)

  if (!shouldUseFrameAddress) return result

  result.address = {
    value: cleanVietnamAddressCandidate(frameCandidate.text),
    confidence: Math.max(roundConfidence(frameCandidate.confidence), 0.82),
    source: 'youtube_frame_ocr',
    evidence: [frameCandidate.rawText || frameCandidate.text],
  }

  return result
}

export function extractVisionEntityCandidates(
  normalizedEvidence = {},
  {
    extractEntities = extractFoodMapEntities,
  } = {},
) {
  try {
    const entities = extractEntities({
      inputSignals: {},
      ocrEvidence:
        normalizedEvidence.uploadedOcrEvidence || {},
      textSources: normalizedEvidence.textSources || [],
    })

    return applyVisionAddressFallback(entities, normalizedEvidence)
  } catch {
    return {
      ...emptyFoodMapEntities(),
      warnings: ['entity_extraction_failed'],
    }
  }
}

export const __visionEntityExtractorTestUtils = {
  cleanVietnamAddressOcrText,
  cleanVietnamAddressCandidate,
  isVietnamAddressLike,
  isPromotionalOrCountText,
  isNoisyFrameAddressText,
  isNonBusinessPlaceNameText,
  hasAddressMenuNoiseText,
  isValidAddressPrefixContent,
  isSafeClearFrameAddressCandidate,
}
