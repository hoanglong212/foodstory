<script setup>
import { computed, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";

const firstName = ref("");
const lastName = ref("");
const selectedStyle = ref("homemade");

const foodStyles = [
  {
    value: "street",
    label: "Street Food Hunter",
    icon: "store",
    image:
      "https://images.unsplash.com/photo-1750315606996-9f42c4c81a20?auto=format&fit=crop&w=640&q=70",
    description:
      "You love local eateries, bold spice, quick bites, and the lively energy of the streets.",
    result: "Today you are a Street Food Hunter",
  },
  {
    value: "homemade",
    label: "Home Cooking Lover",
    icon: "home",
    image:
      "https://images.unsplash.com/photo-1775148582534-44e3700ed081?auto=format&fit=crop&w=640&q=70",
    description:
      "You enjoy comforting meals, familiar recipes, and flavors that remind you of family.",
    result: "Today you are a Home Cooking Lover",
  },
];

const aboutHighlights = [
  { label: "Recipes", icon: "book-open" },
  { label: "Places", icon: "map-pin" },
  { label: "Reviews", icon: "star" },
];

const fullName = computed(() => `${firstName.value} ${lastName.value}`.trim());
const greeting = computed(() => {
  if (!fullName.value) {
    return "Enter your name to see a welcome message...";
  }

  return `Hello, ${fullName.value}! Welcome to FoodStory.`;
});

const selectedFoodStyle = computed(() => {
  return (
    foodStyles.find((style) => style.value === selectedStyle.value) ||
    foodStyles[0]
  );
});
</script>

<template>
  <section class="about-hero page-pad">
    <div class="about-visual">
      <img
        src="https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=640&q=70"
        alt="A bowl of Vietnamese noodle soup"
        decoding="async"
      />
      <blockquote>"Food is the language of love"</blockquote>
      <div class="about-icons">
        <span v-for="item in aboutHighlights" :key="item.label">
          <AppIcon :name="item.icon" size="17" />
          {{ item.label }}
        </span>
      </div>
    </div>

    <div class="about-content">
      <p class="brand-kicker">
        <span class="brand-mark" aria-hidden="true">
          <AppIcon name="chef-hat" size="23" stroke-width="2.2" />
        </span>
        <strong>FoodStory</strong>
      </p>
      <h1>About FoodStory</h1>
      <p>
        FoodStory is a Vietnamese food blog where we tell stories through every
        meal. From family recipes passed down through generations to vibrant
        street food, every article is a journey of discovery.
      </p>
      <p>
        This student project was built with Vue, Vite, and Vue Router using a
        modern, readable, and extensible approach.
      </p>

      <div class="stats-row">
        <span>
          <AppIcon name="book-open" size="18" />
          <strong>200+</strong>Recipes
        </span>
        <span>
          <AppIcon name="map-pin" size="18" />
          <strong>50+</strong>Places
        </span>
        <span>
          <AppIcon name="users" size="18" />
          <strong>10K+</strong>Readers
        </span>
      </div>

      <section class="welcome-panel">
        <h2>Hello!</h2>
        <div class="name-grid">
          <label>
            <span>First Name</span>
            <input v-model="firstName" type="text" placeholder="Example: Minh" />
          </label>
          <label>
            <span>Last Name</span>
            <input v-model="lastName" type="text" placeholder="Example: Nguyen" />
          </label>
        </div>
        <p class="welcome-message">{{ greeting }}</p>
      </section>
    </div>

    <section class="choice-panel">
      <div class="choice-heading">
        <p class="eyebrow">Food Personality</p>
        <h2>Find Your Food Mood</h2>
      </div>

      <div class="food-mood-layout">
        <label
          v-for="style in foodStyles"
          :key="style.value"
          :class="[
            'mood-card',
            `mood-${style.value}`,
            { active: selectedStyle === style.value },
          ]"
        >
          <input
            v-model="selectedStyle"
            type="radio"
            name="food-style"
            :value="style.value"
          />
          <span class="mood-radio" aria-hidden="true">
            <AppIcon
              v-if="selectedStyle === style.value"
              name="heart"
              size="14"
            />
          </span>
          <span class="mood-copy">
            <strong>
              <AppIcon :name="style.icon" size="20" />
              {{ style.label }}
            </strong>
            <small>{{ style.description }}</small>
          </span>
        </label>

        <figure
          :class="[
            'mood-preview',
            selectedStyle === 'street' ? 'tilt-left' : 'tilt-right',
          ]"
        >
          <Transition name="mood-image" mode="out-in">
            <img
              :key="selectedFoodStyle.value"
              :src="selectedFoodStyle.image"
              :alt="selectedFoodStyle.label"
              loading="lazy"
              decoding="async"
            />
          </Transition>
        </figure>
      </div>

      <Transition name="mood-result" mode="out-in">
        <p :key="selectedFoodStyle.value" class="mood-result">
          {{ selectedFoodStyle.result }}.
        </p>
      </Transition>
    </section>
  </section>
</template>
