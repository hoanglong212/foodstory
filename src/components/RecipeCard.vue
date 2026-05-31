<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  recipe: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['delete'])

const ratingLabel = computed(() => {
  const average = Number(props.recipe.average_rating || 0)
  return average > 0 ? average.toFixed(1) : 'New'
})
</script>

<template>
  <article class="recipe-card stage2-card h-100">
    <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }" class="recipe-card-media">
      <img :src="recipe.image_url" :alt="`Photo of ${recipe.title}`" />
    </RouterLink>

    <div class="recipe-body">
      <div class="recipe-card-topline">
        <span class="category-label">
          <AppIcon name="tags" size="14" />
          {{ recipe.category_name }}
        </span>
        <span class="rating-chip">
          <AppIcon name="star" size="15" />
          {{ ratingLabel }}
          <small v-if="recipe.total_ratings">({{ recipe.total_ratings }})</small>
        </span>
      </div>

      <h2>
        <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
          {{ recipe.title }}
        </RouterLink>
      </h2>

      <div class="tag-row" aria-label="Recipe tags">
        <span v-for="tag in recipe.tags" :key="tag">#{{ tag }}</span>
      </div>

      <dl class="recipe-nutrition-mini">
        <div>
          <dt>Calories</dt>
          <dd>{{ recipe.calories }}</dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>{{ recipe.protein }}g</dd>
        </div>
        <div>
          <dt>Saves</dt>
          <dd>{{ recipe.favorite_count }}</dd>
        </div>
      </dl>

      <div class="recipe-card-actions">
        <RouterLink class="text-link" :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
          <span>View details</span>
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
            :aria-label="`Delete ${recipe.title}`"
            @click="emit('delete', recipe)"
          >
            <AppIcon name="trash" size="16" />
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
