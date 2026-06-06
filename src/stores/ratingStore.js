import { defineStore } from 'pinia'
import { useFavoriteStore } from './favoriteStore'
import { useRecipeStore } from './recipeStore'

export const useRatingStore = defineStore('ratings', {
  state: () => ({
    ratingsByRecipe: {},
  }),
  actions: {
    updateRatingFromSocket({ recipeId, avgRating, ratingCount }) {
      const id = Number(recipeId)
      if (!Number.isSafeInteger(id) || id <= 0) {
        return
      }

      const ratingData = {
        recipeId: id,
        avgRating: Number(avgRating || 0),
        ratingCount: Number(ratingCount || 0),
      }
      this.ratingsByRecipe[id] = ratingData
      useRecipeStore().updateRatingFromSocket(ratingData)
      useFavoriteStore().updateFavoriteCache(id, {
        average_rating: ratingData.avgRating,
        avg_rating: ratingData.avgRating,
        total_ratings: ratingData.ratingCount,
        rating_count: ratingData.ratingCount,
      })
    },
  },
})
