<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NutritionChart from '../components/NutritionChart.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import api, { getApiError } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChecklistStore } from '../stores/checklistStore'
import { useFavoriteStore } from '../stores/favoriteStore'
import { useRecipeStore } from '../stores/recipeStore'
import { useUiStore } from '../stores/uiStore'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const authStore = useAuthStore()
const favoriteStore = useFavoriteStore()
const checklistStore = useChecklistStore()
const uiStore = useUiStore()
const commentContent = ref('')
const commentError = ref('')
const editingCommentId = ref(null)
const editingContent = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const isSubmittingComment = ref(false)
const isFavoriteBusy = ref(false)
const isRatingBusy = ref(false)
const isChecklistBusy = ref(false)
const togglingChecklistItemId = ref(null)
const isDeletingRecipe = ref(false)
const savingCommentId = ref(null)
const deletingCommentId = ref(null)
let isAlive = true
let actionSuccessTimer = 0

const recipe = computed(() => recipeStore.selectedRecipe)
const canManageRecipe = computed(() => authStore.isAdmin)
const ratingButtons = [1, 2, 3, 4, 5]

const categoryLabel = computed(() => String(recipe.value?.category_name || 'Recipe').trim())
const tagList = computed(() =>
  (recipe.value?.tags || [])
    .map((tag, index) => {
      const name = typeof tag === 'string' ? tag : tag?.name
      return {
        id: typeof tag === 'object' && tag?.id ? tag.id : `${name || 'tag'}-${index}`,
        name: String(name || '').trim(),
      }
    })
    .filter((tag) => tag.name),
)
const averageRating = computed(() => safeNumber(recipe.value?.average_rating))
const totalRatings = computed(() => Math.max(Math.round(safeNumber(recipe.value?.total_ratings)), 0))
const currentUserRating = computed(() => Math.round(safeNumber(recipe.value?.current_user_rating)))
const ratingPercent = computed(() => Math.min((averageRating.value / 5) * 100, 100))
const favoriteCount = computed(() => Math.max(Math.round(safeNumber(recipe.value?.favorite_count)), 0))
const isRecipeFavorite = computed(() => {
  const currentRecipe = recipe.value
  if (!currentRecipe?.id) {
    return false
  }

  return Boolean(
    currentRecipe.is_favorite ||
      currentRecipe.current_user_favorite ||
      favoriteStore.favoriteIds.includes(Number(currentRecipe.id)),
  )
})
const ratingSummary = computed(() => {
  if (!totalRatings.value) {
    return 'No community ratings yet'
  }

  return `${averageRating.value.toFixed(1)} average from ${totalRatings.value} ${
    totalRatings.value === 1 ? 'rating' : 'ratings'
  }`
})
const recipeDescriptionFallback = computed(() => {
  const description = String(recipe.value?.description || '').trim()
  if (description) {
    return description
  }

  const tagCopy = tagList.value
    .slice(0, 3)
    .map((tag) => tag.name)
    .join(', ')
  const tagPhrase = tagCopy ? ` with ${tagCopy} notes` : ''
  return `A simple ${categoryLabel.value.toLowerCase()} recipe${tagPhrase} with clear ingredients, nutrition details, and community ratings.`
})
const ingredientItems = computed(() => {
  const rawIngredients = recipe.value?.ingredients || recipe.value?.recipe_ingredients || []
  if (!Array.isArray(rawIngredients)) {
    return []
  }

  return rawIngredients
    .map((ingredient, index) => {
      const name = String(
        ingredient?.ingredient_name || ingredient?.name || ingredient?.title || ingredient || '',
      ).trim()
      return {
        key: ingredient?.id || `${name || 'ingredient'}-${index}`,
        name: name || 'Ingredient',
        quantity: String(ingredient?.quantity || ingredient?.amount || '').trim(),
      }
    })
    .filter((ingredient) => ingredient.name)
})
const hasIngredients = computed(() => ingredientItems.value.length > 0)
const recipeNotes = computed(() =>
  String(recipe.value?.notes || recipe.value?.note || recipe.value?.cooking_notes || '').trim(),
)
const instructionSteps = computed(() => {
  const text = String(recipe.value?.instructions || '').trim()
  if (!text) {
    return []
  }

  const lineSteps = text
    .split(/\r?\n+/)
    .map(stripStepPrefix)
    .filter(Boolean)

  if (lineSteps.length > 1) {
    return lineSteps
  }

  const numberedSteps = text
    .split(/(?=\b(?:step\s*)?\d+[\).:-]\s+)/i)
    .map(stripStepPrefix)
    .filter(Boolean)

  if (numberedSteps.length > 1) {
    return numberedSteps
  }

  const sentenceSteps = text
    .match(/[^.!?]+[.!?]?/g)
    ?.map((step) => step.trim())
    .filter(Boolean)

  return sentenceSteps && sentenceSteps.length > 1 ? sentenceSteps : [text]
})
const ratingBreakdown = computed(() => {
  const rawBreakdown = recipe.value?.rating_breakdown || recipe.value?.ratingBreakdown
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }

  if (Array.isArray(rawBreakdown)) {
    rawBreakdown.forEach((item) => {
      const stars = Math.round(safeNumber(item.rating || item.stars || item.value))
      if (counts[stars] !== undefined) {
        counts[stars] = Math.max(Math.round(safeNumber(item.count || item.total)), 0)
      }
    })
  } else if (rawBreakdown && typeof rawBreakdown === 'object') {
    Object.keys(counts).forEach((stars) => {
      counts[stars] = Math.max(Math.round(safeNumber(rawBreakdown[stars])), 0)
    })
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: counts[stars],
    percent: total > 0 ? Math.round((counts[stars] / total) * 100) : 0,
  }))
})
const hasRatingBreakdown = computed(() =>
  ratingBreakdown.value.some((item) => item.count > 0),
)
const macroCards = computed(() => [
  {
    label: 'Protein',
    value: safeNumber(recipe.value?.protein),
    unit: 'g',
    tone: 'green',
  },
  {
    label: 'Carbs',
    value: safeNumber(recipe.value?.carbs),
    unit: 'g',
    tone: 'amber',
  },
  {
    label: 'Fat',
    value: safeNumber(recipe.value?.fat),
    unit: 'g',
    tone: 'rose',
  },
])
const nutritionSummary = computed(() => {
  const calories = safeNumber(recipe.value?.calories)
  const macros = macroCards.value
    .filter((macro) => macro.value > 0)
    .map((macro) => `${macro.value}${macro.unit} ${macro.label.toLowerCase()}`)

  if (!calories && macros.length === 0) {
    return 'Nutrition details are not specified yet.'
  }

  const calorieCopy = calories ? `${calories} calories` : 'calories not specified'
  const macroCopy = macros.length ? ` with ${macros.join(', ')}` : ''
  return `Nutrition is listed as ${calorieCopy}${macroCopy}.`
})
const quickFacts = computed(() => {
  const facts = [
    {
      label: 'Calories',
      value: formatNumberOrFallback(recipe.value?.calories),
      icon: 'utensils',
    },
    {
      label: 'Protein',
      value: formatNumberOrFallback(recipe.value?.protein, 'g'),
      icon: 'trending-up',
    },
    {
      label: 'Saves',
      value: favoriteCount.value.toLocaleString(),
      icon: 'heart',
    },
    {
      label: 'Rating',
      value: averageRating.value > 0 ? `${averageRating.value.toFixed(1)} / 5` : 'New',
      icon: 'star',
    },
  ]

  const optionalFacts = [
    {
      label: 'Servings',
      value: firstPresent(recipe.value?.servings, recipe.value?.serving_size, recipe.value?.yield),
      icon: 'users',
    },
    {
      label: 'Prep',
      value: formatDuration(firstPresent(recipe.value?.prep_time, recipe.value?.prepTime)),
      icon: 'clock',
    },
    {
      label: 'Cook',
      value: formatDuration(firstPresent(recipe.value?.cook_time, recipe.value?.cookTime)),
      icon: 'clock',
    },
    {
      label: 'Difficulty',
      value: firstPresent(recipe.value?.difficulty, recipe.value?.level),
      icon: 'chef-hat',
    },
  ].filter((fact) => fact.value)

  return [...facts, ...optionalFacts]
})
const recipeCardMeta = computed(() => [
  {
    label: 'Servings',
    value: firstPresent(recipe.value?.servings, recipe.value?.serving_size, recipe.value?.yield) || 'Not specified',
  },
  {
    label: 'Prep time',
    value: formatDuration(firstPresent(recipe.value?.prep_time, recipe.value?.prepTime)) || 'Not specified',
  },
  {
    label: 'Cook time',
    value: formatDuration(firstPresent(recipe.value?.cook_time, recipe.value?.cookTime)) || 'Not specified',
  },
  {
    label: 'Total time',
    value: formatDuration(firstPresent(recipe.value?.total_time, recipe.value?.totalTime)) || 'Not specified',
  },
  {
    label: 'Category',
    value: categoryLabel.value,
  },
  {
    label: 'Method',
    value: firstPresent(recipe.value?.method, recipe.value?.cooking_method) || 'Not specified',
  },
  {
    label: 'Cuisine',
    value: firstPresent(recipe.value?.cuisine) || 'Not specified',
  },
  {
    label: 'Keywords',
    value: tagList.value.length ? tagList.value.map((tag) => tag.name).join(', ') : 'Not specified',
  },
])
const loveReasons = computed(() => {
  const reasons = [
    `Built around ${categoryLabel.value.toLowerCase()} flavors with a clear ingredient list.`,
    instructionSteps.value.length > 1
      ? `Organized into ${instructionSteps.value.length} manageable cooking steps.`
      : 'Presented in a concise cooking flow for quick scanning.',
    nutritionSummary.value,
  ]

  if (tagList.value.length) {
    reasons.push(`Tagged with ${tagList.value.slice(0, 3).map((tag) => tag.name).join(', ')} for easier browsing.`)
  }

  return reasons
})

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function stripStepPrefix(step) {
  return String(step)
    .replace(/^\s*(?:step\s*)?\d+[\).:-]?\s*/i, '')
    .trim()
}

function firstPresent(...values) {
  const value = values.find((item) => item !== null && item !== undefined && String(item).trim() !== '')
  return value === undefined ? '' : String(value).trim()
}

function formatDuration(value) {
  const present = firstPresent(value)
  if (!present) {
    return ''
  }

  const number = Number(present)
  if (Number.isFinite(number) && number > 0) {
    return `${number} min`
  }

  return present
}

function formatNumberOrFallback(value, unit = '') {
  const number = safeNumber(value)
  return number ? `${number}${unit}` : 'Not specified'
}

function clearSuccessMessage() {
  if (actionSuccessTimer) {
    window.clearTimeout(actionSuccessTimer)
    actionSuccessTimer = 0
  }
  actionSuccess.value = ''
}

function showSuccessMessage(message) {
  clearSuccessMessage()
  actionSuccess.value = message
  actionSuccessTimer = window.setTimeout(() => {
    if (isAlive) {
      actionSuccess.value = ''
    }
    actionSuccessTimer = 0
  }, 3000)
}

function formatDate(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function commentDateLabel(comment) {
  const updatedDate = formatDate(comment.updated_at)
  const createdDate = formatDate(comment.created_at)
  if (isCommentUpdated(comment) && updatedDate) {
    return `Updated ${updatedDate}`
  }

  return createdDate || updatedDate
}

function isCommentUpdated(comment) {
  if (!comment.created_at || !comment.updated_at) {
    return false
  }

  return new Date(comment.updated_at).getTime() !== new Date(comment.created_at).getTime()
}

async function loadRecipe(recipeId = route.params.id) {
  actionError.value = ''
  clearSuccessMessage()
  checklistStore.setChecklist(null)
  try {
    const loadedRecipe = await recipeStore.fetchRecipeById(recipeId)
    if (!isAlive || !loadedRecipe) {
      return
    }
    if (authStore.isLoggedIn) {
      checklistStore.fetchChecklist(recipeId)
    }
  } catch {
    // The store exposes a user-facing error state in the template.
  }
}

async function setRating(value) {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isRatingBusy.value || value < 1 || value > 5) {
    return
  }

  isRatingBusy.value = true
  actionError.value = ''
  clearSuccessMessage()
  try {
    const recipeId = recipe.value.id
    const response = await api.post(`/recipes/${recipeId}/rating`, {
      rating_value: value,
    })
    if (!isAlive) {
      return
    }
    const ratingPatch = {
      average_rating: response.data.average_rating,
      total_ratings: response.data.total_ratings,
      current_user_rating: response.data.current_user_rating,
    }
    recipeStore.updateRecipeCache(recipeId, ratingPatch)
    favoriteStore.updateFavoriteCache(recipeId, ratingPatch)
    showSuccessMessage('Rating submitted.')
    uiStore.setSuccess('Rating submitted.')
  } catch (error) {
    if (!isAlive) {
      return
    }
    actionError.value = getApiError(error, 'Unable to save rating.')
    uiStore.setError(actionError.value)
  } finally {
    if (isAlive) {
      isRatingBusy.value = false
    }
  }
}

async function toggleFavorite() {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isFavoriteBusy.value) {
    return
  }

  isFavoriteBusy.value = true
  actionError.value = ''
  clearSuccessMessage()
  try {
    const currentRecipe = recipe.value
    const recipeId = currentRecipe.id

    if (isRecipeFavorite.value) {
      const changed = await favoriteStore.removeFavorite(recipeId)
      if (!isAlive || !changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: false,
        current_user_favorite: false,
        favorite_count: Math.max(Number(currentRecipe.favorite_count || 0) - 1, 0),
      })
      showSuccessMessage('Removed from favorites.')
    } else {
      const nextCount = Number(currentRecipe.favorite_count || 0) + 1
      const changed = await favoriteStore.addFavorite(recipeId, {
        ...currentRecipe,
        is_favorite: true,
        current_user_favorite: true,
        favorite_count: nextCount,
      })
      if (!isAlive || !changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: true,
        current_user_favorite: true,
        favorite_count: nextCount,
      })
      showSuccessMessage('Saved to favorites.')
    }
  } catch (error) {
    if (!isAlive) {
      return
    }
    actionError.value = error.message
    uiStore.setError(actionError.value)
  } finally {
    if (isAlive) {
      isFavoriteBusy.value = false
    }
  }
}

async function submitComment() {
  if (isSubmittingComment.value) {
    return
  }

  commentError.value = ''
  if (commentContent.value.trim().length < 5) {
    commentError.value = 'Comment must be at least 5 characters.'
    return
  }

  isSubmittingComment.value = true
  try {
    const response = await api.post(`/recipes/${recipe.value.id}/comments`, {
      content: commentContent.value.trim(),
    })
    if (!isAlive) {
      return
    }
    recipeStore.updateRecipeCache(recipe.value.id, {
      comments: [response.data.comment, ...(recipe.value.comments || [])],
    })
    commentContent.value = ''
    showSuccessMessage('Comment added.')
    uiStore.setSuccess('Comment added.')
  } catch (error) {
    if (!isAlive) {
      return
    }
    commentError.value = getApiError(error, 'Unable to add comment.')
    uiStore.setError(commentError.value)
  } finally {
    if (isAlive) {
      isSubmittingComment.value = false
    }
  }
}

function startEditComment(comment) {
  editingCommentId.value = comment.id
  editingContent.value = comment.content
}

async function saveComment(comment) {
  if (savingCommentId.value) {
    return
  }

  if (editingContent.value.trim().length < 5) {
    commentError.value = 'Edited comment must be at least 5 characters.'
    return
  }

  savingCommentId.value = comment.id
  try {
    const response = await api.put(`/comments/${comment.id}`, {
      content: editingContent.value.trim(),
    })
    if (!isAlive) {
      return
    }
    recipeStore.updateRecipeCache(recipe.value.id, {
      comments: recipe.value.comments.map((item) =>
        item.id === comment.id ? response.data.comment : item,
      ),
    })
    editingCommentId.value = null
    editingContent.value = ''
    showSuccessMessage('Comment updated.')
    uiStore.setSuccess('Comment updated.')
  } catch (error) {
    if (!isAlive) {
      return
    }
    commentError.value = getApiError(error, 'Unable to edit comment.')
    uiStore.setError(commentError.value)
  } finally {
    if (isAlive) {
      savingCommentId.value = null
    }
  }
}

async function deleteComment(comment) {
  if (deletingCommentId.value) {
    return
  }

  const confirmed = window.confirm('Delete this comment?')
  if (!confirmed) {
    return
  }

  deletingCommentId.value = comment.id
  try {
    await api.delete(`/comments/${comment.id}`)
    if (!isAlive) {
      return
    }
    recipeStore.updateRecipeCache(recipe.value.id, {
      comments: (recipe.value.comments || []).filter((item) => item.id !== comment.id),
    })
    showSuccessMessage('Comment deleted.')
    uiStore.setSuccess('Comment deleted.')
  } catch (error) {
    if (!isAlive) {
      return
    }
    commentError.value = getApiError(error, 'Unable to delete comment.')
    uiStore.setError(commentError.value)
  } finally {
    if (isAlive) {
      deletingCommentId.value = null
    }
  }
}

async function generateChecklist() {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isChecklistBusy.value) {
    return
  }

  isChecklistBusy.value = true
  actionError.value = ''
  clearSuccessMessage()
  try {
    const checklist = await checklistStore.generateChecklist(recipe.value.id)
    if (!isAlive || !checklist) {
      return
    }
    showSuccessMessage('Checklist generated.')
    uiStore.setSuccess('Checklist generated.')
  } catch (error) {
    if (!isAlive) {
      return
    }
    actionError.value = error.message
    uiStore.setError(actionError.value)
  } finally {
    if (isAlive) {
      isChecklistBusy.value = false
    }
  }
}

async function toggleChecklistItem(item) {
  if (togglingChecklistItemId.value) {
    return
  }

  togglingChecklistItemId.value = item.id
  actionError.value = ''
  try {
    await checklistStore.toggleItem(item.id)
  } catch (error) {
    if (!isAlive) {
      return
    }
    actionError.value = error.message
    uiStore.setError(actionError.value)
  } finally {
    if (isAlive) {
      togglingChecklistItemId.value = null
    }
  }
}

async function deleteRecipe() {
  if (isDeletingRecipe.value) {
    return
  }

  const confirmed = window.confirm(`Delete "${recipe.value.title}"?`)
  if (!confirmed) {
    return
  }

  isDeletingRecipe.value = true
  try {
    await recipeStore.deleteRecipe(recipe.value.id)
    if (!isAlive) {
      return
    }
    router.push('/recipes')
  } catch (error) {
    if (!isAlive) {
      return
    }
    actionError.value = error.message
    uiStore.setError(actionError.value)
  } finally {
    if (isAlive) {
      isDeletingRecipe.value = false
    }
  }
}

onMounted(() => loadRecipe())

watch(
  () => route.params.id,
  (id, previousId) => {
    if (id && id !== previousId) {
      loadRecipe(id)
    }
  },
)

onBeforeUnmount(() => {
  isAlive = false
  clearSuccessMessage()
  recipeStore.cancelSelectedRecipeRequest()
})
</script>

<template>
  <section class="recipe-detail recipe-blog-page page-pad">
    <SkeletonCard v-if="recipeStore.isLoading" variant="detail" />
    <p v-else-if="recipeStore.error" class="form-error" role="alert">
      {{ recipeStore.error }}
    </p>

    <article v-else-if="recipe" class="recipe-blog-layout">
      <nav class="recipe-blog-topnav" aria-label="Recipe navigation">
        <RouterLink class="recipe-blog-back" to="/recipes">
          <AppIcon name="arrow-left" size="18" />
          <span>Back to recipes</span>
        </RouterLink>
      </nav>

      <section class="recipe-blog-hero" aria-labelledby="recipe-title">
        <div class="recipe-blog-copy">
          <div class="recipe-blog-breadcrumb" aria-label="Breadcrumb">
            <RouterLink to="/recipes">Recipes</RouterLink>
            <span>/</span>
            <span>{{ categoryLabel }}</span>
          </div>

          <span class="recipe-category-pill">
            <AppIcon name="tags" size="14" />
            {{ categoryLabel }}
          </span>

          <h1 id="recipe-title">{{ recipe.title }}</h1>

          <div class="recipe-blog-rating-line" aria-label="Recipe rating summary">
            <span class="rating-stars" aria-hidden="true">
              <AppIcon
                v-for="value in ratingButtons"
                :key="value"
                name="star"
                size="18"
                :class="{ active: value <= Math.round(averageRating) }"
              />
            </span>
            <strong>{{ averageRating > 0 ? averageRating.toFixed(1) : 'New' }}</strong>
            <span>{{ totalRatings }} {{ totalRatings === 1 ? 'review' : 'reviews' }}</span>
          </div>

          <p class="recipe-blog-lead">
            {{ recipeDescriptionFallback }}
          </p>

          <div v-if="tagList.length" class="tag-row recipe-blog-tags" aria-label="Recipe tags">
            <span v-for="tag in tagList" :key="tag.id">#{{ tag.name }}</span>
          </div>

          <div class="recipe-blog-actions" aria-label="Recipe actions">
            <button
              v-if="authStore.isLoggedIn"
              class="btn btn-primary recipe-primary-action"
              type="button"
              :disabled="isChecklistBusy"
              @click="generateChecklist"
            >
              <AppIcon name="check" size="18" />
              <span>{{ isChecklistBusy ? 'Preparing...' : 'Generate Checklist' }}</span>
            </button>
            <RouterLink
              v-else
              class="btn btn-primary recipe-primary-action"
              :to="{ name: 'login', query: { redirect: route.fullPath } }"
            >
              Login for checklist
            </RouterLink>

            <button
              v-if="authStore.isLoggedIn"
              :class="['btn', isRecipeFavorite ? 'btn-primary' : 'btn-outline', 'recipe-secondary-action']"
              type="button"
              :disabled="isFavoriteBusy"
              :aria-pressed="isRecipeFavorite"
              @click="toggleFavorite"
            >
              <AppIcon name="heart" size="18" />
              <span>{{ isFavoriteBusy ? 'Saving...' : isRecipeFavorite ? 'Unfavorite' : 'Favorite' }}</span>
              <small>{{ favoriteCount }}</small>
            </button>
            <RouterLink
              v-else
              class="btn btn-outline recipe-secondary-action"
              :to="{ name: 'login', query: { redirect: route.fullPath } }"
            >
              Login to save
            </RouterLink>

            <a class="btn btn-outline recipe-secondary-action" href="#recipe-card">
              <AppIcon name="book-open" size="18" />
              <span>Jump to recipe</span>
            </a>

            <button class="btn recipe-coming-soon-action" type="button" disabled>
              <AppIcon name="map-pin" size="18" />
              <span>Food place tracking</span>
              <small>Coming soon</small>
            </button>
          </div>

          <Transition name="detail-message">
            <p v-if="actionSuccess" class="form-success recipe-blog-feedback" role="status">
              {{ actionSuccess }}
            </p>
          </Transition>
          <p v-if="actionError" class="form-error recipe-blog-feedback" role="alert">
            {{ actionError }}
          </p>

          <div v-if="canManageRecipe" class="recipe-admin-toolbar">
            <RouterLink
              class="btn btn-outline"
              :to="{ name: 'recipe-edit', params: { id: recipe.id } }"
            >
              <AppIcon name="pen" size="18" />
              <span>Edit Recipe</span>
            </RouterLink>
            <button
              class="btn btn-outline danger"
              type="button"
              :disabled="isDeletingRecipe"
              @click="deleteRecipe"
            >
              <AppIcon name="trash" size="18" />
              <span>{{ isDeletingRecipe ? 'Deleting...' : 'Delete Recipe' }}</span>
            </button>
          </div>
        </div>

        <figure class="recipe-blog-image">
          <img
            v-if="recipe.image_url"
            :src="recipe.image_url"
            :alt="`Photo of ${recipe.title}`"
            decoding="async"
            fetchpriority="high"
          />
          <div v-else class="recipe-image-placeholder" aria-label="No recipe image available">
            <AppIcon name="utensils" size="36" />
            <span>No recipe image</span>
          </div>
          <figcaption>
            <span>{{ categoryLabel }}</span>
            <strong>{{ ratingSummary }}</strong>
          </figcaption>
        </figure>
      </section>

      <section class="recipe-facts-strip" aria-label="Recipe quick facts">
        <div v-for="fact in quickFacts" :key="fact.label" class="recipe-fact">
          <AppIcon :name="fact.icon" size="18" />
          <span>{{ fact.label }}</span>
          <strong>{{ fact.value }}</strong>
        </div>
      </section>

      <div class="recipe-blog-content">
        <div class="recipe-blog-main">
          <section id="overview" class="recipe-blog-section recipe-story-section">
            <div class="recipe-section-heading">
              <span class="section-kicker">Recipe intro</span>
              <h2>Why you'll love this recipe</h2>
            </div>
            <p class="recipe-story-copy">{{ recipeDescriptionFallback }}</p>
            <ul class="recipe-story-list">
              <li v-for="reason in loveReasons" :key="reason">
                <AppIcon name="check" size="17" />
                <span>{{ reason }}</span>
              </li>
            </ul>
          </section>

          <section id="ingredients" class="recipe-blog-section recipe-ingredients-section">
            <div class="recipe-section-heading split">
              <div>
                <span class="section-kicker">Mise en place</span>
                <h2>Ingredients</h2>
              </div>
              <span class="section-count">{{ ingredientItems.length }} items</span>
            </div>

            <ul v-if="hasIngredients" class="ingredient-list recipe-checklist-ingredients">
              <li v-for="ingredient in ingredientItems" :key="ingredient.key">
                <span class="ingredient-check" aria-hidden="true">
                  <AppIcon name="check" size="15" />
                </span>
                <span>{{ ingredient.name }}</span>
                <strong>{{ ingredient.quantity || 'as needed' }}</strong>
              </li>
            </ul>
            <p v-else class="empty-state">No ingredients have been added yet.</p>

            <div class="recipe-section-cta">
              <button
                v-if="authStore.isLoggedIn"
                class="btn btn-outline"
                type="button"
                :disabled="isChecklistBusy"
                @click="generateChecklist"
              >
                <AppIcon name="check" size="18" />
                <span>{{ isChecklistBusy ? 'Preparing...' : 'Generate ingredient checklist' }}</span>
              </button>
              <RouterLink
                v-else
                class="btn btn-outline"
                :to="{ name: 'login', query: { redirect: route.fullPath } }"
              >
                Login to generate checklist
              </RouterLink>
            </div>
          </section>

          <section id="checklist" class="recipe-blog-section checklist-panel">
            <div class="recipe-section-heading split">
              <div>
                <span class="section-kicker">Shopping helper</span>
                <h2>Cooking checklist</h2>
              </div>
            </div>
            <p v-if="!authStore.isLoggedIn">
              <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
                Login to generate a checklist.
              </RouterLink>
            </p>
            <p v-else-if="!checklistStore.activeChecklist" class="muted-copy">
              Generate a checklist to tick off ingredients while shopping or cooking.
            </p>
            <ul v-else class="checklist-list recipe-live-checklist">
              <li v-for="item in checklistStore.items" :key="item.id">
                <label>
                  <input
                    type="checkbox"
                    :checked="item.is_checked"
                    :disabled="togglingChecklistItemId === item.id"
                    @change="toggleChecklistItem(item)"
                  />
                  <span>{{ item.ingredient_name }}</span>
                  <small>{{ item.quantity }}</small>
                </label>
              </li>
            </ul>
          </section>

          <section id="instructions" class="recipe-blog-section instruction-section">
            <div class="recipe-section-heading split">
              <div>
                <span class="section-kicker">How to make</span>
                <h2>Step-by-step instructions</h2>
              </div>
              <span class="section-count">{{ instructionSteps.length }} steps</span>
            </div>
            <ol v-if="instructionSteps.length" class="instruction-steps recipe-blog-steps">
              <li v-for="(step, index) in instructionSteps" :key="`${index}-${step}`">
                <span class="step-index">{{ index + 1 }}</span>
                <p>{{ step }}</p>
              </li>
            </ol>
            <p v-else class="empty-state">No instructions have been added yet.</p>
            <aside v-if="recipeNotes" class="recipe-note">
              <strong>Notes</strong>
              <p>{{ recipeNotes }}</p>
            </aside>
          </section>

          <section id="recipe-card" class="recipe-card-print" aria-labelledby="recipe-card-title">
            <div class="recipe-card-print-header">
              <span class="section-kicker">Recipe card</span>
              <h2 id="recipe-card-title">{{ recipe.title }}</h2>
              <p>{{ recipeDescriptionFallback }}</p>
              <div class="recipe-card-rating">
                <span class="rating-stars" aria-hidden="true">
                  <AppIcon
                    v-for="value in ratingButtons"
                    :key="value"
                    name="star"
                    size="17"
                    :class="{ active: value <= Math.round(averageRating) }"
                  />
                </span>
                <strong>{{ ratingSummary }}</strong>
              </div>
            </div>

            <dl class="recipe-card-meta">
              <div v-for="item in recipeCardMeta" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>

            <div class="recipe-card-columns">
              <section>
                <h3>Ingredients</h3>
                <ul class="recipe-card-ingredients">
                  <li v-for="ingredient in ingredientItems" :key="`card-${ingredient.key}`">
                    <strong>{{ ingredient.quantity || 'as needed' }}</strong>
                    <span>{{ ingredient.name }}</span>
                  </li>
                </ul>
                <p v-if="!hasIngredients" class="muted-copy">No ingredients specified.</p>
              </section>

              <section>
                <h3>Instructions</h3>
                <ol class="recipe-card-instructions">
                  <li v-for="(step, index) in instructionSteps" :key="`card-step-${index}`">
                    {{ step }}
                  </li>
                </ol>
                <p v-if="!instructionSteps.length" class="muted-copy">No instructions specified.</p>
              </section>
            </div>

            <div class="recipe-card-footer">
              <section>
                <h3>Notes</h3>
                <p>{{ recipeNotes || 'No additional notes.' }}</p>
              </section>
              <section>
                <h3>Nutrition</h3>
                <p>{{ nutritionSummary }}</p>
              </section>
            </div>
          </section>

          <section id="ratings" class="recipe-blog-section rating-section">
            <div class="recipe-section-heading split">
              <div>
                <span class="section-kicker">Community score</span>
                <h2>Ratings</h2>
              </div>
              <span class="section-count">{{ totalRatings }} total</span>
            </div>

            <div class="rating-layout recipe-rating-layout">
              <div class="rating-overview-card">
                <span class="rating-score">{{ averageRating > 0 ? averageRating.toFixed(1) : 'New' }}</span>
                <div class="rating-stars" aria-hidden="true">
                  <AppIcon
                    v-for="value in ratingButtons"
                    :key="value"
                    name="star"
                    size="20"
                    :class="{ active: value <= Math.round(averageRating) }"
                  />
                </div>
                <p>{{ ratingSummary }}</p>
                <div class="rating-meter" aria-hidden="true">
                  <span :style="{ width: `${ratingPercent}%` }"></span>
                </div>
              </div>

              <div class="rating-breakdown-card">
                <h3>Rating breakdown</h3>
                <div v-if="hasRatingBreakdown" class="rating-breakdown-list">
                  <div v-for="item in ratingBreakdown" :key="item.stars" class="rating-breakdown-row">
                    <span>{{ item.stars }} stars</span>
                    <div class="rating-breakdown-track">
                      <span :style="{ width: `${item.percent}%` }"></span>
                    </div>
                    <strong>{{ item.count }}</strong>
                  </div>
                </div>
                <p v-else class="muted-copy">
                  Breakdown will appear when the API returns per-star rating counts.
                </p>
              </div>

              <div class="personal-rating-card">
                <h3>Your rating</h3>
                <div v-if="authStore.isLoggedIn" class="rating-buttons">
                  <button
                    v-for="value in ratingButtons"
                    :key="value"
                    type="button"
                    :class="{ active: value <= currentUserRating }"
                    :aria-label="`Rate ${value} out of 5`"
                    :aria-pressed="value === currentUserRating"
                    :disabled="isRatingBusy"
                    @click="setRating(value)"
                  >
                    <AppIcon name="star" size="21" />
                  </button>
                </div>
                <p v-if="authStore.isLoggedIn" class="muted-copy">
                  {{ currentUserRating ? `You rated this ${currentUserRating} out of 5.` : 'Choose a star to rate this recipe.' }}
                </p>
                <p v-else>
                  <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
                    Login to rate this recipe.
                  </RouterLink>
                </p>
              </div>
            </div>
          </section>

          <section id="nutrition" class="recipe-blog-section recipe-blog-nutrition">
            <div class="nutrition-copy">
              <span class="section-kicker">Nutrition</span>
              <h2>Macro balance</h2>
              <p class="calorie-total">{{ formatNumberOrFallback(recipe.calories) }} calories</p>
              <p class="muted-copy">{{ nutritionSummary }}</p>
              <div class="macro-card-grid">
                <article
                  v-for="macro in macroCards"
                  :key="macro.label"
                  :class="['macro-card', `tone-${macro.tone}`]"
                >
                  <span>{{ macro.label }}</span>
                  <strong>{{ macro.value }}{{ macro.unit }}</strong>
                </article>
              </div>
            </div>
            <div class="nutrition-chart-shell recipe-blog-chart-shell">
              <NutritionChart
                :calories="recipe.calories"
                :protein="recipe.protein"
                :carbs="recipe.carbs"
                :fat="recipe.fat"
              />
            </div>
          </section>

          <section id="reviews" class="recipe-blog-section comments-panel">
            <div class="recipe-section-heading split">
              <div>
                <span class="section-kicker">Reviews</span>
                <h2>Comments and cooking notes</h2>
              </div>
              <span class="section-count">{{ (recipe.comments || []).length }} notes</span>
            </div>

            <form v-if="authStore.isLoggedIn" class="comment-form" @submit.prevent="submitComment">
              <label for="comment-content">Add a review or cooking note</label>
              <textarea
                id="comment-content"
                v-model="commentContent"
                rows="4"
                :aria-invalid="Boolean(commentError)"
                aria-describedby="comment-error"
              ></textarea>
              <p v-if="commentError" id="comment-error" class="field-error">{{ commentError }}</p>
              <button class="btn btn-primary" type="submit" :disabled="isSubmittingComment">
                {{ isSubmittingComment ? 'Posting...' : 'Post Comment' }}
              </button>
            </form>
            <p v-else>
              <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
                Login to comment.
              </RouterLink>
            </p>

            <div class="comment-list">
              <p v-if="(recipe.comments || []).length === 0" class="empty-state">
                No comments yet. Be the first to share a cooking note.
              </p>
              <article v-for="comment in recipe.comments || []" :key="comment.id" class="comment-item">
                <header>
                  <div>
                    <strong>{{ comment.username || comment.user_name || 'FoodStory cook' }}</strong>
                    <span v-if="isCommentUpdated(comment)" class="comment-status">Edited</span>
                  </div>
                  <time v-if="commentDateLabel(comment)" :datetime="comment.updated_at || comment.created_at">
                    {{ commentDateLabel(comment) }}
                  </time>
                </header>

                <div v-if="editingCommentId === comment.id" class="comment-edit">
                  <label :for="`edit-comment-${comment.id}`">Edit comment</label>
                  <textarea :id="`edit-comment-${comment.id}`" v-model="editingContent" rows="3"></textarea>
                  <div class="detail-actions">
                    <button
                      class="btn btn-primary"
                      type="button"
                      :disabled="savingCommentId === comment.id"
                      @click="saveComment(comment)"
                    >
                      {{ savingCommentId === comment.id ? 'Saving...' : 'Save' }}
                    </button>
                    <button class="btn btn-outline" type="button" @click="editingCommentId = null">
                      Cancel
                    </button>
                  </div>
                </div>
                <p v-else>{{ comment.content }}</p>

                <div
                  v-if="authStore.user?.id === comment.user_id && editingCommentId !== comment.id"
                  class="comment-actions"
                >
                  <button type="button" @click="startEditComment(comment)">Edit</button>
                  <button
                    type="button"
                    :disabled="deletingCommentId === comment.id"
                    @click="deleteComment(comment)"
                  >
                    {{ deletingCommentId === comment.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="recipe-blog-sidebar" aria-label="Recipe page links">
          <section class="recipe-side-card">
            <span class="section-kicker">On this page</span>
            <nav>
              <a href="#overview">Why you'll love it</a>
              <a href="#ingredients">Ingredients</a>
              <a href="#instructions">How to make</a>
              <a href="#recipe-card">Recipe card</a>
              <a href="#ratings">Ratings</a>
              <a href="#nutrition">Nutrition</a>
              <a href="#reviews">Reviews</a>
            </nav>
          </section>

          <section class="recipe-side-card recipe-side-summary">
            <span class="section-kicker">At a glance</span>
            <h2>{{ categoryLabel }}</h2>
            <p>{{ ratingSummary }}</p>
            <dl>
              <div>
                <dt>Saves</dt>
                <dd>{{ favoriteCount }}</dd>
              </div>
              <div>
                <dt>Calories</dt>
                <dd>{{ formatNumberOrFallback(recipe.calories) }}</dd>
              </div>
              <div>
                <dt>Protein</dt>
                <dd>{{ formatNumberOrFallback(recipe.protein, 'g') }}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </article>
  </section>
</template>
