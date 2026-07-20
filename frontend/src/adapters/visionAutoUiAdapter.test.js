import { describe, expect, it } from 'vitest'
import { adaptVisionAutoResponse } from './visionAutoUiAdapter'

describe('Vision Auto public response adaptation', () => {
  it('keeps provider unavailability as a safe not-found outcome', () => {
    expect(adaptVisionAutoResponse({ status: 'not_found', reason: 'provider_unavailable' })).toMatchObject({
      state: 'not_found',
      reason: 'provider_unavailable',
      mapTargets: [],
    })
  })

  it('keeps review-required evidence non-geocoded and non-resolvable', () => {
    const adapted = adaptVisionAutoResponse({
      status: 'review_candidates',
      reviewCandidates: [{
        id: 'review-1',
        sourceType: 'review_candidate',
        placeName: 'Possible cafe',
        address: '10 Example Street, District 1',
        confidence: 0.71,
        reviewRequired: true,
        canAutoResolve: false,
      }],
    })

    expect(adapted.state).toBe('review')
    expect(adapted.reviewCandidates[0]).toMatchObject({
      reviewRequired: true,
      canAutoResolve: false,
      lat: null,
      lng: null,
    })
    expect(adapted.mapTargets).toEqual([])
  })

  it('adapts an ordinary not-found response without inventing candidates', () => {
    expect(adaptVisionAutoResponse({ status: 'not_found', reason: 'no_resolver_match' })).toMatchObject({
      state: 'not_found',
      primaryCandidate: null,
      possiblePlaces: [],
      reviewCandidates: [],
      mapTargets: [],
    })
  })
})
