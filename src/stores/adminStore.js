import { defineStore } from 'pinia'
import { getApiError } from '../services/api'
import { getAdminStats } from '../services/adminService'

export const useAdminStore = defineStore('admin', {
  state: () => ({
    stats: {
      total_users: 0,
      total_recipes: 0,
      pending_recipes: 0,
      total_comments: 0,
      total_spots: 0,
      total_admins: 0,
    },
    recent: {
      pending_recipes: [],
      comments: [],
      users: [],
    },
    loading: false,
    error: '',
  }),
  getters: {
    pendingCount: (state) => Number(state.stats.pending_recipes || 0),
  },
  actions: {
    async fetchStats(options = {}) {
      this.loading = true
      if (!options.silent) {
        this.error = ''
      }

      try {
        const response = await getAdminStats()
        this.stats = {
          ...this.stats,
          ...response.data.stats,
        }
        this.recent = {
          ...this.recent,
          ...response.data.recent,
        }
        return response.data
      } catch (error) {
        this.error = getApiError(error, 'Admin statistics could not be loaded.')
        if (!options.silent) {
          throw new Error(this.error)
        }
        return null
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.$reset()
    },
  },
})
