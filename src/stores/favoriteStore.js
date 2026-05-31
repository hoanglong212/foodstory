import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'

export const useFavoriteStore = defineStore('favorites', {
  state: () => ({
    favoriteList: [],
    favoriteIds: [],
    error: '',
  }),
  actions: {
    async fetchFavorites() {
      try {
        const response = await api.get('/favorites')
        this.favoriteList = response.data.items
        this.favoriteIds = response.data.items.map((item) => item.id)
      } catch (error) {
        this.error = getApiError(error, 'Unable to load favorites.')
      }
    },
    async addFavorite(recipeId) {
      try {
        await api.post(`/favorites/${recipeId}`)
        if (!this.favoriteIds.includes(recipeId)) {
          this.favoriteIds.push(recipeId)
        }
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to save recipe.'))
      }
    },
    async removeFavorite(recipeId) {
      try {
        await api.delete(`/favorites/${recipeId}`)
        this.favoriteIds = this.favoriteIds.filter((id) => id !== recipeId)
        this.favoriteList = this.favoriteList.filter((item) => item.id !== recipeId)
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to remove favorite.'))
      }
    },
  },
})
