function safeString(value, maxLength = 500) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, maxLength)
}

function foldText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

function tokens(value) {
  return foldText(value)
    .split(/\s+/u)
    .filter((token) => token.length > 1)
}

function overlapScore(source, target) {
  const sourceTokens = tokens(source)
  const targetTokens = new Set(tokens(target))
  if (!sourceTokens.length || !targetTokens.size) return 0
  const matches = sourceTokens.filter((token) => targetTokens.has(token)).length
  return matches / sourceTokens.length
}

function exactishNameMatch(placeNames = [], displayName = '') {
  const display = foldText(displayName)
  return placeNames.some((name) => {
    const folded = foldText(name)
    return folded && (display === folded || display.includes(folded))
  })
}

function bestNameScore(placeNames = [], displayName = '') {
  const scores = placeNames.map((name) => Math.max(
    overlapScore(name, displayName),
    exactishNameMatch([name], displayName) ? 1 : 0,
  ))
  return scores.length ? Math.max(...scores) : 0
}

function areaScore(areas = [], address = '') {
  if (!areas.length) return 0
  const foldedAddress = foldText(address)
  const scores = areas.map((area) => {
    const foldedArea = foldText(area)
    if (!foldedArea) return 0
    if (/^(?:quan|district|q)\s+\d{1,2}$/u.test(foldedArea)) {
      return new RegExp(`\\b(?:quan|district|q)\\s*${foldedArea.match(/\d{1,2}/u)?.[0]}\\b`, 'u').test(foldedAddress) ? 1 : 0
    }
    if (/^(?:phuong|ward|p)\s+\d{1,2}$/u.test(foldedArea)) {
      return new RegExp(`\\b(?:phuong|ward|p)\\s*${foldedArea.match(/\d{1,2}/u)?.[0]}\\b`, 'u').test(foldedAddress) ? 1 : 0
    }
    if (foldedAddress.includes(foldedArea)) return 1
    return overlapScore(area, address)
  })
  return scores.length ? Math.max(...scores) : 0
}

function typeScore(primaryType = '', dishes = []) {
  const type = foldText(primaryType)
  if (!type) return dishes.length ? 0.25 : 0.5
  if (/\b(?:restaurant|cafe|coffee|bakery|bar|meal|food|store)\b/.test(type)) return 1
  if (dishes.length) return 0.1
  return 0.4
}

function businessScore(status = '') {
  const folded = foldText(status)
  if (folded === 'operational' || folded === '') return 1
  if (folded.includes('closed_permanently') || folded.includes('permanently')) return 0
  return 0.5
}

function strategyScore(candidate = {}) {
  const strategies = Array.isArray(candidate.foundByStrategies) ? candidate.foundByStrategies : []
  const queryCount = Number(candidate.queryCount) || strategies.length || 1
  if (strategies.some((item) => item === 'place_district_city' || item === 'place_district')) return 1
  if (queryCount > 1) return 0.8
  if (strategies.some((item) => item === 'plain_place_area')) return 0.45
  return 0.65
}

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return Math.round(numeric * 100) / 100
}

function scoreCandidate(candidate = {}, placeSignals = {}) {
  const signals = placeSignals.signals || placeSignals || {}
  const placeNames = Array.isArray(signals.placeNames) ? signals.placeNames : []
  const areas = Array.isArray(signals.areas) ? signals.areas : []
  const dishes = Array.isArray(signals.dishes) ? signals.dishes : []
  const name = bestNameScore(placeNames, candidate.displayName)
  const area = areaScore(areas, candidate.formattedAddress)
  const type = typeScore(candidate.primaryType, dishes)
  const business = businessScore(candidate.businessStatus)
  const strategy = strategyScore(candidate)
  const riskFlags = []

  if (business === 0) riskFlags.push('CLOSED_PERMANENTLY')
  if (name < 0.5) riskFlags.push('NO_NAME_OVERLAP')
  if (areas.length && area < 0.5) riskFlags.push('NO_AREA_MATCH')
  if (type < 0.3) riskFlags.push('NON_FOOD_TYPE')
  if (strategy < 0.5) riskFlags.push('BROAD_QUERY_ONLY')

  let score = (name * 0.42) + (area * 0.28) + (type * 0.12) + (strategy * 0.1) + (business * 0.08)
  if (riskFlags.includes('CLOSED_PERMANENTLY')) score -= 0.5
  if (riskFlags.includes('NO_NAME_OVERLAP')) score -= 0.35
  if (riskFlags.includes('NO_AREA_MATCH')) score -= 0.25
  if (riskFlags.includes('NON_FOOD_TYPE')) score -= 0.15
  if (riskFlags.includes('BROAD_QUERY_ONLY')) score -= 0.1

  return {
    placeId: safeString(candidate.placeId, 120),
    displayName: safeString(candidate.displayName, 200),
    formattedAddress: safeString(candidate.formattedAddress, 300),
    primaryType: safeString(candidate.primaryType, 120),
    businessStatus: safeString(candidate.businessStatus, 120),
    score: clampScore(score),
    scoreBreakdown: {
      name: clampScore(name),
      area: clampScore(area),
      type: clampScore(type),
      strategy: clampScore(strategy),
      business: clampScore(business),
    },
    foundByStrategies: Array.isArray(candidate.foundByStrategies) ? candidate.foundByStrategies : [],
    queryCount: Number(candidate.queryCount) || 1,
    riskFlags,
    sourceType: 'place_name_inference',
  }
}

function gap(ranked = []) {
  if (ranked.length < 2) return 1
  return clampScore((ranked[0].score || 0) - (ranked[1].score || 0))
}

export function rankPlaceNameCandidates(searchResult = {}, placeSignals = {}, safetyResult = {}) {
  const rawCandidates = Array.isArray(searchResult.rawCandidates)
    ? searchResult.rawCandidates
    : []

  if (!rawCandidates.length) {
    return {
      status: 'NO_CANDIDATES',
      reason: 'PLACE_NAME_NO_CANDIDATES',
      rankedCandidates: [],
      diagnostics: [],
    }
  }

  const rankedCandidates = rawCandidates
    .map((candidate) => scoreCandidate(candidate, placeSignals))
    .filter((candidate) => candidate.placeId)
    .sort((a, b) => b.score - a.score)

  const top = rankedCandidates[0]
  const scoreGap = gap(rankedCandidates)
  const strongCount = rankedCandidates.filter((candidate) => candidate.score >= 0.78).length
  const shouldReview = safetyResult?.status !== 'OK' ||
    strongCount > 1 ||
    (top?.score >= 0.85 && scoreGap < 0.15)

  return {
    status: shouldReview ? 'NEEDS_REVIEW' : 'OK',
    reason: shouldReview ? 'PLACE_NAME_CANDIDATES_NEED_REVIEW' : 'PLACE_NAME_CANDIDATES_RANKED',
    rankedCandidates,
    diagnostics: [
      {
        code: 'PLACE_NAME_RANKING_SUMMARY',
        topScore: top?.score || 0,
        gap: scoreGap,
        strongCandidateCount: strongCount,
      },
    ],
  }
}

export const __shortsTrack2PlaceCandidateRankerTestUtils = {
  foldText,
  scoreCandidate,
}

export default {
  rankPlaceNameCandidates,
}
