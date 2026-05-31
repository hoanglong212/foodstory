export async function fetchDailyMeal() {
  const response = await fetch('https://www.themealdb.com/api/json/v1/1/random.php')

  if (!response.ok) {
    throw new Error('Unable to load TheMealDB inspiration.')
  }

  const data = await response.json()
  const meal = data.meals?.[0]

  if (!meal) {
    throw new Error('TheMealDB returned no meal today.')
  }

  return {
    title: meal.strMeal,
    image: meal.strMealThumb,
    category: meal.strCategory,
    area: meal.strArea,
    description: meal.strInstructions,
  }
}
