<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useUiStore } from '../stores/uiStore'

const uiStore = useUiStore()
let hideTimer = 0

const toast = computed(() => {
  const options = uiStore.notificationOptions || {}

  if (uiStore.errorMsg) {
    return {
      id: uiStore.notificationId,
      message: uiStore.errorMsg,
      type: 'error',
      title: options.title || 'Something went wrong',
      eyebrow: options.eyebrow || 'FoodStory notification',
      icon: options.icon || 'message',
      detail: options.detail || '',
      actionLabel: options.actionLabel || '',
      actionHref: options.actionHref || '',
      duration: Number(options.duration || 4500),
      variant: options.variant || 'error',
    }
  }

  if (uiStore.successMsg) {
    return {
      id: uiStore.notificationId,
      message: uiStore.successMsg,
      type: 'success',
      title: options.title || 'Done',
      eyebrow: options.eyebrow || 'FoodStory notification',
      icon: options.icon || 'check',
      detail: options.detail || '',
      actionLabel: options.actionLabel || '',
      actionHref: options.actionHref || '',
      duration: Number(options.duration || 3500),
      variant: options.variant || 'success',
    }
  }

  return null
})

function clearTimer() {
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = 0
  }
}

watch(
  () => uiStore.notificationId,
  () => {
    clearTimer()

    if (toast.value) {
      hideTimer = window.setTimeout(() => {
        uiStore.clearMessages()
      }, toast.value.duration)
    }
  },
)

onBeforeUnmount(clearTimer)
</script>

<template>
  <Transition name="toast">
    <div
      v-if="toast"
      :key="toast.id"
      :class="[
        'toast-notification',
        `toast-${toast.type}`,
        `toast-variant-${toast.variant}`,
      ]"
      :role="toast.type === 'error' ? 'alert' : 'status'"
      :aria-live="toast.type === 'error' ? 'assertive' : 'polite'"
    >
      <div class="toast-accent" aria-hidden="true"></div>
      <span class="toast-icon" aria-hidden="true">
        <AppIcon :name="toast.icon" size="22" stroke-width="2.3" />
      </span>
      <div class="toast-content">
        <span class="toast-eyebrow">{{ toast.eyebrow }}</span>
        <strong>{{ toast.title }}</strong>
        <p>{{ toast.message }}</p>
        <small v-if="toast.detail">{{ toast.detail }}</small>
        <a v-if="toast.actionLabel && toast.actionHref" :href="toast.actionHref">
          {{ toast.actionLabel }}
          <AppIcon name="arrow-right" size="15" />
        </a>
      </div>
      <button type="button" aria-label="Dismiss notification" @click="uiStore.clearMessages()">
        &times;
      </button>
      <span
        class="toast-progress"
        aria-hidden="true"
        :style="{ animationDuration: `${toast.duration}ms` }"
      ></span>
    </div>
  </Transition>
</template>

<style scoped>
.toast-notification {
  position: fixed;
  top: 96px;
  right: clamp(16px, 3vw, 32px);
  z-index: 1000;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: min(430px, calc(100vw - 32px));
  overflow: hidden;
  gap: 14px;
  align-items: start;
  padding: 18px 18px 17px;
  border: 1px solid rgba(43, 53, 42, 0.12);
  border-radius: 16px;
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(250, 248, 242, 0.98)),
    var(--panel);
  box-shadow:
    0 22px 60px rgba(34, 42, 32, 0.18),
    0 4px 14px rgba(34, 42, 32, 0.08);
  line-height: 1.4;
  backdrop-filter: blur(18px);
}

.toast-accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: #5d8c4d;
}

.toast-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(93, 140, 77, 0.2);
  border-radius: 13px;
  color: #4f7d40;
  background: rgba(93, 140, 77, 0.1);
}

.toast-content {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.toast-eyebrow {
  color: #6f796c;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.toast-content strong {
  color: #1f271e;
  font-family: var(--font-serif);
  font-size: 18px;
  line-height: 1.2;
}

.toast-content p {
  margin: 2px 0 0;
  color: #465044;
  font-size: 14px;
  font-weight: 750;
}

.toast-content small {
  margin-top: 2px;
  color: #778074;
  font-size: 12px;
}

.toast-content a {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  color: #4f7d40;
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
}

.toast-content a:hover {
  color: #365d2c;
}

.toast-notification > button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #71796f;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.toast-notification > button:hover {
  color: #293128;
  background: rgba(38, 49, 36, 0.07);
}

.toast-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 4px;
  height: 3px;
  background: #6d9a5d;
  transform-origin: left;
  animation: toast-countdown linear forwards;
}

.toast-success {
  border-color: rgba(93, 140, 77, 0.28);
}

.toast-error {
  border-color: rgba(184, 72, 59, 0.3);
}

.toast-error .toast-accent,
.toast-error .toast-progress {
  background: #b8483b;
}

.toast-error .toast-icon {
  border-color: rgba(184, 72, 59, 0.2);
  color: #a43f35;
  background: rgba(184, 72, 59, 0.1);
}

.toast-variant-activity {
  border-color: rgba(194, 119, 48, 0.3);
}

.toast-variant-activity .toast-accent,
.toast-variant-activity .toast-progress {
  background: #c27730;
}

.toast-variant-activity .toast-icon {
  border-color: rgba(194, 119, 48, 0.22);
  color: #a85f1f;
  background: rgba(194, 119, 48, 0.11);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 220ms var(--ease-standard),
    transform 260ms var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate3d(18px, -8px, 0) scale(0.98);
}

@keyframes toast-countdown {
  from {
    transform: scaleX(1);
  }

  to {
    transform: scaleX(0);
  }
}

:global(:root[data-theme="dark"]) .toast-notification {
  border-color: rgba(255, 255, 255, 0.12);
  color: #f2efe8;
  background: linear-gradient(135deg, rgba(37, 42, 35, 0.98), rgba(26, 31, 25, 0.98));
}

:global(:root[data-theme="dark"]) .toast-content strong {
  color: #fffdf8;
}

:global(:root[data-theme="dark"]) .toast-content p {
  color: #d3d8ce;
}

:global(:root[data-theme="dark"]) .toast-content small,
:global(:root[data-theme="dark"]) .toast-eyebrow {
  color: #aeb8aa;
}

@media (max-width: 700px) {
  .toast-notification {
    top: 16px;
    gap: 11px;
    padding: 15px;
  }

  .toast-icon {
    width: 40px;
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-progress {
    animation: none;
  }
}
</style>
