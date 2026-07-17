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
import { useRoute, useRouter } from "vue-router";
import L from "leaflet";
import "leaflet.markercluster";
import AppIcon from "../components/AppIcon.vue";
import FoodMapDiscoveryTray from "../components/food-map/FoodMapDiscoveryTray.vue";
import FoodMapGuestBanner from "../components/food-map/FoodMapGuestBanner.vue";
import FoodMapImportPanel from "../components/food-map/FoodMapImportPanel.vue";
import FoodMapRail from "../components/food-map/FoodMapRail.vue";
import VisionAutoResultPanel from "../components/food-map/VisionAutoResultPanel.vue";
import { useVisionAuto } from "../composables/useVisionAuto";
import { useFoodSpotStore } from "../stores/foodSpotStore";
import { useAuthStore } from "../stores/authStore";
import { useRestaurantStore } from "../stores/restaurantStore";
import { useUiStore } from "../stores/uiStore";
import {
  foodMapDistanceFromCenter,
  foodMapPriceTier,
  normalizeFoodMapDiscovery as normalizeDiscovery,
} from "../utils/foodMapDiscovery";
import {
  buildFoodSpotPayload,
  createFoodSpotForm,
  hasFoodSpotCoordinates,
  validateFoodSpotForm,
} from "../utils/foodSpotForm";
import { resolveInitialFoodMapMode } from "../utils/foodMapAccess";

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
const authStore = useAuthStore();
const restaurantStore = useRestaurantStore();
const uiStore = useUiStore();
const route = useRoute();
const router = useRouter();
const initialDish =
  typeof route.query.dish === "string" ? route.query.dish.trim() : "";
const initialMode = resolveInitialFoodMapMode(
  route.query.mode,
  authStore.isLoggedIn,
);
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
const mapCenter = ref([...HCMC_CENTER]);
const mapMode = ref(initialMode);
const sidebarMode = ref("list");
const showRestaurants = ref(true);
const showPersonalSpots = ref(authStore.isLoggedIn);
const restaurantFiltersOpen = ref(false);
const isFilterDrawerOpen = ref(false);
const isDetailDrawerOpen = ref(false);
const selectedRestaurant = ref(null);
const selectedCommunitySpot = ref(null);
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
const form = reactive(createFoodSpotForm());
const placeNameInput = ref(null);
const locationButton = ref(null);
const optionalDetailsOpen = ref(false);
const importPanel = ref(null);
const activeViewItem = ref("discover");
const discoveryTab = ref("discover");
const activeVisionCandidate = ref(null);
const isGuestPreview = computed(() => !authStore.isLoggedIn);
const availableMapModes = computed(() =>
  isGuestPreview.value
    ? [["community", "Community"]]
    : [
        ["personal", "My Map"],
        ["community", "Community"],
        ["stats", "Statistics"],
      ],
);
const foodMapViewItems = computed(() => {
  const places = resultPlaces.value;
  const pricedPlaces = places.filter((place) => Number.isFinite(foodMapPriceTier(place)));
  const lowestPriceTier = pricedPlaces.length
    ? Math.min(...pricedPlaces.map((place) => foodMapPriceTier(place)))
    : Number.NaN;

  return [
    { id: "discover", label: "All places", icon: "map-pin", count: places.length },
    {
      id: "nearby",
      label: "Near map",
      icon: "home",
      count: places.filter((place) =>
        Number.isFinite(foodMapDistanceFromCenter(place, mapCenter.value)),
      ).length,
    },
    {
      id: "top-rated",
      label: "Top rated",
      icon: "star",
      count: places.filter((place) => place.rating > 0).length,
    },
    {
      id: "budget",
      label: "Budget picks",
      icon: "tags",
      count: Number.isFinite(lowestPriceTier)
        ? pricedPlaces.filter((place) => foodMapPriceTier(place) === lowestPriceTier).length
        : 0,
    },
    { id: "surprise", label: "Surprise me", icon: "sparkles", utility: true },
    { id: "filters", label: "More filters", icon: "filter", utility: true },
  ];
});
const {
  inputMode: visionInputMode,
  state: visionState,
  url: visionUrl,
  inputError: visionInputError,
  errorMessage: visionErrorMessage,
  result: visionResult,
  elapsedSeconds: visionElapsedSeconds,
  hasSubmittedSource: visionHasSubmittedSource,
  canAnalyze: canAnalyzeVision,
  sourceSummary: visionSourceSummary,
  analyzingCopy: visionAnalyzingCopy,
  openLink: openVisionLink,
  backToMenu: backVisionToMenu,
  setUrl: setVisionUrl,
  clearUrl: clearVisionUrl,
  clearResult: clearVisionResult,
  cancel: cancelVisionAnalysis,
  submitDishDiscovery,
  selectDish: selectVisionDish,
} = useVisionAuto();

let map = null;
let markerCluster = null;
let restaurantCluster = null;
let previewMarker = null;
let filterTimer = 0;
let communitySearchTimer = 0;
let restaurantSearchTimer = 0;
let popupTimer = 0;
let layoutTimer = 0;
let markerRenderFrame = 0;
let restaurantRenderFrame = 0;
const markersById = new Map();
const selectedSpot = computed(() => foodSpotStore.selectedSpot);
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
const discoveryTrayPlaces = computed(() => {
  let places = [...resultPlaces.value];

  if (discoveryTab.value === "nearby") {
    places = places
      .filter((place) => Number.isFinite(foodMapDistanceFromCenter(place, mapCenter.value)))
      .sort(
        (left, right) =>
          foodMapDistanceFromCenter(left, mapCenter.value) -
          foodMapDistanceFromCenter(right, mapCenter.value),
      );
  } else if (discoveryTab.value === "trending") {
    places = places.filter((place) => Number.isFinite(discoveryTrendScore(place)));
    places.sort((left, right) => discoveryTrendScore(right) - discoveryTrendScore(left));
  } else if (discoveryTab.value === "top-rated") {
    places = places.filter((place) => place.rating > 0);
    places.sort((left, right) => right.rating - left.rating);
  } else if (discoveryTab.value === "hidden-gems") {
    places = places.filter((place) => place.raw?.is_hidden_gem === true);
  } else if (discoveryTab.value === "budget") {
    const pricedPlaces = places.filter((place) => Number.isFinite(foodMapPriceTier(place)));
    const lowestPriceTier = pricedPlaces.length
      ? Math.min(...pricedPlaces.map((place) => foodMapPriceTier(place)))
      : Number.NaN;
    places = Number.isFinite(lowestPriceTier)
      ? pricedPlaces.filter((place) => foodMapPriceTier(place) === lowestPriceTier)
      : [];
  }

  return places.slice(0, 8);
});
const discoveryTrayEmptyMessage = computed(() => {
  if (discoveryTab.value === "nearby") {
    return "No mapped places have coordinates near this view yet.";
  }
  if (discoveryTab.value === "trending") {
    return "FoodStory does not have trend data for these places yet.";
  }
  if (discoveryTab.value === "hidden-gems") {
    return "No places are marked as hidden gems in this view yet.";
  }
  if (discoveryTab.value === "budget") {
    return "No explicit price range is available for this view yet.";
  }
  return "No places match this view yet. Try changing the active map filters.";
});

watch(foodMapViewItems, (items) => {
  if (items.some((item) => item.id === activeViewItem.value)) return;
  activeViewItem.value = "discover";
  discoveryTab.value = "discover";
});

const visionMatchedMapPlace = computed(() => {
  const match = visionResult.value?.matchedPlace;
  const existing = findExistingVisionPlace(match);
  return existing ? normalizeDiscovery(existing.place, existing.type) : null;
});
const sidebarCount = computed(() => {
  if (mapMode.value === "personal") return displayedPersonalSpots.value.length;
  return visibleSpots.value.length;
});
const sidebarKicker = computed(() => {
  if (mapMode.value === "community") return "FoodStory community";
  if (mapMode.value === "stats") return "Your journey";
  return "Private FoodStory";
});
const sidebarTitle = computed(() => {
  if (mapMode.value === "community") return "Community Food Map";
  if (mapMode.value === "stats") return "Food Statistics";
  return "My Food Map";
});
const sidebarStoryline = computed(() => {
  if (mapMode.value === "community") return "Shared places from FoodStory explorers";
  if (mapMode.value === "stats") return "A private view of your food journey";
  return "Only your account can manage these places";
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

function discoveryTrendScore(place) {
  const value = Number(
    place?.raw?.trend_score ?? place?.raw?.trendScore ?? Number.NaN,
  );
  return Number.isFinite(value) ? value : Number.NaN;
}

function sameCoordinates(left, right) {
  const leftLat = Number(left?.latitude ?? left?.lat);
  const leftLng = Number(left?.longitude ?? left?.lng);
  const rightLat = Number(right?.latitude ?? right?.lat);
  const rightLng = Number(right?.longitude ?? right?.lng);
  return (
    Number.isFinite(leftLat) &&
    Number.isFinite(leftLng) &&
    Number.isFinite(rightLat) &&
    Number.isFinite(rightLng) &&
    Math.abs(leftLat - rightLat) < 0.000001 &&
    Math.abs(leftLng - rightLng) < 0.000001
  );
}

function findExistingVisionPlace(match) {
  if (!match) return null;
  const sourceType = String(match.sourceType || "").toLowerCase();
  const sourceId = Number(match.sourceId);
  const hasSourceId = Number.isFinite(sourceId);

  if (hasSourceId && ["foodstory", "restaurant", "restaurants"].includes(sourceType)) {
    const restaurant = restaurantStore.restaurants.find(
      (item) => Number(item.id) === sourceId,
    );
    if (restaurant) return { place: restaurant, type: "restaurant" };
  }

  if (
    hasSourceId &&
    ["food_spot", "foodspot", "personal", "community"].includes(sourceType)
  ) {
    const personal = foodSpotStore.spots.find(
      (item) => Number(item.id) === sourceId,
    );
    if (personal) return { place: personal, type: "personal" };
    const community = foodSpotStore.communitySpots.find(
      (item) => Number(item.id) === sourceId,
    );
    if (community) return { place: community, type: "community" };
  }

  const restaurant = restaurantStore.restaurants.find((item) =>
    sameCoordinates(item, match),
  );
  if (restaurant) return { place: restaurant, type: "restaurant" };

  const personal = foodSpotStore.spots.find((item) =>
    sameCoordinates(item, match),
  );
  if (personal) return { place: personal, type: "personal" };

  const community = foodSpotStore.communitySpots.find((item) =>
    sameCoordinates(item, match),
  );
  if (community) return { place: community, type: "community" };

  return null;
}

function invalidateMapAfterTransition() {
  window.clearTimeout(layoutTimer);
  layoutTimer = window.setTimeout(() => {
    if (!map || !mapElement.value) return;
    const bounds = mapElement.value.getBoundingClientRect();
    const currentSize = map.getSize();
    if (
      Math.abs(currentSize.x - Math.round(bounds.width)) > 1 ||
      Math.abs(currentSize.y - Math.round(bounds.height)) > 1
    ) {
      map.invalidateSize({ pan: false });
    }
  }, 220);
}

function setFilterDrawer(open) {
  isFilterDrawerOpen.value = open;
  invalidateMapAfterTransition();
}

function setDetailDrawer(open) {
  isDetailDrawerOpen.value = open;
  invalidateMapAfterTransition();
}

function resetForm() {
  Object.assign(form, createFoodSpotForm());
  Object.keys(formErrors).forEach((key) => delete formErrors[key]);
  editingSpotId.value = null;
  optionalDetailsOpen.value = false;
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
  map.on("moveend", () => {
    const center = map?.getCenter();
    if (center) mapCenter.value = [center.lat, center.lng];
  });
  mapInitialised.value = true;
  window.setTimeout(() => map?.invalidateSize(), 0);
}

async function handleMapClick(event) {
  if (!pickingMode.value) return;

  form.latitude = event.latlng.lat.toFixed(7);
  form.longitude = event.latlng.lng.toFixed(7);
  delete formErrors.coordinates;
  showPreviewMarker(event.latlng.lat, event.latlng.lng);
  stopPicking();
  setFilterDrawer(true);
  await nextTick();
  locationButton.value?.focus();
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

async function startPicking() {
  pickingMode.value = true;
  mapElement.value?.classList.add("is-picking");
  map?.closePopup();
  setFilterDrawer(false);
  await nextTick();
  mapElement.value?.focus({ preventScroll: true });
}

function stopPicking() {
  pickingMode.value = false;
  mapElement.value?.classList.remove("is-picking");
}

async function cancelLocationPicking() {
  stopPicking();
  if (sidebarMode.value !== "add") return;
  setFilterDrawer(true);
  await nextTick();
  locationButton.value?.focus();
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
  if (isGuestPreview.value && mode !== "community") {
    requireFoodMapAccount("view personal places and statistics");
    return;
  }
  if (mode === mapMode.value) return;

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

async function openAddForm(prefill = {}) {
  if (!requireFoodMapAccount("add a place")) return;
  foodSpotStore.setSelectedSpot(null);
  selectedRestaurant.value = null;
  selectedCommunitySpot.value = null;
  setDetailDrawer(false);
  resetForm();
  Object.assign(form, prefill);
  optionalDetailsOpen.value = Boolean(
    prefill.category ||
      prefill.district ||
      prefill.rating ||
      prefill.notes ||
      prefill.tags,
  );
  sidebarMode.value = "add";
  setFilterDrawer(true);
  await nextTick();
  placeNameInput.value?.focus();
}

async function openAddPlaceFromMap() {
  if (!requireFoodMapAccount("add a place")) return;
  const modeChange =
    mapMode.value !== "personal" ? setMapMode("personal") : Promise.resolve();
  showPersonalSpots.value = true;
  await openAddForm();
  await modeChange;
}

async function addFromRecipe() {
  const modeChange = setMapMode("personal");
  await openAddForm({
    dish_name: initialDish,
    recipe_id: initialRecipeId,
  });
  await modeChange;
}

async function addFromStats() {
  const modeChange = setMapMode("personal");
  await openAddForm();
  await modeChange;
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
  optionalDetailsOpen.value = true;
  showPreviewMarker(spot.latitude, spot.longitude);
  sidebarMode.value = "add";
  setDetailDrawer(false);
  setFilterDrawer(true);
}

function validateForm() {
  Object.keys(formErrors).forEach((key) => delete formErrors[key]);
  Object.assign(formErrors, validateFoodSpotForm(form));
  return Object.keys(formErrors).length === 0;
}

function payload() {
  return buildFoodSpotPayload(form);
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
    duration: 0.45,
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

async function handleFoodMapView(item) {
  if (item === "surprise") {
    const places = resultPlaces.value;
    if (!places.length) {
      uiStore.setError("No places are available to surprise you yet.", {
        title: "Map views",
      });
      return;
    }
    selectDiscovery(places[Math.floor(Math.random() * places.length)]);
    return;
  }

  activeViewItem.value = item;

  if (["discover", "nearby", "top-rated", "budget"].includes(item)) {
    if (mapMode.value !== "community") await setMapMode("community");
    discoveryTab.value = item;
    return;
  }
  if (item === "filters") {
    setFilterDrawer(true);
    return;
  }
}

function hasVisionCoordinates(candidate) {
  return (
    Number.isFinite(Number(candidate?.lat)) &&
    Number.isFinite(Number(candidate?.lng))
  );
}

async function focusVisionMatchedPlace(match = visionResult.value?.matchedPlace) {
  if (!match) return;
  const existing = findExistingVisionPlace(match);

  if (existing?.type === "restaurant") {
    showRestaurants.value = true;
    showRestaurantDetail(existing.place);
    return;
  }
  if (existing?.type === "community") {
    if (mapMode.value !== "community") await setMapMode("community");
    showCommunityDetail(existing.place);
    return;
  }
  if (existing?.type === "personal") {
    if (mapMode.value !== "personal") await setMapMode("personal");
    showDetail(existing.place);
    return;
  }

  if (hasVisionCoordinates(match)) {
    focusCoordinates({ latitude: match.lat, longitude: match.lng });
  }
}

async function saveVisionMatchedPlace() {
  const existing = findExistingVisionPlace(visionResult.value?.matchedPlace);
  if (!existing) return;
  const place = normalizeDiscovery(existing.place, existing.type);
  if (place.isOwned) {
    await setMapMode("personal");
    showDetail(existing.place);
    return;
  }
  await addDiscoveryToMyMap(place);
}

function visionDraftFromCandidate(candidate = null) {
  return {
    name: candidate?.placeName || candidate?.name || null,
    address: candidate?.address || null,
    phone: candidate?.phone || null,
    dishNames: [candidate?.dishHint].filter(Boolean),
    locationHints: [candidate?.locationHint].filter(Boolean),
    sourceUrl: visionUrl.value.trim() || null,
    lat: candidate?.lat ?? null,
    lng: candidate?.lng ?? null,
    provider: candidate?.provider || null,
    providerPlaceId: candidate?.providerPlaceId || null,
    googleMapsUri: candidate?.googleMapsUri || null,
    category: candidate?.category || null,
    categories: Array.isArray(candidate?.categories) ? candidate.categories : [],
  };
}

function visionDraftPrefill(draft) {
  const notes = [
    draft?.address ? `Location clue: ${draft.address}` : "",
    draft?.phone ? `Phone: ${draft.phone}` : "",
    draft?.locationHints?.length
      ? `Location hints: ${draft.locationHints.join(", ")}`
      : "",
    draft?.sourceUrl ? `Source: ${draft.sourceUrl}` : "",
    draft?.provider ? `Place provider: ${draft.provider}` : "",
    draft?.providerPlaceId ? `Provider place ID: ${draft.providerPlaceId}` : "",
    draft?.googleMapsUri ? `Google Maps: ${draft.googleMapsUri}` : "",
    draft?.categories?.length ? `Categories: ${draft.categories.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    name: draft?.name || "",
    dish_name: draft?.dishNames?.[0] || "",
    category: draft?.category || draft?.categories?.[0] || "",
    district: "",
    latitude: hasVisionCoordinates(draft) ? String(draft.lat) : "",
    longitude: hasVisionCoordinates(draft) ? String(draft.lng) : "",
    notes,
    tags: "",
  };
}

async function openVisionDraftWorkflow(draft) {
  if (!draft) return;
  const modeChange =
    mapMode.value !== "personal" ? setMapMode("personal") : Promise.resolve();
  await openAddForm(visionDraftPrefill(draft));
  await nextTick();

  if (hasVisionCoordinates(draft)) {
    showPreviewMarker(Number(draft.lat), Number(draft.lng));
    focusCoordinates({ latitude: Number(draft.lat), longitude: Number(draft.lng) });
  } else {
    await startPicking();
  }

  activeVisionCandidate.value = null;
  clearVisionResult();
  await modeChange;
}

function reviewVisionCandidate(candidate) {
  activeVisionCandidate.value = candidate;
  if (hasVisionCoordinates(candidate)) {
    if (candidate?.sourceType === "external") {
      showPreviewMarker(Number(candidate.lat), Number(candidate.lng));
    }
    focusCoordinates({ latitude: candidate.lat, longitude: candidate.lng });
  }
}

function dismissVisionResult() {
  activeVisionCandidate.value = null;
  if (sidebarMode.value !== "add") clearPreviewMarker();
  clearVisionResult();
}

function closeVisionResult() {
  dismissVisionResult();
  nextTick(() => importPanel.value?.focusDefault());
}

async function handleVisionSubmit() {
  activeVisionCandidate.value = null;
  clearPreviewMarker();
  await submitDishDiscovery();
}

async function handleVisionDishSelection(candidate) {
  const center = map?.getCenter?.();
  await selectVisionDish(
    candidate,
    center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
      ? { lat: center.lat, lng: center.lng }
      : null,
  );
}

async function focusVisionDishPlace(place) {
  const sourceId = Number(place?.sourceId);
  if (Number.isFinite(sourceId) && place.sourceType === "restaurant") {
    const restaurant = restaurantStore.restaurants.find((item) => Number(item.id) === sourceId);
    if (restaurant) {
      showRestaurants.value = true;
      showRestaurantDetail(restaurant);
      return;
    }
  }
  const personal = Number.isFinite(sourceId)
    ? foodSpotStore.spots.find((item) => Number(item.id) === sourceId)
    : null;
  if (personal) {
    if (mapMode.value !== "personal") await setMapMode("personal");
    showDetail(personal);
    return;
  }
  const community = Number.isFinite(sourceId)
    ? foodSpotStore.communitySpots.find((item) => Number(item.id) === sourceId)
    : null;
  if (community) {
    if (mapMode.value !== "community") await setMapMode("community");
    showCommunityDetail(community);
    return;
  }
  if (Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng))) {
    activeVisionCandidate.value = place;
    showPreviewMarker(Number(place.lat), Number(place.lng));
    focusCoordinates({ latitude: Number(place.lat), longitude: Number(place.lng) });
  }
}

async function retryVisionRequest() {
  clearPreviewMarker();
  await submitDishDiscovery();
}

function cancelVisionRequest() {
  clearPreviewMarker();
  cancelVisionAnalysis();
}

async function openVisionManualAdd() {
  const modeChange =
    mapMode.value !== "personal" ? setMapMode("personal") : Promise.resolve();
  await openAddForm();
  dismissVisionResult();
  await modeChange;
}

function startAnotherVisionLink() {
  dismissVisionResult();
  openVisionLink();
  nextTick(() => importPanel.value?.focusLink());
}

function closeVisionInput() {
  backVisionToMenu();
  nextTick(() => importPanel.value?.focusDefault());
}

function openDirections(place = selectedDiscovery.value) {
  if (!place) return;
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function requireFoodMapAccount(action) {
  if (!isGuestPreview.value) return true;
  uiStore.setError(`Sign in to ${action}.`, {
    title: "Account required",
    eyebrow: "Food Map preview",
  });
  router.push({ name: "login", query: { redirect: route.fullPath } });
  return false;
}

async function addDiscoveryToMyMap(place = selectedDiscovery.value) {
  if (!place || place.isOwned) return;
  if (!requireFoodMapAccount("add this place to your map")) return;

  const raw = place.raw || {};
  const rating = Math.round(Number(place.rating) || 0);
  const modeChange =
    mapMode.value !== "personal" ? setMapMode("personal") : Promise.resolve();
  await openAddForm({
    name: place.name || "",
    dish_name: place.dish || "",
    category: categories.includes(place.category) ? place.category : "Other",
    district: place.district || "",
    latitude: Number.isFinite(place.latitude) ? String(place.latitude) : "",
    longitude: Number.isFinite(place.longitude) ? String(place.longitude) : "",
    rating: rating >= 1 && rating <= 5 ? rating : null,
    notes: raw.notes || raw.description || "",
    tags: "",
  });
  await modeChange;
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

function handleFoodMapKeydown(event) {
  if (event.key !== "Escape") return;

  if (pickingMode.value) {
    cancelLocationPicking();
    event.preventDefault();
    return;
  }

  if (["analyzing", "fast_analysis", "deep_analysis", "resolving", "dish_analyzing", "dish_searching"].includes(visionState.value)) {
    cancelVisionAnalysis();
    event.preventDefault();
    nextTick(() => importPanel.value?.focusDefault());
    return;
  }
  if (activeVisionCandidate.value) {
    activeVisionCandidate.value = null;
    event.preventDefault();
    return;
  }
  if (visionState.value !== "idle") {
    dismissVisionResult();
    event.preventDefault();
    nextTick(() => importPanel.value?.focusDefault());
    return;
  }
  if (visionInputMode.value !== "menu") {
    closeVisionInput();
    event.preventDefault();
    return;
  }
  if (isFilterDrawerOpen.value || isDetailDrawerOpen.value) {
    setFilterDrawer(false);
    setDetailDrawer(false);
    event.preventDefault();
  }
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
  () => authStore.isLoggedIn,
  async (isLoggedIn) => {
    if (isLoggedIn) return;
    showPersonalSpots.value = false;
    if (mapMode.value !== "community") {
      await setMapMode("community");
    }
  },
);

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
  window.addEventListener("keydown", handleFoodMapKeydown);
  await nextTick();
  initialiseMap();
  if (isGuestPreview.value) {
    mapMode.value = "community";
    showPersonalSpots.value = false;
    await fetchCommunitySpots();
  } else if (mapMode.value === "community") {
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
        }
  } else if (shouldOpenAddDraft) {
    await openAddForm(initialVisualDraft);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleFoodMapKeydown);
  cancelVisionAnalysis();
  window.clearTimeout(filterTimer);
  window.clearTimeout(communitySearchTimer);
  window.clearTimeout(restaurantSearchTimer);
  window.clearTimeout(popupTimer);
  window.clearTimeout(layoutTimer);
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
    :class="`mode-${mapMode}`"
  >
    <FoodMapRail
      v-if="!pickingMode"
      :items="foodMapViewItems"
      :active-id="activeViewItem"
      @select="handleFoodMapView"
    />

    <button
      v-if="!isGuestPreview && sidebarMode !== 'add'"
      class="food-map-add-place-trigger"
      type="button"
      aria-label="Add a place to My Map"
      @click="openAddPlaceFromMap"
    >
      <AppIcon name="map-pin" size="18" />
      <span>
        <strong>Add place</strong>
        <small>to My Map</small>
      </span>
    </button>

    <FoodMapGuestBanner v-if="isGuestPreview" />

    <FoodMapImportPanel
      v-if="!isGuestPreview && !pickingMode"
      ref="importPanel"
      :input-mode="visionInputMode"
      :state="visionState"
      :url="visionUrl"
      :input-error="visionInputError"
      :source-summary="visionSourceSummary"
      :has-submitted-source="visionHasSubmittedSource"
      :can-analyze="canAnalyzeVision"
      :analyzing-copy="visionAnalyzingCopy"
      :elapsed-seconds="visionElapsedSeconds"
      @open-link="openVisionLink"
      @update:url="setVisionUrl"
      @back="closeVisionInput"
      @submit="handleVisionSubmit"
      @cancel="cancelVisionRequest"
      @change-link="openVisionLink"
      @clear-link="clearVisionUrl"
    />

    <VisionAutoResultPanel
      v-if="!isGuestPreview"
      :state="visionState"
      :result="visionResult"
      :error-message="visionErrorMessage"
      :matched-map-place="visionMatchedMapPlace"
      @dismiss="closeVisionResult"
      @focus-match="focusVisionMatchedPlace"
      @save-match="saveVisionMatchedPlace"
      @focus-candidate="reviewVisionCandidate"
      @confirm-candidate="openVisionDraftWorkflow(visionDraftFromCandidate($event))"
      @edit-candidate="openVisionDraftWorkflow(visionDraftFromCandidate($event))"
      @reject-candidate="closeVisionResult"
      @try-link="startAnotherVisionLink"
      @manual-add="openVisionManualAdd"
      @retry="retryVisionRequest"
      @change-source="startAnotherVisionLink"
      @select-dish="handleVisionDishSelection"
      @focus-dish-place="focusVisionDishPlace"
      @add-dish-place="openVisionDraftWorkflow(visionDraftFromCandidate($event))"
    />

    <FoodMapDiscoveryTray
      v-if="!pickingMode"
      :active-tab="discoveryTab"
      :places="discoveryTrayPlaces"
      :selected-key="selectedDiscovery?.key || ''"
      :empty-message="discoveryTrayEmptyMessage"
      :searched="Boolean(visionUrl.trim() || communitySearch.trim() || restaurantFilters.search.trim())"
      @select="selectDiscovery"
    />

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

    <aside
      v-if="isFilterDrawerOpen"
      class="food-map-sidebar"
      :class="{
        open: isFilterDrawerOpen,
        'is-add-place': sidebarMode === 'add',
      }"
      :aria-label="
        sidebarMode === 'add' ? 'Add a place to My Map' : 'Manage food map'
      "
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
      <header v-if="sidebarMode !== 'add'" class="food-map-sidebar-header">
        <div>
          <p class="food-map-kicker">{{ sidebarKicker }}</p>
          <h1>{{ sidebarTitle }}</h1>
          <p class="food-map-storyline">{{ sidebarStoryline }}</p>
          <p class="food-map-layer-counts">
            <template v-if="mapMode === 'personal'">
              {{ foodSpotStore.spots.length }} private places
              <span>•</span>
              Only you can edit
            </template>
            <template v-else>
              {{ restaurantStore.restaurants.length }} verified restaurants
              <span>•</span>
              {{ foodSpotStore.communitySpots.length }} community places
            </template>
          </p>
        </div>
        <span class="food-map-count">{{ sidebarCount }}</span>
      </header>

      <nav v-if="sidebarMode !== 'add'" class="food-map-mode-toggle" aria-label="Map mode">
        <button
          v-for="mode in availableMapModes"
          :key="mode[0]"
          type="button"
          :class="{ active: mapMode === mode[0] }"
          :aria-pressed="mapMode === mode[0]"
          @click="setMapMode(mode[0])"
        >
          {{ mode[1] }}
        </button>
      </nav>

      <section
        v-if="sidebarMode !== 'add'"
        class="food-map-layer-toggle"
        aria-label="Map display layers"
      >
        <span>Show on map:</span>
        <div>
          <label class="restaurant" :class="{ active: showRestaurants }">
            <input v-model="showRestaurants" type="checkbox" />
            <span aria-hidden="true">{{ showRestaurants ? "✓" : "" }}</span>
            Restaurants
          </label>
          <label
            v-if="!isGuestPreview"
            class="personal"
            :class="{ active: showPersonalSpots }"
          >
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
          @click="openAddForm()"
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
          <button type="button" @click="openAddForm()">Add Now</button>
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
              aria-hidden="true"
            >🍽️</span>
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
                ><i :style="{ '--stat-progress': item.percentage / 100 }"></i
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
                ><i :style="{ '--stat-progress': item.percentage / 100 }"></i
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
                ><i :style="{ '--stat-progress': item.percentage / 100 }"></i
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
        class="food-map-sidebar-body food-map-add-place-body"
      >
        <button class="food-map-back food-map-add-back" type="button" @click="cancelForm">
          <AppIcon name="arrow-left" size="16" /> Back
        </button>
        <div class="food-map-add-heading">
          <span class="food-map-add-heading-icon" aria-hidden="true">
            <AppIcon name="map-pin" size="22" />
          </span>
          <div>
            <span>My Food Map</span>
            <h2>{{ isEditing ? "Edit place" : "Add a new place" }}</h2>
            <p>
              {{
                isEditing
                  ? "Update this food memory and its location."
                  : "Keep a restaurant or food memory private to your account."
              }}
            </p>
          </div>
        </div>

        <form class="food-map-form food-map-add-form" novalidate @submit.prevent="submitForm">
          <section class="food-map-add-essentials" aria-label="Place essentials">
            <label>
              <span>Place name <b>*</b></span>
              <input
                ref="placeNameInput"
                v-model="form.name"
                type="text"
                maxlength="150"
                autocomplete="organization"
                placeholder="Example: Aunt Ba's Traditional Pho"
                :aria-invalid="Boolean(formErrors.name)"
                :aria-describedby="formErrors.name ? 'food-map-name-error' : undefined"
              />
              <small
                v-if="formErrors.name"
                id="food-map-name-error"
                class="food-map-field-error"
                role="alert"
              >{{ formErrors.name }}</small>
            </label>
            <label>
              <span>Dish name</span>
              <input
                v-model="form.dish_name"
                type="text"
                maxlength="150"
                placeholder="What did you eat here?"
              />
            </label>
          </section>

          <fieldset
            class="food-map-location-fieldset"
            :class="{ selected: hasFoodSpotCoordinates(form) }"
          >
            <legend>Location <b>*</b></legend>
            <div class="food-map-location-status">
              <AppIcon
                :name="hasFoodSpotCoordinates(form) ? 'check' : 'map-pin'"
                size="18"
              />
              <span>
                <strong>{{
                  hasFoodSpotCoordinates(form)
                    ? "Location selected"
                    : "Choose the exact place"
                }}</strong>
                <small v-if="hasFoodSpotCoordinates(form)">
                  {{ form.latitude }}, {{ form.longitude }}
                </small>
                <small v-else>The form will pause while you click the map.</small>
              </span>
            </div>
            <button ref="locationButton" type="button" @click="startPicking">
              <AppIcon name="map-pin" size="17" />
              {{ hasFoodSpotCoordinates(form) ? "Change map location" : "Pick on map" }}
            </button>
            <small
              v-if="formErrors.coordinates"
              class="food-map-field-error"
              role="alert"
            >{{ formErrors.coordinates }}</small>
          </fieldset>

          <details
            class="food-map-optional-details"
            :open="optionalDetailsOpen"
            @toggle="optionalDetailsOpen = $event.currentTarget.open"
          >
            <summary>
              <span>
                <strong>Add more details</strong>
                <small>Category, district, rating, notes and tags</small>
              </span>
              <AppIcon name="arrow-right" size="17" />
            </summary>

            <div class="food-map-optional-fields">
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

              <fieldset class="food-map-rating-fieldset">
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
                    role="radio"
                    :class="{ active: value <= Number(form.rating || 0) }"
                    :aria-label="`${value} star${value === 1 ? '' : 's'}`"
                    :aria-checked="value === form.rating"
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
                    Clear
                  </button>
                </div>
              </fieldset>

              <label>
                <span>Notes</span>
                <textarea
                  v-model="form.notes"
                  rows="3"
                  placeholder="Atmosphere, flavors or what to order next time"
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
            </div>
          </details>
          <p
            v-if="formErrors.submit"
            class="food-map-submit-error"
            role="alert"
          >
            {{ formErrors.submit }}
          </p>

          <div class="food-map-form-actions">
            <button
              class="food-map-save"
              type="submit"
              :disabled="submitting"
              :aria-busy="submitting"
            >
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
        <span>Click anywhere on the map to place your pin</span>
        <button type="button" @click="cancelLocationPicking">Back to form</button>
      </div>
      <div
        ref="mapElement"
        class="food-map-leaflet"
        tabindex="0"
        :aria-label="
          pickingMode
            ? 'Choose a location for your new food place'
            : 'Food places map'
        "
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
      v-if="isDetailDrawerOpen"
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
          <img
            v-if="selectedDiscovery.image"
            :src="selectedDiscovery.image"
            :alt="selectedDiscovery.imageAlt"
          />
          <div
            v-else
            class="taste-detail-media-placeholder"
            role="img"
            :aria-label="`${selectedDiscovery.name} has no verified photo`"
          >
            <span aria-hidden="true">🍽️</span>
            <strong>No verified photo</strong>
            <small>FoodStory will not substitute an unrelated image.</small>
          </div>
          <span>{{ selectedDiscovery.source }}</span>
          <button
            v-if="!selectedDiscovery.isOwned"
            type="button"
            aria-label="Add this place to My Map"
            @click="addDiscoveryToMyMap(selectedDiscovery)"
          >
            <AppIcon name="bookmark" size="19" />
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
              <dd>
                <a
                  v-if="selectedDiscovery.sourceUrl"
                  :href="selectedDiscovery.sourceUrl"
                  target="_blank"
                  rel="noreferrer"
                >View verification source</a>
                <template v-else>{{ selectedDiscovery.source }}</template>
              </dd>
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
            <button
              v-if="!selectedDiscovery.isOwned"
              type="button"
              @click="addDiscoveryToMyMap()"
            >
              <AppIcon name="bookmark" size="18" />
              Add to My Map
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

<style scoped src="./FoodMapView.css"></style>
