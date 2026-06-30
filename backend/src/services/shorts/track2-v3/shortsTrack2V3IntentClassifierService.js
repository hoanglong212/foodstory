export function classifyShortsTrack2V3Intent(context = {}) {
  return {
    status: 'SKELETON',
    intent: 'UNKNOWN',
    sourceUrl: context.url || context.sourceUrl || null,
    videoId: context.videoId || context.metadata?.videoId || null,
    mustNotResolve: false,
    riskFlags: [],
  }
}
