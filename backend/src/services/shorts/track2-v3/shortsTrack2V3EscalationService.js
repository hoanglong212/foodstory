function bool(value, fallback = false) {
  if (value == null) return fallback
  return Boolean(value)
}

function textBlockCount(ocrResult = {}) {
  if (Array.isArray(ocrResult.textBlocks)) return ocrResult.textBlocks.length
  return Number.isFinite(Number(ocrResult.metrics?.ocrTextBlockCount))
    ? Number(ocrResult.metrics.ocrTextBlockCount)
    : 0
}

function providerWorked(ocrResult = {}) {
  const status = String(ocrResult.status || '').trim().toUpperCase()
  if (status === 'OK') return true
  return textBlockCount(ocrResult) > 0
}

function hasUsefulCandidate(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).some((candidate) =>
    candidate?.type !== 'PLACE_NAME_ONLY'
  )
}

function evidenceHasUsefulAddressSignal(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).some((item) => {
    const tokens = item?.tokens || {}
    return Boolean(
      tokens.hasHouseNumber &&
        (tokens.hasStreetLike || tokens.hasWard || tokens.hasDistrict),
    )
  })
}

function cheapOnly(reason = 'CHEAP_OCR_COMPLETE') {
  return {
    status: 'CHEAP_OCR_ONLY',
    escalationLevel: 'CHEAP_OCR',
    geminiAllowed: false,
    placesAllowed: false,
    ocrBoostAllowed: false,
    ocrBoostReason: reason,
  }
}

export function decideShortsTrack2V3Escalation({
  candidates = [],
  evidence = [],
  ocrResult = {},
  config = {},
} = {}) {
  const ocrBoostEnabled = bool(
    config.ocrBoostEnabled,
    bool(config.track2V3OcrBoostEnabled, true),
  )
  const debugBoost = bool(config.ocrBoostDebugEnabled, false)
  const usefulCandidate = hasUsefulCandidate(candidates)

  if (!ocrBoostEnabled) return cheapOnly('OCR_BOOST_DISABLED')
  if (usefulCandidate && !debugBoost) return cheapOnly('CHEAP_OCR_ALREADY_HAS_CANDIDATES')
  if (!providerWorked(ocrResult)) return cheapOnly('CHEAP_OCR_PROVIDER_DID_NOT_WORK')

  const blockCount = textBlockCount(ocrResult)
  let reason = 'OCR_BOOST_NO_USEFUL_ADDRESS_CANDIDATE'

  if (Array.isArray(candidates) && candidates.length === 0 && blockCount > 0) {
    reason = 'OCR_BOOST_CHEAP_TEXT_NO_CANDIDATES'
  } else if (blockCount <= 1) {
    reason = 'OCR_BOOST_FEW_TEXT_BLOCKS'
  } else if (!evidenceHasUsefulAddressSignal(evidence)) {
    reason = 'OCR_BOOST_TITLE_OR_INTRO_ONLY'
  } else if (debugBoost) {
    reason = 'OCR_BOOST_DEBUG_REQUESTED'
  }

  return {
    status: 'OCR_BOOST',
    escalationLevel: 'OCR_BOOST',
    geminiAllowed: false,
    placesAllowed: false,
    ocrBoostAllowed: true,
    ocrBoostReason: reason,
  }
}
