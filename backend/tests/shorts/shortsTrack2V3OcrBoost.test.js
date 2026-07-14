import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_SHORTS_TRACK2_V3_CONFIG } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import { decideShortsTrack2V3Escalation } from '../../src/services/shorts/track2-v3/shortsTrack2V3EscalationService.js'
import { collectShortsTrack2V3Evidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3EvidenceStoreService.js'
import { runShortsTrack2V3OcrBoost } from '../../src/services/shorts/track2-v3/shortsTrack2V3OcrBoostService.js'

describe('Track 2 V3 OCR boost service', () => {
  it('runs boost when cheap OCR has text but no candidates without requiring a provider', async () => {
    const context = {
      url: 'https://www.youtube.com/shorts/example-boost',
      videoId: 'example-boost',
      metadata: {
        durationSeconds: 30,
      },
    }
    const config = {
      ...DEFAULT_SHORTS_TRACK2_V3_CONFIG,
      enabled: false,
    }
    const ocrResult = {
      status: 'OK',
      reason: 'OCR_TEXT_COLLECTED',
      textBlocks: [
        {
          rawText: 'Sài Gòn Về Đêm Thường sẽ thêm gì nhất?',
          normalizedText: 'Sài Gòn Về Đêm Thường sẽ thêm gì nhất?',
          frameIndex: 0,
          timestampSeconds: 3,
        },
      ],
      providerErrors: [],
      metrics: {
        frameCount: 4,
        ocrImageCount: 8,
        ocrTextBlockCount: 1,
      },
    }
    const evidence = collectShortsTrack2V3Evidence(ocrResult)
    const candidateResult = buildShortsTrack2V3Candidates({
      evidence,
      intent: { mustNotResolve: false },
    })
    const escalation = decideShortsTrack2V3Escalation({
      evidence,
      candidates: candidateResult.candidates,
      ocrResult,
      config,
    })

    const result = await runShortsTrack2V3OcrBoost({
      context,
      config,
      deps: {
        track2V3OcrBoostBlocks: [],
      },
      escalation,
    })

    assert.equal(candidateResult.candidateCount, 0)
    assert.equal(escalation.escalationLevel, 'OCR_BOOST')
    assert.equal(result.ocrBoostRan, true)
    assert.equal(result.framePlan.plannedFrameCount, 8)
    assert.ok(result.framePlan.plannedFrames.every((frame) =>
      frame.timestampSeconds !== null && frame.timestampSeconds >= 0
    ))
    assert.equal(result.framePlan.plannedFrames[0].relativePosition, 0.08)
    assert.equal(result.framePlan.plannedFrames.at(-1).relativePosition, 0.92)
    assert.ok(result.frameVariants.variantCount <= 16)
    assert.equal(result.frameVariants.variantCount, 16)

    const variants = result.frameVariants.variants.map((variant) => variant.variant)
    assert.ok(variants.includes('middle_crop_raw'))
    assert.ok(variants.includes('bottom_crop_raw'))
    assert.equal(result.metrics.ocrImageCount <= 16, true)
    assert.equal(result.metrics.cropImageCount, 16)
    assert.deepEqual(result.providerErrors, [])
  })
})
