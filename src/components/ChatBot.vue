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
  return rating > 0 ? `${rating.toFixed(1)} ★` : 'Chưa có đánh giá'
}

function recipeTime(recipe) {
  const total = Number(recipe.prep_time || 0) + Number(recipe.cook_time || 0)
  return total > 0 ? `${total} phút` : 'Chưa rõ thời gian'
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

async function handleSuggestion(suggestion, message) {
  const normalized = suggestion.toLocaleLowerCase('vi')
  const firstResult = message.results?.[0]

  if (normalized.includes('đăng nhập')) {
    openLogin()
    return
  }
  if (
    normalized.includes('bản đồ') ||
    normalized.includes('tất cả nhà hàng')
  ) {
    openMap(firstResult)
    return
  }
  if (
    firstResult &&
    resultKind(message, firstResult) === 'recipe' &&
    (normalized.includes('xem công thức') || normalized.includes('lưu yêu thích'))
  ) {
    openRecipe(firstResult)
    return
  }
  if (normalized.includes('tất cả công thức')) {
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
    const response = await api.post('/chatbot', {
      message: content,
      userId: authStore.isLoggedIn ? authStore.user?.id : null,
    })

    messages.value.push({
      role: 'bot',
      content: response.data.message,
      type: response.data.type,
      results: response.data.results || [],
      suggestions: response.data.suggestions || [],
    })

    if (!isOpen.value) {
      hasUnread.value = true
    }
  } catch {
    messages.value.push({
      role: 'bot',
      content: 'Xin lỗi, có lỗi xảy ra. Thử lại nhé!',
      type: 'error',
      results: [],
      suggestions: ['Thử lại'],
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
      'Xin chào! Mình là FoodBot. Hỏi mình về quán ăn, công thức hoặc địa điểm đã lưu nhé!',
    type: 'greeting',
    results: [],
    suggestions: ['Phở ngon ở Quận 1', 'Café Bình Thạnh', 'Công thức bánh mì'],
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
      aria-label="Mở FoodBot"
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
            <small>Trợ lý ẩm thực FoodStory</small>
          </span>
        </span>
        <button type="button" aria-label="Đóng FoodBot" @click="closeChat">×</button>
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
            v-if="message.results?.length"
            class="result-list"
            :aria-label="`${message.results.length} kết quả`"
          >
            <article
              v-for="result in message.results"
              :key="`${resultKind(message, result)}-${result.id}`"
              class="result-card"
            >
              <template v-if="resultKind(message, result) === 'restaurant'">
                <div class="result-card-topline">
                  <span class="result-badge">{{ result.category || 'Nhà hàng' }}</span>
                  <span class="result-rating">{{ ratingLabel(result.avg_rating) }}</span>
                </div>
                <h3>{{ result.name }}</h3>
                <p class="result-location">
                  <AppIcon name="map-pin" size="13" />
                  {{ result.address || result.district || 'TP. Hồ Chí Minh' }}
                </p>
                <p class="result-description">
                  <strong>{{ result.price_range || 'Chưa rõ giá' }}</strong>
                  <span>•</span>
                  {{ result.description || 'Chưa có mô tả.' }}
                </p>
                <button type="button" class="result-action" @click="openMap(result)">
                  Xem trên bản đồ
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
                    <span class="result-badge">{{ result.category || 'Công thức' }}</span>
                    <h3>{{ result.title }}</h3>
                    <p class="recipe-result-meta">
                      <span><AppIcon name="clock" size="13" /> {{ recipeTime(result) }}</span>
                      <span><AppIcon name="users" size="13" /> {{ result.servings || '?' }} người</span>
                    </p>
                    <p class="result-rating">{{ ratingLabel(result.avg_rating) }}</p>
                  </div>
                </div>
                <button type="button" class="result-action" @click="openRecipe(result)">
                  Xem công thức
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>

              <template v-else-if="resultKind(message, result) === 'spot'">
                <div class="result-card-topline">
                  <span class="result-badge">{{ result.category || 'Đã lưu' }}</span>
                  <span class="result-rating">{{ ratingLabel(result.rating) }}</span>
                </div>
                <h3>{{ result.name }}</h3>
                <p>{{ result.dish_name || 'Chưa thêm tên món' }}</p>
                <p class="result-location">
                  <AppIcon name="map-pin" size="13" />
                  {{ result.district || 'TP. Hồ Chí Minh' }}
                </p>
                <button type="button" class="result-action" @click="openMap(result)">
                  Mở bản đồ
                  <AppIcon name="arrow-right" size="14" />
                </button>
              </template>
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
          <div class="msg-bot typing-bubble" aria-label="FoodBot đang trả lời">
            <span class="typing-indicator" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
          </div>
        </div>
      </div>

      <form class="chat-input-area" @submit.prevent="sendMessage()">
        <label class="sr-only" for="foodbot-input">Nhập câu hỏi cho FoodBot</label>
        <input
          id="foodbot-input"
          v-model="inputText"
          type="text"
          maxlength="500"
          autocomplete="off"
          placeholder="Hỏi FoodBot..."
          :disabled="isLoading"
        />
        <button
          type="submit"
          aria-label="Gửi tin nhắn"
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
</style>
