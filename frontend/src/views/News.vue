<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import api, { getApiError } from '../services/api'
import localNewsArchive from '../data/news.json'

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
const provider = ref({
  name: 'The Guardian Open Platform',
  homepage: 'https://open-platform.theguardian.com/',
})
const isCachedResponse = ref(false)
const isFallbackMode = ref(false)
const fallbackReason = ref('')
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return {
      day: '--',
      month: 'DATE',
      year: '',
    }
  }

  const month = String(date.getMonth() + 1).padStart(2, '0')

  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: `TH.${month}`,
    year: String(date.getFullYear()),
  }
}

const displayNews = computed(() => {
  return newsItems.value.map((item) => {
    const date = item.published_date || item.date || item.published_at
    return {
      ...item,
      date,
      ...getDateParts(date),
      shortDate: date,
    }
  })
})

const pageNumbers = computed(() => {
  const maximumVisiblePages = 7
  if (totalPages.value <= maximumVisiblePages) {
    return Array.from({ length: totalPages.value }, (_, index) => index + 1)
  }

  const halfWindow = Math.floor(maximumVisiblePages / 2)
  let start = Math.max(1, currentPage.value - halfWindow)
  let end = Math.min(totalPages.value, start + maximumVisiblePages - 1)

  if (end - start + 1 < maximumVisiblePages) {
    start = Math.max(1, end - maximumVisiblePages + 1)
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const popularTags = ['street food', 'seasonal recipes', 'restaurant reviews', 'coffee', 'sustainable food', 'global cuisine']
const isProviderConfigurationError = computed(() =>
  /api key|not configured|configuration|guardian|service unavailable|503/i.test(fallbackReason.value),
)
const archiveNoticeDescription = computed(() =>
  isProviderConfigurationError.value
    ? 'Live news is not configured yet, so these stories come from the FoodStory archive.'
    : 'Live news is temporarily unavailable, so these stories come from the FoodStory archive.',
)

const archiveCategories = [...new Set(localNewsArchive.map((item) => item.category))]

function loadArchiveNews(page, reason) {
  const search = keyword.value.trim().toLowerCase()
  const matches = localNewsArchive.filter((item) => {
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search) ||
      item.content.toLowerCase().includes(search)
    const matchesCategory =
      selectedCategory.value === 'all' || item.category === selectedCategory.value
    const matchesDate = !selectedDate.value || item.date === selectedDate.value
    return matchesSearch && matchesCategory && matchesDate
  })

  const pages = Math.max(1, Math.ceil(matches.length / pageSize))
  const safePage = Math.min(Math.max(page, 1), pages)

  categories.value = archiveCategories
  newsItems.value = matches
    .slice((safePage - 1) * pageSize, safePage * pageSize)
    .map((item) => ({ ...item, source: 'FoodStory archive' }))
  currentPage.value = safePage
  totalPages.value = pages
  totalItems.value = matches.length
  fallbackReason.value = reason
  isFallbackMode.value = true
}

async function fetchNews(page = currentPage.value) {
  if (!isAlive) {
    return
  }

  const includeCategories = categories.value.length === 0
  newsRequestController?.abort()
  newsRequestController = new AbortController()
  const requestId = ++newsRequestId
  isLoading.value = true

  try {
    const response = await api.get('/news/external', {
      signal: newsRequestController.signal,
      params: {
        page,
        pageSize,
        search: keyword.value.trim(),
        date: selectedDate.value,
        category: selectedCategory.value,
        includeCategories: includeCategories ? '1' : '0',
      },
    })

    if (!isAlive || requestId !== newsRequestId) {
      return
    }

    newsItems.value = response.data.items || []
    categories.value = response.data.categories || categories.value
    provider.value = response.data.provider || provider.value
    isCachedResponse.value = Boolean(response.data.cached)
    isFallbackMode.value = false
    fallbackReason.value = ''

    const normalizedCategory = normalizeCategory(selectedCategory.value)
    if (normalizedCategory !== selectedCategory.value) {
      selectedCategory.value = normalizedCategory
      shouldRefetchAfterCategoryNormalization = !hasLoadedInitialNews
      return
    }

    currentPage.value = Number(response.data.currentPage || page)
    totalPages.value = Math.max(1, Number(response.data.totalPages || 1))
    totalItems.value = Math.max(0, Number(response.data.totalItems || 0))
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      return
    }
    if (!isAlive) {
      return
    }
    loadArchiveNews(
      page,
      getApiError(
        error,
        'Unable to load live food news. Check the Guardian API configuration and try again.',
      ),
    )
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

function retryNews() {
  window.clearTimeout(searchTimer)
  fetchNews(currentPage.value || 1)
}

function handleImageError(event) {
  event.currentTarget.hidden = true
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
      <p class="eyebrow">FoodStory News</p>
      <h1>Live Food News</h1>
      <p>
        Explore current food journalism, recipes, restaurant stories, drinks, sustainability,
        and global cuisine through a secure external API integration.
      </p>
      <p class="news-provider-note">
        <AppIcon name="newspaper" size="16" />
        <span>Articles supplied by</span>
        <a :href="provider.homepage" target="_blank" rel="noopener noreferrer">
          {{ provider.name }}
        </a>
        <span v-if="isCachedResponse" class="cache-badge">cached response</span>
      </p>
    </div>

    <form class="search-panel" @submit.prevent>
      <label>
        <span class="field-label">
          <AppIcon name="search" size="16" />
          Keyword
        </span>
        <input
          v-model="keyword"
          type="search"
          placeholder="Search food news by keyword..."
        />
      </label>
      <label>
        <span class="field-label">
          <AppIcon name="calendar" size="16" />
          Date
        </span>
        <input v-model="selectedDate" type="date" />
      </label>
      <label>
        <span class="field-label">
          <AppIcon name="filter" size="16" />
          Category
        </span>
        <select v-model="selectedCategory">
          <option value="all">All</option>
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>
    </form>

    <div class="news-layout">
      <section class="news-list row g-3" aria-live="polite" :aria-busy="isLoading">
        <div v-if="isLoading" class="col-12">
          <div class="news-skeleton-list" aria-label="Loading news">
            <SkeletonCard v-for="index in 5" :key="index" variant="row" />
          </div>
        </div>

        <template v-else>
          <div v-if="isFallbackMode" class="col-12">
            <section class="news-unavailable-card" role="status">
              <span class="news-unavailable-icon" aria-hidden="true">
                <AppIcon name="newspaper" size="28" />
              </span>
              <div>
                <p class="eyebrow">External provider status</p>
                <h2>Showing FoodStory archive</h2>
                <p>{{ archiveNoticeDescription }}</p>
                <details>
                  <summary>Technical detail</summary>
                  <p>{{ fallbackReason }}</p>
                </details>
                <div class="news-unavailable-actions">
                  <button class="btn btn-primary" type="button" @click="retryNews">
                    Try live news again
                  </button>
                  <RouterLink class="btn btn-outline" to="/recipes">Browse recipes</RouterLink>
                </div>
              </div>
            </section>
          </div>

          <div v-for="item in displayNews" :key="item.id" class="col-12">
            <article class="news-card external-news-card">
              <time :datetime="item.date">
                <strong>{{ item.day }}</strong>
                <span>{{ item.month }}</span>
                <small>{{ item.year }}</small>
              </time>

              <div class="external-news-content">
                <img
                  v-if="item.thumbnail"
                  class="news-thumbnail"
                  :src="item.thumbnail"
                  :alt="`Illustration for ${item.title}`"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="handleImageError"
                />

                <span class="category-label">
                  <AppIcon name="tags" size="14" />
                  {{ item.category }}
                </span>
                <h2>{{ item.title }}</h2>

                <p class="news-source-meta">
                  <span>{{ item.source }}</span>
                  <span v-if="item.author">• {{ item.author }}</span>
                </p>

                <p>{{ item.content }}</p>
                <a
                  v-if="item.url"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Read ${item.title} on ${item.source}`"
                >
                  <span>Read original article</span>
                  <AppIcon name="arrow-right" size="16" />
                </a>
              </div>
            </article>
          </div>
        </template>

        <div v-if="!isLoading && totalItems === 0" class="col-12">
          <p class="empty-state">
            No matching external articles were found. Try a broader keyword or remove a filter.
          </p>
        </div>

        <div v-if="totalItems > 0" class="col-12">
          <nav class="pagination" aria-label="News pagination">
            <button :disabled="currentPage === 1" type="button" @click="goToPage(currentPage - 1)">
              <AppIcon name="arrow-left" size="16" />
              <span>Previous</span>
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
              <span>Next</span>
              <AppIcon name="arrow-right" size="16" />
            </button>
          </nav>
        </div>
      </section>

      <aside class="news-sidebar">
        <section>
          <h2>
            <AppIcon name="tags" size="19" />
            Popular topics
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
          <h2>Have a Great Recipe?</h2>
          <p>Share it with the FoodStory community!</p>
          <RouterLink class="btn btn-light" to="/about">
            <AppIcon name="send" size="18" />
            <span>Submit a Recipe</span>
          </RouterLink>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.news-provider-note {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 14px;
}

.news-provider-note a {
  color: var(--accent);
  font-weight: 850;
}

.cache-badge {
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  font-size: 12px;
  font-weight: 800;
}

.external-news-content {
  min-width: 0;
}

.news-thumbnail {
  float: right;
  width: min(190px, 36%);
  aspect-ratio: 4 / 3;
  margin: 0 0 14px 20px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(44, 31, 21, 0.12);
}

.news-source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: -2px 0 10px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 750;
}

.news-unavailable-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding: clamp(22px, 4vw, 34px);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--card-border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel) 94%, var(--accent) 6%);
  box-shadow: var(--shadow);
}

.news-unavailable-icon {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 14px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.news-unavailable-card > div {
  display: grid;
  gap: 10px;
}

.news-unavailable-card h2,
.news-unavailable-card p {
  margin: 0;
}

.news-unavailable-card details {
  color: var(--muted);
  font-size: 13px;
}

.news-unavailable-card summary {
  width: fit-content;
  cursor: pointer;
  font-weight: 800;
}

.news-unavailable-card details p {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--panel-strong);
}

.news-unavailable-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

@media (max-width: 640px) {
  .news-unavailable-card {
    grid-template-columns: 1fr;
  }

  .news-unavailable-actions .btn {
    width: 100%;
  }

  .news-thumbnail {
    float: none;
    width: 100%;
    margin: 0 0 16px;
  }
}
</style>
