<script setup>
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  activeTab: { type: String, default: 'discover' },
  places: { type: Array, default: () => [] },
  selectedKey: { type: String, default: '' },
  emptyMessage: { type: String, default: 'No dishes match this view yet.' },
  searched: Boolean,
})

const emit = defineEmits(['select'])

function compactText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/gu, ' ').trim().slice(0, 90)
}

function dishLabel(place) {
  return compactText(
    place?.raw?.dish_name || place?.raw?.featured_dish || place?.raw?.category || place?.raw?.name,
    'Food place',
  )
}

function signalLabel(place) {
  const searchCount = Number(place?.raw?.search_count || place?.raw?.view_count || 0)
  if (searchCount > 0) return `${searchCount.toLocaleString()} searches`
  if (props.activeTab === 'trending' || Number(place?.raw?.trend_score) > 0) return 'Trending'
  if (Number(place?.rating) >= 4.5) return 'Popular'
  if (props.searched) return 'Search result'
  return 'Database place'
}

function dishIcon(place) {
  const category = compactText(
    `${place?.raw?.category || ''} ${place?.raw?.dish_name || ''} ${place?.raw?.featured_dish || ''}`,
  ).toLocaleLowerCase('vi')

  if (/vegetarian|vegan|healthy|chay/u.test(category)) return 'leaf'
  if (/cafe|coffee|tea|drink|beverage|ca phe|cà phê|tra|trà/u.test(category)) return 'store'
  if (/restaurant|buffet|grill|barbecue|bbq|nướng|nuong/u.test(category)) return 'utensils'
  return 'bowl'
}

const tickerPlaces = computed(() => props.places.slice(0, 10))
const loopPlaces = computed(() => {
  if (tickerPlaces.value.length < 2) return tickerPlaces.value
  return [...tickerPlaces.value, ...tickerPlaces.value]
})
</script>

<template>
  <section class="food-map-dish-ticker" aria-label="Popular and recently discovered dishes">
    <div class="food-map-ticker-label">
      <AppIcon name="utensils" size="17" />
      <span><strong>Taste now</strong><small>Live from FoodStory</small></span>
    </div>

    <div v-if="tickerPlaces.length" class="food-map-ticker-viewport">
      <div class="food-map-ticker-track" :class="{ static: tickerPlaces.length < 2 }">
        <button
          v-for="(place, index) in loopPlaces"
          :key="`${place.key}-${index}`"
          class="food-map-ticker-item"
          :class="{ selected: selectedKey === place.key }"
          type="button"
          :aria-label="`${dishLabel(place)} at ${place.name}. ${signalLabel(place)}`"
          @click="emit('select', place)"
        >
          <span class="food-map-ticker-placeholder" aria-hidden="true">
            <AppIcon :name="dishIcon(place)" size="18" />
          </span>
          <span>
            <small>{{ signalLabel(place) }}</small>
            <strong>{{ dishLabel(place) }}</strong>
            <em>{{ place.name }}</em>
          </span>
          <b v-if="place.rating">{{ place.rating.toFixed(1) }} ★</b>
        </button>
      </div>
    </div>

    <p v-else class="food-map-ticker-empty">{{ emptyMessage }}</p>
  </section>
</template>

<style scoped>
.food-map-dish-ticker {
  --ticker-surface: rgba(30, 31, 34, 0.96);
  --ticker-border: rgba(255, 255, 255, 0.13);
  --ticker-text: #fffaf4;
  --ticker-muted: rgba(255, 250, 244, 0.62);
  --ticker-chip: #27282c;
  position: fixed;
  z-index: 26;
  right: 16px;
  bottom: 14px;
  left: 86px;
  display: grid;
  height: 58px;
  grid-template-columns: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--ticker-border);
  border-radius: 14px;
  color: var(--ticker-text);
  background: var(--ticker-surface);
  box-shadow: 0 5px 10px rgba(18, 15, 12, 0.16);
}

.food-map-ticker-label {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 154px;
  padding: 0 16px;
  color: #f3a263;
  background: var(--ticker-surface);
  box-shadow: 8px 0 12px rgba(15, 14, 13, 0.16);
}

.food-map-ticker-label > span {
  display: grid;
  gap: 2px;
}

.food-map-ticker-label strong {
  color: var(--ticker-text);
  font-size: 0.75rem;
}

.food-map-ticker-label small {
  color: var(--ticker-muted);
  font-size: 0.625rem;
}

.food-map-ticker-viewport {
  min-width: 0;
  overflow: hidden;
}

.food-map-ticker-track {
  display: flex;
  width: max-content;
  height: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  animation: food-map-ticker 38s linear infinite;
}

.food-map-ticker-track.static {
  animation: none;
}

.food-map-ticker-viewport:hover .food-map-ticker-track,
.food-map-ticker-viewport:focus-within .food-map-ticker-track {
  animation-play-state: paused;
}

.food-map-ticker-item {
  display: grid;
  width: 260px;
  height: 44px;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 3px 9px 3px 3px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: inherit;
  background: var(--ticker-chip);
  text-align: left;
}

.food-map-ticker-placeholder {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  color: #d75d22;
  background: rgba(243, 150, 77, 0.12);
}

.food-map-ticker-item > span {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.food-map-ticker-item small,
.food-map-ticker-item em {
  overflow: hidden;
  color: var(--ticker-muted);
  font-size: 0.5625rem;
  font-style: normal;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-ticker-item small {
  color: #f1a166;
  font-weight: 800;
}

.food-map-ticker-item strong {
  overflow: hidden;
  color: var(--ticker-text);
  font-size: 0.6875rem;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-ticker-item b {
  color: #f2a161;
  font-size: 0.625rem;
  white-space: nowrap;
}

.food-map-ticker-item.selected {
  border-color: rgba(243, 150, 77, 0.68);
}

.food-map-ticker-item:focus-visible {
  outline: 3px solid rgba(249, 151, 76, 0.9);
  outline-offset: 1px;
}

.food-map-ticker-empty {
  align-self: center;
  margin: 0;
  padding: 0 16px;
  color: var(--ticker-muted);
  font-size: 0.75rem;
}

:global(:root[data-theme="light"]) .food-map-dish-ticker {
  --ticker-surface: rgba(255, 255, 255, 0.97);
  --ticker-border: rgba(68, 45, 28, 0.16);
  --ticker-text: #302219;
  --ticker-muted: #735f51;
  --ticker-chip: #f7f2ec;
  box-shadow: 0 5px 10px rgba(72, 48, 29, 0.12);
}

:global(:root[data-theme="light"]) .food-map-ticker-label {
  box-shadow: 8px 0 12px rgba(72, 48, 29, 0.08);
}

@keyframes food-map-ticker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (hover: hover) and (pointer: fine) {
  .food-map-ticker-item:hover {
    border-color: rgba(243, 150, 77, 0.38);
    background: color-mix(in srgb, var(--ticker-chip) 88%, #f39a55 12%);
  }
}

@media (max-width: 768px) {
  .food-map-dish-ticker {
    right: 8px;
    bottom: calc(70px + env(safe-area-inset-bottom));
    left: 8px;
    height: 54px;
  }

  .food-map-ticker-label {
    min-width: 52px;
    justify-content: center;
    padding: 0 12px;
  }

  .food-map-ticker-label > span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .food-map-ticker-item {
    width: 224px;
    height: 42px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .food-map-ticker-track {
    width: 100%;
    overflow-x: auto;
    animation: none;
    scroll-snap-type: x proximity;
  }

  .food-map-ticker-item {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }
}
</style>
