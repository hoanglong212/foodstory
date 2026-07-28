#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..', '..')
export const PILOT_CASES_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-cases.csv',
)
export const RAW_RESULTS_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-raw.json',
)
export const SUMMARY_RESULTS_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-results.csv',
)
export const SUMMARY_MARKDOWN_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-summary.md',
)

const DEFAULT_ENDPOINT =
  'http://127.0.0.1:3000/api/food-map/vision-auto-v2/dish-discovery'
const DEFAULT_DELAY_MS = 3_000
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_QUOTA_BACKOFF_MS = 70_000
const DEFAULT_MAX_ATTEMPTS = 2
const MIN_CASES = 10
const MAX_CASES = 15
const VIDEO_COLUMNS = ['video_url', 'source_url', 'url', 'video_url_or_file']
const EXPECTED_DISH_COLUMNS = ['expected_dish', 'ground_truth_dish']

function cleanCell(value) {
  return String(value ?? '').replace(/^\uFEFF/u, '').trim()
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < String(text).length; index += 1) {
    const character = String(text)[index]
    if (quoted) {
      if (character === '"' && String(text)[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  if (quoted) throw new Error('The pilot CSV contains an unterminated quoted field.')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function firstPresentColumn(header, acceptedNames) {
  return acceptedNames.find((column) => header.includes(column)) || ''
}

function publicHttpUrl(value, label) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} must be a complete HTTP or HTTPS URL.`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label} must be a credential-free HTTP or HTTPS URL.`)
  }
  return parsed
}

export function labelledCasesFromCsv(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('The pilot CSV is empty.')

  const header = rows[0].map((value) => cleanCell(value).toLowerCase())
  const caseIdColumn = firstPresentColumn(header, ['case_id'])
  const videoColumn = firstPresentColumn(header, VIDEO_COLUMNS)
  const expectedDishColumn = firstPresentColumn(header, EXPECTED_DISH_COLUMNS)
  if (!caseIdColumn || !videoColumn || !expectedDishColumn) {
    throw new Error(
      'The pilot CSV must contain case_id, a video URL column '
        + `(${VIDEO_COLUMNS.join(' or ')}), and an expected dish column `
        + `(${EXPECTED_DISH_COLUMNS.join(' or ')}).`,
    )
  }

  const populatedRows = rows
    .slice(1)
    .filter((row) => row.some((value) => cleanCell(value) !== ''))
  if (populatedRows.length < MIN_CASES || populatedRows.length > MAX_CASES) {
    throw new Error(
      `The labelled pilot must contain ${MIN_CASES}-${MAX_CASES} cases; `
        + `found ${populatedRows.length}.`,
    )
  }

  const indexes = {
    caseId: header.indexOf(caseIdColumn),
    videoUrl: header.indexOf(videoColumn),
    expectedDish: header.indexOf(expectedDishColumn),
  }
  const seenIds = new Set()
  return populatedRows.map((row, index) => {
    if (row.length !== header.length) {
      throw new Error(
        `Pilot CSV row ${index + 2} has ${row.length} cells; expected ${header.length}.`,
      )
    }
    const caseId = cleanCell(row[indexes.caseId])
    const videoUrl = cleanCell(row[indexes.videoUrl])
    const expectedDish = cleanCell(row[indexes.expectedDish])
    if (!caseId) throw new Error(`Pilot CSV row ${index + 2} is missing case_id.`)
    if (seenIds.has(caseId)) throw new Error(`Pilot CSV repeats case_id ${caseId}.`)
    if (!videoUrl) throw new Error(`Pilot case ${caseId} is missing its video URL.`)
    if (!expectedDish) {
      throw new Error(`Pilot case ${caseId} is missing its ground-truth dish label.`)
    }
    publicHttpUrl(videoUrl, `Pilot case ${caseId} video URL`)
    seenIds.add(caseId)
    return { caseId, videoUrl, expectedDish }
  })
}

export function normalizeDishLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\u0111/gu, 'd')
    .replace(/\u0110/gu, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

export function candidateMatchesExpected(candidate, expectedDish) {
  const expected = normalizeDishLabel(expectedDish)
  if (!expected) return false
  return [candidate?.dishName, ...(Array.isArray(candidate?.aliases) ? candidate.aliases : [])]
    .some((value) => {
      const returned = normalizeDishLabel(value)
      return returned === expected || ` ${returned} `.includes(` ${expected} `)
    })
}

function responseCandidates(body) {
  return (Array.isArray(body?.dishCandidates) ? body.dishCandidates : [])
    .filter((candidate) => candidate && typeof candidate === 'object')
    .slice(0, 3)
}

function errorText(body, transportError, response) {
  if (transportError) {
    return [transportError.code, transportError.message].filter(Boolean).join(': ')
  }
  const code = cleanCell(body?.code)
  const message = cleanCell(body?.error || body?.message)
  if (code || message) return [code, message].filter(Boolean).join(': ')
  if (response && !response.ok) {
    return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  }
  return ''
}

export function classifyPilotCase({
  labelledCase,
  response = null,
  parsedBody = null,
  rawBody = '',
  transportError = null,
  elapsedMs,
}) {
  const candidates = responseCandidates(parsedBody)
  const top1Correct = candidates.length > 0
    && candidateMatchesExpected(candidates[0], labelledCase.expectedDish)
  const top3Correct = candidates.some((candidate) =>
    candidateMatchesExpected(candidate, labelledCase.expectedDish),
  )
  const responseCode = cleanCell(parsedBody?.code)
  const terminalState = cleanCell(parsedBody?.status)
    || (transportError ? 'transport_error' : `http_${response?.status || 'unknown'}`)
  const technicalFailure = Boolean(
    transportError
      || !response
      || !response.ok
      || responseCode.match(
        /(?:provider|media|thumbnail|timeout|unavailable|failed|quota|internal)/iu,
      ),
  )
  const noResult = !technicalFailure && candidates.length === 0
  const reviewRequired = candidates.some((candidate) => candidate.reviewRequired === true)
    || parsedBody?.reviewRequired === true
  const resultStatus = technicalFailure
    ? 'technical_failure'
    : noResult
      ? 'no_result'
      : reviewRequired
        ? 'review_required'
        : 'candidate_returned'

  return {
    caseId: labelledCase.caseId,
    videoUrl: labelledCase.videoUrl,
    expectedDish: labelledCase.expectedDish,
    returnedTop1: cleanCell(candidates[0]?.dishName),
    returnedTop3: candidates.map((candidate) => cleanCell(candidate.dishName)),
    top1Correct,
    top3Correct,
    terminalState,
    technicalFailure,
    noResult,
    reviewRequired,
    resultStatus,
    endToEndMs: Math.round(elapsedMs),
    endToEndSeconds: Math.round(elapsedMs) / 1_000,
    httpStatus: response?.status || null,
    providerOrMediaError: errorText(parsedBody, transportError, response),
    raw: {
      request: {
        method: 'POST',
        body: { sourceUrl: labelledCase.videoUrl },
      },
      response: response
        ? {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            rawBody,
            parsedBody,
          }
        : null,
      transportError: transportError
        ? {
            name: cleanCell(transportError.name),
            code: cleanCell(transportError.code),
            message: cleanCell(transportError.message),
          }
        : null,
    },
  }
}

function percentage(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 10_000) / 100
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export function calculateMetrics(cases) {
  const total = cases.length
  const count = (predicate) => cases.filter(predicate).length
  const latencies = cases
    .map((item) => Number(item.endToEndMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
  const top1Correct = count((item) => item.top1Correct)
  const top3Correct = count((item) => item.top3Correct)
  const noResult = count((item) => item.noResult)
  const reviewRequired = count((item) => item.reviewRequired)
  const technicalFailure = count((item) => item.technicalFailure)
  return {
    sampleSize: total,
    top1Correct,
    top1DishAccuracyPercent: percentage(top1Correct, total),
    top3Correct,
    top3DishAccuracyPercent: percentage(top3Correct, total),
    noResult,
    noResultRatePercent: percentage(noResult, total),
    reviewRequired,
    reviewRequiredRatePercent: percentage(reviewRequired, total),
    technicalFailure,
    technicalFailureRatePercent: percentage(technicalFailure, total),
    medianEndToEndMs: median(latencies),
    maximumEndToEndMs: latencies.length ? Math.max(...latencies) : null,
  }
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '')
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

export function resultsCsv(cases) {
  const columns = [
    'case_id',
    'video_url',
    'expected_dish',
    'returned_top_1',
    'returned_top_3',
    'top_1_correct',
    'top_3_correct',
    'terminal_state',
    'technical_failure',
    'no_result',
    'review_required',
    'result_status',
    'end_to_end_ms',
    'end_to_end_seconds',
    'http_status',
    'provider_or_media_error',
  ]
  const rows = cases.map((item) => [
    item.caseId,
    item.videoUrl,
    item.expectedDish,
    item.returnedTop1,
    item.returnedTop3,
    item.top1Correct ? 'yes' : 'no',
    item.top3Correct ? 'yes' : 'no',
    item.terminalState,
    item.technicalFailure ? 'yes' : 'no',
    item.noResult ? 'yes' : 'no',
    item.reviewRequired ? 'yes' : 'no',
    item.resultStatus,
    item.endToEndMs,
    item.endToEndSeconds.toFixed(3),
    item.httpStatus,
    item.providerOrMediaError,
  ])
  return `${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')
}

function percent(value) {
  return `${Number(value).toFixed(2)}%`
}

export function summaryMarkdown(evaluation) {
  const { metrics, cases, run } = evaluation
  const failures = cases.filter((item) => item.technicalFailure)
  const retryRuns = Array.isArray(evaluation.retryRuns) ? evaluation.retryRuns : []
  const recommendedWording = [
    `In a small formative pilot of ${metrics.sampleSize} labelled public food videos,`,
    `FoodStory returned the ground-truth dish at rank 1 in ${metrics.top1Correct}/${metrics.sampleSize}`,
    `cases (${percent(metrics.top1DishAccuracyPercent)}) and within the top 3 in`,
    `${metrics.top3Correct}/${metrics.sampleSize} cases (${percent(metrics.top3DishAccuracyPercent)}).`,
    `The observed no-result rate was ${percent(metrics.noResultRatePercent)},`,
    `the review-required rate was ${percent(metrics.reviewRequiredRatePercent)}, and`,
    `the technical-failure rate was ${percent(metrics.technicalFailureRatePercent)}.`,
    'Technical failures are included in the full-sample accuracy denominator.',
    'These results are formative and describe only this small convenience sample;',
    'they are not a representative population-level benchmark.',
  ].join(' ')

  const lines = [
    '# Stage 3 dish-first Vision Auto labelled pilot',
    '',
    '> This is a small formative pilot using a convenience sample of public food videos. '
      + 'It is not a representative population-level benchmark.',
    '',
    '## Run record',
    '',
    `- Commit: \`${run.commit}\``,
    `- Branch: \`${run.branch || '(detached)'}\``,
    `- Started: \`${run.startedAt}\``,
    `- Finished: \`${run.finishedAt}\``,
    `- Command: \`${run.command}\``,
    `- Working directory: \`${run.workingDirectory}\``,
    `- Endpoint: \`${run.endpoint}\``,
    `- Ground truth: \`${run.groundTruthPath}\``,
    `- Environment: Node ${run.environment.node}; ${run.environment.platform} `
      + `${run.environment.arch}; OS release ${run.environment.osRelease}; `
      + `timezone ${run.environment.timeZone}`,
    `- Worktree dirty at start: ${run.worktreeDirtyAtStart ? 'yes' : 'no'}`,
    `- Execution: sequential; ${run.delayMs} ms delay; ${run.timeoutMs} ms per-case timeout`,
    ...(retryRuns.length
      ? [
          '',
          '## Quota-safe retry runs',
          '',
          ...retryRuns.map((retryRun) =>
            `- ${retryRun.startedAt} to ${retryRun.finishedAt || 'running'} `
              + `(${retryRun.status}): `
              + `${retryRun.targetCaseIds.length} technical-failure cases; `
              + `${retryRun.quotaBackoffMs} ms backoff; `
              + `${retryRun.maxAttempts} maximum attempt(s) per case; `
              + `command \`${retryRun.command}\`.`,
          ),
        ]
      : []),
    '',
    'The harness called only the dish-identification endpoint. It did not call nearby-place '
      + 'search and does not treat restaurant suggestions as the original filming location.',
    '',
    'Ground-truth strings were read unchanged from the designated CSV. Accuracy matching '
      + 'uses accent/case/punctuation normalization, then requires either exact equality '
      + 'or the complete ground-truth token phrase in the returned dish name or aliases.',
    '',
    '## Observed metrics',
    '',
    '| Metric | Observed result |',
    '|---|---:|',
    `| Labelled cases | ${metrics.sampleSize} |`,
    `| Top-1 dish accuracy | ${metrics.top1Correct}/${metrics.sampleSize} `
      + `(${percent(metrics.top1DishAccuracyPercent)}) |`,
    `| Top-3 dish accuracy | ${metrics.top3Correct}/${metrics.sampleSize} `
      + `(${percent(metrics.top3DishAccuracyPercent)}) |`,
    `| No-result rate | ${metrics.noResult}/${metrics.sampleSize} `
      + `(${percent(metrics.noResultRatePercent)}) |`,
    `| Review-required rate | ${metrics.reviewRequired}/${metrics.sampleSize} `
      + `(${percent(metrics.reviewRequiredRatePercent)}) |`,
    `| Technical-failure rate | ${metrics.technicalFailure}/${metrics.sampleSize} `
      + `(${percent(metrics.technicalFailureRatePercent)}) |`,
    `| Median end-to-end latency | ${metrics.medianEndToEndMs ?? 'n/a'} ms |`,
    `| Maximum end-to-end latency | ${metrics.maximumEndToEndMs ?? 'n/a'} ms |`,
    '',
    'The primary accuracy denominator is all labelled cases. Technical failures are '
      + 'therefore counted as not correct rather than removed from the denominator.',
    '',
    '## Case results',
    '',
    '| Case | Expected dish | Top 1 | Top 3 | Top-1 correct | Top-3 correct | '
      + 'Terminal state | Result status | Latency (ms) |',
    '|---|---|---|---|---:|---:|---|---|---:|',
    ...cases.map((item) =>
      `| ${markdownCell(item.caseId)} | ${markdownCell(item.expectedDish)} `
        + `| ${markdownCell(item.returnedTop1 || '\u2014')} `
        + `| ${markdownCell(item.returnedTop3.join('; ') || '\u2014')} `
        + `| ${item.top1Correct ? 'yes' : 'no'} | ${item.top3Correct ? 'yes' : 'no'} `
        + `| ${markdownCell(item.terminalState)} | ${markdownCell(item.resultStatus)} `
        + `| ${item.endToEndMs} |`,
    ),
    '',
    '## Technical failures and blocked cases',
    '',
    ...(failures.length
      ? failures.map((item) =>
          `- ${item.caseId}: ${item.providerOrMediaError || item.terminalState}`,
        )
      : ['- None observed.']),
    '',
    '## Recommended report wording',
    '',
    recommendedWording,
    '',
  ]
  return lines.join('\n')
}

async function atomicWrite(path, content) {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, path)
}

async function gitText(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: REPOSITORY_ROOT,
    windowsHide: true,
    maxBuffer: 256 * 1_024,
  })
  return String(stdout).trim()
}

function parseIntegerOption(value, name, minimum, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`)
  }
  return number
}

export function parseOptions(argv) {
  const options = {
    endpoint: DEFAULT_ENDPOINT,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    overwrite: false,
    summarizeOnly: false,
    retryTechnicalFailures: false,
    finalizeInterruptedRetry: false,
    quotaBackoffMs: DEFAULT_QUOTA_BACKOFF_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    retryCaseIds: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--overwrite') {
      options.overwrite = true
    } else if (argument === '--summarize-only') {
      options.summarizeOnly = true
    } else if (argument === '--retry-technical-failures') {
      options.retryTechnicalFailures = true
    } else if (argument === '--finalize-interrupted-retry') {
      options.finalizeInterruptedRetry = true
    } else if (argument === '--endpoint') {
      options.endpoint = argv[++index]
    } else if (argument === '--delay-ms') {
      options.delayMs = parseIntegerOption(argv[++index], '--delay-ms', 0, 60_000)
    } else if (argument === '--timeout-ms') {
      options.timeoutMs = parseIntegerOption(
        argv[++index],
        '--timeout-ms',
        1_000,
        300_000,
      )
    } else if (argument === '--quota-backoff-ms') {
      options.quotaBackoffMs = parseIntegerOption(
        argv[++index],
        '--quota-backoff-ms',
        10_000,
        300_000,
      )
    } else if (argument === '--max-attempts') {
      options.maxAttempts = parseIntegerOption(argv[++index], '--max-attempts', 1, 5)
    } else if (argument === '--retry-case-id') {
      const caseId = cleanCell(argv[++index])
      if (!caseId) throw new Error('--retry-case-id requires a case ID.')
      options.retryCaseIds.push(caseId)
    } else if (argument === '--help') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  const endpoint = publicHttpUrl(options.endpoint, 'Evaluation endpoint')
  options.endpoint = endpoint.href
  const exclusiveModes = [
    options.summarizeOnly,
    options.retryTechnicalFailures,
    options.finalizeInterruptedRetry,
  ].filter(Boolean).length
  if (exclusiveModes > 1) {
    throw new Error('Pilot maintenance modes cannot be combined.')
  }
  if (options.retryCaseIds.length > 0 && !options.retryTechnicalFailures) {
    throw new Error('--retry-case-id requires --retry-technical-failures.')
  }
  options.retryCaseIds = [...new Set(options.retryCaseIds)]
  return options
}

function helpText() {
  return [
    'Usage: npm run pilot:vision-dish -- [options]',
    '',
    `Ground truth is read only from ${PILOT_CASES_PATH}.`,
    'Outputs are written to docs/evidence/vision-pilot-{raw.json,results.csv,summary.md}.',
    '',
    'Options:',
    `  --endpoint <url>       Dish-discovery endpoint (default ${DEFAULT_ENDPOINT})`,
    `  --delay-ms <number>    Delay between sequential cases (default ${DEFAULT_DELAY_MS})`,
    `  --timeout-ms <number>  Per-case timeout (default ${DEFAULT_TIMEOUT_MS})`,
    '  --overwrite            Replace existing output evidence',
    '  --summarize-only       Recalculate evidence from preserved raw responses',
    '  --retry-technical-failures',
    '                         Retry only failed cases and preserve every attempt',
    '  --finalize-interrupted-retry',
    '                         Close a stopped retry run without changing raw attempts',
    `  --quota-backoff-ms <n> Wait between vision calls (default ${DEFAULT_QUOTA_BACKOFF_MS})`,
    `  --max-attempts <n>     Attempts per failed case (default ${DEFAULT_MAX_ATTEMPTS})`,
    '  --retry-case-id <id>   Limit retry to one or more failed case IDs',
    '  --help                 Show this help',
  ].join('\n')
}

async function outputExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function delay(durationMs) {
  return durationMs > 0
    ? new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs))
    : Promise.resolve()
}

async function executeCase(labelledCase, options) {
  const startedAt = performance.now()
  let response = null
  let rawBody = ''
  let parsedBody = null
  let transportError = null
  try {
    response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceUrl: labelledCase.videoUrl }),
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    rawBody = await response.text()
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        parsedBody = null
      }
    }
  } catch (error) {
    transportError = error
  }
  return classifyPilotCase({
    labelledCase,
    response,
    parsedBody,
    rawBody,
    transportError,
    elapsedMs: performance.now() - startedAt,
  })
}

export async function runPilot(options) {
  await access(PILOT_CASES_PATH)
  const labelledCases = labelledCasesFromCsv(await readFile(PILOT_CASES_PATH, 'utf8'))
  const outputPaths = [RAW_RESULTS_PATH, SUMMARY_RESULTS_PATH, SUMMARY_MARKDOWN_PATH]
  if (!options.overwrite) {
    const existing = []
    for (const path of outputPaths) {
      if (await outputExists(path)) existing.push(path)
    }
    if (existing.length) {
      throw new Error(
        `Evidence already exists: ${existing.join(', ')}. Review it first or use --overwrite.`,
      )
    }
  }

  const endpoint = publicHttpUrl(options.endpoint, 'Evaluation endpoint').href
  const startedAt = new Date()
  const [commit, branch, worktreeStatus] = await Promise.all([
    gitText(['rev-parse', 'HEAD']),
    gitText(['branch', '--show-current']),
    gitText(['status', '--porcelain']),
  ])
  const run = {
    commit,
    branch,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    command: [process.execPath, ...process.argv.slice(1)]
      .map((value) => JSON.stringify(value))
      .join(' '),
    workingDirectory: process.cwd(),
    endpoint,
    groundTruthPath: 'docs/evidence/vision-pilot-cases.csv',
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
    sequential: true,
    worktreeDirtyAtStart: Boolean(worktreeStatus),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  }
  const evaluation = {
    schemaVersion: 1,
    status: 'running',
    note:
      'Small formative pilot only; not a representative population-level benchmark.',
    run,
    cases: [],
    metrics: null,
  }

  await mkdir(dirname(RAW_RESULTS_PATH), { recursive: true })
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
  for (const [index, labelledCase] of labelledCases.entries()) {
    const result = await executeCase(labelledCase, { ...options, endpoint })
    evaluation.cases.push(result)
    await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
    console.log(
      `[${index + 1}/${labelledCases.length}] ${labelledCase.caseId}: `
        + `${result.terminalState}; ${result.endToEndMs} ms`,
    )
    if (index < labelledCases.length - 1) await delay(options.delayMs)
  }

  evaluation.status = 'completed'
  evaluation.run.finishedAt = new Date().toISOString()
  evaluation.metrics = calculateMetrics(evaluation.cases)
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(SUMMARY_RESULTS_PATH, resultsCsv(evaluation.cases))
  await atomicWrite(SUMMARY_MARKDOWN_PATH, summaryMarkdown(evaluation))
  return evaluation
}

function storedAttempt(item, attemptedAt) {
  const { attempts: _attempts, ...attempt } = item
  return {
    attemptedAt,
    ...attempt,
  }
}

export async function retryTechnicalFailures(options) {
  const labelledCases = labelledCasesFromCsv(await readFile(PILOT_CASES_PATH, 'utf8'))
  const evaluation = JSON.parse(await readFile(RAW_RESULTS_PATH, 'utf8'))
  if (evaluation?.status !== 'completed' || !Array.isArray(evaluation?.cases)) {
    throw new Error('The preserved raw pilot is not a completed evaluation.')
  }

  const labelsById = new Map(labelledCases.map((item) => [item.caseId, item]))
  for (const storedCase of evaluation.cases) {
    const labelledCase = labelsById.get(storedCase.caseId)
    if (
      !labelledCase
      || storedCase.videoUrl !== labelledCase.videoUrl
      || storedCase.expectedDish !== labelledCase.expectedDish
    ) {
      throw new Error(
        `Raw evidence does not match the designated ground truth for ${storedCase.caseId}.`,
      )
    }
  }

  const technicalFailureCaseIds = evaluation.cases
    .filter((item) => item.technicalFailure)
    .map((item) => item.caseId)
  const targetCaseIds = options.retryCaseIds.length > 0
    ? options.retryCaseIds
    : technicalFailureCaseIds
  const invalidCaseIds = targetCaseIds.filter(
    (caseId) => !technicalFailureCaseIds.includes(caseId),
  )
  if (invalidCaseIds.length > 0) {
    throw new Error(
      `Retry case IDs are not current technical failures: ${invalidCaseIds.join(', ')}.`,
    )
  }
  if (targetCaseIds.length === 0) {
    throw new Error('The preserved pilot has no technical-failure cases to retry.')
  }

  const [commit, branch, worktreeStatus] = await Promise.all([
    gitText(['rev-parse', 'HEAD']),
    gitText(['branch', '--show-current']),
    gitText(['status', '--porcelain']),
  ])
  const retryRun = {
    status: 'running',
    commit,
    branch,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    command: [process.execPath, ...process.argv.slice(1)]
      .map((value) => JSON.stringify(value))
      .join(' '),
    workingDirectory: process.cwd(),
    endpoint: options.endpoint,
    targetCaseIds,
    quotaBackoffMs: options.quotaBackoffMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    sequential: true,
    worktreeDirtyAtStart: Boolean(worktreeStatus),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  }
  evaluation.retryRuns = [
    ...(Array.isArray(evaluation.retryRuns) ? evaluation.retryRuns : []),
    retryRun,
  ]
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)

  for (const [targetIndex, caseId] of targetCaseIds.entries()) {
    const caseIndex = evaluation.cases.findIndex((item) => item.caseId === caseId)
    const storedCase = evaluation.cases[caseIndex]
    const labelledCase = labelsById.get(caseId)
    const attempts = Array.isArray(storedCase.attempts)
      ? [...storedCase.attempts]
      : [storedAttempt(storedCase, evaluation.run?.finishedAt || null)]

    for (let attemptIndex = 0; attemptIndex < options.maxAttempts; attemptIndex += 1) {
      const attemptedAt = new Date().toISOString()
      const result = await executeCase(labelledCase, options)
      attempts.push(storedAttempt(result, attemptedAt))
      evaluation.cases[caseIndex] = {
        ...result,
        attempts,
      }
      evaluation.metrics = calculateMetrics(evaluation.cases)
      await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
      console.log(
        `[${targetIndex + 1}/${targetCaseIds.length}] ${caseId} `
          + `attempt ${attemptIndex + 1}/${options.maxAttempts}: `
          + `${result.terminalState}; ${result.endToEndMs} ms`,
      )
      if (!result.technicalFailure || result.httpStatus !== 429) break
      if (attemptIndex < options.maxAttempts - 1) {
        await delay(options.quotaBackoffMs)
      }
    }

    if (targetIndex < targetCaseIds.length - 1) {
      await delay(options.quotaBackoffMs)
    }
  }

  retryRun.status = 'completed'
  retryRun.finishedAt = new Date().toISOString()
  evaluation.metrics = calculateMetrics(evaluation.cases)
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(SUMMARY_RESULTS_PATH, resultsCsv(evaluation.cases))
  await atomicWrite(SUMMARY_MARKDOWN_PATH, summaryMarkdown(evaluation))
  return evaluation
}

export async function finalizeInterruptedRetry() {
  const evaluation = JSON.parse(await readFile(RAW_RESULTS_PATH, 'utf8'))
  const retryRuns = Array.isArray(evaluation.retryRuns) ? evaluation.retryRuns : []
  const retryRun = retryRuns.at(-1)
  if (!retryRun || retryRun.status !== 'running') {
    throw new Error('There is no running retry record to finalize.')
  }

  const retryStartedAt = Date.parse(retryRun.startedAt)
  const attemptedCaseIds = evaluation.cases
    .filter((item) =>
      Array.isArray(item.attempts)
      && item.attempts.some((attempt) =>
        Number.isFinite(Date.parse(attempt.attemptedAt))
        && Date.parse(attempt.attemptedAt) >= retryStartedAt,
      ),
    )
    .map((item) => item.caseId)
  retryRun.status = 'stopped_provider_quota'
  retryRun.finishedAt = new Date().toISOString()
  retryRun.stopReason =
    `${attemptedCaseIds.length} quota-safe attempt(s), separated by the configured `
    + 'backoff, still returned HTTP 429.'
  retryRun.attemptedCaseIds = attemptedCaseIds
  retryRun.unattemptedCaseIds = retryRun.targetCaseIds.filter(
    (caseId) => !attemptedCaseIds.includes(caseId),
  )
  evaluation.metrics = calculateMetrics(evaluation.cases)
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(SUMMARY_RESULTS_PATH, resultsCsv(evaluation.cases))
  await atomicWrite(SUMMARY_MARKDOWN_PATH, summaryMarkdown(evaluation))
  return evaluation
}

export function reclassifyStoredCase(storedCase, labelledCase) {
  const storedResponse = storedCase?.raw?.response
  const response = storedResponse
    ? {
        ok: storedResponse.status >= 200 && storedResponse.status < 300,
        status: storedResponse.status,
        statusText: storedResponse.statusText,
        headers: new Headers({
          'content-type': storedResponse.contentType || '',
        }),
      }
    : null
  const recalculated = classifyPilotCase({
    labelledCase,
    response,
    parsedBody: storedResponse?.parsedBody ?? null,
    rawBody: storedResponse?.rawBody ?? '',
    transportError: storedCase?.raw?.transportError ?? null,
    elapsedMs: storedCase.endToEndMs,
  })
  return {
    ...recalculated,
    raw: storedCase.raw,
  }
}

export async function summarizePreservedRaw() {
  const labelledCases = labelledCasesFromCsv(await readFile(PILOT_CASES_PATH, 'utf8'))
  const evaluation = JSON.parse(await readFile(RAW_RESULTS_PATH, 'utf8'))
  if (evaluation?.status !== 'completed' || !Array.isArray(evaluation?.cases)) {
    throw new Error('The preserved raw pilot is not a completed evaluation.')
  }
  if (evaluation.cases.length !== labelledCases.length) {
    throw new Error(
      `Raw evidence contains ${evaluation.cases.length} cases; `
        + `ground truth contains ${labelledCases.length}.`,
    )
  }

  const storedById = new Map(evaluation.cases.map((item) => [item.caseId, item]))
  const recalculatedCases = labelledCases.map((labelledCase) => {
    const storedCase = storedById.get(labelledCase.caseId)
    if (!storedCase) {
      throw new Error(`Raw evidence is missing case ${labelledCase.caseId}.`)
    }
    if (
      storedCase.videoUrl !== labelledCase.videoUrl
      || storedCase.expectedDish !== labelledCase.expectedDish
    ) {
      throw new Error(
        `Raw evidence does not match the designated ground truth for ${labelledCase.caseId}.`,
      )
    }
    return reclassifyStoredCase(storedCase, labelledCase)
  })

  const previousMetrics = evaluation.metrics
  evaluation.cases = recalculatedCases
  evaluation.metrics = calculateMetrics(recalculatedCases)
  const existingRevisions = Array.isArray(evaluation.derivedEvidenceRevisions)
    ? evaluation.derivedEvidenceRevisions
    : []
  evaluation.derivedEvidenceRevisions = JSON.stringify(previousMetrics)
    === JSON.stringify(evaluation.metrics)
    ? existingRevisions
    : [
      ...existingRevisions,
      {
        timestamp: new Date().toISOString(),
        reason:
          'Corrected the harness matcher to accept the complete ground-truth token phrase '
          + 'inside a returned dish name or alias.',
        previousMetrics,
      },
    ]
  await atomicWrite(RAW_RESULTS_PATH, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(SUMMARY_RESULTS_PATH, resultsCsv(evaluation.cases))
  await atomicWrite(SUMMARY_MARKDOWN_PATH, summaryMarkdown(evaluation))
  return evaluation
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) {
      console.log(helpText())
      return
    }
    const evaluation = options.summarizeOnly
      ? await summarizePreservedRaw()
      : options.retryTechnicalFailures
        ? await retryTechnicalFailures(options)
        : options.finalizeInterruptedRetry
          ? await finalizeInterruptedRetry()
          : await runPilot(options)
    console.log(
      `Completed ${evaluation.metrics.sampleSize} sequential cases. `
        + `Top-1 ${percent(evaluation.metrics.top1DishAccuracyPercent)}; `
        + `top-3 ${percent(evaluation.metrics.top3DishAccuracyPercent)}.`,
    )
  } catch (error) {
    if (error?.code === 'ENOENT' && error?.path === PILOT_CASES_PATH) {
      console.error(
        `Evaluation blocked: required ground truth is missing at ${PILOT_CASES_PATH}.`,
      )
    } else {
      console.error(`Evaluation failed: ${error instanceof Error ? error.message : error}`)
    }
    process.exitCode = 1
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectExecution) await main()
