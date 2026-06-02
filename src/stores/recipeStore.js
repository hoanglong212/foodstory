import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'
import { useUiStore } from './uiStore'

let listAbortController = null
let listRequestId = 0
let detailAbortController = null
let detailRequestId = 0

function toRecipeListItem(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    image_url: recipe.image_url,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    created_at: recipe.created_at,
    category_name: recipe.category_name,
    average_rating: Number(recipe.average_rating || 0),
    total_ratings: Number(recipe.total_ratings || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    is_favorite: Boolean(recipe.is_favorite),
    tags: (recipe.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
  }
}

export const useRecipeStore = defineStore('recipes', {
  state: () => ({
    recipeList: [],
    selectedRecipe: null,
    categories: [],
    tags: [],
    searchQuery: '',
    filters: {
      category: 'all',
      tag: 'all',
    },
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      pageSize: 6,
    },
    isLoading: false,
    error: '',
  }),
  getters: {
    hasRecipes: (state) => state.recipeList.length > 0,
  },
  actions: {
    updateRecipeCache(id, patch) {
      const recipeId = Number(id)
      const applyPatch = (recipe) => {
        const nextPatch = typeof patch === 'function' ? patch(recipe) : patch
        return { ...recipe, ...nextPatch }
      }

      if (this.selectedRecipe?.id === recipeId) {
        this.selectedRecipe = applyPatch(this.selectedRecipe)
      }

      this.recipeList = this.recipeList.map((recipe) =>
        recipe.id === recipeId ? applyPatch(recipe) : recipe,
      )
    },
    upsertRecipeInList(recipe, options = {}) {
      if (!recipe?.id) {
        return
      }

      const summary = toRecipeListItem(recipe)
      const existingIndex = this.recipeList.findIndex((item) => item.id === summary.id)

      if (existingIndex >= 0) {
        this.recipeList = this.recipeList.map((item) =>
          item.id === summary.id ? { ...item, ...summary } : item,
        )
        return
      }

      if (!options.prepend) {
        return
      }

      this.recipeList = [summary, ...this.recipeList].slice(0, this.pagination.pageSize)
      this.pagination.totalItems += 1
      this.pagination.totalPages = Math.max(
        1,
        Math.ceil(this.pagination.totalItems / this.pagination.pageSize),
      )
    },
    removeRecipeFromCache(id) {
      const recipeId = Number(id)
      const hadRecipe = this.recipeList.some((recipe) => recipe.id === recipeId)
      this.recipeList = this.recipeList.filter((recipe) => recipe.id !== recipeId)

      if (hadRecipe) {
        this.pagination.totalItems = Math.max(this.pagination.totalItems - 1, 0)
        this.pagination.totalPages = Math.max(
          1,
          Math.ceil(this.pagination.totalItems / this.pagination.pageSize),
        )
      }

      if (this.selectedRecipe?.id === recipeId) {
        this.selectedRecipe = null
      }
    },
    async fetchRecipes(page = this.pagination.currentPage, options = {}) {
      listAbortController?.abort()
      listAbortController = new AbortController()
      const requestId = ++listRequestId
      this.isLoading = true
      this.error = ''
      try {
        const includeMeta =
          options.includeMeta === true || this.categories.length === 0 || this.tags.length === 0
        const response = await api.get('/recipes', {
          signal: listAbortController.signal,
          params: {
            page,
            pageSize: this.pagination.pageSize,
            search: this.searchQuery,
            category: this.filters.category,
            tag: this.filters.tag,
            includeMeta: includeMeta ? '1' : '0',
          },
        })
        if (requestId !== listRequestId) {
          return
        }
        this.recipeList = response.data.items
        if (response.data.categories?.length) {
          this.categories = response.data.categories
        }
        if (response.data.tags?.length) {
          this.tags = response.data.tags
        }
        this.pagination.currentPage = response.data.currentPage
        this.pagination.totalPages = response.data.totalPages
        this.pagination.totalItems = response.data.totalItems
      } catch (error) {
        if (error.code === 'ERR_CANCELED') {
          return
        }
        this.error = getApiError(error, 'Unable to load recipes.')
      } finally {
        if (requestId === listRequestId) {
          this.isLoading = false
        }
      }
    },
    async fetchRecipeById(id) {
      detailAbortController?.abort()
      detailAbortController = new AbortController()
      const requestId = ++detailRequestId
      this.isLoading = true
      this.error = ''
      try {
        const response = await api.get(`/recipes/${id}`, {
          signal: detailAbortController.signal,
        })
        if (requestId !== detailRequestId) {
          return null
        }
        this.selectedRecipe = response.data.recipe
        return response.data.recipe
      } catch (error) {
        if (error.code === 'ERR_CANCELED') {
          return null
        }
        this.error = getApiError(error, 'Unable to load recipe.')
        throw new Error(this.error)
      } finally {
        if (requestId === detailRequestId) {
          this.isLoading = false
          detailAbortController = null
        }
      }
    },
    async fetchMeta() {
      const response = await api.get('/recipes/meta')
      this.categories = response.data.categories
      this.tags = response.data.tags
      return response.data
    },
    async createRecipe(payload) {
      const uiStore = useUiStore()
      try {
        const response = await api.post('/recipes', payload)
        listRequestId += 1
        this.selectedRecipe = response.data.recipe
        this.upsertRecipeInList(response.data.recipe, { prepend: this.pagination.currentPage === 1 })
        uiStore.setSuccess('Recipe created successfully.')
        return response.data.recipe
      } catch (error) {
        const message = getApiError(error, 'Unable to create recipe.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async updateRecipe(id, payload) {
      const uiStore = useUiStore()
      try {
        const response = await api.put(`/recipes/${id}`, payload)
        listRequestId += 1
        this.selectedRecipe = response.data.recipe
        this.upsertRecipeInList(response.data.recipe)
        uiStore.setSuccess('Recipe updated successfully.')
        return response.data.recipe
      } catch (error) {
        const message = getApiError(error, 'Unable to update recipe.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async deleteRecipe(id) {
      const uiStore = useUiStore()
      try {
        await api.delete(`/recipes/${id}`)
        listRequestId += 1
        this.removeRecipeFromCache(id)
        uiStore.setSuccess('Recipe deleted successfully.')
      } catch (error) {
        const message = getApiError(error, 'Unable to delete recipe.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    setSearch(value) {
      this.searchQuery = value
      this.pagination.currentPage = 1
    },
    setFilter(name, value) {
      this.filters[name] = value
      this.pagination.currentPage = 1
    },
    resetFilters() {
      this.searchQuery = ''
      this.filters.category = 'all'
      this.filters.tag = 'all'
      this.pagination.currentPage = 1
    },
    cancelRecipeListRequest() {
      listAbortController?.abort()
      listAbortController = null
      listRequestId += 1
      this.isLoading = false
    },
    cancelSelectedRecipeRequest() {
      detailAbortController?.abort()
      detailAbortController = null
      detailRequestId += 1
      this.isLoading = false
    },
  },
})
