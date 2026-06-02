<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { useUiStore } from '../stores/uiStore'

const uiStore = useUiStore()
let hideTimer = 0

const toast = computed(() => {
  if (uiStore.errorMsg) {
    return {
      message: uiStore.errorMsg,
      type: 'error',
    }
  }

  if (uiStore.successMsg) {
    return {
      message: uiStore.successMsg,
      type: 'success',
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
  () => toast.value?.message,
  (message) => {
    clearTimer()

    if (message) {
      hideTimer = window.setTimeout(() => {
        uiStore.clearMessages()
      }, 3000)
    }
  },
)

onBeforeUnmount(clearTimer)
</script>

<template>
  <Transition name="toast">
    <div
      v-if="toast"
      :class="['toast-notification', `toast-${toast.type}`]"
      :role="toast.type === 'error' ? 'alert' : 'status'"
      :aria-live="toast.type === 'error' ? 'assertive' : 'polite'"
    >
      {{ toast.message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast-notification {
  position: fixed;
  top: 104px;
  right: clamp(16px, 3vw, 32px);
  z-index: 100;
  width: min(360px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  color: var(--text);
  background: var(--panel);
  box-shadow: var(--shadow-hover);
  font-weight: 850;
  line-height: 1.45;
}

.toast-success {
  border-color: rgba(103, 152, 92, 0.42);
  background:
    linear-gradient(135deg, rgba(103, 152, 92, 0.22), transparent),
    var(--panel);
}

.toast-error {
  border-color: rgba(239, 71, 111, 0.42);
  background:
    linear-gradient(135deg, rgba(239, 71, 111, 0.22), transparent),
    var(--panel);
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
  transform: translate3d(0, -12px, 0);
}

@media (max-width: 700px) {
  .toast-notification {
    top: 16px;
  }
}
</style>
