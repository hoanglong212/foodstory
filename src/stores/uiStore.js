import { defineStore } from 'pinia'

const DARK_MODE_KEY = 'foodstory_dark_mode'

function getInitialDarkMode() {
  const saved = window.localStorage.getItem(DARK_MODE_KEY)
  if (saved === 'true') {
    return true
  }
  if (saved === 'false') {
    return false
  }

  const legacyTheme = window.localStorage.getItem('foodstory-theme')
  if (legacyTheme === 'dark') {
    return true
  }
  if (legacyTheme === 'light') {
    return false
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    darkMode: getInitialDarkMode(),
    isLoading: false,
    errorMsg: '',
    successMsg: '',
    notificationId: 0,
    notificationOptions: {},
  }),
  actions: {
    setDarkMode(value) {
      this.darkMode = Boolean(value)
      window.localStorage.setItem(DARK_MODE_KEY, String(this.darkMode))
      window.localStorage.setItem('foodstory-theme', this.darkMode ? 'dark' : 'light')
    },
    toggleDarkMode() {
      this.setDarkMode(!this.darkMode)
    },
    setLoading(value) {
      this.isLoading = Boolean(value)
    },
    setError(message, options = {}) {
      this.errorMsg = message || ''
      this.successMsg = ''
      this.notificationOptions = options
      this.notificationId += 1
    },
    setSuccess(message, options = {}) {
      this.successMsg = message || ''
      this.errorMsg = ''
      this.notificationOptions = options
      this.notificationId += 1
    },
    clearMessages() {
      this.errorMsg = ''
      this.successMsg = ''
      this.notificationOptions = {}
    },
  },
})
