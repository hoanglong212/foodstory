const DEFAULT_RELATIVE_POSITIONS = [0.12, 0.38, 0.62, 0.88]
const DEFAULT_LABELS = ['HEAD', 'MID_1', 'MID_2', 'TAIL']

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function parseIsoDurationSeconds(value) {
  if (typeof value !== 'string') return null
  const match = value.match(
    /^P(?:\d+D)?T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i,
  )
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  const total = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total >= 0 ? total : null
}

function knownDurationSeconds(context = {}) {
  const metadata = context.metadata || {}
  const direct = finiteNumber(
    context.durationSeconds ??
      context.duration ??
      metadata.durationSeconds ??
      metadata.duration,
  )
  if (direct !== null) return direct

  return parseIsoDurationSeconds(context.duration || metadata.duration)
}

function plannedPosition(index, count) {
  if (index < DEFAULT_RELATIVE_POSITIONS.length) {
    return {
      label: DEFAULT_LABELS[index],
      relativePosition: DEFAULT_RELATIVE_POSITIONS[index],
    }
  }

  const denominator = Math.max(1, count + 1)
  return {
    label: `EXTRA_${index - DEFAULT_RELATIVE_POSITIONS.length + 1}`,
    relativePosition: Math.min(0.95, Math.max(0.05, (index + 1) / denominator)),
  }
}

function timestampForPosition(durationSeconds, relativePosition) {
  if (durationSeconds === null) return null
  const bounded = Math.min(1, Math.max(0, Number(relativePosition) || 0))
  const timestamp = durationSeconds * bounded
  return Number(timestamp.toFixed(3))
}

export function planShortsTrack2V3Frames(context = {}, config = {}) {
  const maxFrames = Math.max(0, Number(config.maxFrames ?? 0))
  const cheapFrameCount = Math.max(0, Number(config.cheapFrameCount ?? 0))
  const plannedCount = Math.min(maxFrames || cheapFrameCount, cheapFrameCount)
  const durationSeconds = knownDurationSeconds(context)

  const plannedFrames = Array.from({ length: plannedCount }, (_, frameIndex) => {
    const position = plannedPosition(frameIndex, plannedCount)
    return {
      frameIndex,
      label: position.label,
      timestampSeconds: timestampForPosition(durationSeconds, position.relativePosition),
      relativePosition: position.relativePosition,
    }
  })

  return {
    status: 'PLANNED',
    sourceUrl: context.url || context.sourceUrl || null,
    videoId: context.videoId || context.metadata?.videoId || null,
    durationSeconds,
    plannedFrames,
    plannedFrameCount: plannedFrames.length,
    maxFrames,
    cheapFrameCount,
  }
}
