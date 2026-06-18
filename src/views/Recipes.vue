<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import RecipeCard from '../components/RecipeCard.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import { useAuthStore } from '../stores/authStore'
import { useFavoriteStore } from '../stores/favoriteStore'
import { useRecipeStore } from '../stores/recipeStore'
import { useUiStore } from '../stores/uiStore'

const recipeStore = useRecipeStore()
const favoriteStore = useFavoriteStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()

const deletingRecipeId = ref(null)
const favoriteBusyIds = ref([])
const showAdvancedFilters = ref(false)
const showAllCategories = ref(false)
const sortBy = ref('newest')
const searchInput = ref(null)

let filterTimer = 0
let suppressNextFilterFetch = false

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=78',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=78',
]

const CATEGORY_IMAGE_MAP = {
  American: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=78',
  Breakfast: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=78',
  Dessert: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=78',
  Drinks: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=78',
  Italian: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=78',
  Japanese: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=1200&q=78',
  Korean: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=78',
  Meal: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=78',
  Mediterranean: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=78',
  Mexican: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1200&q=78',
  Seafood: 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=78',
  Thai: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=1200&q=78',
  Vegetarian: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=78',
  Vietnamese: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=78',
}

const quickFilterChips = [
  { label: 'Quick & Easy', icon: 'sparkles', tag: 'Quick Meal', search: 'quick', sort: 'fastest' },
  { label: 'Healthy', icon: 'leaf', tag: 'Healthy', search: 'healthy', sort: 'lightest' },
  { label: 'Student-friendly', icon: 'book-open', tag: 'Student-friendly', search: 'student', sort: 'fastest' },
  { label: 'Dessert', icon: 'star', category: 'Dessert' },
  { label: 'Drinks', icon: 'utensils', category: 'Drinks' },
  { label: 'Vegetarian', icon: 'leaf', tag: 'Vegetarian', search: 'vegetarian' },
  { label: 'More', icon: 'filter', more: true },
]

const sidebarNav = [
  { label: 'Collections', icon: 'tags', section: 'student-picks' },
  { label: 'Meal Planner', icon: 'calendar', to: '/checklist' },
  { label: 'My Cookbook', icon: 'chef-hat', to: '/profile' },
  { label: 'Favorites', icon: 'heart', to: '/favorites' },
  { label: 'Recently Viewed', icon: 'clock', section: 'all-recipes' },
]

const exploreLinks = [
  { label: 'Seasonal Recipes', icon: 'sparkles', search: 'fresh' },
  { label: 'Cuisine', icon: 'store', section: 'advanced' },
  { label: 'Dietary Needs', icon: 'leaf', tag: 'Healthy' },
  { label: 'Cooking Methods', icon: 'utensils', tag: 'Quick Meal' },
  { label: 'Ingredients', icon: 'tags', focusSearch: true },
  { label: 'Occasions', icon: 'calendar', category: 'Dessert' },
  { label: 'Budget-friendly', icon: 'crown', tag: 'Student-friendly' },
]

const ignoredTrendingTags = new Set(['blog-style', 'editor-pick', 'popular'])

const discoveryRecipes = computed(() =>
  recipeStore.recipeArchive.length ? recipeStore.recipeArchive : recipeStore.recipeList || [],
)
const popularRecipes = computed(() => sortRecipes(discoveryRecipes.value, 'popular'))
const allRecipes = computed(() => sortRecipes(recipeStore.recipeList || []))
const categoryChips = computed(() => recipeStore.categories || [])
const activeCategory = computed(() => recipeStore.filters.category || 'all')
const visibleCategories = computed(() =>
  showAllCategories.value ? categoryChips.value : categoryChips.value.slice(0, 9),
)
const totalRecipeCount = computed(
  () => recipeStore.pagination.totalItems || recipeStore.archivePagination.totalItems || 0,
)
const hasRecipes = computed(() => discoveryRecipes.value.length > 0 || allRecipes.value.length > 0)
const pageNumbers = computed(() => {
  const total = recipeStore.pagination.totalPages
  const current = recipeStore.pagination.currentPage
  const start = Math.max(1, Math.min(current - 2, total - 4))
  const end = Math.min(total, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const featuredRecipe = computed(() => popularRecipes.value[0])
const bigRightNow = computed(() =>
  fillSection(
    popularRecipes.value.filter((recipe) => recipe.id !== featuredRecipe.value?.id),
    popularRecipes.value,
    5,
  ),
)
const studentPicks = computed(() => {
  const preferred = discoveryRecipes.value.filter((recipe) => {
    const text = searchableRecipeText(recipe)
    const minutes = totalMinutes(recipe)
    return (
      text.includes('student') ||
      text.includes('budget') ||
      text.includes('easy') ||
      text.includes('quick meal') ||
      (minutes > 0 && minutes <= 30)
    )
  })

  return fillSection(sortRecipes(preferred, 'fastest'), popularRecipes.value, 3)
})
const healthyChoices = computed(() => {
  const preferred = discoveryRecipes.value.filter((recipe) => {
    const text = searchableRecipeText(recipe)
    const calories = Number(recipe.calories || 0)
    return (
      text.includes('healthy') ||
      text.includes('fresh') ||
      text.includes('vegetarian') ||
      text.includes('high protein') ||
      (calories > 0 && calories <= 450)
    )
  })

  return fillSection(sortRecipes(preferred, 'protein'), popularRecipes.value.slice(3), 3)
})
const todayPicks = computed(() => fillSection(popularRecipes.value.slice(1), discoveryRecipes.value, 3))
const trendingTopics = computed(() => {
  const tagMap = new Map()
  const categoryMap = new Map()

  discoveryRecipes.value.forEach((recipe) => {
    ;(recipe.tags || []).forEach((tag) => {
      const label = firstPresent(tag)
      const key = label.toLowerCase()
      if (!label || ignoredTrendingTags.has(key)) {
        return
      }
      upsertTrendGroup(tagMap, `tag:${key}`, label, 'tag', recipe)
    })

    const category = firstPresent(recipe.category_name)
    if (category) {
      upsertTrendGroup(categoryMap, `category:${category.toLowerCase()}`, category, 'category', recipe)
    }
  })

  const groups = [...tagMap.values(), ...categoryMap.values()]
    .map((group) => ({
      ...group,
      recipe: sortRecipes(group.recipes, 'popular')[0] || group.recipes[0],
      countText: `${group.count} ${group.count === 1 ? 'recipe' : 'recipes'}`,
    }))
    .sort((left, right) => right.count - left.count || scoreRecipe(right.recipe) - scoreRecipe(left.recipe))

  return groups.slice(0, 8)
})
const activeFilterSummary = computed(() => {
  const pieces = []
  if (recipeStore.searchQuery.trim()) {
    pieces.push(`Search: ${recipeStore.searchQuery.trim()}`)
  }
  if (recipeStore.filters.category !== 'all') {
    pieces.push(`Category: ${recipeStore.filters.category}`)
  }
  if (recipeStore.filters.tag !== 'all') {
    pieces.push(`Tag: ${recipeStore.filters.tag}`)
  }
  if (sortBy.value !== 'newest') {
    pieces.push(`Sort: ${sortLabel(sortBy.value)}`)
  }
  return pieces
})

function scheduleRecipeFetch() {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => {
    loadRecipeIndex()
  }, 280)
}

onMounted(() => {
  if (typeof route.query.category === 'string' && route.query.category.trim()) {
    suppressNextFilterFetch = true
    recipeStore.filters.category = route.query.category.trim()
  }

  loadRecipeIndex({ includeMeta: true })

  if (authStore.isLoggedIn) {
    favoriteStore.fetchFavorites().catch(() => {})
  }
})

watch(
  () => [recipeStore.searchQuery, recipeStore.filters.category, recipeStore.filters.tag],
  () => {
    if (suppressNextFilterFetch) {
      suppressNextFilterFetch = false
      return
    }
    scheduleRecipeFetch()
  },
)

watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) {
      favoriteStore.fetchFavorites().catch(() => {})
    }
  },
)

onBeforeUnmount(() => {
  window.clearTimeout(filterTimer)
  recipeStore.cancelRecipeListRequest()
  recipeStore.cancelRecipeArchiveRequest()
})

async function loadRecipeIndex(options = {}) {
  await recipeStore.fetchRecipes(options.page || 1, { includeMeta: options.includeMeta === true })
  if (options.refreshDiscovery !== false) {
    recipeStore.fetchRecipeArchive({ reset: true, pageSize: 120, maxPages: 1 })
  }
}

function fillSection(preferred, fallback, count) {
  const seen = new Set()
  return [...preferred, ...fallback]
    .filter((recipe) => {
      if (!recipe?.id || seen.has(recipe.id)) {
        return false
      }
      seen.add(recipe.id)
      return true
    })
    .slice(0, count)
}

function upsertTrendGroup(map, key, label, type, recipe) {
  const current = map.get(key) || {
    key,
    label,
    value: label,
    type,
    count: 0,
    recipes: [],
  }
  current.count += 1
  current.recipes.push(recipe)
  map.set(key, current)
}

function searchableRecipeText(recipe) {
  return [
    recipe?.title,
    recipe?.description,
    recipe?.category_name,
    recipe?.blog_intro,
    recipe?.difficulty,
    ...(recipe?.tags || []),
  ]
    .join(' ')
    .toLowerCase()
}

function hashText(value) {
  return [...String(value || 'FoodStory')].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0,
  )
}

function firstPresent(...values) {
  const value = values.find((item) => item !== null && item !== undefined && String(item).trim())
  return value === undefined ? '' : String(value).trim()
}

function explicitMinutes(recipe) {
  const total = Number.parseInt(firstPresent(recipe?.total_time, recipe?.totalTime), 10)
  if (Number.isFinite(total) && total > 0) {
    return total
  }

  const prep = Number.parseInt(firstPresent(recipe?.prep_time, recipe?.prepTime), 10) || 0
  const cook = Number.parseInt(firstPresent(recipe?.cook_time, recipe?.cookTime), 10) || 0
  return prep + cook
}

function totalMinutes(recipe) {
  const explicit = explicitMinutes(recipe)
  if (explicit > 0) {
    return explicit
  }

  const text = searchableRecipeText(recipe)
  if (text.includes('drink') || text.includes('smoothie') || text.includes('iced')) {
    return 10 + (hashText(recipe?.title) % 8)
  }
  if (text.includes('quick') || text.includes('student')) {
    return 15 + (hashText(recipe?.title) % 12)
  }
  if (text.includes('dessert') || text.includes('bake')) {
    return 32 + (hashText(recipe?.title) % 18)
  }
  if (text.includes('soup') || text.includes('stew') || text.includes('curry')) {
    return 28 + (hashText(recipe?.title) % 20)
  }
  return 20 + (hashText(recipe?.title) % 25)
}

function formatTotalTime(recipe) {
  return `${totalMinutes(recipe)} min`
}

function servingsLabel(recipe) {
  const explicit = firstPresent(recipe?.servings, recipe?.serving_size, recipe?.yield)
  if (explicit) {
    return `${explicit} servings`
  }

  const text = searchableRecipeText(recipe)
  if (text.includes('drink') || text.includes('smoothie')) {
    return '2 servings'
  }
  if (text.includes('dessert') || text.includes('bake')) {
    return '6 servings'
  }
  return `${2 + (hashText(recipe?.title) % 3)} servings`
}

function difficultyLabel(recipe) {
  const explicit = firstPresent(recipe?.difficulty, recipe?.level)
  if (explicit) {
    return explicit
  }

  const minutes = totalMinutes(recipe)
  if (minutes <= 25) {
    return 'Easy'
  }
  if (minutes <= 42) {
    return 'Medium'
  }
  return 'Weekend'
}

function recipeDescription(recipe, length = 142) {
  const text = firstPresent(recipe?.description, recipe?.blog_intro)
  if (!text) {
    return `A ${firstPresent(recipe?.category_name) || 'FoodStory'} recipe with clear steps, practical ingredients, and home-kitchen notes.`
  }

  return text.length > length ? `${text.slice(0, length).trim()}...` : text
}

function scoreRecipe(recipe) {
  return (
    Number(recipe.avg_rating || recipe.average_rating || 0) * 30 +
    Number(recipe.rating_count || recipe.total_ratings || 0) * 1.7 +
    Number(recipe.comment_count || 0) * 1.2 +
    Number(recipe.favorite_count || 0) * 0.8 +
    safeDate(recipe.created_at || recipe.updated_at) / 100000000000
  )
}

function sortRecipes(recipes, overrideSort = sortBy.value) {
  return [...recipes].sort((left, right) => {
    if (overrideSort === 'popular') {
      return scoreRecipe(right) - scoreRecipe(left)
    }
    if (overrideSort === 'rating') {
      return Number(right.avg_rating || right.average_rating || 0) - Number(left.avg_rating || left.average_rating || 0)
    }
    if (overrideSort === 'fastest') {
      return totalMinutes(left) - totalMinutes(right)
    }
    if (overrideSort === 'lightest') {
      return Number(left.calories || 9999) - Number(right.calories || 9999)
    }
    if (overrideSort === 'protein') {
      return Number(right.protein || 0) - Number(left.protein || 0)
    }
    if (overrideSort === 'saved') {
      return (
        Number(right.favorite_count || 0) - Number(left.favorite_count || 0) ||
        Number(right.rating_count || right.total_ratings || 0) -
          Number(left.rating_count || left.total_ratings || 0) ||
        scoreRecipe(right) - scoreRecipe(left)
      )
    }

    return safeDate(right.created_at || right.updated_at) - safeDate(left.created_at || left.updated_at)
  })
}

function safeDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function recipeMeta(recipe) {
  return [formatTotalTime(recipe), servingsLabel(recipe), difficultyLabel(recipe)].join(' / ')
}

function compactRecipeMeta(recipe) {
  const average = Number(recipe?.avg_rating || recipe?.average_rating || 0)
  const rating = average > 0 ? `${average.toFixed(1)} rating` : difficultyLabel(recipe)
  return [formatTotalTime(recipe), rating].join(' / ')
}

function sortLabel(value) {
  return (
    {
      newest: 'Newest',
      popular: 'Most popular',
      rating: 'Highest rated',
      fastest: 'Fastest',
      lightest: 'Lowest calories',
      protein: 'Highest protein',
      saved: 'Most saved',
    }[value] || 'Newest'
  )
}

function fallbackVisual(recipe) {
  const category = firstPresent(recipe?.category_name)
  const text = searchableRecipeText(recipe)
  if (text.includes('dessert') || text.includes('cookie') || text.includes('cake')) {
    return CATEGORY_IMAGE_MAP.Dessert
  }
  if (text.includes('drink') || text.includes('smoothie') || text.includes('coffee')) {
    return CATEGORY_IMAGE_MAP.Drinks
  }
  if (text.includes('salad') || text.includes('healthy') || text.includes('fresh')) {
    return CATEGORY_IMAGE_MAP.Vegetarian
  }
  if (text.includes('pasta') || text.includes('risotto') || text.includes('italian')) {
    return CATEGORY_IMAGE_MAP.Italian
  }
  if (text.includes('taco') || text.includes('mexican')) {
    return CATEGORY_IMAGE_MAP.Mexican
  }
  if (text.includes('salmon') || text.includes('shrimp') || text.includes('fish')) {
    return CATEGORY_IMAGE_MAP.Seafood
  }

  if (CATEGORY_IMAGE_MAP[category]) {
    return CATEGORY_IMAGE_MAP[category]
  }
  if (category.startsWith('Meal')) {
    return CATEGORY_IMAGE_MAP.Meal
  }

  return FALLBACK_IMAGES[hashText(recipe?.title) % FALLBACK_IMAGES.length]
}

function imageSrc(recipe) {
  return firstPresent(recipe?.image_url, recipe?.imageUrl) || fallbackVisual(recipe)
}

function useFallbackImage(event) {
  if (event.target.dataset.fallbackApplied === 'true') {
    return
  }
  event.target.dataset.fallbackApplied = 'true'
  event.target.src = FALLBACK_IMAGES[0]
}

function resolveCategoryName(name) {
  const target = String(name || '').toLowerCase()
  const normalizedTarget = target.replace(/s$/, '')
  return (
    categoryChips.value.find((category) => category.name.toLowerCase() === target)?.name ||
    categoryChips.value.find(
      (category) => category.name.toLowerCase().replace(/s$/, '') === normalizedTarget,
    )?.name ||
    categoryChips.value.find((category) => category.name.toLowerCase().includes(normalizedTarget))
      ?.name ||
    name
  )
}

function resolveTagName(name) {
  const target = String(name || '').toLowerCase()
  return recipeStore.tags.find((tag) => tag.name.toLowerCase() === target)?.name || ''
}

function setCategory(categoryName) {
  recipeStore.filters.category = categoryName
  recipeStore.pagination.currentPage = 1
}

function setTag(tagName) {
  recipeStore.filters.tag = tagName
  recipeStore.pagination.currentPage = 1
}

function applyQuickFilter(chip) {
  if (chip.more) {
    showAdvancedFilters.value = !showAdvancedFilters.value
    return
  }

  recipeStore.searchQuery = ''
  recipeStore.filters.category = 'all'
  recipeStore.filters.tag = 'all'

  const resolvedTag = chip.tag ? resolveTagName(chip.tag) : ''
  if (chip.category) {
    setCategory(resolveCategoryName(chip.category))
  } else if (resolvedTag) {
    setTag(resolvedTag)
  } else if (chip.search) {
    recipeStore.searchQuery = chip.search
  }

  if (chip.sort) {
    sortBy.value = chip.sort
  }
  recipeStore.pagination.currentPage = 1
}

function isQuickFilterActive(chip) {
  if (chip.more) {
    return showAdvancedFilters.value
  }
  if (chip.category) {
    return activeCategory.value.toLowerCase() === String(chip.category).toLowerCase()
  }

  const resolvedTag = chip.tag ? resolveTagName(chip.tag) : ''
  if (resolvedTag) {
    return recipeStore.filters.tag.toLowerCase() === resolvedTag.toLowerCase()
  }
  if (chip.search) {
    return recipeStore.searchQuery.toLowerCase() === chip.search.toLowerCase()
  }
  return false
}

function clearAllFilters() {
  sortBy.value = 'newest'
  recipeStore.resetFilters()
}

async function goToPage(page) {
  const nextPage = Math.min(Math.max(page, 1), recipeStore.pagination.totalPages)
  await loadRecipeIndex({ page: nextPage, refreshDiscovery: false })
  document.getElementById('all-recipes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function jumpToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function focusRecipeSearch() {
  await nextTick()
  searchInput.value?.focus()
}

function handleSidebarAction(item) {
  if (item.section === 'advanced') {
    showAdvancedFilters.value = true
    scrollToSection('discover')
    return
  }
  if (item.section) {
    scrollToSection(item.section)
    return
  }
  if (item.focusSearch) {
    scrollToSection('discover')
    focusRecipeSearch()
    return
  }
  if (item.category) {
    applyQuickFilter({ label: item.label, category: item.category })
    return
  }
  if (item.tag) {
    applyQuickFilter({ label: item.label, tag: item.tag, search: item.search })
    return
  }
  if (item.search) {
    recipeStore.searchQuery = item.search
    recipeStore.filters.category = 'all'
    recipeStore.filters.tag = 'all'
    recipeStore.pagination.currentPage = 1
  }
}

function applyTrend(topic) {
  recipeStore.searchQuery = ''
  recipeStore.filters.category = 'all'
  recipeStore.filters.tag = 'all'

  if (topic.type === 'tag') {
    setTag(topic.value)
  } else if (topic.type === 'category') {
    setCategory(topic.value)
  } else {
    recipeStore.searchQuery = topic.label
  }

  recipeStore.pagination.currentPage = 1
  scrollToSection('all-recipes')
}

function setSortAndShow(sort) {
  sortBy.value = sort
  scrollToSection('all-recipes')
}

function isRecipeFavorite(recipe) {
  if (!recipe?.id) {
    return false
  }

  return Boolean(
    recipe.is_favorite ||
      recipe.current_user_favorite ||
      favoriteStore.favoriteIds.includes(Number(recipe.id)),
  )
}

function isFavoriteBusy(recipe) {
  return favoriteBusyIds.value.includes(Number(recipe?.id))
}

function setFavoriteBusy(recipeId, isBusy) {
  const id = Number(recipeId)
  favoriteBusyIds.value = isBusy
    ? [...new Set([...favoriteBusyIds.value, id])]
    : favoriteBusyIds.value.filter((item) => item !== id)
}

async function toggleFavorite(recipe) {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (!recipe?.id || isFavoriteBusy(recipe)) {
    return
  }

  const recipeId = Number(recipe.id)
  setFavoriteBusy(recipeId, true)
  try {
    if (isRecipeFavorite(recipe)) {
      const changed = await favoriteStore.removeFavorite(recipeId)
      if (!changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: false,
        current_user_favorite: false,
        favorite_count: Math.max(Number(recipe.favorite_count || 0) - 1, 0),
      })
    } else {
      const nextCount = Number(recipe.favorite_count || 0) + 1
      const changed = await favoriteStore.addFavorite(recipeId, {
        ...recipe,
        is_favorite: true,
        current_user_favorite: true,
        favorite_count: nextCount,
      })
      if (!changed) {
        return
      }
      recipeStore.updateRecipeCache(recipeId, {
        is_favorite: true,
        current_user_favorite: true,
        favorite_count: nextCount,
      })
    }
  } catch (error) {
    uiStore.setError(error.message || 'Unable to update favorite.')
  } finally {
    setFavoriteBusy(recipeId, false)
  }
}

async function deleteRecipe(recipe) {
  if (deletingRecipeId.value) {
    return
  }

  const confirmed = window.confirm(`Delete "${recipe.title}"? This cannot be undone.`)
  if (!confirmed) {
    return
  }

  deletingRecipeId.value = recipe.id
  try {
    await recipeStore.deleteRecipe(recipe.id)
    await loadRecipeIndex({ page: recipeStore.pagination.currentPage })
  } catch (error) {
    recipeStore.error = error.message
  } finally {
    deletingRecipeId.value = null
  }
}
</script>

<template>
  <section class="recipe-reference-page" aria-label="FoodStory recipe discovery">
    <div class="recipe-reference-layout">
      <aside class="recipe-left-sidebar" aria-label="Recipe navigation">
        <nav class="recipe-sidebar-nav" aria-label="Primary recipe navigation">
          <template v-for="item in sidebarNav" :key="item.label">
            <RouterLink
              v-if="item.to"
              :to="item.to"
              :class="{ active: item.active }"
            >
              <AppIcon :name="item.icon" size="17" />
              <span>{{ item.label }}</span>
            </RouterLink>
            <button
              v-else
              type="button"
              :class="{ active: item.active }"
              @click="handleSidebarAction(item)"
            >
              <AppIcon :name="item.icon" size="17" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </nav>

        <div class="recipe-sidebar-divider" aria-hidden="true"></div>

        <section class="recipe-sidebar-section" aria-label="Explore recipe filters">
          <h2>Explore</h2>
          <button
            v-for="item in exploreLinks"
            :key="item.label"
            type="button"
            @click="handleSidebarAction(item)"
          >
            <AppIcon :name="item.icon" size="15" />
            <span>{{ item.label }}</span>
          </button>
        </section>

        <section class="recipe-sidebar-cta">
          <AppIcon name="chef-hat" size="34" />
          <p>Create your own collections and save your favorites.</p>
          <RouterLink :to="authStore.isLoggedIn ? '/profile' : '/login'">
            {{ authStore.isLoggedIn ? 'Open profile' : 'Sign in / Sign up' }}
          </RouterLink>
        </section>
      </aside>

      <main class="recipe-reference-main">
        <header id="discover" class="recipe-reference-hero">
          <img
            v-if="bigRightNow[0]"
            class="recipe-hero-ornament ornament-left"
            :src="imageSrc(bigRightNow[0])"
            alt=""
            loading="eager"
            decoding="async"
            @error="useFallbackImage"
          />
          <img
            v-if="healthyChoices[0]"
            class="recipe-hero-ornament ornament-right"
            :src="imageSrc(healthyChoices[0])"
            alt=""
            loading="eager"
            decoding="async"
            @error="useFallbackImage"
          />

          <div class="recipe-hero-copy">
            <h1>Our Very Best Recipes</h1>
            <p>Tried, tested and loved by our community of home cooks.</p>
          </div>

          <RouterLink
            v-if="!authStore.isAdmin"
            class="recipe-submit-cta"
            :to="
              authStore.isLoggedIn
                ? { name: 'recipe-submit' }
                : { name: 'login', query: { redirect: '/recipes/submit' } }
            "
          >
            <AppIcon name="send" size="17" />
            <span>
              {{ authStore.isLoggedIn ? 'Submit your recipe' : 'Log in to submit a recipe' }}
            </span>
          </RouterLink>

          <form class="recipe-reference-search" @submit.prevent>
            <label>
              <span class="sr-only">Search recipes</span>
              <input
                ref="searchInput"
                v-model="recipeStore.searchQuery"
                type="search"
                placeholder="Search recipes, ingredients, cuisines..."
              />
              <AppIcon name="search" size="24" />
            </label>
          </form>

          <div class="recipe-reference-chips" aria-label="Quick recipe filters">
            <button
              v-for="chip in quickFilterChips"
              :key="chip.label"
              type="button"
              :class="{ active: isQuickFilterActive(chip) }"
              @click="applyQuickFilter(chip)"
            >
              <AppIcon :name="chip.icon" size="16" />
              <span>{{ chip.label }}</span>
            </button>
          </div>

          <div class="recipe-filter-tools">
            <button
              type="button"
              :aria-expanded="showAdvancedFilters"
              @click="showAdvancedFilters = !showAdvancedFilters"
            >
              <AppIcon name="filter" size="15" />
              <span>Advanced filters</span>
            </button>
            <button
              v-if="activeFilterSummary.length"
              class="clear-filter-pill"
              type="button"
              @click="clearAllFilters"
            >
              Clear all
            </button>
          </div>

          <Transition name="recipe-filter-panel">
            <div v-if="showAdvancedFilters" class="recipe-advanced-panel">
              <label>
                <span>Category</span>
                <select v-model="recipeStore.filters.category">
                  <option value="all">All categories</option>
                  <option v-for="category in categoryChips" :key="category.id" :value="category.name">
                    {{ category.name }}
                  </option>
                </select>
              </label>

              <label>
                <span>Tag</span>
                <select v-model="recipeStore.filters.tag">
                  <option value="all">All tags</option>
                  <option v-for="tag in recipeStore.tags" :key="tag.id" :value="tag.name">
                    {{ tag.name }}
                  </option>
                </select>
              </label>

              <label>
                <span>Sort by</span>
                <select v-model="sortBy">
                  <option value="newest">Newest</option>
                  <option value="popular">Most popular</option>
                  <option value="rating">Highest rated</option>
                  <option value="fastest">Fastest</option>
                  <option value="lightest">Lowest calories</option>
                  <option value="protein">Highest protein</option>
                  <option value="saved">Most saved</option>
                </select>
              </label>

              <nav class="recipe-category-strip" aria-label="Explore recipe categories">
                <button
                  type="button"
                  :class="{ active: activeCategory === 'all' }"
                  @click="setCategory('all')"
                >
                  All
                </button>
                <button
                  v-for="category in visibleCategories"
                  :key="category.id"
                  type="button"
                  :class="{ active: activeCategory === category.name }"
                  @click="setCategory(category.name)"
                >
                  {{ category.name }}
                </button>
                <button
                  v-if="categoryChips.length > 9"
                  type="button"
                  @click="showAllCategories = !showAllCategories"
                >
                  {{ showAllCategories ? 'Show less' : 'More categories' }}
                </button>
              </nav>
            </div>
          </Transition>

          <div v-if="activeFilterSummary.length" class="active-filter-summary">
            <span v-for="item in activeFilterSummary" :key="item">{{ item }}</span>
          </div>
        </header>

        <div v-if="recipeStore.isLoading" class="recipe-reference-loading" aria-label="Loading recipes">
          <SkeletonCard v-for="index in 6" :key="index" />
        </div>
        <p v-else-if="recipeStore.error" class="form-error" role="alert">{{ recipeStore.error }}</p>

        <template v-else>
          <p v-if="!hasRecipes" class="empty-state">
            No recipes match your search and filters.
          </p>

          <section v-if="featuredRecipe" id="featured" class="recipe-feature-banner">
            <RouterLink
              class="feature-image-panel"
              :to="{ name: 'recipe-detail', params: { id: featuredRecipe.id } }"
              :aria-label="`Open ${featuredRecipe.title}`"
            >
              <img
                :src="imageSrc(featuredRecipe)"
                :alt="`Photo of ${featuredRecipe.title}`"
                loading="eager"
                decoding="async"
                @error="useFallbackImage"
              />
            </RouterLink>
            <div class="feature-copy-panel">
              <p class="recipe-kicker">
                <AppIcon name="star" size="14" />
                Featured Recipe
              </p>
              <h2>{{ featuredRecipe.title }}</h2>
              <p>{{ recipeDescription(featuredRecipe, 178) }}</p>
              <div class="feature-meta" aria-label="Recipe details">
                <span>
                  <AppIcon name="clock" size="15" />
                  {{ formatTotalTime(featuredRecipe) }}
                </span>
                <span>
                  <AppIcon name="users" size="15" />
                  {{ servingsLabel(featuredRecipe) }}
                </span>
                <span>
                  <AppIcon name="tags" size="15" />
                  {{ difficultyLabel(featuredRecipe) }}
                </span>
              </div>
              <div class="feature-actions">
                <RouterLink
                  class="recipe-solid-button"
                  :to="{ name: 'recipe-detail', params: { id: featuredRecipe.id } }"
                >
                  View Recipe
                </RouterLink>
                <button
                  class="recipe-bookmark-button"
                  type="button"
                  :class="{ saved: isRecipeFavorite(featuredRecipe) }"
                  :disabled="isFavoriteBusy(featuredRecipe)"
                  :aria-pressed="isRecipeFavorite(featuredRecipe)"
                  :aria-label="isRecipeFavorite(featuredRecipe) ? 'Remove from favorites' : 'Save recipe'"
                  @click="toggleFavorite(featuredRecipe)"
                >
                  <AppIcon name="bookmark" size="20" />
                </button>
              </div>
            </div>
          </section>

          <section v-if="bigRightNow.length" id="big-right-now" class="reference-section">
            <div class="reference-section-title">
              <h2>Big Right Now</h2>
              <button type="button" @click="setSortAndShow('popular')">
                <span>View all</span>
                <AppIcon name="arrow-right" size="15" />
              </button>
            </div>

            <div class="big-right-now-row">
              <article
                v-for="recipe in bigRightNow"
                :key="`big-${recipe.id}`"
                class="right-now-card"
              >
                <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
                  <img
                    :src="imageSrc(recipe)"
                    :alt="`Photo of ${recipe.title}`"
                    loading="lazy"
                    decoding="async"
                    @error="useFallbackImage"
                  />
                  <span>
                    <strong>{{ recipe.title }}</strong>
                    <small>{{ compactRecipeMeta(recipe) }}</small>
                  </span>
                </RouterLink>
                <button
                  type="button"
                  :class="{ saved: isRecipeFavorite(recipe) }"
                  :disabled="isFavoriteBusy(recipe)"
                  :aria-pressed="isRecipeFavorite(recipe)"
                  :aria-label="isRecipeFavorite(recipe) ? 'Remove from favorites' : 'Save recipe'"
                  @click="toggleFavorite(recipe)"
                >
                  <AppIcon name="bookmark" size="16" />
                </button>
              </article>
            </div>
          </section>

          <section v-if="studentPicks.length" id="student-picks" class="reference-section">
            <div class="reference-section-title with-subtitle">
              <div>
                <h2>
                  <AppIcon name="book-open" size="22" />
                  Student Picks
                </h2>
                <p>Budget-friendly, easy and delicious.</p>
              </div>
              <button type="button" @click="applyQuickFilter({ label: 'Student-friendly', tag: 'Student-friendly', search: 'student', sort: 'fastest' })">
                <span>View all</span>
                <AppIcon name="arrow-right" size="15" />
              </button>
            </div>

            <div class="student-picks-grid">
              <article
                v-for="recipe in studentPicks"
                :key="`student-${recipe.id}`"
                class="student-pick-card"
              >
                <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
                  <img
                    :src="imageSrc(recipe)"
                    :alt="`Photo of ${recipe.title}`"
                    loading="lazy"
                    decoding="async"
                    @error="useFallbackImage"
                  />
                  <span>
                    <strong>{{ recipe.title }}</strong>
                    <small>{{ recipeMeta(recipe) }}</small>
                  </span>
                </RouterLink>
                <button
                  type="button"
                  :class="{ saved: isRecipeFavorite(recipe) }"
                  :disabled="isFavoriteBusy(recipe)"
                  :aria-pressed="isRecipeFavorite(recipe)"
                  :aria-label="isRecipeFavorite(recipe) ? 'Remove from favorites' : 'Save recipe'"
                  @click="toggleFavorite(recipe)"
                >
                  <AppIcon name="bookmark" size="17" />
                </button>
              </article>
            </div>
          </section>

          <section v-if="healthyChoices.length" id="healthy-choices" class="reference-section">
            <div class="reference-section-title with-subtitle">
              <div>
                <h2>
                  <AppIcon name="leaf" size="22" />
                  Healthy Choices
                </h2>
                <p>Nourishing recipes for a balanced lifestyle.</p>
              </div>
              <button type="button" @click="applyQuickFilter({ label: 'Healthy', tag: 'Healthy', search: 'healthy', sort: 'lightest' })">
                <span>View all</span>
                <AppIcon name="arrow-right" size="15" />
              </button>
            </div>

            <div class="healthy-choice-grid">
              <article
                v-for="recipe in healthyChoices"
                :key="`healthy-${recipe.id}`"
                class="healthy-choice-card"
              >
                <RouterLink :to="{ name: 'recipe-detail', params: { id: recipe.id } }">
                  <figure>
                    <img
                      :src="imageSrc(recipe)"
                      :alt="`Photo of ${recipe.title}`"
                      loading="lazy"
                      decoding="async"
                      @error="useFallbackImage"
                    />
                  </figure>
                  <div>
                    <span>{{ recipe.category_name || 'Healthy' }}</span>
                    <h3>{{ recipe.title }}</h3>
                    <p>{{ recipeDescription(recipe, 94) }}</p>
                    <small>{{ recipe.protein || 'N/A' }}g protein / {{ recipe.calories || 'N/A' }} cal</small>
                  </div>
                </RouterLink>
              </article>
            </div>
          </section>

          <section v-if="allRecipes.length" id="all-recipes" class="reference-section all-recipes-reference">
            <div class="reference-section-title with-subtitle">
              <div>
                <h2>All Recipes</h2>
                <p>Browse a page-sized archive without dumping the entire database.</p>
              </div>
              <span>
                Page {{ recipeStore.pagination.currentPage }} of {{ recipeStore.pagination.totalPages }}
                / {{ totalRecipeCount }} recipes
              </span>
            </div>

            <div class="reference-all-grid">
              <RecipeCard
                v-for="recipe in allRecipes"
                :key="`all-${recipe.id}`"
                :recipe="{ ...recipe, image_url: imageSrc(recipe) }"
                :is-deleting="deletingRecipeId === recipe.id"
                @delete="deleteRecipe"
              />
            </div>

            <nav
              v-if="recipeStore.pagination.totalItems > recipeStore.pagination.pageSize"
              class="pagination reference-pagination"
              aria-label="Recipe pagination"
            >
              <button
                type="button"
                :disabled="recipeStore.pagination.currentPage === 1"
                @click="goToPage(recipeStore.pagination.currentPage - 1)"
              >
                <AppIcon name="arrow-left" size="16" />
                <span>Previous</span>
              </button>
              <button
                v-for="page in pageNumbers"
                :key="page"
                type="button"
                :class="{ active: page === recipeStore.pagination.currentPage }"
                :aria-current="page === recipeStore.pagination.currentPage ? 'page' : undefined"
                @click="goToPage(page)"
              >
                {{ page }}
              </button>
              <button
                type="button"
                :disabled="recipeStore.pagination.currentPage === recipeStore.pagination.totalPages"
                @click="goToPage(recipeStore.pagination.currentPage + 1)"
              >
                <span>Next</span>
                <AppIcon name="arrow-right" size="16" />
              </button>
            </nav>
          </section>
        </template>
      </main>

      <aside class="recipe-right-rail" aria-label="Trending recipes">
        <section v-if="trendingTopics.length" class="trending-card">
          <h2>
            <AppIcon name="trending-up" size="18" />
            Trending Now
          </h2>
          <button
            v-for="topic in trendingTopics"
            :key="topic.key"
            type="button"
            @click="applyTrend(topic)"
          >
            <img
              :src="imageSrc(topic.recipe)"
              alt=""
              loading="lazy"
              decoding="async"
              @error="useFallbackImage"
            />
            <span>{{ topic.label }}</span>
            <small>{{ topic.countText }}</small>
          </button>
          <button class="view-trends-button" type="button" @click="showAdvancedFilters = true">
            <span>View all trends</span>
            <AppIcon name="arrow-right" size="15" />
          </button>
        </section>

        <section
          class="back-to-top-card"
          :style="{ '--rail-image': `url(${imageSrc(todayPicks[0] || featuredRecipe)})` }"
        >
          <button type="button" aria-label="Back to top" @click="jumpToTop">
            <AppIcon name="arrow-right" size="25" />
          </button>
          <h2>Back to top</h2>
          <p>So many delicious recipes to explore.</p>
        </section>
      </aside>
    </div>
  </section>
</template>
