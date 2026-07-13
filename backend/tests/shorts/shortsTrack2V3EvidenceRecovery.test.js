import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  analyzeShortsTrack2V3AddressSignal,
  areShortsTrack2V3AddressSignalsComplementary,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AddressSignalService.js'
import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import { fuseShortsTrack2V3Evidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3EvidenceFusionService.js'
import { buildShortsTrack2V3TemporalTextEpisodes } from '../../src/services/shorts/track2-v3/shortsTrack2V3TemporalTextEpisodeService.js'
import {
  SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS,
  runShortsTrack2V3AsrFallback,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrFallbackService.js'
import { writeShortsTrack2V3LiveDiagnostics } from '../../src/services/shorts/track2-v3/shortsTrack2V3LiveDiagnosticsService.js'
import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir(prefix = 'track2-v3-recovery-') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function evidence(id, rawText, overrides = {}) {
  return {
    id,
    rawText,
    confidence: 0.78,
    frameIndex: 20,
    timestampSeconds: 10,
    episodeId: `episode-${id}`,
    segmentId: `segment-${id}`,
    ...overrides,
  }
}

function temporalCrop(timestampSeconds, signature, score = 0.7, top = 100) {
  return {
    frameIndex: Math.round(timestampSeconds * 2),
    timestampSeconds,
    signature,
    score,
    variant: 'dynamic_text_region_01',
    sourceFrameHeight: 1000,
    cropBounds: { left: 0, top, width: 500, height: 180 },
    scoreBreakdown: { contrast: 0.6, edgeDensity: 0.7, textBandScore: 0.8 },
  }
}

function asrConfig(overrides = {}) {
  return {
    asrFallbackEnabled: true,
    windowedAsrEnabled: true,
    asrFullAudioFallbackPolicy: 'strong_signal_only',
    asrTimeoutMs: 1000,
    asrModel: 'small',
    asrDevice: 'cpu',
    asrComputeType: 'int8',
    asrLanguage: 'vi',
    ...overrides,
  }
}

describe('Track 2 V3 evidence recovery and rescue ordering', () => {
  it('fuses complementary same-frame address bands across episode IDs before candidate extraction', () => {
    const houseStreet = evidence('house', '242 Độc Lập', {
      episodeId: 'episode-1',
      segmentId: 'segment-1',
    })
    const admin = evidence('admin', 'P. Tân Thành, Q. Tân Phú', {
      episodeId: 'episode-2',
      segmentId: 'segment-2',
    })

    const left = analyzeShortsTrack2V3AddressSignal(houseStreet.rawText)
    const right = analyzeShortsTrack2V3AddressSignal(admin.rawText)
    assert.equal(left.signalClass, 'HOUSE_STREET_PARTIAL')
    assert.equal(right.signalClass, 'ADMIN_PARTIAL')
    assert.equal(areShortsTrack2V3AddressSignalsComplementary(left, right), true)

    const fusion = fuseShortsTrack2V3Evidence({ evidence: [houseStreet, admin] })
    assert.equal(fusion.fusedEvidenceCount, 1)
    const fused = fusion.fusedEvidence.find((item) => item.source === 'track2_v3_evidence_fusion')
    assert.ok(fused)
    assert.equal(fused.fusion.reason, 'CROSS_EPISODE_SAME_FRAME_COMPLEMENTARY')
    assert.match(fused.rawText, /242 Độc Lập/u)
    assert.match(fused.rawText, /Phường Tân Thành/u)
    assert.match(fused.rawText, /Quận Tân Phú/u)
    assert.equal(fused.forceReviewOnly, true)

    const candidates = buildShortsTrack2V3Candidates({
      evidence: fusion.fusedEvidence,
      intent: { mustNotResolve: false },
    })
    assert.equal(candidates.candidateCount, 1)
    assert.equal(candidates.candidates[0].canAutoResolve, false)
    assert.match(candidates.candidates[0].addressFragment, /242 Độc Lập/u)
    assert.match(candidates.candidates[0].addressFragment, /Phường Tân Thành/u)
    assert.match(candidates.candidates[0].addressFragment, /Quận Tân Phú/u)
  })

  it('does not fuse numbered menu text with a noisy pseudo-admin fragment', () => {
    const menu = evidence('menu', '1. Bánh canh 35K', {
      episodeId: 'episode-menu',
      segmentId: 'segment-menu',
    })
    const subtitle = evidence('subtitle', 'Q. ngon', {
      episodeId: 'episode-subtitle',
      segmentId: 'segment-subtitle',
    })

    assert.equal(analyzeShortsTrack2V3AddressSignal(menu.rawText).signalClass, 'NON_ADDRESS')
    assert.equal(analyzeShortsTrack2V3AddressSignal(subtitle.rawText).signalClass, 'NON_ADDRESS')
    assert.equal(areShortsTrack2V3AddressSignalsComplementary(menu.rawText, subtitle.rawText), false)

    const fusion = fuseShortsTrack2V3Evidence({ evidence: [menu, subtitle] })
    assert.equal(fusion.fusedEvidenceCount, 0)
    const candidates = buildShortsTrack2V3Candidates({ evidence: fusion.fusedEvidence })
    assert.equal(candidates.candidateCount, 0)
  })

  it('records bounded rejection reasons when OCR text cannot become a candidate', () => {
    const result = buildShortsTrack2V3Candidates({
      evidence: [evidence('noise', 'Món ngon hôm nay')],
      intent: { mustNotResolve: false },
    })

    assert.equal(result.candidateCount, 0)
    assert.ok(result.diagnostics.length > 0)
    assert.ok(result.diagnostics.every((item) => item.emitted === false))
    assert.ok(result.diagnostics.some((item) => item.signalClass === 'NON_ADDRESS'))
    assert.ok(result.diagnostics.some((item) =>
      item.reasons.includes('NO_COMPLETE_ADDRESS_FRAGMENT_AFTER_ANALYSIS')
    ))
    assert.ok(Number(result.rejectionSummary.NON_ADDRESS) > 0)
  })

  it('rejoins a stable overlay after one noisy intermediate signature', () => {
    const result = buildShortsTrack2V3TemporalTextEpisodes({
      scoredCrops: [
        temporalCrop(12.0, '0000000000000000', 0.74),
        temporalCrop(12.7, '1111111111111111', 0.60),
        temporalCrop(13.3, '0000000000000001', 0.91),
      ],
      config: {
        temporalEpisodeEnabled: true,
        temporalEpisodeMaxGapSeconds: 2.25,
        temporalEpisodeMaxRepresentatives: 12,
        temporalEpisodeNeighborCount: 2,
      },
    })

    assert.equal(result.episodeCount, 2)
    assert.ok(result.episodes.some((item) => item.supportCount === 2))
    assert.ok(result.episodes.some((item) =>
      item.observations.some((observation) => observation.timestampSeconds === 12) &&
      item.observations.some((observation) => observation.timestampSeconds === 13.3)
    ))
  })

  it('does not invoke full-audio ASR for unrelated visual text under strong-signal policy', async () => {
    let calls = 0
    const result = await runShortsTrack2V3AsrFallback({
      context: { url: 'https://www.youtube.com/shorts/weak-visual' },
      config: asrConfig(),
      deps: {
        track2V3AsrProvider: async () => {
          calls += 1
          throw new Error('ASR provider must not run for weak unrelated visual text')
        },
      },
      visualTexts: ['Món ngon hôm nay', 'Ăn một lần là nhớ'],
      metadataTexts: [],
      existingCandidates: [],
      opportunityWindows: [],
    })

    assert.equal(calls, 0)
    assert.equal(result.asrCalled, false)
    assert.equal(result.asrFullAudioFallbackRan, false)
    assert.equal(
      result.asrFallbackReason,
      SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL,
    )
  })

  it('still permits ASR rescue for a strong house/street partial signal', async () => {
    let calls = 0
    const result = await runShortsTrack2V3AsrFallback({
      context: { url: 'https://www.youtube.com/shorts/strong-partial' },
      config: asrConfig(),
      deps: {
        track2V3AsrProvider: async () => {
          calls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'injected-asr',
            transcriptText: 'địa chỉ quán là 242 Độc Lập phường Tân Thành quận Tân Phú',
            segments: [{ id: 0, start: 1, end: 4, text: 'địa chỉ quán là 242 Độc Lập phường Tân Thành quận Tân Phú' }],
            providerErrors: [],
            runtimeMs: 20,
            audioDurationSeconds: 12,
            modelLoadCount: 1,
          }
        },
      },
      visualTexts: ['242 Độc Lập'],
      metadataTexts: [],
      existingCandidates: [],
      opportunityWindows: [],
    })

    assert.equal(calls, 1)
    assert.equal(result.asrCalled, true)
    assert.equal(result.asrFullAudioFallbackRan, true)
    assert.ok(['ASR_CANDIDATE_FOUND', 'ASR_PARTIAL_REVIEW_EVIDENCE', 'ASR_NO_ADDRESS_EVIDENCE'].includes(result.asrFallbackReason))
  })

  it('runs Gemini crop judge after weak ASR is skipped and visual OCR has no candidate', async () => {
    const directory = await tempDir('track2-v3-gemini-gate-')
    const cropPath = path.join(directory, 'crop.jpg')
    await fs.writeFile(cropPath, 'offline crop', 'utf8')
    const crop = {
      cropId: 'crop-1',
      cropPath,
      path: cropPath,
      timestampSeconds: 10,
      frameIndex: 20,
      variant: 'dynamic_text_region_01',
      sourceType: 'smart_overlay_crop',
      score: 0.9,
    }
    let localOcrCalls = 0
    let geminiCalls = 0
    let asrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/gemini-after-skipped-asr',
        metadata: { title: 'Quán ăn hôm nay', durationSeconds: 30 },
      },
      {
        enabled: true,
        track2V3SmartOverlayEnabled: true,
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        track2V3TesseractEnabled: true,
        adaptiveFrameSamplingEnabled: false,
        asrFallbackEnabled: true,
        windowedAsrEnabled: true,
        asrFullAudioFallbackPolicy: 'strong_signal_only',
        track2V3GeminiCropJudgeEnabled: true,
        localOcrTimeoutMs: 5000,
        maxLocalOcrImages: 12,
        localOcrLanguages: 'vi,en',
      },
      {
        outputDir: directory,
        smartOverlayResult: {
          status: 'OK',
          sampledFrameCount: 1,
          selectedImageCount: 1,
          selectedImages: [crop],
          sampledFrames: [],
          selectorDiagnostics: { crops: [crop] },
          providerErrors: [],
          duration: 30,
        },
        localOcrProvider: async () => {
          localOcrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'local_tesseract',
            textBlocks: localOcrCalls === 1
              ? [{ rawText: 'Món ngon hôm nay', imagePath: cropPath, timestampSeconds: 10, frameIndex: 20 }]
              : [],
            providerErrors: [],
          }
        },
        track2V3AsrProvider: async () => {
          asrCalls += 1
          throw new Error('Weak visual text should not trigger full-audio ASR')
        },
        geminiCropJudge: async () => {
          geminiCalls += 1
          return {
            enabled: true,
            called: true,
            provider: 'gemini',
            status: 'OK',
            reason: 'GEMINI_CROP_JUDGE_SELECTED_CROPS',
            selectedCropIds: [],
            rejectedCropIds: ['crop-1'],
            selectedCrops: [],
            errors: [],
          }
        },
      },
    )

    assert.equal(localOcrCalls, 1)
    assert.equal(asrCalls, 0)
    assert.equal(result.asrFallbackReason, 'ASR_FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL')
    assert.equal(geminiCalls, 1)
    assert.equal(result.geminiCropJudgeCalled, true)
    assert.equal(result.geminiCropJudgeStatus, 'OK')
  })

  it('runs Gemini-selected OCR before ASR and skips ASR when Gemini recovers the address', async () => {
    const directory = await tempDir('track2-v3-gemini-before-asr-')
    const cropPath = path.join(directory, 'crop.jpg')
    await fs.writeFile(cropPath, 'offline crop', 'utf8')
    const crop = {
      cropId: 'crop-242',
      cropPath,
      path: cropPath,
      timestampSeconds: 99.375,
      frameIndex: 59,
      variant: 'dynamic_text_region_01',
      sourceType: 'smart_overlay_crop',
      score: 0.95,
    }
    let localOcrCalls = 0
    let asrCalls = 0

    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/242-doc-lap-gemini-before-asr',
        metadata: { title: 'Quán ăn hôm nay', durationSeconds: 100 },
      },
      {
        enabled: true,
        track2V3SmartOverlayEnabled: true,
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        track2V3TesseractEnabled: true,
        adaptiveFrameSamplingEnabled: false,
        asrFallbackEnabled: true,
        windowedAsrEnabled: true,
        asrFullAudioFallbackPolicy: 'strong_signal_only',
        track2V3GeminiCropJudgeEnabled: true,
        localOcrTimeoutMs: 5000,
        maxLocalOcrImages: 12,
        localOcrLanguages: 'vi,en',
      },
      {
        outputDir: directory,
        smartOverlayResult: {
          status: 'OK',
          sampledFrameCount: 1,
          selectedImageCount: 1,
          selectedImages: [crop],
          sampledFrames: [],
          selectorDiagnostics: { crops: [crop] },
          providerErrors: [],
          duration: 100,
        },
        localOcrProvider: async () => {
          localOcrCalls += 1
          return {
            status: 'OK',
            called: true,
            provider: 'local_tesseract',
            textBlocks: [{
              source: 'local_tesseract',
              rawText: localOcrCalls === 1
                ? 'Món ngon hôm nay'
                : '/\n242 Doc Lap,\n[E.Tân Thành Q .Tân Phu\nl',
              confidence: localOcrCalls === 1 ? 0.55 : 0.78,
              imagePath: cropPath,
              timestampSeconds: crop.timestampSeconds,
              frameIndex: crop.frameIndex,
              cropVariant: crop.variant,
            }],
            providerErrors: [],
          }
        },
        track2V3AsrProvider: async () => {
          asrCalls += 1
          throw new Error('Gemini-selected visual address must prevent ASR')
        },
        geminiCropJudge: async () => ({
          enabled: true,
          called: true,
          provider: 'gemini',
          status: 'OK',
          reason: 'GEMINI_CROP_JUDGE_SELECTED_CROPS',
          selectedCropIds: ['crop-242'],
          rejectedCropIds: [],
          selectedCrops: [crop],
          errors: [],
        }),
      },
    )

    assert.equal(localOcrCalls, 2)
    assert.equal(result.geminiCropJudgeCalled, true)
    assert.ok(result.candidateCountFromGeminiSelectedCrops >= 1)
    assert.equal(asrCalls, 0)
    assert.equal(result.asrCalled, false)
    assert.equal(result.asrFallbackReason, 'RESCUE_SUFFICIENT')
    assert.ok(result.candidates.some((candidate) =>
      candidate.addressFragment?.includes('242 Doc Lap') &&
      candidate.addressFragment?.includes('Tân Thành')
    ))
  })

  it('writes five private live diagnostic artifacts with candidate rejection summary', async () => {
    const directory = await tempDir('track2-v3-diagnostics-')
    const candidateResult = buildShortsTrack2V3Candidates({
      evidence: [evidence('noise', 'Món ngon hôm nay')],
    })
    const result = await writeShortsTrack2V3LiveDiagnostics({
      enabled: true,
      outputDir: directory,
      textBlocks: [{
        id: 'ocr-1',
        rawText: 'Món ngon hôm nay',
        timestampSeconds: 2.5,
        frameIndex: 5,
        cropId: 'crop-1',
        cropVariant: 'dynamic_text_region_01',
      }],
      candidateResult,
      temporalConsensus: { status: 'OK', consensusBlocks: [] },
      asrOpportunityWindows: [],
      asrFallbackResult: { asrFallbackReason: 'ASR_FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL' },
      geminiCropJudgeResult: { enabled: true, called: false, status: 'NOT_RUN', reason: 'TEST' },
      fusionResult: { status: 'PASS_THROUGH', fusedEvidenceCount: 0, fusionClusters: [] },
    })

    assert.equal(result.written, true)
    const files = await fs.readdir(directory)
    assert.deepEqual(files.sort(), [
      'track2-v3-asr-windows.json',
      'track2-v3-candidate-diagnostics.json',
      'track2-v3-gemini-crop-judge.json',
      'track2-v3-ocr-observations.json',
      'track2-v3-temporal-consensus.json',
    ])
    const candidateArtifact = JSON.parse(await fs.readFile(
      path.join(directory, 'track2-v3-candidate-diagnostics.json'),
      'utf8',
    ))
    assert.equal(candidateArtifact.candidateCount, 0)
    assert.ok(Number(candidateArtifact.rejectionSummary.NON_ADDRESS) > 0)
  })
  it('recovers a review candidate from a synthetic 25-block live trace without spending full-audio ASR', async () => {
    const directory = await tempDir('track2-v3-25-block-trace-')
    const cropPath = path.join(directory, 'selected.jpg')
    await fs.writeFile(cropPath, 'offline selected region', 'utf8')
    const crop = {
      cropId: 'crop-main',
      cropPath,
      path: cropPath,
      timestampSeconds: 53,
      frameIndex: 53,
      variant: 'dynamic_text_region_01',
      sourceType: 'smart_overlay_crop',
      score: 0.94,
    }
    const noiseBlocks = Array.from({ length: 23 }, (_, index) => ({
      id: `noise-${index}`,
      rawText: index % 2 === 0 ? 'Món ngon hôm nay' : 'Ăn một lần là nhớ',
      imagePath: cropPath,
      frameIndex: index,
      timestampSeconds: index * 1.2,
      episodeId: `episode-noise-${index}`,
      segmentId: `segment-noise-${index}`,
    }))
    const blocks = [
      ...noiseBlocks,
      {
        id: 'address-house-street',
        rawText: '242 Độc Lập',
        imagePath: cropPath,
        frameIndex: 53,
        timestampSeconds: 53,
        episodeId: 'episode-address-upper',
        segmentId: 'segment-address-upper',
      },
      {
        id: 'address-admin',
        rawText: 'P. Tân Thành, Q. Tân Phú',
        imagePath: cropPath,
        frameIndex: 53,
        timestampSeconds: 53,
        episodeId: 'episode-address-lower',
        segmentId: 'segment-address-lower',
      },
    ]
    let asrCalls = 0
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://example.test/synthetic-live-trace-25-blocks',
        metadata: { title: 'Review quán ăn', durationSeconds: 60 },
      },
      {
        enabled: true,
        track2V3SmartOverlayEnabled: true,
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'tesseract',
        track2V3TesseractEnabled: true,
        adaptiveFrameSamplingEnabled: false,
        asrFallbackEnabled: true,
        windowedAsrEnabled: true,
        asrFullAudioFallbackPolicy: 'strong_signal_only',
        track2V3GeminiCropJudgeEnabled: false,
        localOcrTimeoutMs: 5000,
        maxLocalOcrImages: 12,
        localOcrLanguages: 'vi,en',
      },
      {
        outputDir: directory,
        track2V3LiveDiagnosticsEnabled: true,
        smartOverlayResult: {
          status: 'OK',
          sampledFrameCount: 60,
          selectedImageCount: 1,
          selectedImages: [crop],
          sampledFrames: [],
          selectorDiagnostics: { crops: [crop] },
          providerErrors: [],
          duration: 60,
        },
        localOcrProvider: async () => ({
          status: 'OK',
          called: true,
          provider: 'local_tesseract',
          textBlocks: blocks,
          providerErrors: [],
        }),
        track2V3AsrProvider: async () => {
          asrCalls += 1
          throw new Error('A recovered visual address candidate should stop ASR rescue')
        },
      },
    )

    assert.equal(result.metrics.ocrTextBlockCount, 25)
    assert.ok(result.metrics.candidateEvidenceCount >= 2)
    assert.ok(result.metrics.fusedAddressEvidenceCount >= 1)
    assert.ok(result.candidates.length >= 1)
    assert.ok(result.candidates.some((candidate) => /242 Độc Lập/u.test(candidate.addressFragment || candidate.displayText || '')))
    assert.equal(asrCalls, 0)
    assert.equal(result.asrFullAudioFallbackRan, false)
    const candidateArtifact = JSON.parse(await fs.readFile(
      path.join(directory, 'track2-v3-candidate-diagnostics.json'),
      'utf8',
    ))
    assert.ok(candidateArtifact.candidateCount >= 1)
  })

})
