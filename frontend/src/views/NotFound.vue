<script setup>
import { RouterLink } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
</script>

<template>
  <section class="not-found-page page-pad">
    <div class="not-found-content">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>
        The page you requested does not exist or may have moved. Return to a safe FoodStory page
        below.
      </p>
      <div class="hero-actions">
        <RouterLink class="btn btn-primary" to="/recipes">
          <AppIcon name="book-open" size="18" />
          <span>Browse recipes</span>
        </RouterLink>
        <RouterLink class="btn btn-outline" to="/">
          <AppIcon name="home" size="18" />
          <span>Go home</span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
