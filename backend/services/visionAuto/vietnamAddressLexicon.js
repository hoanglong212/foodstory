const STREET_TOKENS = Object.freeze([
  'calmette',
  'hai ba trung',
  'bach dang',
  'dien bien phu',
  'cach mang',
  'truong chinh',
  'huynh tan phat',
  'ly thuong kiet',
  'ton duc thang',
  'nguyen hue',
  'dong khoi',
  'ham nghi',
  'vo van kiet',
  'nguyen trai',
  'le van sy',
  'nguyen dinh chieu',
  'su van hanh',
  'tran hung dao',
  'nguyen van linh',
  'pham van dong',
  'ta uyen',
  'lanh binh thang',
  'thai phien',
  'duong quang ham',
  'duong dinh nghe',
  'tran phu',
  'ton that',
  'van kiep',
  'cong hoa',
  'le loi',
  'tran',
  'nguyen',
  'le',
  'pham',
  'vo',
  'hoang',
  'dinh',
  'pasteur',
  'phu',
  'duong',
  'street',
  'road',
  'hem',
  'ngo',
])

const ADMIN_TOKENS = Object.freeze([
  'ho chi minh',
  'tp hcm',
  'tphcm',
  'sai gon',
  'ha noi',
  'hai phong',
  'da nang',
  'can tho',
  'thu duc',
  'binh thanh',
  'phu nhuan',
  'binh chanh',
  'go vap',
  'ngo quyen',
  'nguyen thai binh',
  'quan',
  'district',
  'phuong',
  'ward',
  'thanh pho',
  'city',
  'tinh',
])

function tokenPattern(token) {
  return new RegExp(
    `(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?=\\s|$)`,
  )
}

export function normalizeVietnameseAddressText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchingVietnamStreetTokens(value) {
  const text = normalizeVietnameseAddressText(value)
  if (!text) return []
  return STREET_TOKENS.filter((token) => tokenPattern(token).test(text))
}

export function hasVietnamStreetName(value) {
  return matchingVietnamStreetTokens(value).length > 0
}

export function matchingVietnamAdminTokens(value) {
  const text = normalizeVietnameseAddressText(value)
  if (!text) return []
  const named = ADMIN_TOKENS.filter((token) => tokenPattern(token).test(text))
  if (/(?:^|\s)(?:q|quan)\s*\d{1,2}(?=\s|$)/.test(text)) {
    named.push('district_number')
  }
  if (/(?:^|\s)(?:p|phuong)\s*(?:\d{1,2}|[a-z][a-z0-9 ]{1,30})(?=\s|$)/.test(text)) {
    named.push('ward')
  }
  return [...new Set(named)]
}

export function hasVietnamAdminOrArea(value) {
  return matchingVietnamAdminTokens(value).length > 0
}

export function hasVietnamAddressLabel(value) {
  const text = normalizeVietnameseAddressText(value)
  return /(?:^|\s)(?:dc|dia chi|address)(?=\s|$)/.test(text)
}

export function vietnamHouseNumbers(value) {
  const text = normalizeVietnameseAddressText(value)
  const numbers = []
  for (const match of text.matchAll(/\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/g)) {
    const prefix = text.slice(0, Number(match.index || 0)).trim()
    if (/(?:^|\s)(?:p|phuong|q|quan|district|ward|tp)\s*$/.test(prefix)) {
      continue
    }
    numbers.push(match[0])
  }
  return [...new Set(numbers)]
}

export function hasVietnamHouseNumber(value) {
  return vietnamHouseNumbers(value).length > 0
}

export function isWeakVietnamAddressText(value) {
  const text = normalizeVietnameseAddressText(value)
  if (!text) return true
  if (
    /\b(?:tong hop|tat tan tat|mot quan chuyen|them \d+ quan|toan quan|quan ngon)\b/.test(
      text,
    )
  ) {
    return true
  }
  if (!hasVietnamHouseNumber(text) && /^(?:quan|q|go vap|phuong|p)(?:\s+[a-z0-9]+){0,4}$/.test(text)) {
    return true
  }
  return false
}

export function isVietnamAddressEvidence(
  value,
  { requireArea = true, allowAddressLabel = true } = {},
) {
  if (isWeakVietnamAddressText(value)) return false
  if (!hasVietnamHouseNumber(value) || !hasVietnamStreetName(value)) return false
  if (!requireArea) return true
  return (
    hasVietnamAdminOrArea(value) ||
    (allowAddressLabel && hasVietnamAddressLabel(value))
  )
}

export function hasLikelyDamagedAddressPrefix(value) {
  const raw = String(value || '').trim()
  return Boolean(
    /^\s*[ĐD]\s*[/\\:]?\s*\d{3,5}\b/iu.test(raw) &&
      hasVietnamStreetName(raw) &&
      hasVietnamAdminOrArea(raw),
  )
}

export { ADMIN_TOKENS, STREET_TOKENS }
