import { runShortsTrack1Pipeline as defaultRunShortsTrack1Pipeline } from './shortsTrack1PipelineService.js'
import { runShortsTrack2Pipeline as defaultRunShortsTrack2Pipeline } from './shortsTrack2PipelineService.js'
import { getShortsTrack2V3Config } from './shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3Pipeline as defaultRunShortsTrack2V3Pipeline } from './shorts/track2-v3/shortsTrack2V3PipelineService.js'

function track2V3ContextFromTrack1Result(track1Result = {}) {
  const metadata = track1Result.metadata || {}
  return {
    url: track1Result.sourceUrl || track1Result.url || metadata.url || null,
    sourceUrl: track1Result.sourceUrl || track1Result.url || metadata.url || null,
    videoId: track1Result.videoId || metadata.videoId || null,
    metadata,
    title: metadata.title || track1Result.title || '',
    description: metadata.description || metadata.descriptionRawFromYoutube || track1Result.description || '',
    channelTitle: metadata.channelTitle || '',
    duration: metadata.duration || metadata.durationSeconds || null,
    track1Result,
    previousTrack2: track1Result,
  }
}

export async function runShortsPipeline(url, deps = {}) {
  const runTrack1 = deps.runShortsTrack1Pipeline || defaultRunShortsTrack1Pipeline
  const runTrack2 = deps.runShortsTrack2Pipeline || defaultRunShortsTrack2Pipeline
  const runTrack2V3 = deps.runShortsTrack2V3Pipeline || defaultRunShortsTrack2V3Pipeline

  const track1Result = await runTrack1(url, deps)

  if (track1Result?.track === 'TRACK_1') {
    return track1Result
  }

  if (track1Result?.track === 'TRACK_2') {
    const track2V3Config = deps.track2V3Config || getShortsTrack2V3Config(deps.env || process.env)
    if (track2V3Config.enabled) {
      return runTrack2V3(track2V3ContextFromTrack1Result(track1Result), {
        ...deps,
        track2V3Config,
      })
    }

    return runTrack2(track1Result, deps)
  }

  throw new Error(`Invalid Track 1 result track: ${track1Result?.track || 'MISSING_TRACK'}`)
}

export default {
  runShortsPipeline,
}
