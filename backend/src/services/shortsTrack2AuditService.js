const TRACK2_RESOLUTIONS = new Set(['RESOLVED', 'CANDIDATES', 'UNRESOLVED', 'NEEDS_REVIEW'])
const VALID_TRACKS = new Set(['TRACK_1', 'TRACK_2'])
const PROVIDER_ERROR_PATTERN =
  /\b(?:PROVIDER_ERROR|PROVIDER_UNAVAILABLE|UNAVAILABLE|COLLECTION_ERROR|FETCH_UNAVAILABLE|METADATA_FETCH_FAILED|OCR_COLLECTION_ERROR|ASR_COLLECTION_ERROR|PLACE_NAME_PROVIDER_ERROR)\b/iu

function safeString(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function roundMs(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.round(numeric)
}

function expectedConfig(testCase = {}) {
  const expected = testCase.expected && typeof testCase.expected === 'object'
    ? testCase.expected
    : {}

  return {
    allowedResolutions: safeArray(expected.allowedResolutions)
      .map((item) => safeString(item, 40))
      .filter(Boolean),
    mustNotResolve: Boolean(expected.mustNotResolve),
    allowTrack1: Boolean(expected.allowTrack1),
    expectedAddressSource: safeString(expected.expectedAddressSource, 80) || null,
    expectedReasonIncludes: safeArray(expected.expectedReasonIncludes)
      .map((item) => safeString(item, 120))
      .filter(Boolean),
    minCandidateCount: Number.isInteger(Number(expected.minCandidateCount)) &&
      Number(expected.minCandidateCount) >= 0
      ? Number(expected.minCandidateCount)
      : null,
    expectedCandidateSource: safeString(expected.expectedCandidateSource, 80) || null,
    expectedResolutionGroup: safeString(expected.expectedResolutionGroup, 80).toUpperCase() || null,
  }
}

function resolutionMatchesGroup(resolution, group) {
  if (!group || group === 'ANY_TRACK2') return true
  if (group === 'RESOLVED') return resolution === 'RESOLVED'
  if (group === 'NON_RESOLVED') return resolution !== 'RESOLVED'
  if (group === 'CANDIDATES_OR_REVIEW') {
    return resolution === 'CANDIDATES' || resolution === 'NEEDS_REVIEW'
  }
  return resolution === group
}

function diagnosticValues(result = {}) {
  const values = [
    result?.reason,
    result?.status,
    result?.resolution,
    ...(safeArray(result?.diagnostics).flatMap((item) => [
      item?.stage,
      item?.code,
      item?.status,
      item?.reason,
      item?.message,
    ])),
    ...(safeArray(result?.providerWarnings).flatMap((item) => [
      item?.status,
      item?.reason,
      item?.message,
    ])),
  ]

  if (result?.stages && typeof result.stages === 'object') {
    for (const stage of Object.values(result.stages)) {
      if (stage && typeof stage === 'object') {
        values.push(stage.status, stage.reason)
      }
    }
  }

  return values.map((value) => safeString(value, 160)).filter(Boolean)
}

export function detectTrack2ProviderError(result = null, error = null) {
  if (error) return true
  if (!result || typeof result !== 'object') return false
  return diagnosticValues(result).some((value) => PROVIDER_ERROR_PATTERN.test(value))
}

export function classifyTrack2AuditCase(testCase = {}, execution = {}) {
  const enabled = testCase.enabled === true
  const expected = expectedConfig(testCase)
  const result = execution.result && typeof execution.result === 'object'
    ? execution.result
    : null
  const failures = []
  const track = safeString(result?.track, 40) || null
  const resolution = safeString(result?.resolution, 40) || null
  const addressSource = safeString(result?.addressSource, 80) || null
  const reason = safeString(result?.reason, 160) || null
  const providerError = detectTrack2ProviderError(result, execution.error)
  const candidates = safeArray(result?.candidates)
  const candidateSources = [...new Set(candidates
    .map((candidate) => safeString(candidate?.sourceType, 80))
    .filter(Boolean))]
  let falseResolved = false

  if (!enabled) {
    return {
      id: safeString(testCase.id, 80),
      category: safeString(testCase.category, 80),
      enabled: false,
      skipped: true,
      pass: false,
      failures: [],
      falseResolved: false,
      providerError,
      latencyMs: 0,
      track,
      resolution,
      reason,
      addressSource,
    }
  }

  if (execution.error) failures.push('EXECUTION_ERROR')
  if (!result) {
    failures.push('NO_RESULT')
  } else {
    if (track === 'UNRESOLVED') {
      failures.push('TRACK_CONTRACT_UNRESOLVED')
    } else if (!VALID_TRACKS.has(track)) {
      failures.push('INVALID_TRACK')
    }

    if (track === 'TRACK_1' && !expected.allowTrack1) {
      failures.push('TRACK1_RETURNED_FOR_TRACK2_CASE')
    }

    if (track === 'TRACK_2') {
      if (!TRACK2_RESOLUTIONS.has(resolution)) {
        failures.push('INVALID_RESOLUTION')
      }

      if (
        expected.allowedResolutions.length &&
        !expected.allowedResolutions.includes(resolution)
      ) {
        failures.push('RESOLUTION_NOT_ALLOWED')
      }

      if (expected.mustNotResolve && resolution === 'RESOLVED') {
        falseResolved = true
        failures.push('MUST_NOT_RESOLVE_RESOLVED')
      }

      if (
        expected.expectedAddressSource &&
        resolution === 'RESOLVED' &&
        addressSource !== expected.expectedAddressSource
      ) {
        failures.push('ADDRESS_SOURCE_MISMATCH')
      }

      for (const expectedReason of expected.expectedReasonIncludes) {
        if (!safeString(reason, 500).includes(expectedReason)) {
          failures.push('REASON_MISMATCH')
          break
        }
      }

      if (
        expected.minCandidateCount !== null &&
        candidates.length < expected.minCandidateCount
      ) {
        failures.push('MIN_CANDIDATE_COUNT_NOT_MET')
      }

      if (
        expected.expectedCandidateSource &&
        !candidateSources.includes(expected.expectedCandidateSource)
      ) {
        failures.push('CANDIDATE_SOURCE_MISMATCH')
      }

      if (!resolutionMatchesGroup(resolution, expected.expectedResolutionGroup)) {
        failures.push('RESOLUTION_GROUP_MISMATCH')
      }
    }
  }

  return {
    id: safeString(testCase.id, 80),
    category: safeString(testCase.category, 80),
    enabled: true,
    skipped: false,
    pass: failures.length === 0,
    failures,
    falseResolved,
    providerError,
    latencyMs: roundMs(execution.latencyMs),
    track,
    resolution,
    reason,
    addressSource,
    candidateCount: candidates.length,
    candidateSources,
  }
}

export function summarizeTrack2AuditRows(rows = [], totalCases = rows.length) {
  const allRows = safeArray(rows)
  const enabledRows = allRows.filter((row) => !row.skipped)
  const track2Rows = enabledRows.filter((row) => row.track === 'TRACK_2')
  const latencyRows = enabledRows.filter((row) => Number.isFinite(Number(row.latencyMs)))
  const latencyTotal = latencyRows.reduce((sum, row) => sum + Number(row.latencyMs || 0), 0)
  const failRows = enabledRows.filter((row) => !row.pass)

  return {
    total: Number.isFinite(Number(totalCases)) ? Number(totalCases) : allRows.length,
    enabled: enabledRows.length,
    skipped: allRows.filter((row) => row.skipped).length,
    pass: enabledRows.filter((row) => row.pass).length,
    fail: failRows.length,
    track1Returned: enabledRows.filter((row) => row.track === 'TRACK_1').length,
    track2Resolved: track2Rows.filter((row) => row.resolution === 'RESOLVED').length,
    track2Candidates: track2Rows.filter((row) => row.resolution === 'CANDIDATES').length,
    track2Unresolved: track2Rows.filter((row) => row.resolution === 'UNRESOLVED').length,
    track2NeedsReview: track2Rows.filter((row) => row.resolution === 'NEEDS_REVIEW').length,
    falseResolved: enabledRows.filter((row) => row.falseResolved).length,
    providerErrors: enabledRows.filter((row) => row.providerError).length,
    avgLatency: latencyRows.length ? Math.round(latencyTotal / latencyRows.length) : 0,
    failingCaseIds: failRows.map((row) => row.id).filter(Boolean),
    ...(enabledRows.length === 0 ? { reason: 'NO_ENABLED_TRACK2_CASES' } : {}),
  }
}

export function summarizeTrack2AuditCases(cases = [], executionsById = new Map()) {
  const normalizedCases = safeArray(cases)
  const rows = normalizedCases.map((testCase) => {
    const execution = executionsById instanceof Map
      ? executionsById.get(testCase.id) || {}
      : executionsById?.[testCase.id] || {}
    return classifyTrack2AuditCase(testCase, execution)
  })

  return {
    rows,
    summary: summarizeTrack2AuditRows(rows, normalizedCases.length),
  }
}

export function normalizeTrack2AuditFixture(fixture = {}) {
  if (Array.isArray(fixture)) return { version: 'unknown', cases: fixture }
  return {
    version: safeString(fixture.version, 80) || 'unknown',
    cases: safeArray(fixture.cases),
  }
}

export const __shortsTrack2AuditTestUtils = {
  expectedConfig,
  resolutionMatchesGroup,
}

export default {
  classifyTrack2AuditCase,
  detectTrack2ProviderError,
  normalizeTrack2AuditFixture,
  summarizeTrack2AuditCases,
  summarizeTrack2AuditRows,
}
