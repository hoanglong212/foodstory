<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppIcon from './components/AppIcon.vue'

const navItems = [
  { to: '/', label: 'Trang Chủ', icon: 'home' },
  { to: '/news', label: 'Tin Tức', icon: 'newspaper' },
  { to: '/about', label: 'Về Chúng Tôi', icon: 'users' },
]

const socialLinks = [
  { label: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/' },
  { label: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/' },
  { label: 'Facebook', icon: 'facebook', href: 'https://www.facebook.com/' },
]

const footerCategories = [
  { label: 'Ẩm Thực Việt', value: 'Ẩm Thực Việt' },
  { label: 'Đường Phố', value: 'Đường Phố' },
  { label: 'Công Thức', value: 'Công Thức' },
  { label: 'Xu Hướng', value: 'Xu Hướng' },
]

const route = useRoute()
const isDark = ref(true)
const isNavSolid = ref(false)
let revealObserver
let rafId = 0

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem('foodstory-theme')

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function toggleTheme() {
  isDark.value = !isDark.value
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
  const initialTheme = getInitialTheme()
  isDark.value = initialTheme === 'dark'
  applyTheme(initialTheme)

  updateParallax()
  window.addEventListener('scroll', requestParallaxFrame, { passive: true })
  window.addEventListener('resize', requestParallaxFrame)

  await nextTick()
  observeMotion()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  window.removeEventListener('scroll', requestParallaxFrame)
  window.removeEventListener('resize', requestParallaxFrame)

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
  () => route.fullPath,
  async () => {
    isNavSolid.value = false
    await nextTick()
    observeMotion()
    requestParallaxFrame()
  },
)
</script>

<template>
  <div class="app-shell">
    <header :class="['site-header', { 'is-solid': isNavSolid }]">
      <RouterLink class="brand" to="/" aria-label="FoodStory home">
        <span class="brand-mark" aria-hidden="true">
          <AppIcon name="chef-hat" size="23" stroke-width="2.2" />
        </span>
        <span>FoodStory</span>
      </RouterLink>

      <nav class="main-nav" aria-label="Main navigation">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          active-class="active"
          exact-active-class="active"
        >
          <AppIcon :name="item.icon" size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="header-actions">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <AppIcon :name="isDark ? 'moon' : 'sun'" size="18" />
          <span class="sr-only">{{ isDark ? 'Chế độ tối' : 'Chế độ sáng' }}</span>
        </button>
      </div>
    </header>

    <main>
      <RouterView v-slot="{ Component, route: activeRoute }">
        <Transition name="page" mode="out-in">
          <div :key="activeRoute.fullPath" class="page-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>

    <footer class="site-footer">
      <section class="footer-grid">
        <div>
          <RouterLink class="brand footer-brand" to="/">
            <span class="brand-mark" aria-hidden="true">
              <AppIcon name="chef-hat" size="23" stroke-width="2.2" />
            </span>
            <span>FoodStory</span>
          </RouterLink>
          <p>"Khám phá ẩm thực, lưu giữ kỷ niệm"</p>
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
          <h2>Khám Phá</h2>
          <RouterLink to="/">Trang Chủ</RouterLink>
          <RouterLink to="/news">Tin Tức Ẩm Thực</RouterLink>
          <RouterLink to="/about">Về FoodStory</RouterLink>
        </div>

        <div>
          <h2>Danh Mục</h2>
          <RouterLink
            v-for="category in footerCategories"
            :key="category.value"
            :to="{ name: 'news', query: { category: category.value } }"
          >
            {{ category.label }}
          </RouterLink>
        </div>

        <div>
          <h2>Liên Hệ</h2>
          <p>Có câu hỏi, địa điểm hay công thức muốn chia sẻ với FoodStory?</p>
          <div class="footer-contact-list">
            <span>
              <AppIcon name="map-pin" size="17" />
              TP. Hồ Chí Minh, Việt Nam
            </span>
            <span>
              <AppIcon name="clock" size="17" />
              Phản hồi trong 24 giờ
            </span>
          </div>
          <a class="footer-email" href="mailto:hello@foodstory.vn">hello@foodstory.vn</a>
          <RouterLink class="footer-submit" to="/about">
            <AppIcon name="send" size="16" />
            Gửi câu chuyện ẩm thực
          </RouterLink>
        </div>
      </section>

      <div class="footer-bottom">
        <span>© 2026 FoodStory. Đồ án Sinh Viên - Giai Đoạn 1.</span>
        <span>Built with Vue, Vite and Vue Router</span>
      </div>
    </footer>
  </div>
</template>
