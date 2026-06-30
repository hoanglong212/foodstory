export function fuseShortsTrack2V3Evidence({ evidence = [], candidates = [] } = {}) {
  return {
    status: 'SKELETON',
    evidence,
    candidates,
    fusedEvidence: [],
  }
}
