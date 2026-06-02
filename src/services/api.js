import axios from 'axios'

export const AUTH_TOKEN_KEY = 'foodstory_token'
export const CURRENT_USER_KEY = 'foodstory_current_user'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error.config?.url || '')
    const isAuthAttempt =
      requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')
    const hadBearerToken = Boolean(error.config?.headers?.Authorization)

    if (error.response?.status === 401 && hadBearerToken && !isAuthAttempt) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
      window.localStorage.removeItem(CURRENT_USER_KEY)
      window.dispatchEvent(
        new CustomEvent('foodstory-auth-expired', {
          detail: { message: 'Phiên đăng nhập đã hết hạn' },
        }),
      )
    }

    return Promise.reject(error)
  },
)

export function getApiError(error, fallback = 'Something went wrong.') {
  if (error.response?.data?.error || error.response?.data?.message) {
    return error.response.data.error || error.response.data.message
  }

  if (error.request && !error.response) {
    return 'Unable to reach the FoodStory API. Please check that the backend is running.'
  }

  return error.message || fallback
}

export default api
