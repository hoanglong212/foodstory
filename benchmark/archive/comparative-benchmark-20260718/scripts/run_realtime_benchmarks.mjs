import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '..')
const rawPath = path.join(root, 'realtime', 'realtime_events.csv')
const summaryPath = path.join(root, 'realtime', 'realtime_summary.csv')
const logPath = path.join(root, 'BENCHMARK_EXECUTION_LOG.md')
const apiBase = 'http://127.0.0.1:3000/api'
const wsUrl = 'ws://127.0.0.1:3000'

function loadEnv(text) {
  const values = {}
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let value = line.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values[line.slice(0, i).trim()] = value
  }
  return values
}

const env = loadEnv(await fs.readFile('C:\\COS30043\\foodstory\\backend\\.env', 'utf8'))

async function request(method, route, { token = '', body } = {}) {
  const sent = performance.now()
  const response = await fetch(apiBase + route, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const completed = performance.now()
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data, sent, completed }
}

async function login(email, password) {
  const response = await request('POST', '/auth/login', { body: { email, password } })
  if (response.status !== 200 || !response.data?.token) throw new Error(`Benchmark login failed with HTTP ${response.status}`)
  return response.data.token
}

function connect(token, recipeId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const events = []
    const timer = setTimeout(() => reject(new Error('WebSocket subscription timeout')), 5000)
    socket.addEventListener('message', (message) => {
      const event = JSON.parse(String(message.data))
      events.push({ event, received: performance.now() })
    })
    socket.addEventListener('error', () => reject(new Error('WebSocket connection error')), { once: true })
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', recipeId, token }))
      setTimeout(() => { clearTimeout(timer); resolve({ socket, events }) }, 120)
    }, { once: true })
  })
}

function waitForEvent(client, type, predicate, startIndex = 0) {
  const existing = client.events.slice(startIndex).find((item) => item.event.type === type && predicate(item.event))
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)
    const handler = (message) => {
      const event = JSON.parse(String(message.data))
      if (event.type === type && predicate(event)) {
        clearTimeout(timeout)
        client.socket.removeEventListener('message', handler)
        resolve({ event, received: performance.now() })
      }
    }
    client.socket.addEventListener('message', handler)
  })
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function percentile(sorted, p) {
  if (!sorted.length) return ''
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

await fs.mkdir(path.dirname(rawPath), { recursive: true })
await fs.appendFile(logPath, `\n## Real-time WebSocket benchmark\n\nStarted: ${new Date().toISOString()}\n\n`, 'utf8')
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.USER_EMAIL || !env.USER_PASSWORD) {
  throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, and USER_PASSWORD must be supplied for the controlled fixture')
}
const adminToken = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD)
const userToken = await login(env.USER_EMAIL, env.USER_PASSWORD)
const rows = []

for (const viewerCount of [1, 5, 10]) {
  let recipeId = 0
  const clients = []
  try {
    const meta = await request('GET', '/recipes/meta')
    const createdRecipe = await request('POST', '/recipes', {
      token: adminToken,
      body: {
        title: `Comparative Benchmark ${viewerCount} viewers ${Date.now()}`,
        category_id: meta.data?.categories?.[0]?.id,
        image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=70',
        description: 'Temporary controlled real-time benchmark fixture.',
        instructions: 'Created and deleted automatically by comparative benchmark.',
        calories: 100, protein: 5, carbs: 15, fat: 2,
        ingredients: [{ ingredient_name: 'Benchmark ingredient', quantity: '1 item' }],
        tags: meta.data?.tags?.[0]?.id ? [meta.data.tags[0].id] : [],
      },
    })
    recipeId = createdRecipe.data?.recipe?.id
    if (!recipeId) throw new Error(`Temporary recipe creation failed with HTTP ${createdRecipe.status}`)
    for (let i = 0; i < viewerCount; i += 1) clients.push(await connect(i % 2 === 0 ? userToken : adminToken, recipeId))

    for (let iteration = 1; iteration <= 10; iteration += 1) {
      const operations = []
      const createResponse = await runOperation('comment_create', 'new_comment', () => request('POST', `/recipes/${recipeId}/comments`, { token: userToken, body: { content: `Benchmark comment ${viewerCount}-${iteration}` } }), () => true)
      const commentId = createResponse?.data?.comment?.id
      operations.push(createResponse)
      if (!commentId) throw new Error('Comment creation did not return an id')
      operations.push(await runOperation('comment_edit', 'comment_updated', () => request('PUT', `/comments/${commentId}`, { token: userToken, body: { content: `Benchmark comment edited ${viewerCount}-${iteration}` } }), (event) => Number(event.comment?.id) === Number(commentId)))
      operations.push(await runOperation('rating_update', 'rating_updated', () => request('POST', `/recipes/${recipeId}/rating`, { token: userToken, body: { rating_value: (iteration % 5) + 1 } }), (event) => Number(event.recipeId) === Number(recipeId)))
      operations.push(await runOperation('comment_delete', 'comment_deleted', () => request('DELETE', `/comments/${commentId}`, { token: userToken }), (event) => Number(event.commentId) === Number(commentId)))

      async function runOperation(operation, eventType, action, predicate) {
        const beforeCounts = clients.map((client) => client.events.length)
        const waits = clients.map((client, index) => waitForEvent(client, eventType, predicate, beforeCounts[index]))
        const response = await action()
        const received = await Promise.all(waits)
        await new Promise((resolve) => setTimeout(resolve, 30))
        clients.forEach((client, viewerIndex) => {
          const matching = client.events.slice(beforeCounts[viewerIndex]).filter((item) => item.event.type === eventType && predicate(item.event))
          const item = received[viewerIndex]
          rows.push({
            version_id: 'realtime_final', commit_sha: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', viewer_count: viewerCount,
            iteration, viewer_index: viewerIndex + 1, operation, event_type: eventType, run_type: 'measured_warm', evidence_type: 'node_websocket_client_timing',
            request_sent_ms_monotonic: response.sent.toFixed(3), database_operation_completed_ms_monotonic: response.completed.toFixed(3), websocket_broadcast_ms_monotonic: '',
            second_client_received_ms_monotonic: item ? item.received.toFixed(3) : '', second_client_store_updated_ms_monotonic: '', ui_rendered_ms_monotonic: '',
            api_commit_latency_ms: (response.completed - response.sent).toFixed(3), commit_to_broadcast_latency_ms: '', broadcast_to_receive_latency_ms: '', receive_to_render_latency_ms: '',
            total_event_to_receive_ms: item ? (item.received - response.sent).toFixed(3) : '', total_event_to_render_ms: '', response_status: response.status,
            lost_event: item ? 0 : 1, duplicate_event: Math.max(0, matching.length - 1), out_of_order_event: item && item.received < response.sent ? 1 : 0,
            sample_size: 10, caveat: 'Database completion is approximated by HTTP response completion. Server broadcast timestamp, client-store update, and browser render were not instrumented and remain blank.'
          })
        })
        return response
      }
    }
    await fs.appendFile(logPath, `- final WebSocket: ${viewerCount} viewer(s), 10 iterations x 4 event types, all individual deliveries retained\n`, 'utf8')
  } finally {
    for (const client of clients) client.socket.close()
    if (recipeId) await request('DELETE', `/recipes/${recipeId}`, { token: adminToken }).catch(() => {})
  }
}

const rawHeaders = Object.keys(rows[0])
await fs.writeFile(rawPath, rawHeaders.join(',') + '\r\n' + rows.map((row) => rawHeaders.map((header) => csvEscape(row[header])).join(',')).join('\r\n') + '\r\n', 'utf8')

const summary = []
for (const viewerCount of [1, 5, 10]) for (const operation of ['comment_create','comment_edit','rating_update','comment_delete']) {
  const group = rows.filter((row) => row.viewer_count === viewerCount && row.operation === operation)
  const latencies = group.map((row) => Number(row.total_event_to_receive_ms)).filter(Number.isFinite).sort((a,b)=>a-b)
  summary.push({ version_id:'realtime_final',commit_sha:'c1007231c2bf1dc77091bb381df5462de3dd6b6f',viewer_count:viewerCount,operation,latency_metric:'request_to_receive',latency_unit:'ms',run_type:'measured_warm',evidence_type:'node_websocket_client_timing',sample_size:latencies.length,
    mean_ms:latencies.length?(latencies.reduce((a,b)=>a+b,0)/latencies.length).toFixed(3):'',median_ms:latencies.length?percentile(latencies,50).toFixed(3):'',min_ms:latencies.length?latencies[0].toFixed(3):'',max_ms:latencies.length?latencies.at(-1).toFixed(3):'',p50_ms:latencies.length?percentile(latencies,50).toFixed(3):'',p95_ms:latencies.length?percentile(latencies,95).toFixed(3):'',lost_events:group.reduce((a,r)=>a+Number(r.lost_event),0),duplicate_events:group.reduce((a,r)=>a+Number(r.duplicate_event),0),out_of_order_events:group.reduce((a,r)=>a+Number(r.out_of_order_event),0),caveat:'Request-to-receive only; store/render and internal broadcast timestamps unavailable.' })
}
summary.push({version_id:'realtime_pre_ws',commit_sha:'54779d5d7aa87eb65a2e6b66cc4a1b20711d8630',viewer_count:0,operation:'all',latency_metric:'event_to_render',latency_unit:'ms',run_type:'unavailable',evidence_type:'feature_unavailable',sample_size:0,caveat:'WebSocket server does not exist in this snapshot; latency is unavailable rather than zero.'})
const summaryHeaders = [...new Set(summary.flatMap((row)=>Object.keys(row)))]
await fs.writeFile(summaryPath, summaryHeaders.join(',')+'\r\n'+summary.map((row)=>summaryHeaders.map((h)=>csvEscape(row[h])).join(',')).join('\r\n')+'\r\n','utf8')
console.log(JSON.stringify({event_delivery_rows:rows.length,summary_rows:summary.length},null,2))
