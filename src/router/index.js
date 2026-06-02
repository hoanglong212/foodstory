import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import News from '../views/News.vue'
import NewsDetail from '../views/NewsDetail.vue'
import About from '../views/About.vue'
import Recipes from '../views/Recipes.vue'
import RecipeDetail from '../views/RecipeDetail.vue'
import RecipeForm from '../views/RecipeForm.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Profile from '../views/Profile.vue'
import NotFound from '../views/NotFound.vue'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/news',
      name: 'news',
      component: News,
    },
    {
      path: '/news/:id',
      name: 'news-detail',
      component: NewsDetail,
    },
    {
      path: '/about',
      name: 'about',
      component: About,
    },
    {
      path: '/recipes',
      name: 'recipes',
      component: Recipes,
    },
    {
      path: '/admin',
      name: 'admin',
      component: Recipes,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/recipes/new',
      name: 'recipe-new',
      component: RecipeForm,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: RecipeDetail,
    },
    {
      path: '/recipes/:id/edit',
      name: 'recipe-edit',
      component: RecipeForm,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: Register,
      meta: { guestOnly: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: Profile,
      meta: { requiresAuth: true },
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: Profile,
      meta: { requiresAuth: true },
    },
    {
      path: '/checklist',
      name: 'checklist',
      component: Profile,
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  authStore.loadFromStorage()

  if (authStore.token && !authStore.sessionChecked) {
    if (to.meta.requiresAuth || to.meta.guestOnly) {
      await authStore.fetchMe({ timeoutMs: 3000 })
    } else {
      authStore.fetchMe({ timeoutMs: 3000, silent: true })
    }
  }

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    if (to.name === 'login') {
      return true
    }
    uiStore.setError('Please login to continue.')
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    uiStore.setError('Admin permission is required for that page.')
    return { name: authStore.isLoggedIn ? 'recipes' : 'login' }
  }

  if (to.meta.guestOnly && authStore.isLoggedIn) {
    return { name: 'profile' }
  }

  return true
})

export default router
