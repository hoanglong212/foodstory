import { WebSocket } from 'ws'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api'
const WS_URL = process.env.WS_URL || 'ws://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@foodstory.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!'
const USER_EMAIL = process.env.USER_EMAIL || 'long@foodstory.test'
const USER_PASSWORD = process.env.USER_PASSWORD || 'User123!'
const EVENT_TIMEOUT_MS = 5_000

const state = {
  adminToken: '',
  userToken: '',
  recipeId: 0,
  commentId: 0,
  sockets: [],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(method, path, { token = '', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data }
}

async function login(email, password) {
  const response = await request('POST', '/auth/login', { body: { email, password } })
  assert(response.status === 200 && response.data?.token, `Login failed for ${email}.`)
  return response.data.token
}

function connectClient(token, recipeId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL)
    const events = []
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('WebSocket connection timed out.'))
    }, EVENT_TIMEOUT_MS)

    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString())
      events.push(event)
    })
    socket.once('error', reject)
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', recipeId, token }))
      setTimeout(() => {
        clearTimeout(timer)
        resolve({ socket, events })
      }, 100)
    })
  })
}

function waitForEvent(client, type, predicate = () => true) {
  const existing = client.events.find((event) => event.type === type && predicate(event))
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.socket.off('message', onMessage)
      reject(new Error(`Timed out waiting for ${type}.`))
    }, EVENT_TIMEOUT_MS)
    function onMessage(raw) {
      const event = JSON.parse(raw.toString())
      if (event.type === type && predicate(event)) {
        clearTimeout(timer)
        client.socket.off('message', onMessage)
        resolve(event)
      }
    }
    client.socket.on('message', onMessage)
  })
}

async function verifyEventOnce(clients, type, action, predicate = () => true) {
  const before = clients.map((client) => client.events.length)
  const waits = clients.map((client) => waitForEvent(client, type, predicate))
  const actionResponse = await action()
  const events = await Promise.all(waits)
  await new Promise((resolve) => setTimeout(resolve, 100))
  clients.forEach((client, index) => {
    const matching = client.events.slice(before[index]).filter((event) => event.type === type && predicate(event))
    assert(matching.length === 1, `${type} was delivered ${matching.length} times to client ${index + 1}.`)
  })
  return { actionResponse, events }
}

async function cleanup() {
  for (const socket of state.sockets) socket.close()
  if (state.recipeId && state.adminToken) {
    await request('DELETE', `/recipes/${state.recipeId}`, { token: state.adminToken })
  }
}

async function main() {
  try {
    state.adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
    state.userToken = await login(USER_EMAIL, USER_PASSWORD)

    const meta = await request('GET', '/recipes/meta')
    assert(meta.status === 200 && meta.data?.categories?.[0]?.id, 'Recipe metadata is unavailable.')
    const created = await request('POST', '/recipes', {
      token: state.adminToken,
      body: {
        title: `Realtime Acceptance Recipe ${Date.now()}`,
        category_id: meta.data.categories[0].id,
        image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=70',
        description: 'Temporary recipe for two-client WebSocket verification.',
        instructions: 'Create, edit, rate, and delete temporary acceptance data.',
        calories: 100,
        protein: 5,
        carbs: 15,
        fat: 2,
        ingredients: [{ ingredient_name: 'Acceptance ingredient', quantity: '1 item' }],
        tags: meta.data.tags?.[0]?.id ? [meta.data.tags[0].id] : [],
      },
    })
    assert(created.status === 201 && created.data?.recipe?.id, 'Temporary recipe creation failed.')
    state.recipeId = created.data.recipe.id

    const userA = await connectClient(state.userToken, state.recipeId)
    const userB = await connectClient(state.adminToken, state.recipeId)
    state.sockets.push(userA.socket, userB.socket)
    const clients = [userA, userB]

    const createdComment = await verifyEventOnce(clients, 'new_comment', () =>
      request('POST', `/recipes/${state.recipeId}/comments`, {
        token: state.userToken,
        body: { content: 'Realtime acceptance comment.' },
      }),
    )
    assert(createdComment.actionResponse.status === 201, 'Comment creation failed.')
    state.commentId = createdComment.actionResponse.data?.comment?.id
    const persistedAfterCreate = await request('GET', `/recipes/${state.recipeId}`)
    assert(
      persistedAfterCreate.data?.recipe?.comments?.some((comment) => comment.id === state.commentId),
      'Comment broadcast occurred without observable database persistence.',
    )
    console.log('PASS two clients received one persisted new_comment event each')

    const forbiddenEdit = await request('PUT', `/comments/${state.commentId}`, {
      token: state.adminToken,
      body: { content: 'Ownership violation.' },
    })
    assert(forbiddenEdit.status === 403, 'A different user was allowed to edit the comment.')

    const edited = await verifyEventOnce(
      clients,
      'comment_updated',
      () => request('PUT', `/comments/${state.commentId}`, {
        token: state.userToken,
        body: { content: 'Realtime acceptance comment edited.' },
      }),
      (event) => Number(event.comment?.id) === Number(state.commentId),
    )
    assert(edited.actionResponse.status === 200, 'Comment edit failed.')
    console.log('PASS two clients received one comment_updated event each and ownership is enforced')

    const rating = await verifyEventOnce(
      clients,
      'rating_updated',
      () => request('POST', `/recipes/${state.recipeId}/rating`, {
        token: state.userToken,
        body: { rating_value: 4 },
      }),
      (event) => Number(event.recipeId) === Number(state.recipeId),
    )
    assert(rating.actionResponse.status === 200, 'Rating update failed.')
    const persistedAfterRating = await request('GET', `/recipes/${state.recipeId}`)
    assert(persistedAfterRating.data?.recipe?.total_ratings === 1, 'Rating was not persisted uniquely.')
    console.log('PASS two clients received one persisted rating_updated event each')

    const forbiddenDelete = await request('DELETE', `/comments/${state.commentId}`, {
      token: state.adminToken,
    })
    assert(forbiddenDelete.status === 403, 'A different user was allowed to delete the comment.')

    const deleted = await verifyEventOnce(
      clients,
      'comment_deleted',
      () => request('DELETE', `/comments/${state.commentId}`, { token: state.userToken }),
      (event) => Number(event.commentId) === Number(state.commentId),
    )
    assert(deleted.actionResponse.status === 200, 'Comment deletion failed.')
    const persistedAfterDelete = await request('GET', `/recipes/${state.recipeId}`)
    assert(
      !persistedAfterDelete.data?.recipe?.comments?.some((comment) => comment.id === state.commentId),
      'Deleted comment remains in the database response.',
    )
    console.log('PASS two clients received one persisted comment_deleted event each and ownership is enforced')
    console.log('Realtime WebSocket acceptance complete: 4/4 checks passed, 0 failed.')
  } finally {
    await cleanup()
  }
}

main().catch((error) => {
  console.error(`Realtime WebSocket acceptance failed: ${error.message}`)
  process.exitCode = 1
})
