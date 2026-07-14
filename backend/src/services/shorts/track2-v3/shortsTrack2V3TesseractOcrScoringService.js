import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function adminMatch(folded = '') {
  return folded.match(
    /\b(?:phuong|phudng|phung|phuung|phurong|phirong|quan|qudn|qun|district|ward|tp\.?|thanh pho|huyen|xa)\b|(?:^|[\s,;(/-])[pq]\.(?=\s|\d)|(?:^|[\s,;(/-])[pq](?=\s*\d)/iu,
  )
}

function hasWardAnchor(folded = '') {
  return /\b(?:phuong|phudng|phung|phuung|phurong|phirong)\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])p\.\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])p\s*\d+\b/iu.test(folded)
}

function hasDistrictAnchor(folded = '') {
  return /\b(?:quan|qudn|qun)\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])q\.\s*(?:\d+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,3})\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])q\s*\d+\b/iu.test(folded)
}

function streetSegmentAfterHouse(text = '', folded = '') {
  const house = folded.match(
    /(?:^|[\s,.:;])(?:so\s*)?(\d{1,5}[a-z]?(?:\s*\/\s*\d{1,5}[a-z]?)?)(?=$|[\s,.:;/-])/iu,
  )
  if (!house || house.index == null) return ''
  const digitOffset = house[0].search(/\d/u)
  const start = house.index + Math.max(0, digitOffset) + house[1].length
  const remaining = folded.slice(start)
  const admin = adminMatch(remaining)
  return remaining.slice(0, admin?.index ?? remaining.length)
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function streetWordCount(segment = '') {
  return (segment.match(/[\p{L}]{2,}/gu) || []).length
}

function addressLineProfile(line = '') {
  const text = normalizeShortsTrack2V3Text(line)
  const folded = foldVietnameseText(text)
    .replace(/\bphu\s+ong['’]?(?=\s*\d)/gu, 'phuong ')
    .replace(/\bphirong['’]?(?=\s*\d)/gu, 'phuong ')
    .replace(/\b(phuong)\s+(\d{1,2})\s*:(?=\s*\p{L})/gu, '$1 $2,')
    .replace(/(\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?))["'’]+(?=\p{L})/gu, '$1 ')
  const hasSlashNumber = /(?:^|[\s,.:;])\d{1,5}[a-z]?\s*\/\s*\d{1,5}[a-z]?(?=$|[\s,.;:-])/iu
    .test(folded)
  const hasSplitSlashNumber = /(?:^|[\s,.:;])\d{2,5}\s+\d{1,4}\s*\/\s*\d{1,4}(?=$|[\s,.;:-])/iu
    .test(folded)
  const hasPlainHouseNumber = /(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?=$|[\s,.:;/-])/iu
    .test(folded)
  const hasWard = hasWardAnchor(folded)
  const hasDistrict = hasDistrictAnchor(folded)
  const hasNumericWard = /\b(?:phuong|phudng|phung|phuung|phurong|phirong)\s*\d+\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])p\.?\s*\d+\b/iu.test(folded)
  const hasNumericDistrict = /\b(?:quan|qudn|qun)\s*\d+\b/iu.test(folded) ||
    /(?:^|[\s,;(/-])q\.?\s*\d+\b/iu.test(folded)
  const uncertainAdminDigit = /\b(?:phuong|phudng|phung|phuung|phurong|phirong|p\.?|quan|qudn|qun|q\.?)\s*\d*o\b/iu
    .test(folded)
  const hasExplicitStreetMarker = /(?:^|[\s,.:;])(?:duong|d\.|street|st\.?|road|rd\.|hem|ngo|ngach|alley)\b/iu
    .test(folded)
  const streetSegment = streetSegmentAfterHouse(text, folded)
  const namedStreetWordCount = streetWordCount(streetSegment)
  const hasStreetLike = hasExplicitStreetMarker || namedStreetWordCount >= 2
  const hasHouseNumber = hasSlashNumber || hasPlainHouseNumber
  const hasAdmin = hasWard || hasDistrict
  const hasPhoneLike = /(?:\+?84|0)\s*(?:\d[\s.-]*){8,10}\d/u.test(text)
  const hasTimeLike = /\b\d{1,2}(?::|h)\d{2}\s*(?:-|den|toi)\s*\d{1,2}(?::|h)\d{2}\b/iu.test(folded)
  const hasPriceLike = /\b\d{1,4}\s*k\b/iu.test(folded)
  const hasListPrefix = /^\s*\d{1,2}\s*[.)-]\s+/u.test(text)

  return {
    text,
    folded,
    hasSlashNumber,
    hasSplitSlashNumber,
    hasPlainHouseNumber,
    hasHouseNumber,
    hasWard,
    hasDistrict,
    hasNumericWard,
    hasNumericDistrict,
    uncertainAdminDigit,
    hasAdmin,
    hasExplicitStreetMarker,
    namedStreetWordCount,
    hasStreetLike,
    hasPhoneLike,
    hasTimeLike,
    hasPriceLike,
    hasListPrefix,
    isAddressLike: Boolean(hasHouseNumber && hasStreetLike && hasAdmin),
  }
}

function addressLineScore(profile = {}) {
  let score = 0
  if (profile.hasSlashNumber) score += 28
  else if (profile.hasPlainHouseNumber) score += 18
  if (profile.hasSplitSlashNumber) score -= 10
  if (profile.hasExplicitStreetMarker) score += 18
  else if (profile.namedStreetWordCount >= 3) score += 16
  else if (profile.namedStreetWordCount >= 2) score += 10
  if (profile.hasNumericWard) score += 18
  else if (profile.hasWard) score += 10
  if (profile.hasNumericDistrict) score += 18
  else if (profile.hasDistrict) score += 10
  if (profile.hasWard && profile.hasDistrict) score += 10
  if (profile.isAddressLike) score += 25
  if (profile.text.length >= 10 && profile.text.length <= 100) score += 10
  if (profile.text.length > 140) score -= 14
  if (profile.hasPhoneLike) score -= 40
  if (profile.hasPriceLike) score -= 30
  if (profile.hasTimeLike && !profile.isAddressLike) score -= 25
  if (profile.hasListPrefix && !profile.isAddressLike) score -= 18
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

export function scoreShortsTrack2V3AddressLikelihood(rawText = '') {
  const address = bestAddressLine(rawText)
  const garbage = garbageProfile(rawText)
  let score = address.score - garbage.total * 5
  if (address.isAddressLike) score += 20
  if (!address.hasHouseNumber) score -= 18
  if (!address.hasAdmin) score -= 12
  if (!address.hasStreetLike) score -= 12
  return {
    score: Number(score.toFixed(4)),
    bestAddressLine: address.text || null,
    features: {
      hasHouseNumber: address.hasHouseNumber,
      hasSlashNumber: address.hasSlashNumber,
      hasPlainHouseNumber: address.hasPlainHouseNumber,
      hasStreetLike: address.hasStreetLike,
      hasExplicitStreetMarker: address.hasExplicitStreetMarker,
      namedStreetWordCount: address.namedStreetWordCount,
      hasWard: address.hasWard,
      hasDistrict: address.hasDistrict,
      hasAdmin: address.hasAdmin,
      isAddressLike: address.isAddressLike,
      garbageTokenCount: garbage.total,
    },
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
  const suspiciousMidWordSplit = /\b\p{Lu}\p{Ll}?\s+\p{Ll}{2,4}\b/u.test(address.text || '')

  if (!text) score -= 100
  if (lineCount <= 3) score += 5
  if (address.text && text === address.text) score += 10
  if (lineCount > 5) score -= (lineCount - 5) * 4
  if (text.length > 180) score -= Math.min(30, (text.length - 180) / 5)
  if (address.text && text.length > address.text.length * 2.5) score -= 10
  if (address.text) score -= Math.max(0, text.length - address.text.length) / 3
  score -= garbage.total * 6
  if ([11, 12].includes(Number(psm))) score += 8
  if (address.uncertainAdminDigit) score -= 2
  if (address.isAddressLike) score += 12
  if (suspiciousMidWordSplit) score -= 10

  if (preprocessVariant === 'original') score += 12
  else if (['upscale_3x_gray', 'upscale_4x_gray'].includes(preprocessVariant)) score += 8
  else if (preprocessVariant === 'sharpen_contrast') score += 4
  else if (preprocessVariant === 'inverted_threshold') score -= 2
  else if (preprocessVariant === 'tight_address_line') {
    score += address.hasSplitSlashNumber || !address.hasHouseNumber || address.uncertainAdminDigit
      ? -15
      : 4
  }

  const uncertainHouseNumber = Boolean(address.hasSplitSlashNumber || !address.hasHouseNumber)
  if (uncertainHouseNumber) qualityFlags.push('UNCERTAIN_HOUSE_NUMBER')
  if (address.uncertainAdminDigit) qualityFlags.push('UNCERTAIN_ADMIN_DIGIT')
  if (garbage.total > 0) qualityFlags.push('OCR_GARBAGE_TOKENS')
  if (suspiciousMidWordSplit) qualityFlags.push('OCR_SUSPICIOUS_MID_WORD_SPLIT')
  if (text.length > 180 || lineCount > 5) qualityFlags.push('OCR_LONG_NOISY_TEXT')
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
      hasHouseNumber: address.hasHouseNumber,
      hasSlashNumber: address.hasSlashNumber,
      hasPlainHouseNumber: address.hasPlainHouseNumber,
      hasSplitSlashNumber: address.hasSplitSlashNumber,
      hasStreetLike: address.hasStreetLike,
      hasExplicitStreetMarker: address.hasExplicitStreetMarker,
      namedStreetWordCount: address.namedStreetWordCount,
      hasWard: address.hasWard,
      hasDistrict: address.hasDistrict,
      hasNumericWard: address.hasNumericWard,
      hasNumericDistrict: address.hasNumericDistrict,
      isAddressLike: address.isAddressLike,
      lineCount,
      textLength: text.length,
      garbageTokenCount: garbage.total,
    },
  }
}

function attemptPartialHouseNumber(attempt = {}) {
  const line = normalizeShortsTrack2V3Text(attempt.scoring?.bestAddressLine || '')
  const profile = attempt.scoring?.features || {}
  if (!line) return null
  const folded = foldVietnameseText(line)
  const rangeHouse = folded.match(/(?:^|[\s,.:;])(\d{1,5}[a-z]?)\s*-\s*(\d{1,5}[a-z]?)(?=$|[\s,.;:/])/iu)
  if (rangeHouse && (profile.hasStreetLike || profile.hasWard || profile.hasDistrict)) {
    return `${rangeHouse[1].toLowerCase()}-${rangeHouse[2].toLowerCase()}`
  }
  if (!profile.hasStreetLike) return null
  const slashHouse = folded.match(/(?:^|[\s,.:;])(\d{1,5}[a-z]?)\s*\/\s*(\d{1,5}[a-z]?)(?=$|[\s,.;:-])/iu)
  if (slashHouse) return `${slashHouse[1].toLowerCase()}/${slashHouse[2].toLowerCase()}`
  const plainHouse = folded.match(/(?:^|[\s,.:;])(?:so\s*)?(\d{1,5}[a-z]?)(?=$|[\s,.:;/-])/iu)
  return plainHouse?.[1]?.toLowerCase() || null
}

function attemptAddressSignature(attempt = {}) {
  const line = normalizeShortsTrack2V3Text(attempt.scoring?.bestAddressLine || '')
  if (!line) return null
  const folded = foldVietnameseText(line)
  const rangeHouse = folded.match(/(?:^|[\s,.:;])(\d{1,5}[a-z]?)\s*-\s*(\d{1,5}[a-z]?)(?=$|[\s,.;:/])/iu)
  const slashHouse = folded.match(/(?:^|[\s,.:;])(\d{1,5}[a-z]?)\s*\/\s*(\d{1,5}[a-z]?)(?=$|[\s,.;:-])/iu)
  const plainHouse = folded.match(/(?:^|[\s,.:;])(?:so\s*)?(\d{1,5}[a-z]?)(?=$|[\s,.:;/-])/iu)
  const ward = folded.match(/\b(?:phuong|phudng|phung|phuung|phurong|phirong|p\.?)\s*([0-9o]+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,2})\b/iu)
  const district = folded.match(/\b(?:quan|qudn|qun|q\.?)\s*([0-9o]+|[a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,2})\b/iu)
  const admin = (value) => String(value || '').replace(/o/giu, '0').replace(/[^a-z0-9]+/gu, '')
  const profile = attempt.scoring?.features || {}
  if (!profile.hasStreetLike || !(profile.hasWard || profile.hasDistrict)) return null
  if (rangeHouse) {
    return [
      `h:${rangeHouse[1].toLowerCase()}-${rangeHouse[2].toLowerCase()}`,
      `w:${admin(ward?.[1])}`,
      `d:${admin(district?.[1])}`,
    ].join('|')
  }
  if (slashHouse) {
    return [
      `h:${slashHouse[1].toLowerCase()}/${slashHouse[2].toLowerCase()}`,
      `w:${admin(ward?.[1])}`,
      `d:${admin(district?.[1])}`,
    ].join('|')
  }
  if (plainHouse) {
    return [
      `h:${plainHouse[1].toLowerCase()}`,
      `w:${admin(ward?.[1])}`,
      `d:${admin(district?.[1])}`,
    ].join('|')
  }
  return null
}

function compatiblePartialHouseNumber(left = '', right = '') {
  if (!left || !right) return false
  if (left === right) return true
  const leftRange = left.match(/^(\d{1,5}[a-z]?)-(\d{1,5}[a-z]?)$/iu)
  const rightRange = right.match(/^(\d{1,5}[a-z]?)-(\d{1,5}[a-z]?)$/iu)
  if (!leftRange || !rightRange || leftRange[2] !== rightRange[2]) return false
  const [shorter, longer] = leftRange[1].length <= rightRange[1].length
    ? [leftRange[1], rightRange[1]]
    : [rightRange[1], leftRange[1]]
  return shorter.length >= 2 && longer.length === shorter.length + 1 && longer.endsWith(shorter)
}

export function selectBestShortsTrack2V3TesseractAttempt(attempts = []) {
  const prepared = (Array.isArray(attempts) ? attempts : [])
    .map((attempt) => ({
      ...attempt,
      scoring: attempt.scoring || scoreShortsTrack2V3TesseractOutput(attempt),
    }))
    .filter((attempt) => normalizeShortsTrack2V3Text(attempt.rawText))
  const signatureCounts = new Map()
  const partialHouseCounts = new Map()
  for (const attempt of prepared) {
    const signature = attemptAddressSignature(attempt)
    if (signature) signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
    const partialHouse = attemptPartialHouseNumber(attempt)
    if (partialHouse) partialHouseCounts.set(partialHouse, (partialHouseCounts.get(partialHouse) || 0) + 1)
  }
  const ranked = prepared
    .map((attempt) => {
      const signature = attemptAddressSignature(attempt)
      const consensusCount = signature ? signatureCounts.get(signature) || 1 : 1
      const partialHouse = attemptPartialHouseNumber(attempt)
      const partialHouseConsensusCount = partialHouse ? partialHouseCounts.get(partialHouse) || 1 : 1
      const compatiblePartialHouseConsensusCount = partialHouse
        ? [...partialHouseCounts.entries()].reduce((count, [token, tokenCount]) =>
            count + (compatiblePartialHouseNumber(partialHouse, token) ? tokenCount : 0), 0)
        : 1
      const fullAddressConsensusBonus = Math.min(30, (consensusCount - 1) * 4)
      const rangeHouse = /^\d{1,5}[a-z]?-\d{1,5}[a-z]?$/iu.test(partialHouse || '')
      const partialHouseConsensusBonus = rangeHouse
        ? Math.min(100,
            (partialHouseConsensusCount - 1) * 40 +
            Math.max(0, compatiblePartialHouseConsensusCount - partialHouseConsensusCount) * 30,
          )
        : Math.min(40, (partialHouseConsensusCount - 1) * 15)
      return {
        ...attempt,
        partialHouseToken: partialHouse,
        selectionScore: attempt.scoring.score + fullAddressConsensusBonus + partialHouseConsensusBonus,
        consensusCount,
        partialHouseConsensusCount,
        compatiblePartialHouseConsensusCount,
      }
    })
    .sort((a, b) =>
      b.selectionScore - a.selectionScore ||
      b.consensusCount - a.consensusCount ||
      b.partialHouseConsensusCount - a.partialHouseConsensusCount ||
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
      partialHouseConsensusCount: attempt.partialHouseConsensusCount,
      compatiblePartialHouseConsensusCount: attempt.compatiblePartialHouseConsensusCount,
      partialHouseToken: attempt.partialHouseToken,
      confidence: attempt.scoring.confidence,
      bestAddressLine: attempt.scoring.bestAddressLine,
      qualityFlags: attempt.scoring.qualityFlags,
    })),
  }
}

export default {
  scoreShortsTrack2V3AddressLikelihood,
  scoreShortsTrack2V3TesseractOutput,
  selectBestShortsTrack2V3TesseractAttempt,
}
