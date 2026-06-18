const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@foodstory.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!'
const USER_EMAIL = process.env.USER_EMAIL || 'long@foodstory.test'
const USER_PASSWORD = process.env.USER_PASSWORD || 'User123!'

const state = {
  adminToken: '',
  userToken: '',
  adminUser: null,
  normalUser: null,
  existingRecipeId: 0,
  existingNewsId: 0,
  tempRecipeId: 0,
  tempSubmissionId: 0,
  tempCommentId: 0,
  tempChecklistItemId: 0,
  results: [],
}

function logResult(result) {
  state.results.push(result)
  const marker = result.pass ? 'PASS' : 'FAIL'
  console.log(`${marker} ${result.name} (${result.actualStatus})`)
  if (!result.pass && result.note) {
    console.log(`  ${result.note}`)
  }
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(method, path, { token = '', body, headers = {} } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader(token),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  const text = await response.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  }
}

async function test(name, expectedStatus, method, path, options = {}, check = () => true) {
  try {
    const response = await request(method, path, options)
    const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]
    const pass = statuses.includes(response.status) && check(response)
    logResult({
      name,
      expectedStatus: statuses.join('/'),
      actualStatus: response.status,
      pass,
      note: pass ? '' : JSON.stringify(response.data),
    })
    return response
  } catch (error) {
    logResult({
      name,
      expectedStatus: Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus,
      actualStatus: 'REQUEST_FAILED',
      pass: false,
      note: error.message,
    })
    return { status: 0, ok: false, data: null }
  }
}

async function login(email, password) {
  const response = await request('POST', '/auth/login', {
    body: { email, password },
  })
  if (response.status !== 200 || !response.data?.token) {
    throw new Error(`Unable to login ${email}: ${JSON.stringify(response.data)}`)
  }
  return response.data
}

async function cleanup() {
  if (state.tempSubmissionId && state.adminToken) {
    await request('DELETE', `/recipes/${state.tempSubmissionId}`, { token: state.adminToken })
  }
  if (state.tempRecipeId && state.adminToken) {
    await request('DELETE', `/recipes/${state.tempRecipeId}`, { token: state.adminToken })
  }
}

async function main() {
  try {
    await test('Health check', 200, 'GET', '/health', {}, (res) => res.data?.status === 'ok')

    await test('Auth register validation rejects invalid email', 400, 'POST', '/auth/register', {
      body: {
        username: 'bad-email-user',
        email: 'not-an-email',
        password: 'Password123!',
      },
    })
    await test('Auth register validation rejects short password', 400, 'POST', '/auth/register', {
      body: {
        username: 'short-password-user',
        email: 'short-password@example.test',
        password: 'short',
      },
    })
    await test('Auth login validation rejects missing password', 400, 'POST', '/auth/login', {
      body: {
        email: USER_EMAIL,
        password: '',
      },
    })
    await test('Auth login rejects bad credentials', 401, 'POST', '/auth/login', {
      body: {
        email: USER_EMAIL,
        password: 'WrongPassword123!',
      },
    })

    const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
    const userLogin = await login(USER_EMAIL, USER_PASSWORD)
    state.adminToken = adminLogin.token
    state.userToken = userLogin.token
    state.adminUser = adminLogin.user
    state.normalUser = userLogin.user
    logResult({
      name: 'Auth login admin success',
      expectedStatus: 200,
      actualStatus: 200,
      pass: adminLogin.user?.role === 'admin',
      note: adminLogin.user?.role,
    })
    logResult({
      name: 'Auth login user success',
      expectedStatus: 200,
      actualStatus: 200,
      pass: userLogin.user?.role === 'user',
      note: userLogin.user?.role,
    })

    await test('Auth me success', 200, 'GET', '/auth/me', { token: state.userToken }, (res) =>
      Boolean(res.data?.user?.email),
    )
    await test('Auth me missing token', 401, 'GET', '/auth/me')
    await test('Auth me invalid token', 401, 'GET', '/auth/me', { token: 'invalid.token.value' })
    await test('Auth logout success', 200, 'POST', '/auth/logout', { token: state.userToken })
    await test('Auth logout missing token', 401, 'POST', '/auth/logout')

    const newsList = await test('News list success', 200, 'GET', '/news?page=1&pageSize=2')
    state.existingNewsId = newsList.data?.items?.[0]?.id || 1
    await test('News categories success', 200, 'GET', '/news/categories', {}, (res) =>
      Array.isArray(res.data?.categories),
    )
    await test('News list search/category/date supports filters', 200, 'GET', '/news?page=1&pageSize=2&search=a&category=all')
    await test('News list rejects invalid date', 400, 'GET', '/news?date=bad-date')
    await test('News detail success', 200, 'GET', `/news/${state.existingNewsId}`, {}, (res) =>
      Boolean(res.data?.item?.id),
    )
    await test('News detail invalid id', 400, 'GET', '/news/not-a-number')
    await test('News detail not found', 404, 'GET', '/news/999999')

    const recipes = await test('Recipe list success', 200, 'GET', '/recipes?page=1&pageSize=2&includeMeta=1')
    state.existingRecipeId = recipes.data?.items?.[0]?.id || 1
    await test('Recipe list search/category/tag supports filters', 200, 'GET', '/recipes?page=1&pageSize=2&search=a&category=all&tag=all')
    const meta = await test('Recipe meta success', 200, 'GET', '/recipes/meta', {}, (res) =>
      Array.isArray(res.data?.categories) && Array.isArray(res.data?.tags),
    )
    await test('Recipe detail success', 200, 'GET', `/recipes/${state.existingRecipeId}`)
    await test('Recipe detail invalid id', 400, 'GET', '/recipes/not-a-number')
    await test('Recipe detail not found', 404, 'GET', '/recipes/999999')

    await test('Recipe create missing token', 401, 'POST', '/recipes', { body: {} })
    await test('Recipe create invalid token', 401, 'POST', '/recipes', {
      token: 'invalid.token.value',
      body: {},
    })
    await test('Recipe create forbidden for user', 403, 'POST', '/recipes', {
      token: state.userToken,
      body: {},
    })
    await test('Recipe create validation rejects empty body for admin', 400, 'POST', '/recipes', {
      token: state.adminToken,
      body: {},
    })

    const categoryId = meta.data.categories[0]?.id
    const tagIds = meta.data.tags[0]?.id ? [meta.data.tags[0].id] : []
    const tempRecipePayload = {
      title: `API Smoke Temp Recipe ${Date.now()}`,
      category_id: categoryId,
      image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=70',
      description: 'Temporary recipe created by the API smoke test.',
      instructions: 'Create, update, interact with, then delete this temporary recipe.',
      calories: 220,
      protein: 12,
      carbs: 28,
      fat: 6,
      ingredients: [
        {
          ingredient_name: 'Smoke test ingredient',
          quantity: '1 item',
        },
      ],
      tags: tagIds,
    }

    await test('Recipe submission missing token', 401, 'POST', '/recipes/submissions', {
      body: tempRecipePayload,
    })
    await test('Recipe submission validation rejects empty body', 400, 'POST', '/recipes/submissions', {
      token: state.userToken,
      body: {},
    })
    const submissionTitle = `API Smoke Pending Submission ${Date.now()}`
    const submittedRecipe = await test(
      'Recipe submission creates pending recipe',
      201,
      'POST',
      '/recipes/submissions',
      {
        token: state.userToken,
        body: {
          ...tempRecipePayload,
          title: submissionTitle,
          description: 'Temporary pending recipe submitted by a normal user.',
        },
      },
      (res) => res.data?.recipe?.status === 'pending',
    )
    state.tempSubmissionId = submittedRecipe.data?.recipe?.id || 0
    await test(
      'Pending recipe hidden from anonymous detail',
      404,
      'GET',
      `/recipes/${state.tempSubmissionId}`,
    )
    await test(
      'Pending recipe visible to submitter',
      200,
      'GET',
      `/recipes/${state.tempSubmissionId}`,
      { token: state.userToken },
      (res) => res.data?.recipe?.status === 'pending',
    )
    await test(
      'Pending recipe hidden from public recipe list',
      200,
      'GET',
      `/recipes?search=${encodeURIComponent(submissionTitle)}&page=1&pageSize=10`,
      {},
      (res) => res.data?.items?.length === 0,
    )
    await test(
      'Pending recipe visible in admin moderation list',
      200,
      'GET',
      `/admin/recipes?status=pending&search=${encodeURIComponent(submissionTitle)}&page=1`,
      { token: state.adminToken },
      (res) => res.data?.items?.some((recipe) => recipe.id === state.tempSubmissionId),
    )
    await test(
      'Admin deletes pending submission',
      200,
      'DELETE',
      `/recipes/${state.tempSubmissionId}`,
      { token: state.adminToken },
    )
    state.tempSubmissionId = 0

    const createdRecipe = await test('Recipe create admin success', 201, 'POST', '/recipes', {
      token: state.adminToken,
      body: tempRecipePayload,
    }, (res) => Boolean(res.data?.recipe?.id))
    state.tempRecipeId = createdRecipe.data?.recipe?.id || 0

    const updatedPayload = {
      ...tempRecipePayload,
      title: `${tempRecipePayload.title} Updated`,
      calories: 230,
    }
    await test('Recipe update missing token', 401, 'PUT', `/recipes/${state.tempRecipeId}`, {
      body: updatedPayload,
    })
    await test('Recipe update forbidden for user', 403, 'PUT', `/recipes/${state.tempRecipeId}`, {
      token: state.userToken,
      body: updatedPayload,
    })
    await test('Recipe update validation rejects bad nutrition', 400, 'PUT', `/recipes/${state.tempRecipeId}`, {
      token: state.adminToken,
      body: {
        ...updatedPayload,
        calories: -1,
      },
    })
    await test('Recipe update admin success', 200, 'PUT', `/recipes/${state.tempRecipeId}`, {
      token: state.adminToken,
      body: updatedPayload,
    }, (res) => res.data?.recipe?.title === updatedPayload.title)
    await test('Recipe update not found', 404, 'PUT', '/recipes/999999', {
      token: state.adminToken,
      body: updatedPayload,
    })

    await test('Rating missing token', 401, 'POST', `/recipes/${state.tempRecipeId}/rating`, {
      body: { rating_value: 4 },
    })
    await test('Rating invalid token', 401, 'POST', `/recipes/${state.tempRecipeId}/rating`, {
      token: 'invalid.token.value',
      body: { rating_value: 4 },
    })
    await test('Rating validation rejects out-of-range value', 400, 'POST', `/recipes/${state.tempRecipeId}/rating`, {
      token: state.userToken,
      body: { rating_value: 6 },
    })
    const firstRating = await test('Rating create success', 200, 'POST', `/recipes/${state.tempRecipeId}/rating`, {
      token: state.userToken,
      body: { rating_value: 4 },
    }, (res) => res.data?.current_user_rating === 4)
    const secondRating = await test('Rating duplicate updates existing rating', 200, 'POST', `/recipes/${state.tempRecipeId}/rating`, {
      token: state.userToken,
      body: { rating_value: 5 },
    }, (res) => res.data?.current_user_rating === 5 && res.data?.total_ratings === firstRating.data?.total_ratings)

    await test('Comment missing token', 401, 'POST', `/recipes/${state.tempRecipeId}/comments`, {
      body: { content: 'Smoke comment' },
    })
    await test('Comment validation rejects short content', 400, 'POST', `/recipes/${state.tempRecipeId}/comments`, {
      token: state.userToken,
      body: { content: 'bad' },
    })
    const comment = await test('Comment create success', 201, 'POST', `/recipes/${state.tempRecipeId}/comments`, {
      token: state.userToken,
      body: { content: 'Smoke test comment content.' },
    }, (res) => Boolean(res.data?.comment?.id))
    state.tempCommentId = comment.data?.comment?.id || 0
    await test('Comment edit missing token', 401, 'PUT', `/comments/${state.tempCommentId}`, {
      body: { content: 'Edited smoke test comment.' },
    })
    await test('Comment edit owner-only rejects another user', 403, 'PUT', `/comments/${state.tempCommentId}`, {
      token: state.adminToken,
      body: { content: 'Admin should not edit user comment.' },
    })
    await test('Comment edit success for owner', 200, 'PUT', `/comments/${state.tempCommentId}`, {
      token: state.userToken,
      body: { content: 'Edited smoke test comment.' },
    })
    await test('User comments/profile list success', 200, 'GET', '/comments/user', {
      token: state.userToken,
    }, (res) => Array.isArray(res.data?.items))
    await test('User comments/profile missing token', 401, 'GET', '/comments/user')
    await test('Comment delete owner-only rejects another user', 403, 'DELETE', `/comments/${state.tempCommentId}`, {
      token: state.adminToken,
    })

    await test('Favorites list missing token', 401, 'GET', '/favorites')
    await test('Favorites list success', 200, 'GET', '/favorites', {
      token: state.userToken,
    }, (res) => Array.isArray(res.data?.items))
    await test('Favorite add missing token', 401, 'POST', `/favorites/${state.tempRecipeId}`)
    await test('Favorite add invalid recipe id', 400, 'POST', '/favorites/not-a-number', {
      token: state.userToken,
    })
    await test('Favorite add not found', 404, 'POST', '/favorites/999999', {
      token: state.userToken,
    })
    await test('Favorite add success', 201, 'POST', `/favorites/${state.tempRecipeId}`, {
      token: state.userToken,
    })
    await test('Favorite duplicate prevented', 201, 'POST', `/favorites/${state.tempRecipeId}`, {
      token: state.userToken,
    })
    const favoritesAfterDuplicate = await test('Favorite list contains no duplicate recipe', 200, 'GET', '/favorites', {
      token: state.userToken,
    }, (res) => res.data.items.filter((item) => item.id === state.tempRecipeId).length === 1)
    await test('Favorite remove missing token', 401, 'DELETE', `/favorites/${state.tempRecipeId}`)
    await test('Favorite remove success', 200, 'DELETE', `/favorites/${state.tempRecipeId}`, {
      token: state.userToken,
    })
    await test('Favorite removed from list', 200, 'GET', '/favorites', {
      token: state.userToken,
    }, (res) => res.data.items.filter((item) => item.id === state.tempRecipeId).length === 0)

    await test('Checklist generate missing token', 401, 'POST', '/checklists', {
      body: { recipe_id: state.tempRecipeId },
    })
    await test('Checklist generate validation rejects bad recipe id', 400, 'POST', '/checklists', {
      token: state.userToken,
      body: { recipe_id: 'bad' },
    })
    await test('Checklist generate not found', 404, 'POST', '/checklists', {
      token: state.userToken,
      body: { recipe_id: 999999 },
    })
    const checklist = await test('Checklist generate success', 201, 'POST', '/checklists', {
      token: state.userToken,
      body: { recipe_id: state.tempRecipeId },
    }, (res) => Array.isArray(res.data?.checklist?.items) && res.data.checklist.items.length > 0)
    state.tempChecklistItemId = checklist.data?.checklist?.items?.[0]?.id || 0
    await test('Checklist list/profile success', 200, 'GET', '/checklists', {
      token: state.userToken,
    }, (res) => Array.isArray(res.data?.items))
    await test('Checklist list/profile missing token', 401, 'GET', '/checklists')
    await test('Checklist get by recipe success', 200, 'GET', `/checklists/${state.tempRecipeId}`, {
      token: state.userToken,
    })
    await test('Checklist get by recipe missing token', 401, 'GET', `/checklists/${state.tempRecipeId}`)
    await test('Checklist get by recipe owner isolation', 404, 'GET', `/checklists/${state.tempRecipeId}`, {
      token: state.adminToken,
    })
    await test('Checklist toggle missing token', 401, 'PATCH', `/checklist-items/${state.tempChecklistItemId}`)
    await test('Checklist toggle owner isolation', 404, 'PATCH', `/checklist-items/${state.tempChecklistItemId}`, {
      token: state.adminToken,
    })
    await test('Checklist toggle success', 200, 'PATCH', `/checklist-items/${state.tempChecklistItemId}`, {
      token: state.userToken,
    }, (res) => typeof res.data?.is_checked === 'boolean')

    await test('Comment delete success for owner', 200, 'DELETE', `/comments/${state.tempCommentId}`, {
      token: state.userToken,
    })
    await test('Comment delete not found after removal', 404, 'DELETE', `/comments/${state.tempCommentId}`, {
      token: state.userToken,
    })

    await test('Recipe delete missing token', 401, 'DELETE', `/recipes/${state.tempRecipeId}`)
    await test('Recipe delete forbidden for user', 403, 'DELETE', `/recipes/${state.tempRecipeId}`, {
      token: state.userToken,
    })
    await test('Recipe delete admin success', 200, 'DELETE', `/recipes/${state.tempRecipeId}`, {
      token: state.adminToken,
    })
    state.tempRecipeId = 0
    await test('Recipe delete not found', 404, 'DELETE', '/recipes/999999', {
      token: state.adminToken,
    })

    await test('Unknown route returns JSON 404', 404, 'GET', '/does-not-exist')
  } finally {
    await cleanup()
  }

  const passed = state.results.filter((result) => result.pass).length
  const failed = state.results.length - passed
  console.log('')
  console.log(`API smoke test complete: ${passed}/${state.results.length} passed, ${failed} failed.`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  console.error(error)
  await cleanup()
  process.exitCode = 1
})
