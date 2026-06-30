import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rankPlaceNameCandidates } from '../src/services/shortsTrack2PlaceCandidateRankerService.js'

function signals(overrides = {}) {
  return {
    signals: {
      placeNames: ['Quan Com Ba Hoa'],
      areas: ['Quan 5'],
      dishes: ['com'],
      ...overrides,
    },
  }
}

function searchResult(candidates) {
  return {
    status: 'OK',
    rawCandidates: candidates,
  }
}

function candidate(overrides = {}) {
  return {
    placeId: 'place-1',
    displayName: 'Quan Com Ba Hoa',
    formattedAddress: '12 Duong A, Quan 5, Ho Chi Minh',
    primaryType: 'restaurant',
    businessStatus: 'OPERATIONAL',
    foundByStrategies: ['place_district_city', 'place_area'],
    queryCount: 2,
    ...overrides,
  }
}

describe('shortsTrack2PlaceCandidateRanker', () => {
  it('strong name+area match gets high score', () => {
    const result = rankPlaceNameCandidates(searchResult([candidate()]), signals(), { status: 'OK' })

    assert.equal(result.status, 'OK')
    assert.ok(result.rankedCandidates[0].score >= 0.85)
    assert.equal(result.rankedCandidates[0].scoreBreakdown.area, 1)
  })

  it('no name overlap penalized', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ displayName: 'Different Cafe' }),
    ]), signals(), { status: 'OK' })

    assert.ok(result.rankedCandidates[0].score < 0.85)
    assert.ok(result.rankedCandidates[0].riskFlags.includes('NO_NAME_OVERLAP'))
  })

  it('no area match penalized', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ formattedAddress: '12 Duong A, Quan 1, Ho Chi Minh' }),
    ]), signals(), { status: 'OK' })

    assert.ok(result.rankedCandidates[0].score < 0.85)
    assert.ok(result.rankedCandidates[0].riskFlags.includes('NO_AREA_MATCH'))
  })

  it('multiple close candidates returns NEEDS_REVIEW or not resolved', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ placeId: 'place-1' }),
      candidate({ placeId: 'place-2', formattedAddress: '14 Duong B, Quan 5, Ho Chi Minh' }),
    ]), signals(), { status: 'OK' })

    assert.equal(result.status, 'NEEDS_REVIEW')
  })

  it('top score below 0.85 does not resolve', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ displayName: 'Ba Hoa', foundByStrategies: ['plain_place_area'], queryCount: 1 }),
    ]), signals(), { status: 'OK' })

    assert.ok(result.rankedCandidates[0].score < 0.85)
  })

  it('gap below 0.15 does not resolve', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ placeId: 'place-1' }),
      candidate({ placeId: 'place-2', displayName: 'Quan Com Ba Hoa', formattedAddress: '15 Duong C, Quan 5' }),
    ]), signals(), { status: 'OK' })

    assert.equal(result.status, 'NEEDS_REVIEW')
  })

  it('closed permanently penalized', () => {
    const result = rankPlaceNameCandidates(searchResult([
      candidate({ businessStatus: 'CLOSED_PERMANENTLY' }),
    ]), signals(), { status: 'OK' })

    assert.ok(result.rankedCandidates[0].score < 0.85)
    assert.ok(result.rankedCandidates[0].riskFlags.includes('CLOSED_PERMANENTLY'))
  })
})
