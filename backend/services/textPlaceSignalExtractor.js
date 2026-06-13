const EXPLICIT_PLACE_PATTERN =
  /^(?:place|restaurant|cafe|coffee|shop|venue)\s*[:\-]\s*(.+)$/i

export function extractTextPlaceSignal({ hint = '' } = {}) {
  const cleanedHint = String(hint || '').replace(/\s+/g, ' ').trim()
  const explicitMatch = cleanedHint.match(EXPLICIT_PLACE_PATTERN)

  return {
    candidateName: explicitMatch?.[1]?.trim() || null,
    confidence: explicitMatch ? 0.4 : 0,
    usable: Boolean(explicitMatch?.[1]?.trim()),
    reason: explicitMatch
      ? 'An explicit place-shaped hint was found, but place matching is deferred to Part 4.'
      : 'No independently verifiable place signal is available in Part 1.',
  }
}
