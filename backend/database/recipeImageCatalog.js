export const RECIPES_WITHOUT_VERIFIED_LOCAL_IMAGE = new Set([
  'Turkey Quinoa Stuffed Peppers',
  'Garlic Tofu Rice Boxes',
  'Beef Burrito Freezer Bowls',
  'Greek Pasta Salad Boxes',
  'Lentil Soup Batch Pot',
  'Teriyaki Salmon Lunch Boxes',
  'Chickpea Couscous Jars',
])

export function recipeImageAssetName(title) {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) return null
  return `${normalizedTitle}.jpg`
}

export function recipeImageUrl(title) {
  if (RECIPES_WITHOUT_VERIFIED_LOCAL_IMAGE.has(String(title || '').trim())) {
    return '/images/food-placeholder.jpg'
  }
  const assetName = recipeImageAssetName(title)
  return assetName ? `/images/${encodeURIComponent(assetName)}` : ''
}
