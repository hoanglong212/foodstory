import { runShortsTrack1Pipeline as defaultRunShortsTrack1Pipeline } from './shortsTrack1PipelineService.js'
import { runShortsTrack2Pipeline as defaultRunShortsTrack2Pipeline } from './shortsTrack2PipelineService.js'

export async function runShortsPipeline(url, deps = {}) {
  const runTrack1 = deps.runShortsTrack1Pipeline || defaultRunShortsTrack1Pipeline
  const runTrack2 = deps.runShortsTrack2Pipeline || defaultRunShortsTrack2Pipeline

  const track1Result = await runTrack1(url, deps)

  if (track1Result?.track === 'TRACK_1') {
    return track1Result
  }

  if (track1Result?.track === 'TRACK_2') {
    return runTrack2(track1Result, deps)
  }

  throw new Error(`Invalid Track 1 result track: ${track1Result?.track || 'MISSING_TRACK'}`)
}

export default {
  runShortsPipeline,
}
