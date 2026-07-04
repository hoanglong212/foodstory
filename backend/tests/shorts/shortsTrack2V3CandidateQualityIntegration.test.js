import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

function ocrBlock(rawText, index = 0) {
  return {
    id: `ocr:block:${index}`,
    provider: 'mock_ocr',
    sourceType: 'ocr_frame_full',
    imageVariant: 'full_raw',
    frameIndex: index,
    timestampSeconds: index,
    rawText,
    normalizedText: rawText,
    confidence: 0.9,
  }
}

function deps(blocks) {
  return {
    track2V3Config: {
      enabled: true,
      maxDurationSeconds: 180,
      cheapFrameCount: 4,
      maxFrames: 8,
      maxOcrImages: 16,
      track2V3OcrBoostEnabled: false,
      ocrBoostEnabled: false,
      ocrBoostFrameCount: 8,
      maxGeminiImages: 2,
      maxPlacesQueries: 3,
      timeoutMs: 45000,
    },
    track2V3OcrBlocks: blocks,
  }
}

describe('Track 2 V3 candidate quality integration', () => {
  it('keeps address-anchored candidates in the final response', async () => {
    const result = await runShortsTrack2V3Pipeline(
      {
        url: 'https://www.youtube.com/shorts/mock-address',
        sourceUrl: 'https://www.youtube.com/shorts/mock-address',
      },
      deps([
        ocrBlock('350 D. Phạm Văn chí, Phường 4, Quận 6'),
      ]),
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.metrics.candidateQualityGateRan, true)
    assert.ok(result.metrics.rawCandidateCount >= 1)
    assert.ok(result.metrics.keptCandidateCount >= 1)
    assert.equal(result.metrics.droppedCandidateCount, 0)
    assert.ok(result.candidates.some((candidate) =>
      candidate.displayText.includes('Phạm Văn chí') &&
        ['ADDRESS_ANCHORED', 'CLEAN_FULL_ADDRESS'].includes(candidate.qualityGateReason),
    ))
  })

  it('keeps strong list-context addresses review-only without auto-resolving', async () => {
    const result = await runShortsTrack2V3Pipeline(
      {
        url: 'https://www.youtube.com/shorts/mock-list',
        sourceUrl: 'https://www.youtube.com/shorts/mock-list',
        fixtureCase: {
          category: 'GENERIC_LIST',
          expected: {
            mustNotResolve: true,
          },
        },
      },
      deps([
        ocrBlock('1. Bánh canh 350K\n350 D. Phạm Văn chí, Phường 4, Quận 6\n17:00-21:00'),
      ]),
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.metrics.candidateQualityGateRan, true)
    assert.ok(result.metrics.rawCandidateCount >= 1)
    assert.ok(result.metrics.keptCandidateCount >= 1)
    assert.ok(result.candidates.some((candidate) =>
      candidate.addressFragment?.includes('350 D. Phạm Văn chí') &&
        candidate.riskFlags.includes('REVIEW_ONLY') &&
        candidate.canAutoResolve === false,
    ))
    assert.ok(result.candidates.every((candidate) => candidate.canAutoResolve === false))
  })

  it('keeps named ward and district OCR as a review-only final candidate', async () => {
    const result = await runShortsTrack2V3Pipeline(
      {
        url: 'https://www.youtube.com/shorts/mock-named-admin',
        sourceUrl: 'https://www.youtube.com/shorts/mock-named-admin',
        fixtureCase: { expected: { mustNotResolve: true } },
      },
      deps([
        ocrBlock('242 Độc Lập, P. Tân Thành, Q. Tân Phú'),
      ]),
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].addressFragment, '242 Độc Lập, Phường Tân Thành, Quận Tân Phú')
    assert.equal(result.candidates[0].qualityGateReason, 'NOISY_NAMED_ADMIN_ADDRESS')
    assert.equal(result.candidates[0].canAutoResolve, false)
    assert.ok(result.candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('does not create a list-context candidate from a generic caption and isolated number', async () => {
    const result = await runShortsTrack2V3Pipeline(
      {
        url: 'https://www.youtube.com/shorts/mock-list-number',
        sourceUrl: 'https://www.youtube.com/shorts/mock-list-number',
        fixtureCase: {
          category: 'GENERIC_LIST',
          expected: { mustNotResolve: true },
        },
      },
      deps([
        ocrBlock('TOP NHỮNG QUÁN ĂN BÁN GIÁ RẺ\n1K\nGiá chỉ từ 25 ngàn'),
      ]),
    )

    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.candidates.length, 0)
  })
})
