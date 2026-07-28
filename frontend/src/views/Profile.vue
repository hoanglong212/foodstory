<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import RecipeCard from '../components/RecipeCard.vue'
import api, { getApiError } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChecklistStore } from '../stores/checklistStore'
import { useFavoriteStore } from '../stores/favoriteStore'

const authStore = useAuthStore()
const favoriteStore = useFavoriteStore()
const checklistStore = useChecklistStore()
const route = useRoute()
const router = useRouter()
const profileComments = ref([])
const commentsLoading = ref(false)
const commentsError = ref('')
let isAlive = true
let commentsRequestController = null
const loadedTabs = new Set()

const tabs = [
  { id: 'account', label: 'Account' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'checklists', label: 'Checklists' },
  { id: 'comments', label: 'Comments' },
]

const joinedDate = computed(() => formatDate(authStore.user?.created_at))

function getTabForRoute(name = route.name, query = route.query) {
  if (name === 'favorites') {
    return 'favorites'
  }
  if (name === 'checklist') {
    return 'checklists'
  }
  if (query.tab === 'comments') {
    return 'comments'
  }
  return 'account'
}

const activeTab = ref(getTabForRoute())

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

async function fetchProfileComments() {
  if (!isAlive) {
    return
  }

  commentsRequestController?.abort()
  commentsRequestController = new AbortController()
  commentsLoading.value = true
  commentsError.value = ''

  try {
    const response = await api.get('/comments/user', {
      signal: commentsRequestController.signal,
    })
    if (!isAlive) {
      return
    }
    profileComments.value = response.data.items
  } catch (error) {
    if (error.code === 'ERR_CANCELED' || !isAlive) {
      return
    }
    commentsError.value = getApiError(error, 'Unable to load your comments.')
  } finally {
    if (isAlive) {
      commentsLoading.value = false
      commentsRequestController = null
    }
  }
}

async function refreshProfileTab(tabId, options = {}) {
  if (!authStore.isLoggedIn) {
    return
  }
  if (!options.force && loadedTabs.has(tabId)) {
    return
  }

  if (tabId === 'favorites') {
    await favoriteStore.fetchFavorites()
    loadedTabs.add(tabId)
  } else if (tabId === 'checklists') {
    await checklistStore.fetchUserChecklists()
    loadedTabs.add(tabId)
  } else if (tabId === 'comments') {
    await fetchProfileComments()
    loadedTabs.add(tabId)
  } else {
    loadedTabs.add(tabId)
  }
}

function selectTab(tabId) {
  activeTab.value = tabId

  const routeByTab = {
    account: 'profile',
    favorites: 'favorites',
    checklists: 'checklist',
  }
  const routeName = routeByTab[tabId]
  if (tabId === 'account' && (route.name !== 'profile' || route.query.tab)) {
    router.push({ name: 'profile' })
  } else if (routeName && route.name !== routeName) {
    router.push({ name: routeName })
  } else if (
    tabId === 'comments' &&
    (route.name !== 'profile' || route.query.tab !== 'comments')
  ) {
    router.push({ name: 'profile', query: { tab: 'comments' } })
  } else {
    refreshProfileTab(tabId, { force: true })
  }
}

onMounted(() => {
  refreshProfileTab(activeTab.value)
})

onBeforeUnmount(() => {
  isAlive = false
  commentsRequestController?.abort()
})

watch(
  () => [route.name, route.query.tab],
  ([name]) => {
    const nextTab = getTabForRoute(name, route.query)
    if (activeTab.value !== nextTab) {
      activeTab.value = nextTab
      refreshProfileTab(nextTab)
    }
  },
)
</script>

<template>
  <section class="profile-page page-pad">
    <div class="profile-header">
      <div>
        <p class="eyebrow">My FoodStory</p>
        <h1>Welcome, {{ authStore.user?.username }}</h1>
        <p>
          Manage your saved recipes, return to checklists, and see your account role.
        </p>
      </div>
      <span class="role-badge">{{ authStore.role }}</span>
    </div>

    <nav class="profile-tabs" aria-label="Profile sections">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeTab === tab.id }"
        :aria-pressed="activeTab === tab.id"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'account'" class="detail-section">
      <h2>Account</h2>
      <dl class="profile-details">
        <div>
          <dt>Username</dt>
          <dd>{{ authStore.user?.username }}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{{ authStore.user?.email }}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{{ authStore.user?.role }}</dd>
        </div>
        <div>
          <dt>Joined</dt>
          <dd>{{ joinedDate || 'Unknown' }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="activeTab === 'favorites'" class="detail-section">
      <div class="split-heading">
        <div>
          <h2>Favorite Recipes</h2>
          <p class="muted-copy">Favorites are stored in MySQL through the authenticated API.</p>
        </div>
        <RouterLink class="text-link" to="/recipes">
          <span>Browse recipes</span>
          <AppIcon name="arrow-right" size="16" />
        </RouterLink>
      </div>

      <p v-if="favoriteStore.isLoading" class="status-panel" role="status" aria-live="polite">Loading favorites...</p>
      <p v-else-if="favoriteStore.error" class="form-error" role="alert">
        {{ favoriteStore.error }}
      </p>
      <p v-else-if="favoriteStore.favoriteList.length === 0" class="empty-state">
        No favorites yet. Open a recipe and save it to see it here.
      </p>
      <div v-else class="row g-4">
        <div
          v-for="recipe in favoriteStore.favoriteList"
          :key="recipe.id"
          class="col-12 col-md-6 col-xl-4"
        >
          <RecipeCard :recipe="recipe" />
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'checklists'" class="detail-section">
      <div class="split-heading">
        <div>
          <h2>Ingredient Checklists</h2>
          <p class="muted-copy">Return to generated shopping lists and continue tracking items.</p>
        </div>
        <RouterLink class="text-link" to="/recipes">
          <span>Find a recipe</span>
          <AppIcon name="arrow-right" size="16" />
        </RouterLink>
      </div>

      <p v-if="checklistStore.isLoading" class="status-panel" role="status" aria-live="polite">Loading checklists...</p>
      <p v-else-if="checklistStore.error" class="form-error" role="alert">
        {{ checklistStore.error }}
      </p>
      <p v-else-if="checklistStore.userChecklists.length === 0" class="empty-state">
        No checklists yet. Open a recipe and generate an ingredient checklist.
      </p>

      <div v-else class="checklist-summary-list">
        <article
          v-for="checklist in checklistStore.userChecklists"
          :key="checklist.id"
          class="checklist-summary-item"
        >
          <img
            :src="checklist.image_url || '/images/food-placeholder.jpg'"
            :alt="`Photo of ${checklist.recipe_title}`"
            loading="lazy"
            decoding="async"
            @error="$event.currentTarget.src = '/images/food-placeholder.jpg'"
          />
          <div>
            <span class="category-label">
              <AppIcon name="check" size="14" />
              {{ checklist.checked_items }} / {{ checklist.total_items }} checked
            </span>
            <h3>{{ checklist.recipe_title }}</h3>
            <progress
              :value="checklist.checked_items"
              :max="Math.max(checklist.total_items, 1)"
              :aria-label="`Checklist progress for ${checklist.recipe_title}`"
            ></progress>
            <RouterLink
              class="text-link"
              :to="{ name: 'recipe-detail', params: { id: checklist.recipe_id } }"
            >
              <span>Continue checklist</span>
              <AppIcon name="arrow-right" size="16" />
            </RouterLink>
          </div>
        </article>
      </div>
    </section>

    <section v-if="activeTab === 'comments'" class="detail-section">
      <div class="split-heading">
        <div>
          <h2>Comments</h2>
          <p class="muted-copy">Your comment history is loaded from MySQL.</p>
        </div>
        <RouterLink class="text-link" to="/recipes">
          <span>Browse recipes</span>
          <AppIcon name="arrow-right" size="16" />
        </RouterLink>
      </div>

      <p v-if="commentsLoading" class="status-panel" role="status" aria-live="polite">Loading comments...</p>
      <p v-else-if="commentsError" class="form-error" role="alert">
        {{ commentsError }}
      </p>
      <p v-else-if="profileComments.length === 0" class="empty-state">
        No comments yet. Open a recipe and join the discussion.
      </p>

      <div v-else class="profile-comment-list">
        <article v-for="comment in profileComments" :key="comment.id" class="comment-item">
          <header>
            <strong>{{ comment.recipe_title }}</strong>
            <RouterLink
              class="text-link"
              :to="{ name: 'recipe-detail', params: { id: comment.recipe_id } }"
            >
              View recipe
            </RouterLink>
          </header>
          <p>{{ comment.content }}</p>
          <dl class="profile-comment-dates">
            <div>
              <dt>Created</dt>
              <dd>{{ formatDate(comment.created_at) }}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{{ formatDate(comment.updated_at) }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  </section>
</template>
