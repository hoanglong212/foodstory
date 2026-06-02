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

const recipe = computed(() => recipeStore.selectedRecipe)
const canManageRecipe = computed(() => authStore.isAdmin)
const ratingButtons = [1, 2, 3, 4, 5]

function formatDate(value) {
  if (!value) {
    return ''
  }
  return new Intl.DateTimeFormat('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

async function loadRecipe(recipeId = route.params.id) {
  actionError.value = ''
  actionSuccess.value = ''
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
  actionSuccess.value = ''
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
    actionSuccess.value = 'Your rating has been saved.'
    uiStore.setSuccess(actionSuccess.value)
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
  actionSuccess.value = ''
  try {
    const currentRecipe = recipe.value
    const recipeId = currentRecipe.id

    if (currentRecipe.is_favorite) {
      const changed = await favoriteStore.removeFavorite(recipeId)
      if (!isAlive || !changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: false,
        favorite_count: Math.max(Number(currentRecipe.favorite_count || 0) - 1, 0),
      })
      actionSuccess.value = 'Removed from favorites.'
    } else {
      const nextCount = Number(currentRecipe.favorite_count || 0) + 1
      const changed = await favoriteStore.addFavorite(recipeId, {
        ...currentRecipe,
        is_favorite: true,
        favorite_count: nextCount,
      })
      if (!isAlive || !changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: true,
        favorite_count: nextCount,
      })
      actionSuccess.value = 'Saved to favorites.'
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
  actionSuccess.value = ''
  try {
    const checklist = await checklistStore.generateChecklist(recipe.value.id)
    if (!isAlive || !checklist) {
      return
    }
    actionSuccess.value = 'Ingredient checklist is ready.'
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
  recipeStore.cancelSelectedRecipeRequest()
})
</script>

<template>
  <section class="recipe-detail page-pad">
    <RouterLink class="text-link back-link" to="/recipes">
      <AppIcon name="arrow-left" size="16" />
      <span>Back to recipes</span>
    </RouterLink>

    <SkeletonCard v-if="recipeStore.isLoading" variant="detail" />
    <p v-else-if="recipeStore.error" class="form-error" role="alert">
      {{ recipeStore.error }}
    </p>

    <article v-else-if="recipe" class="recipe-detail-grid">
      <div class="recipe-detail-media">
        <img
          :src="recipe.image_url"
          :alt="`Photo of ${recipe.title}`"
          decoding="async"
          fetchpriority="high"
        />
      </div>

      <div class="recipe-detail-main">
        <div class="recipe-card-topline">
          <span class="category-label">
            <AppIcon name="tags" size="14" />
            {{ recipe.category_name }}
          </span>
          <span class="rating-chip">
            <AppIcon name="star" size="15" />
            {{ Number(recipe.average_rating).toFixed(1) }}
            <small>({{ recipe.total_ratings }} ratings)</small>
          </span>
        </div>

        <h1>{{ recipe.title }}</h1>
        <p v-if="recipe.description" class="recipe-description">
          {{ recipe.description }}
        </p>
        <div class="tag-row">
          <span v-for="tag in recipe.tags" :key="tag.id">#{{ tag.name }}</span>
        </div>

        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <p v-if="actionSuccess" class="form-success" role="status">{{ actionSuccess }}</p>

        <div class="detail-actions">
          <button
            v-if="authStore.isLoggedIn"
            class="btn btn-outline"
            type="button"
            :disabled="isFavoriteBusy"
            @click="toggleFavorite"
          >
            <AppIcon name="heart" size="18" />
            <span>
              {{ isFavoriteBusy ? 'Saving...' : recipe.is_favorite ? 'Unfavorite' : 'Favorite' }}
            </span>
            <small>{{ recipe.favorite_count }}</small>
          </button>
          <RouterLink
            v-else
            class="btn btn-outline"
            :to="{ name: 'login', query: { redirect: route.fullPath } }"
          >
            Login to save
          </RouterLink>

          <button
            v-if="authStore.isLoggedIn"
            class="btn btn-outline"
            type="button"
            :disabled="isChecklistBusy"
            @click="generateChecklist"
          >
            <AppIcon name="check" size="18" />
            <span>{{ isChecklistBusy ? 'Preparing...' : 'Generate Ingredient Checklist' }}</span>
          </button>
          <RouterLink
            v-else
            class="btn btn-outline"
            :to="{ name: 'login', query: { redirect: route.fullPath } }"
          >
            Login for checklist
          </RouterLink>

          <button class="btn btn-outline" type="button" disabled>
            Save a place where I ate this dish - Stage 3 coming soon
          </button>
        </div>

        <div v-permission="'admin'" class="detail-actions">
          <RouterLink
            class="btn btn-primary"
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

      <section class="detail-section">
        <h2>Ingredients</h2>
        <ul class="ingredient-list">
          <li v-for="ingredient in recipe.ingredients" :key="ingredient.id">
            <span>{{ ingredient.ingredient_name }}</span>
            <strong>{{ ingredient.quantity || 'as needed' }}</strong>
          </li>
        </ul>
      </section>

      <section class="detail-section">
        <h2>Instructions</h2>
        <p class="instruction-copy">{{ recipe.instructions }}</p>
      </section>

      <section class="detail-section nutrition-panel">
        <div>
          <h2>Nutrition</h2>
          <p class="calorie-total">{{ recipe.calories }} calories</p>
          <dl class="recipe-nutrition-mini">
            <div>
              <dt>Protein</dt>
              <dd>{{ recipe.protein }}g</dd>
            </div>
            <div>
              <dt>Carbs</dt>
              <dd>{{ recipe.carbs }}g</dd>
            </div>
            <div>
              <dt>Fat</dt>
              <dd>{{ recipe.fat }}g</dd>
            </div>
          </dl>
        </div>
        <NutritionChart
          :calories="recipe.calories"
          :protein="recipe.protein"
          :carbs="recipe.carbs"
          :fat="recipe.fat"
        />
      </section>

      <section class="detail-section rating-section">
        <h2>Rate this recipe</h2>
        <div v-if="authStore.isLoggedIn" class="rating-buttons">
          <button
            v-for="value in ratingButtons"
            :key="value"
            type="button"
            :class="{ active: value <= Number(recipe.current_user_rating || 0) }"
            :aria-label="`Rate ${value} out of 5`"
            :aria-pressed="value === Number(recipe.current_user_rating || 0)"
            :disabled="isRatingBusy"
            @click="setRating(value)"
          >
            <AppIcon name="star" size="21" />
          </button>
        </div>
        <p v-else>
          <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
            Login to rate this recipe.
          </RouterLink>
        </p>
      </section>

      <section class="detail-section checklist-panel">
        <h2>Ingredient Checklist</h2>
        <p v-if="!authStore.isLoggedIn">
          <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
            Login to generate a checklist.
          </RouterLink>
        </p>
        <p v-else-if="!checklistStore.activeChecklist" class="muted-copy">
          Generate a checklist to tick off ingredients while shopping or cooking.
        </p>
        <ul v-else class="checklist-list">
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

      <section class="detail-section comments-panel">
        <h2>Comments</h2>
        <form v-if="authStore.isLoggedIn" class="comment-form" @submit.prevent="submitComment">
          <label for="comment-content">Add a comment</label>
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
              <strong>{{ comment.username }}</strong>
              <time :datetime="comment.updated_at">{{ formatDate(comment.updated_at) }}</time>
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
    </article>
  </section>
</template>
