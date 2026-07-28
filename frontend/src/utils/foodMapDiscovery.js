const NOTE_FIELD_ALIASES = {
  address: 'address',
  'location clue': 'address',
  area: 'district',
  district: 'district',
  phone: 'phone',
  source: 'sourceUrl',
  'original source': 'sourceUrl',
  'discovery source': 'source',
  'place provider': 'provider',
  'google maps': 'mapUrl',
  openstreetmap: 'mapUrl',
  categories: 'categories',
  'distance when found': 'distance',
  'matched dish': 'matchedDish',
  verification: 'verification',
}

function compactText(value) {
  return String(value ?? '').trim()
}

export function friendlyFoodMapCategory(value) {
  const raw = compactText(value)
  if (!raw) return 'Food place'
  const category = raw.split('.').filter(Boolean).at(-1) || raw
  const labels = {
    cafe: 'Cafe',
    catering: 'Restaurant',
    fast_food: 'Fast food',
    food_court: 'Food court',
    restaurant: 'Restaurant',
  }
  return labels[category.toLocaleLowerCase('en')] ||
    category.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function inferFoodMapDistrict(address) {
  const value = compactText(address)
  if (!value) return ''

  if (/thành phố thủ đức|tp\.?\s*thủ đức/iu.test(value)) return 'Thu Duc City'
  const numberedDistrict = value.match(/(?:quận|district)\s*(\d{1,2})/iu)
  if (numberedDistrict) return `District ${numberedDistrict[1]}`

  const namedDistricts = [
    ['Bình Thạnh', 'Binh Thanh'],
    ['Bình Tân', 'Binh Tan'],
    ['Gò Vấp', 'Go Vap'],
    ['Phú Nhuận', 'Phu Nhuan'],
    ['Tân Bình', 'Tan Binh'],
    ['Tân Phú', 'Tan Phu'],
    ['Bình Chánh', 'Binh Chanh'],
    ['Cần Giờ', 'Can Gio'],
    ['Củ Chi', 'Cu Chi'],
    ['Hóc Môn', 'Hoc Mon'],
    ['Nhà Bè', 'Nha Be'],
  ]
  return namedDistricts.find(([label]) => value.toLocaleLowerCase().includes(label.toLocaleLowerCase()))?.[1] || ''
}

export function parseFoodSpotNotes(notes) {
  const metadata = {
    address: '',
    district: '',
    phone: '',
    source: '',
    sourceUrl: '',
    provider: '',
    mapUrl: '',
    categories: [],
    distance: '',
    matchedDish: '',
    verification: '',
    story: '',
  }
  const storyLines = []

  compactText(notes)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^([^:]{1,40}):\s*(.+)$/u)
      if (!match) {
        storyLines.push(line)
        return
      }

      const key = match[1].trim().toLocaleLowerCase('en')
      const value = match[2].trim()
      if (key === 'provider place id') return

      const field = NOTE_FIELD_ALIASES[key]
      if (!field) {
        storyLines.push(line)
      } else if (field === 'categories') {
        metadata.categories = value.split(',').map((item) => item.trim()).filter(Boolean)
      } else {
        metadata[field] = value
      }
    })

  metadata.story = storyLines.join('\n')
  return metadata
}

function providerLabel(provider) {
  const value = compactText(provider).toLocaleLowerCase('en')
  if (value === 'geoapify') return 'Geoapify + OpenStreetMap'
  return compactText(provider)
}

export function normalizeFoodMapDiscovery(place, type) {
  const isRestaurant = type === 'restaurant'
  const rating = Number(isRestaurant ? place.avg_rating : place.rating) || 0
  const noteData = parseFoodSpotNotes(place.notes)
  const address = place.address || noteData.address || ''
  const district =
    place.district ||
    noteData.district ||
    inferFoodMapDistrict(address) ||
    'Ho Chi Minh City'
  const name = place.name || 'Food place'
  const providedImage = place.image_url || place.image || ''
  const rawCategory = place.category || noteData.categories[0] || (isRestaurant ? 'Restaurant' : 'Food')
  const category = friendlyFoodMapCategory(rawCategory)
  const sourceProvider =
    providerLabel(noteData.provider) ||
    (!/^https?:\/\//iu.test(noteData.source) ? compactText(noteData.source) : '')
  const latitude = Number(place.latitude)
  const longitude = Number(place.longitude)
  const mapUrl =
    place.map_url ||
    noteData.mapUrl ||
    (Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
      : '')
  const source =
    place.source ||
    place.social_source ||
    sourceProvider ||
    (type === 'community'
      ? 'FoodStory community'
      : isRestaurant
        ? place.verified_at
          ? `Verified ${String(place.verified_at).slice(0, 10)}`
          : 'FoodStory catalog'
        : 'Your journal')
  const dish = isRestaurant
    ? place.featured_dish || category || 'Featured local food'
    : place.dish_name || noteData.matchedDish || 'Dish not added yet'
  const categories = [...new Set(
    [rawCategory, ...noteData.categories]
      .map(friendlyFoodMapCategory)
      .filter(Boolean),
  )]
  const description =
    place.description ||
    noteData.story ||
    (sourceProvider
      ? `${name} was saved from a nearby ${sourceProvider} result${dish ? ` for ${dish}` : ''}. Confirm menu, opening hours and other venue details before visiting.`
      : place.notes || 'Add a personal note about what to order, the atmosphere or why this place matters to you.')

  return {
    key: `${type}-${place.id}`,
    id: place.id,
    type,
    raw: place,
    name,
    dish,
    category,
    categories,
    rating,
    district,
    address: address || district,
    price: place.price_range || '',
    description,
    openingHours: place.opening_hours || place.hours || '',
    phone: place.phone || noteData.phone || '',
    source,
    sourceUrl: place.source_url || noteData.sourceUrl || '',
    mapUrl,
    verification: noteData.verification || (sourceProvider ? 'Provider result — verify details before visiting.' : ''),
    verifiedAt: place.verified_at || '',
    addedAt: place.created_at || '',
    distance: place.distance || place.distance_km || noteData.distance || '',
    image: providedImage || null,
    imageAlt: providedImage ? `Photo of ${name}` : '',
    reviewCount: Number(place.review_count || place.reviewCount || 0) || 0,
    latitude,
    longitude,
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
