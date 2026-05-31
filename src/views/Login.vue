<script setup>
import { reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({
  email: '',
  password: '',
})
const errors = reactive({})
const serverError = ref('')
const isSubmitting = ref(false)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate() {
  errors.email = ''
  errors.password = ''
  serverError.value = ''

  if (!form.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!emailPattern.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!form.password) {
    errors.password = 'Password is required.'
  }

  return !errors.email && !errors.password
}

async function handleSubmit() {
  if (!validate()) {
    return
  }

  isSubmitting.value = true
  try {
    await authStore.login({
      email: form.email.trim(),
      password: form.password,
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/profile'
    router.push(redirect)
  } catch (error) {
    serverError.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section class="auth-page page-pad">
    <div class="auth-panel">
      <p class="eyebrow">FoodStory Account</p>
      <h1>Login</h1>
      <p>Access favorites, comments, ratings and ingredient checklists.</p>

      <form class="auth-form" novalidate @submit.prevent="handleSubmit">
        <p v-if="authStore.authMessage" class="form-error" role="alert">
          {{ authStore.authMessage }}
        </p>
        <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>

        <div class="form-field">
          <label for="login-email">Email address</label>
          <input
            id="login-email"
            v-focus
            v-model="form.email"
            type="email"
            autocomplete="email"
            :aria-invalid="Boolean(errors.email)"
            aria-describedby="login-email-error"
          />
          <p v-if="errors.email" id="login-email-error" class="field-error">
            {{ errors.email }}
          </p>
        </div>

        <div class="form-field">
          <label for="login-password">Password</label>
          <input
            id="login-password"
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            :aria-invalid="Boolean(errors.password)"
            aria-describedby="login-password-error"
          />
          <p v-if="errors.password" id="login-password-error" class="field-error">
            {{ errors.password }}
          </p>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
          <AppIcon name="users" size="18" />
          <span>{{ isSubmitting ? 'Logging in...' : 'Login' }}</span>
        </button>
      </form>

      <p class="auth-switch">
        New to FoodStory?
        <RouterLink to="/register">Create an account</RouterLink>
      </p>
    </div>
  </section>
</template>
