<script setup>
defineProps({
  variant: {
    type: String,
    default: 'card',
    validator: (value) => ['card', 'row', 'detail'].includes(value),
  },
})
</script>

<template>
  <article v-if="variant === 'row'" class="skeleton-row" aria-hidden="true">
    <span class="skeleton-date skeleton-pulse"></span>
    <div class="skeleton-row-body">
      <span class="skeleton-line short skeleton-pulse"></span>
      <span class="skeleton-line title skeleton-pulse"></span>
      <span class="skeleton-line skeleton-pulse"></span>
      <span class="skeleton-line medium skeleton-pulse"></span>
    </div>
  </article>

  <div v-else-if="variant === 'detail'" class="skeleton-detail" aria-hidden="true">
    <span class="skeleton-detail-media skeleton-pulse"></span>
    <div class="skeleton-detail-main">
      <span class="skeleton-line short skeleton-pulse"></span>
      <span class="skeleton-line title skeleton-pulse"></span>
      <span class="skeleton-line medium skeleton-pulse"></span>
      <div class="skeleton-actions">
        <span class="skeleton-button skeleton-pulse"></span>
        <span class="skeleton-button skeleton-pulse"></span>
      </div>
    </div>
    <span class="skeleton-section skeleton-pulse"></span>
    <span class="skeleton-section skeleton-pulse"></span>
  </div>

  <article v-else class="skeleton-card" aria-hidden="true">
    <span class="skeleton-media skeleton-pulse"></span>
    <div class="skeleton-card-body">
      <span class="skeleton-line short skeleton-pulse"></span>
      <span class="skeleton-line title skeleton-pulse"></span>
      <span class="skeleton-line medium skeleton-pulse"></span>
      <div class="skeleton-stat-row">
        <span class="skeleton-stat skeleton-pulse"></span>
        <span class="skeleton-stat skeleton-pulse"></span>
        <span class="skeleton-stat skeleton-pulse"></span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.skeleton-card,
.skeleton-row,
.skeleton-detail-main,
.skeleton-section {
  border: 1px solid var(--card-border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.skeleton-card {
  overflow: hidden;
}

.skeleton-media {
  display: block;
  aspect-ratio: 16 / 10;
}

.skeleton-card-body,
.skeleton-detail-main {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.skeleton-line,
.skeleton-button,
.skeleton-stat,
.skeleton-date,
.skeleton-detail-media,
.skeleton-section {
  display: block;
  background: var(--soft-surface-strong);
}

.skeleton-line {
  width: 100%;
  height: 14px;
  border-radius: 999px;
}

.skeleton-line.short {
  width: 38%;
}

.skeleton-line.medium {
  width: 68%;
}

.skeleton-line.title {
  width: 82%;
  height: 24px;
}

.skeleton-stat-row,
.skeleton-actions {
  display: flex;
  gap: 10px;
}

.skeleton-stat {
  flex: 1;
  height: 52px;
  border-radius: 8px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 18px;
  padding: 20px;
}

.skeleton-date {
  width: 82px;
  height: 82px;
  border-radius: 8px;
}

.skeleton-row-body {
  display: grid;
  align-content: center;
  gap: 12px;
}

.skeleton-detail {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
  gap: 26px;
}

.skeleton-detail-media {
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.skeleton-button {
  width: 150px;
  height: 48px;
  border-radius: 8px;
}

.skeleton-section {
  grid-column: 1 / -1;
  min-height: 150px;
}

.skeleton-pulse {
  background-image: linear-gradient(
    90deg,
    var(--soft-surface) 0%,
    var(--soft-surface-strong) 45%,
    var(--soft-surface) 90%
  );
  background-size: 220% 100%;
  animation: skeletonPulse 1.3s ease-in-out infinite;
}

@keyframes skeletonPulse {
  to {
    background-position: -220% 0;
  }
}

@media (max-width: 1024px) {
  .skeleton-detail {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .skeleton-row {
    grid-template-columns: 1fr;
  }

  .skeleton-date {
    width: 88px;
    height: 88px;
  }

  .skeleton-actions {
    flex-direction: column;
  }

  .skeleton-button {
    width: 100%;
  }
}
</style>
