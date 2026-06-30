export function planShortsTrack2V3Frames(context = {}, config = {}) {
  return {
    status: 'SKELETON',
    sourceUrl: context.url || context.sourceUrl || null,
    videoId: context.videoId || context.metadata?.videoId || null,
    plannedFrames: [],
    plannedFrameCount: 0,
    maxFrames: config.maxFrames ?? 0,
    cheapFrameCount: config.cheapFrameCount ?? 0,
  }
}
