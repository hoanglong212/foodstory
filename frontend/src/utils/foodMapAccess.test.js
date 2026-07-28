import { describe, expect, it } from 'vitest'
import {
  canUseFoodMapContributions,
  resolveInitialFoodMapMode,
} from './foodMapAccess'

describe('Food Map access policy', () => {
  it('opens guests in the public community mode', () => {
    expect(resolveInitialFoodMapMode('personal', false)).toBe('community')
    expect(resolveInitialFoodMapMode('stats', false)).toBe('community')
    expect(resolveInitialFoodMapMode('community', false)).toBe('community')
  })

  it('preserves authenticated route modes', () => {
    expect(resolveInitialFoodMapMode('personal', true)).toBe('personal')
    expect(resolveInitialFoodMapMode('stats', true)).toBe('stats')
  })

  it('keeps write actions authenticated', () => {
    expect(canUseFoodMapContributions(false)).toBe(false)
    expect(canUseFoodMapContributions(true)).toBe(true)
  })
})
