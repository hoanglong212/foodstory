import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import { fuseShortsTrack2V3Evidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3EvidenceFusionService.js'

function evidence(rawText, overrides = {}) {
  return {
    id: overrides.id || `ev:${Math.random()}`,
    source: 'google_vision_text',
    sourceType: overrides.sourceType || 'ocr_crop_middle',
    frameIndex: overrides.frameIndex ?? 0,
    timestampSeconds: overrides.timestampSeconds ?? 0,
    rawText,
    normalizedText: rawText,
    confidence: 0.8,
  }
}

function candidatesFromFusion(items) {
  const fusion = fuseShortsTrack2V3Evidence({ evidence: items })
  const result = buildShortsTrack2V3Candidates({
    evidence: fusion.fusedEvidence,
    intent: { mustNotResolve: false },
  })

  return {
    fusion,
    candidates: result.candidates,
  }
}

function findCandidate(candidates, type, includes = []) {
  return candidates.find((candidate) => {
    if (candidate.type !== type) return false
    const text = [
      candidate.displayText,
      candidate.placeName,
      candidate.addressFragment,
    ].filter(Boolean).join(' ')
    return includes.every((part) => text.includes(part))
  })
}

describe('Track 2 V3 evidence fusion', () => {
  it('fuses place-name-like text with a nearby partial address', () => {
    const { fusion, candidates } = candidatesFromFusion([
      evidence('Xe xôi đêm', {
        id: 'ev:place',
        frameIndex: 2,
        timestampSeconds: 10,
      }),
      evidence('1433/2 Phường 6 Quận 10', {
        id: 'ev:address',
        frameIndex: 2,
        timestampSeconds: 10.7,
      }),
    ])
    const candidate = findCandidate(candidates, 'OCR_PLACE_PLUS_PARTIAL_ADDRESS', [
      'Xe xôi đêm',
      '1433/2',
      'Phường 6',
      'Quận 10',
    ])

    assert.equal(fusion.status, 'FUSED')
    assert.ok(candidate, 'expected OCR_PLACE_PLUS_PARTIAL_ADDRESS')
    assert.ok(candidate.riskFlags.includes('PARTIAL_ADDRESS'))
    assert.ok(candidate.riskFlags.includes('MISSING_STREET_NAME'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
  })

  it('fuses nearby address fragments into a review-only OCR address fragment', () => {
    const { candidates } = candidatesFromFusion([
      evidence('350 D. Phạm Văn chí,', {
        id: 'ev:street',
        frameIndex: 1,
        timestampSeconds: 6,
      }),
      evidence('Phường 4, Quận 6', {
        id: 'ev:admin',
        frameIndex: 2,
        timestampSeconds: 6.8,
      }),
    ])
    const candidate = findCandidate(candidates, 'OCR_ADDRESS_FRAGMENT', [
      '350 D. Phạm Văn chí',
      'Phường 4',
      'Quận 6',
    ])

    assert.ok(candidate, 'expected OCR_ADDRESS_FRAGMENT from fused address lines')
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
  })

  it('does not create address candidates from generic text only', () => {
    const { fusion, candidates } = candidatesFromFusion([
      evidence('Sài Gòn Về Đêm Thường sẽ thêm gì nhất?', {
        id: 'ev:generic',
        frameIndex: 0,
        timestampSeconds: 1,
      }),
    ])

    assert.equal(fusion.status, 'PASS_THROUGH')
    assert.deepEqual(candidates, [])
  })
})
