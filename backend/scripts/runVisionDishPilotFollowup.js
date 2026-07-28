#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  PILOT_CASES_PATH,
  RAW_RESULTS_PATH,
  classifyPilotCase,
  labelledCasesFromCsv,
} from './runVisionDishPilot.js'

const execFileAsync = promisify(execFile)
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..', '..')
const ORIGINAL_RESULTS_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-results.csv',
)
const ORIGINAL_SUMMARY_PATH = resolve(
  REPOSITORY_ROOT,
  'docs',
  'evidence',
  'vision-pilot-summary.md',
)
const TARGET_CASE_IDS = ['V03', 'V04', 'V06', 'V07', 'V08', 'V09', 'V11', 'V13']
const DEFAULT_ENDPOINT =
  'http://127.0.0.1:3000/api/food-map/vision-auto-v2/dish-discovery'
const DEFAULT_BETWEEN_CASE_DELAY_MS = 90_000
const DEFAULT_INITIAL_BACKOFF_MS = 75_000
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_STOP_AFTER_QUOTA_FAILURES = 3

function clean(value) {
  return String(value ?? '').trim()
}

function publicHttpUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Follow-up endpoint must be a complete HTTP or HTTPS URL.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Follow-up endpoint must be a credential-free HTTP or HTTPS URL.')
  }
  return parsed.href
}

function boundedInteger(value, name, minimum, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`)
  }
  return number
}

export function parseFollowupOptions(argv) {
  const options = {
    endpoint: DEFAULT_ENDPOINT,
    betweenCaseDelayMs: DEFAULT_BETWEEN_CASE_DELAY_MS,
    initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    stopAfterQuotaFailures: DEFAULT_STOP_AFTER_QUOTA_FAILURES,
    resumeRunId: '',
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--endpoint') {
      options.endpoint = argv[++index]
    } else if (argument === '--between-case-delay-ms') {
      options.betweenCaseDelayMs = boundedInteger(
        argv[++index],
        argument,
        30_000,
        600_000,
      )
    } else if (argument === '--initial-backoff-ms') {
      options.initialBackoffMs = boundedInteger(
        argv[++index],
        argument,
        10_000,
        300_000,
      )
    } else if (argument === '--timeout-ms') {
      options.timeoutMs = boundedInteger(argv[++index], argument, 1_000, 300_000)
    } else if (argument === '--max-attempts') {
      options.maxAttempts = boundedInteger(argv[++index], argument, 1, 5)
    } else if (argument === '--stop-after-quota-failures') {
      options.stopAfterQuotaFailures = boundedInteger(
        argv[++index],
        argument,
        1,
        10,
      )
    } else if (argument === '--resume-run-id') {
      options.resumeRunId = clean(argv[++index])
      if (!/^\d{8}T\d{6}Z$/u.test(options.resumeRunId)) {
        throw new Error('--resume-run-id must use the timestamp ID format YYYYMMDDTHHMMSSZ.')
      }
    } else if (argument === '--help') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  options.endpoint = publicHttpUrl(options.endpoint)
  return options
}

function helpText() {
  return [
    'Usage: npm run pilot:vision-dish:followup -- [options]',
    '',
    `Cases: ${TARGET_CASE_IDS.join(', ')}`,
    'The original pilot evidence is read-only. Timestamped rerun files are created.',
    '',
    'Options:',
    `  --endpoint <url>                 Default ${DEFAULT_ENDPOINT}`,
    `  --between-case-delay-ms <n>      Default ${DEFAULT_BETWEEN_CASE_DELAY_MS}`,
    `  --initial-backoff-ms <n>         Default ${DEFAULT_INITIAL_BACKOFF_MS}`,
    `  --timeout-ms <n>                 Default ${DEFAULT_TIMEOUT_MS}`,
    `  --max-attempts <n>               Default ${DEFAULT_MAX_ATTEMPTS}`,
    `  --stop-after-quota-failures <n>  Default ${DEFAULT_STOP_AFTER_QUOTA_FAILURES}`,
    '  --resume-run-id <timestamp>       Resume technical failures in one rerun set',
    '  --help',
  ].join('\n')
}

function timestampId(date) {
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function fileRecord(path) {
  const buffer = await readFile(path)
  return {
    path: path.slice(REPOSITORY_ROOT.length + 1).replace(/\\/gu, '/'),
    bytes: buffer.length,
    sha256: sha256(buffer),
  }
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

function delay(durationMs) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs))
}

async function executeAttempt(labelledCase, options) {
  const startedAt = new Date()
  const timerStartedAt = performance.now()
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
  const result = classifyPilotCase({
    labelledCase,
    response,
    parsedBody,
    rawBody,
    transportError,
    elapsedMs: performance.now() - timerStartedAt,
  })
  return {
    ...result,
    attemptedAt: startedAt.toISOString(),
  }
}

function firstRunObservation(storedCase) {
  const firstAttempt = Array.isArray(storedCase?.attempts) && storedCase.attempts.length
    ? storedCase.attempts[0]
    : storedCase
  return {
    returnedTop1: clean(firstAttempt?.returnedTop1),
    returnedTop3: Array.isArray(firstAttempt?.returnedTop3)
      ? firstAttempt.returnedTop3.map(clean)
      : [],
    top1Correct: firstAttempt?.top1Correct === true,
    top3Correct: firstAttempt?.top3Correct === true,
    terminalState: clean(firstAttempt?.terminalState),
    technicalFailure: firstAttempt?.technicalFailure === true,
    noResult: firstAttempt?.noResult === true,
    reviewRequired: firstAttempt?.reviewRequired === true,
    resultStatus: clean(firstAttempt?.resultStatus),
    endToEndMs: Number(firstAttempt?.endToEndMs) || null,
    httpStatus: firstAttempt?.httpStatus ?? null,
    providerOrMediaError: clean(firstAttempt?.providerOrMediaError),
  }
}

function percentage(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 10_000) / 100
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export function calculateFollowupMetrics(cases) {
  const total = cases.length
  const terminalObservations = cases
    .map((item) => item.rerun.terminalObservation)
    .filter(Boolean)
  const count = (predicate) => terminalObservations.filter(predicate).length
  const latencies = cases
    .map((item) => item.rerun.endToEndMs)
    .filter((value) => Number.isFinite(value) && value >= 0)
  const top1Correct = count((item) => item.top1Correct)
  const top3Correct = count((item) => item.top3Correct)
  const completedProviderResponses = count((item) => !item.technicalFailure)
  const remainingHttp429 = count((item) => item.httpStatus === 429)
  const noResult = count((item) => item.noResult)
  const reviewRequired = count((item) => item.reviewRequired)
  return {
    requestedCases: total,
    attemptedCases: terminalObservations.length,
    unattemptedCases: total - terminalObservations.length,
    completedProviderResponses,
    top1Correct,
    top1AccuracyPercent: percentage(top1Correct, total),
    top3Correct,
    top3AccuracyPercent: percentage(top3Correct, total),
    remainingHttp429,
    remainingHttp429RatePercent: percentage(remainingHttp429, total),
    noResult,
    noResultRatePercent: percentage(noResult, total),
    reviewRequired,
    reviewRequiredRatePercent: percentage(reviewRequired, total),
    medianEndToEndMs: median(latencies),
    maximumEndToEndMs: latencies.length ? Math.max(...latencies) : null,
  }
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '')
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

export function combinedResultsCsv(evaluation) {
  const columns = [
    'case_id',
    'expected_dish',
    'first_run_top_1',
    'first_run_top_3',
    'first_run_top_1_correct',
    'first_run_top_3_correct',
    'first_run_terminal_state',
    'first_run_http_status',
    'first_run_technical_failure',
    'first_run_no_result',
    'first_run_review_required',
    'first_run_end_to_end_ms',
    'rerun_attempt_count',
    'rerun_top_1',
    'rerun_top_3',
    'rerun_top_1_correct',
    'rerun_top_3_correct',
    'rerun_terminal_state',
    'rerun_http_status',
    'rerun_technical_failure',
    'rerun_no_result',
    'rerun_review_required',
    'rerun_end_to_end_ms_including_backoff',
    'rerun_provider_or_media_error',
  ]
  const rows = evaluation.cases.map((item) => {
    const rerun = item.rerun.terminalObservation
    return [
      item.caseId,
      item.expectedDish,
      item.firstRun.returnedTop1,
      item.firstRun.returnedTop3,
      item.firstRun.top1Correct ? 'yes' : 'no',
      item.firstRun.top3Correct ? 'yes' : 'no',
      item.firstRun.terminalState,
      item.firstRun.httpStatus,
      item.firstRun.technicalFailure ? 'yes' : 'no',
      item.firstRun.noResult ? 'yes' : 'no',
      item.firstRun.reviewRequired ? 'yes' : 'no',
      item.firstRun.endToEndMs,
      item.rerun.attempts.length,
      rerun?.returnedTop1 || '',
      rerun?.returnedTop3 || [],
      rerun ? (rerun.top1Correct ? 'yes' : 'no') : '',
      rerun ? (rerun.top3Correct ? 'yes' : 'no') : '',
      rerun?.terminalState || 'not_attempted',
      rerun?.httpStatus ?? '',
      rerun ? (rerun.technicalFailure ? 'yes' : 'no') : '',
      rerun ? (rerun.noResult ? 'yes' : 'no') : '',
      rerun ? (rerun.reviewRequired ? 'yes' : 'no') : '',
      item.rerun.endToEndMs ?? '',
      rerun?.providerOrMediaError || '',
    ]
  })
  return `${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')
}

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`
}

export function followupSummaryMarkdown(evaluation) {
  const metrics = evaluation.metrics
  const resumeRuns = Array.isArray(evaluation.resumeRuns) ? evaluation.resumeRuns : []
  const lines = [
    '# Stage 3 dish-first Vision Auto controlled 429 follow-up',
    '',
    '> This is a controlled follow-up of eight cases from a small formative pilot. '
      + 'It is not a representative population-level benchmark.',
    '',
    '## Combination protocol',
    '',
    'The first-run and rerun observations are retained independently and displayed '
      + 'side by side. The rerun does not silently select the better observation. '
      + 'Rerun accuracy uses all eight requested cases as the denominator; technical '
      + 'failures and unattempted cases count as not correct. For a retried case, the '
      + 'last rerun attempt is the terminal rerun observation. Rerun per-case latency '
      + 'includes provider request time and any exponential-backoff waits for that case.',
    '',
    '## Run record',
    '',
    `- Status: \`${evaluation.status}\``,
    `- Commit: \`${evaluation.run.commit}\``,
    `- Started: \`${evaluation.run.startedAt}\``,
    `- Finished: \`${evaluation.run.finishedAt || 'running'}\``,
    `- Command: \`${evaluation.run.command}\``,
    `- Endpoint: \`${evaluation.run.endpoint}\``,
    `- Cases: ${evaluation.run.targetCaseIds.join(', ')}`,
    `- Between-case delay: ${evaluation.run.betweenCaseDelayMs} ms`,
    `- Exponential backoff: ${evaluation.run.initialBackoffMs} ms, doubling per retry`,
    `- Maximum attempts per case: ${evaluation.run.maxAttempts}`,
    `- Stop threshold: ${evaluation.run.stopAfterQuotaFailures} consecutive HTTP 429 attempts`,
    `- Stop reason: ${evaluation.stopReason || 'none'}`,
    ...(resumeRuns.length
      ? [
          `- Resume runs: ${resumeRuns.length}`,
          ...resumeRuns.map((run) =>
            `  - ${run.startedAt} to ${run.finishedAt || 'running'} (${run.status}); `
              + `cases ${run.targetCaseIds.join(', ')}; command \`${run.command}\`.`,
          ),
        ]
      : []),
    '',
    'Original evidence was read-only. Its pre-run and post-run checksums are recorded '
      + 'in the rerun raw JSON.',
    '',
    '## Rerun metrics',
    '',
    '| Metric | Rerun observation |',
    '|---|---:|',
    `| Requested cases | ${metrics.requestedCases} |`,
    `| Attempted cases | ${metrics.attemptedCases} |`,
    `| Completed provider responses | ${metrics.completedProviderResponses} |`,
    `| Top-1 accuracy | ${metrics.top1Correct}/${metrics.requestedCases} `
      + `(${formatPercent(metrics.top1AccuracyPercent)}) |`,
    `| Top-3 accuracy | ${metrics.top3Correct}/${metrics.requestedCases} `
      + `(${formatPercent(metrics.top3AccuracyPercent)}) |`,
    `| Remaining HTTP 429 | ${metrics.remainingHttp429}/${metrics.requestedCases} `
      + `(${formatPercent(metrics.remainingHttp429RatePercent)}) |`,
    `| No-result | ${metrics.noResult}/${metrics.requestedCases} `
      + `(${formatPercent(metrics.noResultRatePercent)}) |`,
    `| Review-required | ${metrics.reviewRequired}/${metrics.requestedCases} `
      + `(${formatPercent(metrics.reviewRequiredRatePercent)}) |`,
    `| Median latency | ${metrics.medianEndToEndMs ?? 'n/a'} ms |`,
    `| Maximum latency | ${metrics.maximumEndToEndMs ?? 'n/a'} ms |`,
    '',
    '## Combined per-case observations',
    '',
    '| Case | Expected | First-run result | First top 1 | First correct | '
      + 'Rerun result | Rerun top 1 | Rerun correct | Attempts | Rerun latency |',
    '|---|---|---|---|---:|---|---|---:|---:|---:|',
    ...evaluation.cases.map((item) => {
      const rerun = item.rerun.terminalObservation
      return `| ${markdownCell(item.caseId)} | ${markdownCell(item.expectedDish)} `
        + `| ${markdownCell(item.firstRun.resultStatus)} `
        + `| ${markdownCell(item.firstRun.returnedTop1 || '\u2014')} `
        + `| ${item.firstRun.top1Correct ? 'yes' : 'no'} `
        + `| ${markdownCell(rerun?.resultStatus || 'not_attempted')} `
        + `| ${markdownCell(rerun?.returnedTop1 || '\u2014')} `
        + `| ${rerun ? (rerun.top1Correct ? 'yes' : 'no') : '\u2014'} `
        + `| ${item.rerun.attempts.length} `
        + `| ${item.rerun.endToEndMs ?? '\u2014'} |`
    }),
    '',
    '## Remaining quota failures',
    '',
    ...evaluation.cases
      .filter((item) => item.rerun.terminalObservation?.httpStatus === 429)
      .map((item) =>
        `- ${item.caseId}: ${item.rerun.terminalObservation.providerOrMediaError}`,
      ),
    ...(evaluation.cases.some((item) => item.rerun.terminalObservation?.httpStatus === 429)
      ? []
      : ['- None.']),
    '',
  ]
  return lines.join('\n')
}

async function originalEvidenceRecords() {
  return Promise.all([
    fileRecord(PILOT_CASES_PATH),
    fileRecord(RAW_RESULTS_PATH),
    fileRecord(ORIGINAL_RESULTS_PATH),
    fileRecord(ORIGINAL_SUMMARY_PATH),
  ])
}

async function unchangedOriginalEvidence(before) {
  const after = await originalEvidenceRecords()
  return {
    unchanged: before.every((item, index) => item.sha256 === after[index].sha256),
    before,
    after,
  }
}

export async function runControlledFollowup(options) {
  for (const path of [
    PILOT_CASES_PATH,
    RAW_RESULTS_PATH,
    ORIGINAL_RESULTS_PATH,
    ORIGINAL_SUMMARY_PATH,
  ]) {
    await access(path)
  }
  const originalEvidenceBefore = await originalEvidenceRecords()
  const labelledCases = labelledCasesFromCsv(await readFile(PILOT_CASES_PATH, 'utf8'))
  const labelsById = new Map(labelledCases.map((item) => [item.caseId, item]))
  const originalEvaluation = JSON.parse(await readFile(RAW_RESULTS_PATH, 'utf8'))
  const originalById = new Map(
    originalEvaluation.cases.map((item) => [item.caseId, item]),
  )
  const cases = TARGET_CASE_IDS.map((caseId) => {
    const labelledCase = labelsById.get(caseId)
    const originalCase = originalById.get(caseId)
    if (!labelledCase || !originalCase) {
      throw new Error(`Required follow-up case ${caseId} is missing.`)
    }
    if (
      originalCase.expectedDish !== labelledCase.expectedDish
      || originalCase.videoUrl !== labelledCase.videoUrl
    ) {
      throw new Error(`Ground truth or video URL changed for ${caseId}.`)
    }
    const firstRun = firstRunObservation(originalCase)
    if (firstRun.httpStatus !== 429) {
      throw new Error(`${caseId} was not an original HTTP 429 case.`)
    }
    return {
      caseId,
      videoUrl: labelledCase.videoUrl,
      expectedDish: labelledCase.expectedDish,
      firstRun,
      rerun: {
        attempts: [],
        terminalObservation: null,
        endToEndMs: null,
      },
    }
  })

  const startedAt = new Date()
  const runId = timestampId(startedAt)
  const outputDirectory = dirname(RAW_RESULTS_PATH)
  const outputBase = resolve(outputDirectory, `vision-pilot-rerun-${runId}`)
  const outputPaths = {
    raw: `${outputBase}-raw.json`,
    results: `${outputBase}-results.csv`,
    summary: `${outputBase}-summary.md`,
  }
  for (const path of Object.values(outputPaths)) {
    try {
      await stat(path)
      throw new Error(`Timestamped rerun output already exists: ${path}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const [commit, branch, worktreeStatus] = await Promise.all([
    gitText(['rev-parse', 'HEAD']),
    gitText(['branch', '--show-current']),
    gitText(['status', '--porcelain']),
  ])
  const evaluation = {
    schemaVersion: 1,
    kind: 'controlled_stage3_429_followup',
    status: 'running',
    stopReason: null,
    run: {
      runId,
      commit,
      branch,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      command: [process.execPath, ...process.argv.slice(1)]
        .map((value) => JSON.stringify(value))
        .join(' '),
      workingDirectory: process.cwd(),
      endpoint: options.endpoint,
      targetCaseIds: TARGET_CASE_IDS,
      sequential: true,
      betweenCaseDelayMs: options.betweenCaseDelayMs,
      initialBackoffMs: options.initialBackoffMs,
      maxAttempts: options.maxAttempts,
      stopAfterQuotaFailures: options.stopAfterQuotaFailures,
      timeoutMs: options.timeoutMs,
      worktreeDirtyAtStart: Boolean(worktreeStatus),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
    combinationProtocol: {
      selection: 'none',
      firstRunObservation: 'first preserved attempt for each original case',
      rerunObservation: 'last attempt in this controlled rerun',
      accuracyDenominator: 'all eight requested cases',
      latency:
        'per-case rerun wall time including request time and exponential-backoff waits',
    },
    originalEvidence: {
      unchanged: null,
      before: originalEvidenceBefore,
      after: null,
    },
    outputPaths: Object.fromEntries(
      Object.entries(outputPaths).map(([key, path]) => [
        key,
        path.slice(REPOSITORY_ROOT.length + 1).replace(/\\/gu, '/'),
      ]),
    ),
    cases,
    metrics: calculateFollowupMetrics(cases),
  }
  await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)

  let consecutiveQuotaFailures = 0
  let shouldStop = false
  for (const [caseIndex, item] of evaluation.cases.entries()) {
    const caseStartedAt = performance.now()
    const labelledCase = labelsById.get(item.caseId)
    for (let attemptIndex = 0; attemptIndex < options.maxAttempts; attemptIndex += 1) {
      const result = await executeAttempt(labelledCase, options)
      item.rerun.attempts.push(result)
      item.rerun.terminalObservation = result
      item.rerun.endToEndMs = Math.round(performance.now() - caseStartedAt)
      if (result.httpStatus === 429) {
        consecutiveQuotaFailures += 1
      } else {
        consecutiveQuotaFailures = 0
      }
      evaluation.metrics = calculateFollowupMetrics(evaluation.cases)
      await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)
      console.log(
        `[${caseIndex + 1}/${evaluation.cases.length}] ${item.caseId} `
          + `attempt ${attemptIndex + 1}/${options.maxAttempts}: `
          + `${result.terminalState}; ${result.endToEndMs} ms`,
      )

      if (consecutiveQuotaFailures >= options.stopAfterQuotaFailures) {
        evaluation.status = 'stopped_provider_unavailable'
        evaluation.stopReason =
          `${consecutiveQuotaFailures} consecutive HTTP 429 attempts reached the `
          + 'predeclared provider-unavailable threshold.'
        shouldStop = true
        break
      }
      if (result.httpStatus !== 429) break
      if (attemptIndex < options.maxAttempts - 1) {
        const backoffMs = options.initialBackoffMs * (2 ** attemptIndex)
        await delay(backoffMs)
      }
    }
    item.rerun.endToEndMs = Math.round(performance.now() - caseStartedAt)
    evaluation.metrics = calculateFollowupMetrics(evaluation.cases)
    await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)
    if (shouldStop) break
    if (caseIndex < evaluation.cases.length - 1) {
      await delay(options.betweenCaseDelayMs)
    }
  }

  if (!shouldStop) evaluation.status = 'completed'
  evaluation.run.finishedAt = new Date().toISOString()
  evaluation.metrics = calculateFollowupMetrics(evaluation.cases)
  const originalEvidence = await unchangedOriginalEvidence(originalEvidenceBefore)
  evaluation.originalEvidence = originalEvidence
  if (!originalEvidence.unchanged) {
    evaluation.status = 'evidence_integrity_failure'
    evaluation.stopReason = 'One or more original pilot evidence files changed.'
  }
  await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(outputPaths.results, combinedResultsCsv(evaluation))
  await atomicWrite(outputPaths.summary, followupSummaryMarkdown(evaluation))
  return { evaluation, outputPaths }
}

export async function resumeControlledFollowup(options) {
  const outputDirectory = dirname(RAW_RESULTS_PATH)
  const outputBase = resolve(outputDirectory, `vision-pilot-rerun-${options.resumeRunId}`)
  const outputPaths = {
    raw: `${outputBase}-raw.json`,
    results: `${outputBase}-results.csv`,
    summary: `${outputBase}-summary.md`,
  }
  const evaluation = JSON.parse(await readFile(outputPaths.raw, 'utf8'))
  if (evaluation?.kind !== 'controlled_stage3_429_followup') {
    throw new Error('The requested rerun raw file has an unexpected evidence kind.')
  }

  const labelledCases = labelledCasesFromCsv(await readFile(PILOT_CASES_PATH, 'utf8'))
  const labelsById = new Map(labelledCases.map((item) => [item.caseId, item]))
  const targetCases = evaluation.cases.filter(
    (item) => item.rerun.terminalObservation?.technicalFailure === true,
  )
  if (!targetCases.length) {
    throw new Error('The timestamped rerun has no remaining technical failures.')
  }

  const resumeRun = {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    command: [process.execPath, ...process.argv.slice(1)]
      .map((value) => JSON.stringify(value))
      .join(' '),
    targetCaseIds: targetCases.map((item) => item.caseId),
    initialBackoffMs: options.initialBackoffMs,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
  }
  evaluation.resumeRuns = [
    ...(Array.isArray(evaluation.resumeRuns) ? evaluation.resumeRuns : []),
    resumeRun,
  ]
  evaluation.status = 'running'
  evaluation.stopReason = null
  await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)

  let consecutiveQuotaFailures = 0
  let shouldStop = false
  for (const item of targetCases) {
    const labelledCase = labelsById.get(item.caseId)
    if (
      !labelledCase
      || labelledCase.expectedDish !== item.expectedDish
      || labelledCase.videoUrl !== item.videoUrl
    ) {
      throw new Error(`Ground truth or video URL changed for ${item.caseId}.`)
    }

    while (item.rerun.attempts.length < options.maxAttempts) {
      const priorAttemptCount = item.rerun.attempts.length
      const backoffMs = options.initialBackoffMs * (2 ** Math.max(0, priorAttemptCount - 1))
      await delay(backoffMs)
      const result = await executeAttempt(labelledCase, options)
      item.rerun.attempts.push(result)
      item.rerun.terminalObservation = result
      item.rerun.endToEndMs = Number(item.rerun.endToEndMs || 0)
        + backoffMs
        + result.endToEndMs
      if (result.httpStatus === 429) consecutiveQuotaFailures += 1
      else consecutiveQuotaFailures = 0
      evaluation.metrics = calculateFollowupMetrics(evaluation.cases)
      await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)
      console.log(
        `${item.caseId} resume attempt ${item.rerun.attempts.length}/${options.maxAttempts}: `
          + `${result.terminalState}; ${result.endToEndMs} ms`,
      )

      if (consecutiveQuotaFailures >= options.stopAfterQuotaFailures) {
        evaluation.status = 'stopped_provider_unavailable'
        evaluation.stopReason =
          `${consecutiveQuotaFailures} consecutive HTTP 429 attempts reached the `
          + 'predeclared provider-unavailable threshold.'
        shouldStop = true
        break
      }
      if (!result.technicalFailure) break
      if (![429, 504].includes(result.httpStatus)) break
    }
    if (shouldStop) break
  }

  if (!shouldStop) evaluation.status = 'completed'
  resumeRun.status = evaluation.status
  resumeRun.finishedAt = new Date().toISOString()
  evaluation.run.finishedAt = resumeRun.finishedAt
  evaluation.metrics = calculateFollowupMetrics(evaluation.cases)
  evaluation.originalEvidence = await unchangedOriginalEvidence(
    evaluation.originalEvidence.before,
  )
  if (!evaluation.originalEvidence.unchanged) {
    evaluation.status = 'evidence_integrity_failure'
    evaluation.stopReason = 'One or more original pilot evidence files changed.'
    resumeRun.status = evaluation.status
  }
  await atomicWrite(outputPaths.raw, `${JSON.stringify(evaluation, null, 2)}\n`)
  await atomicWrite(outputPaths.results, combinedResultsCsv(evaluation))
  await atomicWrite(outputPaths.summary, followupSummaryMarkdown(evaluation))
  return { evaluation, outputPaths }
}

async function main() {
  try {
    const options = parseFollowupOptions(process.argv.slice(2))
    if (options.help) {
      console.log(helpText())
      return
    }
    const { evaluation, outputPaths } = options.resumeRunId
      ? await resumeControlledFollowup(options)
      : await runControlledFollowup(options)
    console.log(
      `Follow-up ${evaluation.status}: `
        + `${evaluation.metrics.completedProviderResponses} completed provider response(s), `
        + `${evaluation.metrics.remainingHttp429} remaining HTTP 429 failure(s).`,
    )
    console.log(`Raw: ${outputPaths.raw}`)
    console.log(`Results: ${outputPaths.results}`)
    console.log(`Summary: ${outputPaths.summary}`)
  } catch (error) {
    console.error(
      `Controlled follow-up failed: ${error instanceof Error ? error.message : error}`,
    )
    process.exitCode = 1
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectExecution) await main()
