<script setup>
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})
const errors = reactive({})
const serverError = ref('')
const successMessage = ref('')
const isSubmitting = ref(false)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate() {
  errors.username = ''
  errors.email = ''
  errors.password = ''
  errors.confirmPassword = ''
  serverError.value = ''

  if (!form.username.trim()) {
    errors.username = 'Username is required.'
  }
  if (!form.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!emailPattern.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!form.password) {
    errors.password = 'Password is required.'
  } else if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Confirm password must match password.'
  }

  return !errors.username && !errors.email && !errors.password && !errors.confirmPassword
}

async function handleSubmit() {
  if (!validate()) {
    return
  }

  isSubmitting.value = true
  try {
    await authStore.register({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
    })
    successMessage.value = 'Account created. Please login with your new credentials.'
    setTimeout(() => router.push('/login'), 900)
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
      <p class="eyebrow">Join FoodStory</p>
      <h1>Register</h1>
      <p>Create an account to rate recipes, save favorites and build ingredient checklists.</p>

      <form class="auth-form" novalidate @submit.prevent="handleSubmit">
        <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
        <p v-if="successMessage" class="form-success" role="status">{{ successMessage }}</p>

        <div class="form-field">
          <label for="register-username">Username</label>
          <input
            id="register-username"
            v-focus
            v-model="form.username"
            type="text"
            autocomplete="name"
            :aria-invalid="Boolean(errors.username)"
            aria-describedby="register-username-error"
          />
          <p v-if="errors.username" id="register-username-error" class="field-error">
            {{ errors.username }}
          </p>
        </div>

        <div class="form-field">
          <label for="register-email">Email address</label>
          <input
            id="register-email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            :aria-invalid="Boolean(errors.email)"
            aria-describedby="register-email-error"
          />
          <p v-if="errors.email" id="register-email-error" class="field-error">
            {{ errors.email }}
          </p>
        </div>

        <div class="form-field">
          <label for="register-password">Password</label>
          <input
            id="register-password"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            :aria-invalid="Boolean(errors.password)"
            aria-describedby="register-password-error"
          />
          <p v-if="errors.password" id="register-password-error" class="field-error">
            {{ errors.password }}
          </p>
        </div>

        <div class="form-field">
          <label for="register-confirm-password">Confirm password</label>
          <input
            id="register-confirm-password"
            v-model="form.confirmPassword"
            type="password"
            autocomplete="new-password"
            :aria-invalid="Boolean(errors.confirmPassword)"
            aria-describedby="register-confirm-password-error"
          />
          <p
            v-if="errors.confirmPassword"
            id="register-confirm-password-error"
            class="field-error"
          >
            {{ errors.confirmPassword }}
          </p>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
          <AppIcon name="send" size="18" />
          <span>{{ isSubmitting ? 'Creating account...' : 'Create account' }}</span>
        </button>
      </form>

      <p class="auth-switch">
        Already registered?
        <RouterLink to="/login">Login</RouterLink>
      </p>
    </div>
  </section>
</template>
