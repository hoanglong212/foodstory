<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import L from "leaflet";
import "leaflet.markercluster";
import AppIcon from "../components/AppIcon.vue";
import streetImage from "../assets/street.jpg";
import { useFoodSpotStore } from "../stores/foodSpotStore";
import { useRestaurantStore } from "../stores/restaurantStore";
import { useUiStore } from "../stores/uiStore";
import api, { getApiError } from "../services/api";

const HCMC_CENTER = [10.7769, 106.7009];
const MAX_VISIBLE_MARKERS = 100;
const MAX_RESTAURANT_MARKERS = 140;
const MARKER_CLUSTER_RADIUS = 92;
const RESTAURANT_CLUSTER_RADIUS = 104;
const categories = [
  "Pho",
  "Banh Mi",
  "Rice",
  "Rice Vermicelli",
  "Seafood",
  "Cafe",
  "Dessert",
  "Other",
];
const categoryLegend = [
  { label: "Vietnamese", color: "#f97316", icon: "utensils" },
  { label: "Noodles · Pho", color: "#a66cc4", icon: "bowl" },
  { label: "Cafe · Tea", color: "#b87949", icon: "store" },
  { label: "Bakery · Dessert", color: "#ef6f7b", icon: "chef-hat" },
  { label: "Seafood", color: "#3b9dbc", icon: "sparkles" },
];
const restaurantCategories = [
  "Snacks",
  "Thick Noodle Soup",
  "Steamed Rice Rolls",
  "Banh Mi",
  "Savory Pancakes",
  "Beef",
  "Rice Vermicelli",
  "Beef Noodle Soup",
  "Tofu Vermicelli",
  "Cafe",
  "Congee",
  "Sweet Soup",
  "Rice",
  "Chicken Rice",
  "Broken Rice",
  "Dim Sum",
  "Specialties",
  "Grilled Chicken",
  "Seafood",
  "Hu Tieu",
  "Hot Pot",
  "Noodles",
  "Grilled Pork Rolls",
  "Restaurant",
  "Pho",
  "Dessert",
  "Sticky Rice",
];
const districts = [
  "District 1",
  "District 2",
  "District 3",
  "District 4",
  "District 5",
  "District 6",
  "District 7",
  "District 8",
  "District 9",
  "District 10",
  "District 11",
  "District 12",
  "Binh Thanh",
  "Binh Tan",
  "Go Vap",
  "Phu Nhuan",
  "Tan Binh",
  "Tan Phu",
  "Thu Duc",
  "Thu Duc City",
  "Binh Chanh",
  "Can Gio",
  "Cu Chi",
  "Hoc Mon",
  "Nha Be",
];

const foodSpotStore = useFoodSpotStore();
const restaurantStore = useRestaurantStore();
const uiStore = useUiStore();
const route = useRoute();
const initialDish =
  typeof route.query.dish === "string" ? route.query.dish.trim() : "";
const initialMode = ["personal", "community", "stats"].includes(
  route.query.mode,
)
  ? route.query.mode
  : "personal";
const initialRecipeId = /^[1-9]\d*$/.test(String(route.query.recipe_id || ""))
  ? Number(route.query.recipe_id)
  : null;
const initialRestaurantId = /^[1-9]\d*$/.test(
  String(route.query.restaurant_id || ""),
)
  ? Number(route.query.restaurant_id)
  : null;
const initialFoodSpotId = /^[1-9]\d*$/.test(
  String(route.query.food_spot_id || ""),
)
  ? Number(route.query.food_spot_id)
  : null;
const shouldOpenAddDraft = route.query.add === "1";
const initialVisualDraft = {
  dish_name:
    typeof route.query.dish === "string" ? route.query.dish.trim() : "",
  category:
    typeof route.query.category === "string"
      ? route.query.category.trim()
      : "",
  notes:
    typeof route.query.notes === "string" ? route.query.notes.trim() : "",
};
const mapElement = ref(null);
const mapInitialised = ref(false);
const mapMode = ref(initialMode);
const sidebarMode = ref("list");
const showRestaurants = ref(true);
const showPersonalSpots = ref(true);
const restaurantFiltersOpen = ref(false);
const isFilterDrawerOpen = ref(false);
const isDetailDrawerOpen = ref(false);
const isResultSheetOpen = ref(true);
const scanUrl = ref(initialDish);
const scanInput = ref(null);
const discoveryFileInput = ref(null);
const discoveryHintInput = ref(null);
const discoveryFile = ref(null);
const discoveryPreviewUrl = ref("");
const discoveryHint = ref("");
const discoveryResult = ref(null);
const discoveryError = ref("");
const discoveryPanelOpen = ref(false);
const discoveryLoading = ref(false);
const discoveryLoadingStep = ref(0);
const discoveryDragging = ref(false);
const selectedRestaurant = ref(null);
const selectedCommunitySpot = ref(null);
const savedPlaceKeys = ref(new Set());
const pickingMode = ref(false);
const editingSpotId = ref(null);
const submitting = ref(false);
const deletingSpotId = ref(null);
const filters = reactive({ district: "", category: "", rating: "" });
const communityFilters = reactive({ district: "", category: "" });
const communitySearch = ref(initialDish);
const personalSearch = ref("");
const restaurantFilters = reactive({
  district: "",
  category: "",
  search: initialDish,
  min_rating: "",
});
const formErrors = reactive({});
const form = reactive(emptyForm());

let map = null;
let markerCluster = null;
let restaurantCluster = null;
let previewMarker = null;
let filterTimer = 0;
let communitySearchTimer = 0;
let restaurantSearchTimer = 0;
let popupTimer = 0;
let layoutTimer = 0;
let discoveryLoadingTimer = 0;
let markerRenderFrame = 0;
let restaurantRenderFrame = 0;
const markersById = new Map();
const discoveryLoadingSteps = [
  "Reading image text",
  "Identifying dish signals",
  "Finding the real-world place",
  "Checking FoodStory Map",
  "Preparing result",
];

const selectedSpot = computed(() => foodSpotStore.selectedSpot);
const discoveryStatusLabel = computed(() => {
  const labels = {
    external_place_found_in_foodmap: "Found in FoodStory Map",
    external_place_found_not_in_foodmap: "Place found outside FoodStory Map",
    external_place_not_found_dish_identified: "Dish identified",
    external_place_not_found_unclear: "Place and dish unclear",
    url_extraction_failed: "Screenshot needed",
    unclear: "Input unclear",
  };
  return labels[discoveryResult.value?.status] || "Food Map discovery";
});
const isEditing = computed(() => editingSpotId.value !== null);
const isCommunityMode = computed(() => mapMode.value === "community");
const spotLayerLabel = computed(() =>
  isCommunityMode.value ? "Community Places" : "My Places",
);
const visibleSpots = computed(() =>
  isCommunityMode.value ? foodSpotStore.communitySpots : foodSpotStore.spots,
);
const hasActiveFilters = computed(() =>
  Boolean(filters.district || filters.category || filters.rating),
);
const hasCommunityFilters = computed(() =>
  Boolean(
    communitySearch.value ||
    communityFilters.district ||
    communityFilters.category,
  ),
);
const displayedPersonalSpots = computed(() => {
  const query = personalSearch.value.trim().toLocaleLowerCase("en");
  if (!query) return foodSpotStore.spots;

  return foodSpotStore.spots.filter((spot) =>
    [spot.name, spot.dish_name, spot.category, spot.district]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("en").includes(query)),
  );
});
const featuredSpot = computed(() => {
  if (mapMode.value !== "personal") return null;
  return selectedSpot.value || displayedPersonalSpots.value[0] || null;
});
const selectedDiscovery = computed(() => {
  if (selectedRestaurant.value) {
    return normalizeDiscovery(selectedRestaurant.value, "restaurant");
  }
  if (selectedCommunitySpot.value) {
    return normalizeDiscovery(selectedCommunitySpot.value, "community");
  }
  if (selectedSpot.value) {
    return normalizeDiscovery(selectedSpot.value, "personal");
  }
  return null;
});
const resultPlaces = computed(() => {
  const spotType = isCommunityMode.value ? "community" : "personal";
  const spots = (
    isCommunityMode.value
      ? foodSpotStore.communitySpots
      : displayedPersonalSpots.value
  ).map((spot) => normalizeDiscovery(spot, spotType));
  const restaurants = restaurantStore.restaurants.map((restaurant) =>
    normalizeDiscovery(restaurant, "restaurant"),
  );
  const visibleRestaurants = showRestaurants.value ? restaurants : [];
  const visibleFoodSpots = showPersonalSpots.value ? spots : [];
  const combined = [];
  const longestList = Math.max(
    visibleRestaurants.length,
    visibleFoodSpots.length,
  );

  for (let index = 0; index < longestList && combined.length < 18; index += 1) {
    if (visibleRestaurants[index]) combined.push(visibleRestaurants[index]);
    if (visibleFoodSpots[index] && combined.length < 18) {
      combined.push(visibleFoodSpots[index]);
    }
  }

  return combined;
});
const resultSheetSubtitle = computed(() => {
  if (scanUrl.value.trim()) {
    return "Based on your latest scan or current filters";
  }
  if (
    hasActiveFilters.value ||
    hasCommunityFilters.value ||
    restaurantFilters.search.trim() ||
    restaurantFilters.district ||
    restaurantFilters.category ||
    restaurantFilters.min_rating
  ) {
    return "Updated using your current filters";
  }
  return "Featured food places around Ho Chi Minh City";
});
const sidebarCount = computed(() => {
  if (mapMode.value === "personal") return displayedPersonalSpots.value.length;
  return visibleSpots.value.length;
});
const sidebarKicker = computed(() => {
  if (mapMode.value === "community") return "FoodStory community";
  if (mapMode.value === "stats") return "Your journey";
  return "Personal FoodStory";
});
const sidebarTitle = computed(() => {
  if (mapMode.value === "community") return "Community Food Map";
  if (mapMode.value === "stats") return "Food Statistics";
  return "My Food Map";
});
const communityResultText = computed(() => {
  const count = foodSpotStore.communitySpots.length;
  const query = communitySearch.value.trim();
  if (!query) return `${count} community places`;
  if (count === 0) return `No places found for "${query}"`;
  return `${count} results for "${query}"`;
});
const personalStats = computed(() => {
  const spots = foodSpotStore.spots;
  const ratedSpots = spots.filter((spot) => Number(spot.rating) > 0);
  const averageRating = ratedSpots.length
    ? ratedSpots.reduce((sum, spot) => sum + Number(spot.rating), 0) /
      ratedSpots.length
    : 0;

  const createRanking = (field) => {
    const counts = new Map();
    spots.forEach((spot) => {
      const label = String(spot[field] || "").trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({
        label,
        count,
        percentage: spots.length ? Math.round((count / spots.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"))
      .slice(0, 3);
  };

  const districtsRanking = createRanking("district");
  const dishesRanking = createRanking("dish_name");
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = spots.filter((spot) => Number(spot.rating) === rating).length;
    return {
      rating,
      count,
      percentage: spots.length ? Math.round((count / spots.length) * 100) : 0,
    };
  });

  return {
    total: spots.length,
    averageRating,
    favoriteDistrict: districtsRanking[0]?.label || "Not available",
    districtsRanking,
    dishesRanking,
    ratingDistribution,
    recent: [...spots]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 3),
  };
});

function normalizeDiscovery(place, type) {
  const isRestaurant = type === "restaurant";
  const rating = Number(isRestaurant ? place.avg_rating : place.rating) || 0;
  const district = place.district || "Ho Chi Minh City";

  return {
    key: `${type}-${place.id}`,
    id: place.id,
    type,
    raw: place,
    name: place.name || "Food place",
    dish: isRestaurant
      ? place.description || place.category || "Recommended food destination"
      : place.dish_name || "A delicious dish waiting to be discovered",
    category: place.category || (isRestaurant ? "Restaurant" : "Food"),
    rating,
    district,
    address: place.address || district,
    price: place.price_range || "",
    description:
      place.description ||
      place.notes ||
      "No detailed description is available for this place.",
    openingHours: place.opening_hours || place.hours || "",
    source:
      place.source ||
      place.social_source ||
      (type === "community"
        ? "FoodStory community"
        : isRestaurant
          ? "FoodStory selection"
          : "Your journal"),
    distance: place.distance || place.distance_km || "",
    image: place.image_url || place.image || streetImage,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    isOwned: type === "personal",
  };
}

function invalidateMapAfterTransition() {
  window.clearTimeout(layoutTimer);
  layoutTimer = window.setTimeout(() => {
    if (map) map.invalidateSize({ pan: false });
  }, 340);
}

function setFilterDrawer(open) {
  isFilterDrawerOpen.value = open;
  invalidateMapAfterTransition();
}

function setDetailDrawer(open) {
  isDetailDrawerOpen.value = open;
  invalidateMapAfterTransition();
}

function toggleResultSheet() {
  isResultSheetOpen.value = !isResultSheetOpen.value;
  invalidateMapAfterTransition();
}

function emptyForm() {
  return {
    name: "",
    dish_name: "",
    category: "",
    district: "",
    latitude: "",
    longitude: "",
    rating: null,
    notes: "",
    tags: "",
    recipe_id: null,
  };
}

function resetForm() {
  Object.assign(form, emptyForm());
  Object.keys(formErrors).forEach((key) => delete formErrors[key]);
  editingSpotId.value = null;
  clearPreviewMarker();
  stopPicking();
}

function markerColor(rating) {
  const value = Number(rating || 0);
  if (value === 5) return "#f7b731";
  if (value === 4) return "#43aa8b";
  if (value === 3) return "#4d96ff";
  if (value > 0) return "#8b9098";
  return "#e6504f";
}

function normalizedCategory(category) {
  return String(category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en");
}

function categoryColor(category) {
  const text = normalizedCategory(category);
  if (
    text.includes("pho") ||
    text.includes("noodle") ||
    text.includes("vermicelli")
  )
    return "#a66cc4";
  if (text.includes("cafe") || text.includes("coffee") || text.includes("tea"))
    return "#b87949";
  if (
    text.includes("banh") ||
    text.includes("dessert") ||
    text.includes("sweet") ||
    text.includes("bakery")
  )
    return "#ef6f7b";
  if (text.includes("seafood")) return "#3b9dbc";
  if (text.includes("rice")) return "#74a05c";
  return "#f97316";
}

function restaurantCategoryTheme(category) {
  const text = normalizedCategory(category);
  if (text.includes("pho")) {
    return {
      emoji: "🍜",
      color: "#a66cc4",
      gradient: "linear-gradient(135deg, #c084fc 0%, #7e3aad 100%)",
    };
  }
  if (text.includes("broken rice") || text.includes("chicken rice")) {
    return {
      emoji: "🍚",
      color: "#74a05c",
      gradient: "linear-gradient(135deg, #9fca72 0%, #4d7f3f 100%)",
    };
  }
  if (text.includes("banh mi")) {
    return {
      emoji: "🥖",
      color: "#d9862f",
      gradient: "linear-gradient(135deg, #f6b04f 0%, #c5661f 100%)",
    };
  }
  if (text.includes("seafood")) {
    return {
      emoji: "🦐",
      color: "#3b9dbc",
      gradient: "linear-gradient(135deg, #58c4dd 0%, #247b9c 100%)",
    };
  }
  if (text.includes("hot pot")) {
    return {
      emoji: "🫕",
      color: "#e6504f",
      gradient: "linear-gradient(135deg, #ff8a65 0%, #c7362f 100%)",
    };
  }
  if (text.includes("cafe") || text.includes("coffee")) {
    return {
      emoji: "☕",
      color: "#b87949",
      gradient: "linear-gradient(135deg, #d59b66 0%, #7a4a2c 100%)",
    };
  }
  if (text.includes("dessert") || text.includes("sweet")) {
    return {
      emoji: "🍰",
      color: "#ef6f7b",
      gradient: "linear-gradient(135deg, #ff9aa5 0%, #d94b60 100%)",
    };
  }
  if (text.includes("snack") || text.includes("fast food")) {
    return {
      emoji: "🍔",
      color: "#f97316",
      gradient: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
    };
  }
  if (text.includes("vegetarian")) {
    return {
      emoji: "🥗",
      color: "#74a05c",
      gradient: "linear-gradient(135deg, #9fca72 0%, #4d7f3f 100%)",
    };
  }
  if (text.includes("dim sum") || text.includes("dimsum")) {
    return {
      emoji: "🥟",
      color: "#ef6f7b",
      gradient: "linear-gradient(135deg, #ff9aa5 0%, #d94b60 100%)",
    };
  }
  return {
    emoji: "🍽️",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
  };
}

function communityMarkerColor(rating) {
  const value = Number(rating || 0);
  if (value >= 5) return "#3d9cff";
  if (value >= 4) return "#4f8fe8";
  if (value >= 3) return "#5f83cf";
  return "#6f7fa8";
}

function ratingText(rating) {
  const value = Number(rating || 0);
  return value ? `${"★".repeat(value)}${"☆".repeat(5 - value)}` : "Not rated";
}

function safeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markerImage(place) {
  // Use only data-provided images to avoid loading the same large fallback for every marker.
  return place?.image_url || place?.image || place?.thumbnail || "";
}

function markerIcon(spot, preview = false, community = false) {
  const color = preview
    ? "#f4a261"
    : community
      ? communityMarkerColor(spot.rating)
      : categoryColor(spot.category);
  const rating = Number(spot.rating || 0);
  const ratingLabel = preview
    ? "Select"
    : rating
      ? `★ ${rating.toFixed(1)}`
      : community
        ? "New"
        : "New";
  const image = markerImage(spot);
  const theme = restaurantCategoryTheme(
    spot?.category || spot?.dish_name || "",
  );
  const content = preview
    ? "+"
    : image
      ? `<img src="${safeHtml(image)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="taste-food-marker-emoji">${safeHtml(theme.emoji || "🍽️")}</span>`;

  return L.divIcon({
    className: "food-map-marker-shell",
    html: `<div class="taste-food-marker${preview ? " preview" : ""}${community ? " community" : ""}" style="--marker-color:${safeHtml(color)};--restaurant-gradient:${safeHtml(theme.gradient)}"><span class="taste-food-marker-core" aria-hidden="true">${content}</span><span class="taste-food-marker-rating">${safeHtml(ratingLabel)}</span></div>`,
    iconSize: [58, 72],
    iconAnchor: [29, 58],
    popupAnchor: [0, -58],
  });
}

function restaurantMarkerIcon(restaurant) {
  const theme = restaurantCategoryTheme(restaurant?.category);
  const rating = Number(restaurant?.avg_rating || 0);
  const image = markerImage(restaurant);
  const ratingLabel = rating ? `★ ${rating.toFixed(1)}` : "Explore";
  const content = image
    ? `<img src="${safeHtml(image)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="taste-food-marker-emoji">${safeHtml(theme.emoji || "🍽️")}</span>`;

  return L.divIcon({
    className: "restaurant-marker-shell",
    html: `<div class="taste-food-marker restaurant" style="--marker-color:${safeHtml(theme.color)};--restaurant-gradient:${safeHtml(theme.gradient)}"><span class="taste-food-marker-core" aria-hidden="true">${content}</span><span class="taste-food-marker-rating">${safeHtml(ratingLabel)}</span></div>`,
    iconSize: [58, 72],
    iconAnchor: [29, 58],
    popupAnchor: [0, -58],
  });
}

function restaurantRatingText(rating) {
  const value = Math.min(Math.max(Number(rating || 0), 0), 5);
  const filled = Math.floor(value);
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}  ${value.toFixed(1)}`;
}

function restaurantPopupContent(restaurant) {
  const theme = restaurantCategoryTheme(restaurant.category);
  const container = document.createElement("div");
  container.className = "restaurant-popup";
  container.style.setProperty("--restaurant-color", theme.color);
  container.style.setProperty("--restaurant-gradient", theme.gradient);

  const banner = document.createElement("div");
  banner.className = "restaurant-popup-banner";
  banner.setAttribute("aria-label", restaurant.category || "Restaurant");

  const emoji = document.createElement("span");
  emoji.className = "restaurant-popup-emoji";
  emoji.textContent = theme.emoji;
  banner.append(emoji);

  const body = document.createElement("div");
  body.className = "restaurant-popup-body";

  const name = document.createElement("strong");
  name.textContent = restaurant.name;

  const address = document.createElement("p");
  address.className = "restaurant-popup-address";
  address.textContent = restaurant.address || "Address not available";

  const meta = document.createElement("div");
  meta.className = "restaurant-popup-meta";

  const district = document.createElement("span");
  district.textContent = restaurant.district || "Ho Chi Minh City";

  const price = document.createElement("span");
  const priceLevel = Math.min(String(restaurant.price_range || "").length, 3);
  price.className = `restaurant-popup-price price-${priceLevel || 1}`;
  price.textContent = restaurant.price_range || "Price not available";
  meta.append(district, price);

  const rating = document.createElement("span");
  rating.className = "restaurant-popup-rating";
  rating.textContent = restaurantRatingText(restaurant.avg_rating);

  const description = document.createElement("p");
  description.className = "restaurant-popup-description";
  description.textContent =
    restaurant.description ||
    "No description is available for this restaurant.";

  const directions = document.createElement("button");
  directions.type = "button";
  directions.className = "restaurant-popup-directions";
  directions.textContent = "Directions";
  directions.addEventListener("click", (event) => {
    event.stopPropagation();
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${restaurant.latitude},${restaurant.longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  body.append(name, address, meta, rating, description, directions);
  container.append(banner, body);
  return container;
}

function popupContent(spot, community = false) {
  const container = document.createElement("div");
  container.className = "food-map-popup";

  const category = document.createElement("span");
  category.className = "food-map-popup-kicker";
  category.textContent = spot.category || "Food place";

  const name = document.createElement("strong");
  name.textContent = spot.name;

  const dish = document.createElement("p");
  dish.textContent = spot.dish_name || "No dish name added";

  const rating = document.createElement("span");
  rating.className = "food-map-popup-rating";
  rating.textContent = ratingText(spot.rating);

  const location = document.createElement("span");
  location.className = "food-map-popup-location";
  location.textContent = spot.district || "Ho Chi Minh City";

  if (community) {
    container.classList.add("community");
    container.append(category, name, dish, location, rating);
    return container;
  }

  const actions = document.createElement("div");
  actions.className = "food-map-popup-actions";

  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.textContent = "View Details";
  detailButton.addEventListener("click", () => showDetail(spot, false));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => removeSpot(spot));

  actions.append(detailButton, deleteButton);
  container.append(category, name, dish, location, rating, actions);
  return container;
}

function syncLayerVisibility() {
  if (!map) return;

  if (markerCluster) {
    if (showPersonalSpots.value && !map.hasLayer(markerCluster)) {
      map.addLayer(markerCluster);
    } else if (!showPersonalSpots.value && map.hasLayer(markerCluster)) {
      map.removeLayer(markerCluster);
    }
  }

  if (restaurantCluster) {
    if (showRestaurants.value && !map.hasLayer(restaurantCluster)) {
      map.addLayer(restaurantCluster);
    } else if (!showRestaurants.value && map.hasLayer(restaurantCluster)) {
      map.removeLayer(restaurantCluster);
    }
  }
}

function scheduleMarkerRender() {
  if (markerRenderFrame) window.cancelAnimationFrame(markerRenderFrame);
  markerRenderFrame = window.requestAnimationFrame(() => {
    markerRenderFrame = 0;
    renderMarkers();
  });
}

function scheduleRestaurantRender() {
  if (restaurantRenderFrame) window.cancelAnimationFrame(restaurantRenderFrame);
  restaurantRenderFrame = window.requestAnimationFrame(() => {
    restaurantRenderFrame = 0;
    renderRestaurantMarkers();
  });
}

function renderMarkers() {
  if (!map || !markerCluster) return;

  const community = isCommunityMode.value;
  markerCluster.clearLayers();
  markersById.clear();

  const layers = visibleSpots.value
    .filter(
      (spot) =>
        Number.isFinite(Number(spot.latitude)) &&
        Number.isFinite(Number(spot.longitude)),
    )
    .slice(0, MAX_VISIBLE_MARKERS)
    .map((spot) => {
      const marker = L.marker([Number(spot.latitude), Number(spot.longitude)], {
        icon: markerIcon(spot, false, community),
        title: spot.name,
        opacity: community ? 0.86 : 1,
        riseOnHover: true,
      });

      marker.bindPopup(popupContent(spot, community), {
        className: "food-map-leaflet-popup",
        maxWidth: 280,
      });
      marker.on("click", (event) => {
        if (pickingMode.value) return;
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        if (community) {
          showCommunityDetail(spot);
        } else {
          showDetail(spot, false);
        }
      });
      markersById.set(spot.id, marker);
      return marker;
    });

  if (layers.length) markerCluster.addLayers(layers);
  syncLayerVisibility();
}

function renderRestaurantMarkers() {
  if (!map || !restaurantCluster) return;

  restaurantCluster.clearLayers();
  const layers = restaurantStore.restaurants
    .filter(
      (restaurant) =>
        Number.isFinite(Number(restaurant.latitude)) &&
        Number.isFinite(Number(restaurant.longitude)),
    )
    .slice(0, MAX_RESTAURANT_MARKERS)
    .map((restaurant) => {
      const marker = L.marker(
        [Number(restaurant.latitude), Number(restaurant.longitude)],
        {
          icon: restaurantMarkerIcon(restaurant),
          title: restaurant.name,
          zIndexOffset: 200,
          riseOnHover: true,
        },
      );
      marker.bindPopup(restaurantPopupContent(restaurant), {
        className: "restaurant-leaflet-popup",
        maxWidth: 300,
      });
      marker.on("click", (event) => {
        if (pickingMode.value) return;
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        showRestaurantDetail(restaurant);
      });
      return marker;
    });

  if (layers.length) restaurantCluster.addLayers(layers);
  syncLayerVisibility();
}

function initialiseMap() {
  if (mapInitialised.value || !mapElement.value) return;

  map = L.map(mapElement.value, {
    center: HCMC_CENTER,
    zoom: 13.5,
    zoomControl: false,
    preferCanvas: true,
    zoomSnap: 0.25,
    wheelDebounceTime: 90,
    wheelPxPerZoomLevel: 120,
    fadeAnimation: false,
    markerZoomAnimation: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap © CARTO",
      maxZoom: 20,
      maxNativeZoom: 18,
      detectRetina: false,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
    },
  ).addTo(map);

  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: MARKER_CLUSTER_RADIUS,
    spiderfyOnMaxZoom: false,
    spiderfyOnEveryZoom: false,
    removeOutsideVisibleBounds: true,
    animateAddingMarkers: false,
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 32,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="taste-map-cluster">${count > 99 ? "99+" : count}</div>`,
        className: "taste-map-cluster-shell",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
    },
  });
  restaurantCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: RESTAURANT_CLUSTER_RADIUS,
    spiderfyOnMaxZoom: false,
    spiderfyOnEveryZoom: false,
    removeOutsideVisibleBounds: true,
    animateAddingMarkers: false,
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 32,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="taste-map-cluster restaurant">${count > 99 ? "99+" : count}</div>`,
        className: "taste-map-cluster-shell",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
    },
  });
  syncLayerVisibility();
  map.on("click", handleMapClick);
  mapInitialised.value = true;
  window.setTimeout(() => map?.invalidateSize(), 0);
}

function handleMapClick(event) {
  if (!pickingMode.value) return;

  form.latitude = event.latlng.lat.toFixed(7);
  form.longitude = event.latlng.lng.toFixed(7);
  delete formErrors.coordinates;
  showPreviewMarker(event.latlng.lat, event.latlng.lng);
  stopPicking();
}

function showPreviewMarker(latitude, longitude) {
  clearPreviewMarker();
  if (!map) return;

  previewMarker = L.marker([latitude, longitude], {
    icon: markerIcon({}, true),
    zIndexOffset: 1000,
  })
    .addTo(map)
    .bindTooltip("Selected location", { direction: "top", offset: [0, -16] });
}

function clearPreviewMarker() {
  if (map && previewMarker) map.removeLayer(previewMarker);
  previewMarker = null;
}

function startPicking() {
  pickingMode.value = true;
  mapElement.value?.classList.add("is-picking");
  map?.closePopup();
}

function stopPicking() {
  pickingMode.value = false;
  mapElement.value?.classList.remove("is-picking");
}

async function fetchSpots() {
  try {
    await foodSpotStore.fetchSpots({
      district: filters.district || undefined,
      category: filters.category || undefined,
      rating: filters.rating || undefined,
    });
    scheduleMarkerRender();
  } catch (error) {
    uiStore.setError(error.message, {
      title: "Map could not be loaded",
      eyebrow: "Food map",
    });
  }
}

async function fetchAllPersonalSpots() {
  try {
    await foodSpotStore.fetchSpots();
    scheduleMarkerRender();
  } catch (error) {
    uiStore.setError(error.message, {
      title: "Statistics could not be loaded",
      eyebrow: "Food map",
    });
  }
}

async function fetchCommunitySpots() {
  try {
    await foodSpotStore.fetchCommunitySpots({
      dish: communitySearch.value.trim() || undefined,
      district: communityFilters.district || undefined,
      category: communityFilters.category || undefined,
    });
    scheduleMarkerRender();
  } catch (error) {
    uiStore.setError(error.message, {
      title: "Community places could not be loaded",
      eyebrow: "Food map",
    });
  }
}

async function fetchRestaurants() {
  try {
    await restaurantStore.fetchRestaurants({
      district: restaurantFilters.district || undefined,
      category: restaurantFilters.category || undefined,
      search: restaurantFilters.search.trim() || undefined,
      min_rating: restaurantFilters.min_rating || undefined,
    });
    scheduleRestaurantRender();
  } catch (error) {
    uiStore.setError(error.message, {
      title: "Restaurants could not be loaded",
      eyebrow: "Restaurant layer",
    });
  }
}

async function applyRestaurantFilters() {
  window.clearTimeout(restaurantSearchTimer);
  await fetchRestaurants();
}

async function clearRestaurantFilters() {
  Object.assign(restaurantFilters, {
    district: "",
    category: "",
    search: "",
    min_rating: "",
  });
  await nextTick();
  window.clearTimeout(restaurantSearchTimer);
  await fetchRestaurants();
}

async function setMapMode(mode) {
  if (!["personal", "community", "stats"].includes(mode)) return;

  mapMode.value = mode;
  sidebarMode.value = "list";
  foodSpotStore.setSelectedSpot(null);
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  setDetailDrawer(false);
  stopPicking();
  clearPreviewMarker();
  map?.closePopup();
  markerCluster?.clearLayers();

  if (mode === "community") {
    await fetchCommunitySpots();
  } else if (mode === "stats") {
    await fetchAllPersonalSpots();
  } else {
    await fetchSpots();
  }
}

function openAddForm(prefill = {}) {
  foodSpotStore.setSelectedSpot(null);
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  setDetailDrawer(false);
  resetForm();
  Object.assign(form, prefill);
  sidebarMode.value = "add";
  setFilterDrawer(true);
}

async function addFromRecipe() {
  await setMapMode("personal");
  openAddForm({
    dish_name: initialDish,
    recipe_id: initialRecipeId,
  });
}

async function addFromStats() {
  await setMapMode("personal");
  openAddForm();
}

function cancelForm() {
  resetForm();
  sidebarMode.value = "list";
}

function editSpot(spot) {
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  editingSpotId.value = spot.id;
  Object.assign(form, {
    name: spot.name || "",
    dish_name: spot.dish_name || "",
    category: spot.category || "",
    district: spot.district || "",
    latitude: String(spot.latitude ?? ""),
    longitude: String(spot.longitude ?? ""),
    rating: spot.rating || null,
    notes: spot.notes || "",
    tags: spot.tags || "",
    recipe_id: spot.recipe_id || null,
  });
  Object.keys(formErrors).forEach((key) => delete formErrors[key]);
  showPreviewMarker(spot.latitude, spot.longitude);
  sidebarMode.value = "add";
  setDetailDrawer(false);
  setFilterDrawer(true);
}

function validateForm() {
  Object.keys(formErrors).forEach((key) => delete formErrors[key]);
  if (!form.name.trim()) formErrors.name = "Enter a place name.";

  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  if (
    form.latitude === "" ||
    form.longitude === "" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    formErrors.coordinates = "Select a location on the map.";
  }
  return Object.keys(formErrors).length === 0;
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
  };
}

async function submitForm() {
  if (!validateForm() || submitting.value) return;

  const wasEditing = isEditing.value;
  submitting.value = true;
  try {
    const spot = wasEditing
      ? await foodSpotStore.updateSpot(editingSpotId.value, payload())
      : await foodSpotStore.addSpot(payload());

    clearPreviewMarker();
    editingSpotId.value = null;
    foodSpotStore.setSelectedSpot(spot);
    sidebarMode.value = "list";
    scheduleMarkerRender();
    setFilterDrawer(false);
    showDetail(spot);
    uiStore.setSuccess(
      wasEditing ? "The place was updated." : "The new place was saved.",
      {
        title: wasEditing ? "Update successful" : "Added to the map",
        eyebrow: "Personal food map",
        icon: "map-pin",
      },
    );
  } catch (error) {
    formErrors.submit = error.message;
  } finally {
    submitting.value = false;
  }
}

function focusSpot(spot, openPopup = true) {
  if (!map || !spot) return;
  map.flyTo([spot.latitude, spot.longitude], 16, { duration: 0.8 });
  if (openPopup) {
    window.clearTimeout(popupTimer);
    popupTimer = window.setTimeout(() => {
      const marker = markersById.get(spot.id);
      if (!marker || !markerCluster) return;
      markerCluster.zoomToShowLayer(marker, () => marker.openPopup());
    }, 500);
  }
}

function showDetail(spot, moveMap = true) {
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  foodSpotStore.setSelectedSpot(spot);
  sidebarMode.value = "list";
  stopPicking();
  clearPreviewMarker();
  if (moveMap) focusSpot(spot);
  setFilterDrawer(false);
  setDetailDrawer(true);
}

function showCommunityDetail(spot, moveMap = true) {
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = spot;
  foodSpotStore.setSelectedSpot(null);
  stopPicking();
  clearPreviewMarker();
  if (moveMap) focusCoordinates(spot);
  setFilterDrawer(false);
  setDetailDrawer(true);
}

function showRestaurantDetail(restaurant, moveMap = true) {
  selectedCommunitySpot.value = null;
  selectedRestaurant.value = restaurant;
  foodSpotStore.setSelectedSpot(null);
  stopPicking();
  clearPreviewMarker();
  if (moveMap) focusCoordinates(restaurant);
  setFilterDrawer(false);
  setDetailDrawer(true);
}

function focusCoordinates(place) {
  if (
    !map ||
    !Number.isFinite(Number(place?.latitude)) ||
    !Number.isFinite(Number(place?.longitude))
  )
    return;
  map.flyTo([Number(place.latitude), Number(place.longitude)], 16, {
    duration: 0.8,
  });
}

function selectDiscovery(place) {
  if (!place) return;
  if (place.type === "restaurant") {
    showRestaurantDetail(place.raw);
  } else if (place.type === "community") {
    showCommunityDetail(place.raw);
  } else {
    showDetail(place.raw);
  }
}

function backToList() {
  foodSpotStore.setSelectedSpot(null);
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  sidebarMode.value = "list";
  stopPicking();
  clearPreviewMarker();
  map?.closePopup();
  setDetailDrawer(false);
}

async function removeSpot(spot) {
  if (!spot || deletingSpotId.value) return;
  if (!window.confirm(`Delete "${spot.name}" from your food map?`)) return;

  deletingSpotId.value = spot.id;
  try {
    await foodSpotStore.removeSpot(spot.id);
    scheduleMarkerRender();
    sidebarMode.value = "list";
    setDetailDrawer(false);
    uiStore.setSuccess("The place was removed from the map.", {
      title: "Place deleted",
      eyebrow: "Personal food map",
      icon: "trash",
    });
  } catch (error) {
    uiStore.setError(error.message, {
      title: "Place could not be deleted",
      eyebrow: "Food map",
    });
  } finally {
    deletingSpotId.value = null;
  }
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

function validateDiscoveryFile(file) {
  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);
  if (!allowedTypes.has(file.type)) {
    return "Choose a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "The image must be 5MB or smaller.";
  }
  return "";
}

function revokeDiscoveryPreview() {
  if (!discoveryPreviewUrl.value) return;
  URL.revokeObjectURL(discoveryPreviewUrl.value);
  discoveryPreviewUrl.value = "";
}

function selectDiscoveryFile(file) {
  const validationError = validateDiscoveryFile(file);
  if (validationError) {
    discoveryError.value = validationError;
    return;
  }

  revokeDiscoveryPreview();
  discoveryFile.value = file;
  discoveryPreviewUrl.value = URL.createObjectURL(file);
  discoveryResult.value = null;
  discoveryError.value = "";
  discoveryPanelOpen.value = true;
}

function handleDiscoveryFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) selectDiscoveryFile(file);
}

function handleDiscoveryDrop(event) {
  discoveryDragging.value = false;
  if (discoveryLoading.value) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) selectDiscoveryFile(file);
}

function openDiscoveryFilePicker() {
  discoveryPanelOpen.value = true;
  if (!discoveryLoading.value) discoveryFileInput.value?.click();
}

function startDiscoveryLoading() {
  discoveryLoadingStep.value = 0;
  window.clearInterval(discoveryLoadingTimer);
  discoveryLoadingTimer = window.setInterval(() => {
    if (discoveryLoadingStep.value < discoveryLoadingSteps.length - 2) {
      discoveryLoadingStep.value += 1;
    }
  }, 650);
}

function stopDiscoveryLoading() {
  window.clearInterval(discoveryLoadingTimer);
  discoveryLoadingTimer = 0;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function focusDiscoveryFoodMapMatch(match) {
  if (!match) return;

  if (match.sourceType === "restaurant") {
    showRestaurants.value = true;
    Object.assign(restaurantFilters, {
      district: "",
      category: "",
      search: "",
      min_rating: "",
    });
    await fetchRestaurants();
    const restaurant =
      restaurantStore.restaurants.find(
        (item) => Number(item.id) === Number(match.sourceId),
      ) || {
        id: Number(match.sourceId),
        name: match.name,
        category: match.category,
        district: match.district,
        address: match.address,
        latitude: match.latitude,
        longitude: match.longitude,
        avg_rating: 0,
      };
    showRestaurantDetail(restaurant);
  } else if (match.sourceType === "food_spot") {
    communitySearch.value = "";
    Object.assign(communityFilters, { district: "", category: "" });
    await setMapMode("community");
    const spot =
      foodSpotStore.communitySpots.find(
        (item) => Number(item.id) === Number(match.sourceId),
      ) || {
        id: Number(match.sourceId),
        name: match.name,
        dish_name: match.dishName,
        category: match.category,
        district: match.district,
        latitude: match.latitude,
        longitude: match.longitude,
        rating: null,
      };
    showCommunityDetail(spot);
  }

  isResultSheetOpen.value = true;
}

function discoveryDraftPrefill(draft) {
  if (!draft) return {};
  return {
    name: draft.name || "",
    dish_name: draft.dish_name || "",
    category: draft.category || "",
    district: draft.district || "",
    latitude:
      draft.latitude === null || draft.latitude === undefined
        ? ""
        : String(draft.latitude),
    longitude:
      draft.longitude === null || draft.longitude === undefined
        ? ""
        : String(draft.longitude),
    notes: draft.notes || "",
    tags: draft.tags || "",
  };
}

async function addDiscoveryDraft() {
  const draft = discoveryResult.value?.suggestedDraft;
  if (!draft) return;
  await setMapMode("personal");
  openAddForm(discoveryDraftPrefill(draft));
  discoveryPanelOpen.value = false;
}

function resetFoodMapDiscovery() {
  stopDiscoveryLoading();
  revokeDiscoveryPreview();
  discoveryFile.value = null;
  discoveryHint.value = "";
  discoveryResult.value = null;
  discoveryError.value = "";
  discoveryLoadingStep.value = 0;
}

async function submitFoodMapDiscovery() {
  if (discoveryLoading.value) return;

  const sourceUrl = isHttpUrl(scanUrl.value) ? scanUrl.value.trim() : "";
  if (!discoveryFile.value && !sourceUrl) {
    discoveryPanelOpen.value = true;
    discoveryError.value =
      "Upload a screenshot/photo or paste a full http(s) social/video URL.";
    return;
  }

  discoveryPanelOpen.value = true;
  discoveryLoading.value = true;
  discoveryResult.value = null;
  discoveryError.value = "";
  startDiscoveryLoading();

  try {
    const formData = new FormData();
    if (discoveryFile.value) formData.append("image", discoveryFile.value);
    if (discoveryHint.value.trim()) {
      formData.append("hint", discoveryHint.value.trim());
    }
    if (sourceUrl) formData.append("sourceUrl", sourceUrl);

    const response = await api.post("/food-map/discover", formData, {
      timeout: 60_000,
    });
    discoveryLoadingStep.value = discoveryLoadingSteps.length - 1;
    await wait(250);
    discoveryResult.value = response.data;

    if (
      response.data.status === "external_place_found_in_foodmap" &&
      response.data.foodMapMatch
    ) {
      await focusDiscoveryFoodMapMatch(response.data.foodMapMatch);
    }
  } catch (error) {
    const responseData = error.response?.data;
    if (responseData?.status) {
      discoveryResult.value = responseData;
    } else {
      discoveryError.value = getApiError(
        error,
        "Food Map discovery is temporarily unavailable.",
      );
    }
  } finally {
    stopDiscoveryLoading();
    discoveryLoading.value = false;
  }
}

async function handleScanUrl() {
  const value = scanUrl.value.trim();
  if (!value && !discoveryFile.value) {
    discoveryPanelOpen.value = true;
    scanInput.value?.focus();
    return;
  }

  if (value && !isHttpUrl(value) && !discoveryFile.value) {
    restaurantFilters.search = value;
    if (mapMode.value === "community") {
      communitySearch.value = value;
    } else {
      personalSearch.value = value;
    }
    isResultSheetOpen.value = true;
    invalidateMapAfterTransition();
    return;
  }

  await submitFoodMapDiscovery();
}

function focusScanInput() {
  discoveryPanelOpen.value = true;
  scanInput.value?.focus();
}

function focusDiscoveryHint() {
  discoveryPanelOpen.value = true;
  nextTick(() => discoveryHintInput.value?.focus());
}

function locateUser() {
  if (!map) return;
  map.locate({ setView: true, maxZoom: 16, watch: false });
}

function openDirections(place = selectedDiscovery.value) {
  if (!place) return;
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function toggleSavedPlace(place = selectedDiscovery.value) {
  if (!place) return;
  const next = new Set(savedPlaceKeys.value);
  if (next.has(place.key)) {
    next.delete(place.key);
  } else {
    next.add(place.key);
  }
  savedPlaceKeys.value = next;
}

function isPlaceSaved(place) {
  return Boolean(place && savedPlaceKeys.value.has(place.key));
}

async function sharePlace(place = selectedDiscovery.value) {
  if (!place) return;
  const shareData = {
    title: place.name,
    text: `${place.name} · ${place.category} · ${place.address}`,
    url: `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.url);
      uiStore.setSuccess("The place link was copied.", {
        title: "Ready to share",
        eyebrow: "FoodStory Taste Map",
        icon: "send",
      });
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      uiStore.setError("This place cannot be shared right now.", {
        title: "Sharing failed",
        eyebrow: "FoodStory Taste Map",
      });
    }
  }
}

function formatPlaceMeta(place) {
  return place.distance || place.price || place.address || place.district;
}

function clearFilters() {
  Object.assign(filters, { district: "", category: "", rating: "" });
}

function clearCommunityFilters() {
  communitySearch.value = "";
  Object.assign(communityFilters, { district: "", category: "" });
}

function splitTags(tags) {
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

watch(
  () => [filters.district, filters.category, filters.rating],
  () => {
    if (mapMode.value !== "personal") return;
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(fetchSpots, 180);
  },
);

watch(
  () => [
    communitySearch.value,
    communityFilters.district,
    communityFilters.category,
  ],
  () => {
    if (mapMode.value !== "community") return;
    window.clearTimeout(communitySearchTimer);
    communitySearchTimer = window.setTimeout(fetchCommunitySpots, 400);
  },
);

watch(
  () => restaurantFilters.search,
  () => {
    window.clearTimeout(restaurantSearchTimer);
    restaurantSearchTimer = window.setTimeout(fetchRestaurants, 400);
  },
);

watch([showRestaurants, showPersonalSpots], () => syncLayerVisibility());

watch(
  () => foodSpotStore.spots,
  () => {
    if (mapMode.value !== "community") scheduleMarkerRender();
  },
  { flush: "post" },
);

watch(
  () => foodSpotStore.communitySpots,
  () => {
    if (mapMode.value === "community") scheduleMarkerRender();
  },
  { flush: "post" },
);

watch(
  () => restaurantStore.restaurants,
  () => scheduleRestaurantRender(),
  { flush: "post" },
);

onMounted(async () => {
  await nextTick();
  initialiseMap();
  if (mapMode.value === "community") {
    try {
      await foodSpotStore.fetchSpots();
    } catch {
      // Community results can still load if personal statistics are unavailable.
    }
    await fetchCommunitySpots();
  } else if (mapMode.value === "stats") {
    await fetchAllPersonalSpots();
  } else {
    await fetchSpots();
  }
  await fetchRestaurants();
  if (initialRestaurantId) {
    const restaurant = restaurantStore.restaurants.find(
      (item) => Number(item.id) === initialRestaurantId,
    );
    if (restaurant) {
      showRestaurantDetail(restaurant);
      isResultSheetOpen.value = true;
    }
  } else if (initialFoodSpotId) {
    const spotSource =
      mapMode.value === "community"
        ? foodSpotStore.communitySpots
        : foodSpotStore.spots;
    const spot = spotSource.find(
      (item) => Number(item.id) === initialFoodSpotId,
    );
    if (spot) {
      if (mapMode.value === "community") {
        showCommunityDetail(spot);
      } else {
        showDetail(spot);
      }
      isResultSheetOpen.value = true;
    }
  } else if (shouldOpenAddDraft) {
    openAddForm(initialVisualDraft);
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(filterTimer);
  window.clearTimeout(communitySearchTimer);
  window.clearTimeout(restaurantSearchTimer);
  window.clearTimeout(popupTimer);
  window.clearTimeout(layoutTimer);
  stopDiscoveryLoading();
  revokeDiscoveryPreview();
  if (markerRenderFrame) window.cancelAnimationFrame(markerRenderFrame);
  if (restaurantRenderFrame) window.cancelAnimationFrame(restaurantRenderFrame);
  stopPicking();
  markersById.clear();
  markerCluster = null;
  restaurantCluster = null;
  previewMarker = null;

  if (map) {
    map.off();
    map.remove();
    map = null;
    mapInitialised.value = false;
  }
});
</script>

<template>
  <section
    class="food-map-page"
    :class="[`mode-${mapMode}`, { 'results-collapsed': !isResultSheetOpen }]"
  >
    <form class="taste-scan-bar" @submit.prevent="handleScanUrl">
      <span class="taste-scan-link" aria-hidden="true">🔗</span>
      <label class="sr-only" for="taste-map-scan">
        Find a food place from a social or video link
      </label>
      <input
        id="taste-map-scan"
        ref="scanInput"
        v-model="scanUrl"
        type="text"
        maxlength="500"
        placeholder="Paste a TikTok, Instagram, Facebook, or YouTube Shorts food link..."
      />
      <button
        class="taste-scan-upload"
        type="button"
        aria-label="Upload a food screenshot or photo"
        title="Upload screenshot or photo"
        @click="openDiscoveryFilePicker"
      >
        <AppIcon name="camera" size="18" />
      </button>
      <button
        class="taste-scan-submit"
        type="submit"
        :disabled="discoveryLoading"
      >
        {{ discoveryLoading ? "FINDING..." : "FIND ON MAP" }}
      </button>
    </form>

    <input
      ref="discoveryFileInput"
      class="food-map-discovery-file"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      @change="handleDiscoveryFileChange"
    />

    <section
      v-if="discoveryPanelOpen"
      class="food-map-discovery-panel"
      aria-label="Find a place from social media or a photo"
    >
      <header class="food-map-discovery-header">
        <div>
          <span>Food Map social/photo discovery</span>
          <h2>Find this place on FoodStory Map</h2>
          <p>Place first, dish fallback. Upload a screenshot for social video sources.</p>
        </div>
        <button
          type="button"
          aria-label="Close discovery panel"
          @click="discoveryPanelOpen = false"
        >
          <AppIcon name="x" size="18" />
        </button>
      </header>

      <div class="food-map-discovery-inputs">
        <button
          type="button"
          :class="[
            'food-map-discovery-drop',
            { filled: discoveryPreviewUrl, dragging: discoveryDragging },
          ]"
          :disabled="discoveryLoading"
          @click="openDiscoveryFilePicker"
          @dragenter.prevent="discoveryDragging = true"
          @dragover.prevent="discoveryDragging = true"
          @dragleave.prevent="discoveryDragging = false"
          @drop.prevent="handleDiscoveryDrop"
        >
          <img
            v-if="discoveryPreviewUrl"
            :src="discoveryPreviewUrl"
            alt="Food discovery preview"
          />
          <template v-else>
            <AppIcon name="camera" size="27" />
            <strong>Upload screenshot or photo</strong>
            <small>JPEG, PNG, WebP or GIF, up to 5MB</small>
          </template>
        </button>

        <label class="food-map-discovery-hint">
          <span>Optional hint</span>
          <input
            ref="discoveryHintInput"
            v-model="discoveryHint"
            type="text"
            maxlength="200"
            :disabled="discoveryLoading"
            placeholder="Dish, district, or place: Restaurant Name"
          />
          <small>
            A venue name, district, or storefront clue improves the external place search.
          </small>
        </label>
      </div>

      <p v-if="discoveryError" class="food-map-discovery-error" role="alert">
        {{ discoveryError }}
      </p>

      <div class="food-map-discovery-actions">
        <button
          type="button"
          :disabled="
            discoveryLoading ||
            (!discoveryFile && !isHttpUrl(scanUrl))
          "
          @click="submitFoodMapDiscovery"
        >
          <AppIcon name="search" size="16" />
          {{ discoveryLoading ? "Finding the place..." : "Find place" }}
        </button>
        <button
          v-if="discoveryFile || discoveryResult"
          class="secondary"
          type="button"
          :disabled="discoveryLoading"
          @click="resetFoodMapDiscovery"
        >
          Reset
        </button>
      </div>

      <ol
        v-if="discoveryLoading"
        class="food-map-discovery-loading"
        aria-live="polite"
      >
        <li
          v-for="(step, index) in discoveryLoadingSteps"
          :key="step"
          :class="{
            active: index === discoveryLoadingStep,
            complete: index < discoveryLoadingStep,
          }"
        >
          <span>
            <AppIcon
              v-if="index < discoveryLoadingStep"
              name="check"
              size="12"
            />
            <template v-else>{{ index + 1 }}</template>
          </span>
          {{ step }}
        </li>
      </ol>

      <article
        v-if="discoveryResult && !discoveryLoading"
        :class="[
          'food-map-discovery-result',
          `status-${discoveryResult.status}`,
        ]"
      >
        <div class="food-map-discovery-result-heading">
          <span>{{ discoveryStatusLabel }}</span>
          <h3>{{ discoveryResult.message }}</h3>
          <p v-if="discoveryResult.visualUnderstanding?.caption">
            {{ discoveryResult.visualUnderstanding.caption }}
          </p>
        </div>

        <div
          v-if="
            discoveryResult.visualUnderstanding?.placeName ||
            discoveryResult.visualUnderstanding?.dishName ||
            discoveryResult.visualUnderstanding?.category
          "
          class="food-map-discovery-clues"
        >
          <span v-if="discoveryResult.visualUnderstanding.placeName">
            Place: <b>{{ discoveryResult.visualUnderstanding.placeName }}</b>
          </span>
          <span v-if="discoveryResult.visualUnderstanding.dishName">
            Dish: <b>{{ discoveryResult.visualUnderstanding.dishName }}</b>
          </span>
          <span v-if="discoveryResult.visualUnderstanding.category">
            Category: <b>{{ discoveryResult.visualUnderstanding.category }}</b>
          </span>
        </div>

        <div
          v-if="
            discoveryResult.visualUnderstanding?.ocrText ||
            discoveryResult.visualUnderstanding?.ocrUsable === false
          "
          class="food-map-discovery-ocr"
        >
          <template
            v-if="discoveryResult.visualUnderstanding?.ocrUsable !== false"
          >
            <span>Text found in image</span>
            <p>{{ discoveryResult.visualUnderstanding.ocrText }}</p>
          </template>
          <template v-else>
            <span>Image text</span>
            <p>No reliable text was found in this image.</p>
          </template>
          <small
            v-if="
              Number.isFinite(
                discoveryResult.visualUnderstanding.ocrConfidence,
              )
            "
          >
            OCR confidence:
            {{
              Math.round(
                discoveryResult.visualUnderstanding.ocrConfidence * 100,
              )
            }}%
          </small>
        </div>

        <div
          v-if="discoveryResult.externalPlace"
          class="food-map-discovery-external"
        >
          <div>
            <span>
              {{
                discoveryResult.status === "external_place_found_in_foodmap"
                  ? "Found in FoodStory Map"
                  : "Found outside FoodStory, not in map yet"
              }}
            </span>
            <strong>{{ discoveryResult.externalPlace.name }}</strong>
            <p>
              {{
                discoveryResult.externalPlace.address ||
                discoveryResult.externalPlace.district ||
                discoveryResult.externalPlace.category ||
                "Address needs verification"
              }}
            </p>
          </div>
          <b>{{ discoveryResult.externalPlace.source }}</b>
        </div>

        <div
          v-if="
            discoveryResult.status === 'external_place_found_in_foodmap' &&
            discoveryResult.foodMapMatch
          "
          class="food-map-discovery-match"
        >
          <div>
            <span>
              {{ discoveryResult.foodMapMatch.sourceType === "food_spot"
                ? "Community food spot"
                : "Restaurant" }}
            </span>
            <strong>{{ discoveryResult.foodMapMatch.name }}</strong>
            <p>
              {{ discoveryResult.foodMapMatch.category || "FoodStory Map" }}
              <template v-if="discoveryResult.foodMapMatch.district">
                · {{ discoveryResult.foodMapMatch.district }}
              </template>
            </p>
          </div>
          <b class="food-map-discovery-score">
            {{ Math.round(discoveryResult.foodMapMatch.confidence * 100) }}%
            match score
          </b>
          <button
            type="button"
            @click="focusDiscoveryFoodMapMatch(discoveryResult.foodMapMatch)"
          >
            Focus marker
          </button>
        </div>

        <div
          v-if="
            [
              'external_place_found_not_in_foodmap',
              'external_place_not_found_dish_identified',
            ].includes(discoveryResult.status)
          "
          class="food-map-discovery-draft"
        >
          <div>
            <span>New Food Map draft</span>
            <strong>
              {{
                discoveryResult.suggestedDraft?.name ||
                discoveryResult.suggestedDraft?.dish_name ||
                "New food spot"
              }}
            </strong>
            <p>
              {{
                discoveryResult.suggestedDraft?.category ||
                "Category needs confirmation"
              }}
              <template v-if="discoveryResult.suggestedDraft?.district">
                · {{ discoveryResult.suggestedDraft.district }}
              </template>
            </p>
          </div>
          <div class="food-map-discovery-draft-actions">
            <button type="button" @click="addDiscoveryDraft">
              Add to Food Map
            </button>
            <button class="secondary" type="button" @click="addDiscoveryDraft">
              Edit before adding
            </button>
          </div>
        </div>

        <div
          v-if="
            discoveryResult.status ===
            'external_place_not_found_dish_identified'
          "
          class="food-map-discovery-dish-help"
        >
          <p>
            The dish is identified, but there is not enough place evidence yet.
            Add a restaurant or district hint, or upload a clearer screenshot.
          </p>
          <button class="secondary" type="button" @click="focusDiscoveryHint">
            Add hint
          </button>
          <button
            class="secondary"
            type="button"
            @click="openDiscoveryFilePicker"
          >
            Upload clearer screenshot
          </button>
        </div>

        <div
          v-if="
            [
              'url_extraction_failed',
              'unclear',
              'external_place_not_found_unclear',
            ].includes(discoveryResult.status)
          "
          class="food-map-discovery-fallback"
        >
          <p>
            Use a close, clear screenshot with the dish, storefront, logo, or
            place name visible. You can also add a hint.
          </p>
          <button type="button" @click="openDiscoveryFilePicker">
            Upload screenshot
          </button>
          <button
            class="secondary"
            type="button"
            @click="focusDiscoveryHint"
          >
            Add hint
          </button>
        </div>
      </article>
    </section>

    <button class="taste-menu-button" type="button" aria-label="Open main menu">
      ☰
    </button>

    <div class="taste-top-actions" aria-label="User actions">
      <button type="button" aria-label="Notifications">
        🔔
        <span aria-hidden="true">3</span>
      </button>
      <button class="taste-avatar-button" type="button" aria-label="Account">
        <img :src="streetImage" alt="" loading="lazy" decoding="async" />
      </button>
    </div>

    <button
      class="taste-locate-button"
      type="button"
      aria-label="Locate my current position"
      @click="locateUser"
    >
      ⌖
    </button>

    <button
      class="taste-edge-handle taste-edge-handle-left"
      type="button"
      aria-label="Open filters"
      :aria-expanded="isFilterDrawerOpen"
      @click="setFilterDrawer(true)"
    >
      <AppIcon name="filter" size="18" />
      <span>Filters</span>
    </button>

    <button
      class="taste-edge-handle taste-edge-handle-right"
      type="button"
      aria-label="Open place details"
      :aria-expanded="isDetailDrawerOpen"
      @click="setDetailDrawer(true)"
    >
      <AppIcon name="map-pin" size="18" />
      <span>Details</span>
    </button>

    <button
      v-if="isFilterDrawerOpen || isDetailDrawerOpen"
      class="taste-drawer-backdrop"
      type="button"
      aria-label="Close open panel"
      @click="
        setFilterDrawer(false);
        setDetailDrawer(false);
      "
    ></button>

    <section
      class="taste-result-sheet"
      :class="{ collapsed: !isResultSheetOpen }"
      aria-label="Matching results"
    >
      <button
        class="taste-sheet-handle"
        type="button"
        :aria-label="isResultSheetOpen ? 'Collapse results' : 'Expand results'"
        :aria-expanded="isResultSheetOpen"
        @click="toggleResultSheet"
      >
        <span></span>
      </button>
      <div class="taste-sheet-heading">
        <div>
          <h2>✨ Matching Results</h2>
          <p>{{ resultSheetSubtitle }}</p>
        </div>
        <span>{{ resultPlaces.length }} places</span>
      </div>
      <div v-if="resultPlaces.length" class="taste-result-list">
        <article
          v-for="place in resultPlaces"
          :key="place.key"
          class="taste-result-card"
          :class="{ active: selectedDiscovery?.key === place.key }"
          tabindex="0"
          role="button"
          @click="selectDiscovery(place)"
          @keydown.enter.prevent="selectDiscovery(place)"
          @keydown.space.prevent="selectDiscovery(place)"
        >
          <img :src="place.image" :alt="place.name" />
          <div class="taste-result-copy">
            <span>{{ place.category }}</span>
            <strong>{{ place.name }}</strong>
            <p>{{ formatPlaceMeta(place) }}</p>
            <small>
              <b>{{ place.rating ? place.rating.toFixed(1) : "New" }} ★</b>
              <span v-if="place.price">{{ place.price }}</span>
            </small>
          </div>
          <button
            type="button"
            :class="{ saved: isPlaceSaved(place) }"
            :aria-label="
              isPlaceSaved(place)
                ? `Remove ${place.name} from saved places`
                : `Save ${place.name}`
            "
            @click.stop="toggleSavedPlace(place)"
          >
            <AppIcon name="heart" size="17" />
          </button>
        </article>
      </div>
      <div v-else class="taste-result-empty">
        <AppIcon name="search" size="24" />
        <span>No matching places yet. Try changing your filters.</span>
      </div>
    </section>

    <button
      class="taste-floating-scan"
      :class="{ raised: isResultSheetOpen }"
      type="button"
      aria-label="Scan food from a link"
      @click="focusScanInput"
    >
      <AppIcon name="sparkles" size="22" />
      <span>Scan food</span>
    </button>

    <aside
      class="food-map-sidebar"
      :class="{ open: isFilterDrawerOpen }"
      aria-label="Manage food map"
      :aria-hidden="!isFilterDrawerOpen"
      :inert="!isFilterDrawerOpen"
    >
      <button
        class="taste-drawer-close"
        type="button"
        aria-label="Close filters"
        @click="setFilterDrawer(false)"
      >
        <AppIcon name="x" size="20" />
      </button>
      <header class="food-map-sidebar-header">
        <div>
          <p class="food-map-kicker">{{ sidebarKicker }}</p>
          <h1>{{ sidebarTitle }}</h1>
          <p class="food-map-storyline">Every food place tells a story</p>
          <p class="food-map-layer-counts">
            {{ restaurantStore.restaurants.length }} restaurants
            <span>•</span>
            {{ foodSpotStore.spots.length }} personal places
          </p>
        </div>
        <span class="food-map-count">{{ sidebarCount }}</span>
      </header>

      <nav class="food-map-mode-toggle" aria-label="Map mode">
        <button
          v-for="mode in [
            ['personal', 'My Places'],
            ['community', 'Community'],
            ['stats', 'Statistics'],
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

      <section class="food-map-layer-toggle" aria-label="Map display layers">
        <span>Show on map:</span>
        <div>
          <label class="restaurant" :class="{ active: showRestaurants }">
            <input v-model="showRestaurants" type="checkbox" />
            <span aria-hidden="true">{{ showRestaurants ? "✓" : "" }}</span>
            Restaurants
          </label>
          <label class="personal" :class="{ active: showPersonalSpots }">
            <input v-model="showPersonalSpots" type="checkbox" />
            <span aria-hidden="true">{{ showPersonalSpots ? "✓" : "" }}</span>
            {{ spotLayerLabel }}
          </label>
        </div>
        <small v-if="restaurantStore.loading">Loading restaurant data...</small>
        <small v-else-if="restaurantStore.error" class="error">{{
          restaurantStore.error
        }}</small>
        <small v-else-if="restaurantStore.restaurants.length === 0">
          There are no restaurants to display on the map.
        </small>
      </section>

      <section
        v-if="initialDish && mapMode === 'community'"
        class="food-map-recipe-banner"
      >
        <p>
          Viewing: <strong>"{{ initialDish }}"</strong>
        </p>
        <span>Places from the FoodStory community</span>
        <button type="button" @click="addFromRecipe">
          <AppIcon name="map-pin" size="16" />
          Add My Favorite Place
        </button>
      </section>

      <div
        v-if="sidebarMode === 'list' && mapMode === 'personal'"
        class="food-map-sidebar-body"
      >
        <label class="food-map-personal-search">
          <span class="sr-only">Search my places</span>
          <AppIcon name="search" size="17" />
          <input
            v-model="personalSearch"
            type="search"
            maxlength="150"
            placeholder="Search restaurants, dishes, or places..."
          />
          <button
            v-if="personalSearch"
            type="button"
            aria-label="Clear search"
            @click="personalSearch = ''"
          >
            ×
          </button>
        </label>

        <section class="food-map-filters" aria-label="Place filters">
          <div class="food-map-filter-heading">
            <span><AppIcon name="filter" size="17" /> Discovery filters</span>
            <button v-if="hasActiveFilters" type="button" @click="clearFilters">
              Reset
            </button>
          </div>
          <div class="food-map-filter-grid">
            <label>
              <span>District</span>
              <select v-model="filters.district">
                <option value="">All areas</option>
                <option v-for="item in districts" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select v-model="filters.category">
                <option value="">All food</option>
                <option v-for="item in categories" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label>
              <span>Minimum rating</span>
              <select v-model="filters.rating">
                <option value="">Any rating</option>
                <option v-for="value in 5" :key="value" :value="value">
                  {{ value }} stars and above
                </option>
              </select>
            </label>
          </div>
        </section>

        <button
          class="food-map-primary-action"
          type="button"
          @click="openAddForm"
        >
          <AppIcon name="map-pin" size="19" />
          Add New Place
        </button>

        <div v-if="foodSpotStore.loading" class="food-map-state" role="status">
          <span class="food-map-spinner"></span>
          <p>Loading your places...</p>
        </div>
        <div
          v-else-if="foodSpotStore.error"
          class="food-map-state"
          role="alert"
        >
          <p>{{ foodSpotStore.error }}</p>
          <button type="button" @click="fetchSpots">Try again</button>
        </div>
        <div
          v-else-if="foodSpotStore.spots.length === 0"
          class="food-map-state"
        >
          <span class="food-map-empty-icon"
            ><AppIcon name="map-pin" size="30"
          /></span>
          <h2>No saved stops yet</h2>
          <p>You do not have any places yet. Add your first one.</p>
          <button type="button" @click="openAddForm">Add Now</button>
        </div>
        <div
          v-else-if="displayedPersonalSpots.length === 0"
          class="food-map-state compact"
        >
          <span class="food-map-empty-icon"
            ><AppIcon name="search" size="26"
          /></span>
          <p>No places match "{{ personalSearch }}".</p>
          <button type="button" @click="personalSearch = ''">
            Clear search
          </button>
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
            <span
              class="food-map-card-thumb"
              :style="{ backgroundImage: `url(${streetImage})` }"
            ></span>
            <span class="food-map-card-copy">
              <span class="food-map-card-topline">
                <strong>{{ spot.name }}</strong>
                <small aria-label="Rating"
                  >{{ Number(spot.rating || 0).toFixed(1) }} ★</small
                >
              </span>
              <span>{{ spot.dish_name || "No dish added" }}</span>
              <span class="food-map-card-meta">
                <em
                  v-if="spot.category"
                  :style="{ '--spot-color': categoryColor(spot.category) }"
                >
                  {{ spot.category }}
                </em>
                <small
                  ><AppIcon name="map-pin" size="13" />
                  {{ spot.district || "Ho Chi Minh City" }}</small
                >
              </span>
            </span>
          </button>
        </div>

        <section
          class="restaurant-filter-panel"
          :class="{ open: restaurantFiltersOpen }"
        >
          <button
            class="restaurant-filter-toggle"
            type="button"
            :aria-expanded="restaurantFiltersOpen"
            @click="restaurantFiltersOpen = !restaurantFiltersOpen"
          >
            <span>
              <AppIcon name="store" size="17" />
              Filter Restaurants on the Map
            </span>
            <span aria-hidden="true">{{
              restaurantFiltersOpen ? "▲" : "▼"
            }}</span>
          </button>

          <div v-if="restaurantFiltersOpen" class="restaurant-filter-content">
            <div class="restaurant-filter-grid">
              <label>
                <span>District</span>
                <select v-model="restaurantFilters.district">
                  <option value="">All areas</option>
                  <option v-for="item in districts" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label>
                <span>Category</span>
                <select v-model="restaurantFilters.category">
                  <option value="">All categories</option>
                  <option
                    v-for="item in restaurantCategories"
                    :key="item"
                    :value="item"
                  >
                    {{ item }}
                  </option>
                </select>
              </label>
              <label class="wide">
                <span>Search</span>
                <input
                  v-model="restaurantFilters.search"
                  type="search"
                  maxlength="150"
                  placeholder="Restaurant name or dish..."
                />
              </label>
              <label class="wide">
                <span>Minimum rating</span>
                <select v-model="restaurantFilters.min_rating">
                  <option value="">Any rating</option>
                  <option v-for="value in 5" :key="value" :value="value">
                    {{ value }} stars and above
                  </option>
                </select>
              </label>
            </div>

            <div class="restaurant-filter-actions">
              <button
                type="button"
                :disabled="restaurantStore.loading"
                @click="applyRestaurantFilters"
              >
                {{ restaurantStore.loading ? "Filtering..." : "Apply" }}
              </button>
              <button
                class="secondary"
                type="button"
                :disabled="restaurantStore.loading"
                @click="clearRestaurantFilters"
              >
                Clear Filters
              </button>
            </div>

            <p
              v-if="restaurantStore.error"
              class="restaurant-filter-message error"
            >
              {{ restaurantStore.error }}
            </p>
            <p
              v-else-if="
                !restaurantStore.loading &&
                restaurantStore.restaurants.length === 0
              "
              class="restaurant-filter-message"
            >
              No matching restaurants found. Try clearing the filters.
            </p>
            <p v-else class="restaurant-filter-message">
              {{ restaurantStore.restaurants.length }} restaurants are displayed
              on the map.
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
          <span class="sr-only">Search community places</span>
          <AppIcon name="search" size="17" />
          <input
            v-model="communitySearch"
            type="search"
            maxlength="150"
            placeholder="Search dishes or places..."
          />
        </label>

        <section class="food-map-filters" aria-label="Community filters">
          <div class="food-map-filter-heading">
            <span><AppIcon name="filter" size="17" /> Community filters</span>
            <button
              v-if="hasCommunityFilters"
              type="button"
              @click="clearCommunityFilters"
            >
              Reset
            </button>
          </div>
          <div class="food-map-filter-grid">
            <label>
              <span>District</span>
              <select v-model="communityFilters.district">
                <option value="">All areas</option>
                <option v-for="item in districts" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select v-model="communityFilters.category">
                <option value="">All food</option>
                <option v-for="item in categories" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
          </div>
        </section>

        <div class="food-map-community-summary">
          <span>{{ communityResultText }}</span>
          <small v-if="foodSpotStore.communityLoading">Updating...</small>
        </div>

        <div
          v-if="foodSpotStore.communityError"
          class="food-map-state compact"
          role="alert"
        >
          <p>{{ foodSpotStore.communityError }}</p>
          <button type="button" @click="fetchCommunitySpots">Try again</button>
        </div>
        <div
          v-else-if="foodSpotStore.communitySpots.length === 0"
          class="food-map-state compact"
        >
          <span class="food-map-empty-icon community"
            ><AppIcon name="map-pin" size="28"
          /></span>
          <p>{{ communityResultText }}</p>
        </div>
        <div v-else class="food-map-spot-list">
          <button
            v-for="spot in foodSpotStore.communitySpots"
            :key="spot.id"
            type="button"
            class="food-map-spot-card community"
            @click="showCommunityDetail(spot)"
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
              <span>{{ spot.dish_name || "No dish added" }}</span>
              <span class="food-map-card-meta">
                <em v-if="spot.category">{{ spot.category }}</em>
                <small
                  ><AppIcon name="map-pin" size="13" />
                  {{ spot.district || "Ho Chi Minh City" }}</small
                >
              </span>
            </span>
          </button>
        </div>
      </div>

      <div
        v-else-if="sidebarMode === 'list' && mapMode === 'stats'"
        class="food-map-sidebar-body"
      >
        <div
          v-if="foodSpotStore.loading"
          class="food-map-state compact"
          role="status"
        >
          <span class="food-map-spinner"></span>
          <p>Summarizing your food journey...</p>
        </div>
        <div v-else-if="personalStats.total === 0" class="food-map-state">
          <span class="food-map-empty-icon"
            ><AppIcon name="map-pin" size="30"
          /></span>
          <h2>No statistics yet</h2>
          <p>Add places to view your statistics.</p>
          <button type="button" @click="addFromStats">Add Now</button>
        </div>
        <template v-else>
          <section class="food-map-stats-summary">
            <article>
              <strong>{{ personalStats.total }}</strong>
              <span>places</span>
            </article>
            <article>
              <strong>{{ personalStats.averageRating.toFixed(1) }} ★</strong>
              <span>average</span>
            </article>
            <article>
              <strong>{{ personalStats.favoriteDistrict }}</strong>
              <span>favorite district</span>
            </article>
          </section>

          <section class="food-map-stats-panel">
            <h2>Top 3 Most Visited Districts</h2>
            <p
              v-if="personalStats.districtsRanking.length === 0"
              class="food-map-stats-empty"
            >
              No district information is available.
            </p>
            <div
              v-for="item in personalStats.districtsRanking"
              :key="item.label"
              class="food-map-stat-row"
            >
              <div>
                <span>{{ item.label }}</span
                ><small>{{ item.count }} · {{ item.percentage }}%</small>
              </div>
              <span class="food-map-stat-track"
                ><i :style="{ width: `${item.percentage}%` }"></i
              ></span>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Top 3 Most Frequent Dishes</h2>
            <p
              v-if="personalStats.dishesRanking.length === 0"
              class="food-map-stats-empty"
            >
              No dish names are available.
            </p>
            <div
              v-for="item in personalStats.dishesRanking"
              :key="item.label"
              class="food-map-stat-row"
            >
              <div>
                <span>{{ item.label }}</span
                ><small>{{ item.count }} · {{ item.percentage }}%</small>
              </div>
              <span class="food-map-stat-track"
                ><i :style="{ width: `${item.percentage}%` }"></i
              ></span>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Rating Distribution</h2>
            <div
              v-for="item in personalStats.ratingDistribution"
              :key="item.rating"
              class="food-map-rating-row"
            >
              <span>{{ item.rating }}★</span>
              <span class="food-map-stat-track"
                ><i :style="{ width: `${item.percentage}%` }"></i
              ></span>
              <small>{{ item.count }}</small>
            </div>
          </section>

          <section class="food-map-stats-panel">
            <h2>Most Recent</h2>
            <button
              v-for="spot in personalStats.recent"
              :key="spot.id"
              type="button"
              class="food-map-recent-spot"
              @click="showDetail(spot)"
            >
              <span>{{ spot.name }}</span>
              <small>{{ formatDate(spot.created_at) }}</small>
            </button>
          </section>
        </template>
      </div>

      <div
        v-else-if="sidebarMode === 'add' && mapMode === 'personal'"
        class="food-map-sidebar-body"
      >
        <button class="food-map-back" type="button" @click="cancelForm">
          <AppIcon name="arrow-left" size="16" /> Back
        </button>
        <div class="food-map-mode-heading">
          <p class="food-map-kicker">
            {{ isEditing ? "Update your collection" : "Save a new memory" }}
          </p>
          <h2>{{ isEditing ? "Edit Place" : "Add New Place" }}</h2>
          <p>Record the food and location so you can easily return later.</p>
        </div>

        <form class="food-map-form" @submit.prevent="submitForm">
          <label>
            <span>Place name <b>*</b></span>
            <input
              v-model="form.name"
              type="text"
              maxlength="150"
              placeholder="Example: Aunt Ba's Traditional Pho"
              :aria-invalid="Boolean(formErrors.name)"
            />
            <small v-if="formErrors.name" class="food-map-field-error">{{
              formErrors.name
            }}</small>
          </label>
          <label>
            <span>Dish name</span>
            <input
              v-model="form.dish_name"
              type="text"
              maxlength="150"
              placeholder="The dish you enjoyed"
            />
          </label>

          <div class="food-map-form-row">
            <label>
              <span>Category</span>
              <select v-model="form.category">
                <option value="">Select a category</option>
                <option v-for="item in categories" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label>
              <span>District</span>
              <select v-model="form.district">
                <option value="">Select an area</option>
                <option v-for="item in districts" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
          </div>

          <fieldset class="food-map-fieldset">
            <legend>Location <b>*</b></legend>
            <div class="food-map-form-row">
              <label
                ><span>Latitude</span
                ><input
                  :value="form.latitude"
                  readonly
                  placeholder="10.8231000"
              /></label>
              <label
                ><span>Longitude</span
                ><input
                  :value="form.longitude"
                  readonly
                  placeholder="106.6297000"
              /></label>
            </div>
            <button
              type="button"
              :class="{ active: pickingMode }"
              @click="startPicking"
            >
              <AppIcon name="map-pin" size="17" />
              {{
                pickingMode
                  ? "Waiting for a map location..."
                  : "Choose Location on Map"
              }}
            </button>
            <small v-if="formErrors.coordinates" class="food-map-field-error">{{
              formErrors.coordinates
            }}</small>
          </fieldset>

          <fieldset class="food-map-fieldset">
            <legend>Personal rating</legend>
            <div
              class="food-map-stars"
              role="radiogroup"
              aria-label="Personal rating"
            >
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
              <button
                v-if="form.rating"
                class="clear"
                type="button"
                @click="form.rating = null"
              >
                Clear rating
              </button>
            </div>
          </fieldset>

          <label>
            <span>Notes</span>
            <textarea
              v-model="form.notes"
              rows="4"
              placeholder="Atmosphere, flavors, recommended dishes..."
            ></textarea>
          </label>
          <label>
            <span>Tags</span>
            <input
              v-model="form.tags"
              maxlength="255"
              placeholder="breakfast, good value, friends"
            />
            <small class="food-map-hint">Separate tags with commas.</small>
          </label>
          <p
            v-if="formErrors.submit"
            class="food-map-submit-error"
            role="alert"
          >
            {{ formErrors.submit }}
          </p>

          <div class="food-map-form-actions">
            <button class="food-map-save" type="submit" :disabled="submitting">
              <span v-if="submitting" class="food-map-spinner small"></span>
              <AppIcon v-else name="check" size="18" />
              {{
                submitting
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Save Place"
              }}
            </button>
            <button
              class="food-map-secondary"
              type="button"
              :disabled="submitting"
              @click="cancelForm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <div
        v-else-if="
          sidebarMode === 'detail' && mapMode === 'personal' && selectedSpot
        "
        class="food-map-sidebar-body"
      >
        <button class="food-map-back" type="button" @click="backToList">
          <AppIcon name="arrow-left" size="16" /> Back
        </button>
        <div class="food-map-detail-hero">
          <span
            class="food-map-detail-pin"
            :style="{ '--spot-color': markerColor(selectedSpot.rating) }"
          >
            <AppIcon name="map-pin" size="26" />
          </span>
          <p class="food-map-kicker">
            {{ selectedSpot.category || "Food destination" }}
          </p>
          <h2>{{ selectedSpot.name }}</h2>
          <p>{{ selectedSpot.dish_name || "No dish name added" }}</p>
          <div>{{ ratingText(selectedSpot.rating) }}</div>
        </div>

        <dl class="food-map-details">
          <div>
            <dt><AppIcon name="map-pin" size="16" /> Area</dt>
            <dd>{{ selectedSpot.district || "Ho Chi Minh City" }}</dd>
          </div>
          <div>
            <dt><AppIcon name="store" size="16" /> Category</dt>
            <dd>{{ selectedSpot.category || "Uncategorized" }}</dd>
          </div>
          <div>
            <dt><AppIcon name="clock" size="16" /> Saved date</dt>
            <dd>{{ formatDate(selectedSpot.created_at) }}</dd>
          </div>
          <div class="wide">
            <dt><AppIcon name="message" size="16" /> Notes</dt>
            <dd>
              {{
                selectedSpot.notes || "You have not added notes for this place."
              }}
            </dd>
          </div>
        </dl>
        <div v-if="splitTags(selectedSpot.tags).length" class="food-map-tags">
          <span v-for="tag in splitTags(selectedSpot.tags)" :key="tag"
            >#{{ tag }}</span
          >
        </div>
        <div class="food-map-detail-actions">
          <button type="button" @click="editSpot(selectedSpot)">
            <AppIcon name="pen" size="17" /> Edit
          </button>
          <button
            class="danger"
            type="button"
            :disabled="deletingSpotId === selectedSpot.id"
            @click="removeSpot(selectedSpot)"
          >
            <AppIcon name="trash" size="17" />
            {{
              deletingSpotId === selectedSpot.id
                ? "Deleting..."
                : "Delete Place"
            }}
          </button>
        </div>
      </div>
    </aside>

    <div class="food-map-canvas">
      <div class="food-map-city-label" aria-hidden="true">
        <span>Ho Chi Minh City</span>
      </div>
      <div v-if="pickingMode" class="food-map-picking-banner" role="status">
        <AppIcon name="map-pin" size="19" />
        <span>Click the map to select a location</span>
        <button type="button" @click="stopPicking">Cancel</button>
      </div>
      <div
        ref="mapElement"
        class="food-map-leaflet"
        aria-label="Food places map"
      ></div>
      <div class="food-map-legend">
        <strong>{{
          isCommunityMode ? "Community places" : "Categories"
        }}</strong>
        <template v-if="isCommunityMode">
          <span><i style="--legend-color: #3d9cff"></i>Public places</span>
        </template>
        <template v-else>
          <span v-for="item in categoryLegend" :key="item.label">
            <i :style="{ '--legend-color': item.color }"></i>{{ item.label }}
          </span>
        </template>
      </div>
    </div>

    <aside
      class="taste-detail-drawer"
      :class="{ open: isDetailDrawerOpen }"
      aria-label="Place details"
      :aria-hidden="!isDetailDrawerOpen"
      :inert="!isDetailDrawerOpen"
    >
      <button
        class="taste-drawer-close"
        type="button"
        aria-label="Close place details"
        @click="setDetailDrawer(false)"
      >
        <AppIcon name="x" size="20" />
      </button>

      <template v-if="selectedDiscovery">
        <div class="taste-detail-media">
          <img :src="selectedDiscovery.image" :alt="selectedDiscovery.name" />
          <span>{{ selectedDiscovery.source }}</span>
          <button
            type="button"
            :class="{ saved: isPlaceSaved(selectedDiscovery) }"
            :aria-label="
              isPlaceSaved(selectedDiscovery)
                ? 'Remove saved place'
                : 'Save place'
            "
            @click="toggleSavedPlace(selectedDiscovery)"
          >
            <AppIcon name="heart" size="19" />
          </button>
        </div>

        <div class="taste-detail-content">
          <div class="taste-detail-title">
            <span>{{ selectedDiscovery.category }}</span>
            <h2>{{ selectedDiscovery.name }}</h2>
            <p>{{ selectedDiscovery.dish }}</p>
          </div>

          <div class="taste-detail-rating">
            <strong>
              {{
                selectedDiscovery.rating
                  ? selectedDiscovery.rating.toFixed(1)
                  : "New"
              }}
              ★
            </strong>
            <span v-if="selectedDiscovery.price">{{
              selectedDiscovery.price
            }}</span>
            <span v-if="selectedDiscovery.distance">{{
              selectedDiscovery.distance
            }}</span>
          </div>

          <dl class="taste-detail-facts">
            <div>
              <dt><AppIcon name="map-pin" size="17" /> Address</dt>
              <dd>{{ selectedDiscovery.address }}</dd>
            </div>
            <div v-if="selectedDiscovery.openingHours">
              <dt><AppIcon name="clock" size="17" /> Opening hours</dt>
              <dd>{{ selectedDiscovery.openingHours }}</dd>
            </div>
            <div>
              <dt><AppIcon name="send" size="17" /> Discovery source</dt>
              <dd>{{ selectedDiscovery.source }}</dd>
            </div>
          </dl>

          <section class="taste-detail-story">
            <span>Place story</span>
            <p>{{ selectedDiscovery.description }}</p>
          </section>

          <div
            v-if="
              selectedDiscovery.isOwned &&
              splitTags(selectedDiscovery.raw.tags).length
            "
            class="food-map-tags"
          >
            <span
              v-for="tag in splitTags(selectedDiscovery.raw.tags)"
              :key="tag"
            >
              #{{ tag }}
            </span>
          </div>

          <RouterLink
            v-if="selectedDiscovery.isOwned && selectedDiscovery.raw.recipe_id"
            class="taste-related-recipe"
            :to="{
              name: 'recipe-detail',
              params: { id: selectedDiscovery.raw.recipe_id },
            }"
          >
            <AppIcon name="book-open" size="19" />
            <span>
              <strong>View related recipe</strong>
              <small>{{ selectedDiscovery.raw.dish_name }}</small>
            </span>
            <AppIcon name="arrow-right" size="18" />
          </RouterLink>

          <div class="taste-detail-actions">
            <button class="primary" type="button" @click="openDirections()">
              <AppIcon name="map-pin" size="18" />
              Directions
            </button>
            <button type="button" @click="toggleSavedPlace()">
              <AppIcon name="bookmark" size="18" />
              {{ isPlaceSaved(selectedDiscovery) ? "Saved" : "Save" }}
            </button>
            <button type="button" @click="sharePlace()">
              <AppIcon name="send" size="18" />
              Share
            </button>
          </div>

          <div
            v-if="selectedDiscovery.isOwned"
            class="taste-detail-owner-actions"
          >
            <button type="button" @click="editSpot(selectedDiscovery.raw)">
              <AppIcon name="pen" size="17" />
              Edit
            </button>
            <button
              class="danger"
              type="button"
              :disabled="deletingSpotId === selectedDiscovery.id"
              @click="removeSpot(selectedDiscovery.raw)"
            >
              <AppIcon name="trash" size="17" />
              {{
                deletingSpotId === selectedDiscovery.id
                  ? "Deleting..."
                  : "Delete place"
              }}
            </button>
          </div>
        </div>
      </template>

      <div v-else class="taste-detail-empty">
        <span><AppIcon name="map-pin" size="32" /></span>
        <p class="food-map-kicker">FoodStory Taste Map</p>
        <h2>Select a place</h2>
        <p>Select a place on the map to view its details.</p>
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
    radial-gradient(
      circle at 15% 0%,
      rgba(230, 83, 63, 0.13),
      transparent 18rem
    ),
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
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
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
  background: linear-gradient(
    135deg,
    rgba(244, 162, 97, 0.16),
    rgba(230, 83, 63, 0.08)
  );
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
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--marker-color) 24%, transparent),
    0 8px 18px rgba(0, 0, 0, 0.32);
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
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--marker-color) 22%, transparent),
    0 7px 15px rgba(0, 0, 0, 0.28);
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
  background: var(
    --restaurant-gradient,
    linear-gradient(135deg, #fb923c, #ea580c)
  );
  box-shadow:
    0 0 0 5px
      color-mix(in srgb, var(--restaurant-color, #f97316) 22%, transparent),
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
  background: var(
    --restaurant-gradient,
    linear-gradient(135deg, #fb923c, #ea580c)
  );
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
  background: var(
    --restaurant-gradient,
    linear-gradient(135deg, #fb923c, #ea580c)
  );
  box-shadow: 0 7px 16px
    color-mix(in srgb, var(--restaurant-color, #f97316) 26%, transparent);
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
  to {
    transform: rotate(360deg);
  }
}

@keyframes food-map-pulse {
  50% {
    transform: scale(1.1);
  }
}

@media (max-width: 1050px) {
  .food-map-page {
    grid-template-columns: 340px minmax(0, 1fr);
  }
  .food-map-legend {
    display: none;
  }
}

@media (max-width: 760px) {
  .food-map-page {
    display: flex;
    height: auto;
    min-height: calc(100vh - var(--nav-height));
    overflow: visible;
    flex-direction: column;
  }

  .food-map-sidebar {
    min-height: 520px;
    border-right: 0;
  }
  .food-map-sidebar-body {
    max-height: 620px;
  }
  .food-map-canvas {
    order: -1;
    height: 54vh;
    min-height: 410px;
    padding: 10px;
  }
  .food-map-leaflet {
    min-height: 390px;
    border-radius: 14px;
  }
}

@media (max-width: 430px) {
  .food-map-filter-grid,
  .food-map-form-row,
  .food-map-details {
    grid-template-columns: 1fr;
  }
  .food-map-filter-grid label:last-child,
  .food-map-details .wide {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .food-map-spinner,
  :deep(.food-map-marker-dot.preview) {
    animation: none;
  }
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
    radial-gradient(
      circle at 7% 14%,
      rgba(188, 149, 85, 0.1),
      transparent 17rem
    ),
    radial-gradient(
      circle at 93% 90%,
      rgba(214, 115, 55, 0.08),
      transparent 20rem
    ),
    #f8f0e3;
  color: var(--map-text);
}

.food-map-sidebar {
  border-right: 1px solid var(--map-border);
  background:
    linear-gradient(rgba(255, 250, 241, 0.94), rgba(255, 250, 241, 0.94)),
    radial-gradient(
      circle at 16% 9%,
      rgba(167, 126, 67, 0.18) 0 1px,
      transparent 1.5px
    );
  background-size:
    auto,
    15px 15px;
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
    linear-gradient(
      90deg,
      rgba(255, 250, 241, 0.4),
      transparent 20%,
      transparent 80%,
      rgba(255, 250, 241, 0.4)
    ),
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

.food-map-city-label::before {
  left: 8px;
}
.food-map-city-label::after {
  right: 8px;
}

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
    radial-gradient(
      circle at 80% 10%,
      rgba(177, 129, 69, 0.13) 0 1px,
      transparent 1.5px
    );
  background-size:
    auto,
    14px 14px;
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
  background: var(
    --restaurant-gradient,
    linear-gradient(135deg, #fb923c, #ea580c)
  );
  box-shadow:
    0 0 0 5px
      color-mix(in srgb, var(--restaurant-color, #f97316) 18%, transparent),
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
    order: -1;
    height: 54svh;
    min-height: 390px;
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

/* Immersive FoodStory Taste Map */
.food-map-page {
  --food-orange: #f6782c;
  --food-orange-dark: #d95320;
  --food-cream: #fff7e9;
  --food-card: rgba(255, 253, 248, 0.9);
  --food-text: #432d20;
  --food-muted: #826d5d;
  --map-text: var(--food-text);
  --map-muted: var(--food-muted);
  --map-border: rgba(111, 75, 43, 0.14);
  position: relative;
  display: block;
  width: 100%;
  height: calc(100svh - var(--nav-height, 0px));
  min-height: 620px;
  overflow: hidden;
  color: var(--food-text);
  background: #eadcc8;
  isolation: isolate;
}

.food-map-canvas {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  background: #eadcc8;
}

.food-map-leaflet {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: #e8dcc8;
  box-shadow: none;
}

.food-map-city-label,
.food-map-legend {
  display: none;
}

.taste-scan-bar {
  position: absolute;
  top: 20px;
  left: 50%;
  z-index: 1500;
  display: grid;
  width: min(760px, calc(100% - 210px));
  min-height: 60px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 11px;
  padding: 7px 8px 7px 17px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.88);
  box-shadow:
    0 18px 45px rgba(82, 52, 27, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px) saturate(1.18);
  transform: translateX(-50%);
}

.taste-scan-link {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  color: var(--food-orange-dark);
  background: #fff0dc;
  font-size: 16px;
}

.taste-scan-bar input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--food-text);
  background: transparent;
  font-size: 13px;
  font-weight: 650;
}

.taste-scan-bar input::placeholder {
  color: #9c8878;
  opacity: 1;
}

.taste-scan-upload {
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(217, 83, 32, 0.16);
  border-radius: 50%;
  color: var(--food-orange-dark);
  background: #fff4e6;
}

.taste-scan-upload:hover {
  color: #fff;
  background: var(--food-orange);
}

.taste-scan-submit {
  min-height: 46px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, #ff8a35, var(--food-orange-dark));
  box-shadow: 0 10px 22px rgba(217, 83, 32, 0.25);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.04em;
  white-space: nowrap;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.taste-scan-submit:hover:not(:disabled) {
  box-shadow: 0 13px 27px rgba(217, 83, 32, 0.32);
  transform: translateY(-1px);
}

.taste-scan-submit:disabled {
  cursor: wait;
  opacity: 0.7;
}

.food-map-discovery-file {
  display: none;
}

.food-map-discovery-panel {
  position: absolute;
  top: 92px;
  left: 50%;
  z-index: 1800;
  width: min(760px, calc(100% - 210px));
  max-height: calc(100% - 120px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 24px;
  color: var(--food-text);
  background: rgba(255, 252, 246, 0.97);
  box-shadow: 0 24px 70px rgba(76, 45, 24, 0.24);
  transform: translateX(-50%);
}

.food-map-discovery-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.food-map-discovery-header span,
.food-map-discovery-result-heading > span,
.food-map-discovery-match span,
.food-map-discovery-draft span,
.food-map-discovery-ocr span,
.food-map-discovery-external span {
  color: var(--food-orange-dark);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.food-map-discovery-header h2 {
  margin-top: 4px;
  font-size: 23px;
}

.food-map-discovery-header p {
  margin: 5px 0 0;
  color: var(--food-muted);
  font-size: 11px;
}

.food-map-discovery-header > button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(111, 75, 43, 0.13);
  border-radius: 50%;
  color: var(--food-muted);
  background: #fff;
}

.food-map-discovery-inputs {
  display: grid;
  margin-top: 16px;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}

.food-map-discovery-drop {
  display: flex;
  min-height: 132px;
  overflow: hidden;
  padding: 16px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  border: 1.5px dashed rgba(217, 83, 32, 0.3);
  border-radius: 16px;
  color: var(--food-orange-dark);
  background: #fff7eb;
}

.food-map-discovery-drop.dragging {
  border-color: var(--food-orange-dark);
  background: #fff0dc;
}

.food-map-discovery-drop.filled {
  padding: 0;
  border-style: solid;
}

.food-map-discovery-drop img {
  width: 100%;
  height: 132px;
  object-fit: cover;
}

.food-map-discovery-drop strong {
  color: var(--food-text);
  font-size: 12px;
}

.food-map-discovery-drop small {
  color: var(--food-muted);
  font-size: 9px;
}

.food-map-discovery-hint {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.food-map-discovery-hint > span {
  font-size: 12px;
  font-weight: 900;
}

.food-map-discovery-hint input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(111, 75, 43, 0.18);
  border-radius: 13px;
  outline: 0;
  color: var(--food-text);
  background: #fff;
}

.food-map-discovery-hint input:focus {
  border-color: var(--food-orange);
  box-shadow: 0 0 0 3px rgba(246, 120, 44, 0.12);
}

.food-map-discovery-hint small {
  color: var(--food-muted);
  font-size: 10px;
  line-height: 1.5;
}

.food-map-discovery-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px solid rgba(196, 52, 52, 0.22);
  border-radius: 11px;
  color: #9f2f2f;
  background: #fff1f0;
  font-size: 11px;
}

.food-map-discovery-actions,
.food-map-discovery-draft-actions,
.food-map-discovery-fallback,
.food-map-discovery-dish-help {
  display: flex;
  align-items: center;
  gap: 9px;
}

.food-map-discovery-actions {
  margin-top: 14px;
}

.food-map-discovery-actions button,
.food-map-discovery-match button,
.food-map-discovery-draft-actions button,
.food-map-discovery-fallback button,
.food-map-discovery-dish-help button {
  display: inline-flex;
  min-height: 40px;
  padding: 0 14px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 11px;
  color: #fff;
  background: var(--food-orange-dark);
  font-size: 10px;
  font-weight: 900;
}

.food-map-discovery-actions button.secondary,
.food-map-discovery-draft-actions button.secondary,
.food-map-discovery-fallback button.secondary,
.food-map-discovery-dish-help button.secondary {
  border: 1px solid rgba(111, 75, 43, 0.16);
  color: var(--food-text);
  background: #fff;
}

.food-map-discovery-actions button:disabled {
  opacity: 0.5;
}

.food-map-discovery-loading {
  display: grid;
  margin: 15px 0 0;
  padding: 13px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  border-radius: 14px;
  background: #fff7eb;
  list-style: none;
}

.food-map-discovery-loading li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--food-muted);
  font-size: 9px;
  font-weight: 800;
}

.food-map-discovery-loading li > span {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(111, 75, 43, 0.16);
  border-radius: 50%;
}

.food-map-discovery-loading li.active {
  color: var(--food-orange-dark);
}

.food-map-discovery-loading li.complete {
  color: #318765;
}

.food-map-discovery-result {
  margin-top: 15px;
  padding: 16px;
  border: 1px solid rgba(111, 75, 43, 0.14);
  border-radius: 16px;
  background: #fff;
}

.food-map-discovery-result.status-external_place_found_in_foodmap {
  border-color: rgba(49, 135, 101, 0.3);
}

.food-map-discovery-result-heading h3 {
  margin-top: 5px;
  font-size: 17px;
  line-height: 1.35;
}

.food-map-discovery-result-heading p {
  margin: 7px 0 0;
  color: var(--food-muted);
  font-size: 10px;
  line-height: 1.5;
}

.food-map-discovery-clues {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.food-map-discovery-clues span {
  padding: 6px 9px;
  border-radius: 999px;
  color: var(--food-muted);
  background: #fff5e6;
  font-size: 9px;
}

.food-map-discovery-ocr,
.food-map-discovery-external {
  margin-top: 13px;
  padding: 12px 13px;
  border: 1px solid rgba(111, 75, 43, 0.14);
  border-radius: 13px;
  background: #fffaf2;
}

.food-map-discovery-ocr p {
  max-height: 100px;
  margin: 6px 0 0;
  overflow: auto;
  color: var(--food-text);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-line;
}

.food-map-discovery-ocr small {
  display: block;
  margin-top: 5px;
  color: var(--food-muted);
  font-size: 9px;
}

.food-map-discovery-external {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-color: rgba(246, 120, 44, 0.22);
  background: #fff6e9;
}

.food-map-discovery-external strong {
  display: block;
  margin-top: 4px;
  font-size: 14px;
}

.food-map-discovery-external p {
  margin: 3px 0 0;
  color: var(--food-muted);
  font-size: 10px;
}

.food-map-discovery-external > b {
  color: var(--food-muted);
  font-size: 9px;
  white-space: nowrap;
}

.food-map-discovery-match,
.food-map-discovery-draft {
  display: grid;
  margin-top: 13px;
  padding: 13px;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(49, 135, 101, 0.2);
  border-radius: 13px;
  background: #f3fbf7;
}

.food-map-discovery-match strong,
.food-map-discovery-draft strong {
  display: block;
  margin-top: 4px;
  font-size: 14px;
}

.food-map-discovery-match p,
.food-map-discovery-draft p {
  margin: 3px 0 0;
  color: var(--food-muted);
  font-size: 10px;
}

.food-map-discovery-score {
  padding: 6px 8px;
  border-radius: 999px;
  color: #287153;
  background: #dff4e9;
  font-size: 9px;
  white-space: nowrap;
}

.food-map-discovery-draft {
  grid-template-columns: minmax(0, 1fr) auto;
  border-color: rgba(246, 120, 44, 0.22);
  background: #fff8ef;
}

.food-map-discovery-fallback {
  margin-top: 13px;
  flex-wrap: wrap;
}

.food-map-discovery-fallback p,
.food-map-discovery-dish-help p {
  width: 100%;
  margin: 0;
  color: var(--food-muted);
  font-size: 10px;
  line-height: 1.5;
}

.food-map-discovery-dish-help {
  margin-top: 13px;
  flex-wrap: wrap;
}

.taste-edge-handle {
  position: absolute;
  top: 48%;
  z-index: 1400;
  display: flex;
  min-width: 48px;
  min-height: 116px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: #694631;
  background: rgba(255, 250, 241, 0.9);
  box-shadow: 0 12px 30px rgba(76, 50, 28, 0.16);
  backdrop-filter: blur(14px);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.03em;
  transform: translateY(-50%);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    transform 0.3s ease;
}

.taste-edge-handle span {
  writing-mode: vertical-rl;
}

.taste-edge-handle:hover {
  color: #fff;
  background: var(--food-orange);
}

.taste-edge-handle-left {
  left: 0;
  border-left: 0;
  border-radius: 0 22px 22px 0;
}

.taste-edge-handle-right {
  right: 0;
  border-right: 0;
  border-radius: 22px 0 0 22px;
}

.taste-drawer-backdrop {
  position: absolute;
  z-index: 3000;
  inset: 0;
  border: 0;
  background: rgba(55, 35, 22, 0.18);
  backdrop-filter: blur(2px);
}

.food-map-sidebar {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 12px;
  z-index: 4000;
  display: flex;
  width: min(370px, calc(100% - 24px));
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 26px;
  color: var(--food-text);
  background:
    radial-gradient(circle at 0 0, rgba(255, 185, 121, 0.22), transparent 38%),
    rgba(255, 250, 241, 0.95);
  box-shadow: 22px 24px 55px rgba(68, 43, 23, 0.2);
  backdrop-filter: blur(22px) saturate(1.08);
  pointer-events: none;
  opacity: 0;
  transform: translateX(calc(-100% - 28px));
  transition:
    transform 0.3s ease,
    opacity 0.2s ease;
}

.food-map-sidebar.open {
  pointer-events: auto;
  opacity: 1;
  transform: translateX(0);
}

.taste-detail-drawer {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 4100;
  display: flex;
  width: min(420px, calc(100% - 24px));
  overflow: hidden auto;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 26px;
  color: var(--food-text);
  background: rgba(255, 250, 241, 0.96);
  box-shadow: -22px 24px 55px rgba(68, 43, 23, 0.2);
  backdrop-filter: blur(22px) saturate(1.08);
  pointer-events: none;
  opacity: 0;
  transform: translateX(calc(100% + 28px));
  transition:
    transform 0.3s ease,
    opacity 0.2s ease;
  scrollbar-color: rgba(220, 99, 40, 0.34) transparent;
  scrollbar-width: thin;
}

.taste-detail-drawer.open {
  pointer-events: auto;
  opacity: 1;
  transform: translateX(0);
}

.taste-drawer-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(112, 77, 48, 0.12);
  border-radius: 50%;
  color: #694c38;
  background: rgba(255, 253, 248, 0.9);
  box-shadow: 0 8px 20px rgba(78, 49, 25, 0.13);
  backdrop-filter: blur(10px);
}

.food-map-sidebar .taste-drawer-close {
  top: 18px;
}

.food-map-sidebar-header {
  flex: 0 0 auto;
  padding: 25px 62px 18px 24px;
  border-bottom-color: rgba(111, 75, 43, 0.12);
  background: transparent;
}

.food-map-sidebar-header h1 {
  color: var(--food-text);
  font-size: 24px;
}

.food-map-sidebar-body {
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 28px;
  scrollbar-color: rgba(220, 99, 40, 0.3) transparent;
  scrollbar-width: thin;
}

.food-map-mode-toggle {
  flex: 0 0 auto;
  border-color: rgba(115, 76, 43, 0.12);
  background: rgba(126, 83, 43, 0.05);
}

.food-map-mode-toggle button {
  color: #8d7765;
}

.food-map-mode-toggle button.active {
  border-color: transparent;
  background: linear-gradient(135deg, #ff8a35, var(--food-orange-dark));
  box-shadow: 0 8px 20px rgba(217, 83, 32, 0.2);
}

.food-map-layer-toggle {
  flex: 0 0 auto;
}

.food-map-layer-toggle label {
  color: #846f5e;
  background: rgba(255, 255, 255, 0.58);
}

.food-map-layer-toggle label.restaurant.active,
.food-map-layer-toggle label.personal.active {
  color: #fff;
}

.food-map-primary-action,
.food-map-save {
  background: linear-gradient(135deg, #ff8a35, var(--food-orange-dark));
}

.food-map-detail-panel {
  display: none !important;
}

.taste-result-sheet {
  position: absolute;
  bottom: 18px;
  left: 50%;
  z-index: 1800;
  width: min(78%, 1120px);
  min-width: 640px;
  height: 224px;
  padding: 13px 16px 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 25px;
  background: rgba(255, 250, 241, 0.9);
  box-shadow: 0 20px 48px rgba(73, 46, 24, 0.2);
  backdrop-filter: blur(20px) saturate(1.12);
  transform: translateX(-50%);
  transition:
    transform 0.3s ease,
    opacity 0.2s ease;
}

.taste-result-sheet.collapsed {
  transform: translate(-50%, calc(100% - 43px));
}

.taste-sheet-handle {
  display: grid;
  width: 100%;
  height: 18px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
}

.taste-sheet-handle span {
  width: 52px;
  height: 5px;
  border-radius: 999px;
  background: rgba(115, 79, 50, 0.25);
}

.taste-sheet-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 0 3px 11px;
}

.taste-sheet-heading h2 {
  margin: 0;
  color: var(--food-text);
  font-size: 17px;
}

.taste-sheet-heading p {
  margin: 3px 0 0;
  color: var(--food-muted);
  font-size: 11px;
}

.taste-sheet-heading > span {
  color: var(--food-orange-dark);
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.taste-result-list {
  display: flex;
  gap: 11px;
  overflow-x: auto;
  padding: 1px 2px 9px;
  scroll-snap-type: x proximity;
  scrollbar-color: rgba(225, 106, 46, 0.28) transparent;
  scrollbar-width: thin;
}

.taste-result-card {
  position: relative;
  display: grid;
  min-width: 265px;
  max-width: 265px;
  min-height: 124px;
  grid-template-columns: 94px minmax(0, 1fr);
  gap: 11px;
  padding: 8px 38px 8px 8px;
  border: 1px solid rgba(113, 77, 46, 0.11);
  border-radius: 18px;
  color: var(--food-text);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 18px rgba(83, 54, 29, 0.07);
  cursor: pointer;
  scroll-snap-align: start;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.taste-result-card:hover,
.taste-result-card:focus-visible,
.taste-result-card.active {
  border-color: rgba(240, 112, 46, 0.38);
  outline: 0;
  box-shadow: 0 12px 24px rgba(104, 58, 24, 0.13);
  transform: translateY(-2px);
}

.taste-result-card img {
  width: 94px;
  height: 108px;
  border-radius: 13px;
  object-fit: cover;
}

.taste-result-copy {
  display: flex;
  min-width: 0;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
}

.taste-result-copy > span {
  overflow: hidden;
  color: var(--food-orange-dark);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.taste-result-copy strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--food-text);
  font-size: 13px;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.taste-result-copy p {
  overflow: hidden;
  margin: 0;
  color: var(--food-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.taste-result-copy small {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #9a8069;
  font-size: 9px;
}

.taste-result-copy small b {
  color: #dc8b12;
}

.taste-result-card > button {
  position: absolute;
  top: 10px;
  right: 9px;
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #a38772;
  background: rgba(255, 250, 241, 0.9);
}

.taste-result-card > button.saved {
  color: #e85d34;
  background: #fff0e7;
}

.taste-result-card > button.saved .app-icon,
.taste-detail-media > button.saved .app-icon {
  fill: currentColor;
}

.taste-result-empty {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--food-muted);
  font-size: 12px;
}

.taste-floating-scan {
  position: absolute;
  right: 24px;
  bottom: 76px;
  z-index: 1900;
  display: flex;
  width: 82px;
  height: 82px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 5px;
  border: 4px solid rgba(255, 250, 241, 0.92);
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #ff943f, #dc5321);
  box-shadow:
    0 16px 32px rgba(188, 67, 23, 0.33),
    0 0 0 7px rgba(246, 120, 44, 0.13);
  font-size: 9px;
  font-weight: 900;
  transition:
    bottom 0.3s ease,
    transform 0.2s ease;
}

.taste-floating-scan.raised {
  bottom: 262px;
}

.taste-floating-scan:hover {
  transform: translateY(-3px) scale(1.02);
}

.taste-detail-media {
  position: relative;
  flex: 0 0 auto;
  padding: 12px 12px 0;
}

.taste-detail-media img {
  width: 100%;
  height: 235px;
  border-radius: 19px;
  object-fit: cover;
  box-shadow: inset 0 0 0 1px rgba(83, 51, 27, 0.08);
}

.taste-detail-media > span {
  position: absolute;
  bottom: 14px;
  left: 24px;
  padding: 7px 10px;
  border-radius: 999px;
  color: #64412d;
  background: rgba(255, 250, 241, 0.92);
  box-shadow: 0 6px 16px rgba(75, 45, 23, 0.13);
  font-size: 9px;
  font-weight: 900;
}

.taste-detail-media > button {
  position: absolute;
  right: 24px;
  bottom: 14px;
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: #855f47;
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 6px 16px rgba(75, 45, 23, 0.13);
}

.taste-detail-media > button.saved {
  color: #e85d34;
}

.taste-detail-content {
  display: grid;
  gap: 17px;
  padding: 21px 22px 25px;
}

.taste-detail-title {
  display: grid;
  gap: 5px;
}

.taste-detail-title > span,
.taste-detail-story > span {
  color: var(--food-orange-dark);
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.taste-detail-title h2 {
  margin: 0;
  color: var(--food-text);
  font-size: clamp(25px, 2.2vw, 32px);
  line-height: 1.08;
}

.taste-detail-title p {
  margin: 0;
  color: var(--food-muted);
  font-family: var(--font-serif);
  font-size: 14px;
  font-style: italic;
  line-height: 1.45;
}

.taste-detail-rating {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.taste-detail-rating strong,
.taste-detail-rating span {
  padding: 7px 10px;
  border-radius: 999px;
  background: #fff0df;
  font-size: 10px;
}

.taste-detail-rating strong {
  color: #d98911;
}

.taste-detail-rating span {
  color: #795e49;
}

.taste-detail-facts {
  display: grid;
  gap: 0;
  margin: 0;
  border-top: 1px solid rgba(113, 76, 44, 0.11);
  border-bottom: 1px solid rgba(113, 76, 44, 0.11);
}

.taste-detail-facts > div {
  display: grid;
  gap: 5px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(113, 76, 44, 0.08);
}

.taste-detail-facts > div:last-child {
  border-bottom: 0;
}

.taste-detail-facts dt {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #a06b42;
  font-size: 10px;
  font-weight: 900;
}

.taste-detail-facts dd {
  margin: 0 0 0 24px;
  color: #655141;
  font-size: 12px;
  line-height: 1.45;
}

.taste-detail-story {
  display: grid;
  gap: 7px;
  padding: 15px;
  border-radius: 15px;
  background: rgba(255, 239, 216, 0.58);
}

.taste-detail-story p {
  margin: 0;
  color: #6f5947;
  font-size: 12px;
  line-height: 1.65;
}

.taste-related-recipe {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px solid rgba(113, 76, 44, 0.12);
  border-radius: 14px;
  color: #76533a;
  background: rgba(255, 255, 255, 0.6);
}

.taste-related-recipe span {
  display: grid;
  gap: 2px;
}

.taste-related-recipe strong {
  color: var(--food-text);
  font-size: 11px;
}

.taste-related-recipe small {
  color: var(--food-muted);
  font-size: 9px;
}

.taste-detail-actions {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr;
  gap: 8px;
}

.taste-detail-actions button,
.taste-detail-owner-actions button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(113, 76, 44, 0.13);
  border-radius: 12px;
  color: #6f5542;
  background: rgba(255, 255, 255, 0.72);
  font-size: 10px;
  font-weight: 900;
}

.taste-detail-actions button.primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, #ff8a35, var(--food-orange-dark));
  box-shadow: 0 9px 18px rgba(217, 83, 32, 0.2);
}

.taste-detail-owner-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 4px;
}

.taste-detail-owner-actions button.danger {
  color: #d34a3e;
  border-color: rgba(211, 74, 62, 0.2);
  background: rgba(255, 239, 236, 0.72);
}

.taste-detail-empty {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 38px 28px;
  text-align: center;
}

.taste-detail-empty > span {
  display: grid;
  width: 72px;
  height: 72px;
  margin-bottom: 5px;
  place-items: center;
  border-radius: 24px;
  color: var(--food-orange-dark);
  background: #fff0df;
  box-shadow: inset 0 0 0 1px rgba(220, 89, 35, 0.1);
}

.taste-detail-empty h2 {
  margin: 0;
  color: var(--food-text);
  font-size: 25px;
}

.taste-detail-empty > p:last-child {
  max-width: 260px;
  margin: 0;
  color: var(--food-muted);
  font-size: 12px;
  line-height: 1.55;
}

.food-map-picking-banner {
  top: 94px;
  z-index: 2100;
  border: 1px solid rgba(241, 111, 44, 0.3);
  border-radius: 999px;
  color: var(--food-text);
  background: rgba(255, 250, 241, 0.95);
}

:deep(.leaflet-tile-pane) {
  filter: sepia(0.28) saturate(0.74) brightness(1.07) contrast(0.9);
}

:deep(.leaflet-control-zoom) {
  overflow: hidden;
  border: 1px solid rgba(119, 81, 48, 0.16) !important;
  border-radius: 15px !important;
  box-shadow: 0 12px 28px rgba(75, 46, 22, 0.16) !important;
}

:deep(.leaflet-control-zoom a) {
  width: 42px;
  height: 42px;
  border-color: rgba(116, 77, 44, 0.1);
  color: #765239;
  background: rgba(255, 250, 241, 0.94);
  font-size: 20px;
  line-height: 42px;
  backdrop-filter: blur(12px);
}

:deep(.leaflet-bottom.leaflet-right) {
  right: 112px;
  bottom: 260px;
}

.food-map-page.results-collapsed :deep(.leaflet-bottom.leaflet-right) {
  bottom: 70px;
}

:deep(.leaflet-control-attribution) {
  border-radius: 9px 0 0 0;
  color: #806c58;
  background: rgba(255, 250, 241, 0.72);
  font-size: 9px;
}

:deep(.food-map-marker-shell),
:deep(.restaurant-marker-shell),
:deep(.taste-map-cluster-shell) {
  border: 0;
  background: transparent;
}

:deep(.taste-food-marker) {
  position: relative;
  display: flex;
  width: 58px;
  height: 68px;
  align-items: center;
  flex-direction: column;
  filter: drop-shadow(0 9px 11px rgba(75, 43, 20, 0.24));
}

:deep(.taste-food-marker-core) {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 4px solid rgba(255, 253, 248, 0.98);
  border-radius: 50%;
  background:
    radial-gradient(
      circle at 35% 28%,
      rgba(255, 255, 255, 0.32),
      transparent 33%
    ),
    var(--restaurant-gradient, var(--marker-color));
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--marker-color) 22%, transparent),
    inset 0 -5px 12px rgba(98, 43, 16, 0.12);
  font-size: 23px;
}

:deep(.taste-food-marker-rating) {
  position: relative;
  z-index: 2;
  min-width: 38px;
  margin-top: -4px;
  padding: 3px 6px;
  border: 2px solid #fffdf8;
  border-radius: 999px;
  color: #7b4c2d;
  background: #fff6e9;
  box-shadow: 0 4px 8px rgba(76, 44, 20, 0.13);
  font-size: 8px;
  font-weight: 950;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

:deep(.taste-food-marker.community .taste-food-marker-rating) {
  color: #47658a;
}

:deep(.taste-food-marker.preview .taste-food-marker-core) {
  color: #fff;
  font-size: 24px;
  font-weight: 900;
}

:deep(.taste-map-cluster) {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 4px solid rgba(255, 253, 248, 0.95);
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #ff913a, #d95120);
  box-shadow:
    0 0 0 7px rgba(246, 120, 44, 0.18),
    0 10px 20px rgba(105, 50, 20, 0.25);
  font-size: 12px;
  font-weight: 950;
}

:deep(.taste-map-cluster.restaurant) {
  background: linear-gradient(135deg, #f78731, #bd4c22);
}

@media (max-width: 1120px) {
  .food-map-page {
    display: block;
    height: calc(100svh - var(--nav-height, 0px));
    min-height: 600px;
    overflow: hidden;
  }

  .food-map-canvas {
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  .food-map-leaflet {
    min-height: 0;
    border-radius: 0;
  }

  .food-map-sidebar,
  .taste-detail-drawer {
    min-height: 0;
    margin: 0;
  }

  .taste-result-sheet {
    width: calc(100% - 150px);
    min-width: 0;
  }
}

@media (max-width: 760px) {
  .food-map-page {
    height: calc(100svh - var(--nav-height, 0px));
    min-height: 560px;
  }

  .taste-scan-bar {
    top: 10px;
    width: calc(100% - 20px);
    min-height: 54px;
    gap: 7px;
    padding: 6px 6px 6px 12px;
  }

  .taste-scan-link {
    width: 30px;
    height: 30px;
    font-size: 14px;
  }

  .taste-scan-bar input {
    font-size: 11px;
  }

  .taste-scan-submit {
    min-height: 42px;
    padding: 0 13px;
    font-size: 9px;
  }

  .taste-scan-upload {
    width: 36px;
    height: 36px;
  }

  .food-map-discovery-panel {
    top: 72px;
    width: calc(100% - 16px);
    max-height: calc(100% - 82px);
    padding: 16px;
    border-radius: 20px;
  }

  .food-map-discovery-inputs {
    grid-template-columns: 1fr;
  }

  .food-map-discovery-drop {
    min-height: 112px;
  }

  .food-map-discovery-drop img {
    height: 150px;
  }

  .food-map-discovery-loading {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .food-map-discovery-match,
  .food-map-discovery-draft {
    grid-template-columns: 1fr;
  }

  .food-map-discovery-draft-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .taste-edge-handle {
    top: 74px;
    min-width: 0;
    min-height: 36px;
    flex-direction: row;
    gap: 6px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 10px;
    transform: none;
  }

  .taste-edge-handle span {
    writing-mode: horizontal-tb;
  }

  .taste-edge-handle-left {
    left: 10px;
    border-left: 1px solid rgba(255, 255, 255, 0.7);
  }

  .taste-edge-handle-right {
    right: 10px;
    border-right: 1px solid rgba(255, 255, 255, 0.7);
  }

  .food-map-sidebar,
  .taste-detail-drawer {
    top: auto;
    right: 8px;
    bottom: 0;
    left: 8px;
    width: auto;
    height: min(82svh, 720px);
    border-radius: 26px 26px 0 0;
    opacity: 0;
    transform: translateY(calc(100% + 20px));
  }

  .food-map-sidebar.open,
  .taste-detail-drawer.open {
    opacity: 1;
    transform: translateY(0);
  }

  .taste-detail-media img {
    height: 210px;
  }

  .taste-result-sheet {
    bottom: 8px;
    width: calc(100% - 16px);
    height: 228px;
    min-width: 0;
    padding-right: 11px;
    padding-left: 11px;
    border-radius: 22px;
  }

  .taste-sheet-heading p {
    max-width: 235px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .taste-result-card {
    min-width: 238px;
    max-width: 238px;
    grid-template-columns: 82px minmax(0, 1fr);
  }

  .taste-result-card img {
    width: 82px;
  }

  .taste-floating-scan {
    right: 14px;
    bottom: 66px;
    width: 70px;
    height: 70px;
  }

  .taste-floating-scan.raised {
    bottom: 254px;
  }

  .food-map-picking-banner {
    top: 118px;
    width: calc(100% - 30px);
    justify-content: center;
  }

  :deep(.leaflet-bottom.leaflet-right) {
    right: 88px;
    bottom: 246px;
  }

  .food-map-page.results-collapsed :deep(.leaflet-bottom.leaflet-right) {
    bottom: 58px;
  }
}

@media (max-width: 480px) {
  .taste-scan-bar input::placeholder {
    color: transparent;
  }

  .taste-scan-bar input {
    font-size: 10px;
  }

  .taste-scan-submit {
    padding: 0 10px;
  }

  .taste-scan-submit {
    max-width: 92px;
    line-height: 1.1;
    white-space: normal;
  }

  .food-map-discovery-header h2 {
    font-size: 19px;
  }

  .taste-sheet-heading {
    align-items: flex-start;
  }

  .taste-sheet-heading > span {
    display: none;
  }

  .taste-detail-actions {
    grid-template-columns: 1fr 1fr;
  }

  .taste-detail-actions button.primary {
    grid-column: 1 / -1;
  }

  .food-map-sidebar-header {
    padding-right: 60px;
  }
}

/* Final optimized mockup pass: food photo pins, vertical result cards, and smoother map panning */
.food-map-page,
.food-map-canvas,
.food-map-leaflet {
  contain: layout paint style;
}

.food-map-leaflet {
  will-change: transform;
}

.taste-menu-button {
  position: absolute;
  top: 24px;
  left: 28px;
  z-index: 1600;
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 50%;
  color: #432d20;
  background: rgba(255, 253, 248, 0.9);
  box-shadow: 0 14px 34px rgba(82, 52, 27, 0.16);
  backdrop-filter: blur(14px);
  font-size: 22px;
  font-weight: 900;
}

.taste-top-actions {
  position: absolute;
  top: 24px;
  right: 28px;
  z-index: 1600;
  display: flex;
  align-items: center;
  gap: 10px;
}

.taste-top-actions button {
  position: relative;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 50%;
  background: rgba(255, 253, 248, 0.9);
  box-shadow: 0 14px 34px rgba(82, 52, 27, 0.16);
  backdrop-filter: blur(14px);
}

.taste-top-actions button > span {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 2px solid #fffaf2;
  border-radius: 50%;
  color: #fff;
  background: #e95b2b;
  font-size: 9px;
  font-weight: 950;
}

.taste-avatar-button img {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
}

.taste-locate-button {
  position: absolute;
  right: 116px;
  bottom: 334px;
  z-index: 1600;
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 50%;
  color: #573d2b;
  background: rgba(255, 253, 248, 0.92);
  box-shadow: 0 12px 28px rgba(82, 52, 27, 0.16);
  backdrop-filter: blur(14px);
  font-size: 21px;
  font-weight: 900;
}

.taste-menu-button,
.taste-top-actions button,
.taste-locate-button,
.taste-edge-handle,
.taste-floating-scan {
  transform: translateZ(0);
  backface-visibility: hidden;
}

:deep(.leaflet-tile-pane) {
  filter: sepia(0.34) saturate(0.68) hue-rotate(340deg) brightness(1.1)
    contrast(0.86);
  opacity: 0.88;
}

:deep(.leaflet-container) {
  background: #f2e3cd;
}

:deep(.taste-food-marker) {
  width: 76px;
  height: 92px;
  filter: drop-shadow(0 12px 18px rgba(164, 91, 32, 0.22));
  transform: translateZ(0);
}

:deep(.taste-food-marker-core) {
  width: 64px;
  height: 64px;
  overflow: hidden;
  border: 4px solid rgba(255, 253, 248, 0.98);
  border-radius: 50%;
  background: #fff8ef;
  box-shadow:
    0 0 0 2px rgba(240, 112, 46, 0.9),
    0 10px 22px rgba(94, 52, 24, 0.18);
}

:deep(.taste-food-marker-core img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.taste-food-marker-rating) {
  min-width: 44px;
  margin-top: -3px;
  padding: 5px 8px;
  border: 2px solid #fffdf8;
  border-radius: 999px;
  color: #5d3b25;
  background: #fffaf2;
  box-shadow: 0 6px 14px rgba(76, 44, 20, 0.14);
  font-size: 10px;
  font-weight: 950;
}

:deep(.taste-food-marker.preview .taste-food-marker-core) {
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #ff8a35, #d95320);
}

:deep(.taste-map-cluster) {
  width: 52px;
  height: 52px;
  border: 4px solid rgba(255, 253, 248, 0.95);
  background: linear-gradient(135deg, #ff8a35, #e04f18);
  box-shadow:
    0 0 0 8px rgba(246, 120, 44, 0.15),
    0 12px 24px rgba(105, 50, 20, 0.28);
  font-size: 14px;
}

.taste-result-sheet {
  width: min(1080px, calc(100% - 520px));
  min-width: 720px;
  height: 296px;
  padding: 14px 22px 22px;
  border-radius: 34px;
  contain: layout paint style;
  will-change: transform;
}

.taste-sheet-heading h2 {
  font-size: 22px;
}

.taste-result-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 180px;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x proximity;
}

.taste-result-card {
  display: grid;
  min-width: 180px;
  max-width: 180px;
  min-height: 192px;
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  contain: layout paint style;
}

.taste-result-card:hover,
.taste-result-card:focus-visible,
.taste-result-card.active {
  transform: translateY(-2px) translateZ(0);
}

.taste-result-card img {
  width: 100%;
  height: 116px;
  border-radius: 0;
  object-fit: cover;
}

.taste-result-copy {
  padding: 10px 12px 12px;
}

.taste-result-copy > span {
  display: none;
}

.taste-result-copy strong {
  font-size: 13px;
  -webkit-line-clamp: 1;
}

.taste-result-copy p {
  font-size: 10px;
}

.taste-result-card > button {
  top: 10px;
  right: 10px;
  color: #fff;
  background: rgba(66, 36, 20, 0.3);
  backdrop-filter: blur(8px);
}

@media (max-width: 1120px) {
  .taste-result-sheet {
    width: calc(100% - 150px);
    min-width: 0;
  }

  .taste-locate-button {
    right: 104px;
  }
}

@media (max-width: 760px) {
  .taste-menu-button {
    top: 74px;
    left: 10px;
    width: 38px;
    height: 38px;
    font-size: 17px;
  }

  .taste-top-actions {
    top: 74px;
    right: 10px;
  }

  .taste-top-actions button {
    width: 38px;
    height: 38px;
  }

  .taste-top-actions button:first-child {
    display: none;
  }

  .taste-avatar-button img {
    width: 31px;
    height: 31px;
  }

  .taste-locate-button {
    right: 88px;
    bottom: 306px;
    width: 42px;
    height: 42px;
  }

  .taste-result-sheet {
    width: calc(100% - 16px);
    height: 242px;
    min-width: 0;
  }

  .taste-result-list {
    grid-auto-columns: 158px;
  }

  .taste-result-card {
    min-width: 158px;
    max-width: 158px;
    min-height: 184px;
  }

  .taste-result-card img {
    height: 108px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .taste-scan-submit,
  .taste-scan-upload,
  .taste-result-card,
  .taste-floating-scan,
  .food-map-sidebar,
  .taste-detail-drawer,
  .taste-result-sheet {
    transition: none !important;
  }
}

/* ==========================================================
   SMOOTH MAP HOTFIX: preserve street detail and reduce rendering lag
   ========================================================== */
:deep(.leaflet-tile-pane) {
  filter: saturate(0.98) contrast(1.03) brightness(0.99) !important;
  opacity: 1 !important;
}

:deep(.leaflet-container) {
  background: #eee7dc !important;
}

:deep(.leaflet-marker-icon),
:deep(.leaflet-marker-shadow),
:deep(.food-map-marker-shell),
:deep(.restaurant-marker-shell),
:deep(.taste-map-cluster-shell) {
  will-change: auto !important;
  transform-style: flat !important;
}

:deep(.taste-food-marker) {
  width: 58px !important;
  height: 72px !important;
  filter: none !important;
  transform: none !important;
}

:deep(.taste-food-marker-core) {
  display: grid !important;
  width: 46px !important;
  height: 46px !important;
  place-items: center !important;
  overflow: hidden !important;
  border: 3px solid rgba(255, 253, 248, 0.96) !important;
  border-radius: 50% !important;
  background: var(
    --restaurant-gradient,
    linear-gradient(135deg, #ff9345, #dc5b28)
  ) !important;
  box-shadow: 0 3px 9px rgba(74, 45, 24, 0.18) !important;
  font-size: 20px !important;
}

:deep(.taste-food-marker-core img) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}

:deep(.taste-food-marker-emoji) {
  line-height: 1 !important;
  filter: none !important;
}

:deep(.taste-food-marker-rating) {
  min-width: 34px !important;
  margin-top: -3px !important;
  padding: 3px 6px !important;
  border: 1px solid rgba(255, 253, 248, 0.98) !important;
  border-radius: 999px !important;
  color: #5f3a24 !important;
  background: rgba(255, 250, 242, 0.96) !important;
  box-shadow: 0 2px 5px rgba(76, 44, 20, 0.13) !important;
  font-size: 9px !important;
  font-weight: 900 !important;
  line-height: 1 !important;
}

:deep(.taste-map-cluster) {
  width: 42px !important;
  height: 42px !important;
  border: 3px solid rgba(255, 253, 248, 0.96) !important;
  border-radius: 50% !important;
  background: linear-gradient(135deg, #f98c3d, #d95a24) !important;
  box-shadow: 0 4px 10px rgba(105, 50, 20, 0.22) !important;
  font-size: 12px !important;
}

.taste-scan-bar,
.taste-result-sheet,
.taste-edge-handle,
.taste-top-actions button,
.taste-menu-button,
.taste-floating-scan,
.taste-locate-button {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.taste-menu-button,
.taste-top-actions button,
.taste-locate-button,
.taste-edge-handle,
.taste-floating-scan {
  transform: none !important;
  will-change: auto !important;
}

.taste-result-sheet {
  contain: layout paint !important;
  will-change: auto !important;
  box-shadow: 0 10px 24px rgba(75, 46, 22, 0.12) !important;
}
</style>
