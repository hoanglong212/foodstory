<script setup>
import { onMounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { fetchDailyMeal } from "../services/mealApi";

const dailyMeal = ref(null);
const dailyMealLoading = ref(false);
const dailyMealError = ref("");

const featuredRecipes = [
  {
    title: "Phở Bò Hà Nội Truyền Thống",
    category: "Món Súp",
    image:
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=80",
    description:
      "Nước dùng ninh chậm, thơm hồi quế, thịt bò mềm và bánh phở trắng mượt.",
    time: "12 giờ",
    serves: "4 người",
    rating: "4.9",
  },
  {
    title: "Bánh Mì Pate Sài Gòn",
    category: "Bánh Mì",
    image:
      "https://images.unsplash.com/photo-1600454309261-3dc9b7597637?auto=format&fit=crop&w=900&q=80",
    description:
      "Ổ bánh giòn rụm với pate, chả lụa, rau thơm, đồ chua và tương ớt.",
    time: "30 phút",
    serves: "2 người",
    rating: "4.7",
  },
  {
    title: "Cơm Rang Dương Châu",
    category: "Món Xào",
    image:
      "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80",
    description:
      "Cơm rang thập cẩm với tôm, trứng, rau củ nhiều màu sắc và hành lá.",
    time: "20 phút",
    serves: "3 người",
    rating: "4.5",
  },
];

const categories = [
  { label: "Ẩm Thực Việt", icon: "bowl", accent: "red" },
  { label: "Đường Phố", icon: "store", accent: "pink" },
  { label: "Công Thức", icon: "book-open", accent: "blue" },
  { label: "Xu Hướng", icon: "trending-up", accent: "orange" },
  { label: "Nguyên Liệu", icon: "leaf", accent: "green" },
];

const fallbackMeal = {
  title: "Steak and Kidney Pie",
  image: "https://www.themealdb.com/images/media/meals/qysyss1511558054.jpg",
  category: "British",
  area: "Beef",
  description:
    "Một món bánh mặn giàu hương vị, gợi ý cho ngày muốn đổi bữa nhưng vẫn giữ cảm giác ấm cúng của căn bếp gia đình.",
};

onMounted(async () => {
  dailyMealLoading.value = true;
  try {
    dailyMeal.value = await fetchDailyMeal();
  } catch (error) {
    dailyMealError.value = "Không thể tải gợi ý từ TheMealDB, đang hiển thị món dự phòng.";
    dailyMeal.value = fallbackMeal;
  } finally {
    dailyMealLoading.value = false;
  }
});
</script>

<template>
  <section class="hero-section">
    <div class="hero-content page-pad">
      <p class="eyebrow">Blog Ẩm Thực Việt Nam</p>
      <h1>Khám Phá Ẩm Thực <span>Việt Nam</span></h1>
      <p class="hero-copy">
        Chào mừng bạn đến với FoodStory, nơi mỗi món ăn là một câu chuyện từ bếp
        nhà đến con phố náo nhiệt.
      </p>
      <div class="hero-actions">
        <RouterLink class="btn btn-primary" to="/news">
          <AppIcon name="newspaper" size="19" />
          <span>Xem Tin Tức</span>
        </RouterLink>
        <RouterLink class="btn btn-outline" to="/about">
          <AppIcon name="users" size="19" />
          <span>Về Chúng Tôi</span>
        </RouterLink>
      </div>
    </div>
  </section>

  <section class="section page-pad">
    <div class="section-heading split-heading">
      <div>
        <p class="text-red">Công Thức Nổi Bật</p>
        <h2>Những Món Ăn Được Yêu Thích Nhất</h2>
      </div>
      <RouterLink class="text-link" to="/news">
        <span>Xem tất cả</span>
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
          <img :src="recipe.image" :alt="recipe.title" />
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
              <span>Xem Thêm</span>
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

    <p v-if="dailyMealLoading" class="status-panel">Đang tải món ăn hôm nay...</p>
    <p v-if="dailyMealError" class="form-error" role="status">{{ dailyMealError }}</p>

    <article v-if="dailyMeal" class="random-card">
      <img
        :src="dailyMeal.image"
        :alt="`Meal inspiration: ${dailyMeal.title}`"
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
        <RouterLink class="btn btn-primary" to="/recipes">
          <AppIcon name="utensils" size="19" />
          <span>Explore Recipes</span>
        </RouterLink>
      </div>
    </article>
  </section>

  <section class="quote-band page-pad">
    <blockquote>
      <span>"Ẩm thực là ngôn ngữ của tình yêu -</span>
      <strong>mỗi bữa ăn là một kỷ niệm."</strong>
    </blockquote>
    <p>- FoodStory</p>
  </section>

  <section class="category-band page-pad">
    <div class="section-heading centered">
      <p class="eyebrow">Khám Phá Theo Danh Mục</p>
      <h2>Chủ Đề Ẩm Thực</h2>
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
