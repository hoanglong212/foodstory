import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsPipeline } from '../src/services/shortsPipelineService.js'
import { runShortsTrack2Pipeline } from '../src/services/shortsTrack2PipelineService.js'

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

  it('shortsPipeline calls Track 2 shell with full Track 1 fallback result', async () => {
    const fallback = track1Fallback()
    let receivedTrack1 = null

    const output = await runShortsPipeline(SHORTS_URL, {
      track2V3Config: { enabled: false },
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
      track2V3Config: { enabled: false },
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
