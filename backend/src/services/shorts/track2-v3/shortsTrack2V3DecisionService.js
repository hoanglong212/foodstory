export function decideShortsTrack2V3Result({ intent = {} } = {}) {
  return {
    track: 'TRACK_2_V3',
    resolution: 'UNRESOLVED',
    reason: 'TRACK2_V3_SKELETON_NO_VISUAL_PASS_YET',
    intent: intent.intent || 'UNKNOWN',
    mustNotResolve: Boolean(intent.mustNotResolve),
    intentReason: intent.reason || 'NO_STRONG_INTENT_SIGNAL',
    resolvedPlace: null,
  }
}
