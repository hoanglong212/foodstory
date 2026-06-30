import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyTrack2AuditCase,
  summarizeTrack2AuditCases,
  summarizeTrack2AuditRows,
} from '../src/services/shortsTrack2AuditService.js'
import { createLiveDeps } from '../scripts/auditShortsTrack2LiveTestSet.js'

function auditCase(overrides = {}) {
  return {
    id: 'track2_case',
    enabled: true,
    category: 'PLACE_NAME_SPECIFIC',
    expected: {
      allowedResolutions: ['RESOLVED', 'CANDIDATES', 'UNRESOLVED', 'NEEDS_REVIEW'],
      mustNotResolve: false,
      allowTrack1: false,
      expectedAddressSource: null,
      expectedReasonIncludes: [],
    },
    ...overrides,
  }
}

function track2Result(overrides = {}) {
  return {
    track: 'TRACK_2',
    resolution: 'CANDIDATES',
    reason: 'PLACE_NAME_CANDIDATES_UNVERIFIED',
    candidates: [],
    diagnostics: [],
    ...overrides,
  }
}

describe('shortsTrack2AuditService', () => {
  it('mustNotResolve + RESOLVED increments falseResolved and fails', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: {
        allowedResolutions: ['RESOLVED', 'CANDIDATES', 'UNRESOLVED', 'NEEDS_REVIEW'],
        mustNotResolve: true,
      },
    }), {
      result: track2Result({ resolution: 'RESOLVED', addressSource: 'place_name_inference' }),
    })

    assert.equal(row.pass, false)
    assert.equal(row.falseResolved, true)
    assert.ok(row.failures.includes('MUST_NOT_RESOLVE_RESOLVED'))
  })

  it('allowed resolution passes', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: { allowedResolutions: ['CANDIDATES'] },
    }), {
      result: track2Result({ resolution: 'CANDIDATES' }),
    })

    assert.equal(row.pass, true)
  })

  it('disallowed resolution fails', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: { allowedResolutions: ['UNRESOLVED'] },
    }), {
      result: track2Result({ resolution: 'CANDIDATES' }),
    })

    assert.equal(row.pass, false)
    assert.ok(row.failures.includes('RESOLUTION_NOT_ALLOWED'))
  })

  it('expectedAddressSource mismatch fails', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: {
        allowedResolutions: ['RESOLVED'],
        expectedAddressSource: 'ocr_frame',
      },
    }), {
      result: track2Result({ resolution: 'RESOLVED', addressSource: 'place_name_inference' }),
    })

    assert.equal(row.pass, false)
    assert.ok(row.failures.includes('ADDRESS_SOURCE_MISMATCH'))
  })

  it('expectedAddressSource match passes', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: {
        allowedResolutions: ['RESOLVED'],
        expectedAddressSource: 'asr_transcript',
      },
    }), {
      result: track2Result({ resolution: 'RESOLVED', addressSource: 'asr_transcript' }),
    })

    assert.equal(row.pass, true)
  })

  it('provider error is counted', () => {
    const row = classifyTrack2AuditCase(auditCase(), {
      result: track2Result({
        resolution: 'UNRESOLVED',
        reason: 'PLACE_NAME_PROVIDER_ERROR',
      }),
    })
    const summary = summarizeTrack2AuditRows([row])

    assert.equal(row.providerError, true)
    assert.equal(summary.providerErrors, 1)
  })

  it('enabled:false is skipped', () => {
    const row = classifyTrack2AuditCase(auditCase({ enabled: false }), {
      result: track2Result({ resolution: 'RESOLVED' }),
    })
    const summary = summarizeTrack2AuditRows([row])

    assert.equal(row.skipped, true)
    assert.equal(summary.enabled, 0)
    assert.equal(summary.skipped, 1)
    assert.equal(summary.pass, 0)
    assert.equal(summary.fail, 0)
  })

  it('result.track === UNRESOLVED fails contract', () => {
    const row = classifyTrack2AuditCase(auditCase(), {
      result: { track: 'UNRESOLVED', resolution: 'UNRESOLVED', reason: 'BAD_TRACK' },
    })

    assert.equal(row.pass, false)
    assert.ok(row.failures.includes('TRACK_CONTRACT_UNRESOLVED'))
  })

  it('Track 2 expected case returning TRACK_1 fails unless allowTrack1 is true', () => {
    const blocked = classifyTrack2AuditCase(auditCase(), {
      result: { track: 'TRACK_1', reason: 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES' },
    })
    const allowed = classifyTrack2AuditCase(auditCase({
      expected: { allowTrack1: true },
    }), {
      result: { track: 'TRACK_1', reason: 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES' },
    })

    assert.equal(blocked.pass, false)
    assert.ok(blocked.failures.includes('TRACK1_RETURNED_FOR_TRACK2_CASE'))
    assert.equal(allowed.pass, true)
  })

  it('summary counts are correct', () => {
    const rows = [
      classifyTrack2AuditCase(auditCase({ id: 'a' }), {
        result: track2Result({ resolution: 'RESOLVED', addressSource: 'ocr_frame' }),
        latencyMs: 100,
      }),
      classifyTrack2AuditCase(auditCase({ id: 'b' }), {
        result: track2Result({ resolution: 'CANDIDATES' }),
        latencyMs: 200,
      }),
      classifyTrack2AuditCase(auditCase({ id: 'c' }), {
        result: track2Result({ resolution: 'UNRESOLVED', reason: 'OCR_COLLECTION_ERROR' }),
        latencyMs: 300,
      }),
      classifyTrack2AuditCase(auditCase({ id: 'd' }), {
        result: track2Result({ resolution: 'NEEDS_REVIEW' }),
        latencyMs: 400,
      }),
      classifyTrack2AuditCase(auditCase({ id: 'e', expected: { allowedResolutions: ['RESOLVED'] } }), {
        result: track2Result({ resolution: 'CANDIDATES' }),
        latencyMs: 500,
      }),
    ]
    const summary = summarizeTrack2AuditRows(rows, 5)

    assert.equal(summary.total, 5)
    assert.equal(summary.enabled, 5)
    assert.equal(summary.pass, 4)
    assert.equal(summary.fail, 1)
    assert.equal(summary.track2Resolved, 1)
    assert.equal(summary.track2Candidates, 2)
    assert.equal(summary.track2Unresolved, 1)
    assert.equal(summary.track2NeedsReview, 1)
    assert.equal(summary.providerErrors, 1)
    assert.equal(summary.avgLatency, 300)
    assert.deepEqual(summary.failingCaseIds, ['e'])
  })

  it('zero enabled cases returns NO_ENABLED_TRACK2_CASES but not failure', () => {
    const result = summarizeTrack2AuditCases([
      auditCase({ id: 'disabled_a', enabled: false }),
      auditCase({ id: 'disabled_b', enabled: false }),
    ])

    assert.equal(result.summary.enabled, 0)
    assert.equal(result.summary.fail, 0)
    assert.equal(result.summary.reason, 'NO_ENABLED_TRACK2_CASES')
  })

  it('generic/list mustNotResolve cases pass for non-resolved resolutions', () => {
    for (const resolution of ['CANDIDATES', 'NEEDS_REVIEW', 'UNRESOLVED']) {
      const row = classifyTrack2AuditCase(auditCase({
        category: 'GENERIC_LIST',
        expected: {
          allowedResolutions: ['CANDIDATES', 'NEEDS_REVIEW', 'UNRESOLVED'],
          mustNotResolve: true,
        },
      }), {
        result: track2Result({ resolution }),
      })

      assert.equal(row.pass, true)
      assert.equal(row.falseResolved, false)
    }
  })

  it('generic/list mustNotResolve case with RESOLVED fails', () => {
    const row = classifyTrack2AuditCase(auditCase({
      category: 'GENERIC_LIST',
      expected: {
        allowedResolutions: ['RESOLVED', 'CANDIDATES', 'NEEDS_REVIEW', 'UNRESOLVED'],
        mustNotResolve: true,
      },
    }), {
      result: track2Result({ resolution: 'RESOLVED', addressSource: 'place_name_inference' }),
    })

    assert.equal(row.pass, false)
    assert.equal(row.falseResolved, true)
  })

  it('mock control-plane audit stays at zero false resolutions and provider errors', () => {
    const rows = [
      classifyTrack2AuditCase(auditCase({
        id: 'generic',
        category: 'GENERIC_LIST',
        expected: {
          allowedResolutions: ['UNRESOLVED', 'NEEDS_REVIEW'],
          mustNotResolve: true,
        },
      }), {
        result: track2Result({ resolution: 'UNRESOLVED', reason: 'NO_OCR_ADDRESS_CANDIDATE' }),
      }),
      classifyTrack2AuditCase(auditCase({
        id: 'multi',
        category: 'MULTI_PLACE',
        expected: {
          allowedResolutions: ['NEEDS_REVIEW'],
          mustNotResolve: true,
        },
      }), {
        result: track2Result({ resolution: 'NEEDS_REVIEW', reason: 'MULTIPLE_OCR_ADDRESS_CANDIDATES' }),
      }),
      classifyTrack2AuditCase(auditCase({ id: 'candidate' }), {
        result: track2Result({ resolution: 'CANDIDATES', reason: 'OCR_CANDIDATES_UNVERIFIED' }),
      }),
    ]
    const summary = summarizeTrack2AuditRows(rows, rows.length)

    assert.equal(summary.pass, 3)
    assert.equal(summary.fail, 0)
    assert.equal(summary.falseResolved, 0)
    assert.equal(summary.providerErrors, 0)
  })

  it('supports candidate count, source, and resolution-group expectations', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: {
        allowedResolutions: ['CANDIDATES', 'NEEDS_REVIEW'],
        minCandidateCount: 1,
        expectedCandidateSource: 'ocr_frame',
        expectedResolutionGroup: 'CANDIDATES_OR_REVIEW',
      },
    }), {
      result: track2Result({
        resolution: 'CANDIDATES',
        candidates: [{ sourceType: 'ocr_frame' }],
      }),
    })

    assert.equal(row.pass, true)
    assert.equal(row.candidateCount, 1)
    assert.deepEqual(row.candidateSources, ['ocr_frame'])
  })

  it('fails optional candidate expectations without changing falseResolved', () => {
    const row = classifyTrack2AuditCase(auditCase({
      expected: {
        allowedResolutions: ['UNRESOLVED'],
        minCandidateCount: 1,
        expectedCandidateSource: 'asr_transcript',
        expectedResolutionGroup: 'CANDIDATES_OR_REVIEW',
      },
    }), {
      result: track2Result({ resolution: 'UNRESOLVED', candidates: [] }),
    })

    assert.equal(row.pass, false)
    assert.ok(row.failures.includes('MIN_CANDIDATE_COUNT_NOT_MET'))
    assert.ok(row.failures.includes('CANDIDATE_SOURCE_MISMATCH'))
    assert.ok(row.failures.includes('RESOLUTION_GROUP_MISMATCH'))
    assert.equal(row.falseResolved, false)
  })

  it('audit live deps include Track 2 frame and OCR providers', async () => {
    const deps = createLiveDeps()

    try {
      assert.equal(typeof deps.track2FrameExtractor, 'function')
      assert.equal(typeof deps.track2OcrProvider, 'function')
      assert.equal(typeof deps.cleanupTrack2LiveProviders, 'function')
    } finally {
      await deps.cleanupTrack2LiveProviders?.()
    }
  })
})
