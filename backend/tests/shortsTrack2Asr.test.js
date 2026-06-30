import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runAsrOnShortsAudio } from '../src/services/shortsTrack2AsrService.js'

function audioResult(overrides = {}) {
  return {
    status: 'OK',
    reason: 'MOCK_AUDIO',
    audio: {
      audioPath: 'C:/tmp/shorts-audio.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 4096,
      durationSeconds: 12,
    },
    diagnostics: [],
    ...overrides,
  }
}

describe('shortsTrack2Asr', () => {
  it('no audio returns NO_AUDIO', async () => {
    const result = await runAsrOnShortsAudio({
      status: 'UNAVAILABLE',
      audio: null,
    })

    assert.equal(result.status, 'NO_AUDIO')
    assert.equal(result.reason, 'NO_AUDIO')
    assert.equal(result.transcript, null)
  })

  it('missing ASR provider returns UNAVAILABLE', async () => {
    const result = await runAsrOnShortsAudio(audioResult())

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'ASR_PROVIDER_UNAVAILABLE')
  })

  it('preserves UNAVAILABLE returned by the ASR provider', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => ({
        status: 'UNAVAILABLE',
        reason: 'ASR_PROVIDER_UNAVAILABLE',
        diagnostics: [{ code: 'ASR_PROVIDER_UNAVAILABLE' }],
        providerWarnings: [{ code: 'SPEECH_NOT_CONFIGURED' }],
      }),
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'ASR_PROVIDER_UNAVAILABLE')
    assert.equal(result.transcript, null)
    assert.equal(result.diagnostics[0].code, 'ASR_PROVIDER_UNAVAILABLE')
    assert.equal(result.providerWarnings[0].code, 'SPEECH_NOT_CONFIGURED')
  })

  it('preserves ERROR returned by the ASR provider', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => ({
        status: 'ERROR',
        reason: 'ASR_PROVIDER_ERROR',
        diagnostics: [{ code: 'ASR_PROVIDER_HTTP_ERROR' }],
      }),
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'ASR_PROVIDER_ERROR')
    assert.equal(result.transcript, null)
    assert.equal(result.diagnostics[0].code, 'ASR_PROVIDER_HTTP_ERROR')
  })

  it('returns controlled OK / NO_TRANSCRIPT when the provider succeeds without transcript', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => ({
        status: 'OK',
        reason: 'NO_TRANSCRIPT',
        text: '',
        segments: [],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'NO_TRANSCRIPT')
    assert.equal(result.transcript, null)
  })

  it('injected ASR provider success returns OK with sanitized transcript', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async ({ audio }) => {
        assert.equal(audio.audioPath, 'C:/tmp/shorts-audio.mp3')
        return {
          text: 'địa chỉ là 92C Cao Thắng, Phường 4, Quận 3, TP.HCM',
          language: 'vi',
          confidence: 1.5,
          segments: [
            {
              startSeconds: 2,
              endSeconds: 4,
              text: 'địa chỉ là 92C Cao Thắng',
              confidence: -1,
            },
            {
              startSeconds: 4,
              endSeconds: 8,
              text: '',
              confidence: 0.8,
            },
          ],
          diagnostics: [{ message: 'safe' }],
        }
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'ASR_TRANSCRIPT_COLLECTED')
    assert.equal(result.transcript.text, 'địa chỉ là 92C Cao Thắng, Phường 4, Quận 3, TP.HCM')
    assert.equal(result.transcript.language, 'vi')
    assert.equal(result.transcript.confidence, 1)
    assert.deepEqual(result.transcript.segments, [
      {
        startSeconds: 2,
        endSeconds: 4,
        text: 'địa chỉ là 92C Cao Thắng',
        confidence: 0,
      },
    ])
  })

  it('injected ASR provider throwing returns ERROR, not throw', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => {
        throw new Error('asr failed')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'ASR_PROVIDER_ERROR')
    assert.equal(result.transcript, null)
  })

  it('empty transcript is handled as a controlled OK result', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => ({
        text: '',
        segments: [{ text: '' }],
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.reason, 'NO_TRANSCRIPT')
    assert.equal(result.transcript, null)
  })

  it('does not extract addresses from transcript text', async () => {
    const result = await runAsrOnShortsAudio(audioResult(), {
      track2AsrProvider: async () => ({
        text: 'địa chỉ là 92C Cao Thắng, Phường 4, Quận 3, TP.HCM',
        confidence: 0.9,
      }),
    })

    assert.equal(result.status, 'OK')
    assert.equal('candidates' in result, false)
    assert.equal('address' in result, false)
  })
})
