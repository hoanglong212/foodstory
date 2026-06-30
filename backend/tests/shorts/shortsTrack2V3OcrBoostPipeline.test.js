import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

function candidateText(candidate = {}) {
  return [
    candidate.displayText,
    candidate.placeName,
    candidate.addressFragment,
  ].filter(Boolean).join(' ')
}

describe('Track 2 V3 OCR boost pipeline', () => {
  it('uses injected boost OCR blocks to produce review-only place plus partial-address candidates', async () => {
    const result = await runShortsTrack2V3Pipeline({
      url: 'https://www.youtube.com/shorts/example-boost-pipeline',
      videoId: 'example-boost-pipeline',
      metadata: {
        title: 'Single place night food review',
        durationSeconds: 30,
      },
    }, {
      env: {},
      track2V3OcrBlocks: [
        {
          rawText: 'Sài Gòn Về Đêm Thường sẽ thêm gì nhất?',
          normalizedText: 'Sài Gòn Về Đêm Thường sẽ thêm gì nhất?',
          sourceType: 'ocr_frame_full',
          imageVariant: 'full_raw',
          frameIndex: 0,
          timestampSeconds: 3,
        },
      ],
      track2V3OcrBoostBlocks: [
        {
          rawText: 'Xe xôi đêm',
          normalizedText: 'Xe xôi đêm',
          sourceType: 'ocr_crop_middle',
          imageVariant: 'middle_crop_raw',
          frameIndex: 2,
          timestampSeconds: 10,
        },
        {
          rawText: '1433/2 Phường 6 Quận 10',
          normalizedText: '1433/2 Phường 6 Quận 10',
          sourceType: 'ocr_crop_middle',
          imageVariant: 'middle_crop_raw',
          frameIndex: 2,
          timestampSeconds: 10.5,
        },
      ],
    })

    const candidate = result.candidates.find((item) =>
      item.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS'
    )
    const text = candidateText(candidate)

    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'CANDIDATES')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.metrics.candidateCount >= 1, true)
    assert.ok(candidate, 'expected OCR_PLACE_PLUS_PARTIAL_ADDRESS')
    assert.ok(text.includes('Xe xôi đêm'))
    assert.ok(text.includes('1433/2'))
    assert.ok(text.includes('Phường 6'))
    assert.ok(text.includes('Quận 10'))
    assert.ok(candidate.riskFlags.includes('PARTIAL_ADDRESS'))
    assert.ok(candidate.riskFlags.includes('MISSING_STREET_NAME'))
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.equal(candidate.canAutoResolve, false)
    assert.equal(result.metrics.escalationLevel, 'OCR_BOOST')
    assert.equal(result.metrics.ocrBoostRan, true)
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
    assert.equal(result.debug.cheapBestOcrSnippets.length, 1)
    assert.equal(result.debug.boostBestOcrSnippets.length, 2)
  })
})
