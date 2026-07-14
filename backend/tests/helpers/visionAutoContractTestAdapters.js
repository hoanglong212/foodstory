export function adaptVisionAutoResponse(response = {}) {
  const status = String(response?.status || '')
  if (status === 'review_candidates') {
    const reviewCandidates = (Array.isArray(response.reviewCandidates) ? response.reviewCandidates : [])
      .map((candidate) => ({
        id: candidate?.id || null,
        placeName: candidate?.placeName || null,
        address: candidate?.address || null,
        reviewRequired: true,
      }))
    return { state: 'review', reviewCandidates, mapTargets: [] }
  }
  if (['matched_place', 'external_place_found'].includes(status) && response.place) {
    return { state: 'resolved', place: response.place, mapTargets: [response.place] }
  }
  if (status === 'multi_place' && Array.isArray(response.places)) {
    return { state: 'multi', places: response.places, mapTargets: response.places }
  }
  if (status === 'not_found') return { state: 'not_found', mapTargets: [] }
  return { state: 'error', mapTargets: [] }
}

export function createVisionAutoRunGuard() {
  let current = 0
  return {
    start() {
      current += 1
      return current
    },
    isCurrent(runId) {
      return runId === current
    },
  }
}
