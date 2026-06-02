import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'
import { useUiStore } from './uiStore'

let favoritesFetchRequestId = 0
let favoritesSessionVersion = 0

function toFavoriteListItem(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    image_url: recipe.image_url,
    category_name: recipe.category_name,
    average_rating: Number(recipe.average_rating || 0),
    total_ratings: Number(recipe.total_ratings || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    is_favorite: true,
    tags: (recipe.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
  }
}

export const useFavoriteStore = defineStore('favorites', {
  state: () => ({
    favoriteList: [],
    favoriteIds: [],
    error: '',
    isLoading: false,
  }),
  actions: {
    clearFavorites() {
      favoritesSessionVersion += 1
      favoritesFetchRequestId += 1
      this.favoriteList = []
      this.favoriteIds = []
      this.error = ''
      this.isLoading = false
    },
    upsertFavorite(recipe) {
      if (!recipe?.id) {
        return
      }

      const favorite = toFavoriteListItem(recipe)
      if (!this.favoriteIds.includes(favorite.id)) {
        this.favoriteIds.push(favorite.id)
      }

      const existingIndex = this.favoriteList.findIndex((item) => item.id === favorite.id)
      if (existingIndex >= 0) {
        this.favoriteList = this.favoriteList.map((item) =>
          item.id === favorite.id ? { ...item, ...favorite } : item,
        )
        return
      }

      this.favoriteList = [favorite, ...this.favoriteList]
    },
    removeFavoriteFromCache(recipeId) {
      const id = Number(recipeId)
      this.favoriteIds = this.favoriteIds.filter((favoriteId) => favoriteId !== id)
      this.favoriteList = this.favoriteList.filter((item) => item.id !== id)
    },
    updateFavoriteCache(recipeId, patch) {
      const id = Number(recipeId)
      this.favoriteList = this.favoriteList.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      )
    },
    async fetchFavorites() {
      const requestId = ++favoritesFetchRequestId
      const sessionVersion = favoritesSessionVersion
      this.isLoading = true
      this.error = ''
      try {
        const response = await api.get('/favorites')
        if (requestId !== favoritesFetchRequestId || sessionVersion !== favoritesSessionVersion) {
          return
        }
        this.favoriteList = response.data.items
        this.favoriteIds = response.data.items.map((item) => item.id)
      } catch (error) {
        if (requestId !== favoritesFetchRequestId || sessionVersion !== favoritesSessionVersion) {
          return
        }
        this.error = getApiError(error, 'Unable to load favorites.')
      } finally {
        if (requestId === favoritesFetchRequestId && sessionVersion === favoritesSessionVersion) {
          this.isLoading = false
        }
      }
    },
    async addFavorite(recipeId, recipe = null) {
      const uiStore = useUiStore()
      const id = Number(recipeId)
      const sessionVersion = favoritesSessionVersion
      try {
        await api.post(`/favorites/${id}`)
        if (sessionVersion !== favoritesSessionVersion) {
          return false
        }
        favoritesFetchRequestId += 1
        if (recipe) {
          this.upsertFavorite(recipe)
        } else if (!this.favoriteIds.includes(id)) {
          this.favoriteIds = [...this.favoriteIds, id]
        }
        uiStore.setSuccess('Recipe added to favorites.')
        return true
      } catch (error) {
        if (sessionVersion !== favoritesSessionVersion) {
          return false
        }
        const message = getApiError(error, 'Unable to save recipe.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async removeFavorite(recipeId) {
      const uiStore = useUiStore()
      const id = Number(recipeId)
      const sessionVersion = favoritesSessionVersion
      try {
        await api.delete(`/favorites/${id}`)
        if (sessionVersion !== favoritesSessionVersion) {
          return false
        }
        favoritesFetchRequestId += 1
        this.removeFavoriteFromCache(id)
        uiStore.setSuccess('Recipe removed from favorites.')
        return true
      } catch (error) {
        if (sessionVersion !== favoritesSessionVersion) {
          return false
        }
        const message = getApiError(error, 'Unable to remove favorite.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
  },
})
