import { defineStore } from 'pinia'
import {
  createFoodSpot,
  deleteFoodSpot,
  getFoodSpots,
  getPublicFoodSpots,
  updateFoodSpot,
} from '../services/foodSpotService'
import { getApiError } from '../services/api'

function normalizeSpot(spot) {
  return {
    ...spot,
    id: Number(spot.id),
    user_id: spot.user_id == null ? null : Number(spot.user_id),
    recipe_id: spot.recipe_id ? Number(spot.recipe_id) : null,
    latitude: Number(spot.latitude),
    longitude: Number(spot.longitude),
    rating: spot.rating ? Number(spot.rating) : null,
  }
}

export const useFoodSpotStore = defineStore('foodSpots', {
  state: () => ({
    spots: [],
    communitySpots: [],
    loading: false,
    communityLoading: false,
    error: null,
    communityError: null,
    selectedSpot: null,
  }),
  actions: {
    async fetchSpots(filters = {}) {
      this.loading = true
      this.error = null
      try {
        const response = await getFoodSpots(filters)
        this.spots = (Array.isArray(response.data) ? response.data : []).map(normalizeSpot)
        if (this.selectedSpot) {
          this.selectedSpot =
            this.spots.find((spot) => spot.id === this.selectedSpot.id) || null
        }
        return this.spots
      } catch (error) {
        this.error = getApiError(error, 'The food map could not be loaded.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    async fetchCommunitySpots(filters = {}) {
      this.communityLoading = true
      this.communityError = null
      try {
        const response = await getPublicFoodSpots(filters)
        this.communitySpots = (Array.isArray(response.data) ? response.data : []).map(normalizeSpot)
        return this.communitySpots
      } catch (error) {
        this.communityError = getApiError(error, 'Community places could not be loaded.')
        throw new Error(this.communityError)
      } finally {
        this.communityLoading = false
      }
    },
    async addSpot(data) {
      this.loading = true
      this.error = null
      try {
        const response = await createFoodSpot(data)
        const spot = normalizeSpot(response.data)
        this.spots = [spot, ...this.spots]
        this.selectedSpot = spot
        return spot
      } catch (error) {
        this.error = getApiError(error, 'The place could not be added.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    async updateSpot(id, data) {
      this.loading = true
      this.error = null
      try {
        const response = await updateFoodSpot(id, data)
        const spot = normalizeSpot(response.data)
        this.spots = this.spots.map((item) => (item.id === spot.id ? spot : item))
        this.selectedSpot = spot
        return spot
      } catch (error) {
        this.error = getApiError(error, 'The place could not be updated.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    async removeSpot(id) {
      this.loading = true
      this.error = null
      try {
        await deleteFoodSpot(id)
        this.spots = this.spots.filter((spot) => spot.id !== Number(id))
        if (this.selectedSpot?.id === Number(id)) {
          this.selectedSpot = null
        }
        return true
      } catch (error) {
        this.error = getApiError(error, 'The place could not be deleted.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    setSelectedSpot(spot) {
      this.selectedSpot = spot || null
    },
  },
})
