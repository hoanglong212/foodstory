import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'
import { useUiStore } from './uiStore'

let activeChecklistRequestId = 0
let checklistListRequestId = 0
let checklistSessionVersion = 0

export const useChecklistStore = defineStore('checklists', {
  state: () => ({
    activeChecklist: null,
    items: [],
    userChecklists: [],
    error: '',
    isLoading: false,
  }),
  actions: {
    clearChecklist() {
      checklistSessionVersion += 1
      activeChecklistRequestId += 1
      checklistListRequestId += 1
      this.activeChecklist = null
      this.items = []
      this.userChecklists = []
      this.error = ''
      this.isLoading = false
    },
    setChecklist(checklist) {
      this.activeChecklist = checklist
      this.items = checklist?.items || []
    },
    async fetchUserChecklists() {
      const requestId = ++checklistListRequestId
      const sessionVersion = checklistSessionVersion
      this.isLoading = true
      this.error = ''
      try {
        const response = await api.get('/checklists')
        if (requestId !== checklistListRequestId || sessionVersion !== checklistSessionVersion) {
          return []
        }
        this.userChecklists = response.data.items
        return response.data.items
      } catch (error) {
        if (requestId !== checklistListRequestId || sessionVersion !== checklistSessionVersion) {
          return []
        }
        this.error = getApiError(error, 'Unable to load your checklists.')
        return []
      } finally {
        if (requestId === checklistListRequestId && sessionVersion === checklistSessionVersion) {
          this.isLoading = false
        }
      }
    },
    async generateChecklist(recipeId) {
      const uiStore = useUiStore()
      const requestId = ++activeChecklistRequestId
      const sessionVersion = checklistSessionVersion
      this.error = ''
      try {
        const response = await api.post('/checklists', { recipe_id: recipeId })
        if (requestId !== activeChecklistRequestId || sessionVersion !== checklistSessionVersion) {
          return null
        }
        this.setChecklist(response.data.checklist)
        await this.fetchUserChecklists()
        if (requestId !== activeChecklistRequestId || sessionVersion !== checklistSessionVersion) {
          return null
        }
        uiStore.setSuccess('Ingredient checklist is ready.')
        return response.data.checklist
      } catch (error) {
        if (requestId !== activeChecklistRequestId || sessionVersion !== checklistSessionVersion) {
          return null
        }
        const message = getApiError(error, 'Unable to generate checklist.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async fetchChecklist(recipeId) {
      const requestId = ++activeChecklistRequestId
      const sessionVersion = checklistSessionVersion
      this.error = ''
      try {
        const response = await api.get(`/checklists/${recipeId}`)
        if (requestId !== activeChecklistRequestId || sessionVersion !== checklistSessionVersion) {
          return null
        }
        this.setChecklist(response.data.checklist)
        return response.data.checklist
      } catch (error) {
        if (requestId !== activeChecklistRequestId || sessionVersion !== checklistSessionVersion) {
          return null
        }
        this.setChecklist(null)
        this.error = getApiError(error, 'Checklist has not been generated yet.')
        return null
      }
    },
    async toggleItem(itemId) {
      const uiStore = useUiStore()
      const sessionVersion = checklistSessionVersion
      this.error = ''
      try {
        const response = await api.patch(`/checklist-items/${itemId}`)
        if (sessionVersion !== checklistSessionVersion) {
          return false
        }
        checklistListRequestId += 1
        const updated = response.data
        this.items = this.items.map((item) =>
          item.id === updated.id ? { ...item, is_checked: updated.is_checked } : item,
        )
        if (this.activeChecklist) {
          this.activeChecklist = {
            ...this.activeChecklist,
            items: this.items,
          }
        }
        if (this.activeChecklist?.id) {
          const checkedItems = this.items.filter((item) => item.is_checked).length
          this.userChecklists = this.userChecklists.map((checklist) =>
            checklist.id === this.activeChecklist.id
              ? {
                  ...checklist,
                  checked_items: checkedItems,
                  total_items: this.items.length,
                }
              : checklist,
          )
        }
        uiStore.setSuccess('Checklist updated.')
        return true
      } catch (error) {
        if (sessionVersion !== checklistSessionVersion) {
          return false
        }
        const message = getApiError(error, 'Unable to update checklist item.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
  },
})
