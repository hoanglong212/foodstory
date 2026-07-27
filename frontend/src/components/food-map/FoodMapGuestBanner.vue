<script setup>
import AppIcon from '../AppIcon.vue'
</script>

<template>
  <aside class="food-map-guest-banner" aria-label="Guest Food Map preview">
    <AppIcon name="map-pin" size="19" />
    <div>
      <strong>Exploring as a guest</strong>
      <span>Vision and map browsing work now. Sign in for precise address search and saving.</span>
    </div>
    <RouterLink :to="{ name: 'login', query: { redirect: '/food-map' } }">
      Sign in for more
    </RouterLink>
  </aside>
</template>

<style scoped>
.food-map-guest-banner {
  position: absolute;
  z-index: 27;
  top: 76px;
  right: 16px;
  display: flex;
  max-width: min(430px, calc(100% - 104px));
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 8px 9px 8px 12px;
  border-radius: 14px;
  color: #fffaf4;
  background: #252326;
  box-shadow: 0 5px 8px rgba(18, 15, 13, 0.2);
}

.food-map-guest-banner div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.food-map-guest-banner strong {
  font-size: 0.8125rem;
}

.food-map-guest-banner span {
  overflow: hidden;
  color: #cbc5be;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-guest-banner a {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 10px 12px;
  border-radius: 10px;
  color: #2d2119;
  background: #f6a35d;
  font-size: 0.75rem;
  font-weight: 800;
  text-decoration: none;
}

.food-map-guest-banner a:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .food-map-guest-banner {
    top: 70px;
    right: 10px;
    left: 10px;
    max-width: none;
  }

  .food-map-guest-banner span {
    display: none;
  }
}
</style>
