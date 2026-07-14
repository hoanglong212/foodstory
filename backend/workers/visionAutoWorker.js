import '../config/env.js'
import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'
import { buildMetadataLocationHypothesis, decideVisionMetadataFastPath, fetchVisionMetadata, resolveMetadataLocalPlace } from '../services/visionAuto/visionMetadataHypothesisService.js'
import { buildVisionAutoResponse } from '../services/visionAuto/visionResponseBuilder.js'
import { normalizeVisionAutoUrl } from '../services/visionAuto/visionAutoUrlPolicyService.js'
import { getVisionAutoRuntimeConfig } from '../services/visionAuto/visionAutoConfig.js'
import { resolveVisionLocationHypotheses } from '../services/visionAuto/visionPlaceResolverService.js'
import { decideVisionAutoResult } from '../services/visionAuto/visionFinalDecisionService.js'

let active = null

function send(message) {
  if (process.send) process.send(message)
}

function cleanInput(value) {
  try {
    const normalized = normalizeVisionAutoUrl(value, { assetTypeHint: 'video' })
    return normalized.type === 'youtube_url' ? normalized : null
  } catch {
    return null
  }
}

process.on('message', async (message) => {
  if (!message || message.type !== 'start' || active) return
  const input = cleanInput(message.sourceUrl)
  if (!input) {
    send({ type: 'failed', jobId: message.jobId, reason: 'invalid_source' })
    process.exit(1)
    return
  }

  const controller = new AbortController()
  const deadlineAt = Number(message.deadlineAt)
  const remainingMs = Number.isFinite(deadlineAt)
    ? Math.max(1_000, deadlineAt - Date.now())
    : 180_000
  const deadlineTimer = setTimeout(() => controller.abort(), remainingMs)
  deadlineTimer.unref?.()
  active = {
    jobId: String(message.jobId),
    controller,
    startedAt: Date.now(),
  }
  const heartbeat = setInterval(() => send({
    type: 'heartbeat',
    jobId: active.jobId,
    stage: 'deep_analysis',
    elapsedMs: Date.now() - active.startedAt,
  }), 5_000)
  heartbeat.unref?.()

  send({ type: 'ready', jobId: active.jobId })
  try {
    if (message.fastMetadataEnabled === true) {
      send({ type: 'stage', jobId: active.jobId, stage: 'metadata' })
      const metadata = await fetchVisionMetadata(input.url)
      const local = await resolveMetadataLocalPlace(metadata)
      const fastPath = decideVisionMetadataFastPath({ metadata, localPlace: local })
      if (fastPath.terminal && fastPath.status === 'matched_place') {
        send({ type: 'stage', jobId: active.jobId, stage: 'resolving' })
        send({
          type: 'result',
          jobId: active.jobId,
          result: buildVisionAutoResponse({
            status: 'matched_place',
            place: fastPath.place,
            input,
            sourceContext: { isMultiPlace: false, resolvedCount: 1 },
          }),
        })
        return
      }
      const metadataHypothesis = buildMetadataLocationHypothesis(metadata)
      if (metadataHypothesis) {
        send({ type: 'stage', jobId: active.jobId, stage: 'resolving' })
        const resolution = await resolveVisionLocationHypotheses({
          hypotheses: [metadataHypothesis],
          config: getVisionAutoRuntimeConfig(),
          signal: controller.signal,
        })
        const decision = decideVisionAutoResult({
          placeCandidates: resolution.placeCandidates,
          resolution: resolution.resolution,
          sourceContext: { isMultiPlace: false },
        })
        if (decision.status === 'matched_place' || decision.status === 'external_place_found') {
          send({
            type: 'result',
            jobId: active.jobId,
            result: buildVisionAutoResponse({ ...decision, input }),
          })
          return
        }
      }
    }

    send({ type: 'stage', jobId: active.jobId, stage: 'deep_analysis' })
    const result = await analyzeVisionAutoV2({
      url: input.url,
      assetTypeHint: 'video',
      maxDurationSec: message.maxDurationSec,
      signal: controller.signal,
    })
    send({ type: 'stage', jobId: active.jobId, stage: 'resolving' })
    send({ type: 'result', jobId: active.jobId, result })
  } catch {
    send({
      type: 'failed',
      jobId: active.jobId,
      reason: controller.signal.aborted ? 'cancelled' : 'service_failure',
    })
  } finally {
    clearTimeout(deadlineTimer)
    clearInterval(heartbeat)
    send({ type: 'stage', jobId: active.jobId, stage: 'cleanup' })
    process.disconnect?.()
    process.exit(0)
  }
})

process.on('message', (message) => {
  if (
    message?.type === 'cancel' &&
    active &&
    String(message.jobId) === active.jobId
  ) {
    active.controller.abort()
  }
})
