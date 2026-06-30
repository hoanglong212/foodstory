import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

describe('Track 2 V3 cheap OCR pipeline', () => {
  it('fails closed when no OCR provider is configured', async () => {
    const result = await runShortsTrack2V3Pipeline({
      url: 'https://www.youtube.com/shorts/example123',
      videoId: 'example123',
      metadata: {
        title: 'Example video',
      },
    }, {
      env: {},
    })

    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.reason, 'TRACK2_V3_PROVIDER_UNAVAILABLE')
    assert.ok(Array.isArray(result.providerErrors))
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE'
    ))
    assert.deepEqual(result.candidates, [])
    assert.deepEqual(result.evidence, [])
    assert.equal(result.metrics.ocrTextBlockCount, 0)
    assert.equal(result.metrics.evidenceCount, 0)
    assert.equal(result.metrics.candidateCount, 0)
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
  })

  it('can produce a noisy OCR address fragment candidate from injected cheap OCR text blocks', async () => {
    const result = await runShortsTrack2V3Pipeline({
      url: 'https://www.youtube.com/shorts/example123',
      videoId: 'example123',
      metadata: {
        title: 'Example video',
      },
    }, {
      env: {},
      track2V3OcrBlocks: [
        {
          rawText: '360 ). Phạm Văn Chí, Phường 4, Quận 6',
          sourceType: 'ocr_crop_bottom',
          imageVariant: 'bottom_crop_raw',
          frameIndex: 0,
          timestampSeconds: 12,
        },
      ],
    })

    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.reason, 'OCR_NOISY_ADDRESS_CANDIDATE')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.metrics.candidateCount >= 1, true)
    assert.ok(result.candidates.some((candidate) =>
      candidate.type === 'OCR_ADDRESS_FRAGMENT' &&
      candidate.riskFlags.includes('NOISY_OCR') &&
      candidate.riskFlags.includes('REVIEW_ONLY')
    ))
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
  })

  it('can produce a place plus partial address candidate from injected cheap OCR text blocks', async () => {
    const result = await runShortsTrack2V3Pipeline({
      url: 'https://www.youtube.com/shorts/example456',
      videoId: 'example456',
      metadata: {
        title: 'Example video',
      },
    }, {
      env: {},
      track2V3OcrBlocks: [
        {
          rawText: 'Xe xôi đêm\n1433/2 Phường 6 Quận 10',
          sourceType: 'ocr_crop_bottom',
          imageVariant: 'bottom_crop_raw',
          frameIndex: 1,
          timestampSeconds: 18,
        },
      ],
    })

    assert.equal(result.track, 'TRACK_2_V3')
    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.reason, 'OCR_PLACE_PLUS_PARTIAL_ADDRESS')
    assert.notEqual(result.resolution, 'RESOLVED')
    assert.equal(result.metrics.candidateCount >= 1, true)
    assert.ok(result.candidates.some((candidate) =>
      candidate.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS' &&
      candidate.riskFlags.includes('PARTIAL_ADDRESS') &&
      candidate.riskFlags.includes('MISSING_STREET_NAME') &&
      candidate.riskFlags.includes('REVIEW_ONLY')
    ))
    assert.equal(result.metrics.geminiCalled, false)
    assert.equal(result.metrics.placesCalled, false)
  })
})
