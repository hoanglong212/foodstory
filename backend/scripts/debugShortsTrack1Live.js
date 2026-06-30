#!/usr/bin/env node

import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { parseShortsUrl, routeShortsAddress } from '../src/services/shortsAddressRouterService.js'
import { fetchShortsMetadata } from '../src/services/shortsMetadataFetchService.js'
import { cleanAddressNoRepair } from '../src/services/shortsGeminiAddressCleanService.js'
import { confirmAddressWithPlaces } from '../src/services/shortsPlacesConfirmService.js'
import { confirmExplicitAddressWithGemini } from '../src/services/shortsGeminiAddressConfirmService.js'
import { runShortsTrack1Pipeline } from '../src/services/shortsTrack1PipelineService.js'

const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const ENV_KEYS = [
  'YOUTUBE_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
]

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function excerpt(text, maxLength = 300) {
  const value = String(text || '').replace(/\s+/gu, ' ').trim()
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function print(label, value) {
  console.log(`\n${label}`)
  console.dir(value, { depth: 8, colors: true })
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    console.error(`Missing ${name}. Stopping before provider stage.`)
    process.exitCode = 1
    return null
  }
  return value
}

function printSafeEnvCheck() {
  console.log('env check')
  for (const key of ENV_KEYS) {
    const status = String(process.env[key] || '').trim() ? 'present' : 'missing'
    console.log(`${key}: ${status}`)
  }
}

function extractGeminiText(payload = {}) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || ''
}

function createLiveGeminiClient({ apiKey, model, fetchImpl }) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`
  const client = async (request) => {
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
      const error = new Error(`Gemini HTTP ${response.status}: ${bodyText}`)
      client.lastError = error
      throw error
    }

    try {
      return JSON.parse(extractGeminiText(JSON.parse(bodyText)) || bodyText)
    } catch (error) {
      client.lastError = error
      throw error
    }
  }

  client.lastError = null
  return client
}

async function main() {
  printSafeEnvCheck()

  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/debugShortsTrack1Live.js "https://www.youtube.com/shorts/<id>"')
    process.exitCode = 1
    return
  }

  const parsed = parseShortsUrl(url)
  console.log(`input URL: ${url}`)
  console.log(`parsed videoId: ${parsed.videoId || '(invalid)'}`)
  if (!parsed.ok) {
    print('final output', {
      track: 'TRACK_2',
      reason: parsed.reason,
      sourceUrl: url,
      videoId: null,
    })
    process.exitCode = 1
    return
  }

  const youtubeApiKey = requireEnv('YOUTUBE_API_KEY')
  if (!youtubeApiKey) return

  const metadata = await fetchShortsMetadata(url, {
    fetch: globalThis.fetch,
    youtubeApiKey,
  })
  console.log(`fetched title: ${metadata.title}`)
  console.log(`fetched description excerpt: ${excerpt(metadata.description)}`)
  print('metadata jsonld count', metadata.jsonldObjects.length)

  const router = routeShortsAddress(metadata)
  print('router result', router)
  print('candidate address', router.candidateAddress)
  if (router.track !== 'TRACK_1') {
    print('final output', {
      track: 'TRACK_2',
      reason: router.reason,
      sourceUrl: url,
      videoId: metadata.videoId,
      signals: router.signals,
      stages: { router, clean: null, places: null, confirm: null },
      metadata,
    })
    return
  }

  const geminiApiKey = requireEnv('GEMINI_API_KEY')
  const geminiModel = requireEnv('GEMINI_MODEL')
  if (!geminiApiKey || !geminiModel) return

  const geminiClient = createLiveGeminiClient({
    apiKey: geminiApiKey,
    model: geminiModel,
    fetchImpl: globalThis.fetch,
  })

  const clean = await cleanAddressNoRepair({
    rawCandidate: router.candidateAddress,
    sourceType: router.evidenceSource,
    sourceName: router.reason,
    sourceSnippet: metadata[router.evidenceSource] || '',
    geminiClient,
  })
  print('Gemini clean result', clean)
  if (geminiClient.lastError) print('Gemini provider error', geminiClient.lastError.message)

  if (clean.status !== 'OK' || clean.disallowedRepairDetected) {
    print('final output', await runShortsTrack1Pipeline(url, {
      fetchShortsMetadata: async () => metadata,
      cleanAddressNoRepair: async () => clean,
      confirmAddressWithPlaces,
      confirmExplicitAddressWithGemini,
      fetch: globalThis.fetch,
      geminiClient,
    }))
    return
  }

  const googlePlacesApiKey = requireEnv('GOOGLE_PLACES_API_KEY')
  if (!googlePlacesApiKey) return

  const places = await confirmAddressWithPlaces({
    normalizedAddress: clean.normalizedAddress,
    shopName: metadata.title,
    googlePlacesApiKey,
    fetch: globalThis.fetch,
  })
  print('Places candidates', places)

  const confirm = await confirmExplicitAddressWithGemini({
    sourceType: router.evidenceSource,
    rawCandidate: router.candidateAddress,
    normalizedCandidate: clean.normalizedAddress,
    shopName: metadata.title,
    placesCandidates: places.candidates,
    geminiClient,
  })
  print('Gemini confirm result', confirm)
  if (geminiClient.lastError) print('Gemini provider error', geminiClient.lastError.message)

  print('final output', await runShortsTrack1Pipeline(url, {
    fetchShortsMetadata: async () => metadata,
    cleanAddressNoRepair: async () => clean,
    confirmAddressWithPlaces: async () => places,
    confirmExplicitAddressWithGemini: async () => confirm,
    fetch: globalThis.fetch,
    googlePlacesApiKey,
    geminiClient,
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
