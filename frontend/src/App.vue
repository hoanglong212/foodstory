<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon from './components/AppIcon.vue'
import ChatBot from './components/ChatBot.vue'
import ToastNotification from './components/ToastNotification.vue'
import { useAuthStore } from './stores/authStore'
import { useAdminStore } from './stores/adminStore'
import { useUiStore } from './stores/uiStore'

const authStore = useAuthStore()
const adminStore = useAdminStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()

const navItems = computed(() => {
  const baseItems = [
    { to: '/', label: 'Home', icon: 'home' },
    { to: '/news', label: 'News', icon: 'newspaper' },
    { to: '/about', label: 'About Us', icon: 'users' },
    { to: '/recipes', label: 'Recipes', icon: 'book-open' },
  ]

  if (!authStore.isLoggedIn) {
    return [
      ...baseItems,
      { to: '/login', label: 'Login', icon: 'users' },
      { to: '/register', label: 'Register', icon: 'send' },
    ]
  }

  return [
    ...baseItems,
    { to: '/food-map', label: 'Food Map', icon: 'map-pin' },
    ...(authStore.isAdmin
      ? [
          {
            to: '/admin',
            label: 'Admin',
            icon: 'crown',
            pendingCount: adminStore.pendingCount,
          },
        ]
      : []),
    { to: '/profile', label: 'Profile', icon: 'chef-hat' },
  ]
})

const socialLinks = [
  { label: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/' },
  { label: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/' },
  { label: 'Facebook', icon: 'facebook', href: 'https://www.facebook.com/' },
]

const footerCategories = [
  { label: 'Vietnamese Cuisine', value: 'Vietnamese Cuisine' },
  { label: 'Street Food', value: 'Street Food' },
  { label: 'Recipes', value: 'Recipes' },
  { label: 'Trends', value: 'Trends' },
]

const isDark = computed(() => uiStore.darkMode)
const isHomePage = computed(() => route.name === 'home')
const isNavSolid = ref(false)
const isMobileNavOpen = ref(false)
let revealObserver
let rafId = 0

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function toggleTheme() {
  uiStore.toggleDarkMode()
}

function toggleMobileNav() {
  isMobileNavOpen.value = !isMobileNavOpen.value
}

function closeMobileNav() {
  isMobileNavOpen.value = false
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && isMobileNavOpen.value) {
    closeMobileNav()
    document.querySelector('.mobile-menu-toggle')?.focus()
  }
}

async function logout() {
  closeMobileNav()
  await authStore.logout()
  router.push('/')
}

function handleAuthExpired(event) {
  const message = event.detail?.message || 'Your login session has expired.'
  authStore.clearAuth(message)
  uiStore.setError(message)

  if (route.meta.requiresAuth && route.name !== 'login') {
    router.push({ name: 'login', query: { redirect: route.fullPath } }).catch(() => {})
  }
}

function updateParallax() {
  rafId = 0
  isNavSolid.value = window.scrollY > 90

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  const offset = Math.min(window.scrollY * 0.16, 140)
  document.documentElement.style.setProperty('--parallax-y', `${offset}px`)
  document.documentElement.style.setProperty('--parallax-soft', `${offset * 0.55}px`)
}

function requestParallaxFrame() {
  if (rafId) {
    return
  }

  rafId = window.requestAnimationFrame(updateParallax)
}

function observeMotion() {
  const targets = document.querySelectorAll(
    [
      '.section-heading',
      '.recipe-card',
      '.random-card',
      '.topic-card',
      '.search-panel',
      '.news-card',
      '.news-sidebar section',
      '.about-visual',
      '.about-content',
      '.welcome-panel',
      '.choice-panel',
      '.mood-card',
      '.mood-preview',
      '.mood-result',
      '.team-grid article',
      '.footer-grid > div',
      '.footer-bottom',
      '.stage2-card',
      '.auth-panel',
      '.form-shell',
      '.recipe-detail-grid > *',
      '.profile-header',
      '.checklist-summary-item',
      '.not-found-content',
    ].join(','),
  )

  revealObserver?.disconnect()

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((target) => target.classList.add('motion-target', 'is-visible'))
    return
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          revealObserver.unobserve(entry.target)
        }
      })
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  )

  targets.forEach((target, index) => {
    target.classList.add('motion-target')
    target.style.setProperty('--motion-delay', `${Math.min(index * 35, 245)}ms`)
    revealObserver.observe(target)
  })
}

onMounted(async () => {
  authStore.loadFromStorage()
  if (authStore.isAdmin) {
    adminStore.fetchStats({ silent: true })
  }
  applyTheme(uiStore.darkMode ? 'dark' : 'light')

  updateParallax()
  window.addEventListener('scroll', requestParallaxFrame, { passive: true })
  window.addEventListener('resize', requestParallaxFrame)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('foodstory-auth-expired', handleAuthExpired)

  await nextTick()
  observeMotion()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  window.removeEventListener('scroll', requestParallaxFrame)
  window.removeEventListener('resize', requestParallaxFrame)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('foodstory-auth-expired', handleAuthExpired)

  if (rafId) {
    window.cancelAnimationFrame(rafId)
  }
})

watch(isDark, (value) => {
  const theme = value ? 'dark' : 'light'
  applyTheme(theme)
  window.localStorage.setItem('foodstory-theme', theme)
})

watch(
  () => authStore.isAdmin,
  (isAdmin) => {
    if (isAdmin) {
      adminStore.fetchStats({ silent: true })
    } else {
      adminStore.clear()
    }
  },
)

watch(
  () => route.fullPath,
  async () => {
    closeMobileNav()
    isNavSolid.value = false
    await nextTick()
    observeMotion()
    requestParallaxFrame()
  },
)

watch(
  () => route.path,
  async () => {
    await nextTick()
    document.getElementById('main-content')?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <ToastNotification />

    <header
      :class="[
        'site-header',
        {
          'is-home': isHomePage,
          'is-solid': isNavSolid,
          'is-nav-open': isMobileNavOpen,
        },
      ]"
    >
      <RouterLink class="brand" to="/" aria-label="FoodStory home">
        <span class="brand-mark" aria-hidden="true">
          <AppIcon name="chef-hat" size="23" stroke-width="2.2" />
        </span>
        <span>FoodStory</span>
      </RouterLink>

      <nav
        id="primary-navigation"
        :class="['main-nav', { 'is-open': isMobileNavOpen }]"
        aria-label="Main navigation"
      >
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          active-class="active"
          exact-active-class="active"
          @click="closeMobileNav"
        >
          <AppIcon :name="item.icon" size="18" />
          <span>{{ item.label }}</span>
          <span v-if="item.pendingCount > 0" class="pending-badge">
            {{ item.pendingCount > 99 ? '99+' : item.pendingCount }}
          </span>
        </RouterLink>
      </nav>

      <div class="header-actions">
        <span v-if="authStore.isLoggedIn" class="user-chip">
          Welcome, {{ authStore.user?.username }}
        </span>
        <button
          v-if="authStore.isLoggedIn"
          class="logout-button"
          type="button"
          @click="logout"
        >
          <AppIcon name="arrow-left" size="17" />
          <span>Logout</span>
        </button>
        <button
          class="theme-toggle"
          type="button"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <AppIcon :name="isDark ? 'moon' : 'sun'" size="18" />
          <span class="sr-only">{{ isDark ? 'Dark mode' : 'Light mode' }}</span>
        </button>
        <button
          class="mobile-menu-toggle"
          type="button"
          :aria-expanded="isMobileNavOpen"
          aria-controls="primary-navigation"
          :aria-label="isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'"
          @click="toggleMobileNav"
        >
          <AppIcon :name="isMobileNavOpen ? 'x' : 'menu'" size="20" />
        </button>
      </div>
    </header>

    <main id="main-content" tabindex="-1">
      <RouterView v-slot="{ Component, route: activeRoute }">
        <Transition name="page" mode="out-in">
          <div :key="activeRoute.name || activeRoute.path" class="page-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <ChatBot />

    <footer class="site-footer">
      <section class="footer-grid">
        <div>
          <RouterLink class="brand footer-brand" to="/">
            <span class="brand-mark" aria-hidden="true">
              <AppIcon name="chef-hat" size="23" stroke-width="2.2" />
            </span>
            <span>FoodStory</span>
          </RouterLink>
          <p>"Discover food, preserve memories"</p>
          <div class="social-row" aria-label="Social links">
            <a
              v-for="social in socialLinks"
              :key="social.label"
              :href="social.href"
              :aria-label="social.label"
              target="_blank"
              rel="noopener noreferrer"
            >
              <AppIcon :name="social.icon" size="18" />
            </a>
          </div>
        </div>

        <div>
          <h2>Explore</h2>
          <RouterLink to="/">Home</RouterLink>
          <RouterLink to="/news">Food News</RouterLink>
          <RouterLink to="/about">About FoodStory</RouterLink>
        </div>

        <div>
          <h2>Categories</h2>
          <RouterLink
            v-for="category in footerCategories"
            :key="category.value"
            :to="{ name: 'news', query: { category: category.value } }"
          >
            {{ category.label }}
          </RouterLink>
        </div>

        <div>
          <h2>Contact</h2>
          <p>Have a question, place, or recipe to share with FoodStory?</p>
          <div class="footer-contact-list">
            <span>
              <AppIcon name="map-pin" size="17" />
              Ho Chi Minh City, Vietnam
            </span>
            <span>
              <AppIcon name="clock" size="17" />
              Replies within 24 hours
            </span>
          </div>
          <a class="footer-email" href="mailto:hello@foodstory.vn">hello@foodstory.vn</a>
          <RouterLink class="footer-submit" to="/about">
            <AppIcon name="send" size="16" />
            Share a food story
          </RouterLink>
        </div>
      </section>

      <div class="footer-bottom">
        <span>© 2026 FoodStory. Student Project - Stage 2.</span>
        <span>Built with Vue, Vite, Pinia, Express and MySQL</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.pending-badge {
  display: inline-grid;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  place-items: center;
  border-radius: 999px;
  color: #fff;
  background: #e53e3e;
  box-shadow: 0 0 0 2px rgba(229, 62, 62, 0.18);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}
</style>
