export async function runShortsTrack2V3CheapOcr(frameVariants = {}) {
  return {
    status: 'SKELETON_NOT_RUN',
    reason: 'TRACK2_V3_SKELETON_NO_OCR_PROVIDER',
    textBlocks: [],
    providerErrors: [],
    imageCount: frameVariants.variantCount ?? 0,
  }
}
