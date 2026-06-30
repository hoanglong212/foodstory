#!/usr/bin/env node

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { runShortsPipeline } from '../src/services/shortsPipelineService.js'
import {
  classifyTrack2AuditCase,
  normalizeTrack2AuditFixture,
  summarizeTrack2AuditRows,
} from '../src/services/shortsTrack2AuditService.js'
import { createTrack2LiveOcrProviderBundle } from '../src/services/shortsTrack2LiveProviderService.js'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const FIXTURE_PATH = fileURLToPath(
  new URL('../tests/fixtures/youtube-shorts-track2-v1.json', import.meta.url),
)

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeError(error) {
  return {
    name: safeString(error?.name || 'Error', 80),
    code: safeString(error?.code, 120) || null,
    message: safeString(error?.message || 'unknown_error', 240),
    httpStatus: Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : null,
  }
}

function extractGeminiText(payload = {}) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || ''
}

function createLiveGeminiClient({ apiKey, model, fetchImpl }) {
  if (!apiKey || !model || typeof fetchImpl !== 'function') return null
  const modelPath = model.startsWith('models/') ? model : `models/${model}`

  return async (request) => {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(request, null, 2) }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    )

    const bodyText = await response.text()
    if (!response.ok) {
      const error = new Error(`Gemini HTTP ${response.status}`)
      error.httpStatus = response.status
      throw error
    }

    return JSON.parse(extractGeminiText(JSON.parse(bodyText)) || bodyText)
  }
}

export function createLiveDeps() {
  const geminiClient = createLiveGeminiClient({
    apiKey: safeString(process.env.GEMINI_API_KEY, 500),
    model: safeString(process.env.GEMINI_MODEL, 120),
    fetchImpl: globalThis.fetch,
  })
  const track2LiveProviders = createTrack2LiveOcrProviderBundle({
    fetchImpl: globalThis.fetch,
  })

  return {
    fetch: globalThis.fetch,
    youtubeApiKey: safeString(process.env.YOUTUBE_API_KEY, 500),
    googlePlacesApiKey: safeString(process.env.GOOGLE_PLACES_API_KEY, 500),
    ...track2LiveProviders,
    ...(geminiClient ? { geminiClient } : {}),
  }
}

function readFixture(fixturePath = FIXTURE_PATH) {
  return normalizeTrack2AuditFixture(JSON.parse(readFileSync(fixturePath, 'utf8')))
}

function compactResult(result = {}) {
  return {
    track: safeString(result.track, 40) || null,
    resolution: safeString(result.resolution, 40) || null,
    reason: safeString(result.reason, 160) || null,
    addressSource: safeString(result.addressSource, 80) || null,
    placeId: safeString(result.placeId, 160) || null,
  }
}

async function executeCase(testCase, { deps, runPipeline }) {
  const startedAt = Date.now()
  try {
    const result = await runPipeline(testCase.url, deps)
    return {
      result,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      error: safeError(error),
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    await deps.cleanupTrack2LiveProviders?.()
  }
}

export async function runTrack2LiveAudit({
  fixturePath = FIXTURE_PATH,
  deps = createLiveDeps(),
  runPipeline = runShortsPipeline,
  print = console.log,
} = {}) {
  const fixture = readFixture(fixturePath)
  const rows = []

  print(`Track 2 fixture=${fixturePath}`)
  print(`Track 2 fixtureVersion=${fixture.version}`)

  for (const testCase of fixture.cases) {
    if (testCase.enabled !== true) {
      const row = classifyTrack2AuditCase(testCase, {})
      rows.push(row)
      print(`SKIP ${testCase.id}: category=${testCase.category} enabled=false`)
      continue
    }

    const execution = await executeCase(testCase, { deps, runPipeline })
    const row = classifyTrack2AuditCase(testCase, execution)
    rows.push(row)
    const status = row.pass ? 'PASS' : 'FAIL'
    const result = execution.result ? compactResult(execution.result) : null
    print(`${status} ${row.id}: category=${row.category} track=${row.track || 'null'} resolution=${row.resolution || 'null'} reason=${row.reason || 'null'} providerError=${row.providerError} latencyMs=${row.latencyMs}`)
    if (execution.error) print(`  error=${JSON.stringify(execution.error)}`)
    if (result) print(`  result=${JSON.stringify(result)}`)
    if (row.failures.length) print(`  failures=${row.failures.join(',')}`)
  }

  const summary = summarizeTrack2AuditRows(rows, fixture.cases.length)
  print('\nSummary')
  print(JSON.stringify(summary, null, 2))
  if (summary.enabled === 0) {
    print('NO_ENABLED_TRACK2_CASES: Track 2 live quality is not validated yet.')
  }

  return {
    fixtureVersion: fixture.version,
    rows,
    summary,
  }
}

async function main() {
  const result = await runTrack2LiveAudit()
  if (result.summary.fail > 0) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(JSON.stringify(safeError(error), null, 2))
    process.exitCode = 1
  })
}
