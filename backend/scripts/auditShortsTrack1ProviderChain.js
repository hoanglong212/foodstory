#!/usr/bin/env node

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { fetchShortsMetadata } from '../src/services/shortsMetadataFetchService.js'
import { runShortsTrack1Pipeline } from '../src/services/shortsTrack1PipelineService.js'

const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const FIXTURE_PATH = fileURLToPath(
  new URL('../tests/fixtures/youtube-shorts-address-30.json', import.meta.url),
)

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function safeString(value) {
  return String(value || '').trim()
}

function cap(value, maxLength = 140) {
  const text = safeString(value).replace(/\s+/gu, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function envPresent(name) {
  return Boolean(safeString(process.env[name]))
}

function extractGeminiText(payload = {}) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || ''
}

function createLiveGeminiClient({ apiKey, model, fetchImpl }) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`
  return async (request) => {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: JSON.stringify(request, null, 2),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(`Gemini provider error ${response.status}`)
    }

    return JSON.parse(extractGeminiText(JSON.parse(bodyText)) || bodyText)
  }
}

function rowFromResult(item, result) {
  const router = result.stages?.router || null
  const clean = result.stages?.clean || null
  const places = result.stages?.places || null
  const confirm = result.stages?.confirm || null
  const contexts = places?.placeNameContexts || []
  const attempts = places?.queryAttempts || []
  return {
    id: item.id,
    url: item.url,
    title: result.metadata?.title || item.title || '',
    routerTrack: router?.track || null,
    routerReason: router?.reason || null,
    evidenceSource: router?.evidenceSource || null,
    candidateAddress: router?.candidateAddress || null,
    cleanInput: router?.candidateAddress || null,
    placeContext: contexts.map((context) => context.name).filter(Boolean).join(' / ') || null,
    cleanStatus: clean?.status || null,
    cleanDisallowedRepairDetected: clean?.disallowedRepairDetected ?? null,
    cleanedAddress: clean?.normalizedAddress || null,
    cleanExplanation: clean?.explanation || null,
    cleanValidationReason: clean?.rawValidationReason || clean?.validationReason || null,
    placesSearchStatus: places?.status || null,
    placesQueryAttempts: attempts.map((attempt) => attempt.textQuery),
    placesCandidateCount: places?.candidates?.length || 0,
    bestPlaceId: confirm?.bestPlaceId || result.placeId || null,
    geminiConfirmDecision: confirm?.decision || null,
    confidence: Number.isFinite(Number(result.confidence))
      ? Number(result.confidence)
      : null,
    placeVerificationStatus: result.placeVerificationStatus || null,
    finalTrack: result.track,
    finalReason: result.track === 'TRACK_1' ? result.reason : result.reason,
  }
}

function printAuditRow(row) {
  console.log([
    row.id,
    `router=${row.routerTrack || 'null'}/${row.routerReason || 'null'}`,
    `source=${row.evidenceSource || 'null'}`,
    `candidate=${cap(row.candidateAddress, 180) || 'null'}`,
    `cleanInput=${cap(row.cleanInput, 180) || 'null'}`,
    `context=${cap(row.placeContext, 120) || 'null'}`,
    `clean=${row.cleanStatus || 'null'}/${row.cleanDisallowedRepairDetected}`,
    `cleaned=${cap(row.cleanedAddress, 180) || 'null'}`,
    `cleanExplanation=${cap(row.cleanExplanation, 120) || 'null'}`,
    `cleanValidation=${cap(row.cleanValidationReason, 120) || 'null'}`,
    `placesSearchStatus=${row.placesSearchStatus || 'null'}`,
    `queries=${row.placesQueryAttempts.map((query) => cap(query, 120)).join(' || ') || 'none'}`,
    `places=${row.placesCandidateCount}`,
    `bestPlaceId=${row.bestPlaceId || 'null'}`,
    `confirm=${row.geminiConfirmDecision || 'null'}`,
    `placeVerification=${row.placeVerificationStatus || 'null'}`,
    `confidence=${row.confidence ?? 'null'}`,
    `final=${row.finalTrack}/${row.finalReason}`,
  ].join(' | '))
}

async function main() {
  const requiredEnv = [
    'YOUTUBE_API_KEY',
    'GOOGLE_PLACES_API_KEY',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
  ]
  for (const name of requiredEnv) {
    console.log(`${name}: ${envPresent(name) ? 'present' : 'missing'}`)
  }
  console.log('OCR/ASR/yt-dlp/ffmpeg/browser/captions: not called')

  const missing = requiredEnv.filter((name) => !envPresent(name))
  if (missing.length) {
    console.error(`missing required env: ${missing.join(', ')}`)
    process.exitCode = 1
    return
  }

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  const cases = fixture.cases
    .filter((item) => item.expectedTrack === 'TRACK_1')
    .slice(0, 10)
  const geminiClient = createLiveGeminiClient({
    apiKey: safeString(process.env.GEMINI_API_KEY),
    model: safeString(process.env.GEMINI_MODEL),
    fetchImpl: globalThis.fetch,
  })

  const rows = []
  for (const item of cases) {
    try {
      const result = await runShortsTrack1Pipeline(item.url, {
        fetchShortsMetadata: async (url) =>
          fetchShortsMetadata(url, {
            fetch: globalThis.fetch,
            youtubeApiKey: safeString(process.env.YOUTUBE_API_KEY),
          }),
        fetch: globalThis.fetch,
        googlePlacesApiKey: safeString(process.env.GOOGLE_PLACES_API_KEY),
        geminiClient,
      })
      const row = rowFromResult(item, result)
      rows.push(row)
      printAuditRow(row)
    } catch (error) {
      const row = {
        id: item.id,
        url: item.url,
        title: item.title || '',
        routerTrack: null,
        routerReason: null,
        evidenceSource: null,
        candidateAddress: null,
        cleanInput: null,
        placeContext: null,
        cleanStatus: null,
        cleanDisallowedRepairDetected: null,
        cleanedAddress: null,
        cleanExplanation: null,
        cleanValidationReason: null,
        placesSearchStatus: null,
        placesQueryAttempts: [],
        placesCandidateCount: 0,
        bestPlaceId: null,
        geminiConfirmDecision: null,
        confidence: null,
        placeVerificationStatus: null,
        finalTrack: 'TRACK_2',
        finalReason: safeString(error?.message) || 'PROVIDER_CHAIN_FAILED',
      }
      rows.push(row)
      printAuditRow(row)
    }
  }

  const reachingClean = rows.filter((row) => row.routerTrack === 'TRACK_1').length
  const reachingPlaces = rows.filter((row) => row.cleanedAddress).length
  const reachingConfirm = rows.filter((row) => row.geminiConfirmDecision).length
  const finalTrack1 = rows.filter((row) => row.finalTrack === 'TRACK_1').length
  const rejected = rows.filter((row) => row.finalTrack !== 'TRACK_1')

  console.log('\nSummary')
  console.log(`cases=${rows.length}`)
  console.log(`reachingGeminiClean=${reachingClean}`)
  console.log(`reachingPlaces=${reachingPlaces}`)
  console.log(`reachingGeminiConfirm=${reachingConfirm}`)
  console.log(`finalTrack1=${finalTrack1}`)
  console.log(`rejected=${rejected.map((row) => `${row.id}:${row.finalReason}`).join(', ') || 'none'}`)
}

main().catch((error) => {
  console.error(safeString(error?.message) || 'provider_chain_audit_failed')
  process.exitCode = 1
})
