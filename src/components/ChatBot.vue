<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const isOpen = ref(false)
const messages = ref([])
const inputText = ref('')
const isLoading = ref(false)
const hasUnread = ref(false)
const messagesElement = ref(null)
const lastRecipeId = ref(null)
const lastRecipeTitle = ref(null)
const lastRestaurantId = ref(null)

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
}

function closeChat() {
  isOpen.value = false
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

function openLogin() {
  closeChat()
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function sourceTypeLabel(type) {
  if (type === 'restaurant') return 'Restaurant'
  if (type === 'recipe') return 'Recipe'
  if (type === 'food_spot') return 'Food spot'
  return 'FoodStory source'
}

function sourceActionLabel(source) {
  if (source.sourceType === 'recipe') return 'View recipe'
  if (source.sourceType === 'restaurant' || source.sourceType === 'food_spot') {
    return 'View on map'
  }
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
  if (!content || isLoading.value) return

  messages.value.push({ role: 'user', content })
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
    })

    const data = response.data
    updateRecentContext(data)

    messages.value.push({
      role: 'bot',
      content: data.answer || 'FoodStory could not generate an answer.',
      type: data.mode || 'grounded_rag',
      retrievalStatus: data.retrievalStatus || null,
      systemMessage: data.message || '',
      confidence: data.confidence || 0,
      sources: data.sources || [],
      results: data.results || [],
      suggestions: data.suggestions || [],
    })

    if (!isOpen.value) {
      hasUnread.value = true
    }
  } catch (error) {
    messages.value.push({
      role: 'bot',
      content: 'Sorry, FoodStory Assistant is currently unavailable.',
      type: 'error',
      retrievalStatus: 'error',
      systemMessage: error?.response?.data?.message || error.message,
      results: [],
      sources: [],
      suggestions: ['Try again'],
    })
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

onMounted(() => {
  messages.value.push({
    role: 'bot',
    content:
      'Hello! I am FoodBot, a FoodStory assistant grounded in our recipe and restaurant data.',
    type: 'greeting',
    retrievalStatus: null,
    confidence: 0,
    results: [],
    sources: [],
    suggestions: [
      'Where can I eat banh mi in District 1?',
      'How to cook a healthy low calorie chicken recipe?',
      'Where can I eat Japanese food in District 1?',
    ],
  })
  hasUnread.value = true
})

</script>

<template>
  <div class="chatbot-root">
    <button
      v-if="!isOpen"
      class="chat-bubble-btn"
      type="button"
      aria-label="Open FoodBot"
      :aria-expanded="isOpen"
      @click="openChat"
    >
      <AppIcon name="message" size="25" />
      <span v-if="hasUnread" class="unread-dot" aria-hidden="true"></span>
    </button>

    <section
      v-if="isOpen"
      class="chat-window"
      role="dialog"
      aria-label="FoodBot"
    >
      <header class="chat-header">
        <span class="chat-header-title">
          <span class="bot-avatar" aria-hidden="true">
            <AppIcon name="chef-hat" size="19" />
          </span>
          <span>
            <strong>FoodBot</strong>
            <small>FoodStory food assistant</small>
          </span>
        </span>
        <button type="button" aria-label="Close FoodBot" @click="closeChat">×</button>
      </header>

      <div ref="messagesElement" class="chat-messages" aria-live="polite">
        <div
          v-for="(message, messageIndex) in messages"
          :key="messageIndex"
          :class="['message-row', `message-${message.role}`]"
        >
          <div :class="message.role === 'bot' ? 'msg-bot' : 'msg-user'">
            {{ message.content }}
          </div>

          <div
            v-if="message.role === 'bot' && warningText(message.retrievalStatus)"
            class="rag-warning"
          >
            {{ warningText(message.retrievalStatus) }}
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
                    :src="result.image_url || '/images/food-placeholder.jpg'"
                    :alt="result.title"
                    @error="$event.currentTarget.src = '/images/food-placeholder.jpg'"
                  />
                  <div>
                    <span class="result-badge">{{ result.category || 'Recipe' }}</span>
                    <h3>{{ result.title }}</h3>
                    <p class="recipe-result-meta">
                      <span><AppIcon name="clock" size="13" /> {{ recipeTime(result) }}</span>
                      <span><AppIcon name="users" size="13" /> {{ result.servings || '?' }} servings</span>
                    </p>
                    <p class="result-rating">{{ ratingLabel(result.avg_rating) }}</p>
                  </div>
                </div>
                <button type="button" class="result-action" @click="openRecipe(result)">
                  View recipe
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

          <div
            v-if="message.role === 'bot' && message.sources?.length"
            class="source-list"
            :aria-label="`${message.sources.length} FoodStory sources`"
          >
            <div class="source-list-title">
              FoodStory sources
              <span v-if="message.confidence">
                · {{ confidenceLabel(message.confidence) }}
              </span>
            </div>

            <article
              v-for="source in message.sources"
              :key="`${source.sourceType}-${source.sourceId}`"
              class="source-card"
            >
              <div class="source-card-main">
                <span class="source-badge">{{ sourceTypeLabel(source.sourceType) }}</span>
                <h3>{{ source.title }}</h3>
                <p>
                  Score {{ Number(source.score || 0).toFixed(3) }}
                  <span v-if="source.matchLevel"> · {{ source.matchLevel }}</span>
                </p>
              </div>

              <button
                v-if="source.sourceType === 'recipe' || source.sourceType === 'restaurant' || source.sourceType === 'food_spot'"
                type="button"
                class="source-action"
                @click="openSource(source)"
              >
                {{ sourceActionLabel(source) }}
                <AppIcon name="arrow-right" size="13" />
              </button>
            </article>
          </div>

          <div v-if="message.role === 'bot' && message.suggestions?.length" class="suggestions">
            <button
              v-for="suggestion in message.suggestions"
              :key="suggestion"
              type="button"
              class="suggestion-chip"
              :disabled="isLoading"
              @click="handleSuggestion(suggestion, message)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>

        <div v-if="isLoading" class="message-row message-bot">
          <div class="msg-bot typing-bubble" aria-label="FoodBot is responding">
            <span class="typing-indicator" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
          </div>
        </div>
      </div>

      <form class="chat-input-area" @submit.prevent="sendMessage()">
        <label class="sr-only" for="foodbot-input">Enter a question for FoodBot</label>
        <input
          id="foodbot-input"
          v-model="inputText"
          type="text"
          maxlength="500"
          autocomplete="off"
          placeholder="Ask FoodBot..."
          :disabled="isLoading"
        />
        <button
          type="submit"
          aria-label="Send message"
          :disabled="isLoading || !inputText.trim()"
        >
          <AppIcon name="send" size="19" />
        </button>
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

.chat-header > button {
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0 0 3px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.12);
  font-size: 25px;
  line-height: 1;
}

.chat-header > button:hover {
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
  animation: typing-bounce 1.2s infinite;
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
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  border-top: 1px solid #353538;
  background: #202023;
}

.chat-input-area input {
  min-width: 0;
  padding: 0 13px;
  border: 1px solid #3a3a3e;
  border-radius: 12px;
  outline: 0;
  color: #f4f4f4;
  background: #29292c;
  font-size: 12px;
}

.chat-input-area input::placeholder {
  color: #777;
}

.chat-input-area input:focus {
  border-color: #e53e3e;
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

@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-7px);
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
