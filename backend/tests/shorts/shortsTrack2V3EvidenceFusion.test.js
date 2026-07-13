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
    ...overrides,
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

  it('passes through a place-prefixed full address as a stripped review candidate', () => {
    const { fusion, candidates } = candidatesFromFusion([
      evidence('QUÁN CHÁO 1K 221 Phan Văn Khe, Quận 6, TP HCM', {
        id: 'ev:embedded-address',
        frameIndex: 3,
        timestampSeconds: 12,
      }),
    ])
    const candidate = findCandidate(candidates, 'OCR_ADDRESS_FRAGMENT', [
      '221 Phan Văn Khe',
      'Quận 6',
      'TP HCM',
    ])

    assert.equal(fusion.status, 'PASS_THROUGH')
    assert.ok(candidate)
    assert.equal(candidate.addressFragment, '221 Phan Văn Khe, Quận 6, TP HCM')
    assert.ok(candidate.riskFlags.includes('OCR_PLACE_PREFIX_STRIPPED'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
  })

  it('passes noisy named-admin OCR through fusion as a normalized review candidate', () => {
    const { fusion, candidates } = candidatesFromFusion([
      evidence('242 Dôc Lâp, F.Tân Thành, Q.Tân Phú 10:00-21:00 COM GÀ QUÝ DẦU', {
        id: 'ev:noisy-named-admin',
        frameIndex: 5,
        timestampSeconds: 18,
      }),
    ])
    const candidate = findCandidate(candidates, 'OCR_ADDRESS_FRAGMENT', [
      '242 Dôc Lâp',
      'Phường Tân Thành',
      'Quận Tân Phú',
    ])

    assert.equal(fusion.status, 'PASS_THROUGH')
    assert.ok(candidate)
    assert.equal(candidate.addressFragment, '242 Dôc Lâp, Phường Tân Thành, Quận Tân Phú')
    assert.ok(candidate.riskFlags.includes('OCR_NAMED_ADMIN_ADDRESS'))
    assert.ok(candidate.riskFlags.includes('OCR_TRAILING_NOISE_STRIPPED'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
  })

  for (const [rawText, expectedAddress] of [
    [
      '122 Vinh Khánh, E. Khánh Hôi (Quân 4 Cū) 16:00-24:00 TRẠM NƯỚNG BBQ',
      '122 Vinh Khánh, Khánh Hôi, Quận 4',
    ],
    [
      'Xôigà56 56TrinhDinhTrong QuânTân Phú',
      '56 Trinh Dinh Trong, Quận Tân Phú',
    ],
  ]) {
    it(`keeps generalized noisy address evidence through fusion: ${rawText}`, () => {
      const { fusion, candidates } = candidatesFromFusion([
        evidence(rawText, { id: 'ev:phase39a', frameIndex: 7, timestampSeconds: 21 }),
      ])
      const candidate = findCandidate(candidates, 'OCR_ADDRESS_FRAGMENT', [expectedAddress])

      assert.equal(fusion.status, 'PASS_THROUGH')
      assert.ok(candidate)
      assert.equal(candidate.addressFragment, expectedAddress)
      assert.ok(candidate.riskFlags.includes('OCR_NAMED_ADMIN_ADDRESS'))
      assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
      assert.equal(candidate.canAutoResolve, false)
    })
  }

  it('fuses repeated partial address OCR across stage-local episode ids as review-only consensus', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('242 Déc Lap”. . A', {
        id: 'ev:normal',
        frameIndex: 56,
        timestampSeconds: 96.375,
        episodeId: 'episode-155',
        segmentId: 'segment-155',
      }),
      evidence('4242 Dọc Lapy', {
        id: 'ev:gemini',
        frameIndex: 59,
        timestampSeconds: 99.375,
        episodeId: 'episode-049',
        segmentId: 'segment-049',
      }),
      evidence('242 Doc Lap,', {
        id: 'ev:adaptive',
        frameIndex: 60,
        timestampSeconds: 99.75,
        episodeId: null,
        segmentId: null,
      }),
    ] })

    const fused = fusion.fusedEvidence.find((item) =>
      item.source === 'track2_v3_evidence_fusion' &&
      item.fusion?.reason === 'CROSS_STAGE_PARTIAL_ADDRESS_CONSENSUS'
    )

    assert.equal(fusion.status, 'FUSED')
    assert.ok(fused, 'expected a cross-stage partial address consensus fusion')
    assert.equal(fused.forceReviewOnly, true)
    assert.ok(fused.supportCount >= 2)
    assert.equal(fused.addressSignal.signalClass, 'HOUSE_STREET_PARTIAL')
  })

  it('does not fuse distant incompatible addresses when stage-local episode ids collide', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('18 Nguyễn Trãi, Phường 2, Quận 5', {
        id: 'ev:listicle:first',
        episodeId: 'episode-001',
        segmentId: 'segment-001',
        frameIndex: 1,
        timestampSeconds: 1,
      }),
      evidence('92 Lê Lợi, Phường 7, Quận 3', {
        id: 'ev:listicle:second',
        episodeId: 'episode-001',
        segmentId: 'segment-001',
        frameIndex: 90,
        timestampSeconds: 90,
      }),
    ] })

    assert.equal(fusion.fusedEvidenceCount, 0)
    assert.ok(fusion.fusedEvidence.every((item) =>
      !(item.rawText.includes('Nguyễn Trãi') && item.rawText.includes('Lê Lợi'))
    ))
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
  it('composes split ward OCR admin evidence without treating a trailing digit as house number', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('136 Van Kiet', {
        id: 'ev:136:street', frameIndex: 44, timestampSeconds: 43.125,
        episodeId: 'episode-136', segmentId: 'segment-136',
      }),
      evidence('ms\nPhư\nong\n3: Binh\nT\nhanh\n3', {
        id: 'ev:136:admin', frameIndex: 44, timestampSeconds: 43.125,
        episodeId: 'episode-136', segmentId: 'segment-136',
      }),
    ] })

    const fused = fusion.fusedEvidence.find((item) => item.source === 'track2_v3_evidence_fusion')
    assert.ok(fused, 'expected split admin band to complement house street evidence')
    assert.equal(fused.fusion.reason, 'SAME_FRAME_COMPLEMENTARY')
    assert.equal(fused.rawText, '136 Van Kiet, Phường 3')
    assert.equal(fused.addressSignal.strongAddressAnchor, true)
  })

  it('prefers same-frame complementary address composition over repeated partial consensus in one cluster', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('45/9 Hài Hải Nguyen', {
        id: 'ev:normal:partial', frameIndex: 59, timestampSeconds: 57.375,
        episodeId: 'episode-normal', segmentId: 'segment-normal',
      }),
      evidence('45/9 Han Hal Nguyen', {
        id: 'ev:band:street', frameIndex: 56, timestampSeconds: 54.375,
        episodeId: 'episode-band', segmentId: 'segment-band',
      }),
      evidence("Phirong'16 Quan 11", {
        id: 'ev:band:admin', frameIndex: 56, timestampSeconds: 54.375,
        episodeId: 'episode-band', segmentId: 'segment-band',
      }),
    ] })

    const fused = fusion.fusedEvidence.find((item) => item.source === 'track2_v3_evidence_fusion')
    assert.ok(fused, 'expected one fused address evidence item')
    assert.equal(fused.fusion.reason, 'SAME_FRAME_COMPLEMENTARY')
    assert.match(fused.rawText, /^45\/9 Han Hal Nguyen, Phường 16, Quận 11$/u)
    assert.equal(fused.addressSignal.strongAddressAnchor, true)
  })

  it('semantically composes same-frame line-band house street and split admin evidence', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('| 18/8 Wàn Hai Nguyên „|', {
        id: 'ev:band:street', episodeId: 'episode-125', segmentId: 'segment-125',
        frameIndex: 56, timestampSeconds: 54.375,
      }),
      evidence("—_— &\n`. ah\n\\ Phu\nong'16\nQuan 11", {
        id: 'ev:band:admin', episodeId: 'episode-125', segmentId: 'segment-125',
        frameIndex: 56, timestampSeconds: 54.375,
      }),
    ] })

    const fused = fusion.fusedEvidence.find((item) => item.source === 'track2_v3_evidence_fusion')
    assert.ok(fused)
    assert.equal(fused.fusion.reason, 'SAME_FRAME_COMPLEMENTARY')
    assert.equal(fused.rawText, '18/8 Wàn Hai Nguyên, Phường 16, Quận 11')
    assert.equal(fused.addressSignal.strongAddressAnchor, true)
    assert.equal(fused.forceReviewOnly, true)
  })

  it('does not promote a garbage-tagged admin fragment through same-frame fusion', () => {
    const fusion = fuseShortsTrack2V3Evidence({ evidence: [
      evidence('8 J Doc Pas', {
        id: 'ev:noisy:street', frameIndex: 5, timestampSeconds: 8.25,
        episodeId: 'episode-noisy', segmentId: 'segment-noisy',
        confidence: 0.7,
        providerMetadata: { qualityFlags: ['LOW_PROVIDER_CONFIDENCE'] },
      }),
      evidence('P M . . Doe Pas', {
        id: 'ev:noisy:admin', frameIndex: 5, timestampSeconds: 8.25,
        episodeId: 'episode-noisy', segmentId: 'segment-noisy',
        confidence: 0.68,
        providerMetadata: { qualityFlags: ['OCR_GARBAGE_TOKENS'] },
      }),
    ] })

    assert.equal(
      fusion.fusedEvidence.some((item) => item.source === 'track2_v3_evidence_fusion'),
      false,
    )
  })

})
