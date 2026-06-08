export const INTENTS = {
  FIND_RESTAURANT: [
    'tìm',
    'quán',
    'nhà hàng',
    'ăn ở đâu',
    'gợi ý',
    'recommend',
    'chỗ ăn',
    'địa điểm',
  ],
  FIND_RECIPE: ['công thức', 'nấu', 'recipe', 'cách làm', 'nguyên liệu', 'món'],
  FIND_SPOT: ['điểm của tôi', 'địa điểm của tôi', 'đã lưu', 'spot', 'tôi đã ăn', 'lịch sử'],
  TOP_RATED: [
    'ngon nhất',
    'tốt nhất',
    'hot',
    'nổi tiếng',
    'rating cao',
    'được đánh giá cao',
  ],
  CHEAP: ['rẻ', 'bình dân', 'giá rẻ', 'tiết kiệm', 'không đắt'],
  NEARBY_DISTRICT: [],
}

export const DISTRICTS = {
  'quận 1': 'Quận 1',
  'q.1': 'Quận 1',
  q1: 'Quận 1',
  'quận 2': 'Quận 2',
  'q.2': 'Quận 2',
  q2: 'Quận 2',
  'quận 3': 'Quận 3',
  'q.3': 'Quận 3',
  q3: 'Quận 3',
  'quận 4': 'Quận 4',
  'q.4': 'Quận 4',
  q4: 'Quận 4',
  'quận 5': 'Quận 5',
  'q.5': 'Quận 5',
  q5: 'Quận 5',
  'quận 6': 'Quận 6',
  'q.6': 'Quận 6',
  q6: 'Quận 6',
  'quận 7': 'Quận 7',
  'q.7': 'Quận 7',
  q7: 'Quận 7',
  'quận 8': 'Quận 8',
  'q.8': 'Quận 8',
  q8: 'Quận 8',
  'quận 9': 'Thành phố Thủ Đức',
  'q.9': 'Thành phố Thủ Đức',
  q9: 'Thành phố Thủ Đức',
  'quận 10': 'Quận 10',
  'q.10': 'Quận 10',
  q10: 'Quận 10',
  'quận 11': 'Quận 11',
  'q.11': 'Quận 11',
  q11: 'Quận 11',
  'quận 12': 'Quận 12',
  'q.12': 'Quận 12',
  q12: 'Quận 12',
  'bình thạnh': 'Bình Thạnh',
  'binh thanh': 'Bình Thạnh',
  bthạnh: 'Bình Thạnh',
  'gò vấp': 'Gò Vấp',
  'go vap': 'Gò Vấp',
  govap: 'Gò Vấp',
  'tân bình': 'Tân Bình',
  'tan binh': 'Tân Bình',
  tanbình: 'Tân Bình',
  'tân phú': 'Tân Phú',
  'tan phu': 'Tân Phú',
  'phú nhuận': 'Phú Nhuận',
  'phu nhuan': 'Phú Nhuận',
  'thủ đức': 'Thành phố Thủ Đức',
  'thu duc': 'Thành phố Thủ Đức',
  'bình chánh': 'Bình Chánh',
  'binh chanh': 'Bình Chánh',
  'nhà bè': 'Nhà Bè',
  'nha be': 'Nhà Bè',
  'củ chi': 'Củ Chi',
  'cu chi': 'Củ Chi',
  'hóc môn': 'Hóc Môn',
  'hoc mon': 'Hóc Môn',
}

export const FOOD_KEYWORDS = {
  'bún bò': 'Bún Bò',
  'cơm tấm': 'Cơm Tấm',
  'bánh mì': 'Bánh Mì',
  'hủ tiếu': 'Hủ Tiếu',
  'hải sản': 'Hải Sản',
  'bánh xèo': 'Bánh Xèo',
  'bánh cuốn': 'Bánh Cuốn',
  'cà phê': 'Café',
  'nem nướng': 'Nem Nướng',
  phở: 'Phở',
  pho: 'Phở',
  bún: 'Bún',
  bun: 'Bún',
  cơm: 'Cơm',
  com: 'Cơm',
  dimsum: 'Dimsum',
  lẩu: 'Lẩu',
  lau: 'Lẩu',
  café: 'Café',
  cafe: 'Café',
  chè: 'Chè',
  che: 'Chè',
  bò: 'Bò',
  gà: 'Gà Nướng',
  ga: 'Gà Nướng',
  ốc: 'Hải Sản',
  nem: 'Nem Nướng',
}

export const PRICE_KEYWORDS = {
  cheap: ['rẻ', 'bình dân', 'giá rẻ', 'tiết kiệm', 'không đắt'],
  mid: ['giá vừa', 'tầm trung', 'trung bình'],
  expensive: ['sang', 'cao cấp', 'xịn'],
}

const GREETINGS = ['xin chào', 'hello', 'hi', 'chào', 'hey']
const HELP_KEYWORDS = ['giúp', 'help', 'làm gì được', 'hướng dẫn']
const RECIPE_STRONG_KEYWORDS = ['công thức', 'nấu', 'recipe', 'cách làm', 'nguyên liệu']
const RESTAURANT_STRONG_KEYWORDS = ['quán', 'nhà hàng', 'ăn ở đâu', 'chỗ ăn']
const RESTAURANT_GENERIC_KEYWORDS = ['tìm', 'gợi ý', 'recommend', 'địa điểm']

function cleanText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function includesConversationKeyword(text, keyword) {
  if (keyword.includes(' ')) {
    return text.includes(keyword)
  }

  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.includes(keyword)
}

function findMappedValue(message, dictionary) {
  const lower = cleanText(message)
  const aliases = Object.keys(dictionary).sort((left, right) => right.length - left.length)
  const alias = aliases.find((item) => lower.includes(item))
  return alias ? dictionary[alias] : null
}

function extractKeyword(message, category) {
  if (category) {
    return category
  }

  let keyword = cleanText(message)
  const removable = [
    ...Object.keys(DISTRICTS),
    ...Object.values(PRICE_KEYWORDS).flat(),
    ...INTENTS.TOP_RATED,
    ...INTENTS.FIND_SPOT,
    ...RECIPE_STRONG_KEYWORDS,
    ...RESTAURANT_STRONG_KEYWORDS,
    ...RESTAURANT_GENERIC_KEYWORDS,
    'món',
    'ngon',
    'ở',
    'tại',
    'cho tôi',
    'với',
    'nhé',
  ].sort((left, right) => right.length - left.length)

  removable.forEach((phrase) => {
    keyword = keyword.replaceAll(phrase, ' ')
  })

  keyword = keyword
    .replace(/[?!.,;:()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return keyword || null
}

export function detectMatchedIntents(message) {
  const lower = cleanText(message)
  const matches = []
  const hasSpotIntent = includesAny(lower, INTENTS.FIND_SPOT)
  const hasRecipeIntent = includesAny(lower, RECIPE_STRONG_KEYWORDS)
  const hasRestaurantIntent = includesAny(lower, RESTAURANT_STRONG_KEYWORDS)

  if (hasSpotIntent) {
    matches.push('FIND_SPOT')
  }
  if (hasRecipeIntent) {
    matches.push('FIND_RECIPE')
  }
  if (hasRestaurantIntent) {
    matches.push('FIND_RESTAURANT')
  }

  if (matches.length > 0) {
    return [...new Set(matches)]
  }

  const hasFoodOrDistrict = Boolean(
    findMappedValue(lower, FOOD_KEYWORDS) || findMappedValue(lower, DISTRICTS),
  )
  const hasRestaurantModifier =
    includesAny(lower, RESTAURANT_GENERIC_KEYWORDS) ||
    includesAny(lower, INTENTS.TOP_RATED) ||
    includesAny(lower, INTENTS.CHEAP) ||
    lower.includes('món')

  if (hasFoodOrDistrict || hasRestaurantModifier) {
    return ['FIND_RESTAURANT']
  }

  return []
}

export function detectIntent(message) {
  const intents = detectMatchedIntents(message)
  if (intents.length > 1) {
    return 'combined'
  }
  return intents[0] || 'unknown'
}

export function extractEntities(message) {
  const lower = cleanText(message)
  const category = findMappedValue(lower, FOOD_KEYWORDS)
  let price = null

  if (includesAny(lower, PRICE_KEYWORDS.cheap)) {
    price = '$'
  } else if (includesAny(lower, PRICE_KEYWORDS.mid)) {
    price = '$$'
  } else if (includesAny(lower, PRICE_KEYWORDS.expensive)) {
    price = '$$$'
  }

  return {
    district: findMappedValue(lower, DISTRICTS),
    category,
    price,
    topRated: includesAny(lower, INTENTS.TOP_RATED),
    keyword: extractKeyword(lower, category),
  }
}

export function analyzeMessage(message) {
  const intents = detectMatchedIntents(message)
  return {
    intent: intents.length > 1 ? 'combined' : intents[0] || 'unknown',
    intents,
    entities: extractEntities(message),
  }
}

export function buildRestaurantQuery(entities) {
  let sql = `SELECT id, name, address, district, category,
                    avg_rating, price_range, description,
                    latitude, longitude
             FROM restaurants
             WHERE 1 = 1`
  const params = []

  if (entities.district) {
    sql += ' AND district = ?'
    params.push(entities.district)
  }
  if (entities.category) {
    sql += ' AND category = ?'
    params.push(entities.category)
  }
  if (entities.price) {
    sql += ' AND price_range = ?'
    params.push(entities.price)
  }
  if (entities.topRated) {
    sql += ' AND avg_rating >= 4.5'
  }

  sql += ' ORDER BY avg_rating DESC, id ASC LIMIT 5'
  return { sql, params }
}

export function buildRecipeQuery(entities) {
  let sql = `SELECT
               r.id, r.title, r.image_url, r.description,
               r.prep_time, r.cook_time, r.servings,
               c.name AS category,
               COALESCE(rating_stats.avg_rating, 0) AS avg_rating
             FROM recipes r
             JOIN categories c ON c.id = r.category_id
             LEFT JOIN (
               SELECT recipe_id, AVG(rating_value) AS avg_rating
               FROM ratings
               GROUP BY recipe_id
             ) rating_stats ON rating_stats.recipe_id = r.id
             WHERE r.status = 'approved'`
  const params = []

  if (entities.keyword) {
    const pattern = `%${entities.keyword}%`
    sql += ` AND (
      r.title LIKE ?
      OR r.description LIKE ?
      OR c.name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM recipe_ingredients ingredient
        WHERE ingredient.recipe_id = r.id AND ingredient.ingredient_name LIKE ?
      )
      OR EXISTS (
        SELECT 1
        FROM recipe_tags recipe_tag
        JOIN tags tag ON tag.id = recipe_tag.tag_id
        WHERE recipe_tag.recipe_id = r.id AND tag.name LIKE ?
      )
    )`
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  sql += ' ORDER BY avg_rating DESC, r.created_at DESC, r.id DESC LIMIT 5'
  return { sql, params }
}

export function buildSpotQuery(entities, userId) {
  let sql = `SELECT
               id, name, dish_name, category, district,
               latitude, longitude, rating, notes, created_at
             FROM food_spots
             WHERE user_id = ?`
  const params = [userId]

  if (entities.district) {
    sql += ' AND district = ?'
    params.push(entities.district)
  }
  if (entities.category) {
    sql += ' AND category = ?'
    params.push(entities.category)
  }
  if (entities.keyword && !entities.category) {
    const pattern = `%${entities.keyword}%`
    sql += ' AND (name LIKE ? OR dish_name LIKE ? OR notes LIKE ? OR tags LIKE ?)'
    params.push(pattern, pattern, pattern, pattern)
  }
  if (entities.topRated) {
    sql += ' AND rating >= 4'
  }

  sql += ' ORDER BY rating DESC, created_at DESC, id DESC LIMIT 5'
  return { sql, params }
}

function resultLabel(entities, fallback) {
  return entities.category || entities.keyword || fallback
}

export function generateResponse(intent, entities, results, options = {}) {
  const total = results.length

  if (total === 0) {
    if (intent === 'combined') {
      return {
        message:
          'Mình chưa tìm thấy kết quả phù hợp từ nhà hàng, công thức hoặc địa điểm đã lưu. Thử câu hỏi cụ thể hơn nhé!',
        suggestions: ['Tìm quán ăn', 'Công thức bánh mì', 'Địa điểm đã lưu'],
      }
    }
    if (intent === 'FIND_RECIPE') {
      return {
        message: `Mình chưa tìm thấy công thức phù hợp cho "${resultLabel(entities, 'món này')}". Thử tên món hoặc nguyên liệu khác nhé!`,
        suggestions: ['Xem tất cả công thức', 'Công thức bánh mì'],
      }
    }
    if (intent === 'FIND_SPOT') {
      return {
        message: 'Bạn chưa có địa điểm đã lưu phù hợp với yêu cầu này.',
        suggestions: ['Mở bản đồ ẩm thực', 'Tìm quán ăn'],
      }
    }

    return {
      message: `Xin lỗi, mình không tìm thấy ${entities.category || 'địa điểm'}${entities.district ? ` ở ${entities.district}` : ''} phù hợp. Thử khu vực hoặc món khác nhé!`,
      suggestions: ['Xem tất cả nhà hàng', 'Tìm món khác'],
    }
  }

  if (intent === 'FIND_RESTAURANT') {
    const topPlace = results[0]
    const filters = [
      entities.price === '$' ? 'bình dân' : '',
      entities.category || '',
      entities.district ? `ở ${entities.district}` : 'tại TP.HCM',
    ]
      .filter(Boolean)
      .join(' ')

    return {
      message: `Tìm thấy ${total} quán ${filters}. Nổi bật nhất: ${topPlace.name} (${Number(topPlace.avg_rating || 0).toFixed(1)} sao).`,
      suggestions: [
        'Xem trên bản đồ',
        `Tìm thêm ${entities.category || 'món ngon'}`,
        'Quán giá rẻ',
      ],
    }
  }

  if (intent === 'FIND_RECIPE') {
    return {
      message: `Tìm thấy ${total} công thức phù hợp cho "${resultLabel(entities, 'món bạn tìm')}".`,
      suggestions: ['Xem công thức', 'Công thức bánh mì'],
    }
  }

  if (intent === 'FIND_SPOT') {
    return {
      message: `Bạn có ${total} địa điểm đã lưu phù hợp.`,
      suggestions: ['Mở bản đồ ẩm thực', 'Tìm quán ăn'],
    }
  }

  const loginNote = options.requiresLogin
    ? ' Đăng nhập để mình tìm thêm trong các địa điểm bạn đã lưu.'
    : ''
  return {
    message: `Mình tìm thấy ${total} kết quả từ FoodStory.${loginNote}`,
    suggestions: options.requiresLogin
      ? ['Đăng nhập', 'Tìm quán ăn', 'Tìm công thức']
      : ['Tìm quán ăn', 'Tìm công thức', 'Địa điểm đã lưu'],
  }
}

export function handleSmallTalk(message) {
  const lower = cleanText(message)

  if (GREETINGS.some((greeting) => includesConversationKeyword(lower, greeting))) {
    return {
      message: `Xin chào! Mình là FoodBot.

Mình có thể giúp bạn:
• Tìm quán ăn ngon theo khu vực
• Gợi ý món ăn theo sở thích
• Tìm công thức nấu ăn
• Xem lại địa điểm bạn đã lưu

Thử hỏi: "Phở ngon ở Quận 1"`,
      type: 'greeting',
      suggestions: ['Phở ngon ở Quận 1', 'Quán cà phê Bình Thạnh', 'Công thức bánh mì'],
    }
  }

  if (HELP_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      message: `FoodBot có thể giúp bạn:

• Tìm quán ăn: "phở ngon quận 1", "cafe bình thạnh"
• Tìm công thức: "công thức bánh mì", "cách nấu phở"
• Địa điểm của tôi: "tôi đã lưu gì"
• Gợi ý: "món ngon nhất", "quán rẻ ngon"`,
      type: 'help',
      suggestions: ['Tìm quán ăn', 'Tìm công thức', 'Địa điểm đã lưu'],
    }
  }

  return null
}
