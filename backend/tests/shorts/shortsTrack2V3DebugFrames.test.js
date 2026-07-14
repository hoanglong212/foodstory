import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildShortsTrack2V3DebugFrameReport } from '../../src/services/shorts/track2-v3/shortsTrack2V3DebugFrameReportService.js'

describe('Track 2 V3 debug frame report builder', () => {
  it('builds the debug report shape without provider dependencies or secret leakage', () => {
    const report = buildShortsTrack2V3DebugFrameReport({
      url: 'https://www.youtube.com/shorts/example123',
      videoId: 'example123',
      duration: 30,
      outputDir: 'tmp/track2-v3-debug/example123',
      result: {
        metrics: {
          frameCount: 2,
          ocrImageCount: 4,
          cropImageCount: 2,
          ocrTextBlockCount: 1,
          evidenceCount: 1,
          candidateCount: 1,
          escalationLevel: 'OCR_BOOST',
          geminiCalled: false,
          placesCalled: false,
          ocrBoostRan: true,
        },
        debug: {
          liveCheapOcrAdapterRan: true,
          ocrBoostRan: true,
          ocrBoostReason: 'OCR_BOOST_CHEAP_TEXT_NO_CANDIDATES',
          bestOcrSnippets: ['Xe xôi đêm 1433/2 Phường 6 Quận 10'],
          framePlan: {
            cheap: { plannedFrameCount: 4 },
            boost: { plannedFrameCount: 8 },
          },
        },
        candidates: [
          {
            id: 'cand:0',
            type: 'OCR_PLACE_PLUS_PARTIAL_ADDRESS',
            displayText: 'Xe xôi đêm - 1433/2 Phường 6 Quận 10',
            riskFlags: ['PARTIAL_ADDRESS', 'MISSING_STREET_NAME', 'REVIEW_ONLY'],
            canAutoResolve: false,
          },
        ],
        providerErrors: [
          {
            code: 'SAFE_ERROR',
            message: 'safe',
            apiKey: 'should-not-leak',
          },
        ],
      },
      cheapLiveResult: {
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            savedPath: 'tmp/track2-v3-debug/example123/frames/cheap-frame-00.jpg',
            sizeBytes: 123,
          },
        ],
        ocrImages: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            variant: 'bottom_crop_raw',
            sourceType: 'ocr_crop_bottom',
            savedPath: 'tmp/track2-v3-debug/example123/ocr-images/cheap-frame-00-bottom.jpg',
            sizeBytes: 45,
          },
        ],
        ocrTextBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            imageVariant: 'bottom_crop_raw',
            sourceType: 'ocr_crop_bottom',
            rawText: 'Xe xôi đêm',
            normalizedText: 'Xe xôi đêm',
          },
        ],
      },
    })

    assert.equal(report.url, 'https://www.youtube.com/shorts/example123')
    assert.equal(report.videoId, 'example123')
    assert.equal(report.duration, 30)
    assert.equal(report.cheapFramePlan.plannedFrameCount, 4)
    assert.equal(report.boostFramePlan.plannedFrameCount, 8)
    assert.equal(report.extractedFrames.length, 1)
    assert.equal(report.ocrImageVariants.length, 1)
    assert.equal(report.ocrTextBlocks.length, 1)
    assert.equal(report.ocrTextBlocks[0].rawText, 'Xe xôi đêm')
    assert.equal(report.candidates[0].type, 'OCR_PLACE_PLUS_PARTIAL_ADDRESS')
    assert.equal(report.metrics.geminiCalled, false)
    assert.equal(report.metrics.placesCalled, false)
    assert.equal(report.liveCheapOcrAdapterRan, true)
    assert.equal(report.ocrBoostRan, true)
    assert.equal(report.providerErrors[0].apiKey, undefined)
  })
})
