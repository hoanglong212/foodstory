<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import {
  buildConversationMemory,
  CHAT_MEMORY_LIMITS,
} from '../utils/chatConversationMemory'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const isOpen = ref(false)
const messages = ref([])
const inputText = ref('')
const isLoading = ref(false)
const isSearchingImage = ref(false)
const hasUnread = ref(false)
const messagesElement = ref(null)
const inputElement = ref(null)
const launcherElement = ref(null)
const lastRecipeId = ref(null)
const lastRecipeTitle = ref(null)
const lastRestaurantId = ref(null)
const recipeSearchFilters = ref(null)
const imagePreviewUrls = new Set()
const isBusy = computed(() => isLoading.value || isSearchingImage.value)
const CHAT_HISTORY_VERSION = 2
const MAX_STORED_MESSAGES = 80
const MAX_CONTEXT_MESSAGES = CHAT_MEMORY_LIMITS.recentMessageCount

function chatStorageKey() {
  return `foodstory:foodbot:${CHAT_HISTORY_VERSION}:${authStore.user?.id || 'guest'}`
}

function greetingMessage() {
  return {
    role: 'bot',
    content:
      'Hi! I’m FoodBot. Ask in English or Tiếng Việt about recipes, places to eat, FoodStory features, or your saved food data.',
    type: 'greeting',
    retrievalStatus: null,
    confidence: 0,
    results: [],
    sources: [],
    suggestions: [
      'Tìm quán bánh mì ở Quận 1',
      'Tôi có trứng và sữa thì làm món gì?',
      'Food Map hoạt động thế nào?',
    ],
  }
}

function normalizedRecipeSearchFilters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const numberOrNull = (input) => {
    if (input === null || input === undefined || input === '') return null
    const parsed = Number(input)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const allowedSorts = new Set([
    'popular',
    'rating',
    'fastest',
    'lightest',
    'protein',
    'saved',
  ])
  return {
    category: typeof value.category === 'string' ? value.category.slice(0, 80) || null : null,
    tag: typeof value.tag === 'string' ? value.tag.slice(0, 80) || null : null,
    maxCalories: numberOrNull(value.maxCalories),
    minRating: numberOrNull(value.minRating),
    maxTotalTime: numberOrNull(value.maxTotalTime),
    minProtein: numberOrNull(value.minProtein),
    sort: allowedSorts.has(value.sort) ? value.sort : 'popular',
  }
}

function storableMessage(message = {}) {
  return {
    role: message.role === 'user' ? 'user' : 'bot',
    content: String(message.content || '').slice(0, 4000),
    retryText: String(message.retryText || '').slice(0, 800),
    type: message.type || null,
    intent: message.intent || null,
    retrievalStatus: message.retrievalStatus || null,
    systemMessage: String(message.systemMessage || '').slice(0, 500),
    confidence: Number(message.confidence || 0),
    sources: Array.isArray(message.sources) ? message.sources.slice(0, 3) : [],
    results: Array.isArray(message.results) ? message.results.slice(0, 5) : [],
    suggestions: Array.isArray(message.suggestions)
      ? message.suggestions.slice(0, 4)
      : [],
    recipeSearchFilters: normalizedRecipeSearchFilters(message.recipeSearchFilters),
  }
}

function persistConversation() {
  try {
    window.localStorage.setItem(
      chatStorageKey(),
      JSON.stringify({
        messages: messages.value
          .slice(-MAX_STORED_MESSAGES)
          .map(storableMessage),
        context: {
          lastRecipeId: lastRecipeId.value,
          lastRecipeTitle: lastRecipeTitle.value,
          lastRestaurantId: lastRestaurantId.value,
          recipeSearchFilters: recipeSearchFilters.value,
        },
      }),
    )
  } catch {
    // The chatbot remains usable when browser storage is unavailable or full.
  }
}

function restoreConversation() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(chatStorageKey()) || 'null')
    if (!stored || !Array.isArray(stored.messages)) return false
    messages.value = stored.messages
      .filter((message) => ['user', 'bot'].includes(message?.role) && message?.content)
      .slice(-MAX_STORED_MESSAGES)
      .map(storableMessage)
    lastRecipeId.value = stored.context?.lastRecipeId || null
    lastRecipeTitle.value = stored.context?.lastRecipeTitle || null
    lastRestaurantId.value = stored.context?.lastRestaurantId || null
    recipeSearchFilters.value = normalizedRecipeSearchFilters(
      stored.context?.recipeSearchFilters,
    )
    return messages.value.length > 0
  } catch {
    return false
  }
}

function conversationHistoryForApi() {
  return messages.value
    .slice(0, -1)
    .filter(
      (message) =>
        ['user', 'bot'].includes(message.role) &&
        message.content &&
        message.type !== 'error',
    )
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role === 'bot' ? 'assistant' : 'user',
      content: message.content,
      intent: message.intent || null,
      sources: message.sources || [],
    }))
}

function conversationMemoryForApi() {
  return buildConversationMemory(
    messages.value.slice(0, -1).filter((message) => message.type !== 'error'),
    {
      recentMessageCount: MAX_CONTEXT_MESSAGES,
      maxChars: CHAT_MEMORY_LIMITS.maxChars,
    },
  )
}

function startNewConversation() {
  imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url))
  imagePreviewUrls.clear()
  messages.value = [greetingMessage()]
  lastRecipeId.value = null
  lastRecipeTitle.value = null
  lastRestaurantId.value = null
  recipeSearchFilters.value = null
  hasUnread.value = false
  persistConversation()
  nextTick(scrollToBottom)
}

function scrollToBottom() {
  const element = messagesElement.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

async function openChat() {
  isOpen.value = true
  hasUnread.value = false
  await nextTick()
  scrollToBottom()
  inputElement.value?.focus()
}

async function closeChat() {
  isOpen.value = false
  await nextTick()
  launcherElement.value?.focus()
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') closeChat()
}

function handleComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function resultImage(result = {}) {
  return (
    result.image_url ||
    result.imageUrl ||
    result.image ||
    result.thumbnail ||
    '/images/food-placeholder.jpg'
  )
}

function responseLabel(message = {}) {
  if (message.type === 'greeting') return 'Ready to help'
  if (message.retrievalStatus === 'external_sources') return 'Researched on the web'
  if (message.type === 'website_live_data') return 'Live FoodStory data'
  if (message.retrievalStatus === 'general_knowledge') {
    return message.type === 'general_knowledge'
      ? 'Answered with Groq knowledge'
      : 'Groq cooking guidance'
  }
  if (message.sources?.length) return 'Grounded in FoodStory'
  if (message.type === 'error') return 'Needs attention'
  return null
}

function displayMessageContent(value) {
  return String(value || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function messageLooksVietnamese(message = {}) {
  const value = String(message.content || '').toLowerCase()
  return (
    /[ăâđêôơưà-ỹ]/u.test(value) ||
    /\b(?:tôi|minh|món|công thức|nguyên liệu|foodstory chưa)\b/u.test(value)
  )
}

function ingredientMatchLabel(result = {}, message = {}) {
  if (result.match_coverage === null || result.match_coverage === undefined) {
    return ''
  }
  const matched = Number(result.matched_ingredient_count || 0)
  const requested = Number(result.requested_ingredient_count || 0)
  if (!matched || !requested) return ''
  const exact = Number(result.match_coverage) >= 0.999
  if (messageLooksVietnamese(message)) {
    return exact
      ? `Đủ ${matched}/${requested} nguyên liệu`
      : `Khớp ${matched}/${requested} nguyên liệu`
  }
  return exact
    ? `All ${matched}/${requested} ingredients`
    : `Matches ${matched}/${requested} ingredients`
}

function sourceSummary(message = {}) {
  const count = Number(message.sources?.length || 0)
  const hasExternalSources = message.sources?.some(
    (source) => source.sourceType === 'external',
  )
  const label = hasExternalSources ? 'Web source' : 'FoodStory source'
  return `${label}${count === 1 ? '' : 's'} · ${count}`
}

function sourceAriaLabel(message = {}) {
  const count = Number(message.sources?.length || 0)
  const sourceKind = message.sources?.some(
    (source) => source.sourceType === 'external',
  )
    ? 'web'
    : 'FoodStory'
  return `${count} ${sourceKind} source${count === 1 ? '' : 's'}`
}

function resultKind(message, result) {
  if (result.result_type) return result.result_type
  if (message.type === 'restaurants') return 'restaurant'
  if (message.type === 'recipes') return 'recipe'
  if (message.type === 'spots') return 'spot'
  return 'unknown'
}

function ratingLabel(value) {
  const rating = Number(value || 0)
  return rating > 0 ? `${rating.toFixed(1)} ★` : 'No ratings yet'
}

function recipeTime(recipe) {
  const total = Number(recipe.prep_time || 0) + Number(recipe.cook_time || 0)
  return total > 0 ? `${total} minutes` : 'Time not available'
}

function mapQueryFor(result) {
  return result.category || result.dish_name || result.name || ''
}

function openMap(result = {}) {
  closeChat()
  router.push({
    path: '/food-map',
    query: {
      dish: mapQueryFor(result) || undefined,
      mode: result.result_type === 'spot' ? 'personal' : undefined,
    },
  })
}

function openRecipe(result) {
  closeChat()
  router.push(`/recipes/${result.id}`)
}

function openRecipeCollection(filters = {}) {
  const normalized = normalizedRecipeSearchFilters(filters)
  closeChat()
  router.push({
    path: '/recipes',
    query: {
      category: normalized?.category || undefined,
      tag: normalized?.tag || undefined,
      sort: normalized?.sort || undefined,
    },
  })
}

function inspirationIngredients(result = {}) {
  return Array.isArray(result.ingredients)
    ? result.ingredients
        .map((item) => item?.name)
        .filter(Boolean)
        .slice(0, 5)
        .join(', ')
    : ''
}

function openDailyInspiration() {
  closeChat()
  router.push({ path: '/', hash: '#daily-inspiration' })
}

function openVisionRecipe(result) {
  closeChat()
  router.push(`/recipes/${result.source_id}`)
}

function openVisionRestaurant(result) {
  closeChat()
  router.push({
    path: '/food-map',
    query: { dish: result.category || result.title || undefined },
  })
}

function openLogin() {
  closeChat()
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function sourceTypeLabel(type) {
  if (type === 'restaurant') return 'Restaurant'
  if (type === 'recipe') return 'Recipe'
  if (type === 'food_spot') return 'Food spot'
  if (type === 'website') return 'FoodStory guide'
  if (type === 'external') return 'Web source'
  return 'FoodStory source'
}

function sourceActionLabel(source) {
  if (source.sourceType === 'recipe') return 'View recipe'
  if (source.sourceType === 'restaurant' || source.sourceType === 'food_spot') {
    return 'View on map'
  }
  if (source.sourceType === 'website') return 'Open page'
  if (source.sourceType === 'external') return 'Open source'
  return 'Open'
}

function confidenceLabel(value) {
  const score = Number(value || 0)
  return score > 0 ? `${Math.round(score * 100)}% match` : 'No confidence score'
}

function warningText(status) {
  if (status === 'no_exact_constraint_match') {
    return 'No exact match found. Showing the closest FoodStory alternatives.'
  }

  if (status === 'weak_match') {
    return 'FoodStory does not have enough reliable data for this question.'
  }

  if (status === 'no_results') {
    return 'No FoodStory data was found for this question.'
  }

  return ''
}

function openSource(source = {}) {
  closeChat()

  if (source.sourceType === 'external' && source.url) {
    try {
      const url = new URL(source.url)
      if (['http:', 'https:'].includes(url.protocol)) {
        window.open(url.toString(), '_blank', 'noopener,noreferrer')
      }
    } catch {
      // Invalid external URLs are ignored instead of being opened.
    }
    return
  }

  if (source.sourceType === 'website' && source.path) {
    router.push(source.path)
    return
  }

  if (source.sourceType === 'recipe') {
    router.push(`/recipes/${source.sourceId}`)
    return
  }

  if (source.sourceType === 'restaurant' || source.sourceType === 'food_spot') {
    router.push({
      path: '/food-map',
      query: {
        dish: source.title || undefined,
        mode: source.sourceType === 'food_spot' ? 'personal' : undefined,
      },
    })
  }
}

function updateRecentContext(data = {}) {
  if (data.conversationContext) {
    lastRecipeId.value = data.conversationContext.lastRecipeId || null
    lastRecipeTitle.value = data.conversationContext.lastRecipeTitle || null
    lastRestaurantId.value = data.conversationContext.lastRestaurantId || null
    recipeSearchFilters.value = normalizedRecipeSearchFilters(
      data.conversationContext.recipeSearchFilters,
    )
    return
  }
  if (!['structured', 'grounded_rag'].includes(data.mode)) return

  const recipeSource = data.sources?.find((source) => source.sourceType === 'recipe')
  const restaurantSource = data.sources?.find(
    (source) => source.sourceType === 'restaurant',
  )

  if (recipeSource?.sourceId) {
    lastRecipeId.value = recipeSource.sourceId
    lastRecipeTitle.value = recipeSource.title || null
  }
  if (restaurantSource?.sourceId) {
    lastRestaurantId.value = restaurantSource.sourceId
  }
}


async function handleSuggestion(suggestion, message) {
  const normalized = suggestion.toLocaleLowerCase('en')
  const firstResult = message.results?.[0]

  if (normalized === 'try again' && message.retryText) {
    await sendMessage(message.retryText)
    return
  }

  if (normalized.includes('log in') || normalized.includes('login')) {
    openLogin()
    return
  }
  if (
    normalized.includes('map') ||
    normalized.includes('all restaurants')
  ) {
    openMap(firstResult)
    return
  }
  if (
    firstResult &&
    resultKind(message, firstResult) === 'recipe' &&
    (normalized.includes('view recipe') || normalized.includes('save favorite'))
  ) {
    openRecipe(firstResult)
    return
  }
  if (normalized.includes('all recipes')) {
    closeChat()
    router.push('/recipes')
    return
  }

  await sendMessage(suggestion)
}

async function sendMessage(text = inputText.value) {
  const content = String(text || '').trim()
  if (!content || isBusy.value) return

  messages.value.push({ role: 'user', content })
  persistConversation()
  inputText.value = ''
  isLoading.value = true

  await nextTick()
  scrollToBottom()

  try {
    const response = await api.post('/chatbot/ask', {
      message: content,
      lastRecipeId: lastRecipeId.value,
      lastRecipeTitle: lastRecipeTitle.value,
      lastRestaurantId: lastRestaurantId.value,
      recipeSearchFilters: recipeSearchFilters.value,
      conversationHistory: conversationHistoryForApi(),
      conversationMemory: conversationMemoryForApi(),
    })

    const data = response.data
    updateRecentContext(data)

    messages.value.push({
      role: 'bot',
      content: data.answer || 'FoodStory could not generate an answer.',
      type: data.mode || 'grounded_rag',
      intent: data.intent || null,
      retrievalStatus: data.retrievalStatus || null,
      systemMessage: data.message || '',
      confidence: data.confidence || 0,
      sources: data.sources || [],
      results: data.results || [],
      suggestions: data.suggestions || [],
      recipeSearchFilters: normalizedRecipeSearchFilters(data.recipeSearchFilters),
    })
    persistConversation()

    if (!isOpen.value) {
      hasUnread.value = true
    }
  } catch (error) {
    messages.value.push({
      role: 'bot',
      content: 'Sorry, FoodStory Assistant is currently unavailable.',
      retryText: content,
      type: 'error',
      retrievalStatus: 'error',
      systemMessage: error?.response?.data?.message || error.message,
      results: [],
      sources: [],
      suggestions: ['Try again'],
    })
    persistConversation()
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function handleImageUpload(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''

  if (!file || isBusy.value) return

  if (!file.type.startsWith('image/')) {
    messages.value.push({
      role: 'bot',
      content: 'Please choose a JPEG, PNG, WebP, or GIF image.',
      type: 'error',
    })
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    messages.value.push({
      role: 'bot',
      content: 'The image must be 5MB or smaller.',
      type: 'error',
    })
    return
  }

  const imagePreview = URL.createObjectURL(file)
  imagePreviewUrls.add(imagePreview)
  messages.value.push({
    role: 'user',
    content: 'Searching FoodStory with this image...',
    imagePreview,
  })
  isSearchingImage.value = true

  await nextTick()
  scrollToBottom()

  try {
    const formData = new FormData()
    formData.append('image', file)
    const response = await api.post('/vision/search', formData, { timeout: 20_000 })
    const { recipes = [], restaurants = [], total = 0 } = response.data

    if (total === 0) {
      messages.value.push({
        role: 'bot',
        content:
          "I couldn't find a similar dish in FoodStory. Try a clearer, closer photo of the food.",
        type: 'vision_no_result',
      })
    } else {
      messages.value.push({
        role: 'bot',
        content: `Found ${total} similar FoodStory item${total === 1 ? '' : 's'}.`,
        type: 'vision_result',
        visionRecipes: recipes,
        visionRestaurants: restaurants,
      })
    }
  } catch (error) {
    messages.value.push({
      role: 'bot',
      content: error.response?.data?.error || 'Image search failed. Please try again.',
      type: 'error',
    })
  } finally {
    isSearchingImage.value = false
    await nextTick()
    scrollToBottom()
  }
}

onMounted(() => {
  if (!restoreConversation()) {
    messages.value = [greetingMessage()]
    persistConversation()
    hasUnread.value = true
  }
})

onBeforeUnmount(() => {
  imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url))
  imagePreviewUrls.clear()
})

</script>

<template>
  <div class="chatbot-root">
    <button
      v-if="!isOpen"
      ref="launcherElement"
      class="chat-bubble-btn"
      type="button"
      aria-label="Open FoodBot"
      :aria-expanded="isOpen"
      @click="openChat"
    >
      <span class="launcher-icon"><AppIcon name="message" size="21" /></span>
      <span class="launcher-copy">
        <strong>Ask FoodBot</strong>
        <small>Recipes, places &amp; FoodStory help</small>
      </span>
      <span v-if="hasUnread" class="unread-dot" aria-hidden="true"></span>
    </button>

    <section
      v-if="isOpen"
      class="chat-window"
      role="dialog"
      aria-label="FoodBot"
      aria-modal="true"
      @keydown="handleDialogKeydown"
    >
      <header class="chat-header">
        <span class="chat-header-title">
          <span class="bot-avatar" aria-hidden="true">
            <AppIcon name="chef-hat" size="19" />
          </span>
          <span>
            <strong>FoodBot</strong>
            <small><i aria-hidden="true"></i> FoodStory concierge</small>
          </span>
        </span>
        <span class="chat-header-actions">
          <button
            type="button"
            class="new-chat-btn"
            aria-label="Start a new FoodBot conversation"
            title="Start new conversation"
            @click="startNewConversation"
          >
            <AppIcon name="sparkles" size="15" />
            <span>New chat</span>
          </button>
          <button
            type="button"
            class="close-chat-btn"
            aria-label="Close FoodBot"
            @click="closeChat"
          >
            ×
          </button>
        </span>
      </header>

      <div
        ref="messagesElement"
        class="chat-messages"
        role="log"
        aria-live="polite"
        :aria-busy="isBusy"
      >
        <div
          v-for="(message, messageIndex) in messages"
          :key="messageIndex"
          :class="['message-row', `message-${message.role}`]"
        >
          <div :class="message.role === 'bot' ? 'msg-bot' : 'msg-user'">
            <span>{{ displayMessageContent(message.content) }}</span>
            <img
              v-if="message.imagePreview"
              :src="message.imagePreview"
              alt="Uploaded food search"
              class="chat-image-preview"
            />
          </div>

          <p
            v-if="message.role === 'bot' && responseLabel(message)"
            class="response-label"
          >
            <AppIcon
              :name="message.sources?.length ? 'check' : 'sparkles'"
              size="12"
            />
            {{ responseLabel(message) }}
          </p>

          <div
            v-if="message.role === 'bot' && warningText(message.retrievalStatus)"
            class="rag-warning"
          >
            {{ warningText(message.retrievalStatus) }}
          </div>

          <div
            v-if="message.type === 'vision_result'"
            class="vision-results"
          >
            <section v-if="message.visionRecipes?.length" class="vision-section">
              <p class="vision-label">Similar recipes</p>
              <button
                v-for="recipe in message.visionRecipes"
                :key="`vision-recipe-${recipe.source_id}`"
                type="button"
                class="vision-card"
                @click="openVisionRecipe(recipe)"
              >
                <img
                  :src="recipe.image_url || '/images/food-placeholder.jpg'"
                  :alt="recipe.title"
                  class="vision-card-img"
                  @error="$event.currentTarget.src = '/images/food-placeholder.jpg'"
                />
                <span class="vision-card-info">
                  <strong>{{ recipe.title }}</strong>
                  <small>
                    {{ recipe.category || 'Recipe' }}
                    <span v-if="recipe.avg_rating">
                      &middot; {{ ratingLabel(recipe.avg_rating) }}
                    </span>
                  </small>
                  <span class="similarity-badge">
                    {{ Math.round(recipe.similarity * 100) }}% match
                  </span>
                </span>
              </button>
            </section>

            <section v-if="message.visionRestaurants?.length" class="vision-section">
              <p class="vision-label">Similar restaurants</p>
              <button
                v-for="restaurant in message.visionRestaurants"
                :key="`vision-restaurant-${restaurant.source_id}`"
                type="button"
                class="vision-card"
                @click="openVisionRestaurant(restaurant)"
              >
                <span class="vision-card-info">
                  <strong>{{ restaurant.title }}</strong>
                  <small>
                    {{ restaurant.category || 'Restaurant' }}
                    <span v-if="restaurant.district">
                      &middot; {{ restaurant.district }}
                    </span>
                    <span v-if="restaurant.avg_rating">
                      &middot; {{ ratingLabel(restaurant.avg_rating) }}
                    </span>
                  </small>
                  <span class="similarity-badge">
                    {{ Math.round(restaurant.similarity * 100) }}% match
                  </span>
                </span>
              </button>
            </section>
          </div>

          <div
            v-if="message.results?.length"
            class="result-list"
            :aria-label="`${message.results.length} results`"
          >
            <article
              v-for="result in message.results"
              :key="`${resultKind(message, result)}-${result.id}`"
              class="result-card"
            >
              <template v-if="resultKind(message, result) === 'restaurant'">
                <div class="result-card-topline">
                  <span class="result-badge">{{ result.category || 'Restaurant' }}</span>
                  <span class="result-rating">{{ ratingLabel(result.avg_rating) }}</span>
                </div>
                <h3>{{ result.name }}</h3>
                <p class="result-location">
                  <AppIcon name="map-pin" size="13" />
                  {{ result.address || result.district || 'Ho Chi Minh City' }}
                </p>
                <p class="result-description">
                  <strong>{{ result.price_range || 'Price not available' }}</strong>
                  <span>•</span>
                  {{ result.description || 'No description available.' }}
                </p>
                <button type="button" class="result-action" @click="openMap(result)">
                  View on map
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>

              <template v-else-if="resultKind(message, result) === 'recipe'">
                <div class="recipe-result-layout">
                  <img
                    :src="resultImage(result)"
                    :alt="result.title"
                    @error="$event.currentTarget.src = '/images/food-placeholder.jpg'"
                  />
                  <div>
                    <div class="result-card-topline">
                      <span class="result-badge">{{ result.category || 'Recipe' }}</span>
                      <span
                        v-if="ingredientMatchLabel(result, message)"
                        :class="[
                          'ingredient-match-badge',
                          { partial: Number(result.match_coverage) < 0.999 },
                        ]"
                      >
                        {{ ingredientMatchLabel(result, message) }}
                      </span>
                    </div>
                    <h3>{{ result.title }}</h3>
                    <p class="recipe-result-meta">
                      <span><AppIcon name="clock" size="13" /> {{ recipeTime(result) }}</span>
                      <span><AppIcon name="users" size="13" /> {{ result.servings || '?' }} servings</span>
                      <span v-if="result.calories">{{ result.calories }} kcal</span>
                      <span v-if="result.protein">{{ result.protein }}g protein</span>
                    </p>
                    <p class="result-rating">
                      {{ ratingLabel(result.avg_rating) }}
                      <span v-if="result.rating_count"> · {{ result.rating_count }} rating{{ result.rating_count === 1 ? '' : 's' }}</span>
                    </p>
                  </div>
                </div>
                <button type="button" class="result-action" @click="openRecipe(result)">
                  View recipe
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>

              <template v-else-if="resultKind(message, result) === 'inspiration'">
                <div class="recipe-result-layout">
                  <img
                    :src="resultImage(result)"
                    :alt="`Daily Inspiration: ${result.title}`"
                    @error="$event.currentTarget.src = '/images/food-placeholder.jpg'"
                  />
                  <div>
                    <div class="result-card-topline">
                      <span class="result-badge">Daily Inspiration</span>
                      <span class="result-rating">{{ result.area || 'Global' }}</span>
                    </div>
                    <h3>{{ result.title }}</h3>
                    <p>{{ result.category || 'Meal' }}</p>
                    <p v-if="inspirationIngredients(result)" class="inspiration-ingredients">
                      {{ inspirationIngredients(result) }}
                    </p>
                  </div>
                </div>
                <button type="button" class="result-action" @click="openDailyInspiration">
                  View on Home
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>

              <template v-else-if="resultKind(message, result) === 'spot'">
                <div class="result-card-topline">
                  <span class="result-badge">{{ result.category || 'Saved' }}</span>
                  <span class="result-rating">{{ ratingLabel(result.rating) }}</span>
                </div>
                <h3>{{ result.name }}</h3>
                <p>{{ result.dish_name || 'No dish name added' }}</p>
                <p class="result-location">
                  <AppIcon name="map-pin" size="13" />
                  {{ result.district || 'Ho Chi Minh City' }}
                </p>
                <button type="button" class="result-action" @click="openMap(result)">
                  Open map
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>
            </article>
          </div>

          <button
            v-if="message.role === 'bot' && message.results?.length && message.recipeSearchFilters"
            type="button"
            class="filter-results-action"
            @click="openRecipeCollection(message.recipeSearchFilters)"
          >
            <AppIcon name="filter" size="14" />
            Browse this collection in Recipes
            <AppIcon name="arrow-right" size="14" />
          </button>

          <details
            v-if="message.role === 'bot' && message.sources?.length"
            class="source-list"
            :aria-label="sourceAriaLabel(message)"
            :open="message.retrievalStatus === 'external_sources'"
          >
            <summary class="source-list-title">
              <span><AppIcon name="book-open" size="14" /> {{ sourceSummary(message) }}</span>
              <span v-if="message.confidence">Best {{ confidenceLabel(message.confidence) }}</span>
            </summary>

            <article
              v-for="source in message.sources"
              :key="`${source.sourceType}-${source.sourceId}`"
              class="source-card"
            >
              <div class="source-card-main">
                <span class="source-badge">{{ sourceTypeLabel(source.sourceType) }}</span>
                <h3>{{ source.title }}</h3>
                <p>{{ source.matchLevel || confidenceLabel(source.score) }}</p>
              </div>

              <button
                v-if="source.sourceType === 'recipe' || source.sourceType === 'restaurant' || source.sourceType === 'food_spot' || source.sourceType === 'website' || source.sourceType === 'external'"
                type="button"
                class="source-action"
                @click="openSource(source)"
              >
                {{ sourceActionLabel(source) }}
                <AppIcon name="arrow-right" size="13" />
              </button>
            </article>
          </details>

          <div v-if="message.role === 'bot' && message.suggestions?.length" class="suggestions">
            <button
              v-for="suggestion in message.suggestions"
              :key="suggestion"
              type="button"
              class="suggestion-chip"
              :disabled="isBusy"
              @click="handleSuggestion(suggestion, message)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>

        <div v-if="isBusy" class="message-row message-bot">
          <div class="msg-bot typing-bubble" aria-label="FoodBot is responding">
            <span class="typing-indicator" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
            <span>{{ isSearchingImage ? 'Looking for visual matches...' : 'Checking recipes and places...' }}</span>
          </div>
        </div>
      </div>

      <form class="chat-input-area" @submit.prevent="sendMessage()">
        <label class="sr-only" for="foodbot-input">Enter a question for FoodBot</label>
        <textarea
          id="foodbot-input"
          ref="inputElement"
          v-model="inputText"
          rows="1"
          maxlength="500"
          autocomplete="off"
          placeholder="Ask about a recipe, a place, or FoodStory..."
          :disabled="isBusy"
          @keydown="handleComposerKeydown"
        ></textarea>
        <label
          class="camera-btn"
          :class="{ disabled: isBusy }"
          title="Search by image"
        >
          <span class="sr-only">Search FoodStory by image</span>
          <AppIcon name="camera" size="19" />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            :disabled="isBusy"
            @change="handleImageUpload"
          />
        </label>
        <button
          type="submit"
          aria-label="Send message"
          :disabled="isBusy || !inputText.trim()"
        >
          <AppIcon name="send" size="19" />
        </button>
        <p class="composer-hint">Enter to send &middot; Shift + Enter for a new line</p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.chatbot-root {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

.chat-bubble-btn,
.chat-window {
  pointer-events: auto;
}

.chat-bubble-btn {
  position: fixed;
  right: 24px;
  bottom: 24px;
  display: grid;
  width: 56px;
  height: 56px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: #e53e3e;
  box-shadow: 0 4px 20px rgba(229, 62, 62, 0.4);
  transition: transform 0.2s, box-shadow 0.2s;
}

.chat-bubble-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(229, 62, 62, 0.5);
}

.chat-bubble-btn:focus-visible,
.chat-window button:focus-visible,
.chat-window input:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.unread-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border: 2px solid #1a1a1a;
  border-radius: 50%;
  background: #f97316;
}

.chat-window {
  position: fixed;
  right: 24px;
  bottom: 90px;
  display: flex;
  width: 380px;
  height: min(520px, calc(100dvh - var(--nav-height, 88px) - 114px));
  overflow: hidden;
  flex-direction: column;
  border: 1px solid #3a3a3d;
  border-radius: 16px;
  color: #f0f0f0;
  background: #1e1e20;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  animation: slide-up 0.2s ease;
}

.chat-header {
  display: flex;
  min-height: 66px;
  padding: 12px 14px;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  background: #e53e3e;
}

.chat-header-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.chat-header-title > span:last-child {
  display: grid;
  gap: 1px;
}

.chat-header-title strong {
  font-size: 15px;
}

.chat-header-title small {
  color: rgba(255, 255, 255, 0.78);
  font-size: 10px;
}

.bot-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.14);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-header-actions > button {
  display: grid;
  min-height: 40px;
  padding: 0;
  place-items: center;
  border: 0;
  color: #fff;
  background: rgba(0, 0, 0, 0.12);
}

.new-chat-btn {
  padding: 0 10px !important;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
}

.close-chat-btn {
  width: 40px;
  border-radius: 50%;
  font-size: 25px;
  line-height: 1;
}

.chat-header-actions > button:hover {
  background: rgba(0, 0, 0, 0.24);
}

.chat-messages {
  display: flex;
  min-height: 0;
  padding: 16px 14px;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: #555 transparent;
  scrollbar-width: thin;
}

.message-row {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 7px;
}

.message-user {
  align-items: flex-end;
}

.message-bot {
  align-items: flex-start;
}

.msg-bot,
.msg-user {
  padding: 10px 14px;
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.5;
}

.msg-bot {
  max-width: 88%;
  border: 1px solid #36363a;
  border-radius: 4px 16px 16px;
  color: #f0f0f0;
  background: #2a2a2d;
}

.msg-user {
  max-width: 78%;
  border-radius: 16px 4px 16px 16px;
  color: #fff;
  background: #e53e3e;
}

.chat-image-preview {
  display: block;
  max-width: 160px;
  max-height: 120px;
  margin-top: 7px;
  border-radius: 8px;
  object-fit: cover;
}

.vision-results,
.vision-section {
  display: grid;
  width: 100%;
  gap: 7px;
}

.vision-section + .vision-section {
  margin-top: 4px;
}

.vision-label {
  margin: 0;
  color: #aaa;
  font-size: 11px;
  font-weight: 800;
}

.vision-card {
  display: flex;
  width: 100%;
  padding: 8px;
  align-items: center;
  gap: 10px;
  border: 1px solid #38383c;
  border-radius: 10px;
  color: #ddd;
  background: #262629;
  text-align: left;
  transition: border-color 0.15s, transform 0.15s;
}

.vision-card:hover {
  border-color: #e53e3e;
  transform: translateY(-1px);
}

.vision-card-img {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  border-radius: 7px;
  object-fit: cover;
}

.vision-card-info {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.vision-card-info strong {
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vision-card-info small {
  color: #aaa;
  font-size: 10px;
}

.similarity-badge {
  width: fit-content;
  padding: 2px 7px;
  border-radius: 999px;
  color: #4ade80;
  background: #183326;
  font-size: 9px;
  font-weight: 800;
}

.result-list {
  display: grid;
  width: 100%;
  gap: 7px;
}

.result-card {
  padding: 10px 11px;
  border: 1px solid #38383c;
  border-radius: 11px;
  color: #ddd;
  background: #262629;
  transition: border-color 0.15s, transform 0.15s;
}

.result-card:hover {
  border-color: #e53e3e;
  transform: translateY(-1px);
}

.result-card h3 {
  margin: 5px 0 4px;
  color: #fff;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.25;
}

.result-card p {
  color: #aaa;
  font-size: 11px;
  line-height: 1.4;
}

.result-card-topline,
.recipe-result-meta,
.result-location,
.result-description,
.result-action {
  display: flex;
  align-items: center;
}

.result-card-topline {
  justify-content: space-between;
  gap: 8px;
}

.result-badge {
  display: inline-flex;
  width: fit-content;
  padding: 3px 7px;
  border-radius: 999px;
  color: #ff8f8f;
  background: rgba(229, 62, 62, 0.13);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.result-rating {
  color: #f7b731;
  font-size: 10px;
  font-weight: 800;
}

.result-location {
  gap: 4px;
}

.result-description {
  margin-top: 5px !important;
  gap: 5px;
}

.result-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.result-description strong {
  color: #ffd277;
}

.result-action {
  width: fit-content;
  margin-top: 8px;
  padding: 0;
  gap: 4px;
  border: 0;
  color: #ff7676;
  background: transparent;
  font-size: 11px;
  font-weight: 800;
}

.result-action:hover {
  color: #fff;
}

.filter-results-action {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #45454a;
  border-radius: 10px;
  color: #f4f4f5;
  background: #2a2a2e;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  transition: border-color 0.15s, background-color 0.15s;
}

.filter-results-action:hover {
  border-color: #e53e3e;
  background: #303035;
}

.filter-results-action:focus-visible {
  outline: 2px solid #ff7676;
  outline-offset: 2px;
}

.recipe-result-layout {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 10px;
}

.recipe-result-layout img {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  object-fit: cover;
}

.recipe-result-meta {
  flex-wrap: wrap;
  gap: 8px;
}

.recipe-result-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #aaa;
  font-size: 10px;
}

.suggestions {
  display: flex;
  width: 100%;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.suggestions::-webkit-scrollbar {
  display: none;
}

.suggestion-chip {
  min-height: 28px;
  padding: 4px 10px;
  flex: 0 0 auto;
  border: 1px solid #e53e3e;
  border-radius: 20px;
  color: #ff7676;
  background: transparent;
  font-size: 10px;
  white-space: nowrap;
}

.suggestion-chip:hover:not(:disabled) {
  color: #fff;
  background: #e53e3e;
}

.suggestion-chip:disabled {
  opacity: 0.45;
}

.typing-bubble {
  min-width: 58px;
}

.typing-indicator {
  display: inline-flex;
  min-height: 14px;
  align-items: center;
}

.typing-indicator > span {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin: 0 2px;
  border-radius: 50%;
  background: #777;
  animation: typing-pulse 1.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.typing-indicator > span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator > span:nth-child(3) {
  animation-delay: 0.4s;
}

.chat-input-area {
  display: grid;
  min-height: 64px;
  padding: 10px 12px;
  grid-template-columns: minmax(0, 1fr) 40px 40px;
  gap: 8px;
  border-top: 1px solid #353538;
  background: #202023;
}

.chat-input-area > input {
  min-width: 0;
  padding: 0 13px;
  border: 1px solid #3a3a3e;
  border-radius: 12px;
  outline: 0;
  color: #f4f4f4;
  background: #29292c;
  font-size: 12px;
}

.chat-input-area > input::placeholder {
  color: #777;
}

.chat-input-area > input:focus {
  border-color: #e53e3e;
}

.camera-btn {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #3a3a3e;
  border-radius: 11px;
  color: #ddd;
  background: #29292c;
  cursor: pointer;
}

.camera-btn:hover:not(.disabled) {
  border-color: #e53e3e;
  color: #fff;
}

.camera-btn.disabled {
  cursor: default;
  opacity: 0.42;
}

.camera-btn input {
  display: none;
}

.chat-input-area > button {
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 11px;
  color: #fff;
  background: #e53e3e;
}

.chat-input-area > button:hover:not(:disabled) {
  background: #f04b4b;
}

.chat-input-area > button:disabled {
  opacity: 0.42;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes typing-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 520px) {
  .chat-bubble-btn {
    right: 16px;
    bottom: 16px;
  }

  .chat-window {
    right: 12px;
    bottom: 82px;
    width: calc(100vw - 24px);
    height: min(520px, calc(100dvh - var(--nav-height, 88px) - 106px));
  }
}

:global(body:has(.food-map-page)) .chat-bubble-btn {
  bottom: 88px;
}

:global(body:has(.food-map-page)) .chat-window {
  bottom: 90px;
}

@media (max-width: 768px) {
  :global(body:has(.food-map-page)) .chat-bubble-btn {
    bottom: calc(140px + env(safe-area-inset-bottom));
  }

  :global(body:has(.food-map-page)) .chat-window {
    bottom: calc(140px + env(safe-area-inset-bottom));
    height: min(520px, calc(100dvh - var(--nav-height, 88px) - 164px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-window,
  .typing-indicator > span {
    animation: none;
  }
}

.rag-warning {
  max-width: 88%;
  padding: 8px 10px;
  border: 1px solid rgba(251, 146, 60, 0.35);
  border-radius: 10px;
  color: #fed7aa;
  background: rgba(154, 52, 18, 0.22);
  font-size: 11px;
  line-height: 1.45;
}

.source-list {
  display: grid;
  width: 100%;
  gap: 8px;
}

.source-list-title {
  color: #aaa;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.source-card {
  display: grid;
  padding: 10px 11px;
  gap: 8px;
  border: 1px solid #38383c;
  border-radius: 11px;
  color: #ddd;
  background: #242427;
}

.source-card-main {
  display: grid;
  gap: 4px;
}

.source-card h3 {
  margin: 0;
  color: #fff;
  font-size: 13px;
  line-height: 1.3;
}

.source-card p {
  margin: 0;
  color: #aaa;
  font-size: 11px;
}

.source-badge {
  display: inline-flex;
  width: fit-content;
  padding: 3px 7px;
  border-radius: 999px;
  color: #ff8f8f;
  background: rgba(229, 62, 62, 0.13);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.source-action {
  display: inline-flex;
  width: fit-content;
  padding: 0;
  align-items: center;
  gap: 4px;
  border: 0;
  color: #ff7676;
  background: transparent;
  font-size: 11px;
  font-weight: 800;
}

.source-action:hover {
  color: #fff;
}

</style>

<style scoped src="./ChatBotRedesign.css"></style>
