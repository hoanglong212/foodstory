import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'

const Home = () => import('../views/Home.vue')
const News = () => import('../views/News.vue')
const NewsDetail = () => import('../views/NewsDetail.vue')
const About = () => import('../views/About.vue')
const Recipes = () => import('../views/Recipes.vue')
const RecipeDetail = () => import('../views/RecipeDetail.vue')
const RecipeForm = () => import('../views/RecipeForm.vue')
const Login = () => import('../views/Login.vue')
const Register = () => import('../views/Register.vue')
const Profile = () => import('../views/Profile.vue')
const FoodMapView = () => import('../views/FoodMapView.vue')
const AdminDashboardView = () => import('../views/AdminDashboardView.vue')
const NotFound = () => import('../views/NotFound.vue')

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
      meta: { title: 'Home' },
    },
    {
      path: '/news',
      name: 'news',
      component: News,
      meta: { title: 'Food News' },
    },
    {
      path: '/news/:id',
      name: 'news-detail',
      component: NewsDetail,
      meta: { title: 'News Article' },
    },
    {
      path: '/about',
      name: 'about',
      component: About,
      meta: { title: 'About Us' },
    },
    {
      path: '/recipes',
      name: 'recipes',
      component: Recipes,
      meta: { title: 'Recipes' },
    },
    {
      path: '/admin',
      name: 'AdminDashboard',
      component: AdminDashboardView,
      meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin Dashboard' },
    },
    {
      path: '/recipes/new',
      name: 'recipe-new',
      component: RecipeForm,
      meta: { requiresAuth: true, requiresAdmin: true, title: 'Create Recipe' },
    },
    {
      path: '/recipes/submit',
      name: 'recipe-submit',
      component: RecipeForm,
      meta: { requiresAuth: true, userSubmission: true, title: 'Submit a Recipe' },
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: RecipeDetail,
      meta: { title: 'Recipe' },
    },
    {
      path: '/recipes/:id/edit',
      name: 'recipe-edit',
      component: RecipeForm,
      meta: { requiresAuth: true, requiresAdmin: true, title: 'Edit Recipe' },
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { guestOnly: true, title: 'Login' },
    },
    {
      path: '/register',
      name: 'register',
      component: Register,
      meta: { guestOnly: true, title: 'Create Account' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: Profile,
      meta: { requiresAuth: true, title: 'My Profile' },
    },
    {
      path: '/food-map',
      name: 'FoodMap',
      component: FoodMapView,
      meta: { guestPreview: true, title: 'Food Map' },
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: Profile,
      meta: { requiresAuth: true, title: 'Favorite Recipes' },
    },
    {
      path: '/checklist',
      name: 'checklist',
      component: Profile,
      meta: { requiresAuth: true, title: 'Ingredient Checklists' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
      meta: { title: 'Page Not Found' },
    },
  ],
})

router.afterEach((to) => {
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = pageTitle ? `${pageTitle} | FoodStory` : 'FoodStory'
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  authStore.loadFromStorage()

  if (authStore.token && !authStore.sessionChecked) {
    if (to.meta.requiresAuth || to.meta.guestOnly || to.meta.guestPreview) {
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
    return { name: authStore.isLoggedIn ? 'home' : 'login' }
  }

  if (to.meta.userSubmission && authStore.isAdmin) {
    return { name: 'AdminDashboard' }
  }

  if (to.meta.guestOnly && authStore.isLoggedIn) {
    return { name: 'profile' }
  }

  return true
})

export default router
