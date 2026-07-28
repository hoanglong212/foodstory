<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  activeId: {
    type: String,
    default: 'discover',
  },
})

const emit = defineEmits(['select'])
const root = ref(null)
const trigger = ref(null)
const isOpen = ref(false)
const activeItem = computed(
  () => props.items.find((item) => item.id === props.activeId) || props.items[0] || null,
)

function itemAriaLabel(item) {
  return Number.isFinite(item.count) ? `${item.label}, ${item.count} places` : item.label
}

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function selectItem(itemId) {
  isOpen.value = false
  emit('select', itemId)
}

function handleDocumentPointerDown(event) {
  if (isOpen.value && root.value && !root.value.contains(event.target)) {
    isOpen.value = false
  }
}

async function handleDocumentKeydown(event) {
  if (event.key !== 'Escape' || !isOpen.value) return
  isOpen.value = false
  await nextTick()
  trigger.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="food-map-view-control">
    <button
      ref="trigger"
      class="food-map-view-trigger"
      type="button"
      aria-controls="food-map-view-menu"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <AppIcon name="filter" size="17" />
      <span>
        <small>Views</small>
        <strong>{{ activeItem?.label || 'All places' }}</strong>
      </span>
      <b v-if="Number.isFinite(activeItem?.count)">{{ activeItem.count }}</b>
    </button>

    <Transition name="map-view-menu">
      <section
        v-if="isOpen"
        id="food-map-view-menu"
        class="food-map-view-menu"
        aria-label="Choose a map view"
      >
        <header>
          <div>
            <strong>Explore the map</strong>
            <span>Choose what you want to see</span>
          </div>
          <button type="button" aria-label="Close map views" @click="isOpen = false">
            <AppIcon name="x" size="17" />
          </button>
        </header>

        <div class="food-map-view-grid" role="menu">
          <button
            v-for="item in items"
            :key="item.id"
            class="food-map-view-item"
            :class="{ active: activeId === item.id, utility: item.utility }"
            type="button"
            :role="item.utility ? 'menuitem' : 'menuitemradio'"
            :aria-checked="item.utility ? undefined : activeId === item.id"
            :aria-label="itemAriaLabel(item)"
            @click="selectItem(item.id)"
          >
            <AppIcon :name="item.icon" size="18" />
            <span>{{ item.label }}</span>
            <small v-if="Number.isFinite(item.count)">{{ item.count }}</small>
          </button>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.food-map-view-control {
  --view-surface: #202124;
  --view-surface-raised: #292a2e;
  --view-border: rgba(255, 255, 255, 0.14);
  --view-text: #fffaf4;
  --view-muted: rgba(255, 250, 244, 0.62);
  --view-accent: #f6a35d;
  --view-accent-bg: rgba(242, 123, 48, 0.13);
  position: fixed;
  z-index: 28;
  top: calc(var(--nav-height) + 16px);
  left: 16px;
}

.food-map-view-trigger {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  min-width: 142px;
  min-height: 46px;
  gap: 8px;
  padding: 6px 10px 6px 7px;
  border: 1px solid var(--view-border);
  border-radius: 11px;
  color: var(--view-text);
  background: var(--view-surface);
  box-shadow: 0 5px 14px rgba(16, 14, 12, 0.2);
  text-align: left;
}

.food-map-view-trigger > .app-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  color: var(--view-accent);
  background: var(--view-accent-bg);
}

.food-map-view-trigger > span {
  display: grid;
  gap: 2px;
}

.food-map-view-trigger small,
.food-map-view-menu header span {
  color: var(--view-muted);
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1;
}

.food-map-view-trigger strong {
  max-width: 96px;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-view-trigger > b {
  color: var(--view-muted);
  font-size: 0.6875rem;
}

.food-map-view-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: min(286px, calc(100vw - 32px));
  padding: 9px;
  border: 1px solid var(--view-border);
  border-radius: 13px;
  color: var(--view-text);
  background: var(--view-surface);
  box-shadow: 0 16px 36px rgba(13, 12, 11, 0.28);
}

.food-map-view-menu header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px 9px 6px;
}

.food-map-view-menu header > div {
  display: grid;
  gap: 4px;
}

.food-map-view-menu header strong {
  font-size: 0.8125rem;
}

.food-map-view-menu header button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--view-muted);
  background: transparent;
}

.food-map-view-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.food-map-view-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 46px;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--view-muted);
  background: var(--view-surface-raised);
  font-size: 0.6875rem;
  font-weight: 750;
  line-height: 1.1;
  text-align: left;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.food-map-view-item > .app-icon {
  justify-self: center;
}

.food-map-view-item > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-view-item > small {
  color: inherit;
  font-size: 0.625rem;
  opacity: 0.72;
}

.food-map-view-item.active {
  border-color: rgba(242, 123, 48, 0.34);
  color: var(--view-accent);
  background: var(--view-accent-bg);
}

:global(:root[data-theme="light"]) .food-map-view-control {
  --view-surface: #fffdf9;
  --view-surface-raised: #f6eee4;
  --view-border: rgba(73, 48, 29, 0.17);
  --view-text: #2e2119;
  --view-muted: #766456;
  --view-accent: #c64f18;
  --view-accent-bg: rgba(224, 93, 31, 0.1);
}

.food-map-view-trigger:focus-visible,
.food-map-view-menu button:focus-visible {
  outline: 3px solid rgba(249, 151, 76, 0.86);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .food-map-view-trigger:hover,
  .food-map-view-menu header button:hover {
    border-color: rgba(242, 123, 48, 0.38);
    color: var(--view-text);
  }

  .food-map-view-item:hover {
    border-color: var(--view-border);
    color: var(--view-text);
  }
}

.map-view-menu-enter-active,
.map-view-menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.map-view-menu-enter-from,
.map-view-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .food-map-view-control {
    top: auto;
    bottom: max(9px, env(safe-area-inset-bottom));
    left: 10px;
  }

  .food-map-view-trigger {
    min-width: 132px;
    min-height: 50px;
  }

  .food-map-view-menu {
    top: auto;
    bottom: calc(100% + 8px);
    width: min(300px, calc(100vw - 20px));
  }

  .map-view-menu-enter-from,
  .map-view-menu-leave-to {
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .food-map-view-item,
  .map-view-menu-enter-active,
  .map-view-menu-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
