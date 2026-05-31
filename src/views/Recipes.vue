<script setup>
import { onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import RecipeCard from '../components/RecipeCard.vue'
import { useRecipeStore } from '../stores/recipeStore'

const recipeStore = useRecipeStore()

onMounted(() => {
  recipeStore.fetchRecipes(1)
})

watch(
  () => [recipeStore.searchQuery, recipeStore.filters.category, recipeStore.filters.tag],
  () => {
    recipeStore.fetchRecipes(1)
  },
)

function goToPage(page) {
  const nextPage = Math.min(Math.max(page, 1), recipeStore.pagination.totalPages)
  recipeStore.fetchRecipes(nextPage)
}

async function deleteRecipe(recipe) {
  const confirmed = window.confirm(`Delete "${recipe.title}"? This cannot be undone.`)
  if (!confirmed) {
    return
  }

  await recipeStore.deleteRecipe(recipe.id)
  recipeStore.fetchRecipes(recipeStore.pagination.currentPage)
}
</script>

<template>
  <section class="recipes-page page-pad">
    <div class="section-heading split-heading">
      <div>
        <p class="eyebrow">FoodStory Recipes</p>
        <h1>Recipes</h1>
        <p>
          Browse MySQL-backed recipes with server-side search, filters, ratings and favorites.
        </p>
      </div>
      <RouterLink v-permission="'admin'" class="btn btn-primary" to="/recipes/new">
        <AppIcon name="pen" size="18" />
        <span>Create Recipe</span>
      </RouterLink>
    </div>

    <form class="stage2-filter-panel" @submit.prevent>
      <label>
        <span class="field-label">
          <AppIcon name="search" size="16" />
          Search by recipe name
        </span>
        <input
          v-model="recipeStore.searchQuery"
          type="search"
          placeholder="Pho, miso, tea..."
        />
      </label>

      <label>
        <span class="field-label">
          <AppIcon name="filter" size="16" />
          Category
        </span>
        <select v-model="recipeStore.filters.category">
          <option value="all">All categories</option>
          <option
            v-for="category in recipeStore.categories"
            :key="category.id"
            :value="category.name"
          >
            {{ category.name }}
          </option>
        </select>
      </label>

      <label>
        <span class="field-label">
          <AppIcon name="tags" size="16" />
          Tag
        </span>
        <select v-model="recipeStore.filters.tag">
          <option value="all">All tags</option>
          <option v-for="tag in recipeStore.tags" :key="tag.id" :value="tag.name">
            {{ tag.name }}
          </option>
        </select>
      </label>

      <button class="btn btn-outline stage2-reset" type="button" @click="recipeStore.resetFilters">
        Reset
      </button>
    </form>

    <p v-if="recipeStore.isLoading" class="status-panel">Loading recipes...</p>
    <p v-else-if="recipeStore.error" class="form-error" role="alert">
      {{ recipeStore.error }}
    </p>

    <div v-else>
      <p v-if="!recipeStore.hasRecipes" class="empty-state">
        No recipes match your search and filters.
      </p>

      <div v-else class="row g-4">
        <div
          v-for="recipe in recipeStore.recipeList"
          :key="recipe.id"
          class="col-12 col-md-6 col-xl-4"
        >
          <RecipeCard :recipe="recipe" @delete="deleteRecipe" />
        </div>
      </div>

      <nav
        v-if="recipeStore.pagination.totalItems > 0"
        class="pagination"
        aria-label="Recipe pagination"
      >
        <button
          type="button"
          :disabled="recipeStore.pagination.currentPage === 1"
          @click="goToPage(recipeStore.pagination.currentPage - 1)"
        >
          <AppIcon name="arrow-left" size="16" />
          <span>Previous</span>
        </button>
        <button
          v-for="page in recipeStore.pagination.totalPages"
          :key="page"
          type="button"
          :class="{ active: page === recipeStore.pagination.currentPage }"
          :aria-current="page === recipeStore.pagination.currentPage ? 'page' : undefined"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
        <button
          type="button"
          :disabled="recipeStore.pagination.currentPage === recipeStore.pagination.totalPages"
          @click="goToPage(recipeStore.pagination.currentPage + 1)"
        >
          <span>Next</span>
          <AppIcon name="arrow-right" size="16" />
        </button>
      </nav>
    </div>
  </section>
</template>
