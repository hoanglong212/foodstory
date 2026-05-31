import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'

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
    async fetchRecipes(page = this.pagination.currentPage) {
      this.isLoading = true
      this.error = ''
      try {
        const response = await api.get('/recipes', {
          params: {
            page,
            pageSize: this.pagination.pageSize,
            search: this.searchQuery,
            category: this.filters.category,
            tag: this.filters.tag,
          },
        })
        this.recipeList = response.data.items
        this.categories = response.data.categories
        this.tags = response.data.tags
        this.pagination.currentPage = response.data.currentPage
        this.pagination.totalPages = response.data.totalPages
        this.pagination.totalItems = response.data.totalItems
      } catch (error) {
        this.error = getApiError(error, 'Unable to load recipes.')
      } finally {
        this.isLoading = false
      }
    },
    async fetchRecipeById(id) {
      this.isLoading = true
      this.error = ''
      try {
        const response = await api.get(`/recipes/${id}`)
        this.selectedRecipe = response.data.recipe
        return response.data.recipe
      } catch (error) {
        this.error = getApiError(error, 'Unable to load recipe.')
        throw new Error(this.error)
      } finally {
        this.isLoading = false
      }
    },
    async fetchMeta() {
      const response = await api.get('/recipes/meta')
      this.categories = response.data.categories
      this.tags = response.data.tags
      return response.data
    },
    async createRecipe(payload) {
      try {
        const response = await api.post('/recipes', payload)
        return response.data.recipe
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to create recipe.'))
      }
    },
    async updateRecipe(id, payload) {
      try {
        const response = await api.put(`/recipes/${id}`, payload)
        this.selectedRecipe = response.data.recipe
        return response.data.recipe
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to update recipe.'))
      }
    },
    async deleteRecipe(id) {
      try {
        await api.delete(`/recipes/${id}`)
        if (this.selectedRecipe?.id === Number(id)) {
          this.selectedRecipe = null
        }
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to delete recipe.'))
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
  },
})
