<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import L from 'leaflet'
import 'leaflet.markercluster'
import AppIcon from '../components/AppIcon.vue'
import streetImage from '../assets/street.jpg'
import { useFoodSpotStore } from '../stores/foodSpotStore'
import { useRestaurantStore } from '../stores/restaurantStore'
import { useUiStore } from '../stores/uiStore'

const HCMC_CENTER = [10.7769, 106.7009]
const categories = ['Phở', 'Bánh Mì', 'Cơm', 'Bún', 'Hải Sản', 'Café', 'Tráng Miệng', 'Khác']
const categoryLegend = [
  { label: 'Món Việt', color: '#f97316', icon: 'utensils' },
  { label: 'Bún · Phở', color: '#a66cc4', icon: 'bowl' },
  { label: 'Cafe · Trà', color: '#b87949', icon: 'store' },
  { label: 'Bánh · Tráng miệng', color: '#ef6f7b', icon: 'chef-hat' },
  { label: 'Hải sản', color: '#3b9dbc', icon: 'sparkles' },
]
const restaurantCategories = [
  'Ăn Vặt',
  'Bánh Canh',
  'Bánh Cuốn',
  'Bánh Mì',
  'Bánh Xèo',
  'Bò',
  'Bún',
  'Bún Bò',
  'Bún Đậu',
  'Café',
  'Cháo',
  'Chè',
  'Cơm',
  'Cơm Gà',
  'Cơm Tấm',
  'Dimsum',
  'Đặc Sản',
  'Gà Nướng',
  'Hải Sản',
  'Hủ Tiếu',
  'Lẩu',
  'Mì',
  'Nem Nướng',
  'Nhà Hàng',
  'Phở',
  'Tráng Miệng',
  'Xôi',
]
const districts = [
  'Quận 1',
  'Quận 2',
  'Quận 3',
  'Quận 4',
  'Quận 5',
  'Quận 6',
  'Quận 7',
  'Quận 8',
  'Quận 9',
  'Quận 10',
  'Quận 11',
  'Quận 12',
  'Bình Thạnh',
  'Bình Tân',
  'Gò Vấp',
  'Phú Nhuận',
  'Tân Bình',
  'Tân Phú',
  'Thủ Đức',
  'Thành phố Thủ Đức',
  'Bình Chánh',
  'Cần Giờ',
  'Củ Chi',
  'Hóc Môn',
  'Nhà Bè',
]

const foodSpotStore = useFoodSpotStore()
const restaurantStore = useRestaurantStore()
const uiStore = useUiStore()
const route = useRoute()
const initialDish = typeof route.query.dish === 'string' ? route.query.dish.trim() : ''
const initialMode = ['personal', 'community', 'stats'].includes(route.query.mode)
  ? route.query.mode
  : 'personal'
const initialRecipeId = /^[1-9]\d*$/.test(String(route.query.recipe_id || ''))
  ? Number(route.query.recipe_id)
  : null
const mapElement = ref(null)
const mapInitialised = ref(false)
const mapMode = ref(initialMode)
const sidebarMode = ref('list')
const showRestaurants = ref(true)
const showPersonalSpots = ref(true)
const restaurantFiltersOpen = ref(false)
const pickingMode = ref(false)
const editingSpotId = ref(null)
const submitting = ref(false)
const deletingSpotId = ref(null)
const filters = reactive({ district: '', category: '', rating: '' })
const communityFilters = reactive({ district: '', category: '' })
const communitySearch = ref(initialDish)
const personalSearch = ref('')
const restaurantFilters = reactive({
  district: '',
  category: '',
  search: initialDish,
  min_rating: '',
})
const formErrors = reactive({})
const form = reactive(emptyForm())

let map = null
let markerCluster = null
let restaurantCluster = null
let previewMarker = null
let filterTimer = 0
let communitySearchTimer = 0
let restaurantSearchTimer = 0
let popupTimer = 0
const markersById = new Map()

const selectedSpot = computed(() => foodSpotStore.selectedSpot)
const isEditing = computed(() => editingSpotId.value !== null)
const isCommunityMode = computed(() => mapMode.value === 'community')
const spotLayerLabel = computed(() =>
  isCommunityMode.value ? 'Điểm Cộng Đồng' : 'Địa Điểm Của Tôi',
)
const visibleSpots = computed(() =>
  isCommunityMode.value ? foodSpotStore.communitySpots : foodSpotStore.spots,
)
const hasActiveFilters = computed(() =>
  Boolean(filters.district || filters.category || filters.rating),
)
const hasCommunityFilters = computed(() =>
  Boolean(communitySearch.value || communityFilters.district || communityFilters.category),
)
const displayedPersonalSpots = computed(() => {
  const query = personalSearch.value.trim().toLocaleLowerCase('vi')
  if (!query) return foodSpotStore.spots

  return foodSpotStore.spots.filter((spot) =>
    [spot.name, spot.dish_name, spot.category, spot.district]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('vi').includes(query)),
  )
})
const featuredSpot = computed(() => {
  if (mapMode.value !== 'personal') return null
  return selectedSpot.value || displayedPersonalSpots.value[0] || null
})
const sidebarCount = computed(() => {
  if (mapMode.value === 'personal') return displayedPersonalSpots.value.length
  return visibleSpots.value.length
})
const sidebarKicker = computed(() => {
  if (mapMode.value === 'community') return 'FoodStory cộng đồng'
  if (mapMode.value === 'stats') return 'Hành trình của bạn'
  return 'FoodStory cá nhân'
})
const sidebarTitle = computed(() => {
  if (mapMode.value === 'community') return 'Bản Đồ Ẩm Thực Cộng Đồng'
  if (mapMode.value === 'stats') return 'Thống Kê Ẩm Thực'
  return 'Bản Đồ Ẩm Thực Của Tôi'
})
const communityResultText = computed(() => {
  const count = foodSpotStore.communitySpots.length
  const query = communitySearch.value.trim()
  if (!query) return `${count} địa điểm từ cộng đồng`
  if (count === 0) return `Không tìm thấy địa điểm nào cho "${query}"`
  return `${count} kết quả cho "${query}"`
})
const personalStats = computed(() => {
  const spots = foodSpotStore.spots
  const ratedSpots = spots.filter((spot) => Number(spot.rating) > 0)
  const averageRating = ratedSpots.length
    ? ratedSpots.reduce((sum, spot) => sum + Number(spot.rating), 0) / ratedSpots.length
    : 0

  const createRanking = (field) => {
    const counts = new Map()
    spots.forEach((spot) => {
      const label = String(spot[field] || '').trim()
      if (label) counts.set(label, (counts.get(label) || 0) + 1)
    })
    return [...counts.entries()]
      .map(([label, count]) => ({
        label,
        count,
        percentage: spots.length ? Math.round((count / spots.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'))
      .slice(0, 3)
  }

  const districtsRanking = createRanking('district')
  const dishesRanking = createRanking('dish_name')
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = spots.filter((spot) => Number(spot.rating) === rating).length
    return {
      rating,
      count,
      percentage: spots.length ? Math.round((count / spots.length) * 100) : 0,
    }
  })

  return {
    total: spots.length,
    averageRating,
    favoriteDistrict: districtsRanking[0]?.label || 'Chưa có',
    districtsRanking,
    dishesRanking,
    ratingDistribution,
    recent: [...spots]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 3),
  }
})

function emptyForm() {
  return {
    name: '',
    dish_name: '',
    category: '',
    district: '',
    latitude: '',
    longitude: '',
    rating: null,
    notes: '',
    tags: '',
    recipe_id: null,
  }
}

function resetForm() {
  Object.assign(form, emptyForm())
  Object.keys(formErrors).forEach((key) => delete formErrors[key])
  editingSpotId.value = null
  clearPreviewMarker()
  stopPicking()
}

function markerColor(rating) {
  const value = Number(rating || 0)
  if (value === 5) return '#f7b731'
  if (value === 4) return '#43aa8b'
  if (value === 3) return '#4d96ff'
  if (value > 0) return '#8b9098'
  return '#e6504f'
}

function normalizedCategory(category) {
  return String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
}

function categoryColor(category) {
  const text = normalizedCategory(category)
  if (text.includes('pho') || text.includes('bun')) return '#a66cc4'
  if (text.includes('cafe') || text.includes('ca phe') || text.includes('tra')) return '#b87949'
  if (text.includes('banh') || text.includes('trang') || text.includes('che')) return '#ef6f7b'
  if (text.includes('hai')) return '#3b9dbc'
  if (text.includes('com') || text.includes('mi')) return '#74a05c'
  return '#f97316'
}

function restaurantCategoryTheme(category) {
  const text = normalizedCategory(category)
  if (text.includes('pho')) {
    return {
      emoji: '🍜',
      color: '#a66cc4',
      gradient: 'linear-gradient(135deg, #c084fc 0%, #7e3aad 100%)',
    }
  }
  if (text.includes('com tam')) {
    return {
      emoji: '🍚',
      color: '#74a05c',
      gradient: 'linear-gradient(135deg, #9fca72 0%, #4d7f3f 100%)',
    }
  }
  if (text.includes('banh mi')) {
    return {
      emoji: '🥖',
      color: '#d9862f',
      gradient: 'linear-gradient(135deg, #f6b04f 0%, #c5661f 100%)',
    }
  }
  if (text.includes('hai san')) {
    return {
      emoji: '🦐',
      color: '#3b9dbc',
      gradient: 'linear-gradient(135deg, #58c4dd 0%, #247b9c 100%)',
    }
  }
  if (text.includes('lau')) {
    return {
      emoji: '🫕',
      color: '#e6504f',
      gradient: 'linear-gradient(135deg, #ff8a65 0%, #c7362f 100%)',
    }
  }
  if (text.includes('cafe') || text.includes('ca phe')) {
    return {
      emoji: '☕',
      color: '#b87949',
      gradient: 'linear-gradient(135deg, #d59b66 0%, #7a4a2c 100%)',
    }
  }
  if (text.includes('dimsum')) {
    return {
      emoji: '🥟',
      color: '#ef6f7b',
      gradient: 'linear-gradient(135deg, #ff9aa5 0%, #d94b60 100%)',
    }
  }
  return {
    emoji: '🍽️',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
  }
}

function communityMarkerColor(rating) {
  const value = Number(rating || 0)
  if (value >= 5) return '#3d9cff'
  if (value >= 4) return '#4f8fe8'
  if (value >= 3) return '#5f83cf'
  return '#6f7fa8'
}

function ratingText(rating) {
  const value = Number(rating || 0)
  return value ? `${'★'.repeat(value)}${'☆'.repeat(5 - value)}` : 'Chưa đánh giá'
}

function markerIcon(spot, preview = false, community = false) {
  const color = preview
    ? '#f4a261'
    : community
      ? communityMarkerColor(spot.rating)
      : categoryColor(spot.category)
  const glyph = preview
    ? '<b>+</b>'
    : community
      ? '<b>C</b>'
      : `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4v7M11 4v7M7 8h4M9 11v9M17 4v16M17 4c2.4 1.5 3.5 3.6 3.5 6H17" />
        </svg>`
  return L.divIcon({
    className: 'food-map-marker-shell',
    html: `<span class="food-map-marker-dot${preview ? ' preview' : ''}${community ? ' community' : ''}" style="--marker-color:${color}">${glyph}</span>`,
    iconSize: community ? [34, 42] : [40, 50],
    iconAnchor: community ? [17, 40] : [20, 48],
    popupAnchor: [0, -43],
  })
}

function restaurantMarkerIcon(restaurant) {
  const theme = restaurantCategoryTheme(restaurant?.category)
  return L.divIcon({
    className: 'restaurant-marker-shell',
    html: `<div class="restaurant-marker" style="--restaurant-color:${theme.color};--restaurant-gradient:${theme.gradient}"><span class="restaurant-marker-emoji" aria-hidden="true">${theme.emoji}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 38],
    popupAnchor: [0, -38],
  })
}

function restaurantRatingText(rating) {
  const value = Math.min(Math.max(Number(rating || 0), 0), 5)
  const filled = Math.floor(value)
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}  ${value.toFixed(1)}`
}

function restaurantPopupContent(restaurant) {
  const theme = restaurantCategoryTheme(restaurant.category)
  const container = document.createElement('div')
  container.className = 'restaurant-popup'
  container.style.setProperty('--restaurant-color', theme.color)
  container.style.setProperty('--restaurant-gradient', theme.gradient)

  const banner = document.createElement('div')
  banner.className = 'restaurant-popup-banner'
  banner.setAttribute('aria-label', restaurant.category || 'Nhà hàng')

  const emoji = document.createElement('span')
  emoji.className = 'restaurant-popup-emoji'
  emoji.textContent = theme.emoji
  banner.append(emoji)

  const body = document.createElement('div')
  body.className = 'restaurant-popup-body'

  const name = document.createElement('strong')
  name.textContent = restaurant.name

  const address = document.createElement('p')
  address.className = 'restaurant-popup-address'
  address.textContent = restaurant.address || 'Chưa có địa chỉ'

  const meta = document.createElement('div')
  meta.className = 'restaurant-popup-meta'

  const district = document.createElement('span')
  district.textContent = restaurant.district || 'TP. Hồ Chí Minh'

  const price = document.createElement('span')
  const priceLevel = Math.min(String(restaurant.price_range || '').length, 3)
  price.className = `restaurant-popup-price price-${priceLevel || 1}`
  price.textContent = restaurant.price_range || 'Chưa rõ giá'
  meta.append(district, price)

  const rating = document.createElement('span')
  rating.className = 'restaurant-popup-rating'
  rating.textContent = restaurantRatingText(restaurant.avg_rating)

  const description = document.createElement('p')
  description.className = 'restaurant-popup-description'
  description.textContent = restaurant.description || 'Chưa có mô tả cho nhà hàng này.'

  const directions = document.createElement('button')
  directions.type = 'button'
  directions.className = 'restaurant-popup-directions'
  directions.textContent = 'Chỉ Đường'
  directions.addEventListener('click', (event) => {
    event.stopPropagation()
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${restaurant.latitude},${restaurant.longitude}`,
      '_blank',
      'noopener,noreferrer',
    )
  })

  body.append(name, address, meta, rating, description, directions)
  container.append(banner, body)
  return container
}

function popupContent(spot, community = false) {
  const container = document.createElement('div')
  container.className = 'food-map-popup'

  const category = document.createElement('span')
  category.className = 'food-map-popup-kicker'
  category.textContent = spot.category || 'Địa điểm ẩm thực'

  const name = document.createElement('strong')
  name.textContent = spot.name

  const dish = document.createElement('p')
  dish.textContent = spot.dish_name || 'Chưa thêm tên món ăn'

  const rating = document.createElement('span')
  rating.className = 'food-map-popup-rating'
  rating.textContent = ratingText(spot.rating)

  const location = document.createElement('span')
  location.className = 'food-map-popup-location'
  location.textContent = spot.district || 'TP. Hồ Chí Minh'

  if (community) {
    container.classList.add('community')
    container.append(category, name, dish, location, rating)
    return container
  }

  const actions = document.createElement('div')
  actions.className = 'food-map-popup-actions'

  const detailButton = document.createElement('button')
  detailButton.type = 'button'
  detailButton.textContent = 'Xem Chi Tiết'
  detailButton.addEventListener('click', () => showDetail(spot, false))

  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'danger'
  deleteButton.textContent = 'Xoá'
  deleteButton.addEventListener('click', () => removeSpot(spot))

  actions.append(detailButton, deleteButton)
  container.append(category, name, dish, location, rating, actions)
  return container
}

function syncLayerVisibility() {
  if (!map) return

  if (markerCluster) {
    if (showPersonalSpots.value && !map.hasLayer(markerCluster)) {
      map.addLayer(markerCluster)
    } else if (!showPersonalSpots.value && map.hasLayer(markerCluster)) {
      map.removeLayer(markerCluster)
    }
  }

  if (restaurantCluster) {
    if (showRestaurants.value && !map.hasLayer(restaurantCluster)) {
      map.addLayer(restaurantCluster)
    } else if (!showRestaurants.value && map.hasLayer(restaurantCluster)) {
      map.removeLayer(restaurantCluster)
    }
  }
}

function renderMarkers() {
  if (!map || !markerCluster) return

  const community = isCommunityMode.value
  markerCluster.clearLayers()
  markersById.clear()
  visibleSpots.value.forEach((spot) => {
    if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) return

    const marker = L.marker([spot.latitude, spot.longitude], {
      icon: markerIcon(spot, false, community),
      title: spot.name,
      opacity: community ? 0.75 : 1,
    })
    marker.bindPopup(popupContent(spot, community), {
      className: 'food-map-leaflet-popup',
      maxWidth: 280,
    })
    markerCluster.addLayer(marker)
    markersById.set(spot.id, marker)
  })
  syncLayerVisibility()
}

function renderRestaurantMarkers() {
  if (!map || !restaurantCluster) return

  restaurantCluster.clearLayers()
  restaurantStore.restaurants.forEach((restaurant) => {
    if (!Number.isFinite(restaurant.latitude) || !Number.isFinite(restaurant.longitude)) return

    const marker = L.marker([restaurant.latitude, restaurant.longitude], {
      icon: restaurantMarkerIcon(restaurant),
      title: restaurant.name,
      zIndexOffset: 200,
    })
    marker.bindPopup(restaurantPopupContent(restaurant), {
      className: 'restaurant-leaflet-popup',
      maxWidth: 300,
    })
    restaurantCluster.addLayer(marker)
  })
  syncLayerVisibility()
}

function initialiseMap() {
  if (mapInitialised.value || !mapElement.value) return

  map = L.map(mapElement.value, {
    center: HCMC_CENTER,
    zoom: 13,
    zoomControl: false,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
    spiderfyOnMaxZoom: true,
  })
  restaurantCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      return L.divIcon({
        html: `<div class="restaurant-cluster">${cluster.getChildCount()}</div>`,
        className: 'restaurant-cluster-shell',
        iconSize: [36, 36],
      })
    },
  })
  syncLayerVisibility()
  map.on('click', handleMapClick)
  mapInitialised.value = true
  window.setTimeout(() => map?.invalidateSize(), 0)
}

function handleMapClick(event) {
  if (!pickingMode.value) return

  form.latitude = event.latlng.lat.toFixed(7)
  form.longitude = event.latlng.lng.toFixed(7)
  delete formErrors.coordinates
  showPreviewMarker(event.latlng.lat, event.latlng.lng)
  stopPicking()
}

function showPreviewMarker(latitude, longitude) {
  clearPreviewMarker()
  if (!map) return

  previewMarker = L.marker([latitude, longitude], {
    icon: markerIcon({}, true),
    zIndexOffset: 1000,
  })
    .addTo(map)
    .bindTooltip('Vị trí đã chọn', { direction: 'top', offset: [0, -16] })
}

function clearPreviewMarker() {
  if (map && previewMarker) map.removeLayer(previewMarker)
  previewMarker = null
}

function startPicking() {
  pickingMode.value = true
  mapElement.value?.classList.add('is-picking')
  map?.closePopup()
}

function stopPicking() {
  pickingMode.value = false
  mapElement.value?.classList.remove('is-picking')
}

async function fetchSpots() {
  try {
    await foodSpotStore.fetchSpots({
      district: filters.district || undefined,
      category: filters.category || undefined,
      rating: filters.rating || undefined,
    })
    renderMarkers()
  } catch (error) {
    uiStore.setError(error.message, {
      title: 'Không thể tải bản đồ',
      eyebrow: 'Bản đồ ẩm thực',
    })
  }
}

async function fetchAllPersonalSpots() {
  try {
    await foodSpotStore.fetchSpots()
    renderMarkers()
  } catch (error) {
    uiStore.setError(error.message, {
      title: 'Không thể tải thống kê',
      eyebrow: 'Bản đồ ẩm thực',
    })
  }
}

async function fetchCommunitySpots() {
  try {
    await foodSpotStore.fetchCommunitySpots({
      dish: communitySearch.value.trim() || undefined,
      district: communityFilters.district || undefined,
      category: communityFilters.category || undefined,
    })
    renderMarkers()
  } catch (error) {
    uiStore.setError(error.message, {
      title: 'Không thể tải cộng đồng',
      eyebrow: 'Bản đồ ẩm thực',
    })
  }
}

async function fetchRestaurants() {
  try {
    await restaurantStore.fetchRestaurants({
      district: restaurantFilters.district || undefined,
      category: restaurantFilters.category || undefined,
      search: restaurantFilters.search.trim() || undefined,
      min_rating: restaurantFilters.min_rating || undefined,
    })
    renderRestaurantMarkers()
  } catch (error) {
    uiStore.setError(error.message, {
      title: 'Không thể tải nhà hàng',
      eyebrow: 'Lớp nhà hàng',
    })
  }
}

async function applyRestaurantFilters() {
  window.clearTimeout(restaurantSearchTimer)
  await fetchRestaurants()
}

async function clearRestaurantFilters() {
  Object.assign(restaurantFilters, {
    district: '',
    category: '',
    search: '',
    min_rating: '',
  })
  await nextTick()
  window.clearTimeout(restaurantSearchTimer)
  await fetchRestaurants()
}

async function setMapMode(mode) {
  if (!['personal', 'community', 'stats'].includes(mode)) return

  mapMode.value = mode
  sidebarMode.value = 'list'
  foodSpotStore.setSelectedSpot(null)
  stopPicking()
  clearPreviewMarker()
  map?.closePopup()
  markerCluster?.clearLayers()

  if (mode === 'community') {
    await fetchCommunitySpots()
  } else if (mode === 'stats') {
    await fetchAllPersonalSpots()
  } else {
    await fetchSpots()
  }
}

function openAddForm(prefill = {}) {
  foodSpotStore.setSelectedSpot(null)
  resetForm()
  Object.assign(form, prefill)
  sidebarMode.value = 'add'
}

async function addFromRecipe() {
  await setMapMode('personal')
  openAddForm({
    dish_name: initialDish,
    recipe_id: initialRecipeId,
  })
}

async function addFromStats() {
  await setMapMode('personal')
  openAddForm()
}

function cancelForm() {
  resetForm()
  sidebarMode.value = 'list'
}

function editSpot(spot) {
  editingSpotId.value = spot.id
  Object.assign(form, {
    name: spot.name || '',
    dish_name: spot.dish_name || '',
    category: spot.category || '',
    district: spot.district || '',
    latitude: String(spot.latitude ?? ''),
    longitude: String(spot.longitude ?? ''),
    rating: spot.rating || null,
    notes: spot.notes || '',
    tags: spot.tags || '',
    recipe_id: spot.recipe_id || null,
  })
  Object.keys(formErrors).forEach((key) => delete formErrors[key])
  showPreviewMarker(spot.latitude, spot.longitude)
  sidebarMode.value = 'add'
}

function validateForm() {
  Object.keys(formErrors).forEach((key) => delete formErrors[key])
  if (!form.name.trim()) formErrors.name = 'Vui lòng nhập tên địa điểm.'

  const latitude = Number(form.latitude)
  const longitude = Number(form.longitude)
  if (
    form.latitude === '' ||
    form.longitude === '' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    formErrors.coordinates = 'Vui lòng chọn vị trí trên bản đồ.'
  }
  return Object.keys(formErrors).length === 0
}

function payload() {
  return {
    name: form.name.trim(),
    dish_name: form.dish_name.trim() || null,
    category: form.category || null,
    district: form.district || null,
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    rating: form.rating || null,
    notes: form.notes.trim() || null,
    tags: form.tags.trim() || null,
    recipe_id: form.recipe_id || null,
  }
}

async function submitForm() {
  if (!validateForm() || submitting.value) return

  const wasEditing = isEditing.value
  submitting.value = true
  try {
    const spot = wasEditing
      ? await foodSpotStore.updateSpot(editingSpotId.value, payload())
      : await foodSpotStore.addSpot(payload())

    clearPreviewMarker()
    editingSpotId.value = null
    foodSpotStore.setSelectedSpot(spot)
    sidebarMode.value = 'list'
    renderMarkers()
    focusSpot(spot)
    uiStore.setSuccess(
      wasEditing ? 'Địa điểm đã được cập nhật.' : 'Địa điểm mới đã được lưu.',
      {
        title: wasEditing ? 'Cập nhật thành công' : 'Đã thêm vào bản đồ',
        eyebrow: 'Bản đồ ẩm thực cá nhân',
        icon: 'map-pin',
      },
    )
  } catch (error) {
    formErrors.submit = error.message
  } finally {
    submitting.value = false
  }
}

function focusSpot(spot, openPopup = true) {
  if (!map || !spot) return
  map.flyTo([spot.latitude, spot.longitude], 16, { duration: 0.8 })
  if (openPopup) {
    window.clearTimeout(popupTimer)
    popupTimer = window.setTimeout(() => {
      const marker = markersById.get(spot.id)
      if (!marker || !markerCluster) return
      markerCluster.zoomToShowLayer(marker, () => marker.openPopup())
    }, 500)
  }
}

function showDetail(spot, moveMap = true) {
  foodSpotStore.setSelectedSpot(spot)
  sidebarMode.value = 'list'
  stopPicking()
  clearPreviewMarker()
  if (moveMap) focusSpot(spot)
}

function backToList() {
  foodSpotStore.setSelectedSpot(null)
  sidebarMode.value = 'list'
  stopPicking()
  clearPreviewMarker()
  map?.closePopup()
}

async function removeSpot(spot) {
  if (!spot || deletingSpotId.value) return
  if (!window.confirm(`Xoá "${spot.name}" khỏi bản đồ ẩm thực của bạn?`)) return

  deletingSpotId.value = spot.id
  try {
    await foodSpotStore.removeSpot(spot.id)
    renderMarkers()
    sidebarMode.value = 'list'
    uiStore.setSuccess('Địa điểm đã được xoá khỏi bản đồ.', {
      title: 'Đã xoá địa điểm',
      eyebrow: 'Bản đồ ẩm thực cá nhân',
      icon: 'trash',
    })
  } catch (error) {
    uiStore.setError(error.message, {
      title: 'Không thể xoá địa điểm',
      eyebrow: 'Bản đồ ẩm thực',
    })
  } finally {
    deletingSpotId.value = null
  }
}

function clearFilters() {
  Object.assign(filters, { district: '', category: '', rating: '' })
}

function clearCommunityFilters() {
  communitySearch.value = ''
  Object.assign(communityFilters, { district: '', category: '' })
}

function splitTags(tags) {
  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

watch(
  () => [filters.district, filters.category, filters.rating],
  () => {
    if (mapMode.value !== 'personal') return
    window.clearTimeout(filterTimer)
    filterTimer = window.setTimeout(fetchSpots, 180)
  },
)

watch(
  () => [communitySearch.value, communityFilters.district, communityFilters.category],
  () => {
    if (mapMode.value !== 'community') return
    window.clearTimeout(communitySearchTimer)
    communitySearchTimer = window.setTimeout(fetchCommunitySpots, 400)
  },
)

watch(
  () => restaurantFilters.search,
  () => {
    window.clearTimeout(restaurantSearchTimer)
    restaurantSearchTimer = window.setTimeout(fetchRestaurants, 400)
  },
)

watch([showRestaurants, showPersonalSpots], () => syncLayerVisibility())

watch(
  () => foodSpotStore.spots,
  () => {
    if (mapMode.value !== 'community') renderMarkers()
  },
  { deep: true },
)

watch(
  () => foodSpotStore.communitySpots,
  () => {
    if (mapMode.value === 'community') renderMarkers()
  },
  { deep: true },
)

watch(
  () => restaurantStore.restaurants,
  () => renderRestaurantMarkers(),
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  initialiseMap()
  if (mapMode.value === 'community') {
    try {
      await foodSpotStore.fetchSpots()
    } catch {
      // Community results can still load if personal statistics are unavailable.
    }
    await fetchCommunitySpots()
  } else if (mapMode.value === 'stats') {
    await fetchAllPersonalSpots()
  } else {
    await fetchSpots()
  }
  await fetchRestaurants()
})

onBeforeUnmount(() => {
  window.clearTimeout(filterTimer)
  window.clearTimeout(communitySearchTimer)
  window.clearTimeout(restaurantSearchTimer)
  window.clearTimeout(popupTimer)
  stopPicking()
  markersById.clear()
  markerCluster = null
  restaurantCluster = null
  previewMarker = null

  if (map) {
    map.off()
    map.remove()
    map = null
    mapInitialised.value = false
  }
})
</script>

<template>
  <section class="food-map-page" :class="`mode-${mapMode}`">
    <aside class="food-map-sidebar" aria-label="Quản lý bản đồ ẩm thực">
      <header class="food-map-sidebar-header">
        <div>
          <p class="food-map-kicker">{{ sidebarKicker }}</p>
          <h1>{{ sidebarTitle }}</h1>
          <p class="food-map-storyline">Mỗi quán ăn là một câu chuyện</p>
          <p class="food-map-layer-counts">
            {{ restaurantStore.restaurants.length }} nhà hàng
            <span>•</span>
            {{ foodSpotStore.spots.length }} địa điểm của tôi
          </p>
        </div>
        <span class="food-map-count">{{ sidebarCount }}</span>
      </header>

      <nav class="food-map-mode-toggle" aria-label="Chế độ bản đồ">
        <button
          v-for="mode in [
            ['personal', 'Của Tôi'],
            ['community', 'Cộng Đồng'],
            ['stats', 'Thống Kê'],
          ]"
          :key="mode[0]"
          type="button"
          :class="{ active: mapMode === mode[0] }"
          :aria-pressed="mapMode === mode[0]"
          @click="setMapMode(mode[0])"
        >
          {{ mode[1] }}
        </button>
      </nav>

      <section class="food-map-layer-toggle" aria-label="Lớp hiển thị trên bản đồ">
        <span>Hiện trên bản đồ:</span>
        <div>
          <label class="restaurant" :class="{ active: showRestaurants }">
            <input v-model="showRestaurants" type="checkbox" />
            <span aria-hidden="true">{{ showRestaurants ? '✓' : '' }}</span>
            Nhà Hàng
          </label>
          <label class="personal" :class="{ active: showPersonalSpots }">
            <input v-model="showPersonalSpots" type="checkbox" />
            <span aria-hidden="true">{{ showPersonalSpots ? '✓' : '' }}</span>
            {{ spotLayerLabel }}
          </label>
        </div>
        <small v-if="restaurantStore.loading">Đang tải dữ liệu nhà hàng...</small>
        <small v-else-if="restaurantStore.error" class="error">{{ restaurantStore.error }}</small>
        <small v-else-if="restaurantStore.restaurants.length === 0">
          Chưa có nhà hàng nào để hiển thị trên bản đồ.
        </small>
      </section>

      <section v-if="initialDish && mapMode === 'community'" class="food-map-recipe-banner">
        <p>Đang xem: <strong>"{{ initialDish }}"</strong></p>
        <span>Địa điểm từ cộng đồng FoodStory</span>
        <button type="button" @click="addFromRecipe">
          <AppIcon name="map-pin" size="16" />
          Thêm Chỗ Tôi Hay Ăn
        </button>
      </section>

      <div v-if="sidebarMode === 'list' && mapMode === 'personal'" class="food-map-sidebar-body">
        <label class="food-map-personal-search">
          <span class="sr-only">Tìm trong địa điểm của tôi</span>
          <AppIcon name="search" size="17" />
          <input
            v-model="personalSearch"
            type="search"
            maxlength="150"
            placeholder="Tìm quán ăn, món ngon, địa điểm..."
          />
          <button
            v-if="personalSearch"
            type="button"
            aria-label="Xoá nội dung tìm kiếm"
            @click="personalSearch = ''"
          >
            ×
          </button>
        </label>

        <section class="food-map-filters" aria-label="Bộ lọc địa điểm">
          <div class="food-map-filter-heading">
            <span><AppIcon name="filter" size="17" /> Bộ lọc trải nghiệm</span>
            <button v-if="hasActiveFilters" type="button" @click="clearFilters">Đặt lại</button>
          </div>
          <div class="food-map-filter-grid">
            <label>
              <span>Quận/Huyện</span>
              <select v-model="filters.district">
                <option value="">Tất cả khu vực</option>
                <option v-for="item in districts" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Danh mục</span>
              <select v-model="filters.category">
                <option value="">Tất cả món</option>
                <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Đánh giá tối thiểu</span>
              <select v-model="filters.rating">
                <option value="">Mọi đánh giá</option>
                <option v-for="value in 5" :key="value" :value="value">
                  {{ value }} sao trở lên
                </option>
              </select>
            </label>
          </div>
        </section>

        <button class="food-map-primary-action" type="button" @click="openAddForm">
          <AppIcon name="map-pin" size="19" />
          Thêm Địa Điểm Mới
        </button>

        <div v-if="foodSpotStore.loading" class="food-map-state" role="status">
          <span class="food-map-spinner"></span>
          <p>Đang tải những địa điểm của bạn...</p>
        </div>
        <div v-else-if="foodSpotStore.error" class="food-map-state" role="alert">
          <p>{{ foodSpotStore.error }}</p>
          <button type="button" @click="fetchSpots">Thử lại</button>
        </div>
        <div v-else-if="foodSpotStore.spots.length === 0" class="food-map-state">
          <span class="food-map-empty-icon"><AppIcon name="map-pin" size="30" /></span>
          <h2>Chưa có điểm dừng chân</h2>
          <p>Bạn chưa có địa điểm nào. Hãy thêm địa điểm đầu tiên!</p>
          <button type="button" @click="openAddForm">Thêm Ngay</button>
        </div>
        <div v-else-if="displayedPersonalSpots.length === 0" class="food-map-state compact">
          <span class="food-map-empty-icon"><AppIcon name="search" size="26" /></span>
          <p>Không tìm thấy địa điểm phù hợp với "{{ personalSearch }}".</p>
          <button type="button" @click="personalSearch = ''">Xoá tìm kiếm</button>
        </div>

        <div v-else class="food-map-spot-list">
          <button
            v-for="(spot, index) in displayedPersonalSpots"
            :key="spot.id"
            type="button"
            class="food-map-spot-card"
            :class="{ active: featuredSpot?.id === spot.id }"
            @click="showDetail(spot)"
          >
            <span class="food-map-card-rank">{{ index + 1 }}</span>
            <span class="food-map-card-thumb" :style="{ backgroundImage: `url(${streetImage})` }"></span>
            <span class="food-map-card-copy">
              <span class="food-map-card-topline">
                <strong>{{ spot.name }}</strong>
                <small aria-label="Đánh giá">{{ Number(spot.rating || 0).toFixed(1) }} ★</small>
              </span>
              <span>{{ spot.dish_name || 'Chưa thêm món ăn' }}</span>
              <span class="food-map-card-meta">
                <em v-if="spot.category" :style="{ '--spot-color': categoryColor(spot.category) }">
                  {{ spot.category }}
                </em>
                <small><AppIcon name="map-pin" size="13" /> {{ spot.district || 'TP. Hồ Chí Minh' }}</small>
              </span>
            </span>
          </button>
        </div>

        <section class="restaurant-filter-panel" :class="{ open: restaurantFiltersOpen }">
          <button
            class="restaurant-filter-toggle"
            type="button"
            :aria-expanded="restaurantFiltersOpen"
            @click="restaurantFiltersOpen = !restaurantFiltersOpen"
          >
            <span>
              <AppIcon name="store" size="17" />
              Lọc Nhà Hàng Trên Bản Đồ
            </span>
            <span aria-hidden="true">{{ restaurantFiltersOpen ? '▲' : '▼' }}</span>
          </button>

          <div v-if="restaurantFiltersOpen" class="restaurant-filter-content">
            <div class="restaurant-filter-grid">
              <label>
                <span>Quận/Huyện</span>
                <select v-model="restaurantFilters.district">
                  <option value="">Tất cả khu vực</option>
                  <option v-for="item in districts" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label>
                <span>Danh mục</span>
                <select v-model="restaurantFilters.category">
                  <option value="">Tất cả danh mục</option>
                  <option v-for="item in restaurantCategories" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label class="wide">
                <span>Tìm kiếm</span>
                <input
                  v-model="restaurantFilters.search"
                  type="search"
                  maxlength="150"
                  placeholder="Tên nhà hàng, món ăn..."
                />
              </label>
              <label class="wide">
                <span>Đánh giá tối thiểu</span>
                <select v-model="restaurantFilters.min_rating">
                  <option value="">Mọi đánh giá</option>
                  <option v-for="value in 5" :key="value" :value="value">
                    {{ value }} sao trở lên
                  </option>
                </select>
              </label>
            </div>

            <div class="restaurant-filter-actions">
              <button type="button" :disabled="restaurantStore.loading" @click="applyRestaurantFilters">
                {{ restaurantStore.loading ? 'Đang lọc...' : 'Áp Dụng' }}
              </button>
              <button
                class="secondary"
                type="button"
                :disabled="restaurantStore.loading"
                @click="clearRestaurantFilters"
              >
                Xoá Bộ Lọc
              </button>
            </div>

            <p v-if="restaurantStore.error" class="restaurant-filter-message error">
              {{ restaurantStore.error }}
            </p>
            <p
              v-else-if="!restaurantStore.loading && restaurantStore.restaurants.length === 0"
              class="restaurant-filter-message"
            >
              Không tìm thấy nhà hàng phù hợp. Hãy thử xoá bộ lọc.
            </p>
            <p v-else class="restaurant-filter-message">
              {{ restaurantStore.restaurants.length }} nhà hàng đang hiển thị trên bản đồ.
            </p>
          </div>
        </section>
      </div>

      <div
        v-else-if="sidebarMode === 'list' && mapMode === 'community'"
        class="food-map-sidebar-body community"
        :class="{ loading: foodSpotStore.communityLoading }"
      >
        <label class="food-map-community-search">
          <span class="sr-only">Tìm kiếm địa điểm cộng đồng</span>
          <AppIcon name="search" size="17" />
          <input
            v-model="communitySearch"
            type="search"
            maxlength="150"
            placeholder="Tìm món ăn, địa điểm..."
          />
        </label>

        <section class="food-map-filters" aria-label="Bộ lọc cộng đồng">
          <div class="food-map-filter-heading">
            <span><AppIcon name="filter" size="17" /> Bộ lọc cộng đồng</span>
            <button v-if="hasCommunityFilters" type="button" @click="clearCommunityFilters">
              Đặt lại
            </button>
          </div>
          <div class="food-map-filter-grid">
            <label>
              <span>Quận/Huyện</span>
              <select v-model="communityFilters.district">
                <option value="">Tất cả khu vực</option>
                <option v-for="item in districts" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Danh mục</span>
              <select v-model="communityFilters.category">
                <option value="">Tất cả món</option>
                <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
        </section>

        <div class="food-map-community-summary">
          <span>{{ communityResultText }}</span>
          <small v-if="foodSpotStore.communityLoading">Đang cập nhật...</small>
        </div>

        <div v-if="foodSpotStore.communityError" class="food-map-state compact" role="alert">
          <p>{{ foodSpotStore.communityError }}</p>
          <button type="button" @click="fetchCommunitySpots">Thử lại</button>
        </div>
        <div v-else-if="foodSpotStore.communitySpots.length === 0" class="food-map-state compact">
          <span class="food-map-empty-icon community"><AppIcon name="map-pin" size="28" /></span>
          <p>{{ communityResultText }}</p>
        </div>
        <div v-else class="food-map-spot-list">
          <button
            v-for="spot in foodSpotStore.communitySpots"
            :key="spot.id"
            type="button"
            class="food-map-spot-card community"
            @click="focusSpot(spot)"
          >
            <span
              class="food-map-card-pin"
              :style="{ '--spot-color': communityMarkerColor(spot.rating) }"
            ></span>
            <span class="food-map-card-copy">
              <span class="food-map-card-topline">
                <strong>{{ spot.name }}</strong>
                <small>{{ ratingText(spot.rating) }}</small>
              </span>
              <span>{{ spot.dish_name || 'Chưa thêm món ăn' }}</span>
              <span class="food-map-card-meta">
                <em v-if="spot.category">{{ spot.category }}</em>
                <small><AppIcon name="map-pin" size="13" /> {{ spot.district || 'TP. Hồ Chí Minh' }}</small>
              </span>
            </span>
          </button>
        </div>
      </div>

      <div v-else-if="sidebarMode === 'list' && mapMode === 'stats'" class="food-map-sidebar-body">
        <div v-if="foodSpotStore.loading" class="food-map-state compact" role="status">
          <span class="food-map-spinner"></span>
          <p>Đang tổng hợp hành trình ẩm thực...</p>
        </div>
        <div v-else-if="personalStats.total === 0" class="food-map-state">
          <span class="food-map-empty-icon"><AppIcon name="map-pin" size="30" /></span>
          <h2>Chưa có dữ liệu thống kê</h2>
          <p>Thêm địa điểm để xem thống kê</p>
          <button type="button" @click="addFromStats">Thêm Ngay</button>
        </div>
        <template v-else>
          <section class="food-map-stats-summary">
            <article>
              <strong>{{ personalStats.total }}</strong>
              <span>địa điểm</span>
            </article>
            <article>
              <strong>{{ personalStats.averageRating.toFixed(1) }} ★</strong>
              <span>trung bình</span>
            </article>
            <article>
              <strong>{{ personalStats.favoriteDistrict }}</strong>
              <span>quận yêu thích</span>
            </article>
          </section>

          <section class="food-map-stats-panel">
            <h2>Top 3 Quận Hay Đến Nhất</h2>
            <p v-if="personalStats.districtsRanking.length === 0" class="food-map-stats-empty">
              Chưa có thông tin quận/huyện.
            </p>
            <div v-for="item in personalStats.districtsRanking" :key="item.label" class="food-map-stat-row">
              <div><span>{{ item.label }}</span><small>{{ item.count }} · {{ item.percentage }}%</small></div>
              <span class="food-map-stat-track"><i :style="{ width: `${item.percentage}%` }"></i></span>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Top 3 Món Hay Ăn Nhất</h2>
            <p v-if="personalStats.dishesRanking.length === 0" class="food-map-stats-empty">
              Chưa có tên món ăn.
            </p>
            <div v-for="item in personalStats.dishesRanking" :key="item.label" class="food-map-stat-row">
              <div><span>{{ item.label }}</span><small>{{ item.count }} · {{ item.percentage }}%</small></div>
              <span class="food-map-stat-track"><i :style="{ width: `${item.percentage}%` }"></i></span>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Phân Bố Đánh Giá</h2>
            <div v-for="item in personalStats.ratingDistribution" :key="item.rating" class="food-map-rating-row">
              <span>{{ item.rating }}★</span>
              <span class="food-map-stat-track"><i :style="{ width: `${item.percentage}%` }"></i></span>
              <small>{{ item.count }}</small>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Gần Đây Nhất</h2>
            <button
              v-for="spot in personalStats.recent"
              :key="spot.id"
              type="button"
              class="food-map-recent-spot"
              @click="focusSpot(spot)"
            >
              <span>{{ spot.name }}</span>
              <small>{{ formatDate(spot.created_at) }}</small>
            </button>
          </section>
        </template>
      </div>

      <div v-else-if="sidebarMode === 'add' && mapMode === 'personal'" class="food-map-sidebar-body">
        <button class="food-map-back" type="button" @click="cancelForm">
          <AppIcon name="arrow-left" size="16" /> Quay lại
        </button>
        <div class="food-map-mode-heading">
          <p class="food-map-kicker">{{ isEditing ? 'Cập nhật bộ sưu tập' : 'Lưu một kỷ niệm mới' }}</p>
          <h2>{{ isEditing ? 'Chỉnh Sửa Địa Điểm' : 'Thêm Địa Điểm Mới' }}</h2>
          <p>Ghi lại món ngon và vị trí để dễ dàng quay lại lần sau.</p>
        </div>

        <form class="food-map-form" @submit.prevent="submitForm">
          <label>
            <span>Tên địa điểm <b>*</b></span>
            <input
              v-model="form.name"
              type="text"
              maxlength="150"
              placeholder="Ví dụ: Phở gia truyền cô Ba"
              :aria-invalid="Boolean(formErrors.name)"
            />
            <small v-if="formErrors.name" class="food-map-field-error">{{ formErrors.name }}</small>
          </label>
          <label>
            <span>Tên món ăn</span>
            <input v-model="form.dish_name" type="text" maxlength="150" placeholder="Món bạn đã thưởng thức" />
          </label>

          <div class="food-map-form-row">
            <label>
              <span>Danh mục</span>
              <select v-model="form.category">
                <option value="">Chọn danh mục</option>
                <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Quận/Huyện</span>
              <select v-model="form.district">
                <option value="">Chọn khu vực</option>
                <option v-for="item in districts" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>

          <fieldset class="food-map-fieldset">
            <legend>Vị trí <b>*</b></legend>
            <div class="food-map-form-row">
              <label><span>Vĩ độ</span><input :value="form.latitude" readonly placeholder="10.8231000" /></label>
              <label><span>Kinh độ</span><input :value="form.longitude" readonly placeholder="106.6297000" /></label>
            </div>
            <button type="button" :class="{ active: pickingMode }" @click="startPicking">
              <AppIcon name="map-pin" size="17" />
              {{ pickingMode ? 'Đang chờ chọn vị trí...' : 'Chọn Vị Trí Trên Bản Đồ' }}
            </button>
            <small v-if="formErrors.coordinates" class="food-map-field-error">{{ formErrors.coordinates }}</small>
          </fieldset>

          <fieldset class="food-map-fieldset">
            <legend>Đánh giá cá nhân</legend>
            <div class="food-map-stars" role="radiogroup" aria-label="Đánh giá cá nhân">
              <button
                v-for="value in 5"
                :key="value"
                type="button"
                :class="{ active: value <= Number(form.rating || 0) }"
                :aria-label="`${value} sao`"
                :aria-pressed="value === form.rating"
                @click="form.rating = value"
              >
                ★
              </button>
              <button v-if="form.rating" class="clear" type="button" @click="form.rating = null">
                Bỏ đánh giá
              </button>
            </div>
          </fieldset>

          <label>
            <span>Ghi chú</span>
            <textarea v-model="form.notes" rows="4" placeholder="Không gian, hương vị, món nên thử..."></textarea>
          </label>
          <label>
            <span>Tags</span>
            <input v-model="form.tags" maxlength="255" placeholder="ăn sáng, giá tốt, đi cùng bạn bè" />
            <small class="food-map-hint">Phân cách bằng dấu phẩy.</small>
          </label>
          <p v-if="formErrors.submit" class="food-map-submit-error" role="alert">{{ formErrors.submit }}</p>

          <div class="food-map-form-actions">
            <button class="food-map-save" type="submit" :disabled="submitting">
              <span v-if="submitting" class="food-map-spinner small"></span>
              <AppIcon v-else name="check" size="18" />
              {{ submitting ? 'Đang lưu...' : isEditing ? 'Lưu Thay Đổi' : 'Lưu Địa Điểm' }}
            </button>
            <button class="food-map-secondary" type="button" :disabled="submitting" @click="cancelForm">Huỷ</button>
          </div>
        </form>
      </div>

      <div
        v-else-if="sidebarMode === 'detail' && mapMode === 'personal' && selectedSpot"
        class="food-map-sidebar-body"
      >
        <button class="food-map-back" type="button" @click="backToList">
          <AppIcon name="arrow-left" size="16" /> Quay Lại
        </button>
        <div class="food-map-detail-hero">
          <span class="food-map-detail-pin" :style="{ '--spot-color': markerColor(selectedSpot.rating) }">
            <AppIcon name="map-pin" size="26" />
          </span>
          <p class="food-map-kicker">{{ selectedSpot.category || 'Điểm đến ẩm thực' }}</p>
          <h2>{{ selectedSpot.name }}</h2>
          <p>{{ selectedSpot.dish_name || 'Chưa thêm tên món ăn' }}</p>
          <div>{{ ratingText(selectedSpot.rating) }}</div>
        </div>

        <dl class="food-map-details">
          <div><dt><AppIcon name="map-pin" size="16" /> Khu vực</dt><dd>{{ selectedSpot.district || 'TP. Hồ Chí Minh' }}</dd></div>
          <div><dt><AppIcon name="store" size="16" /> Danh mục</dt><dd>{{ selectedSpot.category || 'Chưa phân loại' }}</dd></div>
          <div><dt><AppIcon name="clock" size="16" /> Ngày lưu</dt><dd>{{ formatDate(selectedSpot.created_at) }}</dd></div>
          <div class="wide"><dt><AppIcon name="message" size="16" /> Ghi chú</dt><dd>{{ selectedSpot.notes || 'Bạn chưa thêm ghi chú cho địa điểm này.' }}</dd></div>
        </dl>
        <div v-if="splitTags(selectedSpot.tags).length" class="food-map-tags">
          <span v-for="tag in splitTags(selectedSpot.tags)" :key="tag">#{{ tag }}</span>
        </div>
        <div class="food-map-detail-actions">
          <button type="button" @click="editSpot(selectedSpot)"><AppIcon name="pen" size="17" /> Chỉnh Sửa</button>
          <button class="danger" type="button" :disabled="deletingSpotId === selectedSpot.id" @click="removeSpot(selectedSpot)">
            <AppIcon name="trash" size="17" />
            {{ deletingSpotId === selectedSpot.id ? 'Đang xoá...' : 'Xoá Địa Điểm' }}
          </button>
        </div>
      </div>
    </aside>

    <div class="food-map-canvas">
      <div class="food-map-city-label" aria-hidden="true">
        <span>Thành phố Hồ Chí Minh</span>
      </div>
      <div v-if="pickingMode" class="food-map-picking-banner" role="status">
        <AppIcon name="map-pin" size="19" />
        <span>Nhấp vào bản đồ để chọn vị trí</span>
        <button type="button" @click="stopPicking">Huỷ</button>
      </div>
      <div ref="mapElement" class="food-map-leaflet" aria-label="Bản đồ địa điểm ẩm thực"></div>
      <div class="food-map-legend">
        <strong>{{ isCommunityMode ? 'Điểm cộng đồng' : 'Danh mục' }}</strong>
        <template v-if="isCommunityMode">
          <span><i style="--legend-color: #3d9cff"></i>Địa điểm công khai</span>
        </template>
        <template v-else>
          <span v-for="item in categoryLegend" :key="item.label">
            <i :style="{ '--legend-color': item.color }"></i>{{ item.label }}
          </span>
        </template>
      </div>
    </div>

    <aside class="food-map-detail-panel" aria-label="Chi tiết địa điểm">
      <template v-if="featuredSpot">
        <div class="food-map-detail-photo">
          <img :src="streetImage" :alt="featuredSpot.dish_name || featuredSpot.name" />
          <span class="food-map-detail-status">
            <AppIcon name="check" size="14" />
            Đã ăn
          </span>
          <button type="button" aria-label="Đánh dấu yêu thích">
            <AppIcon name="heart" size="18" />
          </button>
        </div>

        <section class="food-map-detail-copy">
          <p class="food-map-kicker">{{ featuredSpot.category || 'Điểm đến ẩm thực' }}</p>
          <h2>{{ featuredSpot.name }}</h2>
          <p class="food-map-detail-dish">{{ featuredSpot.dish_name || 'Một địa điểm đang chờ bạn khám phá' }}</p>

          <div class="food-map-detail-rating">
            <strong>{{ Number(featuredSpot.rating || 0).toFixed(1) }} ★</strong>
            <span>{{ featuredSpot.rating ? 'Đánh giá của bạn' : 'Chưa đánh giá' }}</span>
          </div>

          <div class="food-map-detail-line">
            <AppIcon name="map-pin" size="18" />
            <span>{{ featuredSpot.district || 'TP. Hồ Chí Minh' }}</span>
          </div>
          <div class="food-map-detail-line">
            <AppIcon name="utensils" size="18" />
            <span>Danh mục: {{ featuredSpot.category || 'Chưa phân loại' }}</span>
          </div>
        </section>

        <section class="food-map-note-card">
          <header>
            <span><AppIcon name="message" size="16" /> Ghi chú của bạn</span>
            <button type="button" aria-label="Chỉnh sửa ghi chú" @click="editSpot(featuredSpot)">
              <AppIcon name="pen" size="16" />
            </button>
          </header>
          <p>{{ featuredSpot.notes || 'Hãy lưu lại hương vị, không gian và món bạn muốn thử lần sau.' }}</p>
          <div v-if="splitTags(featuredSpot.tags).length" class="food-map-tags">
            <span v-for="tag in splitTags(featuredSpot.tags)" :key="tag">#{{ tag }}</span>
          </div>
        </section>

        <section v-if="featuredSpot.recipe_id" class="food-map-related-recipe">
          <p class="food-map-kicker">Công thức liên quan</p>
          <RouterLink :to="{ name: 'recipe-detail', params: { id: featuredSpot.recipe_id } }">
            <img :src="streetImage" alt="" />
            <span>
              <strong>{{ featuredSpot.dish_name || 'Khám phá công thức' }}</strong>
              <small>bởi FoodStory Kitchen</small>
            </span>
            <AppIcon name="arrow-right" size="18" />
          </RouterLink>
        </section>

        <div class="food-map-detail-footer">
          <button type="button" @click="editSpot(featuredSpot)">
            <AppIcon name="pen" size="17" /> Chỉnh sửa
          </button>
          <button
            class="danger"
            type="button"
            :disabled="deletingSpotId === featuredSpot.id"
            @click="removeSpot(featuredSpot)"
          >
            <AppIcon name="trash" size="17" />
            {{ deletingSpotId === featuredSpot.id ? 'Đang xoá...' : 'Xoá' }}
          </button>
          <button class="primary" type="button" @click="focusSpot(featuredSpot)">
            <AppIcon name="map-pin" size="17" /> Mở bản đồ
          </button>
        </div>
      </template>

      <div v-else class="food-map-detail-empty">
        <span><AppIcon name="map-pin" size="30" /></span>
        <p class="food-map-kicker">Nhật ký ẩm thực</p>
        <h2>Chọn một địa điểm</h2>
        <p>Thông tin, ghi chú và thao tác chỉnh sửa sẽ xuất hiện tại đây.</p>
        <button v-if="mapMode === 'personal'" type="button" @click="openAddForm">
          <AppIcon name="map-pin" size="17" />
          Thêm địa điểm đầu tiên
        </button>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.food-map-page {
  --map-bg: #111315;
  --map-panel: #1b1d20;
  --map-border: rgba(255, 255, 255, 0.09);
  --map-text: #f8f4ed;
  --map-muted: #aaa7a2;
  --map-orange: #f4a261;
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  height: calc(100vh - var(--nav-height));
  min-height: 680px;
  overflow: hidden;
  color: var(--map-text);
  background: var(--map-bg);
}

.food-map-sidebar {
  position: relative;
  z-index: 5;
  display: flex;
  min-width: 0;
  overflow: hidden;
  flex-direction: column;
  border-right: 1px solid var(--map-border);
  background:
    radial-gradient(circle at 15% 0%, rgba(230, 83, 63, 0.13), transparent 18rem),
    linear-gradient(180deg, #1e2023, #17191b);
  box-shadow: 18px 0 45px rgba(0, 0, 0, 0.22);
}

.food-map-sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 19px;
  border-bottom: 1px solid var(--map-border);
}

.food-map-kicker {
  margin: 0 0 5px;
  color: var(--map-orange);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.food-map-sidebar-header h1 {
  max-width: 270px;
  color: var(--map-text);
  font-size: 25px;
  line-height: 1.08;
}

.food-map-layer-counts {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 9px 0 0;
  color: var(--map-muted);
  font-size: 10px;
  font-weight: 750;
}

.food-map-layer-counts span {
  color: #f97316;
}

.food-map-mode-toggle {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 14px 20px 0;
  padding: 4px;
  border: 1px solid var(--map-border);
  border-radius: 13px;
  background: rgba(8, 9, 10, 0.35);
}

.food-map-mode-toggle button {
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--map-muted);
  background: transparent;
  font-size: 11px;
  font-weight: 900;
}

.food-map-mode-toggle button:hover {
  color: var(--map-text);
  border-color: rgba(255, 255, 255, 0.08);
}

.food-map-mode-toggle button.active {
  border-color: rgba(255, 137, 94, 0.35);
  color: #fff;
  background: linear-gradient(135deg, #ed654c, #c83d34);
  box-shadow: 0 7px 18px rgba(200, 61, 52, 0.22);
}

.food-map-layer-toggle {
  display: grid;
  gap: 8px;
  margin: 10px 20px 0;
  padding: 11px 12px;
  border-top: 1px solid var(--map-border);
  border-bottom: 1px solid var(--map-border);
}

.food-map-layer-toggle > span {
  color: var(--map-muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.food-map-layer-toggle > div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.food-map-layer-toggle > small {
  color: var(--map-muted);
  font-size: 9px;
}

.food-map-layer-toggle > small.error {
  color: #ff8b80;
}

.food-map-layer-toggle label {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--map-border);
  border-radius: 999px;
  color: var(--map-muted);
  background: rgba(255, 255, 255, 0.025);
  cursor: pointer;
  font-size: 10px;
  font-weight: 850;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.food-map-layer-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.food-map-layer-toggle label > span {
  display: inline-flex;
  width: 15px;
  height: 15px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  font-size: 9px;
}

.food-map-layer-toggle label.restaurant.active {
  border-color: rgba(249, 115, 22, 0.48);
  color: #fff4e9;
  background: rgba(249, 115, 22, 0.2);
}

.food-map-layer-toggle label.restaurant.active > span {
  border-color: #f97316;
  background: #f97316;
}

.food-map-layer-toggle label.personal.active {
  border-color: rgba(230, 83, 63, 0.48);
  color: #fff2ef;
  background: rgba(230, 83, 63, 0.18);
}

.food-map-layer-toggle label.personal.active > span {
  border-color: #df5145;
  background: #df5145;
}

.food-map-recipe-banner {
  display: grid;
  gap: 5px;
  margin: 12px 20px 0;
  padding: 13px;
  border: 1px solid rgba(244, 162, 97, 0.3);
  border-radius: 13px;
  color: #f5dcc7;
  background: linear-gradient(135deg, rgba(244, 162, 97, 0.16), rgba(230, 83, 63, 0.08));
  font-size: 11px;
}

.food-map-recipe-banner p {
  margin: 0;
}

.food-map-recipe-banner strong {
  color: #fff5e8;
  font-family: var(--font-serif);
  font-size: 14px;
}

.food-map-recipe-banner span {
  color: var(--map-muted);
}

.food-map-recipe-banner button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 5px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: #d94b3d;
  font-size: 11px;
  font-weight: 900;
}

.food-map-count {
  display: inline-flex;
  min-width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 162, 97, 0.25);
  border-radius: 12px;
  color: var(--map-orange);
  background: rgba(244, 162, 97, 0.08);
  font-weight: 900;
}

.food-map-sidebar-body {
  display: flex;
  min-height: 0;
  overflow-y: auto;
  flex: 1;
  flex-direction: column;
  gap: 17px;
  padding: 18px 20px 24px;
  scrollbar-color: rgba(244, 162, 97, 0.35) transparent;
  scrollbar-width: thin;
}

.food-map-sidebar-body.community {
  transition: opacity 180ms ease;
}

.food-map-sidebar-body.community.loading {
  opacity: 0.72;
}

.food-map-filters,
.food-map-fieldset,
.food-map-detail-hero,
.food-map-details > div {
  border: 1px solid var(--map-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.food-map-filters {
  padding: 15px;
}

.food-map-community-search {
  display: flex;
  min-height: 46px;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  border: 1px solid rgba(91, 151, 232, 0.28);
  border-radius: 12px;
  color: #6ba7f1;
  background: rgba(62, 113, 180, 0.08);
}

.food-map-community-search:focus-within {
  border-color: rgba(91, 151, 232, 0.65);
  box-shadow: 0 0 0 3px rgba(91, 151, 232, 0.1);
}

.food-map-community-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--map-text);
  background: transparent;
  font-size: 13px;
}

.food-map-community-search input::placeholder {
  color: #838b98;
}

.food-map-community-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #b9cce6;
  font-size: 11px;
  font-weight: 800;
}

.food-map-community-summary small {
  color: #6ba7f1;
}

.restaurant-filter-panel {
  overflow: hidden;
  border: 1px solid rgba(249, 115, 22, 0.2);
  border-radius: 14px;
  background: rgba(249, 115, 22, 0.035);
}

.restaurant-filter-toggle {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  color: #ffc18f;
  background: transparent;
  font-size: 11px;
  font-weight: 900;
}

.restaurant-filter-toggle > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.restaurant-filter-content {
  display: grid;
  gap: 12px;
  padding: 0 14px 14px;
  border-top: 1px solid rgba(249, 115, 22, 0.14);
}

.restaurant-filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 13px;
}

.restaurant-filter-grid label {
  display: grid;
  gap: 6px;
  color: var(--map-muted);
  font-size: 10px;
  font-weight: 800;
}

.restaurant-filter-grid .wide {
  grid-column: 1 / -1;
}

.restaurant-filter-grid input,
.restaurant-filter-grid select {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 9px;
  outline: 0;
  color: var(--map-text);
  background: #17191c;
  font-size: 12px;
}

.restaurant-filter-grid input:focus,
.restaurant-filter-grid select:focus {
  border-color: rgba(249, 115, 22, 0.62);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.09);
}

.restaurant-filter-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.restaurant-filter-actions button {
  min-height: 39px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #d95a08);
  font-size: 10px;
  font-weight: 900;
}

.restaurant-filter-actions button.secondary {
  border: 1px solid var(--map-border);
  color: var(--map-muted);
  background: rgba(255, 255, 255, 0.035);
}

.restaurant-filter-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.restaurant-filter-message {
  margin: 0;
  color: var(--map-muted);
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

.restaurant-filter-message.error {
  color: #ff8b80;
}

.food-map-filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 900;
}

.food-map-filter-heading span,
.food-map-back,
.food-map-detail-actions button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.food-map-filter-heading button,
.food-map-back {
  padding: 0;
  border: 0;
  color: var(--map-orange);
  background: transparent;
  font-size: 11px;
  font-weight: 850;
}

.food-map-filter-grid,
.food-map-form-row,
.food-map-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.food-map-filter-grid label:last-child,
.food-map-details .wide {
  grid-column: 1 / -1;
}

.food-map-filter-grid label,
.food-map-form label {
  display: grid;
  gap: 6px;
  color: var(--map-muted);
  font-size: 11px;
  font-weight: 800;
}

.food-map-filter-grid select,
.food-map-form input,
.food-map-form select,
.food-map-form textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 10px;
  outline: 0;
  color: var(--map-text);
  background: #17191c;
  font-size: 13px;
}

.food-map-filter-grid select,
.food-map-form input,
.food-map-form select {
  height: 42px;
  padding: 0 10px;
}

.food-map-form textarea {
  min-height: 96px;
  padding: 11px;
  resize: vertical;
}

.food-map-filter-grid select:focus,
.food-map-form input:focus,
.food-map-form select:focus,
.food-map-form textarea:focus {
  border-color: rgba(244, 162, 97, 0.65);
  box-shadow: 0 0 0 3px rgba(244, 162, 97, 0.09);
}

.food-map-primary-action,
.food-map-save {
  display: inline-flex;
  min-height: 47px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #ed654c, #c83d34);
  box-shadow: 0 12px 25px rgba(211, 67, 53, 0.22);
  font-weight: 900;
}

.food-map-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 15px;
  color: var(--map-muted);
  text-align: center;
}

.food-map-state.compact {
  min-height: 140px;
}

.food-map-empty-icon.community {
  color: #5b97e8;
  background: rgba(91, 151, 232, 0.1);
}

.food-map-state h2 {
  color: var(--map-text);
  font-size: 20px;
}

.food-map-state p {
  font-size: 13px;
  line-height: 1.55;
}

.food-map-state button {
  padding: 9px 14px;
  border: 1px solid rgba(244, 162, 97, 0.35);
  border-radius: 9px;
  color: var(--map-orange);
  background: rgba(244, 162, 97, 0.08);
  font-weight: 850;
}

.food-map-empty-icon {
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  color: var(--map-orange);
  background: rgba(244, 162, 97, 0.09);
}

.food-map-spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid rgba(244, 162, 97, 0.2);
  border-top-color: var(--map-orange);
  border-radius: 50%;
  animation: food-map-spin 700ms linear infinite;
}

.food-map-spinner.small {
  width: 17px;
  height: 17px;
  border-width: 2px;
}

.food-map-spot-list,
.food-map-form {
  display: grid;
  gap: 12px;
}

.food-map-spot-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  width: 100%;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--map-border);
  border-radius: 13px;
  color: inherit;
  background: rgba(255, 255, 255, 0.025);
  text-align: left;
}

.food-map-spot-card:hover {
  border-color: rgba(230, 83, 63, 0.48);
  background: rgba(230, 83, 63, 0.065);
  transform: translateY(-1px);
}

.food-map-spot-card.community {
  border-color: rgba(91, 151, 232, 0.14);
  background: rgba(67, 119, 185, 0.035);
}

.food-map-spot-card.community:hover {
  border-color: rgba(91, 151, 232, 0.5);
  background: rgba(67, 119, 185, 0.09);
}

.food-map-card-pin {
  width: 12px;
  height: 12px;
  margin-top: 5px;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 50%;
  background: var(--spot-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--spot-color) 20%, transparent);
}

.food-map-card-copy,
.food-map-card-topline,
.food-map-card-meta {
  display: flex;
}

.food-map-card-copy {
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--map-muted);
  font-size: 12px;
}

.food-map-card-topline {
  justify-content: space-between;
  gap: 8px;
}

.food-map-card-topline strong {
  overflow: hidden;
  color: var(--map-text);
  font-family: var(--font-serif);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-card-topline small,
.food-map-detail-hero > div {
  color: #f7b731;
}

.food-map-card-meta {
  align-items: center;
  gap: 8px;
}

.food-map-card-meta em,
.food-map-tags span {
  padding: 4px 7px;
  border-radius: 999px;
  color: #ffb27c;
  background: rgba(244, 162, 97, 0.1);
  font-size: 10px;
  font-style: normal;
  font-weight: 850;
}

.food-map-card-meta small {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.food-map-stats-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.food-map-stats-summary article {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 12px 8px;
  border: 1px solid rgba(244, 162, 97, 0.18);
  border-radius: 12px;
  background: rgba(244, 162, 97, 0.055);
  text-align: center;
}

.food-map-stats-summary strong {
  overflow: hidden;
  color: #ffc08f;
  font-family: var(--font-serif);
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-stats-summary span {
  color: var(--map-muted);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.food-map-stats-panel {
  display: grid;
  gap: 11px;
  padding: 15px;
  border: 1px solid var(--map-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.food-map-stats-panel h2 {
  color: var(--map-text);
  font-size: 14px;
}

.food-map-stat-row {
  display: grid;
  gap: 6px;
}

.food-map-stat-row > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #dedad4;
  font-size: 11px;
  font-weight: 800;
}

.food-map-stat-row small,
.food-map-rating-row small,
.food-map-stats-empty {
  color: var(--map-muted);
  font-size: 10px;
}

.food-map-stat-track {
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.065);
}

.food-map-stat-track i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d94b3d, #f4a261);
  transition: width 650ms ease;
}

.food-map-rating-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 8px;
  color: #f7b731;
  font-size: 11px;
  font-weight: 850;
}

.food-map-rating-row small {
  text-align: right;
}

.food-map-recent-spot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.065);
  color: #e7e2db;
  background: transparent;
  text-align: left;
}

.food-map-recent-spot:last-child {
  border-bottom: 0;
}

.food-map-recent-spot span {
  overflow: hidden;
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.food-map-recent-spot small {
  flex: 0 0 auto;
  color: var(--map-muted);
  font-size: 9px;
}

.food-map-mode-heading {
  display: grid;
  gap: 6px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--map-border);
}

.food-map-mode-heading h2 {
  font-size: 24px;
}

.food-map-mode-heading > p:last-child,
.food-map-hint {
  color: var(--map-muted);
  font-size: 11px;
}

.food-map-fieldset {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 13px;
}

.food-map-fieldset legend {
  padding: 0 5px;
  color: var(--map-muted);
  font-size: 11px;
  font-weight: 800;
}

.food-map-form b,
.food-map-fieldset b {
  color: #ff7166;
}

.food-map-fieldset > button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(244, 162, 97, 0.3);
  border-radius: 9px;
  color: var(--map-orange);
  background: rgba(244, 162, 97, 0.07);
  font-size: 12px;
  font-weight: 850;
}

.food-map-fieldset > button.active {
  color: #18191b;
  background: var(--map-orange);
}

.food-map-stars {
  display: flex;
  align-items: center;
  gap: 3px;
}

.food-map-stars button:not(.clear) {
  padding: 0 2px;
  border: 0;
  color: #555960;
  background: transparent;
  font-size: 26px;
}

.food-map-stars button.active {
  color: #f7b731;
}

.food-map-stars .clear {
  margin-left: 7px;
  border: 0;
  color: var(--map-muted);
  background: transparent;
  font-size: 10px;
  font-weight: 800;
}

.food-map-field-error,
.food-map-submit-error {
  color: #ff7b72;
  font-size: 11px;
  font-weight: 750;
}

.food-map-submit-error {
  padding: 10px 12px;
  border: 1px solid rgba(255, 123, 114, 0.24);
  border-radius: 9px;
  background: rgba(255, 123, 114, 0.07);
}

.food-map-form-actions,
.food-map-detail-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.food-map-secondary,
.food-map-detail-actions button {
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid var(--map-border);
  border-radius: 10px;
  color: var(--map-text);
  background: rgba(255, 255, 255, 0.035);
  font-weight: 850;
}

.food-map-detail-hero {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 20px 14px;
  text-align: center;
}

.food-map-detail-pin {
  display: inline-flex;
  width: 62px;
  height: 62px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--spot-color) 45%, transparent);
  border-radius: 20px;
  color: var(--spot-color);
  background: color-mix(in srgb, var(--spot-color) 12%, transparent);
}

.food-map-detail-hero h2 {
  font-size: 27px;
}

.food-map-detail-hero > p:not(.food-map-kicker) {
  color: var(--map-muted);
  font-size: 13px;
}

.food-map-details {
  margin: 0;
}

.food-map-details > div {
  padding: 13px;
}

.food-map-details dt {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--map-orange);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.food-map-details dd {
  margin: 0;
  color: #ddd9d3;
  font-size: 12px;
  line-height: 1.55;
}

.food-map-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.food-map-detail-actions button:first-child {
  color: var(--map-orange);
}

.food-map-detail-actions .danger {
  color: #ff8176;
}

.food-map-canvas {
  position: relative;
  min-width: 0;
  padding: 14px;
}

.food-map-leaflet {
  width: 100%;
  height: 100%;
  min-height: 640px;
  overflow: hidden;
  border: 1px solid var(--map-border);
  border-radius: 18px;
  background: #191b1e;
}

.food-map-leaflet.is-picking {
  cursor: crosshair;
}

.food-map-picking-banner {
  position: absolute;
  top: 28px;
  left: 50%;
  z-index: 800;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px 10px 15px;
  border: 1px solid rgba(244, 162, 97, 0.42);
  border-radius: 999px;
  color: #fff7ec;
  background: rgba(28, 25, 22, 0.94);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
  font-size: 12px;
  font-weight: 850;
  transform: translateX(-50%);
}

.food-map-picking-banner button {
  border: 0;
  color: #ffb27c;
  background: transparent;
  font-size: 10px;
  font-weight: 850;
}

.food-map-legend {
  position: absolute;
  right: 28px;
  bottom: 28px;
  z-index: 700;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--map-border);
  border-radius: 12px;
  color: #d8d4ce;
  background: rgba(24, 26, 29, 0.9);
  font-size: 10px;
}

.food-map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.food-map-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--legend-color);
}

:deep(.food-map-marker-shell) {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
}

:deep(.food-map-marker-dot) {
  display: block;
  width: 18px;
  height: 18px;
  border: 4px solid rgba(255, 255, 255, 0.96);
  border-radius: 50%;
  background: var(--marker-color);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--marker-color) 24%, transparent), 0 8px 18px rgba(0, 0, 0, 0.32);
}

:deep(.food-map-marker-dot.preview) {
  width: 22px;
  height: 22px;
  animation: food-map-pulse 1.1s ease-in-out infinite;
}

:deep(.food-map-marker-dot.community) {
  width: 14px;
  height: 14px;
  border-width: 3px;
  opacity: 0.9;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--marker-color) 22%, transparent), 0 7px 15px rgba(0, 0, 0, 0.28);
}

:deep(.restaurant-marker-shell),
:deep(.restaurant-cluster-shell) {
  border: 0;
  background: transparent;
}

:deep(.restaurant-marker) {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  border-radius: 12px;
  color: #fff;
  background: var(--restaurant-gradient, linear-gradient(135deg, #fb923c, #ea580c));
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--restaurant-color, #f97316) 22%, transparent),
    0 8px 18px rgba(0, 0, 0, 0.3);
}

:deep(.restaurant-marker-emoji) {
  display: block;
  font-size: 22px;
  line-height: 1;
  filter: grayscale(1) brightness(0) invert(1);
}

:deep(.restaurant-cluster) {
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  color: #fff;
  background: #f97316;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
  font-size: 13px;
  font-weight: 900;
}

:deep(.marker-cluster div) {
  color: #fff;
  background: linear-gradient(135deg, #e85d45, #bf3932);
  font-weight: 900;
}

:deep(.marker-cluster) {
  background: rgba(244, 162, 97, 0.28);
}

.mode-community :deep(.marker-cluster div) {
  background: linear-gradient(135deg, #4f8fe8, #315f9f);
}

.mode-community :deep(.marker-cluster) {
  background: rgba(91, 151, 232, 0.25);
}

:deep(.leaflet-control-zoom a) {
  border-color: var(--map-border);
  color: #f5f1ea;
  background: rgba(26, 28, 31, 0.94);
}

:deep(.food-map-leaflet-popup .leaflet-popup-content-wrapper),
:deep(.food-map-leaflet-popup .leaflet-popup-tip),
:deep(.restaurant-leaflet-popup .leaflet-popup-content-wrapper),
:deep(.restaurant-leaflet-popup .leaflet-popup-tip) {
  color: #eee9e2;
  background: #202226;
}

:deep(.food-map-leaflet-popup .leaflet-popup-content-wrapper),
:deep(.restaurant-leaflet-popup .leaflet-popup-content-wrapper) {
  border: 1px solid var(--map-border);
  border-radius: 14px;
}

:deep(.restaurant-leaflet-popup .leaflet-popup-content-wrapper) {
  overflow: hidden;
}

:deep(.restaurant-leaflet-popup .leaflet-popup-content) {
  width: 260px !important;
  margin: 0;
}

:deep(.restaurant-leaflet-popup .leaflet-popup-close-button) {
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

:deep(.restaurant-leaflet-popup .leaflet-popup-close-button:hover) {
  color: #fff7ed;
}

:deep(.food-map-popup) {
  display: grid;
  min-width: 210px;
  gap: 5px;
  font-family: var(--font-sans);
}

:deep(.food-map-popup-kicker) {
  color: var(--map-orange);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

:deep(.food-map-popup strong) {
  color: #fff;
  font-family: var(--font-serif);
  font-size: 17px;
}

:deep(.food-map-popup p) {
  color: #b8b5b0;
  font-size: 12px;
}

:deep(.food-map-popup-rating) {
  color: #f7b731;
  font-size: 12px;
}

:deep(.food-map-popup-location) {
  color: #8ea8ca;
  font-size: 10px;
  font-weight: 750;
}

:deep(.food-map-popup.community .food-map-popup-kicker) {
  color: #6ba7f1;
}

:deep(.restaurant-popup) {
  display: block;
  width: 260px;
  min-width: 260px;
  overflow: hidden;
  font-family: var(--font-sans);
}

:deep(.restaurant-popup-banner) {
  display: grid;
  height: 80px;
  place-items: center;
  background: var(--restaurant-gradient, linear-gradient(135deg, #fb923c, #ea580c));
}

:deep(.restaurant-popup-emoji) {
  font-size: 48px;
  line-height: 1;
  text-shadow: 0 7px 18px rgba(0, 0, 0, 0.28);
}

:deep(.restaurant-popup-body) {
  display: grid;
  gap: 7px;
  padding: 12px;
}

:deep(.restaurant-popup strong) {
  color: #fff;
  font-family: var(--font-serif);
  font-size: 18px;
  line-height: 1.2;
}

:deep(.restaurant-popup-address) {
  margin: 0;
  color: #aaa7a2;
  font-size: 11px;
  line-height: 1.45;
}

:deep(.restaurant-popup-meta) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #ddd8d0;
  font-size: 10px;
  font-weight: 750;
}

:deep(.restaurant-popup-price) {
  padding: 3px 7px;
  border-radius: 999px;
  font-weight: 900;
}

:deep(.restaurant-popup-price.price-1) {
  color: #8ee3b0;
  background: rgba(67, 170, 139, 0.14);
}

:deep(.restaurant-popup-price.price-2) {
  color: #ffd277;
  background: rgba(247, 183, 49, 0.14);
}

:deep(.restaurant-popup-price.price-3) {
  color: #ff8b80;
  background: rgba(230, 80, 79, 0.14);
}

:deep(.restaurant-popup-rating) {
  color: #f7b731;
  font-size: 12px;
  font-weight: 850;
}

:deep(.restaurant-popup-description) {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #c4c0ba;
  font-size: 11px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

:deep(.restaurant-popup-directions) {
  min-height: 36px;
  margin-top: 3px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--restaurant-gradient, linear-gradient(135deg, #fb923c, #ea580c));
  box-shadow: 0 7px 16px color-mix(in srgb, var(--restaurant-color, #f97316) 26%, transparent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

:deep(.restaurant-popup-directions:hover) {
  filter: brightness(1.05);
}

:deep(.food-map-popup-actions) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  margin-top: 6px;
}

:deep(.food-map-popup-actions button) {
  min-height: 33px;
  padding: 0 10px;
  border: 1px solid rgba(244, 162, 97, 0.28);
  border-radius: 8px;
  color: #ffb27c;
  background: rgba(244, 162, 97, 0.08);
  font-size: 10px;
  font-weight: 850;
}

:deep(.food-map-popup-actions .danger) {
  color: #ff8176;
}

@keyframes food-map-spin {
  to { transform: rotate(360deg); }
}

@keyframes food-map-pulse {
  50% { transform: scale(1.1); }
}

@media (max-width: 1050px) {
  .food-map-page { grid-template-columns: 340px minmax(0, 1fr); }
  .food-map-legend { display: none; }
}

@media (max-width: 760px) {
  .food-map-page {
    display: flex;
    height: auto;
    min-height: calc(100vh - var(--nav-height));
    overflow: visible;
    flex-direction: column;
  }

  .food-map-sidebar { min-height: 520px; border-right: 0; }
  .food-map-sidebar-body { max-height: 620px; }
  .food-map-canvas { order: -1; height: 54vh; min-height: 410px; padding: 10px; }
  .food-map-leaflet { min-height: 390px; border-radius: 14px; }
}

@media (max-width: 430px) {
  .food-map-filter-grid,
  .food-map-form-row,
  .food-map-details { grid-template-columns: 1fr; }
  .food-map-filter-grid label:last-child,
  .food-map-details .wide { grid-column: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .food-map-spinner,
  :deep(.food-map-marker-dot.preview) { animation: none; }
}

/* Editorial food-map redesign */
.food-map-page {
  --map-bg: #f8f0e3;
  --map-panel: #fffaf1;
  --map-panel-strong: #fffdf8;
  --map-border: rgba(117, 78, 41, 0.16);
  --map-border-strong: rgba(177, 117, 56, 0.28);
  --map-text: #3e2d20;
  --map-muted: #806e5f;
  --map-orange: #e95b2b;
  grid-template-columns:
    clamp(330px, 23.5vw, 390px)
    minmax(500px, 1fr)
    clamp(320px, 23vw, 390px);
  height: calc(100svh - var(--nav-height));
  min-height: 720px;
  background:
    radial-gradient(circle at 7% 14%, rgba(188, 149, 85, 0.1), transparent 17rem),
    radial-gradient(circle at 93% 90%, rgba(214, 115, 55, 0.08), transparent 20rem),
    #f8f0e3;
  color: var(--map-text);
}

.food-map-sidebar {
  border-right: 1px solid var(--map-border);
  background:
    linear-gradient(rgba(255, 250, 241, 0.94), rgba(255, 250, 241, 0.94)),
    radial-gradient(circle at 16% 9%, rgba(167, 126, 67, 0.18) 0 1px, transparent 1.5px);
  background-size: auto, 15px 15px;
  box-shadow: 12px 0 36px rgba(99, 66, 31, 0.08);
}

.food-map-sidebar::after {
  position: absolute;
  right: 18px;
  bottom: 16px;
  width: 92px;
  height: 92px;
  border: 1px solid rgba(169, 117, 55, 0.13);
  border-radius: 50%;
  content: "";
  opacity: 0.6;
  pointer-events: none;
}

.food-map-sidebar-header {
  position: relative;
  padding: 28px 26px 18px;
  border-bottom: 0;
}

.food-map-sidebar-header::before {
  position: absolute;
  top: 23px;
  left: 10px;
  width: 3px;
  height: 78px;
  border-radius: 999px;
  background: linear-gradient(#7ba26d, #d6b475, transparent);
  content: "";
}

.food-map-sidebar-header h1 {
  max-width: 285px;
  color: var(--map-text);
  font-size: clamp(27px, 2vw, 35px);
  line-height: 1.02;
}

.food-map-kicker {
  color: #9b6d3c;
  letter-spacing: 0.14em;
}

.food-map-storyline {
  position: relative;
  width: fit-content;
  margin-top: 9px;
  padding-bottom: 8px;
  color: #db5b2b;
  font-family: var(--font-serif);
  font-size: 14px;
  font-style: italic;
}

.food-map-storyline::after {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 86px;
  height: 2px;
  border-radius: 999px;
  background: #e65e2f;
  content: "";
}

.food-map-layer-counts {
  margin-top: 10px;
  color: #9b8977;
}

.food-map-count {
  border-color: rgba(226, 91, 44, 0.2);
  color: #d94f24;
  background: rgba(232, 91, 43, 0.08);
}

.food-map-mode-toggle {
  gap: 0;
  margin: 0 20px 10px;
  padding: 4px;
  border-color: var(--map-border);
  border-radius: 15px;
  background: rgba(241, 224, 199, 0.58);
  box-shadow: inset 0 1px 2px rgba(100, 67, 32, 0.05);
}

.food-map-mode-toggle button {
  min-height: 39px;
  border-radius: 11px;
  color: #745f4e;
  font-family: var(--font-serif);
  font-size: 13px;
}

.food-map-mode-toggle button:hover {
  border-color: transparent;
  color: #cf4c25;
  background: rgba(255, 255, 255, 0.52);
}

.food-map-mode-toggle button.active {
  border-color: rgba(223, 91, 44, 0.23);
  color: #d94f24;
  background: #fffaf2;
  box-shadow: 0 5px 13px rgba(119, 72, 26, 0.09);
}

.food-map-layer-toggle {
  gap: 7px;
  margin: 0 20px;
  padding: 10px 2px 11px;
  border-top: 0;
  border-bottom-color: var(--map-border);
}

.food-map-layer-toggle > span {
  color: #9b836e;
}

.food-map-layer-toggle > small {
  color: var(--map-muted);
}

.food-map-layer-toggle label {
  min-height: 30px;
  padding: 0 10px;
  border-color: rgba(126, 92, 58, 0.15);
  color: #826c58;
  background: rgba(255, 255, 255, 0.46);
}

.food-map-layer-toggle label > span {
  border-color: rgba(107, 81, 54, 0.28);
}

.food-map-layer-toggle label.restaurant.active {
  border-color: rgba(234, 112, 45, 0.25);
  color: #c95722;
  background: #fff1dd;
}

.food-map-layer-toggle label.personal.active {
  border-color: rgba(127, 157, 84, 0.28);
  color: #668641;
  background: #eef3dd;
}

.food-map-layer-toggle label.personal.active > span {
  border-color: #80a257;
  background: #80a257;
}

.food-map-sidebar-body {
  gap: 13px;
  padding: 13px 20px 22px;
  scrollbar-color: rgba(177, 117, 56, 0.35) transparent;
}

.food-map-personal-search,
.food-map-community-search {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid var(--map-border-strong);
  border-radius: 12px;
  color: #9d774f;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: inset 0 1px 2px rgba(99, 64, 29, 0.035);
}

.food-map-personal-search:focus-within,
.food-map-community-search:focus-within {
  border-color: rgba(225, 92, 43, 0.55);
  box-shadow: 0 0 0 3px rgba(225, 92, 43, 0.08);
}

.food-map-personal-search input,
.food-map-community-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--map-text);
  background: transparent;
  font-size: 12px;
}

.food-map-personal-search input::placeholder,
.food-map-community-search input::placeholder {
  color: #a99682;
}

.food-map-personal-search button {
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #9a8068;
  background: rgba(118, 85, 52, 0.08);
  font-size: 18px;
}

.food-map-filters,
.food-map-fieldset,
.food-map-detail-hero,
.food-map-details > div {
  border-color: var(--map-border);
  background: rgba(255, 253, 248, 0.64);
}

.food-map-filters {
  padding: 13px;
}

.food-map-filter-heading {
  margin-bottom: 10px;
  color: #8e7156;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.food-map-filter-heading button,
.food-map-back {
  color: #d95328;
}

.food-map-filter-grid {
  gap: 8px;
}

.food-map-filter-grid label,
.food-map-form label {
  color: #88715d;
  font-size: 10px;
}

.food-map-filter-grid select,
.food-map-form input,
.food-map-form select,
.food-map-form textarea,
.restaurant-filter-grid input,
.restaurant-filter-grid select {
  border-color: rgba(123, 90, 57, 0.17);
  color: var(--map-text);
  background: #fffcf6;
}

.food-map-filter-grid select {
  height: 38px;
}

.food-map-filter-grid select:focus,
.food-map-form input:focus,
.food-map-form select:focus,
.food-map-form textarea:focus,
.restaurant-filter-grid input:focus,
.restaurant-filter-grid select:focus {
  border-color: rgba(226, 91, 43, 0.5);
  box-shadow: 0 0 0 3px rgba(226, 91, 43, 0.08);
}

.food-map-primary-action,
.food-map-save {
  min-height: 47px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f47a31, #e65224);
  box-shadow: 0 12px 24px rgba(222, 79, 32, 0.2);
}

.food-map-state {
  min-height: 190px;
  border-color: rgba(132, 98, 64, 0.2);
  color: var(--map-muted);
  background: rgba(255, 253, 248, 0.42);
}

.food-map-state.compact {
  min-height: 125px;
}

.food-map-state h2,
.food-map-mode-heading h2 {
  color: var(--map-text);
}

.food-map-state button {
  border-color: rgba(226, 91, 43, 0.28);
  color: #d85229;
  background: rgba(226, 91, 43, 0.06);
}

.food-map-empty-icon {
  color: #df5a2d;
  background: rgba(226, 91, 43, 0.08);
}

.food-map-spot-list {
  gap: 8px;
}

.food-map-spot-card {
  position: relative;
  grid-template-columns: 56px minmax(0, 1fr);
  min-height: 84px;
  gap: 10px;
  padding: 8px;
  border-color: rgba(132, 95, 59, 0.13);
  border-radius: 12px;
  color: var(--map-text);
  background: rgba(255, 253, 248, 0.56);
}

.food-map-spot-card:hover,
.food-map-spot-card.active {
  border-color: rgba(224, 91, 42, 0.32);
  background: #fffaf2;
  box-shadow: 0 9px 22px rgba(106, 69, 34, 0.09);
}

.food-map-card-rank {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border: 2px solid #fffaf2;
  border-radius: 50%;
  color: #fff;
  background: #ef7b22;
  box-shadow: 0 3px 8px rgba(127, 73, 22, 0.18);
  font-size: 10px;
  font-weight: 900;
}

.food-map-card-thumb {
  width: 56px;
  min-height: 66px;
  border-radius: 9px;
  background-position: 51% center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgba(104, 72, 41, 0.08);
}

.food-map-card-copy {
  justify-content: center;
  gap: 4px;
  color: #806d5b;
  font-size: 11px;
}

.food-map-card-topline strong {
  color: #4a3323;
  font-size: 14px;
}

.food-map-card-topline small {
  flex: 0 0 auto;
  color: #e79317;
  font-size: 9px;
  font-weight: 900;
}

.food-map-card-meta {
  gap: 5px;
}

.food-map-card-meta em {
  padding: 3px 6px;
  color: color-mix(in srgb, var(--spot-color) 78%, #422d1e);
  background: color-mix(in srgb, var(--spot-color) 11%, #fff);
}

.food-map-card-meta small {
  min-width: 0;
  overflow: hidden;
  color: #967f6a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.restaurant-filter-panel {
  border-color: rgba(217, 113, 48, 0.18);
  background: rgba(255, 243, 224, 0.55);
}

.restaurant-filter-toggle {
  color: #b9632e;
}

.restaurant-filter-content {
  border-top-color: rgba(176, 111, 54, 0.14);
}

.restaurant-filter-grid label,
.restaurant-filter-message {
  color: var(--map-muted);
}

.restaurant-filter-actions button.secondary {
  border-color: var(--map-border);
  color: #806b58;
  background: #fffaf2;
}

.food-map-community-summary {
  color: #755f4c;
}

.food-map-community-summary small {
  color: #447fbf;
}

.food-map-stats-summary article,
.food-map-stats-panel {
  border-color: var(--map-border);
  background: rgba(255, 253, 248, 0.62);
}

.food-map-stats-summary strong,
.food-map-stats-panel h2,
.food-map-stat-row > div,
.food-map-recent-spot {
  color: var(--map-text);
}

.food-map-stats-summary span,
.food-map-stat-row small,
.food-map-rating-row small,
.food-map-stats-empty,
.food-map-recent-spot small {
  color: var(--map-muted);
}

.food-map-stat-track {
  background: rgba(121, 86, 52, 0.1);
}

.food-map-recent-spot {
  border-bottom-color: var(--map-border);
}

.food-map-mode-heading {
  border-bottom-color: var(--map-border);
}

.food-map-mode-heading > p:last-child,
.food-map-hint,
.food-map-fieldset legend {
  color: var(--map-muted);
}

.food-map-fieldset > button {
  border-color: rgba(226, 91, 43, 0.25);
  color: #d95328;
  background: rgba(226, 91, 43, 0.05);
}

.food-map-fieldset > button.active {
  color: #fff;
  background: #e55b2d;
}

.food-map-secondary,
.food-map-detail-actions button {
  border-color: var(--map-border);
  color: var(--map-text);
  background: #fffaf2;
}

.food-map-details dd {
  color: #6f5b49;
}

.food-map-tags span {
  color: #b35831;
  background: #fff0df;
}

.food-map-canvas {
  padding: 18px 12px;
  background:
    linear-gradient(90deg, rgba(255, 250, 241, 0.4), transparent 20%, transparent 80%, rgba(255, 250, 241, 0.4)),
    #f3e8d6;
}

.food-map-leaflet {
  min-height: 680px;
  border-color: rgba(141, 103, 62, 0.2);
  border-radius: 22px;
  background: #e9dfcd;
  box-shadow:
    0 18px 38px rgba(91, 61, 31, 0.1),
    inset 0 0 0 7px rgba(255, 251, 243, 0.34);
}

.food-map-city-label {
  position: absolute;
  top: 29px;
  left: 50%;
  z-index: 700;
  min-width: 245px;
  padding: 10px 28px 13px;
  border: 1px solid rgba(157, 110, 57, 0.22);
  border-radius: 6px 6px 18px 18px;
  color: #6f5135;
  background:
    linear-gradient(rgba(255, 249, 237, 0.95), rgba(249, 234, 208, 0.95)),
    #f9ead2;
  box-shadow: 0 8px 20px rgba(101, 68, 31, 0.12);
  font-family: var(--font-serif);
  font-size: 15px;
  font-style: italic;
  text-align: center;
  transform: translateX(-50%);
}

.food-map-city-label::before,
.food-map-city-label::after {
  position: absolute;
  top: 12px;
  width: 22px;
  height: 1px;
  background: rgba(145, 99, 50, 0.36);
  content: "";
}

.food-map-city-label::before { left: 8px; }
.food-map-city-label::after { right: 8px; }

.food-map-picking-banner {
  top: 84px;
  border-color: rgba(226, 91, 43, 0.35);
  color: #5c3f2b;
  background: rgba(255, 250, 241, 0.96);
  box-shadow: 0 12px 28px rgba(100, 65, 29, 0.15);
}

.food-map-legend {
  right: auto;
  bottom: 31px;
  left: 50%;
  max-width: calc(100% - 50px);
  gap: 12px;
  padding: 10px 14px;
  border-color: rgba(137, 96, 54, 0.18);
  border-radius: 999px;
  color: #6f5a47;
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 10px 24px rgba(92, 60, 28, 0.12);
  transform: translateX(-50%);
}

.food-map-legend strong {
  flex: 0 0 auto;
  color: #4b3524;
  font-family: var(--font-serif);
  white-space: nowrap;
}

.food-map-legend span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.food-map-legend i {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.86);
  box-shadow: 0 2px 6px rgba(92, 62, 31, 0.15);
}

.food-map-detail-panel {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  flex-direction: column;
  margin: 18px 18px 18px 0;
  border: 1px solid var(--map-border);
  border-radius: 22px;
  color: var(--map-text);
  background:
    linear-gradient(rgba(255, 250, 241, 0.96), rgba(255, 250, 241, 0.96)),
    radial-gradient(circle at 80% 10%, rgba(177, 129, 69, 0.13) 0 1px, transparent 1.5px);
  background-size: auto, 14px 14px;
  box-shadow: 0 15px 35px rgba(99, 66, 31, 0.08);
  scrollbar-color: rgba(177, 117, 56, 0.3) transparent;
  scrollbar-width: thin;
}

.food-map-detail-photo {
  position: relative;
  flex: 0 0 auto;
  margin: 18px 18px 0;
}

.food-map-detail-photo img {
  height: clamp(160px, 19vh, 220px);
  object-fit: cover;
  object-position: center;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px rgba(84, 53, 26, 0.08);
}

.food-map-detail-photo > button {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #e85a58;
  background: rgba(255, 251, 242, 0.92);
  box-shadow: 0 6px 16px rgba(76, 44, 20, 0.16);
}

.food-map-detail-status {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border-radius: 999px;
  color: #65813e;
  background: rgba(241, 246, 220, 0.94);
  font-size: 10px;
  font-weight: 900;
}

.food-map-detail-copy {
  display: grid;
  gap: 8px;
  padding: 18px 20px 15px;
  border-bottom: 1px solid var(--map-border);
}

.food-map-detail-copy h2 {
  overflow-wrap: anywhere;
  color: #3f2c1f;
  font-size: clamp(24px, 2vw, 31px);
  line-height: 1.05;
}

.food-map-detail-dish {
  color: #806b58;
  font-family: var(--font-serif);
  font-size: 14px;
  font-style: italic;
}

.food-map-detail-rating {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9a846f;
  font-size: 10px;
}

.food-map-detail-rating strong {
  color: #e89517;
  font-size: 13px;
}

.food-map-detail-line {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: #6e5947;
  font-size: 11px;
  line-height: 1.45;
}

.food-map-detail-line .app-icon {
  color: #b77a3d;
}

.food-map-note-card,
.food-map-related-recipe {
  display: grid;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--map-border);
}

.food-map-note-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #96734e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.food-map-note-card header span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.food-map-note-card header button {
  padding: 3px;
  border: 0;
  color: #a46936;
  background: transparent;
}

.food-map-note-card > p {
  color: #6d5846;
  font-family: var(--font-serif);
  font-size: 13px;
  font-style: italic;
  line-height: 1.65;
}

.food-map-related-recipe > .food-map-kicker {
  margin-bottom: 0;
}

.food-map-related-recipe > a {
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--map-border);
  border-radius: 12px;
  background: rgba(255, 253, 248, 0.7);
}

.food-map-related-recipe img {
  width: 66px;
  height: 55px;
  border-radius: 8px;
  object-fit: cover;
}

.food-map-related-recipe span {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.food-map-related-recipe strong {
  color: #4b3424;
  font-family: var(--font-serif);
  font-size: 12px;
  line-height: 1.3;
}

.food-map-related-recipe small {
  color: #96816e;
  font-size: 9px;
}

.food-map-detail-footer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  margin-top: auto;
  padding: 16px 18px 18px;
}

.food-map-detail-footer button {
  display: inline-flex;
  min-height: 43px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--map-border);
  border-radius: 10px;
  color: #745c48;
  background: #fffaf2;
  font-size: 10px;
  font-weight: 900;
}

.food-map-detail-footer button.danger {
  color: #d8473c;
  border-color: rgba(216, 71, 60, 0.22);
}

.food-map-detail-footer button.primary {
  border-color: #ee6a2f;
  color: #fff;
  background: linear-gradient(135deg, #f47a31, #e65224);
  box-shadow: 0 9px 18px rgba(222, 79, 32, 0.17);
}

.food-map-detail-empty {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  padding: 36px 24px;
  color: var(--map-muted);
  text-align: center;
}

.food-map-detail-empty > span {
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 4px;
  place-items: center;
  border: 1px solid rgba(225, 91, 43, 0.16);
  border-radius: 20px;
  color: #df5a2d;
  background: rgba(225, 91, 43, 0.06);
}

.food-map-detail-empty h2 {
  color: var(--map-text);
  font-size: 24px;
}

.food-map-detail-empty > p:last-of-type {
  max-width: 240px;
  font-size: 12px;
  line-height: 1.55;
}

.food-map-detail-empty button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  color: #fff;
  background: #e65b2c;
  font-size: 11px;
  font-weight: 900;
}

:deep(.leaflet-tile-pane) {
  filter: sepia(0.3) saturate(0.7) brightness(1.08) contrast(0.88);
}

:deep(.leaflet-control-attribution) {
  color: #806c58;
  background: rgba(255, 250, 241, 0.78);
}

:deep(.leaflet-control-zoom) {
  overflow: hidden;
  border: 1px solid rgba(128, 91, 52, 0.18) !important;
  border-radius: 11px;
  box-shadow: 0 7px 18px rgba(94, 61, 29, 0.14);
}

:deep(.leaflet-control-zoom a) {
  border-color: var(--map-border);
  color: #72563c;
  background: rgba(255, 250, 241, 0.96);
}

:deep(.food-map-marker-dot) {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 3px solid rgba(255, 255, 255, 0.96);
  border-radius: 50% 50% 50% 11px;
  color: #fff;
  background: var(--marker-color);
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--marker-color) 20%, transparent),
    0 8px 17px rgba(82, 50, 23, 0.25);
  transform: rotate(-45deg);
}

:deep(.food-map-marker-dot b) {
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 1;
  transform: rotate(45deg);
}

:deep(.food-map-marker-dot svg) {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(45deg);
}

:deep(.food-map-marker-dot.preview) {
  width: 40px;
  height: 40px;
}

:deep(.food-map-marker-dot.community) {
  width: 31px;
  height: 31px;
  border-width: 3px;
  opacity: 1;
}

:deep(.restaurant-marker) {
  width: 40px;
  height: 40px;
  border: 3px solid #fffaf2;
  border-radius: 12px;
  color: #fff;
  background: var(--restaurant-gradient, linear-gradient(135deg, #fb923c, #ea580c));
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--restaurant-color, #f97316) 18%, transparent),
    0 6px 16px rgba(104, 61, 22, 0.24);
}

:deep(.marker-cluster) {
  background: rgba(240, 122, 37, 0.2);
}

:deep(.marker-cluster div),
:deep(.restaurant-cluster) {
  color: #fff;
  background: linear-gradient(135deg, #f78a30, #dc5723);
}

:deep(.food-map-leaflet-popup .leaflet-popup-content-wrapper),
:deep(.restaurant-leaflet-popup .leaflet-popup-content-wrapper) {
  border-color: rgba(128, 91, 52, 0.18);
  border-radius: 14px;
  color: #4b3524;
  background: #fffaf2;
  box-shadow: 0 15px 30px rgba(91, 56, 25, 0.18);
}

:deep(.restaurant-leaflet-popup .leaflet-popup-content-wrapper) {
  overflow: hidden;
}

:deep(.food-map-leaflet-popup .leaflet-popup-tip),
:deep(.restaurant-leaflet-popup .leaflet-popup-tip) {
  background: #fffaf2;
}

:deep(.food-map-popup strong),
:deep(.restaurant-popup strong) {
  color: #433022;
}

:deep(.food-map-popup p),
:deep(.restaurant-popup-address),
:deep(.restaurant-popup-description) {
  color: #806c59;
}

:deep(.food-map-popup-location),
:deep(.restaurant-popup-meta) {
  color: #8a704f;
}

:deep(.food-map-popup-actions button) {
  border-color: rgba(226, 91, 43, 0.25);
  color: #d95328;
  background: rgba(226, 91, 43, 0.06);
}

@media (max-width: 1380px) {
  .food-map-page {
    grid-template-columns: 330px minmax(440px, 1fr) 320px;
  }

  .food-map-legend {
    gap: 8px;
    font-size: 9px;
  }

  .food-map-legend span:nth-last-child(2) {
    display: none;
  }
}

@media (max-width: 1120px) {
  .food-map-page {
    grid-template-columns: 330px minmax(0, 1fr);
    height: auto;
    min-height: calc(100svh - var(--nav-height));
    overflow: visible;
  }

  .food-map-sidebar {
    min-height: 720px;
  }

  .food-map-canvas {
    height: 720px;
    min-height: 720px;
  }

  .food-map-detail-panel {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(260px, 0.8fr) minmax(340px, 1.2fr);
    margin: 0 18px 18px;
    overflow: visible;
  }

  .food-map-detail-photo {
    grid-row: 1 / span 3;
  }

  .food-map-detail-photo img {
    height: 100%;
    min-height: 310px;
  }

  .food-map-detail-footer {
    margin-top: 0;
  }

  .food-map-detail-empty {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .food-map-page {
    display: grid;
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100svh;
  }

  .food-map-sidebar {
    min-height: 0;
    border-right: 0;
    box-shadow: none;
  }

  .food-map-sidebar-body {
    max-height: none;
  }

  .food-map-canvas {
    order: 0;
    height: 58vh;
    min-height: 430px;
    padding: 10px;
  }

  .food-map-leaflet {
    min-height: 410px;
    border-radius: 16px;
  }

  .food-map-city-label {
    top: 20px;
    min-width: 210px;
    padding-right: 20px;
    padding-left: 20px;
    font-size: 13px;
  }

  .food-map-legend {
    bottom: 22px;
    width: max-content;
    max-width: calc(100% - 28px);
    overflow-x: auto;
    justify-content: flex-start;
  }

  .food-map-legend span:nth-last-child(2) {
    display: inline-flex;
  }

  .food-map-detail-panel {
    grid-column: auto;
    display: flex;
    margin: 8px 10px 18px;
    border-radius: 16px;
  }

  .food-map-detail-photo {
    margin: 12px 12px 0;
  }

  .food-map-detail-photo img {
    height: 210px;
    min-height: 0;
  }
}

@media (max-width: 430px) {
  .food-map-sidebar-header {
    padding-right: 18px;
    padding-left: 22px;
  }

  .food-map-mode-toggle,
  .food-map-layer-toggle {
    margin-right: 14px;
    margin-left: 14px;
  }

  .food-map-sidebar-body {
    padding-right: 14px;
    padding-left: 14px;
  }

  .food-map-detail-footer {
    grid-template-columns: 1fr 1fr;
  }

  .food-map-detail-footer button.primary {
    grid-column: 1 / -1;
  }
}
</style>
