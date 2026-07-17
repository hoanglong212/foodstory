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

const FRUSTRATION_PATTERN = /\b(?:not helpful|useless|wrong answer|you do not understand|you dont understand|bad bot|stupid bot|does not work|doesnt work|khong hieu|tra loi sai|vo dung|te qua)\b/
const ACTIONABLE_DOMAIN_PATTERN = /\b(?:recipe|cook|ingredient|restaurant|food map|place|favorite|checklist|account|login|news|cong thuc|nau|nguyen lieu|nha hang|dia diem|tai khoan)\b/
const CORRECTION_PATTERN = /^(?:no\s*[,.-]?\s*|not that\s*[,.-]?\s*|actually\s*[,.-]?\s*|i meant\s+|sorry\s*[,.-]?\s*i meant\s+|khong\s*[,.-]?\s*|y toi la\s+)/i
const GENERAL_CULINARY_PATTERN = /\b(?:substitute|replace|instead of|meal plan|meal idea|cooking tip|recommend|suggest|what should i eat|what can i make|pair with|serve with|leftover|quick meal|easy meal|healthy meal|vegetarian|vegan|gluten free|dairy free|spicy|how (?:do|can|should) i|how to|why (?:is|does|did)|store|freeze|reheat|too salty|too sweet|too spicy|burnt|soggy|dry|tough|texture|marinate|season|prepare|cook|bake|fry|steam|boil|roast|goi y|an gi|mon nhanh|mon de|thay the|nau|bao quan|ham nong)\b/
const LIVE_FACT_PATTERN = /\b(?:address|opening hours|open now|phone number|price|cost|book|reserve|delivery|where is|restaurant rating|dia chi|gio mo cua|gia|dat ban)\b/
const FOOD_DOMAIN_PATTERN = /\b(?:food|dish|recipe|cook|cooking|ingredient|meal|restaurant|cafe|coffee|nutrition|calorie|protein|diet|menu|cuisine|bakery|drink|beverage|soup|rice|noodle|meat|fish|vegetable|fruit|mon an|cong thuc|nau|nguyen lieu|bua an|nha hang|quan an|dinh duong|am thuc)\b/
const EXTERNAL_RESEARCH_PATTERN = /\b(?:search (?:the )?web|look (?:it )?up|online|internet|external source|outside source|latest|current|today|this week|recent|trending|recall|evidence|research|study|history|origin|authentic|best rated|web search|tim tren mang|tra tren mang|nguon ben ngoai|moi nhat|hien tai|hom nay|xuat xu|lich su)\b/
const PRIVATE_DATA_PATTERN = /\b(?:my favorites|my checklist|my saved|my account|my profile|my map|favorite cua toi|checklist cua toi|tai khoan cua toi|ban do cua toi)\b/
const SHORT_COOKING_FOLLOWUP_PATTERN = /^(?:cach lam|cach nau|nau sao|lam sao|huong dan|how (?:do|can) i (?:make|cook) (?:it|that)|how to (?:make|cook) (?:it|that))$/

function cleanCookingSubject(value) {
  const subject = String(value || '')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!subject) return null
  const normalized = normalizeText(subject)
  if (/^(?:gi|mon gi|something|something tasty|it|that)$/.test(normalized)) {
    return null
  }
  return subject.slice(0, 120)
}

function extractNamedCookingSubject(value) {
  const text = String(value || '').trim()
  const patterns = [
    /^(?:tôi|toi|mình|minh)\s+(?:muốn|muon|cần|can)\s+(?:nấu|nau|làm|lam|chế biến|che bien)\s+(?:món\s+|mon\s+)?(.+)$/iu,
    /^(?:i\s+)?(?:want|would like|need)\s+to\s+(?:cook|make|prepare)\s+(.+)$/i,
    /^(?:cách|cach|hướng dẫn|huong dan)\s+(?:nấu|nau|làm|lam|chế biến|che bien)\s+(.+)$/iu,
    /^how (?:do|can) i (?:cook|make|prepare)\s+(.+)$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return cleanCookingSubject(match[1])
  }
  return null
}

export function buildContextualCustomerQuestion(question, history = []) {
  const current = String(question || '').trim()
  if (!Array.isArray(history)) return current

  if (CORRECTION_PATTERN.test(current)) {
    const previousUser = [...history]
      .reverse()
      .find((entry) => entry?.role === 'user' && String(entry.content || '').trim())
    if (!previousUser) return current

    return `Previous customer request: ${String(previousUser.content).trim().slice(0, 320)}\nCustomer correction: ${current}`
  }

  if (!SHORT_COOKING_FOLLOWUP_PATTERN.test(normalizeText(current))) return current

  const subject = history
    .slice(-4)
    .reverse()
    .filter((entry) => entry?.role === 'user')
    .map((entry) => extractNamedCookingSubject(entry.content))
    .find(Boolean)

  return subject ? `${current} ${subject}` : current
}

export function buildLocalCustomerCareAnswer(question, responseLanguage = 'en') {
  const normalized = normalizeText(question)
  if (!FRUSTRATION_PATTERN.test(normalized)) return null
  if (ACTIONABLE_DOMAIN_PATTERN.test(normalized)) return null

  const vietnamese = responseLanguage === 'vi'
  return {
    answer: vietnamese
      ? 'Xin lỗi — câu trả lời vừa rồi chưa giúp được bạn. Hãy nói mục tiêu chính theo cách ngắn nhất, ví dụ món muốn nấu, nguyên liệu đang có, quận muốn tìm quán hoặc thao tác FoodStory đang bị kẹt. Tôi sẽ bắt đầu lại từ đó.'
      : 'I’m sorry—the last answer missed what you needed. Give me the main goal in one line, such as the dish you want to cook, ingredients you have, the district where you want to eat, or the FoodStory action that is stuck. I’ll restart from there.',
    suggestions: vietnamese
      ? ['Tôi muốn tìm công thức', 'Tôi cần tìm quán', 'Tôi bị kẹt trên Food Map']
      : ['I want a recipe', 'I need a restaurant', 'I am stuck on Food Map'],
  }
}

export function isGeneralCulinaryQuestion(question) {
  const normalized = normalizeText(question)
  return (
    normalized.split(' ').length >= 4 &&
    GENERAL_CULINARY_PATTERN.test(normalized) &&
    !LIVE_FACT_PATTERN.test(normalized)
  )
}

export function isExternalFoodQuestion(question) {
  const normalized = normalizeText(question)
  return (
    normalized.split(' ').length >= 3 &&
    FOOD_DOMAIN_PATTERN.test(normalized) &&
    EXTERNAL_RESEARCH_PATTERN.test(normalized) &&
    !PRIVATE_DATA_PATTERN.test(normalized)
  )
}

export function isPrivateFoodStoryQuestion(question) {
  return PRIVATE_DATA_PATTERN.test(normalizeText(question))
}

export function buildClarificationAnswer(context = {}, responseLanguage = 'en') {
  const vietnamese = responseLanguage === 'vi'
  if (context.lastRecipeTitle) {
    return vietnamese
      ? `Bạn muốn biết gì về ${context.lastRecipeTitle}: nguyên liệu, khẩu phần, dinh dưỡng, thời gian hay cách nấu?`
      : `What would you like to know about ${context.lastRecipeTitle}: ingredients, servings, nutrition, timing, or cooking steps?`
  }
  return vietnamese
    ? 'Tôi có thể giúp chính xác hơn nếu bạn cho biết mục tiêu: tìm công thức, chọn món từ nguyên liệu đang có, tìm quán hoặc thao tác trên FoodStory.'
    : 'I can help more precisely if you name the goal: find a recipe, cook from ingredients you have, find a place to eat, or use a FoodStory feature.'
}
