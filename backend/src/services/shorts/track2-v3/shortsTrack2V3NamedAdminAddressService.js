import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

const HOUSE_NUMBER_PATTERN = /(?:^|[\s,.:;])(?:số\s*|so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/giu
const TIME_RANGE_PATTERN = /\b(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\s*[-–—]\s*(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\b/u
const WARD_MARKER_PATTERN = /(^|[\s,;])((?:phường|phuong)\s+|p(?:\.|\s)+|f(?:\.|\s)+)/iu
const ATTACHED_WARD_NOISE_PATTERN = /(^|[\s,;])(E)(?=\p{Lu})/u
const DISTRICT_MARKER_PATTERN = /(^|[\s,;])((?:quận|quan)\s+|q(?:\.|\s)+|@\s*)/iu

function safeText(value, maxLength = 2000) {
  return normalizeShortsTrack2V3Text(value).slice(0, maxLength)
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
  if (words.length < 2 || words.length > 4) return null
  const folded = foldVietnameseText(words.join(' '))
  if (/\b(?:top|list|review|com|bun|pho|banh|xoi|che|lau|nuong|mon|quan)\b/iu.test(folded)) {
    return null
  }
  return words.join(' ')
}

function streetName(value = '') {
  const segment = trimSegment(value)
  if (!segment || /\b\d+\s*[kK]\b/u.test(segment)) return null
  const folded = foldVietnameseText(segment)
  if (/\b(?:top|list|review|gia|com|bun|pho|banh|xoi|che|lau|nuong|mon|ngon|thu|lan)\b/iu.test(folded)) {
    return null
  }
  const words = segment.match(/[\p{L}]{2,}/gu) || []
  return words.length >= 2 ? segment : null
}

function markerKind(marker = '') {
  const folded = foldVietnameseText(marker).replace(/\s+/gu, '')
  if (marker.startsWith('@')) return 'NOISY_AT'
  if (marker === 'E') return 'NOISY_ATTACHED_E'
  if (folded.startsWith('f')) return 'NOISY_F'
  if (folded.startsWith('p')) return 'WARD'
  if (folded.startsWith('q')) return 'DISTRICT'
  return 'UNKNOWN'
}

export function parseShortsTrack2V3NamedAdminAddress(value = '') {
  const text = safeText(value).replace(/\s*\n\s*/gu, ' ')
  if (!text) return null

  for (const houseMatch of text.matchAll(HOUSE_NUMBER_PATTERN)) {
    const digitOffset = houseMatch[0].search(/\d/u)
    const start = Number(houseMatch.index) + digitOffset
    const fromHouse = text.slice(start)
    const houseNumber = fromHouse.match(/^\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?/iu)?.[0] || ''
    if (!houseNumber || /^\d+k$/iu.test(houseNumber)) continue

    const timeRange = fromHouse.match(TIME_RANGE_PATTERN)
    const addressWindow = trimSegment(timeRange ? fromHouse.slice(0, timeRange.index) : fromHouse)
    const district = markerMatch(addressWindow, DISTRICT_MARKER_PATTERN)
    if (!district || district.start <= houseNumber.length) continue

    const beforeDistrict = addressWindow.slice(0, district.start)
    const normalWard = markerMatch(beforeDistrict, WARD_MARKER_PATTERN)
    const attachedWard = markerMatch(beforeDistrict, ATTACHED_WARD_NOISE_PATTERN)
    const ward = [normalWard, attachedWard]
      .filter(Boolean)
      .sort((left, right) => right.start - left.start)[0] || null
    if (!ward || ward.start <= houseNumber.length) continue

    const street = streetName(addressWindow.slice(houseNumber.length, ward.start))
    const wardName = adminName(addressWindow.slice(ward.end, district.start))
    const districtName = adminName(addressWindow.slice(district.end))
    if (!street || !wardName || !districtName) continue

    const wardKind = markerKind(ward.marker)
    const districtKind = markerKind(district.marker)
    if (wardKind === 'NOISY_F' && districtKind !== 'DISTRICT') continue
    if (wardKind === 'NOISY_ATTACHED_E' && districtKind !== 'NOISY_AT') continue
    if (districtKind === 'NOISY_AT' && !wardName) continue

    const wardSegment = wardKind === 'NOISY_ATTACHED_E'
      ? wardName
      : `Phường ${wardName}`
    const normalizedAddress = [
      `${houseNumber} ${street}`,
      wardSegment,
      `Quận ${districtName}`,
    ].join(', ')

    return {
      rawText: text,
      houseNumber,
      street,
      wardName,
      districtName,
      normalizedAddress,
      wardMarkerKind: wardKind,
      districtMarkerKind: districtKind,
      noisyAdminMarker: wardKind.startsWith('NOISY_') || districtKind.startsWith('NOISY_'),
      trailingNoiseRemoved: Boolean(timeRange),
      extractionRule: 'OCR_HOUSE_STREET_NAMED_ADMIN_REVIEW_ONLY',
    }
  }

  return null
}

export default {
  parseShortsTrack2V3NamedAdminAddress,
}
