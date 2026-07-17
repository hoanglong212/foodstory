export function normalizeFoodMapDiscovery(place, type) {
  const isRestaurant = type === 'restaurant'
  const rating = Number(isRestaurant ? place.avg_rating : place.rating) || 0
  const district = place.district || 'Ho Chi Minh City'
  const name = place.name || 'Food place'
  const providedImage = place.image_url || place.image || ''

  return {
    key: `${type}-${place.id}`,
    id: place.id,
    type,
    raw: place,
    name,
    dish: isRestaurant
      ? place.featured_dish || place.category || 'Featured local food'
      : place.dish_name || 'A delicious dish waiting to be discovered',
    category: place.category || (isRestaurant ? 'Restaurant' : 'Food'),
    rating,
    district,
    address: place.address || district,
    price: place.price_range || '',
    description:
      place.description ||
      place.notes ||
      'No detailed description is available for this place.',
    openingHours: place.opening_hours || place.hours || '',
    source:
      place.source ||
      place.social_source ||
      (type === 'community'
        ? 'FoodStory community'
        : isRestaurant
          ? place.verified_at
            ? `Verified ${String(place.verified_at).slice(0, 10)}`
            : 'FoodStory catalog'
          : 'Your journal'),
    sourceUrl: place.source_url || '',
    verifiedAt: place.verified_at || '',
    distance: place.distance || place.distance_km || '',
    image: providedImage || null,
    imageAlt: providedImage ? `Photo of ${name}` : '',
    reviewCount: Number(place.review_count || place.reviewCount || 0) || 0,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    isOwned: type === 'personal',
  }
}

export function foodMapDiscoveryDistance(place) {
  const rawDistance = place?.distance
  if (typeof rawDistance === 'number') return rawDistance
  const match = String(rawDistance || '').match(/\d+(?:\.\d+)?/)
  const value = Number(match?.[0])
  return Number.isFinite(value) ? value : Number.NaN
}

export function foodMapDistanceFromCenter(place, center) {
  const latitude = Number(place?.latitude)
  const longitude = Number(place?.longitude)
  const centerLatitude = Number(center?.[0])
  const centerLongitude = Number(center?.[1])

  if (![latitude, longitude, centerLatitude, centerLongitude].every(Number.isFinite)) {
    return Number.NaN
  }

  const radians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(latitude - centerLatitude)
  const longitudeDelta = radians(longitude - centerLongitude)
  const originLatitude = radians(centerLatitude)
  const destinationLatitude = radians(latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  const boundedHaversine = Math.min(1, Math.max(0, haversine))
  return 6371 * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine))
}

export function foodMapPriceTier(place) {
  const price = String(place?.price || place?.price_range || '').trim()
  if (!price) return Number.NaN

  const currencyMarks = price.match(/[₫$€£¥]/gu)
  return currencyMarks?.length || Number.NaN
}
