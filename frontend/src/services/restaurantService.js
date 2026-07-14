import api from './api'

export function getRestaurants(filters = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
  return api.get('/restaurants', { params })
}
