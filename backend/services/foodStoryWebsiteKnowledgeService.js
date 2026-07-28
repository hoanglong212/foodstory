const WEBSITE_KNOWLEDGE = Object.freeze([
  {
    id: 'overview',
    title: 'FoodStory overview',
    path: '/',
    keywords: [
      'foodstory', 'website', 'app', 'features', 'what can i do', 'how does foodstory work',
      'home page', 'navigation', 'main menu',
    ],
    answers: {
      en: 'FoodStory combines recipe discovery, food news, restaurant and community-place discovery, and a personal Food Map. Signed-in users can also save favorites, generate ingredient checklists, rate and comment on recipes, submit recipes, and manage private saved places.',
      vi: 'FoodStory kết hợp khám phá công thức, tin tức ẩm thực, nhà hàng, địa điểm cộng đồng và Food Map cá nhân. Người dùng đã đăng nhập còn có thể lưu yêu thích, tạo checklist nguyên liệu, đánh giá và bình luận công thức, gửi công thức và quản lý địa điểm riêng.',
    },
    suggestions: ['How does My Map work?', 'How do I submit a recipe?', 'What can I do on a recipe page?'],
  },
  {
    id: 'accounts',
    title: 'Accounts and access',
    path: '/register',
    keywords: [
      'account', 'register', 'sign up', 'create account', 'login', 'log in', 'logout',
      'guest', 'permission', 'need an account', 'authentication', 'password',
      'tai khoan', 'dang ky', 'dang nhap', 'khach',
    ],
    answers: {
      en: 'Guests can read news and recipes and preview the Community Food Map. An account is required for favorites, checklists, comments, ratings, recipe submission, My Map, saved places, and personal statistics. Protected pages send signed-out users to Login and return them afterward.',
      vi: 'Khách có thể đọc tin, xem công thức và xem trước Community Food Map. Bạn cần tài khoản để dùng yêu thích, checklist, bình luận, đánh giá, gửi công thức, My Map, địa điểm đã lưu và thống kê cá nhân. Trang được bảo vệ sẽ chuyển người chưa đăng nhập đến Login rồi quay lại trang ban đầu.',
    },
    suggestions: ['Open registration', 'What is available to guests?', 'What is on my profile?'],
  },
  {
    id: 'profile',
    title: 'Profile and saved activity',
    path: '/profile',
    keywords: [
      'profile', 'my profile', 'account role', 'my activity', 'comment history',
      'saved activity', 'where are my comments', 'where is my role',
      'ho so', 'lich su binh luan',
    ],
    answers: {
      en: 'The Profile page shows your account details and role, with separate tabs for favorite recipes, ingredient checklists, and your recipe-comment history. Favorites and checklists also have direct routes in the main app.',
      vi: 'Trang Profile hiển thị thông tin và vai trò tài khoản, cùng các tab riêng cho công thức yêu thích, checklist nguyên liệu và lịch sử bình luận công thức. Favorites và Checklists cũng có đường dẫn trực tiếp trong ứng dụng.',
    },
    suggestions: ['Open my profile', 'Show my favorite recipes', 'Show my checklists'],
  },
  {
    id: 'recipe_discovery',
    title: 'Finding recipes',
    path: '/recipes',
    keywords: [
      'find recipe', 'browse recipes', 'recipe search', 'search recipes', 'recipe filter',
      'filter by category', 'filter by tag', 'sort recipes', 'quick easy healthy vegetarian',
      'tim cong thuc', 'loc cong thuc',
    ],
    answers: {
      en: 'Open Recipes to search by text, filter by category or tag, and use discovery shortcuts such as Quick & Easy, Healthy, Student-friendly, and Vegetarian. Recipe cards show useful details such as time, servings, difficulty or rating before you open one.',
      vi: 'Mở Recipes để tìm bằng từ khóa, lọc theo danh mục hoặc thẻ và dùng các lối tắt như Quick & Easy, Healthy, Student-friendly và Vegetarian. Thẻ công thức hiển thị các chi tiết như thời gian, khẩu phần, độ khó hoặc đánh giá trước khi mở.',
    },
    suggestions: ['Open all recipes', 'How do favorites work?', 'What is on a recipe page?'],
  },
  {
    id: 'recipe_details',
    title: 'Recipe details and cooking tools',
    path: '/recipes',
    keywords: [
      'recipe page', 'recipe details', 'ingredients', 'instructions', 'cooking steps',
      'nutrition', 'servings', 'cooking time', 'print recipe', 'share recipe',
      'related recipes', 'what is on recipe', 'chi tiet cong thuc', 'nguyen lieu',
    ],
    answers: {
      en: 'A recipe page contains its ingredient list, instructions, timing and serving information, nutrition panel, ratings, comments, related recipes, and print/share actions. Signed-in users can also favorite it and generate a live ingredient checklist.',
      vi: 'Trang công thức có danh sách nguyên liệu, hướng dẫn, thời gian và khẩu phần, bảng dinh dưỡng, đánh giá, bình luận, công thức liên quan và thao tác in/chia sẻ. Người dùng đã đăng nhập còn có thể lưu yêu thích và tạo checklist nguyên liệu tương tác.',
    },
    suggestions: ['How do I make a checklist?', 'How do ratings and comments work?', 'Open recipes'],
  },
  {
    id: 'favorites',
    title: 'Favorite recipes',
    path: '/favorites',
    keywords: [
      'favorite', 'favourite', 'save recipe', 'saved recipe', 'heart recipe',
      'remove favorite', 'where are favorites', 'cong thuc yeu thich', 'luu cong thuc',
    ],
    answers: {
      en: 'While signed in, use the heart control on a recipe card or recipe page to add or remove that recipe from Favorites. Open Favorites from your Profile or go directly to the Favorites page to see the recipes saved to your account.',
      vi: 'Khi đã đăng nhập, dùng nút trái tim trên thẻ hoặc trang công thức để thêm hoặc xóa công thức khỏi Favorites. Mở Favorites trong Profile hoặc truy cập trực tiếp trang Favorites để xem công thức đã lưu của tài khoản.',
    },
    suggestions: ['Open my favorites', 'How do checklists work?', 'Find recipes'],
  },
  {
    id: 'checklists',
    title: 'Ingredient checklists',
    path: '/checklist',
    keywords: [
      'checklist', 'ingredient checklist', 'shopping list', 'generate checklist',
      'check ingredients', 'tick ingredients', 'checklist progress', 'continue checklist',
      'danh sach nguyen lieu',
    ],
    answers: {
      en: 'On a recipe page, sign in and choose Generate Checklist. The checklist contains that recipe’s ingredients, lets you tick items while shopping or cooking, and saves progress to your account. Continue any saved checklist from Profile > Checklists or the Checklist page.',
      vi: 'Trên trang công thức, hãy đăng nhập và chọn Generate Checklist. Checklist chứa nguyên liệu của công thức, cho phép đánh dấu khi mua sắm hoặc nấu và lưu tiến độ vào tài khoản. Tiếp tục checklist đã lưu trong Profile > Checklists hoặc trang Checklist.',
    },
    suggestions: ['Open my checklists', 'Find a recipe', 'How do favorites work?'],
  },
  {
    id: 'ratings_comments',
    title: 'Recipe ratings and comments',
    path: '/recipes',
    keywords: [
      'rate recipe', 'rating', 'stars', 'comment', 'review', 'cooking note',
      'edit comment', 'delete comment', 'my comments', 'recipe discussion',
      'danh gia', 'binh luan',
    ],
    answers: {
      en: 'Signed-in users can give a recipe a 1–5 star rating and post a comment or cooking note. You can edit or delete only your own comments. Your comment history is available under Profile > Comments, while recipe pages show the current rating and discussion.',
      vi: 'Người dùng đã đăng nhập có thể đánh giá công thức từ 1–5 sao và đăng bình luận hoặc ghi chú nấu ăn. Bạn chỉ có thể sửa hoặc xóa bình luận của mình. Lịch sử nằm trong Profile > Comments; trang công thức hiển thị điểm và thảo luận hiện tại.',
    },
    suggestions: ['Open my comment history', 'Open recipes', 'What is on my profile?'],
  },
  {
    id: 'recipe_submission',
    title: 'Submitting recipes',
    path: '/recipes/submit',
    keywords: [
      'submit recipe', 'add recipe', 'create recipe', 'contribute recipe', 'recipe submission',
      'publish recipe', 'edit recipe', 'who can add recipe', 'gui cong thuc', 'them cong thuc',
    ],
    answers: {
      en: 'A signed-in regular user can open Submit a Recipe and provide the recipe details, ingredients, instructions, image and nutrition information. Administrators use the separate Admin workflow to create or edit catalog recipes and review submitted content.',
      vi: 'Người dùng thường đã đăng nhập có thể mở Submit a Recipe để nhập thông tin, nguyên liệu, hướng dẫn, ảnh và dinh dưỡng. Quản trị viên dùng quy trình Admin riêng để tạo hoặc sửa công thức trong danh mục và xem nội dung được gửi.',
    },
    suggestions: ['Open recipe submission', 'What can admins manage?', 'Open recipes'],
  },
  {
    id: 'food_map',
    title: 'Food Map modes',
    path: '/food-map',
    keywords: [
      'food map', 'map modes', 'my map', 'community map', 'map statistics',
      'map feature', 'how does map work', 'personal map', 'ban do am thuc',
    ],
    answers: {
      en: 'Food Map has Community browsing for everyone and, after login, My Map plus personal Statistics. Community shows shared discoveries; My Map contains places owned by your account; Statistics summarizes your private journey. Use the mode switcher to move between them.',
      vi: 'Food Map cho mọi người xem Community; sau khi đăng nhập có thêm My Map và Statistics cá nhân. Community hiển thị khám phá được chia sẻ, My Map chứa địa điểm thuộc tài khoản của bạn và Statistics tóm tắt hành trình riêng. Dùng bộ chuyển chế độ để đổi khu vực.',
    },
    suggestions: ['Open Food Map', 'Are My Map places private?', 'How do I add a place?'],
  },
  {
    id: 'personal_map',
    title: 'Private My Map and statistics',
    path: '/food-map?mode=personal',
    keywords: [
      'each user map', 'different map', 'same map', 'own map', 'private map',
      'every user', 'user map', 'maps different',
      'my places', 'personal places', 'who can see my places', 'map privacy',
      'personal statistics', 'favorite district', 'most visited district',
      'ban do rieng', 'dia diem cua toi',
    ],
    answers: {
      en: 'Each signed-in user has a separate My Map. The API loads personal places by the authenticated user ID, and only that owner can create, edit, or delete them. Personal Statistics uses only that account’s places, including total places, average rating, favorite district, and most-visited districts.',
      vi: 'Mỗi người dùng đã đăng nhập có My Map riêng. API tải địa điểm theo ID người dùng đã xác thực và chỉ chủ sở hữu mới có thể tạo, sửa hoặc xóa. Statistics chỉ dùng địa điểm của tài khoản đó, gồm tổng số, điểm trung bình, quận yêu thích và các quận ghé nhiều nhất.',
    },
    suggestions: ['Open My Map', 'How do I add a place?', 'What is the Community map?'],
  },
  {
    id: 'add_place',
    title: 'Adding and managing a place',
    path: '/food-map?mode=personal',
    keywords: [
      'add place', 'add new place', 'create place', 'save place', 'own place',
      'edit place', 'delete place', 'remove place', 'choose location', 'pick on map',
      'place form', 'add restaurant to map', 'them dia diem', 'xoa dia diem',
    ],
    answers: {
      en: 'Sign in, open Food Map, switch to My Map, and choose Add New Place. Enter the place and dish details, choose its map location, review the preview, and save. Open one of your saved places to edit or delete it. These controls never modify another user’s place.',
      vi: 'Đăng nhập, mở Food Map, chuyển sang My Map và chọn Add New Place. Nhập thông tin địa điểm và món ăn, chọn vị trí trên bản đồ, xem trước rồi lưu. Mở địa điểm đã lưu để sửa hoặc xóa. Các thao tác này không thể thay đổi địa điểm của người khác.',
    },
    suggestions: ['Open Add Place', 'Are My Map places private?', 'How does link import work?'],
  },
  {
    id: 'community_map',
    title: 'Community places and restaurant discovery',
    path: '/food-map?mode=community',
    keywords: [
      'community', 'community places', 'public places', 'shared places', 'browse places',
      'restaurant map', 'map search', 'map filter', 'district filter', 'category filter',
      'minimum rating', 'nearby', 'top rated', 'budget', 'cong dong',
    ],
    answers: {
      en: 'Community mode is available to guests and signed-in users. Search shared places by dish or place name and filter by district or category. Restaurant discovery also supports district, category, text and minimum-rating filters; selecting a result focuses its map location and details.',
      vi: 'Chế độ Community dành cho cả khách và người đã đăng nhập. Tìm địa điểm chia sẻ theo món hoặc tên và lọc theo quận hay danh mục. Khám phá nhà hàng còn hỗ trợ quận, danh mục, từ khóa và điểm tối thiểu; chọn kết quả để xem vị trí và chi tiết.',
    },
    suggestions: ['Open Community Map', 'How is My Map different?', 'How do I add a place?'],
  },
  {
    id: 'map_import',
    title: 'Food Map link and image-assisted import',
    path: '/food-map',
    keywords: [
      'import place', 'import link', 'paste link', 'social link', 'video link',
      'image search', 'vision', 'vision auto', 'scan place', 'ai place',
      'review candidate', 'automatic place', 'nhap lien ket', 'phan tich anh',
    ],
    answers: {
      en: 'Food Map can analyze supported links or visual evidence to suggest dishes and possible places. Results are candidates for review: inspect the evidence, select a match or draft, correct missing details, and explicitly save through the Add Place form. An uncertain AI result is not silently published as a verified place.',
      vi: 'Food Map có thể phân tích liên kết được hỗ trợ hoặc bằng chứng hình ảnh để gợi ý món và địa điểm. Kết quả chỉ là ứng viên cần xem lại: kiểm tra bằng chứng, chọn kết quả hoặc bản nháp, sửa thông tin thiếu rồi chủ động lưu qua Add Place. Kết quả AI chưa chắc chắn không tự động được công bố là địa điểm đã xác minh.',
    },
    suggestions: ['Open Food Map import', 'How do I add a place manually?', 'Why must I review AI results?'],
  },
  {
    id: 'news_about',
    title: 'Food news and About FoodStory',
    path: '/news',
    keywords: [
      'food news', 'news page', 'article', 'food article', 'about foodstory',
      'about us', 'who is foodstory', 'editorial', 'tin tuc', 'gioi thieu',
    ],
    answers: {
      en: 'The News section contains FoodStory food articles, each with its own detail page. About Us explains the product and its purpose. Both are public and available from the main navigation without an account.',
      vi: 'Mục News chứa các bài viết ẩm thực FoodStory, mỗi bài có trang chi tiết riêng. About Us giải thích sản phẩm và mục đích của FoodStory. Cả hai đều công khai trong thanh điều hướng và không cần tài khoản.',
    },
    suggestions: ['Open food news', 'Open About Us', 'What else can FoodStory do?'],
  },
  {
    id: 'admin',
    title: 'Administrator tools',
    path: '/admin',
    keywords: [
      'admin', 'administrator', 'admin dashboard', 'manage users', 'ban user',
      'user roles', 'moderate', 'pending recipe', 'review submission',
      'manage recipes', 'quan tri',
    ],
    answers: {
      en: 'The Admin dashboard is restricted to administrator accounts. It provides management workflows for recipes and submissions, users and roles, moderation, and site data. Regular users are redirected away from this route and use Submit a Recipe instead.',
      vi: 'Admin dashboard chỉ dành cho tài khoản quản trị. Trang này có quy trình quản lý công thức và bài gửi, người dùng và vai trò, kiểm duyệt và dữ liệu trang. Người dùng thường bị chuyển khỏi route này và dùng Submit a Recipe thay thế.',
    },
    suggestions: ['Open Admin', 'How do regular users submit recipes?', 'What requires login?'],
  },
  {
    id: 'foodbot',
    title: 'FoodBot scope and privacy',
    path: '/',
    keywords: [
      'foodbot', 'chatbot', 'assistant', 'chat history', 'chat privacy',
      'what can chatbot answer', 'groq', 'ai answer', 'bot know',
    ],
    answers: {
      en: 'FoodBot answers website guidance locally and checks FoodStory first for recipes, restaurants, favorites, checklists and saved places. It reads live public product data for questions such as today\'s Daily Inspiration and the current approved recipe count. If FoodStory still has no verified answer, it can use clearly labelled Groq general knowledge; explicit current online food research uses bounded web search with visible external sources. Chat history is stored per signed-in account or guest browser profile, while private database answers require login.',
      vi: 'FoodBot trả lời hướng dẫn website bằng dữ liệu cục bộ và tra cứu FoodStory trước cho công thức, nhà hàng, yêu thích, checklist và địa điểm đã lưu. Bot đọc dữ liệu sản phẩm công khai trực tiếp cho các câu như Daily Inspiration hôm nay hoặc số công thức đã duyệt hiện tại. Nếu FoodStory vẫn chưa có câu trả lời đã xác minh, bot mới dùng kiến thức chung của Groq với nhãn rõ ràng; yêu cầu nghiên cứu ẩm thực trực tuyến mới dùng web search có nguồn ngoài hiển thị riêng. Lịch sử chat được lưu theo tài khoản hoặc trình duyệt khách, còn dữ liệu riêng cần đăng nhập.',
    },
    suggestions: ['What website questions can you answer?', 'What requires login?', 'How does My Map work?'],
  },
])

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'this', 'to', 'what', 'where',
  'which', 'who', 'why', 'with', 'you', 'your', 'co', 'cua', 'gi', 'la', 'lam',
  'nao', 'o', 'toi', 'tren', 'va',
])

const WEBSITE_MARKERS = /\b(?:foodstory|foodbot|chatbot|website|site|app|page|feature|account|register|login|profile|favorite|favourite|checklist|comment|rating|submit|admin|food map|my map|community map|add (?:a )?place|edit (?:a )?place|delete (?:a )?place|saved place|map statistics|news|about us|guest|private map|personal map)\b/
const WEBSITE_HELP_CUES = /\b(?:how|how do|how can|how does|what can|where (?:is|are|do)|does (?:each|every)|different|same|compare|who can|private|public|guest|permission|open|use|add|create|edit|delete|remove|submit|feature|work|works|lam sao|the nao|khac nhau|ai co the|rieng|cong khai)\b/
const PRIVATE_DATA_REQUEST = /^(?:show|list|find|tell me|what|which)\b.*\bmy\b.*\b(?:favorites?|favourites?|checklists?|saved places?|food spots?)\b/

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

function meaningfulTokens(value) {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  )
}

function scoreEntry(question, entry) {
  const normalizedQuestion = normalizeText(question)
  const queryTokens = meaningfulTokens(normalizedQuestion)
  if (!queryTokens.size) return 0

  const normalizedKeywords = entry.keywords.map(normalizeText)
  const entryTokens = meaningfulTokens(`${entry.title} ${normalizedKeywords.join(' ')}`)
  let phraseScore = 0
  for (const phrase of normalizedKeywords) {
    if (!phrase || !normalizedQuestion.includes(phrase)) continue
    const phraseWords = phrase.split(' ').length
    phraseScore = Math.max(phraseScore, Math.min(0.72, 0.3 + phraseWords * 0.1))
  }

  let overlap = 0
  for (const token of queryTokens) {
    if (entryTokens.has(token)) overlap += 1
  }
  const queryCoverage = overlap / queryTokens.size
  const entryCoverage = overlap / Math.max(1, Math.min(entryTokens.size, 8))
  const title = normalizeText(entry.title)
  const titleBoost = normalizedQuestion.includes(title) ? 0.22 : 0

  return Math.min(
    1,
    phraseScore + queryCoverage * 0.42 + entryCoverage * 0.12 + titleBoost
  )
}

export function isWebsiteKnowledgeQuestion(question, route = {}) {
  const normalized = normalizeText(question)
  if (!normalized) return false
  if (route.intent === 'app_help') return true
  if (!WEBSITE_MARKERS.test(normalized)) return false
  if (PRIVATE_DATA_REQUEST.test(normalized) && !/\b(?:where|how)\b/.test(normalized)) {
    return false
  }
  return (
    WEBSITE_HELP_CUES.test(normalized) ||
    ['unknown', 'general_foodstory_rag'].includes(route.intent)
  )
}

export function retrieveWebsiteKnowledge(question, { limit = 3 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(3, Number(limit) || 3))
  const results = WEBSITE_KNOWLEDGE
    .map((entry) => ({ ...entry, score: Number(scoreEntry(question, entry).toFixed(4)) }))
    .filter((entry) => entry.score >= 0.34)
    .sort((left, right) => right.score - left.score)
    .slice(0, normalizedLimit)

  return {
    status: results.length ? 'matched' : 'no_results',
    results,
  }
}

function wantsMultipleTopics(question) {
  return /\b(?:and|also|both|difference|different|compare|as well as|plus|va|khac nhau)\b/.test(
    normalizeText(question)
  )
}

export function answerWebsiteKnowledgeQuestion(question, route = {}) {
  if (!isWebsiteKnowledgeQuestion(question, route)) return null

  const retrieval = retrieveWebsiteKnowledge(question)
  if (!retrieval.results.length) return null

  const language = route.entities?.responseLanguage === 'vi' ? 'vi' : 'en'
  const topScore = retrieval.results[0].score
  const selected = wantsMultipleTopics(question)
    ? retrieval.results.filter((entry) => entry.score >= Math.max(0.34, topScore - 0.24))
    : retrieval.results.slice(0, 1)
  const answer = selected.length === 1
    ? selected[0].answers[language]
    : selected
        .map((entry) => `${entry.title}: ${entry.answers[language]}`)
        .join('\n\n')

  return {
    answer,
    confidence: topScore,
    status: retrieval.status,
    sources: selected.map((entry) => ({
      sourceType: 'website',
      sourceId: entry.id,
      title: entry.title,
      path: entry.path,
      score: entry.score,
      matchLevel: entry.score >= 0.72 ? 'exact' : 'partial',
    })),
    suggestions: selected.flatMap((entry) => entry.suggestions).slice(0, 3),
  }
}

export { WEBSITE_KNOWLEDGE }
