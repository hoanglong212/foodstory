<script setup>
import AppIcon from '../AppIcon.vue'

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  activeId: {
    type: String,
    default: 'explore',
  },
})

const emit = defineEmits(['select'])
</script>

<template>
  <nav class="food-map-rail" aria-label="Food Map navigation">
    <button
      v-for="item in items"
      :key="item.id"
      class="food-map-rail-item"
      :class="{ active: activeId === item.id, coming: item.disabled }"
      type="button"
      :disabled="item.disabled"
      :aria-current="activeId === item.id ? 'page' : undefined"
      :aria-label="item.disabled ? `${item.label} — coming soon` : item.label"
      @click="emit('select', item.id)"
    >
      <AppIcon :name="item.icon" size="19" />
      <span class="food-map-rail-label">{{ item.label }}</span>
      <small v-if="item.disabled">Soon</small>
    </button>
  </nav>
</template>

<style scoped>
.food-map-rail {
  --rail-surface: rgba(31, 32, 35, 0.96);
  --rail-border: rgba(255, 255, 255, 0.12);
  --rail-text: rgba(255, 250, 244, 0.74);
  --rail-text-strong: #fffaf4;
  --rail-muted: rgba(255, 250, 244, 0.42);
  --rail-active: #f6a35d;
  --rail-active-bg: rgba(242, 123, 48, 0.1);
  position: fixed;
  z-index: 28;
  top: calc(var(--nav-height) + 16px);
  left: 16px;
  display: grid;
  width: 58px;
  gap: 4px;
  overflow: visible;
  padding: 7px;
  border: 1px solid var(--rail-border);
  border-radius: 14px;
  background: var(--rail-surface);
  box-shadow: 0 6px 12px rgba(16, 14, 12, 0.18);
}

.food-map-rail-item {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 44px;
  gap: 10px;
  padding: 10px 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  grid-template-columns: 20px;
  justify-content: center;
  width: 44px;
  color: var(--rail-text);
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1;
  text-align: left;
  transition:
    background-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    color 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.food-map-rail-item::after {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
  content: '';
  transform: translateY(-50%);
}

.food-map-rail-item.active {
  border-color: rgba(242, 123, 48, 0.22);
  color: var(--rail-active);
  background: var(--rail-active-bg);
}

.food-map-rail-item.active::after {
  background: #f28a42;
}

.food-map-rail-item.coming {
  color: var(--rail-muted);
}

.food-map-rail-item small {
  color: var(--rail-muted);
  font-size: 0.625rem;
  font-weight: 750;
}

.food-map-rail-label,
.food-map-rail-item small {
  position: absolute;
  top: 50%;
  left: 50px;
  width: max-content;
  padding: 8px 10px;
  border: 1px solid var(--rail-border);
  border-radius: 8px;
  color: var(--rail-text-strong);
  background: var(--rail-surface);
  opacity: 0;
  pointer-events: none;
  transform: translate(-4px, -50%);
  transition:
    opacity 150ms ease-out,
    transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.food-map-rail-item:hover .food-map-rail-label,
.food-map-rail-item:focus .food-map-rail-label,
.food-map-rail-item:focus-visible .food-map-rail-label,
.food-map-rail-item:hover small,
.food-map-rail-item:focus small,
.food-map-rail-item:focus-visible small {
  opacity: 1;
  transform: translate(0, -50%);
}

.food-map-rail-item small {
  left: auto;
  right: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translateY(-50%);
}

:global(:root[data-theme="light"]) .food-map-rail {
  --rail-surface: rgba(255, 255, 255, 0.96);
  --rail-border: rgba(68, 45, 28, 0.16);
  --rail-text: #654d3d;
  --rail-text-strong: #2e2119;
  --rail-muted: #78685d;
  --rail-active: #c64f18;
  --rail-active-bg: rgba(224, 93, 31, 0.1);
  box-shadow: 0 5px 10px rgba(72, 48, 29, 0.12);
}

.food-map-rail-item:focus-visible {
  outline: 3px solid rgba(249, 151, 76, 0.82);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .food-map-rail-item:not(:disabled):hover {
    color: #f4a261;
    background: rgba(242, 123, 48, 0.08);
    transform: translateX(1px);
  }
}

.food-map-rail-item:not(:disabled):active {
  transform: translateY(1px);
}

@media (max-width: 768px) {
  .food-map-rail {
    top: auto;
    right: 12px;
    bottom: max(10px, env(safe-area-inset-bottom));
    left: 12px;
    display: grid;
    width: auto;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 2px;
    padding: 5px;
    border-radius: 14px;
  }

  .food-map-rail-item {
    grid-template-columns: 20px;
    justify-content: center;
    width: 100%;
    min-height: 48px;
    padding: 10px;
  }

  .food-map-rail-label,
  .food-map-rail-item small,
  .food-map-rail-item small {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
  .food-map-rail {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .food-map-rail-item.coming {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .food-map-rail-item {
    transition-duration: 0.01ms;
  }

  .food-map-rail-label {
    transition-duration: 0.01ms;
  }
}
</style>
