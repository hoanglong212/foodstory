<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import api, { getApiError } from '../services/api'

const keyword = ref('')
const selectedDate = ref('')
const selectedCategory = ref('all')
const currentPage = ref(1)
const pageSize = 4
const route = useRoute()
const router = useRouter()
const newsItems = ref([])
const categories = ref([])
const totalPages = ref(1)
const totalItems = ref(0)
const isLoading = ref(false)
const errorMessage = ref('')
let hasLoadedInitialNews = false
let shouldRefetchAfterCategoryNormalization = false
let searchTimer = 0
let newsRequestController = null
let newsRequestId = 0
let isAlive = true

function normalizeCategory(value) {
  if (!value) {
    return 'all'
  }

  if (categories.value.length === 0) {
    return value
  }

  return categories.value.includes(value) ? value : 'all'
}

function getDateParts(value) {
  const date = new Date(`${value}T00:00:00`)
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: `TH.${month}`,
    year: String(date.getFullYear()),
  }
}

const displayNews = computed(() => {
  return newsItems.value.map((item) => {
    const date = item.published_date || item.date
    return {
      ...item,
      date,
      ...getDateParts(date),
      shortDate: date,
    }
  })
})

const pageNumbers = computed(() => {
  return Array.from({ length: totalPages.value }, (_, index) => index + 1)
})

const popularTags = ['miền bắc', 'miền nam', 'công thức', 'bún bò', 'cà phê', 'lẩu']

async function fetchNews(page = currentPage.value) {
  if (!isAlive) {
    return
  }

  newsRequestController?.abort()
  newsRequestController = new AbortController()
  const requestId = ++newsRequestId
  isLoading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get('/news', {
      signal: newsRequestController.signal,
      params: {
        page,
        pageSize,
        search: keyword.value.trim(),
        date: selectedDate.value,
        category: selectedCategory.value,
      },
    })
    if (!isAlive || requestId !== newsRequestId) {
      return
    }
    newsItems.value = response.data.items
    categories.value = response.data.categories || categories.value
    const normalizedCategory = normalizeCategory(selectedCategory.value)
    if (normalizedCategory !== selectedCategory.value) {
      selectedCategory.value = normalizedCategory
      shouldRefetchAfterCategoryNormalization = !hasLoadedInitialNews
      return
    }
    currentPage.value = response.data.currentPage
    totalPages.value = response.data.totalPages
    totalItems.value = response.data.totalItems
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      return
    }
    if (!isAlive) {
      return
    }
    errorMessage.value = getApiError(error, 'Unable to load news.')
  } finally {
    if (isAlive && requestId === newsRequestId) {
      isLoading.value = false
    }
  }
}

function scheduleNewsFetch() {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    currentPage.value = 1
    fetchNews(1)
  }, 350)
}

function goToPage(page) {
  window.clearTimeout(searchTimer)
  const nextPage = Math.min(Math.max(page, 1), totalPages.value)
  fetchNews(nextPage)
}

watch(
  () => route.query.category,
  (value) => {
    const normalized = normalizeCategory(typeof value === 'string' ? value : '')
    if (selectedCategory.value !== normalized) {
      selectedCategory.value = normalized
    }
  },
  { immediate: true },
)

watch([keyword, selectedDate, selectedCategory], () => {
  if (!hasLoadedInitialNews) {
    return
  }

  scheduleNewsFetch()
})

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

onMounted(async () => {
  await fetchNews(1)
  if (!isAlive) {
    return
  }
  hasLoadedInitialNews = true
  if (shouldRefetchAfterCategoryNormalization) {
    shouldRefetchAfterCategoryNormalization = false
    fetchNews(1)
  }
})

onBeforeUnmount(() => {
  isAlive = false
  window.clearTimeout(searchTimer)
  newsRequestController?.abort()
})
</script>

<template>
  <section class="news-page page-pad">
    <div class="section-heading">
      <p class="eyebrow">Tin Tức FoodStory</p>
      <h1>Tin Tức Ẩm Thực</h1>
      <p>
        Tìm bài viết theo ngày, tiêu đề, nội dung hoặc danh mục từ dữ liệu API/MySQL.
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
        <div v-if="isLoading" class="news-skeleton-list" aria-label="Loading news">
          <SkeletonCard v-for="index in 5" :key="index" variant="row" />
        </div>
        <p v-else-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

        <template v-else>
          <article v-for="item in displayNews" :key="item.id" class="news-card">
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
        </template>

        <p v-if="!isLoading && !errorMessage && totalItems === 0" class="empty-state">
          Không tìm thấy tin phù hợp.
        </p>

        <nav v-if="totalItems > 0" class="pagination" aria-label="News pagination">
          <button :disabled="currentPage === 1" type="button" @click="goToPage(currentPage - 1)">
            <AppIcon name="arrow-left" size="16" />
            <span>Trước</span>
          </button>
          <button
            v-for="page in pageNumbers"
            :key="page"
            :class="{ active: page === currentPage }"
            :aria-current="page === currentPage ? 'page' : undefined"
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
