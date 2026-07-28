<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import api, { getApiError } from '../services/api'

const route = useRoute()
const newsItem = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')
let isAlive = true
let requestController = null

const displayDate = computed(() => {
  if (!newsItem.value?.published_date) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${newsItem.value.published_date}T00:00:00`))
})

async function loadNewsItem(newsId = route.params.id) {
  requestController?.abort()
  requestController = new AbortController()
  isLoading.value = true
  errorMessage.value = ''
  newsItem.value = null
  try {
    const response = await api.get(`/news/${newsId}`, {
      signal: requestController.signal,
    })
    if (!isAlive) {
      return
    }
    newsItem.value = response.data.item
    document.title = `${newsItem.value.title} | FoodStory`
  } catch (error) {
    if (error.code === 'ERR_CANCELED' || !isAlive) {
      return
    }
    errorMessage.value = getApiError(error, 'Unable to load this news item.')
  } finally {
    if (isAlive) {
      isLoading.value = false
    }
  }
}

onMounted(() => loadNewsItem())

watch(
  () => route.params.id,
  (id, previousId) => {
    if (id && id !== previousId) {
      loadNewsItem(id)
    }
  },
)

onBeforeUnmount(() => {
  isAlive = false
  requestController?.abort()
})
</script>

<template>
  <section class="news-detail page-pad">
    <RouterLink class="text-link back-link" to="/news">
      <AppIcon name="arrow-left" size="16" />
      <span>Back to News</span>
    </RouterLink>

    <p v-if="isLoading" class="status-panel" role="status" aria-live="polite">Loading news...</p>
    <p v-else-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

    <div v-else-if="newsItem" class="news-detail-card">
      <span class="category-label">
        <AppIcon name="tags" size="14" />
        {{ newsItem.category }}
      </span>
      <h1>{{ newsItem.title }}</h1>
      <div class="news-detail-meta">
        <time :datetime="newsItem.published_date">
          <AppIcon name="calendar" size="16" />
          <span>{{ displayDate }}</span>
        </time>
        <span>
          <AppIcon name="chef-hat" size="16" />
          FoodStory
        </span>
      </div>
      <p class="news-detail-content">
        {{ newsItem.content }}
      </p>
    </div>

    <div v-else class="empty-state">
      This article could not be found.
      <RouterLink class="text-link" to="/news">
        <span>Return to the news list</span>
        <AppIcon name="arrow-right" size="16" />
      </RouterLink>
    </div>
  </section>
</template>
