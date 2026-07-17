import api from './api'

export async function fetchDailyMeal() {
  const response = await api.get('/home/daily-inspiration')
  const meal = response.data

  if (!meal?.title || !meal?.image) {
    throw new Error('FoodStory returned no Daily Inspiration meal.')
  }

  return {
    id: meal.id || meal.title,
    title: meal.title,
    image: meal.image,
    category: meal.category || 'Meal',
    area: meal.area || 'Global',
    description: meal.description || '',
    tags: Array.isArray(meal.tags) ? meal.tags.slice(0, 3) : [],
    ingredients: Array.isArray(meal.ingredients)
      ? meal.ingredients.slice(0, 5)
      : [],
    source: meal.source || 'foodstory',
    isFallback: Boolean(meal.isFallback),
    dateKey: meal.dateKey || null,
  }
}
