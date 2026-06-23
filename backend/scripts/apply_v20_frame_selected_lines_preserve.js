import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve('services/visionAuto/visionEvidenceCollectorService.js')
if (!fs.existsSync(target)) {
  console.error(`[v20] Missing target file: ${target}`)
  process.exit(1)
}

let source = fs.readFileSync(target, 'utf8')
const backup = `${target}.bak-v20-${Date.now()}`

const before = `function boundedFrameOcrEvidence(
  evidence,
  timestampSeconds,
  sourceCrop = 'full',
) {
  const inspected = inspectYoutubeFrameOcrEvidence(evidence, { sourceCrop })
  const lines = inspected.lines
  if (!lines.length) return null
  return {`

const after = `function boundedFrameOcrEvidence(
  evidence,
  timestampSeconds,
  sourceCrop = 'full',
) {
  const inspected = inspectYoutubeFrameOcrEvidence(evidence, { sourceCrop })

  // v20: preserve selected provider lines that are already typed as address/phone.
  // Some mocked/frame OCR cases return a usable evidence object whose selected
  // lines are structurally valid, but the frame inspector may not recover them
  // after additional safety filtering.  Keep these explicit selected lines so
  // addresses like "273/17 Tôn Thất Hiệp" and phones from crop OCR are not lost.
  const inspectedLines = Array.isArray(inspected?.lines) ? inspected.lines : []
  const selectedStructuralLines = frameEvidenceLines(evidence).filter((line) =>
    ['address', 'phone'].includes(String(line?.type || '').toLowerCase()),
  )
  const seen = new Set(
    inspectedLines
      .map((line) => capText(line?.evidenceText || line?.text, 220).toLowerCase())
      .filter(Boolean),
  )
  const lines = [...inspectedLines]
  for (const line of selectedStructuralLines) {
    const text = capText(line?.text, 220)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    lines.push({
      text,
      confidence: Math.max(0.56, Number(line?.confidence) || 0),
      type: String(line?.type || 'other').toLowerCase(),
      tier: line?.tier || 'strong',
      sourceCrop: capText(sourceCrop, 40),
      evidenceText: text,
    })
  }

  if (!lines.length) return null
  return {`

if (source.includes(after)) {
  console.log('[v20] Patch already applied.')
  process.exit(0)
}

if (!source.includes(before)) {
  console.error('[v20] Could not find boundedFrameOcrEvidence block to patch. File may have changed.')
  process.exit(1)
}

source = source.replace(before, after)
fs.writeFileSync(backup, fs.readFileSync(target, 'utf8'))
fs.writeFileSync(target, source)
console.log(`[v20] Patched ${target}`)
console.log(`[v20] Backup written to ${backup}`)
