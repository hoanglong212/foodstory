import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertShortsTrack2V3AuditSafe,
  buildShortsTrack2V3AuditSummary,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AuditService.js'

function fixtureCase(id, category, mustNotResolve = false) {
  return {
    id,
    url: `https://www.youtube.com/shorts/${id}`,
    category,
    expected: {
      mustNotResolve,
    },
  }
}

function result(resolution, overrides = {}) {
  return {
    track: 'TRACK_2_V3',
    resolution,
    reason: `${resolution}_REASON`,
    metrics: {
      ocrTextBlockCount: overrides.ocrTextBlockCount ?? 0,
      evidenceCount: overrides.evidenceCount ?? 0,
      candidateCount: overrides.candidateCount ?? 0,
      rawCandidateCount: overrides.rawCandidateCount ?? overrides.candidateCount ?? 0,
      keptCandidateCount: overrides.keptCandidateCount ?? overrides.candidateCount ?? 0,
      droppedCandidateCount: overrides.droppedCandidateCount ?? 0,
      weakCandidateCount: overrides.weakCandidateCount ?? overrides.droppedCandidateCount ?? 0,
      addressAnchoredCandidateCount: overrides.addressAnchoredCandidateCount ?? overrides.candidateCount ?? 0,
      candidateQualityGateRan: overrides.candidateQualityGateRan ?? true,
      ocrBoostRan: Boolean(overrides.ocrBoostRan),
    },
    debug: {
      bestOcrSnippets: overrides.bestOcrSnippets || [],
      droppedCandidateReasons: overrides.droppedCandidateReasons || {},
    },
    providerErrors: overrides.providerErrors || [],
    candidates: overrides.candidates || [],
  }
}

describe('Track 2 V3 audit summary', () => {
  it('aggregates mocked V3 results by resolution and category', () => {
    const summary = buildShortsTrack2V3AuditSummary([
      {
        case: fixtureCase('track2_001', 'OCR_ONLY'),
        result: result('CANDIDATES', {
          candidateCount: 2,
          rawCandidateCount: 3,
          keptCandidateCount: 2,
          droppedCandidateCount: 1,
          weakCandidateCount: 1,
          addressAnchoredCandidateCount: 2,
          droppedCandidateReasons: {
            INTRO_OR_CAPTION_ONLY: 1,
          },
          evidenceCount: 3,
          ocrTextBlockCount: 4,
          ocrBoostRan: true,
          candidates: [{ type: 'OCR_ADDRESS_FRAGMENT', displayText: '123 D. Test' }],
        }),
      },
      {
        case: fixtureCase('track2_002', 'MULTI_PLACE', true),
        result: result('NEEDS_REVIEW', {
          candidateCount: 1,
          rawCandidateCount: 1,
          keptCandidateCount: 1,
          evidenceCount: 2,
          ocrTextBlockCount: 2,
        }),
      },
      {
        case: fixtureCase('track2_003', 'NO_EVIDENCE'),
        result: result('UNRESOLVED', {
          rawCandidateCount: 1,
          keptCandidateCount: 0,
          droppedCandidateCount: 1,
          weakCandidateCount: 1,
          addressAnchoredCandidateCount: 0,
          droppedCandidateReasons: {
            WEAK_NO_EVIDENCE_CANDIDATE: 1,
          },
          providerErrors: [{ code: 'PROVIDER_UNAVAILABLE' }],
        }),
      },
    ])

    assert.equal(summary.total, 3)
    assert.equal(summary.candidatesCount, 1)
    assert.equal(summary.needsReviewCount, 1)
    assert.equal(summary.unresolvedCount, 1)
    assert.equal(summary.falseResolvedCount, 0)
    assert.equal(summary.providerErrorCount, 1)
    assert.equal(summary.ocrTextBlockTotal, 6)
    assert.equal(summary.evidenceTotal, 5)
    assert.equal(summary.candidateTotal, 3)
    assert.equal(summary.rawCandidateTotal, 5)
    assert.equal(summary.keptCandidateTotal, 3)
    assert.equal(summary.droppedCandidateTotal, 2)
    assert.equal(summary.weakCandidateTotal, 2)
    assert.equal(summary.addressAnchoredCandidateTotal, 3)
    assert.equal(summary.droppedCandidateReasons.INTRO_OR_CAPTION_ONLY, 1)
    assert.equal(summary.droppedCandidateReasons.WEAK_NO_EVIDENCE_CANDIDATE, 1)
    assert.equal(summary.byCategory.OCR_ONLY.candidateTotal, 2)
    assert.equal(summary.byCategory.OCR_ONLY.droppedCandidateTotal, 1)
    assert.equal(summary.byCategory.MULTI_PLACE.needsReviewCount, 1)
    assert.equal(summary.byCategory.NO_EVIDENCE.providerErrorCount, 1)
    assert.equal(summary.byCategory.NO_EVIDENCE.droppedCandidateTotal, 1)
    assert.equal(summary.candidateCountByCategory.OCR_ONLY, 2)
    assert.equal(summary.droppedCandidateCountByCategory.NO_EVIDENCE, 1)
    assert.equal(summary.cases[2].droppedCandidateReasons.WEAK_NO_EVIDENCE_CANDIDATE, 1)
    assert.equal(summary.cases[0].ocrBoostRan, true)
    assert.doesNotThrow(() => assertShortsTrack2V3AuditSafe(summary))
  })

  it('flags any Phase 7 RESOLVED output as false resolved', () => {
    const summary = buildShortsTrack2V3AuditSummary([
      {
        case: fixtureCase('track2_004', 'GENERIC_LIST', true),
        result: result('RESOLVED', {
          candidateCount: 1,
          evidenceCount: 1,
          ocrTextBlockCount: 1,
        }),
      },
    ])

    assert.equal(summary.resolvedCount, 1)
    assert.equal(summary.falseResolvedCount, 1)
    assert.equal(summary.byCategory.GENERIC_LIST.falseResolvedCount, 1)
    assert.throws(
      () => assertShortsTrack2V3AuditSafe(summary),
      /falseResolvedCount=1/u,
    )
  })
})
