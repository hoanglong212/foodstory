import { describe, expect, it } from 'vitest'
import {
  buildRecipeFilterQuery,
  normalizeRecipeFilterQuery,
  recipeFilterStatesEqual,
} from './recipeFilterQuery'

describe('recipe filter query state', () => {
  it('normalizes deep-link filters and rejects unsupported sorts', () => {
    expect(
      normalizeRecipeFilterQuery({
        search: '  salmon  ',
        category: ' Seafood ',
        tag: ['Healthy'],
        sort: 'UNKNOWN',
      }),
    ).toEqual({
      search: 'salmon',
      category: 'Seafood',
      tag: 'all',
      sort: 'newest',
    })
  })

  it('keeps only active filters in a canonical URL query', () => {
    expect(
      buildRecipeFilterQuery({
        search: '',
        category: 'Seafood',
        tag: 'all',
        sort: 'rating',
      }),
    ).toEqual({ category: 'Seafood', sort: 'rating' })
  })

  it('compares normalized filter states for route synchronization', () => {
    expect(
      recipeFilterStatesEqual(
        { category: ' Seafood ', sort: 'RATING' },
        { search: '', category: 'Seafood', tag: 'all', sort: 'rating' },
      ),
    ).toBe(true)
  })
})
