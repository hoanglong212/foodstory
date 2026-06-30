import { useAuthStore } from '../stores/authStore'

function applyPermission(el, binding) {
  const authStore = useAuthStore()
  const requiredRole = binding.value
  const allowed = authStore.isLoggedIn && authStore.user?.role === requiredRole

  el.style.display = allowed ? el.dataset.permissionDisplay || '' : 'none'
}

export default {
  mounted(el, binding) {
    el.dataset.permissionDisplay = el.style.display || ''
    applyPermission(el, binding)
  },
  updated(el, binding) {
    applyPermission(el, binding)
  },
}
