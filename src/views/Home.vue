<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import SkeletonCard from "../components/SkeletonCard.vue";
import { fetchDailyMeal } from "../services/mealApi";

const fallbackMeal = {
  title: "Steak and Kidney Pie",
  image: "https://www.themealdb.com/images/media/meals/qysyss1511558054.jpg",
  category: "British",
  area: "Beef",
  description:
    "A rich savory pie for days when you want something different without losing the comfort of a home-cooked meal.",
  tags: [],
  ingredients: [],
};

const dailyMeal = ref(fallbackMeal);
const dailyMealLoading = ref(false);
const dailyMealError = ref("");
let isAlive = true;
let idleCallbackId = 0;
let fallbackTimer = 0;

const featuredRecipes = [
  {
    title: "Traditional Hanoi Beef Pho",
    category: "Soup",
    image:
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=640&q=70",
    description:
      "Slow-simmered broth scented with star anise and cinnamon, tender beef, and silky rice noodles.",
    time: "12 hours",
    serves: "4 servings",
    rating: "4.9",
  },
  {
    title: "Saigon Pate Banh Mi",
    category: "Banh Mi",
    image:
      "https://images.unsplash.com/photo-1600454309261-3dc9b7597637?auto=format&fit=crop&w=640&q=70",
    description:
      "A crisp baguette filled with pate, Vietnamese pork sausage, herbs, pickles, and chili sauce.",
    time: "30 minutes",
    serves: "2 servings",
    rating: "4.7",
  },
  {
    title: "Yangzhou Fried Rice",
    category: "Stir-Fry",
    image:
      "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=640&q=70",
    description:
      "Colorful fried rice with shrimp, egg, mixed vegetables, and scallions.",
    time: "20 minutes",
    serves: "3 servings",
    rating: "4.5",
  },
];

const categories = [
  { label: "Vietnamese Cuisine", icon: "bowl", accent: "red" },
  { label: "Street Food", icon: "store", accent: "pink" },
  { label: "Recipes", icon: "book-open", accent: "blue" },
  { label: "Trends", icon: "trending-up", accent: "orange" },
  { label: "Ingredients", icon: "leaf", accent: "green" },
  { label: "News", icon: "newspaper", accent: "purple" },
];

async function loadDailyMeal() {
  if (!isAlive) {
    return;
  }

  dailyMealLoading.value = true;
  try {
    const meal = await fetchDailyMeal();
    if (!isAlive) {
      return;
    }
    dailyMeal.value = meal;
  } catch (error) {
    if (!isAlive) {
      return;
    }
    dailyMealError.value = "TheMealDB suggestion could not be loaded, so a fallback meal is shown.";
    dailyMeal.value = fallbackMeal;
  } finally {
    if (isAlive) {
      dailyMealLoading.value = false;
    }
  }
}

onMounted(() => {
  if ('requestIdleCallback' in window) {
    idleCallbackId = window.requestIdleCallback(loadDailyMeal, { timeout: 1000 });
    return;
  }

  fallbackTimer = window.setTimeout(loadDailyMeal, 0);
});

onBeforeUnmount(() => {
  isAlive = false;

  if (idleCallbackId && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleCallbackId);
  }

  if (fallbackTimer) {
    window.clearTimeout(fallbackTimer);
  }
});
</script>

<template>
  <section class="hero-section">
    <div class="hero-content page-pad">
      <p class="eyebrow">Vietnamese Food Blog</p>
      <h1>Discover <span>Vietnamese Cuisine</span></h1>
      <p class="hero-copy">
        Welcome to FoodStory, where every dish tells a story from the home
        kitchen to the liveliest streets.
      </p>
      <div class="hero-actions">
        <RouterLink class="btn btn-primary" to="/news">
          <AppIcon name="newspaper" size="19" />
          <span>View News</span>
        </RouterLink>
        <RouterLink class="btn btn-outline" to="/about">
          <AppIcon name="users" size="19" />
          <span>About Us</span>
        </RouterLink>
      </div>
    </div>
  </section>

  <section class="section page-pad">
    <div class="section-heading split-heading">
      <div>
        <p class="text-red">Featured Recipes</p>
        <h2>Our Most Loved Dishes</h2>
      </div>
      <RouterLink class="text-link" to="/news">
        <span>View all</span>
        <AppIcon name="arrow-right" size="17" />
      </RouterLink>
    </div>

    <div class="recipe-grid">
      <article
        v-for="recipe in featuredRecipes"
        :key="recipe.title"
        class="recipe-card"
      >
        <div class="image-wrap">
          <img
            :src="recipe.image"
            :alt="recipe.title"
            loading="lazy"
            decoding="async"
          />
          <span>{{ recipe.category }}</span>
        </div>
        <div class="recipe-body">
          <h3>{{ recipe.title }}</h3>
          <p>{{ recipe.description }}</p>
          <div class="recipe-meta">
            <span>
              <AppIcon name="clock" size="16" />
              {{ recipe.time }}
            </span>
            <span>
              <AppIcon name="users" size="16" />
              {{ recipe.serves }}
            </span>
          </div>
          <div class="recipe-footer">
            <strong>
              <AppIcon name="star" size="16" />
              {{ recipe.rating }}
            </strong>
            <RouterLink to="/news">
              <span>View More</span>
              <AppIcon name="arrow-right" size="16" />
            </RouterLink>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="section random-section page-pad">
    <div class="section-heading">
      <p class="eyebrow">TheMealDB API</p>
      <h2>Daily Inspiration</h2>
    </div>

    <p v-if="dailyMealError" class="form-error" role="status">{{ dailyMealError }}</p>
    
    <SkeletonCard v-if="dailyMealLoading" variant="random-card" />

    <article v-if="dailyMeal && !dailyMealLoading" class="random-card">
      <img
        :src="dailyMeal.image"
        :alt="`Meal inspiration: ${dailyMeal.title}`"
        loading="lazy"
        decoding="async"
      />
      <div>
        <div class="pill-row">
          <span>{{ dailyMeal.category || "Meal" }}</span>
          <span>{{ dailyMeal.area || "Global" }}</span>
        </div>
        <h3>{{ dailyMeal.title }}</h3>
        <p>
          {{ dailyMeal.description.slice(0, 220) }}...
        </p>
        
        <div v-if="dailyMeal.tags && dailyMeal.tags.length" class="meal-tags">
          <span v-for="tag in dailyMeal.tags" :key="tag" class="tag-badge">
            {{ tag }}
          </span>
        </div>

        <div v-if="dailyMeal.ingredients && dailyMeal.ingredients.length" class="meal-ingredients">
          <p class="ingredients-label">Key Ingredients:</p>
          <ul class="ingredients-list">
            <li v-for="(ingredient, idx) in dailyMeal.ingredients.slice(0, 3)" :key="idx">
              <span>{{ ingredient.name }}</span>
              <span v-if="ingredient.measure" class="measure">{{ ingredient.measure }}</span>
            </li>
          </ul>
        </div>

        <RouterLink class="btn btn-primary" to="/recipes">
          <AppIcon name="utensils" size="19" />
          <span>Explore Recipes</span>
        </RouterLink>
      </div>
    </article>
  </section>

  <section class="quote-band page-pad">
    <blockquote>
      <span>"Food is the language of love -</span>
      <strong>every meal is a memory."</strong>
    </blockquote>
    <p>- FoodStory</p>
  </section>

  <section class="category-band page-pad">
    <div class="section-heading centered">
      <p class="eyebrow">Explore by Category</p>
      <h2>Food Topics</h2>
    </div>
    <div class="category-grid">
      <article
        v-for="category in categories"
        :key="category.label"
        class="topic-card"
      >
        <span :class="['topic-icon', category.accent]">
          <AppIcon :name="category.icon" size="24" />
        </span>
        <h3>{{ category.label }}</h3>
      </article>
    </div>
  </section>
</template>
