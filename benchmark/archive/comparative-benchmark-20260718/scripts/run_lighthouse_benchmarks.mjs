import fs from 'node:fs/promises'
import path from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const root = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(root, 'frontend', 'lighthouse')
const csvPath = path.join(root, 'frontend', 'lighthouse_runs.csv')
const logPath = path.join(root, 'BENCHMARK_EXECUTION_LOG.md')
const resume = process.argv.includes('--resume')

const targets = [
  { version_id: 'frontend_stage1', commit_sha: '6df998aa33f1f28a958610dce97a0b1bc83e0556', page_id: 'home', url: 'http://127.0.0.1:4171/' },
  { version_id: 'frontend_stage2', commit_sha: '35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5', page_id: 'home', url: 'http://127.0.0.1:4172/' },
  { version_id: 'frontend_stage2', commit_sha: '35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5', page_id: 'recipes', url: 'http://127.0.0.1:4172/recipes' },
  { version_id: 'frontend_stage2', commit_sha: '35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5', page_id: 'recipe_detail', url: 'http://127.0.0.1:4172/recipes/1' },
  { version_id: 'final', commit_sha: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', page_id: 'home', url: 'http://127.0.0.1:4174/' },
  { version_id: 'final', commit_sha: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', page_id: 'recipes', url: 'http://127.0.0.1:4174/recipes' },
  { version_id: 'final', commit_sha: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', page_id: 'recipe_detail', url: 'http://127.0.0.1:4174/recipes/1' },
  { version_id: 'final', commit_sha: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f', page_id: 'food_map', url: 'http://127.0.0.1:4174/food-map' },
]

const viewports = [
  { id: 'desktop_1440x900', width: 1440, height: 900, formFactor: 'desktop' },
  { id: 'mobile_390x844', width: 390, height: 844, formFactor: 'mobile' },
]

const headers = [
  'version_id','commit_sha','page_id','viewport_id','viewport_width_px','viewport_height_px','run_index','run_type','evidence_type','status',
  'performance_score_percent','accessibility_score_percent','lcp_ms','cls_score','tbt_ms','speed_index_ms','fcp_ms','total_transferred_bytes',
  'javascript_transferred_bytes','unused_javascript_bytes','dom_node_count','long_task_count','sample_size','report_json','report_html','caveat','error'
]

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function auditNumber(lhr, id) {
  const value = lhr?.audits?.[id]?.numericValue
  return Number.isFinite(value) ? value : ''
}

function resourceBytes(lhr, resourceType) {
  const items = lhr?.audits?.['resource-summary']?.details?.items || []
  const item = items.find((entry) => entry.resourceType === resourceType)
  return Number.isFinite(item?.transferSize) ? item.transferSize : ''
}

async function writeRows(rows) {
  const csv = headers.join(',') + '\r\n' + rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')).join('\r\n') + '\r\n'
  await fs.writeFile(csvPath, csv, 'utf8')
}

const completedKeys = new Set()
if (resume) {
  try {
    const existingLines = (await fs.readFile(csvPath, 'utf8')).split(/\r?\n/u).slice(1).filter(Boolean)
    for (const line of existingLines) {
      const columns = line.split(',')
      completedKeys.add([columns[0], columns[2], columns[3], columns[6]].join('|'))
    }
  } catch { /* fresh run */ }
}

await fs.mkdir(outputDir, { recursive: true })
await fs.mkdir(path.dirname(csvPath), { recursive: true })
await fs.appendFile(logPath, `\n## Lighthouse production-page benchmark\n\nStarted: ${new Date().toISOString()}\n\n`, 'utf8')

const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking'],
})

const rows = []
try {
  for (const target of targets) {
    for (const viewport of viewports) {
      for (let runIndex = 0; runIndex <= 5; runIndex += 1) {
        const runKey = [target.version_id, target.page_id, viewport.id, runIndex].join('|')
        if (completedKeys.has(runKey)) continue
        const runType = runIndex === 0 ? 'warmup' : 'measured_warm'
        const slug = `${target.version_id}__${target.page_id}__${viewport.id}__${runType}_${runIndex}`
        const jsonRelative = `frontend/lighthouse/${slug}.json`
        const htmlRelative = `frontend/lighthouse/${slug}.html`
        const started = new Date().toISOString()
        await fs.appendFile(logPath, `- ${started} | ${slug} | ${target.url}\n`, 'utf8')
        try {
          const result = await lighthouse(target.url, {
            port: chrome.port,
            output: ['json', 'html'],
            logLevel: 'silent',
            disableStorageReset: true,
            formFactor: viewport.formFactor,
            screenEmulation: {
              mobile: viewport.formFactor === 'mobile',
              width: viewport.width,
              height: viewport.height,
              deviceScaleFactor: 1,
              disabled: false,
            },
            throttlingMethod: 'provided',
            maxWaitForLoad: 45000,
          })
          const reports = Array.isArray(result.report) ? result.report : [result.report, '']
          await fs.writeFile(path.join(root, jsonRelative), reports[0], 'utf8')
          await fs.writeFile(path.join(root, htmlRelative), reports[1], 'utf8')
          const lhr = result.lhr
          const unusedItems = lhr?.audits?.['unused-javascript']?.details?.items || []
          const unusedBytes = unusedItems.reduce((sum, item) => sum + (Number(item.wastedBytes) || 0), 0)
          const longTasks = lhr?.audits?.['long-tasks']?.details?.items || []
          rows.push({
            version_id: target.version_id,
            commit_sha: target.commit_sha,
            page_id: target.page_id,
            viewport_id: viewport.id,
            viewport_width_px: viewport.width,
            viewport_height_px: viewport.height,
            run_index: runIndex,
            run_type: runType,
            evidence_type: 'lighthouse_local_production_build',
            status: 'success',
            performance_score_percent: Math.round((lhr.categories.performance.score || 0) * 100),
            accessibility_score_percent: Math.round((lhr.categories.accessibility.score || 0) * 100),
            lcp_ms: auditNumber(lhr, 'largest-contentful-paint'),
            cls_score: auditNumber(lhr, 'cumulative-layout-shift'),
            tbt_ms: auditNumber(lhr, 'total-blocking-time'),
            speed_index_ms: auditNumber(lhr, 'speed-index'),
            fcp_ms: auditNumber(lhr, 'first-contentful-paint'),
            total_transferred_bytes: auditNumber(lhr, 'total-byte-weight'),
            javascript_transferred_bytes: resourceBytes(lhr, 'script'),
            unused_javascript_bytes: unusedBytes,
            dom_node_count: auditNumber(lhr, 'dom-size'),
            long_task_count: longTasks.length,
            sample_size: runIndex === 0 ? 1 : 5,
            report_json: jsonRelative,
            report_html: htmlRelative,
            caveat: 'Local loopback production preview; Lighthouse provided throttling; warm-up excluded from summaries; storage reset disabled.',
            error: '',
          })
          await fs.appendFile(logPath, `  - success; performance=${rows.at(-1).performance_score_percent}; lcp_ms=${rows.at(-1).lcp_ms}\n`, 'utf8')
        } catch (error) {
          rows.push({
            version_id: target.version_id, commit_sha: target.commit_sha, page_id: target.page_id,
            viewport_id: viewport.id, viewport_width_px: viewport.width, viewport_height_px: viewport.height,
            run_index: runIndex, run_type: runType, evidence_type: 'lighthouse_local_production_build', status: 'failure',
            sample_size: runIndex === 0 ? 1 : 5,
            caveat: 'Failure retained; no result was deleted.', error: String(error?.message || error).slice(0, 500),
          })
          await fs.appendFile(logPath, `  - failure; ${String(error?.message || error).replaceAll(/\s+/gu, ' ').slice(0, 500)}\n`, 'utf8')
        }
        if (resume) {
          const latest = rows.at(-1)
          await fs.appendFile(csvPath, headers.map((header) => csvEscape(latest[header])).join(',') + '\r\n', 'utf8')
        } else {
          await writeRows(rows)
        }
        console.log(`${rows.length}/${targets.length * viewports.length * 6} ${slug} ${rows.at(-1).status}`)
      }
    }
  }
} finally {
  await chrome.kill()
}

await fs.appendFile(logPath, `\nLighthouse benchmark completed: ${rows.length} retained runs.\n`, 'utf8')
