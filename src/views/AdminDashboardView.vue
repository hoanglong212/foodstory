<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import {
  approveAdminRecipe,
  deleteAdminComment,
  deleteAdminRecipe,
  getAdminComments,
  getAdminRecipes,
  getAdminUsers,
  rejectAdminRecipe,
  toggleAdminUserBan,
  updateAdminUserRole,
} from '../services/adminService'
import { getApiError } from '../services/api'
import { useAdminStore } from '../stores/adminStore'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'

const router = useRouter()
const adminStore = useAdminStore()
const authStore = useAuthStore()
const uiStore = useUiStore()

const activeSection = ref('overview')
const sections = [
  { id: 'overview', label: 'Tổng Quan', icon: 'home' },
  { id: 'recipes', label: 'Công Thức', icon: 'book-open' },
  { id: 'users', label: 'Người Dùng', icon: 'users' },
  { id: 'comments', label: 'Bình Luận', icon: 'message' },
  { id: 'pending', label: 'Chờ Duyệt', icon: 'clock' },
]

const loading = reactive({
  recipes: false,
  users: false,
  comments: false,
  pending: false,
})
const actionId = ref('')
const rejectingRecipeId = ref(null)
const rejectionReasons = reactive({})
const roleDrafts = reactive({})

const recipes = ref([])
const recipeFilters = reactive({ search: '', status: '', page: 1 })
const recipePagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0 })

const users = ref([])
const userFilters = reactive({ search: '', role: '', page: 1 })
const userPagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0 })

const comments = ref([])
const commentFilters = reactive({ search: '', page: 1 })
const commentPagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0 })

const pendingRecipes = ref([])
const pendingFilters = reactive({ page: 1 })
const pendingPagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0 })

const statsCards = computed(() => [
  {
    key: 'total_users',
    label: 'Người dùng',
    value: adminStore.stats.total_users,
    section: 'users',
    icon: 'users',
  },
  {
    key: 'total_recipes',
    label: 'Công thức',
    value: adminStore.stats.total_recipes,
    section: 'recipes',
    icon: 'book-open',
  },
  {
    key: 'total_comments',
    label: 'Bình luận',
    value: adminStore.stats.total_comments,
    section: 'comments',
    icon: 'message',
  },
  {
    key: 'pending_recipes',
    label: 'Chờ duyệt',
    value: adminStore.stats.pending_recipes,
    section: 'pending',
    icon: 'clock',
    alert: adminStore.pendingCount > 0,
  },
  {
    key: 'total_spots',
    label: 'Địa điểm',
    value: adminStore.stats.total_spots,
    section: 'overview',
    icon: 'map-pin',
  },
])

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Chưa có'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function truncate(value, maxLength = 60) {
  const text = String(value || '')
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function statusLabel(status) {
  return {
    approved: 'Đã duyệt',
    pending: 'Chờ duyệt',
    rejected: 'Từ chối',
  }[status] || status
}

function showError(error, fallback) {
  uiStore.setError(getApiError(error, fallback), {
    title: 'Admin Dashboard',
    eyebrow: 'Quản trị',
  })
}

function openStatCard(card) {
  if (card.key === 'total_spots') {
    router.push('/food-map')
    return
  }

  setSection(card.section)
}

async function loadStats(options = {}) {
  try {
    await adminStore.fetchStats(options)
  } catch (error) {
    showError(error, 'Không thể tải thống kê.')
  }
}

async function loadRecipes(page = recipeFilters.page) {
  loading.recipes = true
  try {
    const response = await getAdminRecipes({
      page,
      search: recipeFilters.search,
      status: recipeFilters.status,
    })
    recipes.value = response.data.items || []
    Object.assign(recipePagination, response.data)
    recipeFilters.page = response.data.currentPage
  } catch (error) {
    showError(error, 'Không thể tải công thức.')
  } finally {
    loading.recipes = false
  }
}

async function loadUsers(page = userFilters.page) {
  loading.users = true
  try {
    const response = await getAdminUsers({
      page,
      search: userFilters.search,
      role: userFilters.role,
    })
    users.value = response.data.items || []
    users.value.forEach((user) => {
      roleDrafts[user.id] = user.role
    })
    Object.assign(userPagination, response.data)
    userFilters.page = response.data.currentPage
  } catch (error) {
    showError(error, 'Không thể tải người dùng.')
  } finally {
    loading.users = false
  }
}

async function loadComments(page = commentFilters.page) {
  loading.comments = true
  try {
    const response = await getAdminComments({
      page,
      search: commentFilters.search,
    })
    comments.value = response.data.items || []
    Object.assign(commentPagination, response.data)
    commentFilters.page = response.data.currentPage
  } catch (error) {
    showError(error, 'Không thể tải bình luận.')
  } finally {
    loading.comments = false
  }
}

async function loadPending(page = pendingFilters.page) {
  loading.pending = true
  try {
    const response = await getAdminRecipes({ page, status: 'pending' })
    pendingRecipes.value = response.data.items || []
    Object.assign(pendingPagination, response.data)
    pendingFilters.page = response.data.currentPage
  } catch (error) {
    showError(error, 'Không thể tải danh sách chờ duyệt.')
  } finally {
    loading.pending = false
  }
}

async function setSection(section) {
  activeSection.value = section

  if (section === 'recipes' && recipes.value.length === 0) {
    await loadRecipes(1)
  } else if (section === 'users' && users.value.length === 0) {
    await loadUsers(1)
  } else if (section === 'comments' && comments.value.length === 0) {
    await loadComments(1)
  } else if (section === 'pending') {
    await loadPending(1)
  }
}

async function removeRecipe(recipe) {
  if (!window.confirm(`Xóa công thức "${recipe.title}"? Hành động này không thể hoàn tác.`)) {
    return
  }

  actionId.value = `delete-recipe-${recipe.id}`
  try {
    await deleteAdminRecipe(recipe.id)
    uiStore.setSuccess('Đã xóa công thức.')
    await Promise.all([
      loadRecipes(recipePagination.currentPage),
      loadPending(pendingPagination.currentPage),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    showError(error, 'Không thể xóa công thức.')
  } finally {
    actionId.value = ''
  }
}

async function approveRecipe(recipe) {
  actionId.value = `approve-${recipe.id}`
  try {
    await approveAdminRecipe(recipe.id)
    uiStore.setSuccess(`Đã duyệt "${recipe.title}".`)
    await Promise.all([
      loadRecipes(recipePagination.currentPage),
      loadPending(pendingPagination.currentPage),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    showError(error, 'Không thể duyệt công thức.')
  } finally {
    actionId.value = ''
  }
}

function startReject(recipe) {
  rejectingRecipeId.value = recipe.id
  rejectionReasons[recipe.id] ||= ''
}

async function rejectRecipe(recipe) {
  const reason = String(rejectionReasons[recipe.id] || '').trim()
  if (!reason) {
    uiStore.setError('Vui lòng nhập lý do từ chối.')
    return
  }

  actionId.value = `reject-${recipe.id}`
  try {
    await rejectAdminRecipe(recipe.id, reason)
    rejectingRecipeId.value = null
    rejectionReasons[recipe.id] = ''
    uiStore.setSuccess(`Đã từ chối "${recipe.title}".`)
    await Promise.all([
      loadRecipes(recipePagination.currentPage),
      loadPending(pendingPagination.currentPage),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    showError(error, 'Không thể từ chối công thức.')
  } finally {
    actionId.value = ''
  }
}

async function toggleBan(user) {
  const action = user.is_banned ? 'bỏ cấm' : 'cấm'
  if (!window.confirm(`Xác nhận ${action} tài khoản "${user.username}"?`)) {
    return
  }

  actionId.value = `ban-${user.id}`
  try {
    const response = await toggleAdminUserBan(user.id)
    const updatedUser = response.data.user || {}
    user.is_banned = Boolean(updatedUser.is_banned ?? response.data.is_banned)
    user.role = updatedUser.role || response.data.role || user.role
    roleDrafts[user.id] = user.role
    uiStore.setSuccess(response.data.message)
    await Promise.all([
      loadUsers(userPagination.currentPage),
      loadComments(commentPagination.currentPage),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    showError(error, 'Không thể cập nhật trạng thái tài khoản.')
  } finally {
    actionId.value = ''
  }
}

async function changeRole(user) {
  const role = roleDrafts[user.id]
  if (role === user.role) return
  if (!window.confirm(`Đổi role của "${user.username}" thành ${role}?`)) {
    roleDrafts[user.id] = user.role
    return
  }

  actionId.value = `role-${user.id}`
  try {
    await updateAdminUserRole(user.id, role)
    user.role = role
    uiStore.setSuccess('Đã cập nhật role người dùng.')
    await loadStats({ silent: true })
  } catch (error) {
    roleDrafts[user.id] = user.role
    showError(error, 'Không thể cập nhật role.')
  } finally {
    actionId.value = ''
  }
}

async function removeComment(comment) {
  if (!window.confirm(`Xóa bình luận của "${comment.username}"?`)) {
    return
  }

  actionId.value = `comment-${comment.id}`
  try {
    await deleteAdminComment(comment.id)
    uiStore.setSuccess('Đã xóa bình luận.')
    await Promise.all([
      loadComments(commentPagination.currentPage),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    showError(error, 'Không thể xóa bình luận.')
  } finally {
    actionId.value = ''
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <section class="admin-page">
    <header class="admin-hero">
      <div>
        <p class="admin-eyebrow">FoodStory Control Center</p>
        <h1>Admin Dashboard</h1>
        <p>Quản lý nội dung, người dùng và hoạt động kiểm duyệt.</p>
      </div>
      <div class="admin-welcome">
        <span>Đang đăng nhập</span>
        <strong>{{ authStore.user?.username }}</strong>
        <small>{{ formatNumber(adminStore.stats.total_admins) }} quản trị viên</small>
      </div>
    </header>

    <div class="admin-layout">
      <aside class="admin-sidebar" aria-label="Admin sections">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="['sidebar-item', { active: activeSection === section.id }]"
          @click="setSection(section.id)"
        >
          <AppIcon :name="section.icon" size="18" />
          <span>{{ section.label }}</span>
          <span
            v-if="section.id === 'pending' && adminStore.pendingCount > 0"
            class="sidebar-badge"
          >
            {{ adminStore.pendingCount }}
          </span>
        </button>
      </aside>

      <div class="admin-content">
        <section v-if="activeSection === 'overview'" class="admin-section">
          <div class="admin-section-heading">
            <div>
              <p>Tổng quan</p>
              <h2>Hoạt động FoodStory</h2>
            </div>
            <button type="button" :disabled="adminStore.loading" @click="loadStats()">
              <AppIcon name="sparkles" size="16" />
              Làm mới
            </button>
          </div>

          <div class="stats-grid">
            <button
              v-for="card in statsCards"
              :key="card.key"
              type="button"
              :class="['stat-card', { alert: card.alert }]"
              @click="openStatCard(card)"
            >
              <AppIcon :name="card.icon" size="22" />
              <span class="stat-number">{{ formatNumber(card.value) }}</span>
              <span class="stat-label">{{ card.label }}</span>
            </button>
          </div>

          <div v-if="adminStore.error" class="admin-empty">{{ adminStore.error }}</div>
          <div v-else class="activity-grid">
            <article class="activity-card">
              <header>
                <span><AppIcon name="clock" size="17" /> Chờ duyệt mới nhất</span>
                <button type="button" @click="setSection('pending')">Xem tất cả</button>
              </header>
              <div v-if="adminStore.recent.pending_recipes.length === 0" class="activity-empty">
                Không có công thức chờ duyệt.
              </div>
              <button
                v-for="recipe in adminStore.recent.pending_recipes"
                :key="recipe.id"
                type="button"
                class="activity-row"
                @click="setSection('pending')"
              >
                <span>
                  <strong>{{ recipe.title }}</strong>
                  <small>{{ recipe.submitter_name || 'Hệ thống' }}</small>
                </span>
                <time>{{ formatDate(recipe.created_at) }}</time>
              </button>
            </article>

            <article class="activity-card">
              <header>
                <span><AppIcon name="message" size="17" /> Bình luận gần đây</span>
                <button type="button" @click="setSection('comments')">Quản lý</button>
              </header>
              <div v-if="adminStore.recent.comments.length === 0" class="activity-empty">
                Chưa có bình luận.
              </div>
              <div
                v-for="comment in adminStore.recent.comments"
                :key="comment.id"
                class="activity-row static"
              >
                <span>
                  <strong>{{ comment.username }} · {{ comment.recipe_title }}</strong>
                  <small>{{ truncate(comment.content, 52) }}</small>
                </span>
                <time>{{ formatDate(comment.created_at) }}</time>
              </div>
            </article>

            <article class="activity-card">
              <header>
                <span><AppIcon name="users" size="17" /> Người dùng mới</span>
                <button type="button" @click="setSection('users')">Quản lý</button>
              </header>
              <div v-if="adminStore.recent.users.length === 0" class="activity-empty">
                Chưa có người dùng.
              </div>
              <div
                v-for="user in adminStore.recent.users"
                :key="user.id"
                class="activity-row static"
              >
                <span>
                  <strong>{{ user.username }}</strong>
                  <small>{{ user.email }} · {{ user.role }}</small>
                </span>
                <time>{{ formatDate(user.created_at) }}</time>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="activeSection === 'recipes'" class="admin-section">
          <div class="admin-section-heading">
            <div><p>Quản lý</p><h2>Công Thức</h2></div>
            <button type="button" class="primary" @click="router.push('/recipes/new')">
              <AppIcon name="pen" size="16" /> Tạo Recipe Mới
            </button>
          </div>

          <form class="admin-toolbar" @submit.prevent="loadRecipes(1)">
            <input v-model="recipeFilters.search" type="search" maxlength="120" placeholder="Tìm công thức..." />
            <select v-model="recipeFilters.status">
              <option value="">Tất cả trạng thái</option>
              <option value="approved">Đã duyệt</option>
              <option value="pending">Chờ duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
            <button type="submit">Tìm</button>
          </form>

          <div class="table-shell">
            <table class="admin-table">
              <thead>
                <tr><th>ID</th><th>Tên Công Thức</th><th>Danh Mục</th><th>Người gửi</th><th>Trạng Thái</th><th>Rating</th><th>Actions</th></tr>
              </thead>
              <tbody>
                <tr v-if="loading.recipes"><td colspan="7" class="table-message">Đang tải...</td></tr>
                <tr v-else-if="recipes.length === 0"><td colspan="7" class="table-message">Không có công thức phù hợp.</td></tr>
                <tr v-for="recipe in recipes" v-else :key="recipe.id">
                  <td>#{{ recipe.id }}</td>
                  <td class="title-cell"><strong>{{ recipe.title }}</strong><small>{{ formatDate(recipe.created_at) }}</small></td>
                  <td>{{ recipe.category_name }}</td>
                  <td>{{ recipe.submitter_name || 'Hệ thống' }}</td>
                  <td><span :class="['status-pill', recipe.status]">{{ statusLabel(recipe.status) }}</span></td>
                  <td>{{ recipe.rating_count ? `${recipe.avg_rating.toFixed(1)} ★` : '—' }}</td>
                  <td>
                    <div class="action-row">
                      <button class="btn-action btn-edit" type="button" @click="router.push(`/recipes/${recipe.id}/edit`)">Sửa</button>
                      <button class="btn-action btn-delete" type="button" :disabled="actionId === `delete-recipe-${recipe.id}`" @click="removeRecipe(recipe)">Xóa</button>
                      <button v-if="recipe.status === 'pending'" class="btn-action btn-approve" type="button" :disabled="Boolean(actionId)" @click="approveRecipe(recipe)">Duyệt</button>
                      <button v-if="recipe.status === 'pending'" class="btn-action btn-reject" type="button" :disabled="Boolean(actionId)" @click="startReject(recipe)">Từ Chối</button>
                    </div>
                    <form v-if="rejectingRecipeId === recipe.id" class="reject-form" @submit.prevent="rejectRecipe(recipe)">
                      <input v-model="rejectionReasons[recipe.id]" maxlength="500" placeholder="Lý do từ chối..." />
                      <button type="submit" :disabled="actionId === `reject-${recipe.id}`">Xác nhận</button>
                      <button type="button" @click="rejectingRecipeId = null">Hủy</button>
                    </form>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <nav class="admin-pagination"><button :disabled="recipePagination.currentPage <= 1" @click="loadRecipes(recipePagination.currentPage - 1)">Trước</button><span>Trang {{ recipePagination.currentPage }} / {{ recipePagination.totalPages }}</span><button :disabled="recipePagination.currentPage >= recipePagination.totalPages" @click="loadRecipes(recipePagination.currentPage + 1)">Sau</button></nav>
        </section>

        <section v-else-if="activeSection === 'users'" class="admin-section">
          <div class="admin-section-heading"><div><p>Quản lý</p><h2>Người Dùng</h2></div><span>{{ formatNumber(userPagination.totalItems) }} tài khoản</span></div>
          <form class="admin-toolbar" @submit.prevent="loadUsers(1)">
            <input v-model="userFilters.search" type="search" maxlength="120" placeholder="Tìm username hoặc email..." />
            <select v-model="userFilters.role"><option value="">Tất cả role</option><option value="admin">Admin</option><option value="user">User</option></select>
            <button type="submit">Tìm</button>
          </form>
          <div class="table-shell">
            <table class="admin-table">
              <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Recipes</th><th>Comments</th><th>Actions</th></tr></thead>
              <tbody>
                <tr v-if="loading.users"><td colspan="7" class="table-message">Đang tải...</td></tr>
                <tr v-else-if="users.length === 0"><td colspan="7" class="table-message">Không có người dùng phù hợp.</td></tr>
                <tr v-for="user in users" v-else :key="user.id" :class="{ 'row-banned': user.is_banned }">
                  <td>#{{ user.id }}</td>
                  <td class="title-cell"><strong>{{ user.username }}</strong><small v-if="user.is_banned">Tài khoản bị cấm</small></td>
                  <td>{{ user.email }}</td>
                  <td><span :class="['role-pill', user.role]">{{ user.role }}</span></td>
                  <td>{{ user.recipe_count }}</td><td>{{ user.comment_count }}</td>
                  <td>
                    <div class="user-actions">
                      <button class="btn-action btn-ban" type="button" :disabled="user.id === authStore.user?.id || Boolean(actionId)" @click="toggleBan(user)">{{ user.is_banned ? 'Unban' : 'Ban' }}</button>
                      <select v-model="roleDrafts[user.id]" :disabled="user.id === authStore.user?.id || Boolean(actionId)"><option value="user">user</option><option value="admin">admin</option></select>
                      <button class="btn-action btn-edit" type="button" :disabled="user.id === authStore.user?.id || roleDrafts[user.id] === user.role || Boolean(actionId)" @click="changeRole(user)">Đổi Role</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <nav class="admin-pagination"><button :disabled="userPagination.currentPage <= 1" @click="loadUsers(userPagination.currentPage - 1)">Trước</button><span>Trang {{ userPagination.currentPage }} / {{ userPagination.totalPages }}</span><button :disabled="userPagination.currentPage >= userPagination.totalPages" @click="loadUsers(userPagination.currentPage + 1)">Sau</button></nav>
        </section>

        <section v-else-if="activeSection === 'comments'" class="admin-section">
          <div class="admin-section-heading"><div><p>Quản lý</p><h2>Bình Luận</h2></div><span>{{ formatNumber(commentPagination.totalItems) }} bình luận</span></div>
          <form class="admin-toolbar single" @submit.prevent="loadComments(1)"><input v-model="commentFilters.search" type="search" maxlength="120" placeholder="Tìm nội dung, user hoặc recipe..." /><button type="submit">Tìm</button></form>
          <div class="table-shell">
            <table class="admin-table">
              <thead><tr><th>ID</th><th>User</th><th>Recipe</th><th>Comment</th><th>Ngày</th><th>Actions</th></tr></thead>
              <tbody>
                <tr v-if="loading.comments"><td colspan="6" class="table-message">Đang tải...</td></tr>
                <tr v-else-if="comments.length === 0"><td colspan="6" class="table-message">Không có bình luận phù hợp.</td></tr>
                <tr v-for="comment in comments" v-else :key="comment.id">
                  <td>#{{ comment.id }}</td><td>{{ comment.username }}</td>
                  <td><button class="table-link" type="button" @click="router.push(`/recipes/${comment.recipe_id}`)">{{ comment.recipe_title }}</button></td>
                  <td :title="comment.content">{{ truncate(comment.content) }}</td><td>{{ formatDate(comment.created_at) }}</td>
                  <td><button class="btn-action btn-delete" type="button" :disabled="actionId === `comment-${comment.id}`" @click="removeComment(comment)">Xóa</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <nav class="admin-pagination"><button :disabled="commentPagination.currentPage <= 1" @click="loadComments(commentPagination.currentPage - 1)">Trước</button><span>Trang {{ commentPagination.currentPage }} / {{ commentPagination.totalPages }}</span><button :disabled="commentPagination.currentPage >= commentPagination.totalPages" @click="loadComments(commentPagination.currentPage + 1)">Sau</button></nav>
        </section>

        <section v-else class="admin-section">
          <div class="admin-section-heading"><div><p>Kiểm duyệt</p><h2>Công Thức Chờ Duyệt</h2></div><span class="pending-count">{{ formatNumber(pendingPagination.totalItems) }} đang chờ</span></div>
          <div v-if="loading.pending" class="admin-empty">Đang tải danh sách kiểm duyệt...</div>
          <div v-else-if="pendingRecipes.length === 0" class="admin-empty">Không có công thức chờ duyệt.</div>
          <div v-else class="pending-list">
            <article v-for="recipe in pendingRecipes" :key="recipe.id" class="pending-card">
              <img :src="recipe.image_url || '/images/food-placeholder.jpg'" :alt="recipe.title" @error="$event.currentTarget.src = '/images/food-placeholder.jpg'" />
              <div class="pending-body">
                <div class="pending-meta"><span>{{ recipe.category_name }}</span><time>{{ formatDate(recipe.created_at) }}</time></div>
                <h3>{{ recipe.title }}</h3>
                <p>{{ recipe.description || 'Chưa có mô tả.' }}</p>
                <dl>
                  <div><dt>Người gửi</dt><dd>{{ recipe.submitter_name || 'Hệ thống' }}<small>{{ recipe.submitter_email }}</small></dd></div>
                  <div><dt>Thời gian</dt><dd>{{ Number(recipe.prep_time || 0) + Number(recipe.cook_time || 0) }} phút · {{ recipe.servings || '?' }} người</dd></div>
                  <div><dt>Tags</dt><dd>{{ recipe.tag_names || 'Không có' }}</dd></div>
                  <div class="wide"><dt>Nguyên liệu</dt><dd class="pre-line">{{ recipe.ingredient_summary || 'Chưa có nguyên liệu.' }}</dd></div>
                  <div class="wide"><dt>Hướng dẫn</dt><dd class="pre-line">{{ recipe.instructions }}</dd></div>
                </dl>
                <div class="pending-actions">
                  <button class="btn-action btn-approve" type="button" :disabled="Boolean(actionId)" @click="approveRecipe(recipe)">Duyệt</button>
                  <button class="btn-action btn-reject" type="button" :disabled="Boolean(actionId)" @click="startReject(recipe)">Từ Chối</button>
                  <button class="btn-action btn-edit" type="button" @click="router.push(`/recipes/${recipe.id}/edit`)">Xem / Sửa</button>
                </div>
                <form v-if="rejectingRecipeId === recipe.id" class="reject-form pending-reject" @submit.prevent="rejectRecipe(recipe)">
                  <input v-model="rejectionReasons[recipe.id]" maxlength="500" placeholder="Lý do từ chối bắt buộc..." />
                  <button type="submit" :disabled="actionId === `reject-${recipe.id}`">Xác nhận từ chối</button>
                  <button type="button" @click="rejectingRecipeId = null">Hủy</button>
                </form>
              </div>
            </article>
          </div>
          <nav class="admin-pagination"><button :disabled="pendingPagination.currentPage <= 1" @click="loadPending(pendingPagination.currentPage - 1)">Trước</button><span>Trang {{ pendingPagination.currentPage }} / {{ pendingPagination.totalPages }}</span><button :disabled="pendingPagination.currentPage >= pendingPagination.totalPages" @click="loadPending(pendingPagination.currentPage + 1)">Sau</button></nav>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-page {
  min-height: 100svh;
  padding-top: var(--nav-height);
  color: #e8e8ea;
  background: #0d0d0f;
}
.admin-hero {
  display: flex;
  min-height: 150px;
  padding: 30px clamp(20px, 4vw, 56px);
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid #242428;
  background: radial-gradient(circle at 20% 0%, rgba(229, 62, 62, 0.15), transparent 42%), #121214;
}
.admin-eyebrow, .admin-section-heading p { margin: 0 0 6px; color: #e85b5b; font-size: 11px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
.admin-hero h1 { color: #fff; font-size: clamp(32px, 5vw, 54px); }
.admin-hero p { color: #888890; }
.admin-welcome { display: grid; min-width: 190px; gap: 3px; padding: 15px 18px; border: 1px solid #2b2b30; border-radius: 12px; background: #18181b; }
.admin-welcome span, .admin-welcome small { color: #777780; font-size: 11px; }
.admin-welcome strong { color: #fff; font-size: 17px; }
.admin-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: calc(100svh - var(--nav-height) - 150px); }
.admin-sidebar { padding: 18px 0; border-right: 1px solid #242428; background: #101012; }
.sidebar-item { display: flex; width: 100%; min-height: 47px; padding: 10px 20px; align-items: center; gap: 10px; border: 0; border-left: 3px solid transparent; color: #909097; background: transparent; text-align: left; }
.sidebar-item:hover { color: #fff; background: #19191c; }
.sidebar-item.active { border-left-color: #e53e3e; color: #ff6d6d; background: #1a1a1d; }
.sidebar-badge { display: grid; min-width: 20px; height: 20px; margin-left: auto; padding: 0 5px; place-items: center; border-radius: 999px; color: #fff; background: #e53e3e; font-size: 10px; font-weight: 900; }
.admin-content { min-width: 0; padding: 28px clamp(18px, 3vw, 42px) 54px; }
.admin-section { display: grid; gap: 20px; }
.admin-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.admin-section-heading h2 { color: #fff; font-family: var(--font-sans); font-size: 25px; }
.admin-section-heading > span { color: #777780; font-size: 12px; }
.admin-section-heading > button, .admin-toolbar button { display: inline-flex; min-height: 39px; padding: 0 13px; align-items: center; gap: 6px; border: 1px solid #38383e; border-radius: 8px; color: #d4d4d8; background: #1c1c20; }
.admin-section-heading > button.primary { border-color: #e53e3e; color: #fff; background: #e53e3e; }
.stats-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.stat-card { display: grid; min-height: 142px; padding: 18px; place-items: center; align-content: center; gap: 4px; border: 1px solid #29292d; border-radius: 12px; color: #777780; background: #18181b; }
.stat-card:hover { border-color: #e53e3e; transform: translateY(-2px); }
.stat-card.alert { border-color: #7f1d1d; color: #ff7777; background: #201112; }
.stat-number { color: #fff; font-size: 31px; font-weight: 800; }
.stat-label { font-size: 12px; }
.activity-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.activity-card { overflow: hidden; border: 1px solid #29292d; border-radius: 12px; background: #151518; }
.activity-card header { display: flex; padding: 14px; align-items: center; justify-content: space-between; border-bottom: 1px solid #29292d; }
.activity-card header span { display: inline-flex; align-items: center; gap: 7px; color: #fff; font-size: 13px; font-weight: 800; }
.activity-card header button { border: 0; color: #ef6868; background: transparent; font-size: 10px; }
.activity-row { display: flex; width: 100%; padding: 12px 14px; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-bottom: 1px solid #222226; color: inherit; background: transparent; text-align: left; }
button.activity-row:hover { background: #1c1c20; }
.activity-row span { display: grid; min-width: 0; gap: 2px; }
.activity-row strong { overflow: hidden; color: #dddde0; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.activity-row small, .activity-row time { color: #777780; font-size: 9px; }
.activity-empty, .admin-empty { padding: 26px; color: #777780; text-align: center; }
.admin-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 190px auto; gap: 9px; }
.admin-toolbar.single { grid-template-columns: minmax(240px, 1fr) auto; }
.admin-toolbar input, .admin-toolbar select, .reject-form input, .user-actions select { min-width: 0; min-height: 40px; padding: 0 12px; border: 1px solid #303036; border-radius: 8px; outline: 0; color: #e4e4e7; background: #17171a; }
.admin-toolbar input:focus, .admin-toolbar select:focus, .reject-form input:focus { border-color: #e53e3e; box-shadow: 0 0 0 3px rgba(229, 62, 62, .1); }
.table-shell { overflow-x: auto; border: 1px solid #27272b; border-radius: 12px; background: #131315; }
.admin-table { width: 100%; min-width: 850px; border-collapse: collapse; }
.admin-table th { padding: 11px 12px; border-bottom: 1px solid #2b2b2f; color: #777780; background: #1a1a1d; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-align: left; text-transform: uppercase; }
.admin-table td { padding: 12px; border-bottom: 1px solid #222226; color: #cfcfd3; font-size: 12px; vertical-align: top; }
.admin-table tr:hover td { background: #18181b; }
.row-banned td { background: #211112 !important; }
.title-cell { display: grid; gap: 3px; min-width: 170px; }
.title-cell strong { color: #fff; }
.title-cell small { color: #777780; font-size: 9px; }
.status-pill, .role-pill { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 9px; font-weight: 900; }
.status-pill.approved { color: #86efac; background: rgba(20, 83, 45, .35); }
.status-pill.pending { color: #fde68a; background: rgba(146, 64, 14, .28); }
.status-pill.rejected { color: #fca5a5; background: rgba(127, 29, 29, .35); }
.role-pill.admin { color: #f0a5ff; background: rgba(107, 33, 168, .3); }
.role-pill.user { color: #93c5fd; background: rgba(30, 64, 175, .3); }
.action-row, .user-actions, .pending-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.btn-action { min-height: 29px; padding: 4px 9px; border: 1px solid; border-radius: 6px; background: transparent; font-size: 10px; }
.btn-edit { border-color: #48484e; color: #d1d1d5; }
.btn-delete, .btn-reject { border-color: #7f1d1d; color: #fca5a5; }
.btn-approve { border-color: #14532d; color: #86efac; }
.btn-ban { border-color: #92400e; color: #fde68a; }
.btn-action:disabled, .user-actions select:disabled { cursor: not-allowed; opacity: .42; }
.reject-form { display: grid; margin-top: 8px; grid-template-columns: minmax(180px, 1fr) auto auto; gap: 5px; }
.reject-form button { min-height: 36px; padding: 0 9px; border: 1px solid #45454a; border-radius: 7px; color: #ddd; background: #202024; font-size: 10px; }
.reject-form button[type="submit"] { border-color: #7f1d1d; color: #fca5a5; }
.user-actions select { min-height: 29px; padding: 0 7px; font-size: 10px; }
.table-link { padding: 0; border: 0; color: #ff7b7b; background: transparent; text-align: left; }
.table-message { padding: 35px !important; color: #777780 !important; text-align: center; }
.admin-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; color: #777780; font-size: 11px; }
.admin-pagination button { min-height: 34px; padding: 0 11px; border: 1px solid #34343a; border-radius: 7px; color: #ddd; background: #1a1a1d; }
.admin-pagination button:disabled { opacity: .35; }
.pending-count { color: #ff7777 !important; }
.pending-list { display: grid; gap: 14px; }
.pending-card { display: grid; grid-template-columns: 220px minmax(0, 1fr); overflow: hidden; border: 1px solid #2b2b30; border-radius: 14px; background: #161619; }
.pending-card > img { width: 100%; height: 100%; min-height: 330px; object-fit: cover; }
.pending-body { display: grid; padding: 20px; align-content: start; gap: 12px; }
.pending-meta { display: flex; align-items: center; justify-content: space-between; color: #777780; font-size: 10px; }
.pending-meta span { color: #ff8585; font-weight: 900; text-transform: uppercase; }
.pending-body h3 { color: #fff; font-family: var(--font-sans); font-size: 22px; }
.pending-body > p { color: #a0a0a7; line-height: 1.55; }
.pending-body dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin: 0; }
.pending-body dl > div { padding: 10px; border: 1px solid #29292e; border-radius: 8px; background: #121214; }
.pending-body dl > div.wide { grid-column: 1 / -1; }
.pending-body dt { margin-bottom: 4px; color: #676770; font-size: 9px; font-weight: 900; text-transform: uppercase; }
.pending-body dd { margin: 0; color: #d2d2d6; font-size: 11px; line-height: 1.5; }
.pending-body dd small { display: block; color: #777780; }
.pre-line { max-height: 150px; overflow: auto; white-space: pre-line; }
.pending-reject { grid-template-columns: minmax(220px, 1fr) auto auto; }
@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .activity-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .admin-page { padding-top: 0; }
  .admin-hero { align-items: flex-start; flex-direction: column; }
  .admin-welcome { width: 100%; }
  .admin-layout { grid-template-columns: 1fr; }
  .admin-sidebar { position: sticky; top: 0; z-index: 5; display: flex; overflow-x: auto; padding: 8px; border-right: 0; border-bottom: 1px solid #242428; }
  .sidebar-item { width: auto; min-width: max-content; border-bottom: 3px solid transparent; border-left: 0; }
  .sidebar-item.active { border-bottom-color: #e53e3e; border-left-color: transparent; }
  .admin-content { padding: 22px 14px 44px; }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .admin-toolbar, .admin-toolbar.single { grid-template-columns: 1fr; }
  .pending-card { grid-template-columns: 1fr; }
  .pending-card > img { min-height: 190px; max-height: 260px; }
  .pending-body dl { grid-template-columns: 1fr; }
  .reject-form, .pending-reject { grid-template-columns: 1fr; }
}
</style>

<style scoped>
.admin-page {
  --admin-bg: var(--bg);
  --admin-surface: var(--panel);
  --admin-surface-soft: var(--bg-soft);
  --admin-surface-strong: var(--panel-strong);
  --admin-field: var(--field-bg);
  --admin-text: var(--text);
  --admin-muted: var(--muted);
  --admin-muted-strong: var(--muted-strong);
  --admin-border: var(--line);
  --admin-accent: var(--accent);
  --admin-hover: var(--soft-surface);
  min-height: calc(100svh - var(--nav-height));
  padding-top: 0;
  color: var(--admin-text);
  background: var(--admin-bg);
}

.admin-hero {
  border-color: var(--admin-border);
  background:
    radial-gradient(circle at 20% 0%, rgba(216, 67, 77, 0.16), transparent 44%),
    var(--admin-surface-soft);
}

.admin-eyebrow,
.admin-section-heading p {
  color: var(--admin-accent);
}

.admin-hero h1,
.admin-welcome strong,
.admin-section-heading h2,
.stat-number,
.activity-card header span,
.title-cell strong,
.pending-body h3 {
  color: var(--admin-text);
}

.admin-hero p,
.admin-welcome span,
.admin-welcome small,
.admin-section-heading > span,
.stat-card,
.activity-row small,
.activity-row time,
.activity-empty,
.admin-empty,
.title-cell small,
.table-message,
.admin-pagination,
.pending-meta,
.pending-body dd small,
.pending-body dt {
  color: var(--admin-muted);
}

.admin-welcome,
.stat-card,
.activity-card,
.table-shell,
.pending-card {
  border-color: var(--admin-border);
  background: var(--admin-surface);
  box-shadow: var(--shadow);
}

.admin-layout {
  min-height: calc(100svh - var(--nav-height) - 150px);
}

.admin-sidebar {
  position: sticky;
  top: var(--nav-height);
  align-self: start;
  min-height: calc(100svh - var(--nav-height));
  border-color: var(--admin-border);
  background: var(--admin-surface-soft);
}

.sidebar-item {
  color: var(--admin-muted);
}

.sidebar-item:hover {
  color: var(--admin-text);
  background: var(--admin-hover);
}

.sidebar-item.active {
  border-left-color: var(--admin-accent);
  color: var(--admin-accent);
  background: rgba(216, 67, 77, 0.1);
}

.sidebar-badge,
.admin-section-heading > button.primary {
  color: #fff;
  background: var(--admin-accent);
}

.admin-section-heading > button,
.admin-toolbar button {
  border-color: var(--field-border);
  color: var(--admin-text);
  background: var(--admin-surface);
}

.admin-section-heading > button:hover,
.admin-toolbar button:hover {
  border-color: var(--admin-accent);
}

.stats-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.stat-card:hover {
  border-color: var(--admin-accent);
}

.stat-card.alert {
  border-color: rgba(216, 67, 77, 0.55);
  color: var(--admin-accent);
  background: rgba(216, 67, 77, 0.08);
}

.activity-card header,
.activity-row,
.admin-table th,
.admin-table td,
.pending-body dl > div {
  border-color: var(--admin-border);
}

.activity-card header button,
.table-link {
  color: var(--admin-accent);
}

button.activity-row:hover,
.admin-table tr:hover td {
  background: var(--admin-hover);
}

.activity-row strong,
.admin-table td,
.pending-body dd {
  color: var(--admin-muted-strong);
}

.admin-toolbar input,
.admin-toolbar select,
.reject-form input,
.user-actions select {
  border-color: var(--field-border);
  color: var(--admin-text);
  background: var(--admin-field);
}

.admin-toolbar input:focus,
.admin-toolbar select:focus,
.reject-form input:focus {
  border-color: var(--admin-accent);
}

.admin-table th {
  color: var(--admin-muted);
  background: var(--admin-surface-soft);
}

.row-banned td {
  background: rgba(216, 67, 77, 0.08) !important;
}

.btn-edit {
  border-color: var(--field-border);
  color: var(--admin-muted-strong);
}

.reject-form button,
.admin-pagination button {
  border-color: var(--field-border);
  color: var(--admin-text);
  background: var(--admin-surface-strong);
}

.pending-body > p {
  color: var(--admin-muted);
}

.table-message {
  color: var(--admin-muted) !important;
}

.pending-body dl > div {
  background: var(--admin-surface-soft);
}

@media (max-width: 760px) {
  .admin-sidebar {
    top: var(--nav-height);
    min-height: 0;
    border-color: var(--admin-border);
    background: var(--admin-surface-soft);
  }

  .admin-section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-section-heading > button {
    width: 100%;
    justify-content: center;
  }
}
</style>
