import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runOcrOnShortsFrames } from '../src/services/shortsTrack2OcrService.js'
import { createLiveTrack2OcrProvider } from '../src/services/shortsTrack2LiveProviderService.js'

function frameResult(overrides = {}) {
  return {
    status: 'OK',
    reason: 'MOCK_FRAMES',
    frames: [
      {
        frameIndex: 0,
        timestampSeconds: 5,
        imagePath: 'C:/tmp/frame-0.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    ],
    ...overrides,
  }
}

describe('shortsTrack2Ocr', () => {
  it('returns NO_FRAMES when frameResult has no frames', async () => {
    const result = await runOcrOnShortsFrames(frameResult({ frames: [] }))

    assert.equal(result.status, 'NO_FRAMES')
    assert.equal(result.reason, 'NO_FRAMES')
    assert.deepEqual(result.textBlocks, [])
  })

  it('returns UNAVAILABLE when OCR provider is missing', async () => {
    const result = await runOcrOnShortsFrames(frameResult())

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'OCR_PROVIDER_UNAVAILABLE')
    assert.deepEqual(result.textBlocks, [])
  })

  it('preserves UNAVAILABLE returned by the OCR provider', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        status: 'UNAVAILABLE',
        reason: 'OCR_PROVIDER_UNAVAILABLE',
        diagnostics: [{ code: 'OCR_PROVIDER_UNAVAILABLE' }],
        providerWarnings: [{ code: 'VISION_NOT_CONFIGURED' }],
      }),
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'OCR_PROVIDER_UNAVAILABLE')
    assert.deepEqual(result.textBlocks, [])
    assert.equal(result.diagnostics[0].code, 'OCR_PROVIDER_UNAVAILABLE')
    assert.equal(result.providerWarnings[0].code, 'VISION_NOT_CONFIGURED')
  })

  it('preserves ERROR returned by the OCR provider', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        status: 'ERROR',
        reason: 'OCR_PROVIDER_ERROR',
        diagnostics: [{ code: 'OCR_PROVIDER_HTTP_ERROR', httpStatus: 503 }],
      }),
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'OCR_PROVIDER_ERROR')
    assert.deepEqual(result.textBlocks, [])
    assert.equal(result.diagnostics[0].code, 'OCR_PROVIDER_HTTP_ERROR')
  })

  it('returns controlled OK / OCR_NO_TEXT when the provider succeeds without text', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        status: 'OK',
        reason: 'OCR_NO_TEXT',
        textBlocks: [],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'OCR_NO_TEXT')
    assert.deepEqual(result.textBlocks, [])
  })

  it('sanitizes successful OCR provider text blocks', async () => {
    let providerContext = null

    const result = await runOcrOnShortsFrames(frameResult(), {
      metadata: {
        title: 'mock video',
      },
      track2OcrProvider: async (context) => {
        providerContext = context
        return {
          textBlocks: [
            {
              frameIndex: 0,
              timestampSeconds: 5,
              text: '  visible menu text  ',
              confidence: 0.82,
              normalizedAddress: 'must not be returned',
            },
          ],
          diagnostics: [{ code: 'OCR_OK', message: 'mocked' }],
        }
      },
    })

    assert.equal(providerContext.frames.length, 1)
    assert.equal(providerContext.metadata.title, 'mock video')
    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'OCR_TEXT_COLLECTED')
    assert.deepEqual(result.textBlocks, [
      {
        frameIndex: 0,
        timestampSeconds: 5,
        text: 'visible menu text',
        confidence: 0.82,
      },
    ])
  })

  it('returns ERROR instead of throwing when OCR provider throws', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => {
        throw new Error('mock OCR failed')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'OCR_PROVIDER_ERROR')
    assert.deepEqual(result.textBlocks, [])
    assert.ok(result.diagnostics.some((item) => item.code === 'OCR_PROVIDER_ERROR'))
  })

  it('drops empty OCR text blocks', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        textBlocks: [
          { frameIndex: 0, timestampSeconds: 5, text: '   ', confidence: 0.5 },
          { frameIndex: 0, timestampSeconds: 5, text: 'real text', confidence: 0.5 },
        ],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.textBlocks.length, 1)
    assert.equal(result.textBlocks[0].text, 'real text')
  })

  it('converts invalid confidence to null and clamps numeric confidence safely', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        textBlocks: [
          { frameIndex: 0, timestampSeconds: 5, text: 'invalid confidence', confidence: 'bad' },
          { frameIndex: 0, timestampSeconds: 5, text: 'high confidence', confidence: 2 },
          { frameIndex: 0, timestampSeconds: 5, text: 'low confidence', confidence: -1 },
        ],
      }),
    })

    assert.equal(result.textBlocks[0].confidence, null)
    assert.equal(result.textBlocks[1].confidence, 1)
    assert.equal(result.textBlocks[2].confidence, 0)
  })

  it('does not extract addresses from OCR text', async () => {
    const result = await runOcrOnShortsFrames(frameResult(), {
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 5,
            text: 'Address: 39 Nguyen Trai, District 1, HCMC',
            confidence: 0.9,
          },
        ],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.textBlocks[0].text, 'Address: 39 Nguyen Trai, District 1, HCMC')
    assert.equal('candidates' in result, false)
    assert.equal('candidateAddress' in result, false)
    assert.equal('normalizedAddress' in result, false)
  })

  it('live OCR provider unavailable returns controlled diagnostics, not a crash', async () => {
    let cleanupCalls = 0
    const provider = createLiveTrack2OcrProvider({
      googleVisionApiKey: '',
      fetchImpl: async () => {
        throw new Error('fetch should not run without OCR credentials')
      },
      cleanupFrameDirectories: async () => {
        cleanupCalls += 1
      },
    })

    const result = await provider(frameResult())

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'OCR_PROVIDER_UNAVAILABLE')
    assert.deepEqual(result.textBlocks, [])
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_PROVIDER_UNAVAILABLE'))
    assert.equal(cleanupCalls, 1)
  })
})
