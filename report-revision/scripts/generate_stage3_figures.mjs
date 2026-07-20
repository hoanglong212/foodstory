import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('../../backend/node_modules/sharp')
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(scriptDir, '..', 'figures')

const C = {
  ink: '#262321',
  charcoal: '#34302d',
  muted: '#71675f',
  orange: '#e8752b',
  orangeDark: '#b84b16',
  orangeSoft: '#fff0e5',
  cream: '#fffaf5',
  white: '#ffffff',
  line: '#d9cec4',
  green: '#2f7d62',
  greenSoft: '#e9f5f0',
  blue: '#3f6f8f',
  blueSoft: '#eaf2f7',
  red: '#a4483d',
  redSoft: '#f8ebe9',
}

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const svgOpen = (w, h, title, desc) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#2b211b" flood-opacity="0.12"/></filter><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="${C.orangeDark}"/></marker></defs><rect width="${w}" height="${h}" fill="${C.cream}"/>`
const header = (title, subtitle, w) => `<rect x="0" y="0" width="${w}" height="118" fill="${C.charcoal}"/><rect x="0" y="112" width="${w}" height="6" fill="${C.orange}"/><text x="64" y="54" fill="${C.white}" font-family="Arial, sans-serif" font-size="32" font-weight="700">${esc(title)}</text><text x="64" y="88" fill="#e8ddd5" font-family="Arial, sans-serif" font-size="17">${esc(subtitle)}</text>`
const rect = (x, y, w, h, fill = C.white, stroke = C.line, radius = 18, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${extra}/>`
const line = (x1, y1, x2, y2, color = C.orangeDark, width = 3, dashed = false, arrow = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="8 7"' : ''} ${arrow ? 'marker-end="url(#arrow)"' : ''}/>`
const text = (x, y, value, size = 18, color = C.ink, weight = 400, anchor = 'start') => `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`

function wrapped(x, y, value, maxChars, lineHeight = 22, size = 16, color = C.ink, weight = 400, anchor = 'start') {
  const words = String(value).split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((entry, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${esc(entry)}</tspan>`).join('')}</text>`
}

function pill(x, y, label, fill = C.orangeSoft, color = C.orangeDark, width = 118) {
  return `${rect(x, y, width, 30, fill, fill, 15)}${text(x + width / 2, y + 21, label, 13, color, 700, 'middle')}`
}

function timelineFigure() {
  const w = 1800, h = 1080
  const stages = [
    ['1', 'Single-image OCR', 'One still misses transient video overlays.', 'Accept a bounded image and extract visible text.', 'Established the first evidence path.', 'No temporal coverage; OCR text is not a place.'],
    ['2', 'Early video sampling', 'Useful text may appear for only a few frames.', 'Sample selected frames from public video.', 'Expanded evidence beyond one still.', 'Frame selection and latency remain coupled.'],
    ['3', 'Track 1 / Track 2', 'Strong metadata and uncertain media need different cost.', 'Route deterministic cases fast; escalate uncertain cases.', 'Made safety and compute paths explicit.', 'Routing is not full-pipeline accuracy.'],
    ['4', 'Candidate-first', 'Plausible OCR can be promoted too aggressively.', 'Publish review-only candidates with no map coordinates.', 'Preserved evidence without inventing a location.', 'Human confirmation is still required.'],
    ['5', 'Dish-first', 'Many videos identify food better than filming location.', 'Identify dishes, then search places serving them.', 'Creates useful discovery without weakening place safety.', 'Serving places are not filming locations.'],
  ]
  let s = svgOpen(w, h, 'Vision Auto evolution timeline', 'Five stages from single-image OCR to dish-first discovery with problem, change, outcome, and limitation.') + header('Vision Auto evolution', 'From image OCR to safe, dish-first food discovery', w)
  s += line(140, 205, 1660, 205, C.orangeDark, 5, false, true)
  stages.forEach((stage, i) => {
    const x = 52 + i * 350
    s += `<circle cx="${x + 154}" cy="205" r="28" fill="${C.orange}" stroke="${C.white}" stroke-width="6"/>${text(x + 154, 213, stage[0], 20, C.white, 700, 'middle')}`
    s += rect(x, 258, 308, 690, C.white, C.line, 20, 'filter="url(#shadow)"')
    s += pill(x + 22, 282, `STAGE ${stage[0]}`, C.orangeSoft, C.orangeDark, 90)
    s += wrapped(x + 22, 344, stage[1], 24, 29, 23, C.ink, 700)
    const rows = [['PROBLEM', stage[2], C.redSoft, C.red], ['CHANGE', stage[3], C.blueSoft, C.blue], ['OUTCOME', stage[4], C.greenSoft, C.green], ['LIMITATION', stage[5], '#f4f0ec', C.muted]]
    let y = 418
    for (const [label, body, fill, color] of rows) {
      s += rect(x + 20, y, 268, 116, fill, fill, 12)
      s += text(x + 34, y + 27, label, 12, color, 700)
      s += wrapped(x + 34, y + 52, body, 30, 19, 14, C.ink, 400)
      y += 132
    }
  })
  s += text(900, 1017, 'Safety boundary: evidence can remain useful without becoming a resolved map location.', 18, C.orangeDark, 700, 'middle')
  return s + '</svg>'
}

function stateMachineFigure() {
  const w = 1800, h = 1120
  const node = (x, y, width, label, fill = C.white, stroke = C.orange) => `${rect(x, y, width, 74, fill, stroke, 18, 'filter="url(#shadow)"')}${text(x + width / 2, y + 46, label, 19, C.ink, 700, 'middle')}`
  let s = svgOpen(w, h, 'useVisionAuto state machine', 'Reactive state machine from idle through queued and analysis stages to completed, review, not found, timeout, or cancelled.') + header('useVisionAuto state machine', 'Vue-owned reactive lifecycle; backend stages are reduced to safe UI states', w)
  const xs = [70, 340, 610, 880, 1150]
  const labels = ['Idle', 'Queued / starting', 'Fast analysis', 'Deep analysis', 'Resolving']
  labels.forEach((label, i) => { s += node(xs[i], 205, 210, label, i === 0 ? C.orangeSoft : C.white) })
  for (let i = 0; i < xs.length - 1; i++) s += line(xs[i] + 210, 242, xs[i + 1] - 10, 242, C.orangeDark, 3, false, true)
  s += text(445, 178, 'create job + poll', 14, C.muted, 600, 'middle')
  const terminals = [
    [90, 490, 'Completed', C.greenSoft, C.green, 'Resolver-backed place or dish places'],
    [360, 490, 'Review', C.blueSoft, C.blue, 'Candidate remains review-only'],
    [630, 490, 'Not found', '#f4f0ec', C.muted, 'Intentional safe terminal outcome'],
    [900, 490, 'Timeout', C.redSoft, C.red, 'Adapted to safe not-found reason'],
    [1170, 490, 'Cancelled', C.orangeSoft, C.orangeDark, 'Run invalidated; UI returns idle'],
  ]
  terminals.forEach(([x, y, label, fill, stroke, note]) => {
    s += node(x, y, 220, label, fill, stroke)
    s += wrapped(x + 110, y + 104, note, 27, 20, 14, C.muted, 400, 'middle')
    s += line(1255, 279, x + 110, y - 10, stroke, 2.5, false, true)
  })
  s += rect(120, 755, 1560, 190, C.charcoal, C.charcoal, 20)
  s += text(160, 800, 'Lifecycle controls', 22, C.white, 700)
  const controls = [
    ['Cancel', 'invalidate run -> abort HTTP -> clear poll + elapsed timers -> DELETE backend job'],
    ['Retry', 'start a fresh controller and monotonically increasing run identity'],
    ['Reset', 'cancel, clear URL/result/errors, return input mode and elapsed time to defaults'],
    ['Unmount', 'onBeforeUnmount(dispose); FoodMapView separately tears down Leaflet'],
  ]
  controls.forEach((item, i) => {
    const x = 160 + i * 375
    s += pill(x, 830, item[0], '#4a4541', C.white, 100)
    s += wrapped(x, 884, item[1], 39, 19, 14, '#eee4dc', 400)
  })
  s += line(1280, 564, 1280, 742, C.orangeDark, 3, true, true)
  s += line(1010, 564, 1010, 742, C.orangeDark, 3, true, true)
  s += line(200, 755, 170, 640, C.orangeDark, 3, true, true)
  s += text(900, 1026, 'A terminal response mutates Vue state only if its run ID is still current.', 18, C.orangeDark, 700, 'middle')
  return s + '</svg>'
}

function sequenceFigure() {
  const w = 2000, h = 1260
  const actors = ['FoodMapView', 'useVisionAuto', 'Job API', 'Coordinator', 'Worker', 'UI adapter', 'Reactive map UI']
  const xs = actors.map((_, i) => 120 + i * 285)
  let s = svgOpen(w, h, 'Stage 3 sequence diagram', 'Sequence from FoodMapView through the composable, asynchronous backend job, adapter, and reactive map UI with cancellation and stale-response paths.') + header('Stage 3 sequence', 'Long-running job coordination and safe Leaflet synchronisation', w)
  actors.forEach((actor, i) => {
    s += rect(xs[i] - 92, 158, 184, 58, i === 1 ? C.orangeSoft : C.white, i === 1 ? C.orange : C.line, 14)
    s += text(xs[i], 194, actor, 15, C.ink, 700, 'middle')
    s += line(xs[i], 216, xs[i], 1160, '#b9aea5', 2, true, false)
  })
  const msg = (from, to, y, label, dashed = false, color = C.orangeDark) => {
    const leftToRight = to > from
    return `${line(xs[from], y, xs[to] + (leftToRight ? -10 : 10), y, color, 2.5, dashed, true)}${wrapped((xs[from] + xs[to]) / 2, y - 12, label, 42, 18, 14, color, 600, 'middle')}`
  }
  s += msg(0, 1, 265, 'submit(url)')
  s += msg(1, 2, 330, 'POST /jobs with AbortSignal')
  s += msg(2, 3, 395, 'submit canonical source; return jobId')
  s += msg(3, 4, 460, 'start worker with deadline + heartbeat')
  s += msg(4, 3, 525, 'stage: metadata / deep analysis / resolving', true, C.blue)
  s += msg(1, 2, 590, 'GET /jobs/:id every 1.5 s', true)
  s += msg(2, 1, 655, 'bounded stage/status response', true, C.blue)
  s += msg(4, 3, 720, 'sanitised terminal result', false, C.green)
  s += msg(3, 2, 785, 'completed / not_found / failed / cancelled / timed_out', false, C.green)
  s += msg(2, 1, 850, 'public result')
  s += msg(1, 5, 915, 'adaptVisionAutoResponse(result)')
  s += msg(5, 1, 970, 'safe matched / review / not_found state', true, C.green)
  s += msg(1, 0, 1025, 'reactive refs update')
  s += msg(0, 6, 1080, 'focus existing marker or finite resolver coordinates')
  s += rect(70, 1125, 1860, 86, C.charcoal, C.charcoal, 16)
  s += text(105, 1158, 'ALTERNATES', 13, C.orange, 700)
  s += wrapped(105, 1185, 'Cancel/unmount: invalidate run -> AbortController -> clear timers -> DELETE backend job. Stale response: run guard rejects mutation; a late-created stale job is cancelled.', 160, 20, 15, C.white, 400)
  return s + '</svg>'
}

function benchmarkFigure() {
  const w = 1800, h = 1120
  let s = svgOpen(w, h, 'Track 2 V3 versus Final router benchmark', 'Separate percentage and router-latency panels compare safe routing, false promotion, p50, and p95 on 150 measured case-runs per version.') + header('Track 2 V3 vs Final', 'Deterministic router-only benchmark - 30 cases x 5 measured repeats per version', w)
  s += text(80, 170, 'A. Safety outcomes (%)', 23, C.ink, 700)
  const pctX = 240, pctW = 1400
  for (let tick = 0; tick <= 100; tick += 20) {
    const x = pctX + pctW * tick / 100
    s += line(x, 205, x, 475, '#ded4cc', 1)
    s += text(x, 500, String(tick), 13, C.muted, 400, 'middle')
  }
  const pctRows = [
    ['Track 2 V3 - safe routing', 96.67, C.orange],
    ['Final - safe routing', 96.67, C.green],
    ['Track 2 V3 - false promotion', 0, C.orangeDark],
    ['Final - false promotion', 0, C.green],
  ]
  pctRows.forEach((row, i) => {
    const y = 220 + i * 62
    s += text(220, y + 25, row[0], 15, C.ink, 600, 'end')
    const width = Math.max(row[1] ? pctW * row[1] / 100 : 4, 4)
    s += `<rect x="${pctX}" y="${y}" width="${width}" height="34" rx="8" fill="${row[2]}"/>`
    s += text(pctX + width + 12, y + 24, `${row[1].toFixed(2)}%`, 15, row[2], 700)
  })
  s += text(80, 570, 'B. Synchronous router latency (ms)', 23, C.ink, 700)
  const latX = 240, latW = 1400, max = 0.22
  for (let tick = 0; tick <= 0.2001; tick += 0.05) {
    const x = latX + latW * tick / max
    s += line(x, 605, x, 895, '#ded4cc', 1)
    s += text(x, 920, tick.toFixed(2), 13, C.muted, 400, 'middle')
  }
  const latRows = [
    ['Track 2 V3 - p50', 0.0452, C.orange],
    ['Final - p50', 0.0484, C.green],
    ['Track 2 V3 - p95', 0.1907, C.orangeDark],
    ['Final - p95', 0.1946, C.green],
  ]
  latRows.forEach((row, i) => {
    const y = 625 + i * 62
    s += text(220, y + 25, row[0], 15, C.ink, 600, 'end')
    const width = latW * row[1] / max
    s += `<rect x="${latX}" y="${y}" width="${width}" height="34" rx="8" fill="${row[2]}"/>`
    s += text(latX + width + 12, y + 24, `${row[1].toFixed(6)} ms`, 15, row[2], 700)
  })
  s += rect(80, 972, 1640, 82, C.orangeSoft, C.orangeSoft, 14)
  s += wrapped(105, 1004, 'Interpretation: safe-routing non-regression on one deterministic router corpus. This does not measure full video acquisition, OCR/ASR, providers, place or dish accuracy, adapter/render time, or end-to-end Vision Auto latency.', 175, 22, 16, C.orangeDark, 600)
  return s + '</svg>'
}

function matrixFigure() {
  const w = 2000, h = 1380
  const rows = [
    ['Invalid URL', 'Frontend focused', 'PASS', 'Composable unit'],
    ['Submit transitions', 'Frontend focused', 'PASS', 'Reactive state'],
    ['Poll to terminal', 'Frontend focused', 'PASS', 'Fake-timer lifecycle'],
    ['Cancel + AbortController', 'Frontend focused', 'PASS', 'Signal + timer'],
    ['Backend cancel request', 'Frontend focused', 'PASS', 'Injected API spy'],
    ['Stale older run', 'Frontend focused', 'PASS', 'Deferred race'],
    ['Retry identity + reset', 'Frontend focused', 'PASS', 'Public contract'],
    ['Unmount + timer cleanup', 'Frontend focused', 'PASS', 'Vue lifecycle'],
    ['Provider unavailable', 'Adapter focused', 'PASS', 'Safe adaptation'],
    ['Review-required', 'Adapter + backend', 'PASS', 'Contract boundary'],
    ['Safe not-found', 'Adapter + composable', 'PASS', 'Terminal safety'],
    ['Dish candidates', 'Frontend focused', 'PASS', 'Dish-first contract'],
    ['Queue/cancel/deadline', 'Backend reliability', '31/31', 'Coordinator tests'],
    ['Resolver/adapter safety', 'Backend adapter', '25/25', 'Boundary tests'],
    ['Track 2 V3 closure', 'Complete selected suite', '75/75', 'Deterministic services'],
  ]
  let s = svgOpen(w, h, 'Test-to-concern matrix', 'Matrix linking lifecycle concerns to frontend, backend, and Track 2 V3 suites and evidence types.') + header('Test-to-concern matrix', 'Implementation evidence - pass counts are not model accuracy', w)
  const x = [70, 610, 1170, 1390, 1930]
  const y0 = 170, rowH = 70
  s += `<rect x="${x[0]}" y="${y0}" width="${x[4]-x[0]}" height="58" rx="12" fill="${C.charcoal}"/>`
  ;['Lifecycle / safety concern', 'Suite', 'Result', 'Evidence type'].forEach((label, i) => s += text(x[i] + 18, y0 + 37, label, 16, C.white, 700))
  rows.forEach((row, i) => {
    const y = y0 + 58 + i * rowH
    s += `<rect x="${x[0]}" y="${y}" width="${x[4]-x[0]}" height="${rowH}" fill="${i % 2 ? '#fbf6f1' : C.white}" stroke="${C.line}" stroke-width="1"/>`
    ;[x[1], x[2], x[3]].forEach((vx) => s += line(vx, y, vx, y + rowH, C.line, 1))
    s += text(x[0] + 18, y + 43, row[0], 16, C.ink, 600)
    s += text(x[1] + 18, y + 43, row[1], 15, C.ink, 400)
    s += pill(x[2] + 24, y + 19, row[2], C.greenSoft, C.green, 120)
    s += text(x[3] + 18, y + 43, row[3], 15, C.muted, 400)
  })
  s += text(1000, 1335, 'Focused frontend: 10/10 | Full frontend: 29/29 | No live provider execution claimed', 17, C.orangeDark, 700, 'middle')
  return s + '</svg>'
}

const figures = [
  ['01_vision_auto_evolution_timeline', timelineFigure()],
  ['02_use_vision_auto_state_machine', stateMachineFigure()],
  ['03_stage3_sequence_diagram', sequenceFigure()],
  ['04_track2_v3_vs_final_router_benchmark', benchmarkFigure()],
  ['05_test_to_concern_matrix', matrixFigure()],
]

await fs.mkdir(outDir, { recursive: true })
for (const [name, svg] of figures) {
  const svgPath = path.join(outDir, `${name}.svg`)
  const pngPath = path.join(outDir, `${name}.png`)
  await fs.writeFile(svgPath, svg, 'utf8')
  await sharp(Buffer.from(svg), { density: 192 }).png({ compressionLevel: 9 }).toFile(pngPath)
  console.log(`${name}: SVG + PNG`)
}
