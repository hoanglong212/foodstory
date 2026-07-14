export const SHORTS_TRACK2_V3_INPUT_CLASSES = Object.freeze({
  SINGLE_PLACE: 'SINGLE_PLACE',
  MULTI_PLACE_LISTICLE: 'MULTI_PLACE_LISTICLE',
  RELEVANT_NEGATIVE: 'RELEVANT_NEGATIVE',
  UNSUPPORTED: 'UNSUPPORTED',
})

function safeText(value, maxLength = 4000) {
  return String(value ?? '').slice(0, maxLength)
}

export function normalizeShortsTrack2V3IntentText(value) {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s/#:.,-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function contextText(context = {}) {
  const metadata = context.metadata || {}
  const title = safeText(context.title || metadata.title)
  const description = safeText(
    context.description ||
    metadata.description ||
    metadata.descriptionRawFromYoutube ||
    metadata.pageMetadataText,
  )

  return {
    title,
    description,
    titleFolded: normalizeShortsTrack2V3IntentText(title),
    descriptionFolded: normalizeShortsTrack2V3IntentText(description),
  }
}

function signal({ source, rule, matchedText, reason, intent, mustNotResolve }) {
  return {
    source,
    rule,
    matchedText,
    reason,
    intent,
    mustNotResolve,
  }
}

function firstMatch(text, patterns) {
  for (const item of patterns) {
    const match = text.match(item.pattern)
    if (match) {
      return {
        ...item,
        matchedText: match[0],
      }
    }
  }
  return null
}

const TITLE_TOP_LIST_PATTERNS = [
  { pattern: /\btop(?:\s*\d+)?\b/u, reason: 'TITLE_TOP_LIST' },
]

const TITLE_GENERIC_LIST_PATTERNS = [
  { pattern: /\b\d{1,2}\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\blist\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bdanh\s+sach\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\btong\s+hop\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bnhieu\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bcac\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bnhung\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bmay\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bquan\s+ngon\s+quan\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bfood\s*tour\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\ban\s+gi\s+o\b/u, reason: 'TITLE_GENERIC_LIST' },
  { pattern: /\bphan\s*\d+\b/u, reason: 'TITLE_GENERIC_LIST' },
]

const DESCRIPTION_MULTI_PLACE_PATTERNS = [
  { pattern: /\bdanh\s+sach\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
  { pattern: /\btong\s+hop\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
  { pattern: /\bnhieu\s+quan\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
  { pattern: /\bcac\s+quan\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
  { pattern: /\bnhung\s+quan\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
  { pattern: /\bfood\s*tour\b/u, reason: 'DESCRIPTION_MULTI_PLACE' },
]

const OCR_ADDRESS_PATTERNS = [
  { pattern: /\bdia\s+chi\s+tren\s+man\s+hinh\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\bdia\s+chi\s+trong\s+video\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\bxem\s+dia\s+chi\s+tren\s+man\s+hinh\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\baddress\s+on\s+screen\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\baddress\s+in\s+video\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\bghim\s+dia\s+chi\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\bdia\s+chi\s+ghim\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
  { pattern: /\bpinned\s+address\b/u, reason: 'PINNED_ADDRESS_ON_SCREEN' },
]

const SINGLE_PLACE_PATTERNS = [
  { pattern: /\breview\s+quan\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bquan\s+an\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bquan\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\btiem\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bcafe\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bca\s+phe\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bnha\s+hang\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bbun\s+bo\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bcom\s+tam\b/u, reason: 'SINGLE_PLACE_REVIEW' },
  { pattern: /\bpho\b/u, reason: 'SINGLE_PLACE_REVIEW' },
]

const NO_ADDRESS_PATTERNS = [
  /\bkhong\s+dia\s+chi\b/u,
  /\bno\s+address\b/u,
  /\brecipe\b/u,
  /\bcach\s+lam\b/u,
]

function inputClassForIntent(intent, combinedText = '') {
  if (['MULTI_PLACE_OR_LIST', 'GENERIC_FOOD_LIST'].includes(intent)) {
    return SHORTS_TRACK2_V3_INPUT_CLASSES.MULTI_PLACE_LISTICLE
  }
  if (['OCR_ADDRESS_LIKELY', 'SINGLE_PLACE_LIKELY'].includes(intent)) {
    return SHORTS_TRACK2_V3_INPUT_CLASSES.SINGLE_PLACE
  }
  if (intent === 'NO_ADDRESS_INTENT') {
    return SHORTS_TRACK2_V3_INPUT_CLASSES.RELEVANT_NEGATIVE
  }
  const folded = normalizeShortsTrack2V3IntentText(combinedText)
  const foodRelevant = /\b(?:food|an|mon|quan|tiem|cafe|ca phe|nha hang|bun|pho|com|banh|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua|review)\b/u
    .test(folded)
  return foodRelevant
    ? SHORTS_TRACK2_V3_INPUT_CLASSES.RELEVANT_NEGATIVE
    : SHORTS_TRACK2_V3_INPUT_CLASSES.UNSUPPORTED
}

function buildResult({ intent, mustNotResolve, reason, signals = [], combinedText = '' }) {
  return {
    intent,
    inputClass: inputClassForIntent(intent, combinedText),
    mustNotResolve,
    reason,
    signals,
  }
}

export function classifyShortsTrack2V3Intent(context = {}) {
  const text = contextText(context)
  const combinedText = `${text.title}\n${text.description}`
  const signals = []
  const result = (value) => buildResult({ ...value, combinedText })

  const titleTopMatch = firstMatch(text.titleFolded, TITLE_TOP_LIST_PATTERNS)
  if (titleTopMatch) {
    const hasPlaceListHint = /\bquan\b|\btiem\b|\bcafe\b|\bnha\s+hang\b|\bplaces?\b/u
      .test(text.titleFolded)
    const intent = hasPlaceListHint ? 'MULTI_PLACE_OR_LIST' : 'GENERIC_FOOD_LIST'
    signals.push(signal({
      source: 'title',
      rule: 'TITLE_TOP_LIST',
      matchedText: titleTopMatch.matchedText,
      reason: titleTopMatch.reason,
      intent,
      mustNotResolve: true,
    }))
    return result({
      intent,
      mustNotResolve: true,
      reason: titleTopMatch.reason,
      signals,
    })
  }

  const titleListMatch = firstMatch(text.titleFolded, TITLE_GENERIC_LIST_PATTERNS)
  if (titleListMatch) {
    const intent = /\bmon\s+ngon\b|\ban\s+gi\b/u.test(text.titleFolded)
      ? 'GENERIC_FOOD_LIST'
      : 'MULTI_PLACE_OR_LIST'
    signals.push(signal({
      source: 'title',
      rule: 'TITLE_GENERIC_LIST',
      matchedText: titleListMatch.matchedText,
      reason: titleListMatch.reason,
      intent,
      mustNotResolve: true,
    }))
    return result({
      intent,
      mustNotResolve: true,
      reason: titleListMatch.reason,
      signals,
    })
  }

  if (NO_ADDRESS_PATTERNS.some((pattern) => pattern.test(`${text.titleFolded}\n${text.descriptionFolded}`))) {
    return result({
      intent: 'NO_ADDRESS_INTENT',
      mustNotResolve: false,
      reason: 'NO_ADDRESS_SIGNAL',
      signals,
    })
  }

  const descriptionListMatch = firstMatch(text.descriptionFolded, DESCRIPTION_MULTI_PLACE_PATTERNS)
  if (descriptionListMatch) {
    signals.push(signal({
      source: 'description',
      rule: descriptionListMatch.reason,
      matchedText: descriptionListMatch.matchedText,
      reason: descriptionListMatch.reason,
      intent: 'MULTI_PLACE_OR_LIST',
      mustNotResolve: true,
    }))
    return result({
      intent: 'MULTI_PLACE_OR_LIST',
      mustNotResolve: true,
      reason: descriptionListMatch.reason,
      signals,
    })
  }

  const ocrMatch = firstMatch(
    `${text.titleFolded}\n${text.descriptionFolded}`,
    OCR_ADDRESS_PATTERNS,
  )
  if (ocrMatch) {
    signals.push(signal({
      source: text.titleFolded.includes(ocrMatch.matchedText) ? 'title' : 'description',
      rule: 'OCR_ADDRESS_HINT',
      matchedText: ocrMatch.matchedText,
      reason: ocrMatch.reason,
      intent: 'OCR_ADDRESS_LIKELY',
      mustNotResolve: false,
    }))
    return result({
      intent: 'OCR_ADDRESS_LIKELY',
      mustNotResolve: false,
      reason: ocrMatch.reason,
      signals,
    })
  }

  const singlePlaceMatch = firstMatch(
    `${text.titleFolded}\n${text.descriptionFolded}`,
    SINGLE_PLACE_PATTERNS,
  )
  if (singlePlaceMatch) {
    signals.push(signal({
      source: text.titleFolded.includes(singlePlaceMatch.matchedText) ? 'title' : 'description',
      rule: 'SINGLE_PLACE_REVIEW',
      matchedText: singlePlaceMatch.matchedText,
      reason: singlePlaceMatch.reason,
      intent: 'SINGLE_PLACE_LIKELY',
      mustNotResolve: false,
    }))
    return result({
      intent: 'SINGLE_PLACE_LIKELY',
      mustNotResolve: false,
      reason: singlePlaceMatch.reason,
      signals,
    })
  }

  return result({
    intent: 'UNKNOWN',
    mustNotResolve: false,
    reason: text.titleFolded || text.descriptionFolded
      ? 'NO_STRONG_INTENT_SIGNAL'
      : 'NO_STRONG_INTENT_SIGNAL',
    signals,
  })
}
