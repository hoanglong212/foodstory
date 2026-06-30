const DEFAULT_CATEGORIES = ['OCR_ONLY', 'MULTI_PLACE', 'GENERIC_LIST', 'NO_EVIDENCE']

function safeString(value, maxLength = 2000) {
  if (value == null) return ''
  return String(value).trim().slice(0, maxLength)
}

function numberMetric(result = {}, key, fallback = 0) {
  const parsed = Number(result.metrics?.[key])
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeReasonCounts(value = {}) {
  if (!value || typeof value !== 'object') return {}
  const counts = {}
  for (const [reason, count] of Object.entries(value)) {
    const safeReason = safeString(reason, 160)
    const parsed = Number(count)
    if (!safeReason || !Number.isFinite(parsed) || parsed <= 0) continue
    counts[safeReason] = (counts[safeReason] || 0) + parsed
  }
  return counts
}

function addReasonCounts(target = {}, source = {}) {
  for (const [reason, count] of Object.entries(safeReasonCounts(source))) {
    target[reason] = (target[reason] || 0) + count
  }
}

function candidateCount(result = {}) {
  if (Number.isFinite(Number(result.metrics?.candidateCount))) return Number(result.metrics.candidateCount)
  return Array.isArray(result.candidates) ? result.candidates.length : 0
}

function evidenceCount(result = {}) {
  if (Number.isFinite(Number(result.metrics?.evidenceCount))) return Number(result.metrics.evidenceCount)
  return Array.isArray(result.evidence) ? result.evidence.length : 0
}

function emptyBreakdown(category) {
  return {
    category,
    total: 0,
    resolvedCount: 0,
    candidatesCount: 0,
    needsReviewCount: 0,
    unresolvedCount: 0,
    falseResolvedCount: 0,
    providerErrorCount: 0,
    ocrTextBlockTotal: 0,
    evidenceTotal: 0,
    candidateTotal: 0,
    rawCandidateTotal: 0,
    keptCandidateTotal: 0,
    droppedCandidateTotal: 0,
    weakCandidateTotal: 0,
    addressAnchoredCandidateTotal: 0,
    droppedCandidateReasons: {},
  }
}

function summarizeCandidate(candidate = {}) {
  return {
    type: safeString(candidate.type, 160) || null,
    displayText: safeString(candidate.displayText || candidate.addressFragment || candidate.placeName, 500),
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags.map((flag) => safeString(flag, 120)) : [],
    canAutoResolve: Boolean(candidate.canAutoResolve),
  }
}

export function summarizeShortsTrack2V3AuditCase(item = {}, result = {}) {
  const expected = item.expected || {}
  const providerErrors = Array.isArray(result.providerErrors) ? result.providerErrors : []
  const resolution = safeString(result.resolution, 120) || 'UNKNOWN'
  const keptCandidateCount = numberMetric(result, 'keptCandidateCount', candidateCount(result))
  const droppedCandidateCount = numberMetric(result, 'droppedCandidateCount', 0)
  const rawCandidateCount = numberMetric(
    result,
    'rawCandidateCount',
    keptCandidateCount + droppedCandidateCount,
  )

  return {
    id: safeString(item.id, 160),
    url: safeString(item.url, 2000),
    category: safeString(item.category, 120) || 'UNKNOWN',
    expectedMustNotResolve: Boolean(expected.mustNotResolve),
    track: safeString(result.track, 120) || null,
    resolution,
    reason: safeString(result.reason, 240) || null,
    candidateCount: candidateCount(result),
    rawCandidateCount,
    keptCandidateCount,
    droppedCandidateCount,
    droppedCandidateReasons: safeReasonCounts(result.debug?.droppedCandidateReasons),
    weakCandidateCount: numberMetric(result, 'weakCandidateCount', droppedCandidateCount),
    addressAnchoredCandidateCount: numberMetric(result, 'addressAnchoredCandidateCount', keptCandidateCount),
    evidenceCount: evidenceCount(result),
    ocrTextBlockCount: numberMetric(result, 'ocrTextBlockCount'),
    ocrBoostRan: Boolean(result.metrics?.ocrBoostRan || result.debug?.ocrBoostRan),
    bestOcrSnippets: Array.isArray(result.debug?.bestOcrSnippets)
      ? result.debug.bestOcrSnippets.map((snippet) => safeString(snippet, 240))
      : [],
    providerErrors,
    candidates: Array.isArray(result.candidates) ? result.candidates.map(summarizeCandidate) : [],
    falseResolved: resolution === 'RESOLVED',
  }
}

function addCase(summary, caseSummary) {
  const resolution = caseSummary.resolution
  const category = caseSummary.category || 'UNKNOWN'
  if (!summary.byCategory[category]) summary.byCategory[category] = emptyBreakdown(category)

  const targets = [summary, summary.byCategory[category]]
  for (const target of targets) {
    target.total += 1
    if (resolution === 'RESOLVED') target.resolvedCount += 1
    else if (resolution === 'CANDIDATES') target.candidatesCount += 1
    else if (resolution === 'NEEDS_REVIEW') target.needsReviewCount += 1
    else if (resolution === 'UNRESOLVED') target.unresolvedCount += 1
    if (caseSummary.falseResolved) target.falseResolvedCount += 1
    if (caseSummary.providerErrors.length > 0) target.providerErrorCount += 1
    target.ocrTextBlockTotal += caseSummary.ocrTextBlockCount
    target.evidenceTotal += caseSummary.evidenceCount
    target.candidateTotal += caseSummary.candidateCount
    target.rawCandidateTotal += caseSummary.rawCandidateCount
    target.keptCandidateTotal += caseSummary.keptCandidateCount
    target.droppedCandidateTotal += caseSummary.droppedCandidateCount
    target.weakCandidateTotal += caseSummary.weakCandidateCount
    target.addressAnchoredCandidateTotal += caseSummary.addressAnchoredCandidateCount
    addReasonCounts(target.droppedCandidateReasons, caseSummary.droppedCandidateReasons)
  }
}

function categoryTotals(summary = {}, key) {
  return Object.fromEntries(
    Object.entries(summary.byCategory || {}).map(([category, breakdown]) => [
      category,
      Number(breakdown?.[key] || 0),
    ]),
  )
}

export function buildShortsTrack2V3AuditSummary(results = []) {
  const summary = {
    total: 0,
    resolvedCount: 0,
    candidatesCount: 0,
    needsReviewCount: 0,
    unresolvedCount: 0,
    falseResolvedCount: 0,
    providerErrorCount: 0,
    ocrTextBlockTotal: 0,
    evidenceTotal: 0,
    candidateTotal: 0,
    rawCandidateTotal: 0,
    keptCandidateTotal: 0,
    droppedCandidateTotal: 0,
    weakCandidateTotal: 0,
    addressAnchoredCandidateTotal: 0,
    droppedCandidateReasons: {},
    byCategory: Object.fromEntries(DEFAULT_CATEGORIES.map((category) => [
      category,
      emptyBreakdown(category),
    ])),
    candidateCountByCategory: {},
    droppedCandidateCountByCategory: {},
    cases: [],
  }

  for (const entry of Array.isArray(results) ? results : []) {
    const caseSummary = entry?.result
      ? summarizeShortsTrack2V3AuditCase(entry.case || entry.item, entry.result)
      : entry
    if (!caseSummary || typeof caseSummary !== 'object') continue
    summary.cases.push(caseSummary)
    addCase(summary, caseSummary)
  }

  summary.candidateCountByCategory = categoryTotals(summary, 'candidateTotal')
  summary.droppedCandidateCountByCategory = categoryTotals(summary, 'droppedCandidateTotal')

  return summary
}

export function assertShortsTrack2V3AuditSafe(summary = {}) {
  const falseResolvedCount = Number(summary.falseResolvedCount || 0)
  if (falseResolvedCount > 0) {
    throw new Error(`Track 2 V3 audit failed: falseResolvedCount=${falseResolvedCount}`)
  }
  return summary
}

export default {
  summarizeShortsTrack2V3AuditCase,
  buildShortsTrack2V3AuditSummary,
  assertShortsTrack2V3AuditSafe,
}
