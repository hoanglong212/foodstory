import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fuseShortsTrack2V3Evidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3EvidenceFusionService.js'

function evidence(id, rawText, segmentId, timestampSeconds) {
  return { id, rawText, normalizedText: rawText, segmentId, timestampSeconds, confidence: 0.8 }
}

describe('Track2 V3 segment-aware fusion', () => {
  it('does not fuse a house/street line with admin text from another listicle segment', () => {
    const result = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('a', '153 Nam Kỳ Khởi Nghĩa', 'segment-002', 15.0),
      evidence('b', 'Phường 6, Quận 3', 'segment-003', 15.6),
    ] })
    assert.equal(result.fusedEvidenceCount, 0)
  })

  it('can fuse complementary evidence inside the same segment', () => {
    const result = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('a', '153 Nam Kỳ Khởi Nghĩa', 'segment-003', 15.0),
      evidence('b', 'Phường 6, Quận 3', 'segment-003', 15.6),
    ] })
    assert.equal(result.fusedEvidenceCount, 1)
    assert.equal(result.fusionClusters[0].segmentId, 'segment-003')
  })
})
