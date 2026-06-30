export function fuseShortsTrack2V3Evidence({ evidence = [], candidates = [] } = {}) {
  return {
    status: 'PASS_THROUGH',
    evidence,
    candidates,
    fusedEvidence: Array.isArray(evidence) ? evidence : [],
  }
}
