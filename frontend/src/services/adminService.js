import api from './api'

function compactParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== null && value !== undefined,
    ),
  )
}

export function getAdminStats() {
  return api.get('/admin/stats')
}

export function getAdminRecipes(params = {}) {
  return api.get('/admin/recipes', { params: compactParams(params) })
}

export function updateAdminRecipe(id, payload) {
  return api.put(`/admin/recipes/${id}`, payload)
}

export function deleteAdminRecipe(id) {
  return api.delete(`/admin/recipes/${id}`)
}

export function approveAdminRecipe(id) {
  return api.put(`/admin/recipes/${id}/approve`)
}

export function rejectAdminRecipe(id, reason) {
  return api.put(`/admin/recipes/${id}/reject`, { reason })
}

export function getAdminUsers(params = {}) {
  return api.get('/admin/users', { params: compactParams(params) })
}

export function toggleAdminUserBan(id) {
  return api.put(`/admin/users/${id}/ban`)
}

export function updateAdminUserRole(id, role) {
  return api.put(`/admin/users/${id}/role`, { role })
}

export function getAdminComments(params = {}) {
  return api.get('/admin/comments', { params: compactParams(params) })
}

export function deleteAdminComment(id) {
  return api.delete(`/admin/comments/${id}`)
}
