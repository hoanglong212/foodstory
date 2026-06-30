export function buildShortsTrack2V3FrameVariants(framePlan = {}, config = {}) {
  return {
    status: 'SKELETON',
    variants: [],
    variantCount: 0,
    maxOcrImages: config.maxOcrImages ?? 0,
    plannedFrameCount: framePlan.plannedFrameCount ?? 0,
  }
}
