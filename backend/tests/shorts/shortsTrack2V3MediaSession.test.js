import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { runShortsTrack2V3AsrFallback } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrFallbackService.js'
import { createShortsTrack2V3MediaSession } from '../../src/services/shorts/track2-v3/shortsTrack2V3MediaSessionService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempRoot(prefix = 'track2-v3-media-test-') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function config(overrides = {}) {
  return {
    mediaAcquisitionMaxAttempts: 2,
    mediaAcquisitionTimeoutMs: 5000,
    asrTimeoutMs: 5000,
    asrFallbackEnabled: true,
    asrModel: 'small',
    asrDevice: 'cpu',
    asrComputeType: 'int8',
    asrLanguage: 'vi',
    ...overrides,
  }
}

async function writeVideo(workDir, name = 'video.mp4') {
  const localVideoPath = path.join(workDir, name)
  await fs.writeFile(localVideoPath, 'injected local video')
  return localVideoPath
}

function sessionOptions(root, provider, overrides = {}) {
  return {
    context: {
      url: 'https://example.test/media-session',
      sourceUrl: 'https://example.test/media-session',
      videoId: 'media-session',
    },
    config: config(overrides.config),
    deps: {
      track2V3MediaAcquisitionProvider: provider,
      ...overrides.deps,
    },
    tmpRoot: root,
  }
}

describe('Track 2 V3 shared media session', () => {
  it('never mistakes yt-dlp info JSON for the acquired video file', async () => {
    const root = await tempRoot()
    const session = createShortsTrack2V3MediaSession({
      context: {
        url: 'https://www.youtube.com/shorts/info-json-video-selection',
        sourceUrl: 'https://www.youtube.com/shorts/info-json-video-selection',
      },
      config: config(),
      tmpRoot: root,
      deps: {
        env: {
          TRACK2_YTDLP_BIN: 'yt-dlp',
          TRACK2_FFMPEG_BIN: 'ffmpeg',
          TRACK2_FFPROBE_BIN: 'ffprobe',
        },
        track2V3MediaCommandRunner: async (_command, args) => {
          const outputIndex = args.indexOf('--output')
          assert.ok(args.includes('--write-info-json'))
          assert.ok(outputIndex >= 0)
          const outputTemplate = args[outputIndex + 1]
          const directory = path.dirname(outputTemplate)
          const prefix = path.basename(outputTemplate).split('.')[0]
          await fs.writeFile(path.join(directory, `${prefix}.info.json`), JSON.stringify({
            title: 'Review quán ăn',
            duration: 20,
          }))
          await fs.writeFile(path.join(directory, `${prefix}.mp4`), 'real video bytes')
          return { ok: true, exitCode: 0, stdout: '', stderr: '' }
        },
      },
    })

    const video = await session.ensureVideo({ consumer: 'visual_normal' })
    const metadata = await session.ensureMetadata()

    assert.equal(video.status, 'OK')
    assert.match(video.localVideoPath, /\.mp4$/u)
    assert.doesNotMatch(video.localVideoPath, /\.info\.json$/u)
    assert.equal(metadata.title, 'Review quán ăn')
    await session.cleanup()
  })

  it('falls back when a configured yt-dlp file exists but Windows cannot execute it', async () => {
    const root = await tempRoot()
    const blockedExecutable = path.join(root, 'blocked-yt-dlp.exe')
    await fs.writeFile(blockedExecutable, 'not executable')
    const commands = []
    const session = createShortsTrack2V3MediaSession({
      context: {
        url: 'https://www.youtube.com/shorts/fallback-binary',
        sourceUrl: 'https://www.youtube.com/shorts/fallback-binary',
      },
      config: config(),
      tmpRoot: root,
      deps: {
        env: {
          TRACK2_YTDLP_BIN: blockedExecutable,
          TRACK2_FFMPEG_BIN: 'ffmpeg',
          TRACK2_FFPROBE_BIN: 'ffprobe',
        },
        track2V3MediaCommandRunner: async (command, args) => {
          commands.push(command)
          if (command === blockedExecutable) {
            return { ok: false, exitCode: null, errorCode: 'EACCES', stdout: '', stderr: '' }
          }
          const outputTemplate = args[args.indexOf('--output') + 1]
          const prefix = path.basename(outputTemplate).split('.')[0]
          await fs.writeFile(path.join(path.dirname(outputTemplate), `${prefix}.mp4`), 'fallback video')
          return { ok: true, exitCode: 0, stdout: '', stderr: '' }
        },
      },
    })

    const video = await session.ensureVideo({ consumer: 'visual_normal' })
    assert.equal(video.status, 'OK')
    assert.equal(commands[0], blockedExecutable)
    assert.notEqual(commands[1], blockedExecutable)
    await session.cleanup()
  })

  it('reuses acquisition metadata for duration and intent bootstrap without a second metadata provider call', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    let metadataProviderCalls = 0
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        acquisitionCalls += 1
        return {
          status: 'OK',
          localVideoPath: await writeVideo(workDir),
          metadata: {
            title: 'Review quán ăn ở Tân Phú',
            description: 'Một quán trong video',
            channel: 'Food Reviewer',
            duration: 99.861,
            chapters: [{ title: 'Quán Hàu Quý Mập Phước Hải', start_time: 0, end_time: 8 }],
          },
        }
      },
      {
        deps: {
          track2V3MediaMetadataProvider: async () => {
            metadataProviderCalls += 1
            return { status: 'ERROR', reason: 'SHOULD_NOT_RUN' }
          },
        },
      },
    ))

    const duration = await session.ensureDuration()
    const metadata = await session.ensureMetadata()
    const diagnostics = session.diagnostics()

    assert.equal(acquisitionCalls, 1)
    assert.equal(metadataProviderCalls, 0)
    assert.equal(duration.status, 'OK')
    assert.equal(duration.durationSeconds, 99.861)
    assert.equal(metadata.status, 'OK')
    assert.equal(metadata.title, 'Review quán ăn ở Tân Phú')
    assert.deepEqual(metadata.chapters, [{
      title: 'Quán Hàu Quý Mập Phước Hải',
      startSeconds: 0,
      endSeconds: 8,
    }])
    assert.equal(metadata.source, 'acquisition_provider')
    assert.equal(diagnostics.mediaMetadataAvailable, true)
    assert.equal(diagnostics.mediaMetadataSource, 'acquisition_provider')
    await session.cleanup()
  })

  it('reuses a completed video acquisition for repeated ensureVideo calls', async () => {
    const root = await tempRoot()
    let calls = 0
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        calls += 1
        return { status: 'OK', localVideoPath: await writeVideo(workDir) }
      },
    ))

    const first = await session.ensureVideo({ consumer: 'visual_normal' })
    const second = await session.ensureVideo({ consumer: 'visual_adaptive' })

    assert.equal(calls, 1)
    assert.equal(first.localVideoPath, second.localVideoPath)
    assert.equal(session.diagnostics().mediaReuseCount, 1)
    await session.cleanup()
  })

  it('coalesces concurrent ensureVideo calls into one in-flight acquisition', async () => {
    const root = await tempRoot()
    let calls = 0
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        calls += 1
        await gate
        return { status: 'OK', localVideoPath: await writeVideo(workDir) }
      },
    ))

    const firstPromise = session.ensureVideo({ consumer: 'visual_normal' })
    const secondPromise = session.ensureVideo({ consumer: 'visual_adaptive' })
    release()
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    assert.equal(calls, 1)
    assert.equal(first.localVideoPath, second.localVideoPath)
    assert.equal(session.diagnostics().mediaReuseCount, 1)
    await session.cleanup()
  })

  it('reuses the visual local video for ASR audio without another acquisition', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    let audioCalls = 0
    let acquiredVideoPath
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        acquisitionCalls += 1
        acquiredVideoPath = await writeVideo(workDir)
        return { status: 'OK', localVideoPath: acquiredVideoPath }
      },
      {
        deps: {
          track2V3MediaAudioExtractor: async ({ localVideoPath, outputPath }) => {
            audioCalls += 1
            assert.equal(localVideoPath, acquiredVideoPath)
            await fs.writeFile(outputPath, 'injected wav')
            return { status: 'OK', audioPath: outputPath }
          },
        },
      },
    ))

    await session.ensureVideo({ consumer: 'visual_normal' })
    const audio = await session.ensureAudio()
    const diagnostics = session.diagnostics()

    assert.equal(audio.status, 'OK')
    assert.equal(acquisitionCalls, 1)
    assert.equal(audioCalls, 1)
    assert.equal(diagnostics.mediaVisualUsedSharedVideo, true)
    assert.equal(diagnostics.mediaAsrUsedSharedVideo, true)
    assert.equal(diagnostics.mediaAsrIndependentDownloadCount, 0)
    assert.equal(diagnostics.mediaSecondDownloadCount, 0)
    await session.cleanup()
  })

  it('extracts and accounts for a bounded ASR opportunity window from shared media', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    const seenWindows = []
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        acquisitionCalls += 1
        return { status: 'OK', localVideoPath: await writeVideo(workDir) }
      },
      {
        deps: {
          track2V3MediaAudioExtractor: async ({
            outputPath,
            startSeconds,
            endSeconds,
            windowId,
            windowed,
          }) => {
            seenWindows.push({ startSeconds, endSeconds, windowId, windowed })
            await fs.writeFile(outputPath, 'windowed audio')
            return { status: 'OK', audioPath: outputPath }
          },
        },
      },
    ))

    const audio = await session.ensureAudioWindow({
      startSeconds: 26,
      endSeconds: 43,
      windowId: 'episode-007-window',
    })
    const diagnostics = session.diagnostics()

    assert.equal(audio.status, 'OK')
    assert.equal(audio.windowed, true)
    assert.equal(audio.audioDurationSeconds, 17)
    assert.equal(acquisitionCalls, 1)
    assert.deepEqual(seenWindows, [{
      startSeconds: 26,
      endSeconds: 43,
      windowId: 'episode-007-window',
      windowed: true,
    }])
    assert.equal(diagnostics.mediaAudioWindowExtractionCalled, true)
    assert.equal(diagnostics.mediaAudioWindowExtractionCount, 1)
    assert.equal(diagnostics.mediaAudioWindowSecondsProcessed, 17)
    assert.equal(diagnostics.mediaAsrUsedSharedVideo, true)
    await session.cleanup()
  })

  it('lazily acquires media when ASR is the first consumer', async () => {
    const root = await tempRoot()
    let calls = 0
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        calls += 1
        return { status: 'OK', localVideoPath: await writeVideo(workDir) }
      },
      {
        deps: {
          track2V3MediaAudioExtractor: async ({ outputPath }) => {
            await fs.writeFile(outputPath, 'audio')
            return { status: 'OK', audioPath: outputPath }
          },
        },
      },
    ))

    assert.equal(session.diagnostics().mediaAcquisitionCalled, false)
    assert.equal((await session.ensureAudio()).status, 'OK')
    assert.equal(calls, 1)
    assert.deepEqual(session.diagnostics().mediaConsumers, ['asr'])
    await session.cleanup()
  })

  it('records a bounded transient failure followed by fallback-format success', async () => {
    const root = await tempRoot()
    const strategies = []
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ strategy, workDir }) => {
        strategies.push(strategy)
        if (strategy === 'PRIMARY_FORMAT') {
          return { status: 'ERROR', reason: 'MEDIA_ACQUISITION_FAILED' }
        }
        return { status: 'OK', localVideoPath: await writeVideo(workDir, 'fallback.webm') }
      },
    ))

    assert.equal((await session.ensureVideo()).status, 'OK')
    const diagnostics = session.diagnostics()
    assert.deepEqual(strategies, ['PRIMARY_FORMAT', 'FALLBACK_FORMAT'])
    assert.equal(diagnostics.mediaAcquisitionAttemptCount, 2)
    assert.equal(diagnostics.mediaAcquisitionSuccessfulStrategy, 'FALLBACK_FORMAT')
    assert.equal(diagnostics.mediaProviderErrors[0].code, 'MEDIA_ACQUISITION_FAILED')
    await session.cleanup()
  })

  it('does not retry a deterministic unavailable-media failure', async () => {
    const root = await tempRoot()
    let calls = 0
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async () => {
        calls += 1
        return { status: 'ERROR', reason: 'MEDIA_UNAVAILABLE' }
      },
    ))

    const result = await session.ensureVideo()
    assert.equal(result.status, 'ERROR')
    assert.equal(calls, 1)
    assert.equal(session.diagnostics().mediaAcquisitionAttemptCount, 1)
    await session.cleanup()
  })

  it('shares a final media failure with ASR without classifying it as no-address speech', async () => {
    const root = await tempRoot()
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async () => ({ status: 'ERROR', reason: 'MEDIA_UNAVAILABLE' }),
    ))
    const visual = await session.ensureVideo({ consumer: 'visual_normal' })
    const audio = await session.ensureAudio()
    const fallback = await runShortsTrack2V3AsrFallback({
      config: config(),
      existingCandidates: [],
      deps: {
        track2V3AsrProvider: async () => ({
          status: 'ERROR',
          reason: audio.reason,
          called: true,
          providerErrors: audio.providerErrors,
        }),
      },
    })

    assert.notEqual(visual.status, 'OK')
    assert.equal(audio.reason, 'ASR_MEDIA_ACQUISITION_FAILED')
    assert.equal(fallback.asrFallbackReason, 'ASR_MEDIA_ACQUISITION_FAILED')
    assert.equal(fallback.asrEvidenceBucket, null)
    assert.equal(fallback.candidateCountFromAsr, 0)
    await session.cleanup()
  })

  it('keeps audio extraction failure distinct while the shared video remains available', async () => {
    const root = await tempRoot()
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => ({
        status: 'OK',
        localVideoPath: await writeVideo(workDir),
      }),
      {
        deps: {
          track2V3MediaAudioExtractor: async () => ({
            status: 'ERROR',
            reason: 'ASR_AUDIO_EXTRACTION_FAILED',
          }),
        },
      },
    ))

    const audio = await session.ensureAudio()
    const diagnostics = session.diagnostics()
    assert.equal(audio.reason, 'ASR_AUDIO_EXTRACTION_FAILED')
    assert.equal(diagnostics.mediaVideoAvailable, true)
    assert.equal(diagnostics.mediaAudioExtractionStatus, 'ERROR')
    await session.cleanup()
  })

  it('removes session-owned video and audio files during cleanup', async () => {
    const root = await tempRoot()
    let videoPath
    let audioPath
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async ({ workDir }) => {
        videoPath = await writeVideo(workDir)
        return { status: 'OK', localVideoPath: videoPath }
      },
      {
        deps: {
          track2V3MediaAudioExtractor: async ({ outputPath }) => {
            audioPath = outputPath
            await fs.writeFile(outputPath, 'audio')
            return { status: 'OK', audioPath: outputPath }
          },
        },
      },
    ))

    await session.ensureAudio()
    assert.equal(await fs.stat(videoPath).then(() => true), true)
    assert.equal(await fs.stat(audioPath).then(() => true), true)
    await session.cleanup()
    assert.equal(await fs.access(videoPath).then(() => true).catch(() => false), false)
    assert.equal(await fs.access(audioPath).then(() => true).catch(() => false), false)
  })

  it('does not acquire media or invoke ASR when an existing candidate is rescue sufficient', async () => {
    const root = await tempRoot()
    let acquisitionCalls = 0
    let asrCalls = 0
    const session = createShortsTrack2V3MediaSession(sessionOptions(
      root,
      async () => {
        acquisitionCalls += 1
        return { status: 'ERROR' }
      },
    ))
    const result = await runShortsTrack2V3AsrFallback({
      config: config(),
      existingCandidates: [{
        id: 'cand:existing',
        type: 'METADATA_ADDRESS',
        addressFragment: '160 Phạm Phú Thứ, P.4, Q.6',
        houseNumberAlternatives: ['160'],
        riskFlags: ['REVIEW_ONLY'],
      }],
      deps: {
        mediaSession: session,
        track2V3AsrProvider: async () => { asrCalls += 1 },
      },
    })

    assert.equal(result.asrFallbackReason, 'RESCUE_SUFFICIENT')
    assert.equal(acquisitionCalls, 0)
    assert.equal(asrCalls, 0)
    assert.equal(session.diagnostics().mediaAcquisitionCalled, false)
    await session.cleanup()
  })
})
