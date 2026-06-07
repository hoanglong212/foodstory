import api from './api'
import { useAuthStore } from '../stores/authStore'

function authConfig(config = {}) {
  const authStore = useAuthStore()
  return {
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${authStore.token}`,
    },
  }
}

export function getFoodSpots(filters = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
  return api.get('/food-spots', authConfig({ params }))
}

export function getPublicFoodSpots(filters = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
  return api.get('/food-spots/public', { params })
}

export function createFoodSpot(data) {
  return api.post('/food-spots', data, authConfig())
}

export function updateFoodSpot(id, data) {
  return api.put(`/food-spots/${id}`, data, authConfig())
}

export function deleteFoodSpot(id) {
  return api.delete(`/food-spots/${id}`, authConfig())
}
