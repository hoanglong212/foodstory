<script setup>
import { computed, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";

const firstName = ref("");
const lastName = ref("");
const selectedStyle = ref("homemade");

const foodStyles = [
  {
    value: "street",
    label: "Người Săn Món Phố",
    icon: "store",
    image:
      "https://images.unsplash.com/photo-1750315606996-9f42c4c81a20?auto=format&fit=crop&w=640&q=70",
    description:
      "Bạn mê hàng quán địa phương, vị cay nồng, món ăn nhanh và năng lượng náo nhiệt của phố xá.",
    result: "Hôm nay bạn là Người Săn Món Phố",
  },
  {
    value: "homemade",
    label: "Tín Đồ Cơm Nhà",
    icon: "home",
    image:
      "https://images.unsplash.com/photo-1775148582534-44e3700ed081?auto=format&fit=crop&w=640&q=70",
    description:
      "Bạn thích những bữa cơm ấm áp, công thức quen thuộc và hương vị gợi nhớ gia đình.",
    result: "Hôm nay bạn là Tín Đồ Cơm Nhà",
  },
];

const aboutHighlights = [
  { label: "Công Thức", icon: "book-open" },
  { label: "Địa Điểm", icon: "map-pin" },
  { label: "Đánh Giá", icon: "star" },
];

const fullName = computed(() => `${firstName.value} ${lastName.value}`.trim());
const greeting = computed(() => {
  if (!fullName.value) {
    return "Nhập tên của bạn để xem lời chào mừng...";
  }

  return `Xin chào, ${fullName.value}! Chào mừng bạn đến với FoodStory.`;
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
      <blockquote>"Ẩm thực là ngôn ngữ của tình yêu"</blockquote>
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
      <h1>Về FoodStory</h1>
      <p>
        FoodStory là blog ẩm thực Việt Nam, nơi chúng tôi kể những câu chuyện
        qua từng bữa cơm. Từ công thức truyền thống của bà nội đến những món ăn
        đường phố náo nhiệt, mỗi bài viết là một hành trình khám phá.
      </p>
      <p>
        Đây là đồ án Giai Đoạn 1 của nhóm sinh viên, được xây dựng bằng Vue,
        Vite và Vue Router theo phong cách hiện đại, dễ đọc và dễ mở rộng.
      </p>

      <div class="stats-row">
        <span>
          <AppIcon name="book-open" size="18" />
          <strong>200+</strong>Công Thức
        </span>
        <span>
          <AppIcon name="map-pin" size="18" />
          <strong>50+</strong>Địa Điểm
        </span>
        <span>
          <AppIcon name="users" size="18" />
          <strong>10K+</strong>Người Đọc
        </span>
      </div>

      <section class="welcome-panel">
        <h2>Xin Chào!</h2>
        <div class="name-grid">
          <label>
            <span>Tên</span>
            <input v-model="firstName" type="text" placeholder="VD: Minh" />
          </label>
          <label>
            <span>Họ</span>
            <input v-model="lastName" type="text" placeholder="VD: Nguyễn" />
          </label>
        </div>
        <p class="welcome-message">{{ greeting }}</p>
      </section>
    </div>

    <section class="choice-panel">
      <div class="choice-heading">
        <p class="eyebrow">Gu Ẩm Thực</p>
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
