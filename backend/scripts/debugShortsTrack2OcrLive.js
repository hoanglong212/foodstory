#!/usr/bin/env node

import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runShortsPipeline } from '../src/services/shortsPipelineService.js'
import { createTrack2LiveOcrProviderBundle } from '../src/services/shortsTrack2LiveProviderService.js'

const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const FIXTURE_PATH = fileURLToPath(new URL('../tests/fixtures/youtube-shorts-track2-v1.json', import.meta.url))
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const MAX_TEXT_BLOCKS = 10

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function redactSensitive(value, maxLength = 500) {
  return safeString(value, maxLength * 2)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[REDACTED_EMAIL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/gu, '[REDACTED_API_KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/gu, '[REDACTED_TOKEN]')
    .replace(/((?:api[_ -]?key|token|secret|password|credential)s?\s*[:=]\s*)\S+/giu, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s)\]}>"']+/giu, '[REDACTED_URL]')
    .slice(0, maxLength)
}

function safeUrl(value) {
  try {
    const parsed = new URL(safeString(value, 2000))
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().slice(0, 500)
  } catch {
    return null
  }
}

function readFixture() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  return Array.isArray(fixture?.cases) ? fixture.cases : []
}

function resolveInput(input) {
  const fixtureCase = readFixture().find((item) => item?.id === input)
  if (fixtureCase) {
    return {
      id: safeString(fixtureCase.id, 80),
      category: safeString(fixtureCase.category, 80) || null,
      url: safeUrl(fixtureCase.url),
    }
  }

  if (/^track2_/iu.test(input)) {
    throw new Error('Unknown Track 2 fixture id')
  }

  const url = safeUrl(input)
  if (!url) throw new Error('Input must be a Track 2 fixture id or an HTTP(S) URL')
  return { id: null, category: 'DIRECT_URL', url }
}

function createInspectionDeps() {
  const liveOcrProviders = createTrack2LiveOcrProviderBundle({
    fetchImpl: globalThis.fetch,
  })

  return {
    fetch: globalThis.fetch,
    youtubeApiKey: safeString(process.env.YOUTUBE_API_KEY, 500),
    ...liveOcrProviders,
  }
}

function safeTextBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .slice(0, MAX_TEXT_BLOCKS)
    .map((block) => ({
      frameIndex: safeNumber(block?.frameIndex),
      timestampSeconds: safeNumber(block?.timestampSeconds),
      confidence: safeNumber(block?.confidence),
      text: redactSensitive(block?.text, 300),
    }))
}

function safeCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, 10)
    .map((candidate) => ({
      candidateAddress: redactSensitive(candidate?.candidateAddress, 300) || null,
      normalizedAddress: redactSensitive(candidate?.normalizedAddress, 300) || null,
      timestampSeconds: safeNumber(candidate?.timestampSeconds),
      frameIndex: safeNumber(candidate?.frameIndex),
      extractionRule: safeString(candidate?.extractionRule, 120) || null,
      riskFlags: (Array.isArray(candidate?.riskFlags) ? candidate.riskFlags : [])
        .map((flag) => safeString(flag, 120))
        .filter(Boolean)
        .slice(0, 12),
    }))
}

function safePresentedCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, 5)
    .map((candidate) => {
      const evidence = candidate?.evidence || {}
      return {
        sourceType: safeString(candidate?.sourceType, 80) || null,
        candidateAddress: redactSensitive(candidate?.candidateAddress, 300) || null,
        placeName: redactSensitive(candidate?.placeName, 200) || null,
        normalizedAddress: redactSensitive(candidate?.normalizedAddress, 300) || null,
        formattedAddress: redactSensitive(candidate?.formattedAddress, 300) || null,
        placeId: safeString(candidate?.placeId, 160) || null,
        timestampSeconds: safeNumber(candidate?.timestampSeconds),
        frameIndex: safeNumber(candidate?.frameIndex),
        rawText: redactSensitive(candidate?.rawText, 300) || null,
        confidence: safeNumber(candidate?.confidence),
        riskFlags: (Array.isArray(candidate?.riskFlags) ? candidate.riskFlags : [])
          .map((flag) => safeString(flag, 120))
          .filter(Boolean)
          .slice(0, 12),
        verificationReason: safeString(candidate?.verificationReason, 160) || null,
        placeVerificationStatus: safeString(candidate?.placeVerificationStatus, 120) || null,
        evidence: {
          source: safeString(evidence.source, 40) || null,
          text: redactSensitive(evidence.text, 300) || null,
          timestampSeconds: safeNumber(evidence.timestampSeconds),
          frameIndex: safeNumber(evidence.frameIndex),
        },
      }
    })
}

function safeDiagnostic(diagnostic = {}) {
  const output = {}
  const textFields = ['stage', 'code', 'status', 'reason', 'message', 'stderr', 'name', 'errorCode', 'extractionRule', 'sampleStrategy']
  const numberFields = [
    'httpStatus',
    'frameIndex',
    'timestampSeconds',
    'durationSeconds',
    'maxDurationSeconds',
    'budgetMs',
    'frameCount',
    'maxFrames',
    'textBlockCount',
    'exitCode',
  ]
  const booleanFields = ['timedOut', 'visionApiKeyEnvPresent', 'serviceAccountEnvPresent']

  for (const field of textFields) {
    const value = redactSensitive(diagnostic?.[field], ['message', 'stderr'].includes(field) ? 240 : 120)
    if (value) output[field] = value
  }
  for (const field of numberFields) {
    const value = safeNumber(diagnostic?.[field])
    if (value !== null) output[field] = value
  }
  for (const field of booleanFields) {
    if (typeof diagnostic?.[field] === 'boolean') output[field] = diagnostic[field]
  }
  if (Array.isArray(diagnostic?.riskFlags)) {
    output.riskFlags = diagnostic.riskFlags
      .map((flag) => safeString(flag, 120))
      .filter(Boolean)
      .slice(0, 12)
  }
  if (Array.isArray(diagnostic?.sampledTimestamps)) {
    output.sampledTimestamps = diagnostic.sampledTimestamps
      .map(safeNumber)
      .filter((value) => value !== null && value >= 0)
      .slice(0, 8)
  }

  return output
}

function safeDiagnostics(stage = {}) {
  return (Array.isArray(stage?.diagnostics) ? stage.diagnostics : [])
    .map(safeDiagnostic)
    .filter((diagnostic) => Object.keys(diagnostic).length > 0)
    .slice(0, 12)
}

export function summarizeOcrInspection(result = {}, input = {}) {
  const frameExtraction = result.stages?.frameExtraction || {}
  const ocr = result.stages?.ocr || {}
  const candidateExtraction = result.stages?.candidateExtraction || {}
  const safetyStage = result.stages?.safety || null
  const candidates = safeCandidates(candidateExtraction.candidates)
  const presentedCandidates = safePresentedCandidates(result.candidates)
  const textBlocks = Array.isArray(ocr.textBlocks) ? ocr.textBlocks : []
  const safety = safetyStage
    ? {
        status: safeString(safetyStage.status, 80) || null,
        reason: safeString(safetyStage.reason, 160) || null,
        flags: (Array.isArray(safetyStage.flags) ? safetyStage.flags : [])
          .map((flag) => safeString(flag, 120))
          .filter(Boolean)
          .slice(0, 12),
      }
    : {
        status: 'NOT_RUN',
        reason: 'SAFETY_STAGE_NOT_REACHED',
        flags: [],
      }

  return {
    ...(input.id ? { id: input.id } : {}),
    category: input.category,
    url: input.url,
    track: safeString(result.track, 40) || null,
    resolution: safeString(result.resolution, 40) || null,
    reason: safeString(result.reason, 160) || null,
    durationSeconds: safeNumber(frameExtraction.durationSeconds),
    maxDurationSeconds: safeNumber(frameExtraction.maxDurationSeconds),
    budgetMs: safeNumber(frameExtraction.budgetMs),
    sampleStrategy: safeString(frameExtraction.sampleStrategy, 40) || null,
    maxFrames: safeNumber(frameExtraction.maxFrames),
    sampledTimestamps: (Array.isArray(frameExtraction.sampledTimestamps)
      ? frameExtraction.sampledTimestamps
      : [])
      .map(safeNumber)
      .filter((value) => value !== null && value >= 0)
      .slice(0, 8),
    frameCount: safeNumber(frameExtraction.frameCount) ?? 0,
    ocrTextBlockCount: textBlocks.length,
    candidateCount: presentedCandidates.length,
    asrCandidateCount: Array.isArray(result.stages?.asrCandidateExtraction?.candidates)
      ? result.stages.asrCandidateExtraction.candidates.length
      : 0,
    candidates: presentedCandidates,
    evidence: presentedCandidates.map((candidate) => candidate.evidence),
    candidateExtraction: {
      status: safeString(candidateExtraction.status, 80) || null,
      reason: safeString(candidateExtraction.reason, 160) || null,
    },
    safety,
    ocrTextBlocks: safeTextBlocks(textBlocks),
    ocrCandidates: candidates,
    diagnostics: {
      frameExtraction: safeDiagnostics(frameExtraction),
      ocr: safeDiagnostics(ocr),
      candidateExtraction: safeDiagnostics(candidateExtraction),
      safety: safeDiagnostics(safetyStage || {}),
    },
  }
}

async function main() {
  const rawInput = safeString(process.argv[2], 2000)
  if (!rawInput) {
    console.error('Usage: node scripts/debugShortsTrack2OcrLive.js <youtube-shorts-url|track2_fixture_id>')
    process.exitCode = 1
    return
  }

  const input = resolveInput(rawInput)
  const deps = createInspectionDeps()
  try {
    const result = await runShortsPipeline(input.url, deps)
    console.log(JSON.stringify(summarizeOcrInspection(result, input), null, 2))
  } finally {
    await deps.cleanupTrack2LiveProviders?.()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: 'ERROR',
      reason: safeString(error?.code || error?.name || 'TRACK2_OCR_INSPECTION_FAILED', 120),
      message: redactSensitive(error?.message || 'Track 2 OCR inspection failed', 240),
    }, null, 2))
    process.exitCode = 1
  })
}
