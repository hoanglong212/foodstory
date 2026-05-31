<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import newsItems from '../data/news.json'
import AppIcon from '../components/AppIcon.vue'

const route = useRoute()

const newsItem = computed(() => {
  const id = Number(route.params.id)
  return newsItems.find((item) => item.id === id)
})
</script>

<template>
  <section class="news-detail page-pad">
    <RouterLink class="text-link back-link" to="/news">
      <AppIcon name="arrow-left" size="16" />
      <span>Quay lại Tin Tức</span>
    </RouterLink>

    <div v-if="newsItem" class="news-detail-card">
      <span class="category-label">
        <AppIcon name="tags" size="14" />
        {{ newsItem.category }}
      </span>
      <h1>{{ newsItem.title }}</h1>
      <div class="news-detail-meta">
        <time :datetime="newsItem.date">
          <AppIcon name="calendar" size="16" />
          <span>{{ newsItem.shortDate }}</span>
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
