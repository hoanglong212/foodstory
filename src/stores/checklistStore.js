import { defineStore } from 'pinia'
import api, { getApiError } from '../services/api'

export const useChecklistStore = defineStore('checklists', {
  state: () => ({
    activeChecklist: null,
    items: [],
    error: '',
  }),
  actions: {
    setChecklist(checklist) {
      this.activeChecklist = checklist
      this.items = checklist?.items || []
    },
    async generateChecklist(recipeId) {
      try {
        const response = await api.post('/checklists', { recipe_id: recipeId })
        this.setChecklist(response.data.checklist)
        return response.data.checklist
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to generate checklist.'))
      }
    },
    async fetchChecklist(recipeId) {
      try {
        const response = await api.get(`/checklists/${recipeId}`)
        this.setChecklist(response.data.checklist)
        return response.data.checklist
      } catch (error) {
        this.setChecklist(null)
        this.error = getApiError(error, 'Checklist has not been generated yet.')
        return null
      }
    },
    async toggleItem(itemId) {
      try {
        const response = await api.patch(`/checklist-items/${itemId}`)
        const updated = response.data
        this.items = this.items.map((item) =>
          item.id === updated.id ? { ...item, is_checked: updated.is_checked } : item,
        )
      } catch (error) {
        throw new Error(getApiError(error, 'Unable to update checklist item.'))
      }
    },
  },
})
