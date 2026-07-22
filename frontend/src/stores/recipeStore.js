import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'
import { useUiStore } from './uiStore'

let listAbortController = null
let listRequestId = 0
let archiveAbortController = null
let archiveRequestId = 0
let detailAbortController = null
let detailRequestId = 0

function toRecipeListItem(recipe) {
  return {
    ...recipe,
    id: recipe.id,
    title: recipe.title,
    image_url: recipe.image_url,
    description: recipe.description,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    blog_intro: recipe.blog_intro,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    created_at: recipe.created_at,
    category_name: recipe.category_name,
    average_rating: Number(recipe.average_rating || recipe.avg_rating || 0),
    avg_rating: Number(recipe.avg_rating || recipe.average_rating || 0),
    total_ratings: Number(recipe.total_ratings || recipe.rating_count || 0),
    rating_count: Number(recipe.rating_count || recipe.total_ratings || 0),
    comment_count: Number(recipe.comment_count || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    is_favorite: Boolean(recipe.is_favorite),
    tags: (recipe.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
  }
}

export const useRecipeStore = defineStore('recipes', {
  state: () => ({
    recipeList: [],
    recipeArchive: [],
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
      pageSize: 24,
    },
    archivePagination: {
      totalPages: 1,
      totalItems: 0,
      pageSize: 120,
      loadedPages: 0,
    },
    isLoading: false,
    isArchiveLoading: false,
    error: '',
    archiveError: '',
  }),
  getters: {
    hasRecipes: (state) => state.recipeList.length > 0,
  },
  actions: {
    addCommentFromSocket(comment) {
      const recipeId = Number(comment.recipe_id ?? comment.recipeId)
      if (!Number.isSafeInteger(recipeId) || recipeId <= 0) {
        return
      }

      this.updateRecipeCache(recipeId, (currentRecipe) => {
        const comments = currentRecipe.comments || []
        if (comments.find((item) => item.id === comment.id)) {
          return {}
        }

        return {
          comments: [comment, ...comments],
          comment_count: Number(currentRecipe.comment_count || 0) + 1,
        }
      })
    },
    updateCommentFromSocket(comment) {
      const recipeId = Number(comment.recipe_id ?? comment.recipeId)
      if (!Number.isSafeInteger(recipeId) || recipeId <= 0) {
        return
      }

      this.updateRecipeCache(recipeId, (currentRecipe) => ({
        comments: (currentRecipe.comments || []).map((item) =>
          item.id === comment.id ? { ...item, ...comment } : item,
        ),
      }))
    },
    deleteCommentFromSocket({ recipeId, commentId }) {
      const id = Number(recipeId)
      if (!Number.isSafeInteger(id) || id <= 0) {
        return
      }

      this.updateRecipeCache(id, (currentRecipe) => {
        const comments = currentRecipe.comments || []
        const commentExists = comments.some((comment) => comment.id === commentId)
        if (!commentExists) {
          return {}
        }

        return {
          comments: comments.filter((comment) => comment.id !== commentId),
          comment_count: Math.max(Number(currentRecipe.comment_count || 0) - 1, 0),
        }
      })
    },
    updateRatingFromSocket({ recipeId, avgRating, ratingCount }) {
      this.updateRecipeCache(recipeId, {
        average_rating: Number(avgRating || 0),
        avg_rating: Number(avgRating || 0),
        total_ratings: Number(ratingCount || 0),
        rating_count: Number(ratingCount || 0),
      })
    },
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
      this.recipeArchive = this.recipeArchive.map((recipe) =>
        recipe.id === recipeId ? applyPatch(recipe) : recipe,
      )
    },
    upsertRecipeInList(recipe, options = {}) {
      if (!recipe?.id) {
        return
      }

      const summary = toRecipeListItem(recipe)
      const existingIndex = this.recipeList.findIndex((item) => item.id === summary.id)
      const existingArchiveIndex = this.recipeArchive.findIndex((item) => item.id === summary.id)

      if (existingIndex >= 0) {
        this.recipeList = this.recipeList.map((item) =>
          item.id === summary.id ? { ...item, ...summary } : item,
        )
      }
      if (existingArchiveIndex >= 0) {
        this.recipeArchive = this.recipeArchive.map((item) =>
          item.id === summary.id ? { ...item, ...summary } : item,
        )
      }
      if (existingIndex >= 0 || existingArchiveIndex >= 0) {
        return
      }

      if (!options.prepend) {
        return
      }

      this.recipeList = [summary, ...this.recipeList].slice(0, this.pagination.pageSize)
      this.recipeArchive = [summary, ...this.recipeArchive]
      this.pagination.totalItems += 1
      this.pagination.totalPages = Math.max(
        1,
        Math.ceil(this.pagination.totalItems / this.pagination.pageSize),
      )
      this.archivePagination.totalItems += 1
      this.archivePagination.totalPages = Math.max(
        1,
        Math.ceil(this.archivePagination.totalItems / this.archivePagination.pageSize),
      )
    },
    removeRecipeFromCache(id) {
      const recipeId = Number(id)
      const hadRecipe = this.recipeList.some((recipe) => recipe.id === recipeId)
      const hadArchiveRecipe = this.recipeArchive.some((recipe) => recipe.id === recipeId)
      this.recipeList = this.recipeList.filter((recipe) => recipe.id !== recipeId)
      this.recipeArchive = this.recipeArchive.filter((recipe) => recipe.id !== recipeId)

      if (hadRecipe) {
        this.pagination.totalItems = Math.max(this.pagination.totalItems - 1, 0)
        this.pagination.totalPages = Math.max(
          1,
          Math.ceil(this.pagination.totalItems / this.pagination.pageSize),
        )
      }
      if (hadArchiveRecipe) {
        this.archivePagination.totalItems = Math.max(this.archivePagination.totalItems - 1, 0)
        this.archivePagination.totalPages = Math.max(
          1,
          Math.ceil(this.archivePagination.totalItems / this.archivePagination.pageSize),
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
            sort: options.sort || 'newest',
            includeMeta: includeMeta ? '1' : '0',
          },
        })
        if (requestId !== listRequestId) {
          return
        }
        this.recipeList = (response.data.items || []).map(toRecipeListItem)
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
    async fetchRecipeArchive(options = {}) {
      archiveAbortController?.abort()
      archiveAbortController = new AbortController()
      const requestId = ++archiveRequestId
      const pageSize = options.pageSize || this.archivePagination.pageSize
      const maxPages = Math.max(Number(options.maxPages || 1), 1)
      this.isArchiveLoading = true
      this.archiveError = ''
      if (options.reset !== false) {
        this.recipeArchive = []
        this.archivePagination.loadedPages = 0
      }

      try {
        const baseParams = {
          pageSize,
          search: this.searchQuery,
          category: this.filters.category,
          tag: this.filters.tag,
          sort: options.sort || 'newest',
          includeMeta: '0',
        }
        const firstResponse = await api.get('/recipes', {
          signal: archiveAbortController.signal,
          params: {
            ...baseParams,
            page: 1,
          },
        })
        if (requestId !== archiveRequestId) {
          return
        }

        const totalPages = Number(firstResponse.data.totalPages || 1)
        const totalItems = Number(firstResponse.data.totalItems || 0)
        const archiveItems = (firstResponse.data.items || []).map(toRecipeListItem)
        this.archivePagination.totalPages = totalPages
        this.archivePagination.totalItems = totalItems
        this.archivePagination.pageSize = pageSize
        this.archivePagination.loadedPages = totalPages > 0 ? 1 : 0
        this.recipeArchive = archiveItems

        const pagesToLoad = Math.min(totalPages, maxPages)
        for (let page = 2; page <= pagesToLoad; page += 1) {
          const response = await api.get('/recipes', {
            signal: archiveAbortController.signal,
            params: {
              ...baseParams,
              page,
            },
          })
          if (requestId !== archiveRequestId) {
            return
          }

          this.recipeArchive = [
            ...this.recipeArchive,
            ...(response.data.items || []).map(toRecipeListItem),
          ]
          this.archivePagination.loadedPages = page
        }
      } catch (error) {
        if (error.code === 'ERR_CANCELED') {
          return
        }
        this.archiveError = getApiError(error, 'Unable to load recipe discovery picks.')
      } finally {
        if (requestId === archiveRequestId) {
          this.isArchiveLoading = false
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
    async submitRecipe(payload) {
      const uiStore = useUiStore()
      try {
        const response = await api.post('/recipes/submissions', payload)
        uiStore.setSuccess(response.data.message || 'The recipe was submitted for review.')
        return response.data.recipe
      } catch (error) {
        const message = getApiError(error, 'The recipe could not be submitted.')
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
    cancelRecipeArchiveRequest() {
      archiveAbortController?.abort()
      archiveAbortController = null
      archiveRequestId += 1
      this.isArchiveLoading = false
    },
    cancelSelectedRecipeRequest() {
      detailAbortController?.abort()
      detailAbortController = null
      detailRequestId += 1
      this.isLoading = false
    },
  },
})
