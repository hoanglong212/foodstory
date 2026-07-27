<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { advanceRecipeImage, getRecipeImageSource } from '../utils/recipeImage'

const props = defineProps({
  recipe: {
    type: Object,
    required: true,
  },
  isDeleting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['delete'])

const imageSrc = computed(() => getRecipeImageSource(props.recipe))
const ratingLabel = computed(() => {
  const average = Number(props.recipe.avg_rating || props.recipe.average_rating || 0)
  return average > 0 ? average.toFixed(1) : 'New'
})

const ratingCount = computed(() =>
  Math.max(Number(props.recipe.rating_count || props.recipe.total_ratings || 0), 0),
)
const ratingMeta = computed(() => {
  if (!ratingCount.value) {
    return 'New recipe'
  }

  return `${ratingLabel.value} from ${ratingCount.value} ${ratingCount.value === 1 ? 'rating' : 'ratings'}`
})
const shortDescription = computed(() => {
  const text = String(props.recipe.description || props.recipe.blog_intro || '').trim()
  if (!text) {
    return `A ${String(props.recipe.category_name || 'FoodStory').toLowerCase()} recipe with clear steps, ingredients, and nutrition details.`
  }

  return text.length > 138 ? `${text.slice(0, 138).trim()}...` : text
})
const totalTime = computed(() => {
  const total = firstPresent(props.recipe.total_time, props.recipe.totalTime)
  if (total) {
    return formatDuration(total)
  }

  const prep = numericDuration(props.recipe.prep_time || props.recipe.prepTime)
  const cook = numericDuration(props.recipe.cook_time || props.recipe.cookTime)
  if (prep || cook) {
    return `${prep + cook} min`
  }

  return 'Read recipe'
})
const dateLabel = computed(() => {
  const value = props.recipe.created_at || props.recipe.createdAt || props.recipe.updated_at
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-AU', {
    month: 'short',
    day: 'numeric',
  }).format(date)
})
const metaParts = computed(() =>
  ['FoodStory Kitchen', dateLabel.value, totalTime.value, ratingMeta.value].filter(Boolean),
)

function firstPresent(...values) {
  const value = values.find((item) => item !== null && item !== undefined && String(item).trim())
  return value === undefined ? '' : String(value).trim()
}

function numericDuration(value) {
  const number = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(number) ? number : 0
}

function formatDuration(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? `${number} min` : String(value)
}

function useFallbackImage(event) {
  advanceRecipeImage(event, props.recipe)
}
</script>

<template>
  <article class="recipe-card magazine-recipe-card h-100">
    <RouterLink
      :to="{ name: 'recipe-detail', params: { id: recipe.id } }"
      class="recipe-card-media"
      :aria-label="`Open ${recipe.title}`"
    >
      <img
        :src="imageSrc"
        :alt="`Photo of ${recipe.title}`"
        loading="lazy"
        decoding="async"
        @error="useFallbackImage"
      />
    </RouterLink>

    <div class="recipe-body">
      <div class="recipe-card-topline">
        <span class="category-label">
          {{ recipe.category_name }}
        </span>
      </div>

      <h2 class="recipe-card-title">
        <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
          {{ recipe.title }}
        </RouterLink>
      </h2>

      <p class="recipe-card-description">{{ shortDescription }}</p>

      <p class="recipe-card-meta-line">
        <AppIcon name="star" size="15" />
        <span>{{ metaParts.join(' / ') }}</span>
      </p>

      <div class="recipe-card-actions">
        <RouterLink class="text-link" :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
          <span>View recipe</span>
          <AppIcon name="arrow-right" size="16" />
        </RouterLink>

        <div v-permission="'admin'" class="admin-actions">
          <RouterLink
            class="icon-link"
            :to="{ name: 'recipe-edit', params: { id: recipe.id } }"
            :aria-label="`Edit ${recipe.title}`"
          >
            <AppIcon name="pen" size="16" />
          </RouterLink>
          <button
            class="icon-link danger"
            type="button"
            :aria-label="isDeleting ? `Deleting ${recipe.title}` : `Delete ${recipe.title}`"
            :disabled="isDeleting"
            @click="emit('delete', recipe)"
          >
            <AppIcon name="trash" size="16" />
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
