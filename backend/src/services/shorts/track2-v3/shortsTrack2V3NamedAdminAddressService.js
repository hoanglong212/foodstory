import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

const HOUSE_NUMBER_PATTERN = /(?:^|[\s,.:;])(?:số\s*|so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/giu
const JOINED_HOUSE_STREET_PATTERN = /(?:^|[\s,;])\d{1,5}(?=\p{Lu}\p{Ll})/gu
const TIME_RANGE_PATTERN = /\b(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\s*[-–—]\s*(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\b/u
const WARD_MARKER_PATTERN = /(^|[\s,;])((?:phường|phuong)\s+|p(?:\.|\s)+|f(?:\.|\s)+)/iu
const NOISY_WARD_MARKER_PATTERN = /(^|[\s,;])(E(?:\.|\s)+)/u
const ATTACHED_WARD_NOISE_PATTERN = /(^|[\s,;])(E)(?=\p{Lu})/u
const DISTRICT_MARKER_PATTERN = /(^|[\s,;\[(])((?:quận|quân|quan)(?:\s+|(?=\p{Lu}))|q(?:\.|\s)+|@\s*)/iu

function safeText(value, maxLength = 2000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
}

function normalizeOcrAdminMarkerNoise(value = '') {
  return String(value || '')
    .replace(/[\[({<|:]+\s*(?=[EFPQ]\s*(?:\.\s*|\s+\.\s*)\p{Lu})/gu, ' ')
    .replace(/(^|[\s,;])([EFPQ])\s+\.\s*/gu, '$1$2.')
    // Sparse OCR may split the ward marker across two text lines/tokens.
    .replace(/\bphu\s+ong['’]?(?=\s*\d)/giu, 'phuong ')
    // Exact bounded OCR confusion observed on white outlined Vietnamese overlays.
    // Only repair the marker when it is immediately followed by a ward number.
    .replace(/\bphirong(?=\s*\d)/giu, 'phuong ')
}

function normalizeCompactNumberedStreet(value = '') {
  return String(value || '')
    .replace(
      /(^|[\s,;])s\p{L}\s*(\d{1,5})(?=\p{L})/giu,
      '$1$2 ',
    )
    .replace(
      /(\d{1,5})(?=(?:đ|d))/giu,
      '$1 ',
    )
    .replace(
      /((?:đ|d)(?:ường|uong|uang))\s*(\d{1,4})(?=$|[\s,;.-])/giu,
      '$1 $2',
    )
    .replace(/-(?=q(?:\.|\s))/giu, ' ')
}

function trimSegment(value = '') {
  return String(value || '')
    .replace(/^[\s,;:|./-]+|[\s,;:|./-]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function markerMatch(value, pattern) {
  const match = String(value || '').match(pattern)
  if (!match || match.index == null) return null
  const prefixLength = match[1]?.length || 0
  return {
    marker: match[2].trim(),
    start: match.index + prefixLength,
    end: match.index + match[0].length,
  }
}

function adminName(value = '') {
  const segment = trimSegment(String(value || '').split(/[;,|]/u, 1)[0])
  if (!segment || /\d/u.test(segment)) return null
  const words = segment.match(/[\p{L}][\p{L}'’.-]*/gu) || []
  while (words.length > 2 && words.at(-1)?.length === 1) words.pop()
  if (words.length < 2 || words.length > 4) return null
  const folded = foldVietnameseText(words.join(' '))
  if (/\b(?:top|list|review|com|bun|pho|banh|xoi|che|lau|nuong|mon|quan)\b/iu.test(folded)) {
    return null
  }
  return words.join(' ')
}

function compactAdminName(value = '') {
  const segment = trimSegment(String(value || '').split(/[;,|]/u, 1)[0])
  if (!segment || /\d/u.test(segment)) return null
  const words = segment.match(/[\p{L}][\p{L}'’-]*/gu) || []
  if (words.length !== 1 || words[0].length < 6 || words[0].length > 40) return null
  const folded = foldVietnameseText(words[0])
  if (/^(?:review|restaurant|food|street|district|phuong|quan|com|bun|pho|banh|xoi|che|lau|nuong|mon|ngon)$/iu.test(folded)) {
    return null
  }
  return words[0]
}

function districtAdmin(value = '') {
  const segment = trimSegment(String(value || '').replace(/^[({\[]+/gu, ''))
  const numeric = segment.match(/^(\d{1,2})(?=$|[^\d])/u)
  if (numeric) {
    return {
      name: numeric[1],
      trailingNoiseRemoved: Boolean(trimSegment(segment.slice(numeric[0].length))),
    }
  }

  const name = adminName(segment)
  return name ? { name, trailingNoiseRemoved: false } : null
}

function splitJoinedStreetWords(value = '') {
  return trimSegment(value).replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
}

function streetName(value = '') {
  const segment = splitJoinedStreetWords(value)
  if (!segment || /\b\d+\s*[kK]\b/u.test(segment)) return null
  const folded = foldVietnameseText(segment)
  if (/\b(?:top|list|review|gia|com|bun|pho|banh|xoi|che|lau|nuong|mon|ngon|thu|lan)\b/iu.test(folded)) {
    return null
  }
  if (/^(?:d|duong|duang|street|st)\.?\s+\d{1,4}[a-z]?$/iu.test(folded)) {
    return segment
  }
  const words = segment.match(/[\p{L}]{2,}/gu) || []
  return words.length >= 2 ? segment : null
}

function markerKind(marker = '') {
  const folded = foldVietnameseText(marker).replace(/\s+/gu, '')
  if (marker.startsWith('@')) return 'NOISY_AT'
  if (/^E(?:\.|$)/u.test(marker)) return 'NOISY_ATTACHED_E'
  if (/^quân/iu.test(marker)) return 'NOISY_QUAN'
  if (folded.startsWith('f')) return 'NOISY_F'
  if (folded.startsWith('p')) return 'WARD'
  if (folded.startsWith('q')) return 'DISTRICT'
  return 'UNKNOWN'
}

function houseNumberMatches(value = '') {
  const matches = []
  for (const match of String(value || '').matchAll(HOUSE_NUMBER_PATTERN)) {
    const digitOffset = match[0].search(/\d/u)
    matches.push({
      start: Number(match.index) + digitOffset,
      joinedHouseStreet: false,
    })
  }
  for (const match of String(value || '').matchAll(JOINED_HOUSE_STREET_PATTERN)) {
    const digitOffset = match[0].search(/\d/u)
    matches.push({
      start: Number(match.index) + digitOffset,
      joinedHouseStreet: true,
    })
  }
  return matches.sort((left, right) => left.start - right.start)
}

export function parseShortsTrack2V3NamedAdminAddress(value = '') {
  const rawText = safeText(value)
  const boundedNumericWardOcrMarker = /\b(?:phirong|phu\s+ong['’]?)(?=\s*\d)/iu.test(rawText)
  const text = normalizeCompactNumberedStreet(
    normalizeOcrAdminMarkerNoise(rawText).replace(/\s*\n\s*/gu, ' '),
  )
  if (!text) return null

  for (const houseMatch of houseNumberMatches(text)) {
    const start = houseMatch.start
    const fromHouse = text.slice(start)
    const houseNumber = houseMatch.joinedHouseStreet
      ? fromHouse.match(/^\d{1,5}/u)?.[0] || ''
      : fromHouse.match(/^\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?/iu)?.[0] || ''
    if (!houseNumber || /^\d+k$/iu.test(houseNumber)) continue

    const timeRange = fromHouse.match(TIME_RANGE_PATTERN)
    const addressWindow = trimSegment(timeRange ? fromHouse.slice(0, timeRange.index) : fromHouse)
    const district = markerMatch(addressWindow, DISTRICT_MARKER_PATTERN)
    if (!district || district.start <= houseNumber.length) continue

    const beforeDistrict = addressWindow.slice(0, district.start)
    const normalWard = markerMatch(beforeDistrict, WARD_MARKER_PATTERN)
    const noisyWard = markerMatch(beforeDistrict, NOISY_WARD_MARKER_PATTERN)
    const attachedWard = markerMatch(beforeDistrict, ATTACHED_WARD_NOISE_PATTERN)
    const ward = [normalWard, noisyWard, attachedWard]
      .filter(Boolean)
      .sort((left, right) => right.start - left.start)[0] || null

    const streetEnd = ward?.start ?? district.start
    const street = streetName(addressWindow.slice(houseNumber.length, streetEnd))
    let wardName = ward ? adminName(addressWindow.slice(ward.end, district.start)) : null
    if (ward && !wardName && boundedNumericWardOcrMarker) {
      wardName = trimSegment(addressWindow.slice(ward.end, district.start))
        .match(/^(\d{1,2})(?=$|[^\d])/u)?.[1] || null
    }
    const districtAdminResult = districtAdmin(addressWindow.slice(district.end))
    const districtName = districtAdminResult?.name || null
    if (!street || !districtName) continue

    const wardKind = ward ? markerKind(ward.marker) : 'NONE'
    const districtKind = markerKind(district.marker)
    const explicitNumberedStreet = /^(?:d|duong|duang|street|st)\.?\s+\d{1,4}[a-z]?$/iu.test(
      foldVietnameseText(street),
    )
    if (
      ward && !wardName && wardKind === 'WARD' && /^\d{1,2}$/u.test(districtName) &&
      explicitNumberedStreet
    ) {
      wardName = compactAdminName(addressWindow.slice(ward.end, district.start))
    }
    if (ward && !wardName) continue
    const joinedDistrictMarker = /\p{L}/u.test(addressWindow.slice(district.end, district.end + 1)) &&
      /^(?:quận|quân|quan)/iu.test(district.marker)
    if (!ward && !houseMatch.joinedHouseStreet && !joinedDistrictMarker) continue
    if (wardKind === 'NOISY_F' && districtKind !== 'DISTRICT') continue
    if (wardKind === 'NOISY_ATTACHED_E' && !['DISTRICT', 'NOISY_QUAN', 'NOISY_AT'].includes(districtKind)) continue
    if (districtKind === 'NOISY_AT' && !wardName) continue

    const wardSegment = !ward
      ? null
      : wardKind === 'NOISY_ATTACHED_E'
        ? wardName
        : `Phường ${wardName}`
    const normalizedAddress = [
      `${houseNumber} ${street}`,
      wardSegment,
      `Quận ${districtName}`,
    ].filter(Boolean).join(', ')

    return {
      rawText: text,
      houseNumber,
      street,
      wardName,
      districtName,
      normalizedAddress,
      wardMarkerKind: wardKind,
      districtMarkerKind: districtKind,
      joinedHouseStreet: houseMatch.joinedHouseStreet,
      joinedDistrictMarker,
      noisyAdminMarker: wardKind.startsWith('NOISY_') || districtKind.startsWith('NOISY_'),
      trailingNoiseRemoved: Boolean(timeRange || districtAdminResult.trailingNoiseRemoved),
      extractionRule: 'OCR_HOUSE_STREET_NAMED_ADMIN_REVIEW_ONLY',
    }
  }

  return null
}

export default {
  parseShortsTrack2V3NamedAdminAddress,
}
