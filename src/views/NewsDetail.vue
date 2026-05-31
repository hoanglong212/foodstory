<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import api, { getApiError } from '../services/api'

const route = useRoute()
const newsItem = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')

const displayDate = computed(() => {
  if (!newsItem.value?.published_date) {
    return ''
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${newsItem.value.published_date}T00:00:00`))
})

onMounted(async () => {
  isLoading.value = true
  try {
    const response = await api.get(`/news/${route.params.id}`)
    newsItem.value = response.data.item
  } catch (error) {
    errorMessage.value = getApiError(error, 'Unable to load this news item.')
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <section class="news-detail page-pad">
    <RouterLink class="text-link back-link" to="/news">
      <AppIcon name="arrow-left" size="16" />
      <span>Quay lại Tin Tức</span>
    </RouterLink>

    <p v-if="isLoading" class="status-panel">Loading news...</p>
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
      Không tìm thấy bài viết này.
      <RouterLink class="text-link" to="/news">
        <span>Xem lại danh sách tin tức</span>
        <AppIcon name="arrow-right" size="16" />
      </RouterLink>
    </div>
  </section>
</template>
