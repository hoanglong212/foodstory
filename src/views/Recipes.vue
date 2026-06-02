<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import RecipeCard from '../components/RecipeCard.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import { useRecipeStore } from '../stores/recipeStore'

const recipeStore = useRecipeStore()
const deletingRecipeId = ref(null)
let filterTimer = 0

function scheduleRecipeFetch() {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => {
    recipeStore.fetchRecipes(1)
  }, 350)
}

onMounted(() => {
  recipeStore.fetchRecipes(1, { includeMeta: true })
})

watch(
  () => [recipeStore.searchQuery, recipeStore.filters.category, recipeStore.filters.tag],
  () => {
    scheduleRecipeFetch()
  },
)

onBeforeUnmount(() => {
  window.clearTimeout(filterTimer)
  recipeStore.cancelRecipeListRequest()
})

function goToPage(page) {
  const nextPage = Math.min(Math.max(page, 1), recipeStore.pagination.totalPages)
  recipeStore.fetchRecipes(nextPage)
}

async function deleteRecipe(recipe) {
  if (deletingRecipeId.value) {
    return
  }

  const confirmed = window.confirm(`Delete "${recipe.title}"? This cannot be undone.`)
  if (!confirmed) {
    return
  }

  const wasLastItemOnPage = recipeStore.recipeList.length === 1
  deletingRecipeId.value = recipe.id
  try {
    await recipeStore.deleteRecipe(recipe.id)
    const nextPage =
      wasLastItemOnPage && recipeStore.pagination.currentPage > 1
        ? recipeStore.pagination.currentPage - 1
        : recipeStore.pagination.currentPage
    await recipeStore.fetchRecipes(nextPage)
  } catch (error) {
    recipeStore.error = error.message
  } finally {
    deletingRecipeId.value = null
  }
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

    <div v-if="recipeStore.isLoading" class="row g-4" aria-label="Loading recipes">
      <div v-for="index in 6" :key="index" class="col-12 col-md-6 col-xl-4">
        <SkeletonCard />
      </div>
    </div>
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
          <RecipeCard
            :recipe="recipe"
            :is-deleting="deletingRecipeId === recipe.id"
            @delete="deleteRecipe"
          />
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
