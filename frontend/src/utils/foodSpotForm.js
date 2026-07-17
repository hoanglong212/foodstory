export function createFoodSpotForm(overrides = {}) {
  return {
    name: '',
    dish_name: '',
    category: '',
    district: '',
    latitude: '',
    longitude: '',
    rating: null,
    notes: '',
    tags: '',
    recipe_id: null,
    ...overrides,
  }
}

export function hasFoodSpotCoordinates(form) {
  const latitude = Number(form?.latitude)
  const longitude = Number(form?.longitude)
  return (
    String(form?.latitude ?? '').trim() !== '' &&
    String(form?.longitude ?? '').trim() !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function validateFoodSpotForm(form) {
  const errors = {}
  const name = String(form?.name ?? '').trim()

  if (!name) errors.name = 'Enter a place name.'
  if (name.length > 150) errors.name = 'Keep the place name under 150 characters.'

  if (!hasFoodSpotCoordinates(form)) {
    errors.coordinates = 'Choose a valid location on the map.'
  }

  const rating = form?.rating === '' || form?.rating == null ? null : Number(form.rating)
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    errors.rating = 'Choose a rating from 1 to 5.'
  }

  if (String(form?.dish_name ?? '').trim().length > 150) {
    errors.dish_name = 'Keep the dish name under 150 characters.'
  }
  if (String(form?.tags ?? '').trim().length > 255) {
    errors.tags = 'Keep tags under 255 characters.'
  }

  return errors
}

export function buildFoodSpotPayload(form) {
  const optionalText = (value) => String(value ?? '').trim() || null
  const rating = form?.rating === '' || form?.rating == null ? null : Number(form.rating)
  const recipeId = form?.recipe_id === '' || form?.recipe_id == null ? null : Number(form.recipe_id)

  return {
    name: String(form?.name ?? '').trim(),
    dish_name: optionalText(form?.dish_name),
    category: optionalText(form?.category),
    district: optionalText(form?.district),
    latitude: Number(form?.latitude),
    longitude: Number(form?.longitude),
    rating,
    notes: optionalText(form?.notes),
    tags: optionalText(form?.tags),
    recipe_id: Number.isSafeInteger(recipeId) && recipeId > 0 ? recipeId : null,
  }
}
