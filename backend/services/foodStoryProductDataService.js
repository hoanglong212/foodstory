import pool from '../db.js'
import { getDailyInspiration } from './dailyInspirationService.js'

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const DAILY_INSPIRATION_PATTERN = /\b(?:daily inspiration|today s (?:random )?(?:recipe|meal|dish|inspiration)|(?:random )?(?:recipe|meal|dish) (?:for )?today|meal of the day|random recipe|mon ngau nhien hom nay|cong thuc hom nay|mon an hom nay|cam hung hom nay|goi y mon hom nay)\b/
const DAILY_INGREDIENT_FOLLOWUP_PATTERN = /\b(?:what ingredients|which ingredients|what does it use|ingredients for it|ingredient list|nguyen lieu gi|can gi|gom nhung gi)\b/
const DAILY_METHOD_FOLLOWUP_PATTERN = /\b(?:how (?:do|can) i (?:make|cook) it|how to (?:make|cook) it|steps for it|instructions for it|cach (?:lam|nau)|nau nhu the nao|huong dan)\b/
const COUNT_CUE_PATTERN = /\b(?:how many|number of|total|count|bao nhieu|tong so)\b/
const RECIPE_CATALOG_PATTERN = /\b(?:recipes?|recipe catalog|cong thuc|mon an)\b/
const RESTAURANT_CATALOG_PATTERN = /\b(?:restaurants?|nha hang|quan an)\b/
const NEWS_CATALOG_PATTERN = /\b(?:news|articles?|posts?|bai viet|tin tuc)\b/
const SITE_CONTEXT_PATTERN = /\b(?:foodstory|website|site|app|you|your|do you have|does foodstory have|tren foodstory|cua foodstory|trang web)\b/
const CATALOG_SUMMARY_PATTERN = /\b(?:catalog stats|catalog statistics|site stats|site statistics|foodstory stats|foodstory statistics|how much content|catalog summary|thong ke foodstory|thong ke trang web)\b/

export function detectFoodStoryProductDataIntent(
  question,
  { previousIntent = null } = {}
) {
  const normalized = normalizeText(question)
  if (DAILY_INSPIRATION_PATTERN.test(normalized)) return 'daily_inspiration'
  if (String(previousIntent || '').startsWith('daily_inspiration')) {
    if (DAILY_INGREDIENT_FOLLOWUP_PATTERN.test(normalized)) {
      return 'daily_inspiration_ingredients'
    }
    if (DAILY_METHOD_FOLLOWUP_PATTERN.test(normalized)) {
      return 'daily_inspiration_method'
    }
  }
  if (CATALOG_SUMMARY_PATTERN.test(normalized)) return 'public_catalog_stats'
  if (
    COUNT_CUE_PATTERN.test(normalized) &&
    RECIPE_CATALOG_PATTERN.test(normalized) &&
    (SITE_CONTEXT_PATTERN.test(normalized) || normalized.split(' ').length <= 6)
  ) {
    return 'recipe_count'
  }
  if (
    COUNT_CUE_PATTERN.test(normalized) &&
    RESTAURANT_CATALOG_PATTERN.test(normalized) &&
    SITE_CONTEXT_PATTERN.test(normalized)
  ) {
    return 'restaurant_count'
  }
  if (
    COUNT_CUE_PATTERN.test(normalized) &&
    NEWS_CATALOG_PATTERN.test(normalized) &&
    SITE_CONTEXT_PATTERN.test(normalized)
  ) {
    return 'news_count'
  }
  return null
}

async function loadPublicCatalogStats(database) {
  const [rows] = await database.execute(`
    SELECT
      (SELECT COUNT(*) FROM recipes WHERE status = 'approved') AS approved_recipes,
      (SELECT COUNT(DISTINCT category_id) FROM recipes WHERE status = 'approved') AS recipe_categories,
      (SELECT COUNT(*) FROM restaurants) AS restaurants,
      (SELECT COUNT(*) FROM news) AS news_articles
  `)
  const row = rows?.[0] || {}
  return {
    approvedRecipes: Number(row.approved_recipes || 0),
    recipeCategories: Number(row.recipe_categories || 0),
    restaurants: Number(row.restaurants || 0),
    newsArticles: Number(row.news_articles || 0),
  }
}

function ingredientSummary(ingredients = [], vietnamese = false) {
  const names = ingredients.map((item) => item.name).filter(Boolean).slice(0, 5)
  if (!names.length) return ''
  return vietnamese
    ? ` Nguyên liệu nổi bật: ${names.join(', ')}.`
    : ` Featured ingredients: ${names.join(', ')}.`
}

function ingredientList(ingredients = [], vietnamese = false) {
  if (!ingredients.length) {
    return vietnamese
      ? 'Daily Inspiration hôm nay không có danh sách nguyên liệu từ nguồn cung cấp.'
      : "Today's Daily Inspiration does not include an ingredient list from its provider."
  }
  const items = ingredients
    .slice(0, 12)
    .map((item) => `${item.measure ? `${item.measure} ` : ''}${item.name}`.trim())
  return vietnamese
    ? `${items.length} nguyên liệu nổi bật của món này: ${items.join('; ')}.`
    : `${items.length} featured ingredients for this meal: ${items.join('; ')}.`
}

function methodSummary(meal = {}, vietnamese = false) {
  const instructions = String(meal.description || '').trim()
  if (!instructions) {
    return vietnamese
      ? 'Nguồn Daily Inspiration hôm nay không cung cấp hướng dẫn nấu.'
      : "Today's Daily Inspiration source does not provide cooking instructions."
  }
  return vietnamese
    ? `Cách làm ${meal.title}: ${instructions}`
    : `How to make ${meal.title}: ${instructions}`
}

export async function answerFoodStoryProductDataQuestion(
  question,
  responseLanguage = 'en',
  {
    database = pool,
    loadDailyInspiration = getDailyInspiration,
    previousIntent = null,
  } = {}
) {
  const intent = detectFoodStoryProductDataIntent(question, { previousIntent })
  if (!intent) return null
  const vietnamese = responseLanguage === 'vi'

  if (intent.startsWith('daily_inspiration')) {
    const meal = await loadDailyInspiration()
    const origin = [meal.area, meal.category].filter(Boolean).join(' · ')
    const answer = intent === 'daily_inspiration_ingredients'
      ? ingredientList(meal.ingredients, vietnamese)
      : intent === 'daily_inspiration_method'
        ? methodSummary(meal, vietnamese)
        : vietnamese
          ? `Daily Inspiration hôm nay là ${meal.title}${origin ? ` (${origin})` : ''}.${ingredientSummary(meal.ingredients, true)}`
          : `Today's Daily Inspiration is ${meal.title}${origin ? ` (${origin})` : ''}.${ingredientSummary(meal.ingredients)}`
    return {
      intent,
      answer,
      confidence: 1,
      sources: [
        {
          sourceType: 'website',
          sourceId: 'daily_inspiration',
          title: `Daily Inspiration: ${meal.title}`,
          path: '/#daily-inspiration',
          score: 1,
          matchLevel: 'live website data',
        },
      ],
      results: [
        {
          ...meal,
          image_url: meal.image,
          result_type: 'inspiration',
        },
      ],
      suggestions: vietnamese
        ? ['Món này cần nguyên liệu gì?', 'FoodStory có bao nhiêu công thức?']
        : ['What ingredients does it use?', 'How many recipes does FoodStory have?'],
    }
  }

  const stats = await loadPublicCatalogStats(database)
  if (intent === 'recipe_count') {
    return {
      intent,
      answer: vietnamese
        ? `FoodStory hiện có ${stats.approvedRecipes} công thức đã được duyệt thuộc ${stats.recipeCategories} danh mục công khai.`
        : `FoodStory currently has ${stats.approvedRecipes} approved recipes across ${stats.recipeCategories} public categories.`,
      confidence: 1,
      sources: [
        {
          sourceType: 'website',
          sourceId: 'recipe_catalog_count',
          title: 'Live FoodStory recipe catalog',
          path: '/recipes',
          score: 1,
          matchLevel: 'live database count',
        },
      ],
      results: [],
      suggestions: vietnamese
        ? ['Món ngẫu nhiên hôm nay là gì?', 'Mở danh sách công thức']
        : ["What's today's Daily Inspiration?", 'Open the recipe catalog'],
    }
  }

  if (intent === 'restaurant_count') {
    return {
      intent,
      answer: vietnamese
        ? `FoodStory hiện có ${stats.restaurants} nhà hàng trong danh mục khám phá công khai.`
        : `FoodStory currently has ${stats.restaurants} restaurants in its public discovery catalog.`,
      confidence: 1,
      sources: [{
        sourceType: 'website',
        sourceId: 'restaurant_catalog_count',
        title: 'Live FoodStory restaurant catalog',
        path: '/food-map?mode=community',
        score: 1,
        matchLevel: 'live database count',
      }],
      results: [],
      suggestions: vietnamese ? ['Mở Food Map', 'Thống kê toàn bộ FoodStory'] : ['Open Food Map', 'Show all FoodStory catalog stats'],
    }
  }

  if (intent === 'news_count') {
    return {
      intent,
      answer: vietnamese
        ? `FoodStory hiện có ${stats.newsArticles} bài viết trong mục News công khai.`
        : `FoodStory currently has ${stats.newsArticles} articles in its public News section.`,
      confidence: 1,
      sources: [{
        sourceType: 'website',
        sourceId: 'news_catalog_count',
        title: 'Live FoodStory news catalog',
        path: '/news',
        score: 1,
        matchLevel: 'live database count',
      }],
      results: [],
      suggestions: vietnamese ? ['Mở tin tức', 'Món hôm nay là gì?'] : ['Open news', "What's today's Daily Inspiration?"],
    }
  }

  return {
    intent,
    answer: vietnamese
      ? `Danh mục công khai hiện có ${stats.approvedRecipes} công thức trong ${stats.recipeCategories} danh mục, ${stats.restaurants} nhà hàng đã lưu và ${stats.newsArticles} bài viết.`
      : `The public catalog currently contains ${stats.approvedRecipes} approved recipes in ${stats.recipeCategories} categories, ${stats.restaurants} restaurants, and ${stats.newsArticles} news articles.`,
    confidence: 1,
    sources: [
      {
        sourceType: 'website',
        sourceId: 'public_catalog_stats',
        title: 'Live FoodStory public catalog',
        path: '/recipes',
        score: 1,
        matchLevel: 'live database count',
      },
    ],
    results: [],
    suggestions: vietnamese
      ? ['Mở công thức', 'Mở Food Map', 'Mở tin tức']
      : ['Open recipes', 'Open Food Map', 'Open news'],
  }
}
