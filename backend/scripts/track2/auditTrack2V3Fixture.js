import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { fetchShortsMetadata } from '../../src/services/shortsMetadataFetchService.js'
import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import {
  assertShortsTrack2V3AuditSafe,
  buildShortsTrack2V3AuditCsv,
  buildShortsTrack2V3AuditSummary,
  runShortsTrack2V3AuditCases,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AuditService.js'
import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'
import { createShortsTrack2V3SmartOverlayFrameExtractor } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'
import { loadTrack2V3AuditFixture } from './track2V3AuditFixtureLoader.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const envPath = path.join(backendRoot, '.env')
const explicitAuditProvider = process.env.TRACK2_V3_LOCAL_OCR_PROVIDER
dotenv.config({ path: envPath })

function safeSegment(value, fallback = 'case') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
  return clean || fallback
}

function videoIdFromUrl(url = '') {
  const text = String(url || '').trim()
  const shortsMatch = text.match(/\/shorts\/([^/?#]+)/u)
  if (shortsMatch?.[1]) return shortsMatch[1]
  try {
    const parsed = new URL(text)
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0] || ''
    }
    return parsed.searchParams.get('v') || ''
  } catch {
    return ''
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

function relativeBackendPath(filePath = '') {
  if (!filePath) return null
  return path.relative(backendRoot, filePath).replace(/\\/gu, '/')
}

function auditConfig(localOcrProvider) {
  return {
    ...getShortsTrack2V3Config(process.env),
    enabled: true,
    track2V3SmartOverlayEnabled: true,
    track2V3SmartOverlayDryRun: false,
    track2V3LocalOcrEnabled: true,
    track2V3LocalOcrProvider: localOcrProvider,
    track2V3GoogleVisionEnabled: false,
    track2V3PlacesEnabled: false,
    track2V3GeminiVisionEnabled: false,
    track2V3AsrEnabled: false,
  }
}

function shouldWriteSelectorDiagnostics(item = {}) {
  return item.expectedEvidenceSource === 'visual_ocr' ||
    String(item.category || '').startsWith('visual_screen_') ||
    ['overlay_full_address', 'overlay_partial_address', 'hard_ocr'].includes(item.category)
}

async function metadataForAuditCase(item, videoId) {
  const base = { url: item.url, videoId }
  if (
    item.expectedEvidenceSource !== 'youtube_description' &&
    !String(item.category || '').startsWith('metadata_')
  ) {
    return { metadata: base, providerErrors: [] }
  }

  try {
    const metadata = await fetchShortsMetadata(item.url, {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
    })
    return {
      metadata: {
        ...metadata,
        descriptionRawFromYoutube: metadata.description || '',
        searchSnippet: metadata.searchSnippet || metadata.serpSnippet || '',
      },
      providerErrors: [],
    }
  } catch (error) {
    return {
      metadata: base,
      providerErrors: [{
        provider: 'youtube_metadata',
        code: String(error?.code || 'YOUTUBE_METADATA_FETCH_FAILED').slice(0, 120),
        message: 'YouTube metadata could not be loaded for this audit case.',
      }],
    }
  }
}

async function runAuditCase(item, index, options = {}) {
  const videoId = videoIdFromUrl(item.url)
  const metadataResult = await metadataForAuditCase(item, videoId)
  const caseDir = path.join(
    options.outputDir,
    'cases',
    `${String(index + 1).padStart(2, '0')}-${safeSegment(item.id)}`,
  )
  const extractionTmpRoot = path.join(caseDir, 'tmp')
  await fs.mkdir(extractionTmpRoot, { recursive: true })

  const cleanupDirs = new Set()
  const cleanup = async () => {
    const directories = [...cleanupDirs]
    cleanupDirs.clear()
    await Promise.all(directories.map((directory) =>
      fs.rm(directory, { recursive: true, force: true }).catch(() => {})
    ))
  }
  const track2FrameExtractor = createShortsTrack2V3SmartOverlayFrameExtractor({
    tmpRoot: extractionTmpRoot,
    registerCleanup: (directory) => {
      if (directory) cleanupDirs.add(directory)
    },
  })

  try {
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: item.url,
        sourceUrl: item.url,
        videoId,
        fixtureCase: item,
        metadata: metadataResult.metadata,
        title: metadataResult.metadata.title || '',
        description: metadataResult.metadata.description || '',
        channelTitle: metadataResult.metadata.channelTitle || '',
        searchSnippet: metadataResult.metadata.searchSnippet || '',
      },
      auditConfig(options.localOcrProvider),
      {
        env: process.env,
        outputDir: caseDir,
        keepSampledFrames: true,
        selectorDiagnosticsEnabled: shouldWriteSelectorDiagnostics(item),
        track2FrameExtractor,
      },
    )
    return {
      ...result,
      videoId: result.videoId || videoId || null,
      selectorDiagnosticsPath: relativeBackendPath(result.selectorDiagnosticsPath),
      contactSheetPath: relativeBackendPath(result.contactSheetPath),
      selectedContactSheetPath: relativeBackendPath(result.selectedContactSheetPath),
      geminiCropJudgeContactSheetPaths: (
        Array.isArray(result.geminiCropJudgeContactSheetPaths)
          ? result.geminiCropJudgeContactSheetPaths
          : []
      ).map(relativeBackendPath),
      geminiCropJudgeResultPath: relativeBackendPath(result.geminiCropJudgeResultPath),
      providerErrors: [
        ...(Array.isArray(result.providerErrors) ? result.providerErrors : []),
        ...metadataResult.providerErrors,
      ],
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      asrCalled: false,
    }
  } finally {
    await cleanup()
  }
}

async function main() {
  const { fixture, fixturePath } = await loadTrack2V3AuditFixture({ backendRoot })
  const localOcrProvider = String(explicitAuditProvider || 'ensemble').trim().toLowerCase()
  const generatedAt = new Date().toISOString()
  const outputDir = path.join(backendRoot, 'tmp', 'track2-v3-audit', timestampSlug())
  await fs.mkdir(outputDir, { recursive: true })

  const results = await runShortsTrack2V3AuditCases(
    fixture.cases,
    (item, index) => runAuditCase(item, index, { outputDir, localOcrProvider }),
  )
  const summary = buildShortsTrack2V3AuditSummary(results)
  const reportPath = path.join(outputDir, 'report.json')
  const summaryPath = path.join(outputDir, 'summary.json')
  const csvPath = path.join(outputDir, 'summary.csv')

  Object.assign(summary, {
    generatedAt,
    fixture: relativeBackendPath(fixturePath),
    outputDir: relativeBackendPath(outputDir),
    localOcrProvider,
    googleVisionEnabled: false,
    placesEnabled: false,
    geminiEnabled: false,
    geminiCropJudgeEnabled: Boolean(
      getShortsTrack2V3Config(process.env).track2V3GeminiCropJudgeEnabled,
    ),
    asrEnabled: false,
    databaseWritesEnabled: false,
    reportPath: relativeBackendPath(reportPath),
    summaryPath: relativeBackendPath(summaryPath),
    csvPath: relativeBackendPath(csvPath),
  })
  const report = {
    version: fixture.version,
    generatedAt,
    fixture: relativeBackendPath(fixturePath),
    outputDir: relativeBackendPath(outputDir),
    localOcrProvider,
    providerBoundaries: {
      googleVisionEnabled: false,
      placesEnabled: false,
      geminiEnabled: false,
      geminiCropJudgeEnabled: Boolean(
        getShortsTrack2V3Config(process.env).track2V3GeminiCropJudgeEnabled,
      ),
      asrEnabled: false,
      databaseWritesEnabled: false,
      autoResolveEnabled: false,
    },
    cases: summary.cases,
  }

  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
    fs.writeFile(csvPath, buildShortsTrack2V3AuditCsv(summary.cases), 'utf8'),
  ])

  console.log(JSON.stringify({
    outputDir: relativeBackendPath(outputDir),
    reportPath: relativeBackendPath(reportPath),
    summaryPath: relativeBackendPath(summaryPath),
    csvPath: relativeBackendPath(csvPath),
    totalCases: summary.totalCases,
    byResolution: summary.byResolution,
    byFailureCategory: summary.byFailureCategory,
    byCaseClosureStatus: summary.byCaseClosureStatus,
    bySelectorDiagnosis: summary.bySelectorDiagnosis,
    casesNeedingMetadata: summary.casesNeedingMetadata,
    casesNeedingSelectorReview: summary.casesNeedingSelectorReview,
    casesNeedingHighResOcr: summary.casesNeedingHighResOcr,
    casesNeedingParserRelaxation: summary.casesNeedingParserRelaxation,
    casesWithDateTimeHouseNumberBug: summary.casesWithDateTimeHouseNumberBug,
    expectedOutcomePassCount: summary.expectedOutcomePassCount,
    expectedOutcomeFailCount: summary.expectedOutcomeFailCount,
    falseResolveCount: summary.falseResolveCount,
    autoResolveCount: summary.autoResolveCount,
    providerErrorCount: summary.providerErrorCount,
    providerBoundaryViolationCount: summary.providerBoundaryViolationCount,
    recommendationHints: summary.recommendationHints,
  }, null, 2))

  try {
    assertShortsTrack2V3AuditSafe(summary)
  } catch (error) {
    process.exitCode = 1
    console.error(error.message)
  }
}

await main()
