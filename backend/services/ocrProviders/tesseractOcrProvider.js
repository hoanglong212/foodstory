import { extractLocalOcrSignals } from '../localOcrService.js'

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizedLinesFromEvidence(evidence = {}) {
  const canonical = Array.isArray(evidence?.debug?.canonicalClusters)
    ? evidence.debug.canonicalClusters
    : []
  const lines = []
  const seen = new Set()

  for (const cluster of canonical) {
    const variants = Array.isArray(cluster?.evidenceVariants)
      ? cluster.evidenceVariants
      : []
    for (const variant of variants) {
      const text = String(variant?.text || '').trim()
      const sourcePass = String(variant?.pass || 'tesseract').trim()
      const key = `${sourcePass}:${text.toLowerCase()}`
      if (!text || seen.has(key)) continue
      seen.add(key)
      lines.push({
        text,
        confidence: roundScore(variant?.confidence),
        box: null,
        sourcePass,
      })
    }
  }

  if (!lines.length) {
    for (const line of Array.isArray(evidence?.lines) ? evidence.lines : []) {
      const text = String(line?.text || '').trim()
      if (!text) continue
      lines.push({
        text,
        confidence: roundScore(line?.confidence),
        box: null,
        sourcePass: evidence?.debug?.selectedPass || 'tesseract',
      })
    }
  }

  return lines.slice(0, 80)
}

export async function runTesseractOcrProvider(
  { image } = {},
  {
    extractSignals = extractLocalOcrSignals,
    timeoutMs,
    maxPasses,
  } = {},
) {
  const startedAt = Date.now()
  const evidence = await extractSignals(
    { image },
    {
      ...(Number.isFinite(Number(timeoutMs))
        ? { timeoutMs: Number(timeoutMs) }
        : {}),
      ...(Number.isFinite(Number(maxPasses))
        ? { maxPasses: Number(maxPasses) }
        : {}),
    },
  )
  const lines = normalizedLinesFromEvidence(evidence)

  return {
    provider: 'tesseract',
    rawText:
      evidence?.debug?.rawText ||
      evidence?.debug?.cleanedText ||
      evidence?.text ||
      '',
    lines,
    debug: {
      durationMs: Date.now() - startedAt,
      passesRun: Array.isArray(evidence?.debug?.passes)
        ? evidence.debug.passes.length
        : 0,
      providerStatus: evidence?.usable ? 'success' : evidence?.reason || 'empty',
    },
    evidence,
  }
}

export default runTesseractOcrProvider
