import { describe, expect, it } from 'vitest'
import router from './index'

describe('Food Map route access', () => {
  it('exposes the read-only preview without making authenticated routes public', () => {
    const foodMap = router.getRoutes().find((route) => route.name === 'FoodMap')
    const profile = router.getRoutes().find((route) => route.name === 'profile')

    expect(foodMap.meta.guestPreview).toBe(true)
    expect(foodMap.meta.requiresAuth).toBeUndefined()
    expect(profile.meta.requiresAuth).toBe(true)
  })

  it('provides a document title for every routed page', () => {
    const routes = router.getRoutes()

    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((route) => typeof route.meta.title === 'string' && route.meta.title.length > 0)).toBe(true)
  })
})
