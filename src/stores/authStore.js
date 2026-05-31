import { defineStore } from 'pinia'
import api, { AUTH_TOKEN_KEY, CURRENT_USER_KEY, getApiError } from '../services/api'

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
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || 'guest',
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    loadFromStorage() {
      this.token = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
      this.user = readStoredUser()
    },
    setAuth({ token, user }) {
      this.token = token || ''
      this.user = user || null

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
    },
    async register(payload) {
      try {
        const response = await api.post('/auth/register', payload)
        return response.data.user
      } catch (error) {
        throw new Error(getApiError(error, 'Registration failed.'))
      }
    },
    async login(payload) {
      try {
        const response = await api.post('/auth/login', payload)
        this.setAuth(response.data)
        this.authMessage = ''
        return response.data.user
      } catch (error) {
        throw new Error(getApiError(error, 'Login failed.'))
      }
    },
    async logout() {
      try {
        if (this.token) {
          await api.post('/auth/logout')
        }
      } catch {
        // JWT logout is client-side; ignore server failures and clear local state.
      } finally {
        this.clearAuth('')
      }
    },
    async fetchMe() {
      if (!this.token) {
        this.clearAuth('')
        return null
      }

      try {
        const response = await api.get('/auth/me')
        this.setAuth({ token: this.token, user: response.data.user })
        return response.data.user
      } catch (error) {
        this.clearAuth(getApiError(error, 'Unable to verify session.'))
        return null
      }
    },
  },
})
