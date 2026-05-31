<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import newsItems from '../data/news.json'
import AppIcon from '../components/AppIcon.vue'

const keyword = ref('')
const selectedDate = ref('')
const selectedCategory = ref('all')
const currentPage = ref(1)
const pageSize = 4
const route = useRoute()
const router = useRouter()

const categories = computed(() => {
  return [...new Set(newsItems.map((item) => item.category))]
})

function normalizeCategory(value) {
  if (!value) {
    return 'all'
  }

  return categories.value.includes(value) ? value : 'all'
}

const filteredNews = computed(() => {
  const query = keyword.value.trim().toLowerCase()

  return newsItems.filter((item) => {
    const searchableText = [
      item.date,
      item.title,
      item.content,
      item.category,
      item.shortDate,
    ]
      .join(' ')
      .toLowerCase()

    const matchesKeyword = !query || searchableText.includes(query)
    const matchesDate = !selectedDate.value || item.date === selectedDate.value
    const matchesCategory =
      selectedCategory.value === 'all' || item.category === selectedCategory.value

    return matchesKeyword && matchesDate && matchesCategory
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredNews.value.length / pageSize)))

const paginatedNews = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredNews.value.slice(start, start + pageSize)
})

const pageNumbers = computed(() => {
  return Array.from({ length: totalPages.value }, (_, index) => index + 1)
})

const popularTags = ['miền bắc', 'miền nam', 'công thức', 'bún bò', 'cà phê', 'lẩu']

function goToPage(page) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value)
}

watch([keyword, selectedDate, selectedCategory], () => {
  currentPage.value = 1
})

watch(
  [() => route.query.category, categories],
  ([value]) => {
    const normalized = normalizeCategory(typeof value === 'string' ? value : '')
    if (selectedCategory.value !== normalized) {
      selectedCategory.value = normalized
    }
  },
  { immediate: true },
)

watch(selectedCategory, (value) => {
  const normalizedRoute = normalizeCategory(
    typeof route.query.category === 'string' ? route.query.category : '',
  )

  if (value === normalizedRoute) {
    return
  }

  const nextQuery = { ...route.query }

  if (value === 'all') {
    delete nextQuery.category
  } else {
    nextQuery.category = value
  }

  router.replace({ query: nextQuery })
})
</script>

<template>
  <section class="news-page page-pad">
    <div class="section-heading">
      <p class="eyebrow">Tin Tức FoodStory</p>
      <h1>Tin Tức Ẩm Thực</h1>
      <p>
        Tìm bài viết theo ngày, tiêu đề, nội dung hoặc danh mục từ dữ liệu JSON cục bộ.
      </p>
    </div>

    <form class="search-panel" @submit.prevent>
      <label>
        <span class="field-label">
          <AppIcon name="search" size="16" />
          Từ khóa
        </span>
        <input
          v-model="keyword"
          type="search"
          placeholder="Tìm theo tiêu đề, nội dung, ngày, danh mục..."
        />
      </label>
      <label>
        <span class="field-label">
          <AppIcon name="calendar" size="16" />
          Ngày
        </span>
        <input v-model="selectedDate" type="date" />
      </label>
      <label>
        <span class="field-label">
          <AppIcon name="filter" size="16" />
          Danh mục
        </span>
        <select v-model="selectedCategory">
          <option value="all">Tất Cả</option>
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>
    </form>

    <div class="news-layout">
      <section class="news-list" aria-live="polite">
        <article v-for="item in paginatedNews" :key="item.id" class="news-card">
          <time :datetime="item.date">
            <strong>{{ item.day }}</strong>
            <span>{{ item.month }}</span>
            <small>{{ item.year }}</small>
          </time>
          <div>
            <span class="category-label">
              <AppIcon name="tags" size="14" />
              {{ item.category }}
            </span>
            <h2>{{ item.title }}</h2>
            <p>{{ item.content }}</p>
            <RouterLink :to="{ name: 'news-detail', params: { id: item.id } }">
              <span>Đọc thêm</span>
              <AppIcon name="arrow-right" size="16" />
            </RouterLink>
          </div>
        </article>

        <p v-if="filteredNews.length === 0" class="empty-state">
          Không tìm thấy tin phù hợp.
        </p>

        <nav class="pagination" aria-label="News pagination">
          <button :disabled="currentPage === 1" type="button" @click="goToPage(currentPage - 1)">
            <AppIcon name="arrow-left" size="16" />
            <span>Trước</span>
          </button>
          <button
            v-for="page in pageNumbers"
            :key="page"
            :class="{ active: page === currentPage }"
            type="button"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
          <button
            :disabled="currentPage === totalPages"
            type="button"
            @click="goToPage(currentPage + 1)"
          >
            <span>Sau</span>
            <AppIcon name="arrow-right" size="16" />
          </button>
        </nav>
      </section>

      <aside class="news-sidebar">
        <section>
          <h2>
            <AppIcon name="tags" size="19" />
            Chủ đề nổi bật
          </h2>
          <div class="tag-cloud">
            <button v-for="tag in popularTags" :key="tag" type="button" @click="keyword = tag">
              <AppIcon name="search" size="15" />
              <span># {{ tag }}</span>
            </button>
          </div>
        </section>
        <section class="submit-box">
          <span aria-hidden="true">
            <AppIcon name="chef-hat" size="34" stroke-width="1.8" />
          </span>
          <h2>Có Công Thức Hay?</h2>
          <p>Chia sẻ với cộng đồng FoodStory!</p>
          <RouterLink class="btn btn-light" to="/about">
            <AppIcon name="send" size="18" />
            <span>Gửi Công Thức</span>
          </RouterLink>
        </section>
      </aside>
    </div>
  </section>
</template>
