import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '..')
const rawPath = path.join(root, 'api', 'api_runs.csv')
const summaryPath = path.join(root, 'api', 'api_summary.csv')
const logPath = path.join(root, 'BENCHMARK_EXECUTION_LOG.md')

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
const credentials = { email: env.USER_EMAIL || '', password: env.USER_PASSWORD || '' }
if (!credentials.email || !credentials.password) {
  throw new Error('USER_EMAIL and USER_PASSWORD must be supplied for the controlled login fixture')
}

const versions = [
  { id: 'realtime_pre_ws', commit: '54779d5d7aa87eb65a2e6b66cc4a1b20711d8630', base: 'http://127.0.0.1:3101/api' },
  { id: 'final', commit: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', base: 'http://127.0.0.1:3000/api' },
]

const common = [
  { id: 'authentication_login', method: 'POST', path: '/auth/login', body: () => credentials },
  { id: 'recipe_list', method: 'GET', path: '/recipes' },
  { id: 'recipe_detail', method: 'GET', path: '/recipes/1' },
  { id: 'checklist_retrieval', method: 'GET', path: '/checklists', auth: true },
]

const finalOnly = [
  { id: 'food_map_spots', method: 'GET', path: '/food-spots/public' },
  { id: 'restaurants', method: 'GET', path: '/restaurants' },
]

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function percentile(sorted, p) {
  if (!sorted.length) return ''
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

async function request(version, endpoint, token) {
  const headers = { Accept: 'application/json' }
  let body
  if (endpoint.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(endpoint.body())
  }
  if (endpoint.auth && token) headers.Authorization = `Bearer ${token}`
  const start = performance.now()
  try {
    const response = await fetch(version.base + endpoint.path, { method: endpoint.method, headers, body })
    const bytes = new Uint8Array(await response.arrayBuffer())
    let parsed = null
    if (endpoint.id === 'authentication_login' && response.ok) {
      try { parsed = JSON.parse(new TextDecoder().decode(bytes)) } catch { /* retained as successful opaque response */ }
    }
    return { status: response.status, bytes: bytes.byteLength, latency: performance.now() - start, error: '', token: parsed?.token || parsed?.data?.token || null }
  } catch (error) {
    return { status: 0, bytes: 0, latency: performance.now() - start, error: String(error?.message || error).slice(0, 300), token: null }
  }
}

await fs.mkdir(path.dirname(rawPath), { recursive: true })
await fs.appendFile(logPath, `\n## Sequential API latency benchmark\n\nStarted: ${new Date().toISOString()}\n\n`, 'utf8')
const rows = []

for (const version of versions) {
  let token = null
  const endpoints = [...common, ...(version.id === 'final' ? finalOnly : [])]
  for (const endpoint of endpoints) {
    for (let runIndex = 0; runIndex <= 30; runIndex += 1) {
      const result = await request(version, endpoint, token)
      if (endpoint.id === 'authentication_login' && result.token) token = result.token
      rows.push({
        version_id: version.id,
        commit_sha: version.commit,
        endpoint_id: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        concurrency_level: 1,
        run_index: runIndex,
        run_type: runIndex === 0 ? 'warmup' : 'measured_warm',
        evidence_type: 'local_application_api_latency',
        response_status: result.status,
        response_size_bytes: result.bytes,
        latency_ms: result.latency.toFixed(3),
        provider_involvement: 'none',
        sample_size: runIndex === 0 ? 1 : 30,
        caveat: 'Sequential loopback request against the same existing MySQL fixture; warm-up excluded; no mutating endpoints.',
        error: result.error,
      })
    }
    await fs.appendFile(logPath, `- ${version.id} ${endpoint.method} ${endpoint.path}: 1 warm-up + 30 retained measured requests\n`, 'utf8')
  }
}

const rawHeaders = Object.keys(rows[0])
await fs.writeFile(rawPath, rawHeaders.join(',') + '\r\n' + rows.map((row) => rawHeaders.map((header) => csvEscape(row[header])).join(',')).join('\r\n') + '\r\n', 'utf8')

const summaries = []
for (const version of versions) {
  const ids = new Set(rows.filter((row) => row.version_id === version.id).map((row) => row.endpoint_id))
  for (const endpointId of ids) {
    const measured = rows.filter((row) => row.version_id === version.id && row.endpoint_id === endpointId && row.run_type === 'measured_warm')
    const latencies = measured.map((row) => Number(row.latency_ms)).sort((a, b) => a - b)
    const errors = measured.filter((row) => Number(row.response_status) < 200 || Number(row.response_status) >= 400).length
    summaries.push({
      version_id: version.id, commit_sha: version.commit, endpoint_id: endpointId, latency_unit: 'ms', response_size_unit: 'bytes',
      run_type: 'measured_warm', evidence_type: 'local_application_api_latency', sample_size: measured.length,
      mean_ms: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3), median_ms: percentile(latencies, 50).toFixed(3),
      min_ms: latencies[0].toFixed(3), max_ms: latencies.at(-1).toFixed(3), p50_ms: percentile(latencies, 50).toFixed(3), p95_ms: percentile(latencies, 95).toFixed(3),
      error_rate_percent: ((errors / measured.length) * 100).toFixed(2), provider_involvement: 'none',
      caveat: 'Same existing MySQL fixture; sequential concurrency=1; no external provider latency included.'
    })
  }
}

for (const version of versions) {
  for (const endpointId of ['comment_create','rating_update','favourite_toggle']) summaries.push({
    version_id: version.id, commit_sha: version.commit, endpoint_id: endpointId, latency_unit: 'ms', response_size_unit: 'bytes',
    run_type: 'unavailable', evidence_type: 'compatibility_limitation', sample_size: 0, mean_ms: '', median_ms: '', min_ms: '', max_ms: '', p50_ms: '', p95_ms: '', error_rate_percent: '', provider_involvement: 'none',
    caveat: 'Not executed because a transactionally isolated mutable benchmark fixture was not available; existing user data was not modified.'
  })
}
summaries.push({ version_id:'realtime_pre_ws',commit_sha:versions[0].commit,endpoint_id:'food_map_spots',latency_unit:'ms',response_size_unit:'bytes',run_type:'unavailable',evidence_type:'feature_unavailable',sample_size:0,caveat:'Food Map endpoint does not exist at this snapshot.' })
summaries.push({ version_id:'realtime_pre_ws',commit_sha:versions[0].commit,endpoint_id:'restaurants',latency_unit:'ms',response_size_unit:'bytes',run_type:'unavailable',evidence_type:'feature_unavailable',sample_size:0,caveat:'Restaurant endpoint does not exist at this snapshot.' })
for (const version of versions) summaries.push({ version_id:version.id,commit_sha:version.commit,endpoint_id:'news_external_proxy',latency_unit:'ms',response_size_unit:'bytes',run_type:'unavailable',evidence_type:'external_provider_excluded',sample_size:0,provider_involvement:'Guardian network API',caveat:'Excluded from controlled application-only latency to avoid provider quota use and uncontrolled network variance.' })

const summaryHeaders = [...new Set(summaries.flatMap((row) => Object.keys(row)))]
await fs.writeFile(summaryPath, summaryHeaders.join(',') + '\r\n' + summaries.map((row) => summaryHeaders.map((header) => csvEscape(row[header])).join(',')).join('\r\n') + '\r\n', 'utf8')
console.log(JSON.stringify({ raw_rows: rows.length, summary_rows: summaries.length }, null, 2))
