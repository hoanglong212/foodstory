<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NutritionChart from '../components/NutritionChart.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import { useRealtimeComments } from '../composables/useRealtimeComments'
import api, { getApiError } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChecklistStore } from '../stores/checklistStore'
import { useCommentStore } from '../stores/commentStore'
import { useFavoriteStore } from '../stores/favoriteStore'
import { useRatingStore } from '../stores/ratingStore'
import { useRecipeStore } from '../stores/recipeStore'
import { useUiStore } from '../stores/uiStore'

const FALLBACK_IMAGE = '/images/food-placeholder.jpg'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const authStore = useAuthStore()
const favoriteStore = useFavoriteStore()
const checklistStore = useChecklistStore()
const commentStore = useCommentStore()
const ratingStore = useRatingStore()
const uiStore = useUiStore()
const realtimeRecipeId = computed(() => route.params.id)
const { isConnected, connectionFailed } = useRealtimeComments(realtimeRecipeId)

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
const isCookMode = ref(false)
const togglingChecklistItemId = ref(null)
const isDeletingRecipe = ref(false)
const savingCommentId = ref(null)
const deletingCommentId = ref(null)
let isAlive = true
let actionSuccessTimer = 0

const ratingButtons = [1, 2, 3, 4, 5]
const recipe = computed(() => recipeStore.selectedRecipe)
const canManageRecipe = computed(() => authStore.isAdmin)
const categoryLabel = computed(() => firstPresent(recipe.value?.category_name) || 'Recipe')
const heroImage = computed(() => firstPresent(recipe.value?.image_url) || FALLBACK_IMAGE)
const averageRating = computed(() => safeNumber(recipe.value?.avg_rating || recipe.value?.average_rating))
const ratingCount = computed(() =>
  Math.max(Math.round(safeNumber(recipe.value?.rating_count || recipe.value?.total_ratings)), 0),
)
const commentCount = computed(() =>
  Math.max(
    Math.round(safeNumber(recipe.value?.comment_count)),
    Array.isArray(recipe.value?.comments) ? recipe.value.comments.length : 0,
  ),
)
const favoriteCount = computed(() => Math.max(Math.round(safeNumber(recipe.value?.favorite_count)), 0))
const currentUserRating = computed(() => Math.round(safeNumber(recipe.value?.current_user_rating)))
const ratingPercent = computed(() => Math.min((averageRating.value / 5) * 100, 100))
const createdDateLabel = computed(() =>
  formatDate(recipe.value?.created_at || recipe.value?.createdAt || recipe.value?.updated_at),
)
const authorLine = computed(() =>
  createdDateLabel.value ? `By FoodStory Kitchen / ${createdDateLabel.value}` : 'By FoodStory Kitchen',
)

const tagList = computed(() =>
  (recipe.value?.tags || [])
    .map((tag, index) => {
      const name = typeof tag === 'string' ? tag : tag?.name
      return {
        id: typeof tag === 'object' && tag?.id ? tag.id : `${name || 'tag'}-${index}`,
        name: firstPresent(name),
      }
    })
    .filter((tag) => tag.name),
)

const ingredientItems = computed(() => {
  const rawIngredients = recipe.value?.ingredients || recipe.value?.recipe_ingredients || []
  if (!Array.isArray(rawIngredients)) {
    return []
  }

  return rawIngredients
    .map((ingredient, index) => {
      const name = firstPresent(
        ingredient?.ingredient_name,
        ingredient?.name,
        ingredient?.title,
        ingredient,
      )
      return {
        key: ingredient?.id || `${name || 'ingredient'}-${index}`,
        name: name || 'Ingredient',
        quantity: firstPresent(ingredient?.quantity, ingredient?.amount),
      }
    })
    .filter((ingredient) => ingredient.name)
})
const hasIngredients = computed(() => ingredientItems.value.length > 0)
const relatedRecipes = computed(() => recipe.value?.related_recipes || recipe.value?.relatedRecipes || [])
const checklistTotal = computed(() =>
  checklistStore.activeChecklist ? checklistStore.items.length : ingredientItems.value.length,
)
const checklistChecked = computed(() =>
  checklistStore.activeChecklist
    ? checklistStore.items.filter((item) => Boolean(item.is_checked)).length
    : 0,
)
const checklistProgress = computed(() =>
  checklistTotal.value
    ? Math.round((checklistChecked.value / checklistTotal.value) * 100)
    : 0,
)

const description = computed(() => {
  const text = firstPresent(recipe.value?.description)
  if (text) {
    return text
  }

  const tagText = tagList.value
    .slice(0, 3)
    .map((tag) => tag.name)
    .join(', ')
  return `A ${categoryLabel.value.toLowerCase()} recipe with clear ingredients, step-by-step instructions, and community cooking notes${tagText ? ` for ${tagText}` : ''}.`
})
const blogIntro = computed(() => firstPresent(recipe.value?.blog_intro, recipe.value?.blogIntro) || description.value)
const recipeNotes = computed(() =>
  firstPresent(
    recipe.value?.recipe_notes,
    recipe.value?.recipeNotes,
    recipe.value?.notes,
    recipe.value?.note,
    recipe.value?.cooking_notes,
  ),
)
const storageNotes = computed(() =>
  firstPresent(recipe.value?.storage_notes, recipe.value?.storageNotes) ||
  'Store leftovers in an airtight container in the refrigerator. Reheat gently and refresh with a small splash of water or sauce if needed.',
)
const whyLoveItItems = computed(() => {
  const explicit = splitListText(firstPresent(recipe.value?.why_love_it, recipe.value?.whyLoveIt))
  if (explicit.length) {
    return explicit
  }

  const reasons = [
    `It brings ${categoryLabel.value.toLowerCase()} flavors into a practical home-kitchen format.`,
    hasIngredients.value
      ? `The ingredient list is specific enough to shop from, with ${ingredientItems.value.length} measured items.`
      : 'The method is written for easy scanning while you cook.',
    instructionSteps.value.length > 1
      ? `The method is split into ${instructionSteps.value.length} readable steps.`
      : 'The instructions stay focused and approachable.',
  ]

  if (ratingCount.value) {
    reasons.push(`FoodStory cooks have rated it ${averageRating.value.toFixed(1)} from ${ratingCount.value} ratings.`)
  }

  return reasons
})
const instructionSteps = computed(() => splitInstructions(recipe.value?.instructions))
const quickInfo = computed(() => [
  {
    label: 'Serves',
    value: firstPresent(recipe.value?.servings, recipe.value?.serving_size, recipe.value?.yield) || 'N/A',
  },
  {
    label: 'Prep time',
    value: formatDuration(firstPresent(recipe.value?.prep_time, recipe.value?.prepTime)),
  },
  {
    label: 'Cook time',
    value: formatDuration(firstPresent(recipe.value?.cook_time, recipe.value?.cookTime)),
  },
  {
    label: 'Difficulty',
    value: firstPresent(recipe.value?.difficulty, recipe.value?.level) || 'N/A',
  },
])
const recipeCardMeta = computed(() => [
  {
    label: 'Prep time',
    value: formatDuration(firstPresent(recipe.value?.prep_time, recipe.value?.prepTime)),
  },
  {
    label: 'Cook time',
    value: formatDuration(firstPresent(recipe.value?.cook_time, recipe.value?.cookTime)),
  },
  {
    label: 'Serves',
    value: firstPresent(recipe.value?.servings, recipe.value?.serving_size, recipe.value?.yield) || 'N/A',
  },
  {
    label: 'Calories',
    value: formatNumber(recipe.value?.calories),
  },
  {
    label: 'Protein',
    value: formatNumber(recipe.value?.protein, 'g'),
  },
  {
    label: 'Carbs',
    value: formatNumber(recipe.value?.carbs, 'g'),
  },
  {
    label: 'Fat',
    value: formatNumber(recipe.value?.fat, 'g'),
  },
  {
    label: 'Difficulty',
    value: firstPresent(recipe.value?.difficulty, recipe.value?.level) || 'N/A',
  },
])
const nutritionItems = computed(() => [
  {
    label: 'Protein',
    value: formatNumber(recipe.value?.protein, 'g'),
    className: 'protein',
  },
  {
    label: 'Carbs',
    value: formatNumber(recipe.value?.carbs, 'g'),
    className: 'carbs',
  },
  {
    label: 'Fat',
    value: formatNumber(recipe.value?.fat, 'g'),
    className: 'fat',
  },
])
const ratingSummary = computed(() => {
  if (!ratingCount.value) {
    return 'No ratings yet'
  }

  return `${averageRating.value.toFixed(1)} from ${ratingCount.value} ${ratingCount.value === 1 ? 'rating' : 'ratings'}`
})
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

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function firstPresent(...values) {
  const value = values.find((item) => item !== null && item !== undefined && String(item).trim())
  return value === undefined ? '' : String(value).trim()
}

function formatDuration(value) {
  const present = firstPresent(value)
  if (!present) {
    return 'N/A'
  }

  const number = Number(present)
  return Number.isFinite(number) && number > 0 ? `${number} min` : present
}

function formatNumber(value, unit = '') {
  const number = safeNumber(value)
  return number ? `${number}${unit}` : 'N/A'
}

function relatedRecipeDescription(item) {
  const text = firstPresent(item?.description, item?.blog_intro, item?.blogIntro)
  if (!text) {
    return `Another ${firstPresent(item?.category_name) || categoryLabel.value} recipe from the FoodStory kitchen.`
  }

  return text.length > 116 ? `${text.slice(0, 116).trim()}...` : text
}

function relatedRecipeImage(item) {
  return firstPresent(item?.image_url, item?.imageUrl) || FALLBACK_IMAGE
}

function relatedRecipeMeta(item) {
  const ratingCountValue = Math.max(
    Math.round(safeNumber(item?.rating_count || item?.total_ratings)),
    0,
  )
  const averageValue = safeNumber(item?.avg_rating || item?.average_rating)
  const prep = Number.parseInt(String(item?.prep_time || item?.prepTime || ''), 10) || 0
  const cook = Number.parseInt(String(item?.cook_time || item?.cookTime || ''), 10) || 0
  const time = prep + cook
  const ratingText = ratingCountValue
    ? `${averageValue ? averageValue.toFixed(1) : 'New'} (${ratingCountValue})`
    : 'New recipe'

  return [time > 0 ? `${time} min` : '', ratingText].filter(Boolean).join(' / ')
}

function splitListText(text) {
  return firstPresent(text)
    .split(/\r?\n|;|\|/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function stripStepPrefix(step) {
  return String(step)
    .replace(/^\s*(?:step\s*)?\d+[\).:-]?\s*/i, '')
    .trim()
}

function isInstructionHeading(step) {
  return /^(preparation|prep|cooking|serving|serving and storage|storage|instructions|method):?$/i.test(
    step,
  )
}

function splitInstructions(value) {
  const text = firstPresent(value)
  if (!text) {
    return []
  }

  const lineSteps = text
    .split(/\r?\n+/)
    .map(stripStepPrefix)
    .filter((step) => step && !isInstructionHeading(step))

  if (lineSteps.length > 1) {
    return lineSteps
  }

  const numberedSteps = text
    .split(/(?=\b(?:step\s*)?\d+[\).:-]\s+)/i)
    .map(stripStepPrefix)
    .filter((step) => step && !isInstructionHeading(step))

  if (numberedSteps.length > 1) {
    return numberedSteps
  }

  const sentenceSteps = text
    .match(/[^.!?]+[.!?]?/g)
    ?.map((step) => step.trim())
    .filter(Boolean)

  return sentenceSteps && sentenceSteps.length > 1 ? sentenceSteps : [text]
}

function handleImageError(event) {
  if (event.target.src.endsWith(FALLBACK_IMAGE)) {
    return
  }
  event.target.src = FALLBACK_IMAGE
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

function printRecipe() {
  window.print()
}

async function shareRecipe() {
  actionError.value = ''
  clearSuccessMessage()
  const shareData = {
    title: recipe.value?.title || 'FoodStory recipe',
    text: description.value,
    url: window.location.href,
  }

  try {
    if (navigator.share) {
      await navigator.share(shareData)
      return
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href)
      showSuccessMessage('Recipe link copied.')
      return
    }

    actionError.value = 'Sharing is not available in this browser.'
  } catch (error) {
    if (error?.name !== 'AbortError') {
      actionError.value = 'Unable to share this recipe.'
    }
  }
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

function formatCommentDate(value) {
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function commentDateLabel(comment) {
  const updatedDate = formatCommentDate(comment.updated_at)
  const createdDate = formatCommentDate(comment.created_at)
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

    commentStore.comments
      .filter((comment) => Number(comment.recipe_id) === Number(loadedRecipe.id))
      .forEach((comment) => {
        const commentExists = (recipeStore.selectedRecipe?.comments || []).some(
          (item) => item.id === comment.id,
        )
        if (commentExists) {
          recipeStore.updateCommentFromSocket(comment)
        } else {
          recipeStore.addCommentFromSocket(comment)
        }
      })

    commentStore.deletedComments
      .filter((item) => item.recipeId === Number(loadedRecipe.id))
      .forEach((item) => recipeStore.deleteCommentFromSocket(item))

    const realtimeRating = ratingStore.ratingsByRecipe[Number(loadedRecipe.id)]
    if (realtimeRating) {
      recipeStore.updateRatingFromSocket(realtimeRating)
    }

    if (authStore.isLoggedIn) {
      checklistStore.fetchChecklist(recipeId)
    }
  } catch {
    // Store owns the visible error state.
  }
}

async function generateChecklist() {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isChecklistBusy.value || !recipe.value?.id) {
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

async function toggleFavorite() {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isFavoriteBusy.value || !recipe.value?.id) {
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

async function setRating(value) {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (isRatingBusy.value || value < 1 || value > 5 || !recipe.value?.id) {
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
      avg_rating: response.data.average_rating,
      total_ratings: response.data.total_ratings,
      rating_count: response.data.total_ratings,
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

async function submitComment() {
  if (isSubmittingComment.value || !recipe.value?.id) {
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
    commentStore.addCommentFromSocket({
      ...response.data.comment,
      recipe_id: recipe.value.id,
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
  if (savingCommentId.value || !recipe.value?.id) {
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
    commentStore.updateCommentFromSocket({
      ...response.data.comment,
      recipe_id: recipe.value.id,
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
  if (deletingCommentId.value || !recipe.value?.id) {
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
    commentStore.deleteCommentFromSocket({
      recipeId: recipe.value.id,
      commentId: comment.id,
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
  if (isDeletingRecipe.value || !recipe.value?.id) {
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
  } finally {
    if (isAlive) {
      isDeletingRecipe.value = false
    }
  }
}

onMounted(() => loadRecipe())
onBeforeUnmount(() => {
  isAlive = false
  clearSuccessMessage()
  checklistStore.setChecklist(null)
})

watch(
  () => route.params.id,
  (id) => {
    if (id) {
      loadRecipe(id)
    }
  },
)
</script>

<template>
  <section class="recipe-detail-magazine page-pad">
    <div v-if="recipeStore.isLoading && !recipe" class="recipe-detail-loading">
      <SkeletonCard variant="detail" />
      <SkeletonCard />
    </div>

    <p v-else-if="recipeStore.error" class="form-error" role="alert">{{ recipeStore.error }}</p>

    <article v-else-if="recipe" class="recipe-article" :class="{ 'cook-mode-active': isCookMode }">
      <nav class="recipe-breadcrumb" aria-label="Breadcrumb">
        <RouterLink to="/recipes">Recipes</RouterLink>
        <span>/</span>
        <RouterLink :to="{ name: 'recipes', query: { category: categoryLabel } }">
          {{ categoryLabel }}
        </RouterLink>
        <span>/</span>
        <strong>{{ recipe.title }}</strong>
      </nav>

      <header class="recipe-editorial-detail-hero">
        <div class="recipe-detail-title-block">
          <span class="recipe-category-pill">{{ categoryLabel }}</span>
          <h1>{{ recipe.title }}</h1>
          <p class="recipe-author-line">{{ authorLine }}</p>
          <div class="recipe-hero-meta">
            <span>
              <AppIcon name="star" size="18" />
              {{ averageRating ? averageRating.toFixed(1) : 'New' }}
            </span>
            <span>{{ ratingCount }} ratings</span>
          </div>
          <div
            class="recipe-live-status"
            :class="{
              connected: isConnected,
              reconnecting: !isConnected && !connectionFailed,
              failed: connectionFailed,
            }"
            role="status"
          >
            <span class="recipe-live-status-dot" aria-hidden="true"></span>
            <span v-if="isConnected">Live</span>
            <span v-else-if="connectionFailed">Live updates unavailable</span>
            <span v-else>Reconnecting...</span>
          </div>
          <p>{{ description }}</p>

          <div class="recipe-title-actions">
            <button
              class="recipe-action-link"
              type="button"
              :class="{ active: isCookMode }"
              :aria-pressed="isCookMode"
              @click="isCookMode = !isCookMode"
            >
              <AppIcon name="utensils" size="18" />
              <span>Cook Mode</span>
            </button>
            <button class="recipe-action-link" type="button" :disabled="isChecklistBusy" @click="generateChecklist">
              <AppIcon name="check" size="18" />
              <span>{{ isChecklistBusy ? 'Preparing...' : 'Generate Checklist' }}</span>
            </button>
            <button class="recipe-action-link" type="button" @click="printRecipe">
              <AppIcon name="newspaper" size="18" />
              <span>Print</span>
            </button>
            <button class="recipe-action-link" type="button" @click="shareRecipe">
              <AppIcon name="send" size="18" />
              <span>Share</span>
            </button>
            <button
              v-if="authStore.isLoggedIn"
              class="recipe-action-link"
              type="button"
              :disabled="isFavoriteBusy"
              :aria-pressed="isRecipeFavorite"
              @click="toggleFavorite"
            >
              <AppIcon name="heart" size="18" />
              <span>{{ isFavoriteBusy ? 'Saving...' : isRecipeFavorite ? 'Favorited' : 'Favorite' }}</span>
            </button>
            <RouterLink v-else class="recipe-action-link" :to="{ name: 'login', query: { redirect: route.fullPath } }">
              Login to favorite
            </RouterLink>
            <a class="recipe-action-link" href="#recipe-card">
              <AppIcon name="book-open" size="18" />
              <span>Jump to Recipe</span>
            </a>
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
            <RouterLink class="btn btn-outline" :to="{ name: 'recipe-edit', params: { id: recipe.id } }">
              <AppIcon name="pen" size="18" />
              <span>Edit Recipe</span>
            </RouterLink>
            <button class="btn btn-outline danger" type="button" :disabled="isDeletingRecipe" @click="deleteRecipe">
              <AppIcon name="trash" size="18" />
              <span>{{ isDeletingRecipe ? 'Deleting...' : 'Delete Recipe' }}</span>
            </button>
          </div>
        </div>
      </header>

      <figure class="recipe-detail-main-image recipe-wide-hero-image">
        <img
          :src="heroImage"
          :alt="`Photo of ${recipe.title}`"
          decoding="async"
          fetchpriority="high"
          @error="handleImageError"
        />
      </figure>

      <section class="recipe-quick-info-bar" aria-label="Recipe quick information">
        <div v-for="item in quickInfo" :key="item.label">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </section>

      <div class="recipe-detail-content">
        <main class="recipe-detail-main-column">
          <section class="recipe-blog-section">
            <div class="recipe-card-heading">
              <span class="recipe-card-heading-icon">
                <AppIcon name="utensils" size="21" />
              </span>
              <div>
                <p class="section-kicker">Cook this now</p>
                <h2>Before You Start</h2>
              </div>
            </div>
            <p class="recipe-editorial-copy">{{ blogIntro }}</p>
          </section>

          <section class="recipe-blog-section">
            <div class="recipe-card-heading">
              <span class="recipe-card-heading-icon green">
                <AppIcon name="heart" size="21" />
              </span>
              <div>
                <p class="section-kicker">Why it works</p>
                <h2>Why You'll Love It</h2>
              </div>
            </div>
            <ul class="recipe-story-list">
              <li v-for="reason in whyLoveItItems" :key="reason">
                <AppIcon name="check" size="17" />
                <span>{{ reason }}</span>
              </li>
            </ul>
          </section>

          <section class="recipe-blog-section">
            <div class="recipe-section-heading split">
              <div class="recipe-card-heading">
                <span class="recipe-card-heading-icon gold">
                  <AppIcon name="leaf" size="21" />
                </span>
                <div>
                  <p class="section-kicker">Key ingredients</p>
                  <h2>Key Ingredients</h2>
                </div>
              </div>
              <span class="section-count">{{ ingredientItems.length }} items</span>
            </div>
            <ul v-if="hasIngredients" class="ingredient-list recipe-key-ingredients">
              <li v-for="ingredient in ingredientItems.slice(0, 8)" :key="ingredient.key">
                <span class="recipe-ingredient-icon">
                  <AppIcon name="leaf" size="16" />
                </span>
                <span class="recipe-ingredient-copy">
                  <strong>{{ ingredient.name }}</strong>
                  <small>{{ ingredient.quantity || 'as needed' }}</small>
                </span>
              </li>
            </ul>
            <p v-else class="empty-state">No ingredients have been added yet.</p>
          </section>

          <section id="recipe-card" class="recipe-card-print magazine-print-card" aria-labelledby="recipe-card-title">
            <div class="recipe-card-print-header">
              <p class="section-kicker">Recipe card</p>
              <h2 id="recipe-card-title">{{ recipe.title }}</h2>
              <p>{{ description }}</p>
            </div>

            <dl class="recipe-card-meta-grid">
              <div v-for="item in recipeCardMeta" :key="`recipe-card-meta-${item.label}`">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value || 'N/A' }}</dd>
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
              </section>

              <section id="instructions">
                <h3>Instructions</h3>
                <ol class="recipe-card-instructions">
                  <li v-for="(step, index) in instructionSteps" :key="`card-step-${index}`">
                    {{ step }}
                  </li>
                </ol>
              </section>
            </div>

            <div class="recipe-card-footer">
              <section>
                <h3>Recipe Notes</h3>
                <p>{{ recipeNotes || 'Taste and adjust seasoning before serving. Add garnish at the end for the freshest texture.' }}</p>
              </section>
              <section>
                <h3>Storage Notes</h3>
                <p>{{ storageNotes }}</p>
              </section>
            </div>
          </section>

          <section id="nutrition" class="recipe-blog-section recipe-nutrition-section">
            <div class="recipe-section-heading split">
              <div>
                <p class="section-kicker">Nutrition</p>
                <h2>Nutrition Snapshot</h2>
              </div>
              <span class="section-count">{{ formatNumber(recipe.calories) }} calories</span>
            </div>

            <div class="recipe-nutrition-panel">
              <div class="recipe-nutrition-copy">
                <div class="recipe-calorie-highlight">
                  <span>Calories</span>
                  <strong>{{ formatNumber(recipe.calories) }}</strong>
                  <p>Per serving estimate based on the current recipe data.</p>
                </div>

                <dl class="recipe-nutrition-stats">
                  <div
                    v-for="item in nutritionItems"
                    :key="item.label"
                    :class="item.className"
                  >
                    <dt>{{ item.label }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
              </div>

              <div class="recipe-nutrition-chart-card">
                <NutritionChart
                  :calories="recipe.calories"
                  :protein="recipe.protein"
                  :carbs="recipe.carbs"
                  :fat="recipe.fat"
                />
              </div>
            </div>
          </section>

          <section class="recipe-blog-section rating-section">
            <div class="recipe-section-heading split">
              <div>
                <p class="section-kicker">Community score</p>
                <h2>Ratings</h2>
              </div>
              <span class="section-count">{{ ratingSummary }}</span>
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
                <p>{{ ratingCount }} total ratings</p>
                <div class="rating-meter" aria-hidden="true">
                  <span :style="{ width: `${ratingPercent}%` }"></span>
                </div>
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

          <section id="reviews" class="recipe-blog-section comments-panel">
            <div class="recipe-section-heading split">
              <div>
                <p class="section-kicker">Reviews</p>
                <h2>Comments</h2>
              </div>
              <span class="section-count">{{ commentCount }} notes</span>
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
                    <button class="btn btn-primary" type="button" :disabled="savingCommentId === comment.id" @click="saveComment(comment)">
                      {{ savingCommentId === comment.id ? 'Saving...' : 'Save' }}
                    </button>
                    <button class="btn btn-outline" type="button" @click="editingCommentId = null">
                      Cancel
                    </button>
                  </div>
                </div>
                <p v-else>{{ comment.content }}</p>

                <div v-if="authStore.user?.id === comment.user_id && editingCommentId !== comment.id" class="comment-actions">
                  <button type="button" @click="startEditComment(comment)">Edit</button>
                  <button type="button" :disabled="deletingCommentId === comment.id" @click="deleteComment(comment)">
                    {{ deletingCommentId === comment.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section v-if="relatedRecipes.length" id="more-recipes" class="recipe-blog-section recipe-more-recipes-section">
            <div class="recipe-section-heading split">
              <div>
                <p class="section-kicker">Keep cooking</p>
                <h2>More {{ categoryLabel }} Recipes</h2>
              </div>
              <span class="section-count">{{ relatedRecipes.length }} picks</span>
            </div>
            <div class="recipe-related-grid refined-related-grid">
              <RouterLink
                v-for="related in relatedRecipes"
                :key="related.id"
                class="recipe-related-card"
                :to="{ name: 'recipe-detail', params: { id: related.id } }"
              >
                <figure>
                  <img
                    :src="relatedRecipeImage(related)"
                    :alt="`Photo of ${related.title}`"
                    loading="lazy"
                    decoding="async"
                    @error="handleImageError"
                  />
                </figure>
                <div>
                  <span>{{ related.category_name || categoryLabel }}</span>
                  <h3>{{ related.title }}</h3>
                  <p>{{ relatedRecipeDescription(related) }}</p>
                  <small>
                    <AppIcon name="star" size="14" />
                    {{ relatedRecipeMeta(related) }}
                  </small>
                </div>
              </RouterLink>
            </div>
          </section>

        </main>

        <aside class="recipe-detail-sidebar">
          <section class="recipe-side-card">
            <div class="recipe-side-heading">
              <span class="recipe-side-heading-icon">
                <AppIcon name="book-open" size="18" />
              </span>
              <p class="section-kicker">On this page</p>
            </div>
            <nav>
              <a href="#recipe-card"><AppIcon name="book-open" size="16" /><span>Recipe card</span></a>
              <a href="#instructions"><AppIcon name="utensils" size="16" /><span>Instructions</span></a>
              <a href="#nutrition"><AppIcon name="bowl" size="16" /><span>Nutrition</span></a>
              <a href="#reviews"><AppIcon name="message" size="16" /><span>Comments</span></a>
              <a v-if="relatedRecipes.length" href="#more-recipes">
                <AppIcon name="sparkles" size="16" />
                <span>More recipes</span>
              </a>
            </nav>
          </section>

          <section class="recipe-side-card recipe-checklist-side">
            <div class="recipe-side-heading">
              <span class="recipe-side-heading-icon checklist">
                <AppIcon name="check" size="18" />
              </span>
              <div>
                <p class="section-kicker">Checklist</p>
                <h2>Cooking checklist</h2>
              </div>
            </div>
            <div class="recipe-checklist-progress">
              <div>
                <span>{{ checklistChecked }} of {{ checklistTotal }} completed</span>
                <strong>{{ checklistProgress }}%</strong>
              </div>
              <div
                class="recipe-checklist-progress-track"
                role="progressbar"
                aria-label="Checklist completion"
                :aria-valuenow="checklistProgress"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span :style="{ width: `${checklistProgress}%` }"></span>
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
        </aside>
      </div>
    </article>
  </section>
</template>
