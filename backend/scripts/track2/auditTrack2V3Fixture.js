import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { createTrack2LiveOcrProviderBundle } from '../../src/services/shortsTrack2LiveProviderService.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'
import {
  assertShortsTrack2V3AuditSafe,
  buildShortsTrack2V3AuditSummary,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AuditService.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const envPath = path.join(backendRoot, '.env')
const fixturePath = path.join(backendRoot, 'tests', 'fixtures', 'youtube-shorts-track2-v1.json')
dotenv.config({ path: envPath })

function videoIdFromShortsUrl(url = '') {
  const match = String(url).match(/\/shorts\/([^/?#]+)/u)
  return match?.[1] || ''
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

function relativeBackendPath(filePath = '') {
  if (!filePath) return null
  return path.relative(backendRoot, filePath).replace(/\\/gu, '/')
}

async function loadFixture() {
  const raw = await fs.readFile(fixturePath, 'utf8')
  const fixture = JSON.parse(raw)
  return Array.isArray(fixture.cases) ? fixture.cases.filter((item) => item.enabled !== false) : []
}

async function runCase(item, liveEnabled) {
  const videoId = videoIdFromShortsUrl(item.url)
  const liveProviders = liveEnabled
    ? createTrack2LiveOcrProviderBundle({ fetchImpl: globalThis.fetch })
    : null

  try {
    const result = await runShortsTrack2V3Pipeline(
      {
        url: item.url,
        sourceUrl: item.url,
        videoId,
        fixtureCase: item,
        metadata: {
          url: item.url,
          videoId,
        },
      },
      liveProviders || { env: process.env },
    )

    return {
      case: item,
      result,
    }
  } finally {
    await liveProviders?.cleanupTrack2LiveProviders?.()
  }
}

async function main() {
  const liveEnabled = process.env.TRACK2_V3_ENABLED === 'true'
  const cases = await loadFixture()
  const results = []

  for (const item of cases) {
    const entry = await runCase(item, liveEnabled)
    results.push(entry)
  }

  const summary = buildShortsTrack2V3AuditSummary(results)
  summary.fixture = relativeBackendPath(fixturePath)
  summary.liveProvidersEnabled = liveEnabled

  const outputDir = path.join(backendRoot, 'tmp', 'track2-v3-audit')
  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `audit-${timestampSlug()}.json`)
  summary.outputPath = relativeBackendPath(outputPath)
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify(summary, null, 2))

  try {
    assertShortsTrack2V3AuditSafe(summary)
  } catch (error) {
    process.exitCode = 1
    console.error(error.message)
  }
}

await main()
