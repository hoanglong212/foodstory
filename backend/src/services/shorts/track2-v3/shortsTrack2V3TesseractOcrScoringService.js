import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function addressLineProfile(line = '') {
  const text = normalizeShortsTrack2V3Text(line)
  const folded = foldVietnameseText(text)
  const hasSlashNumber = /(?:^|\s)\d{1,5}[a-z]?\s*\/\s*\d{1,5}(?=$|\s|[,.;:-])/iu.test(folded)
  const hasSplitSlashNumber = /(?:^|\s)\d{2,5}\s+\d{1,4}\s*\/\s*\d{1,4}(?=$|\s|[,.;:-])/iu
    .test(folded)
  const hasWard = /\b(?:phuong|phudng|p\.?)(?:\s*)[0-9o]+\b/iu.test(folded)
  const hasDistrict = /\b(?:quan|qudn|q\.?)(?:\s*)[0-9o]+\b/iu.test(folded)
  const hasNumericWard = /\b(?:phuong|phudng|p\.?)\s*\d+\b/iu.test(folded)
  const hasNumericDistrict = /\b(?:quan|qudn|q\.?)\s*\d+\b/iu.test(folded)
  const uncertainAdminDigit = /\b(?:phuong|phudng|p\.?|quan|qudn|q\.?)\s*\d*o\b/iu.test(folded)

  return {
    text,
    folded,
    hasSlashNumber,
    hasSplitSlashNumber,
    hasWard,
    hasDistrict,
    hasNumericWard,
    hasNumericDistrict,
    uncertainAdminDigit,
    hasAdmin: hasWard || hasDistrict,
  }
}

function addressLineScore(profile = {}) {
  let score = 0
  if (profile.hasSlashNumber) score += 28
  if (profile.hasSplitSlashNumber) score -= 8
  if (profile.hasNumericWard) score += 18
  else if (profile.hasWard) score += 6
  if (profile.hasNumericDistrict) score += 18
  else if (profile.hasDistrict) score += 6
  if (profile.hasWard && profile.hasDistrict) score += 8
  if (profile.text.length >= 12 && profile.text.length <= 90) score += 10
  if (profile.text.length > 120) score -= 12
  return score
}

function bestAddressLine(rawText = '') {
  const profiles = normalizeShortsTrack2V3Text(rawText)
    .split('\n')
    .map(addressLineProfile)
    .filter((profile) => profile.text)
    .sort((a, b) => addressLineScore(b) - addressLineScore(a) || a.text.length - b.text.length)
  const best = profiles[0] || addressLineProfile('')
  return {
    ...best,
    score: addressLineScore(best),
  }
}

function garbageProfile(rawText = '') {
  const text = normalizeShortsTrack2V3Text(rawText)
  const tokens = text.split(/\s+/u).filter(Boolean)
  const symbolRuns = text.match(/[|_~^={}<>\\]{1,}/gu) || []
  const punctuationRuns = text.match(/[!?@#$%*]{2,}/gu) || []
  const singleLetterTokens = tokens.filter((token) => /^\p{L}$/u.test(token)).length
  const replacementCharacters = (text.match(/�/gu) || []).length
  const unexpectedSymbols = (
    text.match(/[^\p{L}\p{N}\s/.,:;()'’@+\-]/gu) || []
  ).length
  return {
    symbolRuns: symbolRuns.length,
    punctuationRuns: punctuationRuns.length,
    excessiveSingleLetterTokens: Math.max(0, singleLetterTokens - 2),
    replacementCharacters,
    unexpectedSymbols,
    total: symbolRuns.length +
      punctuationRuns.length +
      Math.max(0, singleLetterTokens - 2) +
      replacementCharacters +
      unexpectedSymbols,
  }
}

export function scoreShortsTrack2V3TesseractOutput({
  rawText = '',
  confidence = 0,
  preprocessVariant = 'original',
  psm = 6,
} = {}) {
  const text = normalizeShortsTrack2V3Text(rawText)
  const lineCount = text ? text.split('\n').filter(Boolean).length : 0
  const address = bestAddressLine(text)
  const garbage = garbageProfile(text)
  const normalizedConfidence = Math.max(0, Math.min(1, finiteNumber(confidence, 0)))
  const qualityFlags = []
  let score = normalizedConfidence * 12 + address.score

  if (!text) score -= 100
  if (lineCount <= 3) score += 5
  if (address.text && text === address.text) score += 10
  if (lineCount > 5) score -= (lineCount - 5) * 4
  if (text.length > 160) score -= Math.min(30, (text.length - 160) / 5)
  if (address.text && text.length > address.text.length * 2.5) score -= 10
  if (address.text) score -= Math.max(0, text.length - address.text.length) / 3
  score -= garbage.total * 6
  if ([11, 12].includes(Number(psm))) score += 8
  if (address.uncertainAdminDigit) score -= 2

  if (preprocessVariant === 'original') score += 12
  else if (['upscale_3x_gray', 'upscale_4x_gray'].includes(preprocessVariant)) score += 8
  else if (preprocessVariant === 'sharpen_contrast') score += 4
  else if (preprocessVariant === 'inverted_threshold') score -= 2
  else if (preprocessVariant === 'tight_address_line') {
    score += address.hasSplitSlashNumber || !address.hasSlashNumber || address.uncertainAdminDigit
      ? -15
      : 4
  }

  const uncertainHouseNumber = Boolean(address.hasSplitSlashNumber || !address.hasSlashNumber)
  if (uncertainHouseNumber) qualityFlags.push('UNCERTAIN_HOUSE_NUMBER')
  if (address.uncertainAdminDigit) qualityFlags.push('UNCERTAIN_ADMIN_DIGIT')
  if (garbage.total > 0) qualityFlags.push('OCR_GARBAGE_TOKENS')
  if (text.length > 160 || lineCount > 5) qualityFlags.push('OCR_LONG_NOISY_TEXT')
  if (normalizedConfidence < 0.6) qualityFlags.push('LOW_PROVIDER_CONFIDENCE')
  const lowConfidence = qualityFlags.length > 0 || score < 65

  return {
    score: Number(score.toFixed(4)),
    bestAddressLine: address.text || null,
    confidence: normalizedConfidence,
    preprocessVariant,
    psm: Number(psm),
    lowConfidence,
    uncertainHouseNumber,
    qualityFlags: [...new Set(qualityFlags)],
    features: {
      hasSlashNumber: address.hasSlashNumber,
      hasSplitSlashNumber: address.hasSplitSlashNumber,
      hasWard: address.hasWard,
      hasDistrict: address.hasDistrict,
      hasNumericWard: address.hasNumericWard,
      hasNumericDistrict: address.hasNumericDistrict,
      lineCount,
      textLength: text.length,
      garbageTokenCount: garbage.total,
    },
  }
}

function attemptAddressSignature(attempt = {}) {
  const line = normalizeShortsTrack2V3Text(attempt.scoring?.bestAddressLine || '')
  if (!line) return null
  const folded = foldVietnameseText(line)
  const house = folded.match(/(?:^|\s)(\d{1,5})(?:\s+(\d{1,4}))?\s*\/\s*(\d{1,5})(?=$|\s|[,.;:-])/iu)
  if (!house) return null
  const ward = folded.match(/\b(?:phuong|phudng|p\.?)\s*([0-9o]+)\b/iu)
  const district = folded.match(/\b(?:quan|qudn|q\.?)\s*([0-9o]+)\b/iu)
  const admin = (value) => String(value || '').replace(/o/giu, '0')
  return [
    house[1],
    house[2] || '',
    house[3],
    admin(ward?.[1]),
    admin(district?.[1]),
  ].join(':')
}

export function selectBestShortsTrack2V3TesseractAttempt(attempts = []) {
  const prepared = (Array.isArray(attempts) ? attempts : [])
    .map((attempt) => ({
      ...attempt,
      scoring: attempt.scoring || scoreShortsTrack2V3TesseractOutput(attempt),
    }))
    .filter((attempt) => normalizeShortsTrack2V3Text(attempt.rawText))
  const signatureCounts = new Map()
  for (const attempt of prepared) {
    const signature = attemptAddressSignature(attempt)
    if (!signature) continue
    signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
  }
  const ranked = prepared
    .map((attempt) => {
      const signature = attemptAddressSignature(attempt)
      const consensusCount = signature ? signatureCounts.get(signature) || 1 : 1
      return {
        ...attempt,
        selectionScore: attempt.scoring.score + Math.min(30, (consensusCount - 1) * 4),
        consensusCount,
      }
    })
    .sort((a, b) =>
      b.selectionScore - a.selectionScore ||
      b.consensusCount - a.consensusCount ||
      b.scoring.score - a.scoring.score ||
      b.scoring.confidence - a.scoring.confidence ||
      (a.scoring.bestAddressLine?.length || a.rawText.length) -
        (b.scoring.bestAddressLine?.length || b.rawText.length)
    )

  if (!ranked.length) return null
  return {
    ...ranked[0],
    attemptSummaries: ranked.slice(0, 8).map((attempt) => ({
      preprocessVariant: attempt.preprocessVariant,
      psm: attempt.psm,
      score: attempt.scoring.score,
      selectionScore: attempt.selectionScore,
      consensusCount: attempt.consensusCount,
      confidence: attempt.scoring.confidence,
      bestAddressLine: attempt.scoring.bestAddressLine,
      qualityFlags: attempt.scoring.qualityFlags,
    })),
  }
}

export default {
  scoreShortsTrack2V3TesseractOutput,
  selectBestShortsTrack2V3TesseractAttempt,
}
