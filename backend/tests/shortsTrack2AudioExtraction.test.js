import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractShortsAudioForAsr } from '../src/services/shortsTrack2AudioExtractionService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

function track1Fallback(overrides = {}) {
  return {
    track: 'TRACK_2',
    sourceUrl: SHORTS_URL,
    videoId: 'abc123DEF45',
    metadata: {
      url: SHORTS_URL,
      videoId: 'abc123DEF45',
      durationSeconds: 45,
    },
    ...overrides,
  }
}

describe('shortsTrack2AudioExtraction', () => {
  it('missing sourceUrl returns REJECTED / MISSING_SOURCE_URL', async () => {
    const result = await extractShortsAudioForAsr({
      track: 'TRACK_2',
      metadata: {},
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.reason, 'MISSING_SOURCE_URL')
    assert.equal(result.audio, null)
  })

  it('metadata duration > 60s returns REJECTED / VIDEO_TOO_LONG', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback({
      metadata: {
        url: SHORTS_URL,
        durationSeconds: 61,
      },
    }), {
      track2AudioExtractor: async () => {
        throw new Error('provider should not run')
      },
    })

    assert.equal(result.status, 'REJECTED')
    assert.equal(result.reason, 'VIDEO_TOO_LONG')
    assert.equal(result.durationSeconds, 61)
    assert.equal(result.maxDurationSeconds, 60)
    assert.equal(result.budgetMs, 30000)
    assert.equal('limitBytes' in result.diagnostics[0], false)
    assert.equal(result.diagnostics[0].maxDurationSeconds, 60)
  })

  it('missing provider returns UNAVAILABLE without requiring real binaries', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback())

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'AUDIO_EXTRACTOR_UNAVAILABLE')
  })

  it('injected provider success returns OK with sanitized audio', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback(), {
      track2AudioExtractor: async ({ sourceUrl, videoId, limits }) => {
        assert.equal(sourceUrl, SHORTS_URL)
        assert.equal(videoId, 'abc123DEF45')
        assert.equal(limits.maxVideoDurationSeconds, 60)
        return {
          status: 'OK',
          reason: 'MOCK_AUDIO',
          audio: {
            audioPath: 'C:/tmp/shorts-audio.mp3',
            mimeType: 'audio/mpeg',
            sizeBytes: 2048,
            durationSeconds: 12,
            base64: 'not-allowed',
          },
        }
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'MOCK_AUDIO')
    assert.deepEqual(result.audio, {
      audioPath: 'C:/tmp/shorts-audio.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 2048,
      durationSeconds: 12,
    })
    assert.equal(JSON.stringify(result).includes('not-allowed'), false)
  })

  it('injected provider throwing returns ERROR, not throw', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback(), {
      track2AudioExtractor: async () => {
        throw new Error('mock extractor failed')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'AUDIO_EXTRACTION_PROVIDER_ERROR')
    assert.equal(result.audio, null)
  })

  it('aborts a non-resolving audio provider within budget and runs cleanup', async () => {
    let signalObserved = false
    let cleanupCalls = 0
    const result = await extractShortsAudioForAsr(track1Fallback(), {
      track2AudioExtractionBudgetMs: 25,
      cleanupTrack2AudioProviders: async () => {
        cleanupCalls += 1
      },
      track2AudioExtractor: async ({ signal }) => new Promise(() => {
        signal.addEventListener('abort', () => {
          signalObserved = true
        }, { once: true })
      }),
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'AUDIO_EXTRACTION_TIMEOUT')
    assert.equal(result.budgetMs, 25)
    assert.equal(signalObserved, true)
    assert.equal(cleanupCalls, 1)
  })

  it('oversized audio is rejected with a controlled result', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback(), {
      track2AudioExtractor: async () => ({
        status: 'OK',
        audio: {
          audioPath: 'C:/tmp/large-audio.mp3',
          sizeBytes: 17 * 1024 * 1024,
        },
      }),
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.audio, null)
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'AUDIO_SIZE_LIMIT_EXCEEDED'))
  })

  it('output never includes raw audio bytes/base64', async () => {
    const result = await extractShortsAudioForAsr(track1Fallback(), {
      track2AudioExtractor: async () => ({
        status: 'OK',
        audio: {
          audioPath: 'C:/tmp/shorts-audio.mp3',
          sizeBytes: 1024,
          rawBytes: Buffer.from('audio'),
          base64: 'AAAA',
        },
        diagnostics: [{ message: 'safe diagnostic', base64: 'BBBB' }],
      }),
    })

    const json = JSON.stringify(result)
    assert.equal(json.includes('AAAA'), false)
    assert.equal(json.includes('BBBB'), false)
    assert.equal(json.includes('rawBytes'), false)
    assert.equal(json.includes('base64'), false)
  })
})
