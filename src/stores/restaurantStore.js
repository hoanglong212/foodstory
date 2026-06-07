import { defineStore } from 'pinia'
import { getApiError } from '../services/api'
import { getRestaurants } from '../services/restaurantService'

function normalizeRestaurant(restaurant) {
  return {
    ...restaurant,
    id: Number(restaurant.id),
    latitude: Number(restaurant.latitude),
    longitude: Number(restaurant.longitude),
    avg_rating: Number(restaurant.avg_rating || 0),
  }
}

export const useRestaurantStore = defineStore('restaurants', {
  state: () => ({
    restaurants: [],
    loading: false,
    error: null,
    filters: {
      district: '',
      category: '',
      search: '',
      min_rating: '',
    },
  }),
  actions: {
    async fetchRestaurants(filters = this.filters) {
      this.loading = true
      this.error = null
      this.setFilters(filters)
      try {
        const response = await getRestaurants(this.filters)
        this.restaurants = (Array.isArray(response.data) ? response.data : []).map(
          normalizeRestaurant,
        )
        return this.restaurants
      } catch (error) {
        this.error = getApiError(error, 'Không thể tải danh sách nhà hàng.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    setFilters(filters = {}) {
      this.filters = {
        ...this.filters,
        ...filters,
      }
    },
  },
})
