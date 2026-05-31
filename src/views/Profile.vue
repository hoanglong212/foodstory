<script setup>
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import RecipeCard from '../components/RecipeCard.vue'
import { useAuthStore } from '../stores/authStore'
import { useFavoriteStore } from '../stores/favoriteStore'

const authStore = useAuthStore()
const favoriteStore = useFavoriteStore()

onMounted(() => {
  favoriteStore.fetchFavorites()
})
</script>

<template>
  <section class="profile-page page-pad">
    <div class="profile-header">
      <div>
        <p class="eyebrow">My FoodStory</p>
        <h1>Welcome, {{ authStore.user?.username }}</h1>
        <p>
          Manage your saved recipes, return to checklists, and see your account role.
        </p>
      </div>
      <span class="role-badge">{{ authStore.role }}</span>
    </div>

    <section class="detail-section">
      <h2>Account</h2>
      <dl class="profile-details">
        <div>
          <dt>Username</dt>
          <dd>{{ authStore.user?.username }}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{{ authStore.user?.email }}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{{ authStore.user?.role }}</dd>
        </div>
      </dl>
    </section>

    <section class="detail-section">
      <div class="split-heading">
        <div>
          <h2>Favorite Recipes</h2>
          <p class="muted-copy">Favorites are stored in MySQL through the authenticated API.</p>
        </div>
        <RouterLink class="text-link" to="/recipes">
          <span>Browse recipes</span>
          <AppIcon name="arrow-right" size="16" />
        </RouterLink>
      </div>

      <p v-if="favoriteStore.error" class="form-error" role="alert">
        {{ favoriteStore.error }}
      </p>
      <p v-else-if="favoriteStore.favoriteList.length === 0" class="empty-state">
        No favorites yet. Open a recipe and save it to see it here.
      </p>
      <div v-else class="row g-4">
        <div
          v-for="recipe in favoriteStore.favoriteList"
          :key="recipe.id"
          class="col-12 col-md-6 col-xl-4"
        >
          <RecipeCard :recipe="recipe" />
        </div>
      </div>
    </section>
  </section>
</template>
