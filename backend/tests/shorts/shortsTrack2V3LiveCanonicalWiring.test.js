import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { createShortsTrack2V3MediaSession } from '../../src/services/shorts/track2-v3/shortsTrack2V3MediaSessionService.js'
import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'
import { runTrack2V3Live } from '../../scripts/track2/runTrack2V3Live.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempRoot(prefix = 'track2-v3-live-wiring-') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function config(overrides = {}) {
  return {
    enabled: true,
    track2V3CanonicalOrchestratorEnabled: true,
    track2V3SmartOverlayEnabled: true,
    track2V3LocalOcrEnabled: true,
    track2V3LocalOcrProvider: 'tesseract',
    track2V3TesseractEnabled: true,
    track2V3EasyOcrEnabled: false,
    track2V3PaddleOcrEnabled: false,
    adaptiveFrameSamplingEnabled: false,
    asrFallbackEnabled: false,
    track2V3GeminiCropJudgeEnabled: false,
    smartOverlayTimeoutMs: 5000,
    maxSmartOverlayFrames: 4,
    maxSmartOverlaySelectedImages: 2,
    maxLocalOcrImages: 2,
    ...overrides,
  }
}

function selectorUsingRuntimeFrameExtractor() {
  return async (_context, _config, deps) => {
    assert.equal(typeof deps.track2FrameExtractor, 'function')
    const frameResult = await deps.track2FrameExtractor({
      limits: {
        sampledTimestamps: [1.25],
        maxFrames: 1,
        maxExtractionBudgetMs: 5000,
      },
      budgetMs: 5000,
      mediaConsumer: 'visual_normal',
    })
    assert.equal(frameResult.status, 'OK')
    assert.equal(frameResult.frames.length, 1)
    const frame = frameResult.frames[0]
    return {
      status: 'OK',
      sampledFrameCount: 1,
      selectedImageCount: 1,
      selectedImages: [{
        id: 'shared-frame-region',
        framePath: frame.imagePath,
        imagePath: frame.imagePath,
        cropBounds: { left: 0, top: 0, width: 20, height: 20 },
        timestampSeconds: frame.timestampSeconds,
        frameIndex: frame.frameIndex,
        variant: 'dynamic_text_region_1',
        sourceType: 'smart_overlay_dynamic_text_region',
        score: 0.99,
        episodeId: 'episode-001',
        segmentId: 'segment-001',
        startSeconds: 1.25,
        endSeconds: 1.25,
      }],
      sampledFrames: frameResult.frames,
      providerErrors: [],
      selectorDiagnostics: { crops: [] },
    }
  }
}

function addressOcrProvider() {
  return async ({ selectedImages }) => ({
    status: 'OK',
    reason: 'LOCAL_OCR_TEXT_COLLECTED',
    called: true,
    provider: 'local_tesseract',
    imageCount: selectedImages.length,
    textBlocks: [{
      source: 'local_tesseract',
      rawText: '242 Độc Lập, Phường Tân Thành, Quận Tân Phú',
      imagePath: selectedImages[0].imagePath,
      timestampSeconds: selectedImages[0].timestampSeconds,
      episodeId: selectedImages[0].episodeId,
      segmentId: selectedImages[0].segmentId,
      confidence: 0.9,
    }],
    providerErrors: [],
  })
}

describe('Track 2 V3 live canonical wiring regressions', () => {
  it('keeps the live entrypoint as a thin canonical adapter without legacy frame providers', async () => {
    const root = await tempRoot()
    const outputDir = path.join(root, 'live-output')
    let observedInput = null
    let observedDeps = null

    const execution = await runTrack2V3Live(
      'https://www.youtube.com/shorts/canonical-runner',
      {
        outputDir,
        env: {},
        pipeline: async (input, deps) => {
          observedInput = input
          observedDeps = deps
          return {
            track: 'TRACK_2_V3',
            resolution: 'UNRESOLVED',
            reason: 'TEST_RESULT',
            metrics: {
              frameCount: 8,
              normalFrameCount: 8,
              timelineDurationSeconds: 100,
              normalTimestampMinSeconds: 0.5,
              normalTimestampMaxSeconds: 99.5,
              normalTailCoverageReached: true,
              canonicalMediaPathUsed: true,
              legacyFrameExtractorUsed: false,
            },
            candidates: [],
            providerErrors: [],
          }
        },
      },
    )

    assert.equal(observedInput.url, 'https://www.youtube.com/shorts/canonical-runner')
    assert.equal(observedDeps.track2FrameExtractor, undefined)
    assert.equal(observedDeps.track2OcrProvider, undefined)
    assert.equal(observedDeps.track2V3Config.enabled, true)
    assert.equal(observedDeps.track2V3Config.track2V3CanonicalOrchestratorEnabled, true)
    assert.equal(observedDeps.track2V3Config.track2V3SmartOverlayEnabled, true)
    assert.equal(observedDeps.track2V3Config.track2V3LocalOcrEnabled, true)
    assert.equal(observedDeps.track2V3LiveDiagnosticsEnabled, true)
    assert.equal(execution.summary.canonicalMediaPathUsed, true)
    assert.equal(execution.summary.legacyFrameExtractorUsed, false)
    assert.equal(execution.summary.normalTimestampRange.maxSeconds, 99.5)
    assert.ok((await fs.stat(path.join(outputDir, 'result.json'))).isFile())
    assert.ok((await fs.stat(path.join(outputDir, 'summary.json'))).isFile())
  })

  it('extracts visual frames from the shared media session without an injected track2FrameExtractor', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    let frameCalls = 0
    let acquiredVideoPath = null
    const session = createShortsTrack2V3MediaSession({
      context: {
        url: 'https://www.youtube.com/shorts/live-wiring',
        sourceUrl: 'https://www.youtube.com/shorts/live-wiring',
      },
      config: config(),
      tmpRoot: root,
      deps: {
        track2V3MediaAcquisitionProvider: async ({ workDir }) => {
          acquisitionCalls += 1
          acquiredVideoPath = path.join(workDir, 'video.mp4')
          await fs.writeFile(acquiredVideoPath, 'video')
          return { status: 'OK', localVideoPath: acquiredVideoPath }
        },
        track2V3MediaMetadataProvider: async () => ({
          status: 'OK',
          source: 'test',
          title: 'Review quán ăn một địa điểm',
          durationSeconds: 10,
        }),
        track2V3MediaFrameExtractor: async ({ localVideoPath, sampledTimestamps, workDir }) => {
          frameCalls += 1
          assert.equal(localVideoPath, acquiredVideoPath)
          const imagePath = path.join(workDir, 'frame-001.jpg')
          await fs.writeFile(imagePath, 'frame')
          return {
            status: 'OK',
            frames: [{ frameIndex: 0, timestampSeconds: sampledTimestamps[0], imagePath }],
          }
        },
      },
    })

    const result = await session.ensureFrames({
      sampledTimestamps: [1.25],
      maxFrames: 1,
      consumer: 'visual_normal',
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.frames.length, 1)
    assert.equal(acquisitionCalls, 1)
    assert.equal(frameCalls, 1)
    assert.equal(session.diagnostics().mediaFrameExtractionCalled, true)
    assert.equal(session.diagnostics().mediaFrameCount, 1)
    await session.cleanup()
  })

  it('bootstraps YouTube metadata and wires mediaSession.ensureFrames into canonical Smart Overlay', async () => {
    const root = await tempRoot()
    const framePath = path.join(root, 'frame.jpg')
    await fs.writeFile(framePath, 'frame')
    let metadataCalls = 0
    let frameCalls = 0
    const mediaSession = {
      ensureMetadata: async () => {
        metadataCalls += 1
        return {
          status: 'OK',
          source: 'yt_dlp',
          title: 'Review quán ăn ở Tân Phú',
          description: 'Một quán ăn trong video',
          durationSeconds: 10,
        }
      },
      ensureFrames: async ({ sampledTimestamps, consumer }) => {
        frameCalls += 1
        assert.deepEqual(sampledTimestamps, [1.25])
        assert.equal(consumer, 'visual_normal')
        return {
          status: 'OK',
          frames: [{ frameIndex: 0, timestampSeconds: 1.25, imagePath: framePath }],
          sampledTimestamps,
          diagnostics: [],
        }
      },
      diagnostics: () => ({ mediaFrameExtractionCalled: true, mediaFrameCount: 1 }),
      cleanup: async () => {},
    }

    const result = await runShortsTrack2V3SmartOverlayOcr({
      url: 'https://www.youtube.com/shorts/live-bootstrap',
      sourceUrl: 'https://www.youtube.com/shorts/live-bootstrap',
    }, config(), {
      mediaSession,
      smartOverlaySelector: selectorUsingRuntimeFrameExtractor(),
      localOcrProvider: addressOcrProvider(),
    })

    assert.equal(metadataCalls, 1)
    assert.equal(frameCalls, 1)
    assert.equal(result.inputClass, 'SINGLE_PLACE')
    assert.equal(result.localOcrCalled, true)
    assert.ok(result.candidates.some((candidate) =>
      String(candidate.addressFragment || candidate.displayText || '').includes('242 Độc Lập')
    ))
  })

  it('hydrates a URL-only long video before the normal Smart Overlay timeline is selected', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    let extractorContext = null

    const result = await runShortsTrack2V3SmartOverlayOcr({
      url: 'https://www.youtube.com/shorts/url-only-long-video',
      sourceUrl: 'https://www.youtube.com/shorts/url-only-long-video',
    }, config({
      maxSmartOverlayFrames: 8,
      maxSmartOverlaySelectedImages: 2,
      maxLocalOcrImages: 2,
    }), {
      tmpDir: root,
      track2V3MediaAcquisitionProvider: async ({ workDir }) => {
        acquisitionCalls += 1
        const localVideoPath = path.join(workDir, 'video.mp4')
        await fs.writeFile(localVideoPath, 'video')
        return {
          status: 'OK',
          localVideoPath,
          metadata: {
            title: 'Long single-place food review',
            durationSeconds: 100,
          },
        }
      },
      track2FrameExtractor: async (context) => {
        extractorContext = context
        return {
          status: 'OK',
          durationSeconds: context.metadata?.durationSeconds ?? null,
          sampledTimestamps: context.limits?.sampledTimestamps || [],
          frames: [],
          diagnostics: [],
        }
      },
    })

    const requestedTimestamps = extractorContext?.limits?.sampledTimestamps || []
    assert.equal(acquisitionCalls, 1)
    assert.equal(extractorContext?.metadata?.durationSeconds, 100)
    assert.ok(requestedTimestamps.length > 0)
    assert.ok(Math.max(...requestedTimestamps) >= 90)
    assert.equal(result.metrics.mediaMetadataCalled, true)
  })

  it('promotes UNKNOWN/UNSUPPORTED only after quality-gated visual address evidence exists', async () => {
    const root = await tempRoot()
    const framePath = path.join(root, 'frame.jpg')
    await fs.writeFile(framePath, 'frame')
    const mediaSession = {
      ensureMetadata: async () => ({ status: 'UNAVAILABLE', reason: 'MEDIA_METADATA_PROVIDER_ERROR' }),
      ensureFrames: async ({ sampledTimestamps }) => ({
        status: 'OK',
        frames: [{ frameIndex: 0, timestampSeconds: 1.25, imagePath: framePath }],
        sampledTimestamps,
        diagnostics: [],
      }),
      diagnostics: () => ({ mediaFrameExtractionCalled: true, mediaFrameCount: 1 }),
      cleanup: async () => {},
    }

    const result = await runShortsTrack2V3SmartOverlayOcr({
      url: 'https://www.youtube.com/shorts/visual-refine',
      sourceUrl: 'https://www.youtube.com/shorts/visual-refine',
    }, config(), {
      mediaSession,
      smartOverlaySelector: selectorUsingRuntimeFrameExtractor(),
      localOcrProvider: addressOcrProvider(),
    })

    assert.equal(result.intent, 'OCR_ADDRESS_LIKELY')
    assert.equal(result.inputClass, 'SINGLE_PLACE')
    assert.equal(result.intentReason, 'VISUAL_ADDRESS_EVIDENCE')
  })
})
