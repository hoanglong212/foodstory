import { defineStore } from 'pinia'
import api, { AUTH_TOKEN_KEY, CURRENT_USER_KEY, getApiError } from '../services/api'
import { useChecklistStore } from './checklistStore'
import { useFavoriteStore } from './favoriteStore'
import { useUiStore } from './uiStore'

let sessionVerificationPromise = null

function readStoredUser() {
  try {
    return JSON.parse(window.localStorage.getItem(CURRENT_USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: readStoredUser(),
    token: window.localStorage.getItem(AUTH_TOKEN_KEY) || '',
    authMessage: '',
    sessionChecked: false,
    isVerifyingSession: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || 'guest',
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    loadFromStorage() {
      const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
      if (storedToken !== this.token) {
        this.sessionChecked = false
      }

      this.token = storedToken
      this.user = readStoredUser()
      if (!this.token || !this.user) {
        this.sessionChecked = true
      }
    },
    setAuth({ token, user }) {
      this.token = token || ''
      this.user = user || null
      this.sessionChecked = true

      if (this.token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, this.token)
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
      }

      if (this.user) {
        window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(this.user))
      } else {
        window.localStorage.removeItem(CURRENT_USER_KEY)
      }
    },
    clearAuth(message = '') {
      this.authMessage = message
      this.setAuth({ token: '', user: null })
      useFavoriteStore().clearFavorites()
      useChecklistStore().clearChecklist()
    },
    async register(payload) {
      const uiStore = useUiStore()
      try {
        const response = await api.post('/auth/register', payload)
        uiStore.setSuccess('Account created. Please login with your new credentials.')
        return response.data.user
      } catch (error) {
        const message = getApiError(error, 'Registration failed.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async login(payload) {
      const uiStore = useUiStore()
      try {
        const response = await api.post('/auth/login', payload)
        this.setAuth(response.data)
        this.authMessage = ''
        uiStore.setSuccess('Logged in successfully.')
        return response.data.user
      } catch (error) {
        const message = getApiError(error, 'Login failed.')
        uiStore.setError(message)
        throw new Error(message)
      }
    },
    async logout() {
      const uiStore = useUiStore()
      try {
        if (this.token) {
          await api.post('/auth/logout')
        }
      } catch {
        // JWT logout is client-side; ignore server failures and clear local state.
      } finally {
        this.clearAuth('')
        uiStore.setSuccess('Logged out successfully.')
      }
    },
    async fetchMe(options = {}) {
      if (!this.token) {
        this.clearAuth('')
        return null
      }
      if (this.isVerifyingSession) {
        return sessionVerificationPromise
      }

      this.isVerifyingSession = true
      sessionVerificationPromise = (async () => {
        const response = await api.get('/auth/me', {
          timeout: options.timeoutMs ?? 3000,
        })
        this.setAuth({ token: this.token, user: response.data.user })
        return response.data.user
      })()

      try {
        return await sessionVerificationPromise
      } catch (error) {
        this.clearAuth(options.silent ? '' : getApiError(error, 'Unable to verify session.'))
        return null
      } finally {
        this.sessionChecked = true
        this.isVerifyingSession = false
        sessionVerificationPromise = null
      }
    },
  },
})
