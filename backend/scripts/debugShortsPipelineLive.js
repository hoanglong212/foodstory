#!/usr/bin/env node

import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runShortsPipeline } from '../src/services/shortsPipelineService.js'
import { createTrack2LiveOcrProviderBundle } from '../src/services/shortsTrack2LiveProviderService.js'

const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const SCRIPT_PATH = fileURLToPath(import.meta.url)

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
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

function safeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => ({
      stage: safeString(diagnostic?.stage, 80) || undefined,
      code: safeString(diagnostic?.code, 120) || undefined,
      status: safeString(diagnostic?.status, 120) || undefined,
      reason: safeString(diagnostic?.reason, 120) || undefined,
      sampleStrategy: safeString(diagnostic?.sampleStrategy, 40) || undefined,
      message: safeString(diagnostic?.message, 240) || undefined,
      httpStatus: safeNumber(diagnostic?.httpStatus) || undefined,
      durationSeconds: safeNumber(diagnostic?.durationSeconds) ?? undefined,
      maxDurationSeconds: safeNumber(diagnostic?.maxDurationSeconds) ?? undefined,
      budgetMs: safeNumber(diagnostic?.budgetMs) ?? undefined,
      frameCount: safeNumber(diagnostic?.frameCount) ?? undefined,
      maxFrames: safeNumber(diagnostic?.maxFrames) ?? undefined,
      sampledTimestamps: Array.isArray(diagnostic?.sampledTimestamps)
        ? safeTimestamps(diagnostic.sampledTimestamps)
        : undefined,
      apiKeyPresent: typeof diagnostic?.apiKeyPresent === 'boolean'
        ? diagnostic.apiKeyPresent
        : undefined,
    }))
    .map((diagnostic) => Object.fromEntries(
      Object.entries(diagnostic).filter(([, value]) => value !== undefined),
    ))
    .slice(0, 12)
}

function safeProviderWarnings(result = {}) {
  const warnings = [
    ...(Array.isArray(result.providerWarnings) ? result.providerWarnings : []),
    ...(Array.isArray(result.diagnostics) ? result.diagnostics : [])
      .filter((diagnostic) => /provider|unavailable|error/iu.test(
        `${diagnostic?.code || ''} ${diagnostic?.reason || ''} ${diagnostic?.status || ''}`,
      )),
  ]

  return safeDiagnostics(warnings).slice(0, 8)
}

function safeTimestamps(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(safeNumber)
    .filter((value) => value !== null && value >= 0)
    .slice(0, 8)
}

function safeCandidate(candidate = {}) {
  const evidence = candidate.evidence || {}
  return {
    sourceType: safeString(candidate.sourceType, 80) || null,
    candidateAddress: safeString(candidate.candidateAddress, 300) || null,
    placeName: safeString(candidate.placeName, 200) || null,
    normalizedAddress: safeString(candidate.normalizedAddress, 300) || null,
    formattedAddress: safeString(candidate.formattedAddress, 300) || null,
    placeId: safeString(candidate.placeId, 160) || null,
    timestampSeconds: safeNumber(candidate.timestampSeconds),
    frameIndex: safeNumber(candidate.frameIndex),
    rawText: safeString(candidate.rawText, 300) || null,
    confidence: safeNumber(candidate.confidence),
    riskFlags: (Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [])
      .map((flag) => safeString(flag, 120))
      .filter(Boolean)
      .slice(0, 12),
    verificationReason: safeString(candidate.verificationReason, 160) || null,
    placeVerificationStatus: safeString(candidate.placeVerificationStatus, 120) || null,
    evidence: {
      source: safeString(evidence.source, 40) || null,
      text: safeString(evidence.text, 300) || null,
      timestampSeconds: safeNumber(evidence.timestampSeconds),
      frameIndex: safeNumber(evidence.frameIndex),
    },
  }
}

export function summarizeOutput(result = {}, latencyMs = 0) {
  const candidates = (Array.isArray(result.candidates) ? result.candidates : [])
    .slice(0, 5)
    .map(safeCandidate)
  return {
    track: safeString(result.track, 40) || null,
    resolution: safeString(result.resolution, 40) || null,
    reason: safeString(result.reason, 160) || null,
    addressSource: safeString(result.addressSource, 80) || null,
    address: safeString(result.address, 300) || null,
    normalizedAddress: safeString(result.normalizedAddress, 300) || null,
    placeId: safeString(result.placeId, 160) || null,
    confidence: safeNumber(result.confidence),
    sourceUrl: safeString(result.sourceUrl, 500) || null,
    videoId: safeString(result.videoId, 80) || null,
    stagesPresent: result.stages && typeof result.stages === 'object'
      ? Object.keys(result.stages)
      : [],
    durationSeconds: safeNumber(result.stages?.frameExtraction?.durationSeconds),
    maxDurationSeconds: safeNumber(result.stages?.frameExtraction?.maxDurationSeconds),
    budgetMs: safeNumber(result.stages?.frameExtraction?.budgetMs),
    sampleStrategy: safeString(result.stages?.frameExtraction?.sampleStrategy, 40) || null,
    maxFrames: safeNumber(result.stages?.frameExtraction?.maxFrames),
    sampledTimestamps: safeTimestamps(result.stages?.frameExtraction?.sampledTimestamps),
    frameCount: safeNumber(result.stages?.frameExtraction?.frameCount),
    ocrTextBlockCount: Array.isArray(result.stages?.ocr?.textBlocks)
      ? result.stages.ocr.textBlocks.length
      : null,
    candidateCount: candidates.length,
    asrCandidateCount: Array.isArray(result.stages?.asrCandidateExtraction?.candidates)
      ? result.stages.asrCandidateExtraction.candidates.length
      : 0,
    candidates,
    evidence: candidates.map((candidate) => candidate.evidence),
    diagnostics: safeDiagnostics(result.diagnostics),
    providerWarnings: safeProviderWarnings(result),
    latencyMs,
  }
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/debugShortsPipelineLive.js <youtube-shorts-url>')
    process.exitCode = 1
    return
  }

  const startedAt = Date.now()
  const deps = createLiveDeps()
  try {
    const result = await runShortsPipeline(url, deps)
    const latencyMs = Date.now() - startedAt
    console.log(JSON.stringify(summarizeOutput(result, latencyMs), null, 2))
  } finally {
    await deps.cleanupTrack2LiveProviders?.()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: 'ERROR',
      reason: safeString(error?.code || error?.name || 'DEBUG_SHORTS_PIPELINE_FAILED', 120),
      message: safeString(error?.message || 'debug failed', 240),
    }, null, 2))
    process.exitCode = 1
  })
}
