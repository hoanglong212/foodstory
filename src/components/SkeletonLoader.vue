<script setup>
const props = defineProps({
  type: {
    type: String,
    default: 'card',
    validator: (value) => ['card', 'recipe-card', 'line', 'random-card'].includes(value),
  },
  count: {
    type: Number,
    default: 1,
  },
})
</script>

<template>
  <div v-if="type === 'random-card'" class="skeleton-random-card">
    <div class="skeleton-image" />
    <div class="skeleton-content">
      <div class="skeleton-pill-row">
        <div class="skeleton-pill" />
        <div class="skeleton-pill" />
      </div>
      <div class="skeleton-title" />
      <div class="skeleton-text" />
      <div class="skeleton-text short" />
      <div class="skeleton-tags">
        <div class="skeleton-tag" />
        <div class="skeleton-tag" />
        <div class="skeleton-tag" />
      </div>
      <div class="skeleton-button" />
    </div>
  </div>
</template>

<style scoped>
@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.skeleton-random-card {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(320px, 1.8fr);
  overflow: hidden;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  background: var(--panel);
  min-height: 330px;
}

.skeleton-image {
  height: 100%;
  min-height: 330px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 34px;
  gap: 16px;
}

.skeleton-pill-row {
  display: flex;
  gap: 10px;
}

.skeleton-pill {
  width: 80px;
  height: 24px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-title {
  width: 100%;
  max-width: 280px;
  height: 32px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-text {
  width: 100%;
  height: 18px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-text.short {
  width: 85%;
  max-width: 240px;
}

.skeleton-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skeleton-tag {
  width: 60px;
  height: 20px;
  border-radius: 20px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-button {
  width: 140px;
  height: 40px;
  border-radius: 6px;
  margin-top: 12px;
  background: linear-gradient(90deg, var(--soft-surface) 0%, var(--soft-surface-strong) 50%, var(--soft-surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}
</style>
