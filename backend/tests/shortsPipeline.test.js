import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsPipeline } from '../src/services/shortsPipelineService.js'
import { runShortsTrack2Pipeline } from '../src/services/shortsTrack2PipelineService.js'
import { createLiveDeps, summarizeOutput } from '../scripts/debugShortsPipelineLive.js'
import { summarizeOcrInspection } from '../scripts/debugShortsTrack2OcrLive.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

function track1Success() {
  return {
    track: 'TRACK_1',
    reason: 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES',
    address: 'Hem 140 Tran Binh Trong, Phuong 2, Quan 5, TP. Ho Chi Minh',
    normalizedAddress: 'Hem 140 Tran Binh Trong, Phuong 2, Quan 5, TP. Ho Chi Minh',
    addressSource: 'description',
    sourceUrl: SHORTS_URL,
    videoId: 'abc123DEF45',
    metadata: {
      url: SHORTS_URL,
      videoId: 'abc123DEF45',
      title: 'Explicit address video',
    },
    stages: {
      router: {
        track: 'TRACK_1',
        reason: 'EXPLICIT_LABEL',
      },
    },
  }
}

function track1Fallback() {
  return {
    track: 'TRACK_2',
    reason: 'TITLE_ONLY',
    sourceUrl: SHORTS_URL,
    videoId: 'abc123DEF45',
    metadata: {
      url: SHORTS_URL,
      videoId: 'abc123DEF45',
      title: 'Title-only address candidate',
      description: '',
      metadataSource: {
        youtubeApi: true,
        shortsHtml: true,
      },
    },
    signals: [
      {
        source: 'title',
        rule: 'TITLE_ADDRESS_WITHOUT_EXACT_PREFIX',
        accepted: false,
        reason: 'TITLE_ONLY',
      },
    ],
    stages: {
      router: {
        track: 'TRACK_2',
        reason: 'TITLE_ONLY',
      },
      clean: null,
      places: null,
      confirm: null,
    },
  }
}

describe('shortsPipeline two-track orchestrator', () => {
  it('shortsPipeline returns Track 1 success directly and does not call Track 2', async () => {
    const expected = track1Success()
    let track2Calls = 0

    const output = await runShortsPipeline(SHORTS_URL, {
      runShortsTrack1Pipeline: async (url) => {
        assert.equal(url, SHORTS_URL)
        return expected
      },
      runShortsTrack2Pipeline: async () => {
        track2Calls += 1
        throw new Error('Track 2 should not run for Track 1 success')
      },
    })

    assert.equal(output, expected)
    assert.equal(track2Calls, 0)
    assert.equal(output.track, 'TRACK_1')
    assert.equal(output.address, expected.address)
    assert.equal(output.normalizedAddress, expected.normalizedAddress)
    assert.equal(output.addressSource, 'description')
    assert.equal(output.sourceUrl, SHORTS_URL)
    assert.equal(output.videoId, 'abc123DEF45')
  })

  it('debug summary for Track 1 output preserves Track 1 fields and omits Track 2 stages', () => {
    const summary = summarizeOutput(track1Success(), 123)

    assert.equal(summary.track, 'TRACK_1')
    assert.equal(summary.address, 'Hem 140 Tran Binh Trong, Phuong 2, Quan 5, TP. Ho Chi Minh')
    assert.equal(summary.normalizedAddress, 'Hem 140 Tran Binh Trong, Phuong 2, Quan 5, TP. Ho Chi Minh')
    assert.equal(summary.addressSource, 'description')
    assert.equal(summary.sourceUrl, SHORTS_URL)
    assert.equal(summary.videoId, 'abc123DEF45')
    assert.equal(summary.resolution, null)
    assert.deepEqual(summary.stagesPresent, ['router'])
    assert.equal(summary.stagesPresent.includes('track2'), false)
    assert.equal(summary.stagesPresent.includes('frameExtraction'), false)
  })

  it('Track 2 debug summaries expose bounded sampling, candidates, and evidence', () => {
    const candidate = {
      sourceType: 'ocr_frame',
      candidateAddress: '92C Cao Thang, District 3, HCMC',
      placeName: null,
      normalizedAddress: '92C Cao Thang, District 3, HCMC',
      formattedAddress: null,
      placeId: null,
      timestampSeconds: 12,
      frameIndex: 1,
      rawText: 'Address: 92C Cao Thang, District 3, HCMC',
      confidence: 0.9,
      riskFlags: [],
      verificationReason: 'PLACES_NOT_CONFIRMED',
      placeVerificationStatus: null,
      evidence: {
        source: 'ocr',
        text: 'Address: 92C Cao Thang, District 3, HCMC',
        timestampSeconds: 12,
        frameIndex: 1,
      },
    }
    const result = {
      track: 'TRACK_2',
      resolution: 'CANDIDATES',
      reason: 'PLACES_NOT_CONFIRMED',
      candidates: [candidate],
      stages: {
        frameExtraction: {
          durationSeconds: 150,
          maxDurationSeconds: 180,
          sampleStrategy: 'HEAD_MID_TAIL',
          sampledTimestamps: [12, 24, 42, 67.5, 82.5, 108, 126, 138],
          frameCount: 8,
          diagnostics: [],
        },
        ocr: { textBlocks: [], diagnostics: [] },
        candidateExtraction: { status: 'OK', reason: 'FOUND', candidates: [candidate], diagnostics: [] },
      },
      diagnostics: [],
    }

    const pipelineSummary = summarizeOutput(result)
    const ocrSummary = summarizeOcrInspection(result, { category: 'MOCK', url: SHORTS_URL })
    for (const summary of [pipelineSummary, ocrSummary]) {
      assert.equal(summary.sampleStrategy, 'HEAD_MID_TAIL')
      assert.equal(summary.candidateCount, 1)
      assert.equal(summary.candidates[0].sourceType, 'ocr_frame')
      assert.equal(summary.evidence[0].source, 'ocr')
      assert.equal(summary.sampledTimestamps.at(-1), 138)
    }
  })

  it('live debug deps include Track 2 OCR providers without affecting Track 1 short-circuit', async () => {
    const deps = createLiveDeps()
    const expected = track1Success()
    let track2Calls = 0

    try {
      const output = await runShortsPipeline(SHORTS_URL, {
        ...deps,
        runShortsTrack1Pipeline: async () => expected,
        runShortsTrack2Pipeline: async () => {
          track2Calls += 1
          throw new Error('Track 2 should not run for Track 1 success')
        },
      })

      assert.equal(typeof deps.track2FrameExtractor, 'function')
      assert.equal(typeof deps.track2OcrProvider, 'function')
      assert.equal(typeof deps.cleanupTrack2LiveProviders, 'function')
      assert.equal(output, expected)
      assert.equal(track2Calls, 0)
    } finally {
      await deps.cleanupTrack2LiveProviders?.()
    }
  })

  it('shortsPipeline calls Track 2 shell with full Track 1 fallback result', async () => {
    const fallback = track1Fallback()
    let receivedTrack1 = null

    const output = await runShortsPipeline(SHORTS_URL, {
      runShortsTrack1Pipeline: async () => fallback,
      runShortsTrack2Pipeline: async (track1Result, deps) => {
        receivedTrack1 = track1Result
        return runShortsTrack2Pipeline(track1Result, deps)
      },
    })

    assert.equal(receivedTrack1, fallback)
    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'OCR_FRAME_EXTRACTION_UNAVAILABLE')
    assert.equal(output.sourceUrl, fallback.sourceUrl)
    assert.equal(output.videoId, fallback.videoId)
    assert.equal(output.metadata, fallback.metadata)
    assert.equal(output.signals, fallback.signals)
    assert.equal(output.stages.track1, fallback.stages)
    assert.equal(output.stages.track1.router.reason, 'TITLE_ONLY')
    assert.deepEqual(output.stages.track2, {
      phase: 'PHASE_2_OCR_COLLECTION',
    })
  })

  it('shortsPipeline fallback path does not fetch metadata a second time in Track 2', async () => {
    const fallback = track1Fallback()
    let metadataFetchCalls = 0

    const output = await runShortsPipeline(SHORTS_URL, {
      runShortsTrack1Pipeline: async () => fallback,
      runShortsTrack2Pipeline: async (track1Result, deps) => {
        return runShortsTrack2Pipeline(track1Result, deps)
      },
      fetchShortsMetadata: async () => {
        metadataFetchCalls += 1
        throw new Error('metadata fetch should not run in Track 2')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(metadataFetchCalls, 0)
  })
})
