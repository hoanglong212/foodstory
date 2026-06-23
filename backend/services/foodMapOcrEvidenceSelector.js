const MAX_SELECTED_LINES = 6

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueLines(lines = []) {
  const selected = []
  for (const line of lines) {
    const key = normalizeText(line?.text)
    if (
      !key ||
      selected.some((existing) => {
        const existingKey = normalizeText(existing.text)
        return (
          existingKey === key ||
          (Math.min(existingKey.length, key.length) >= 8 &&
            (existingKey.includes(key) || key.includes(existingKey)))
        )
      })
    ) {
      continue
    }
    selected.push(line)
  }
  return selected
}

function phoneValue(value) {
  const source = String(value || '')
  const parenthesized = source.match(
    /(?<!\d)\(\s*0?\d{2,3}\s*\)(?:[\s./-]*\d){7,8}(?![\s./-]*\d)/u,
  )
  const match =
    parenthesized ||
    source.match(
      /(?<!\d)(?:\+?84|0)(?:[\s.()/-]*\d){8,10}(?![\s.()/-]*\d)|(?<!\d)(?:\d[\s.()/-]*){7}\d(?![\s.()/-]*\d)/u,
    )
  if (!match) return null
  const digits = match[0].replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  const normalized = normalizeText(source)
  const hasContactContext =
    /\b(?:phone|tel|telephone|hotline|delivery|ship|call|dt|sdt|so dien thoai|dien thoai|giao hang|lien he)\b/i.test(
      normalized,
    )
  const hasAddressOrPlaceContext =
    (
      /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/.test(normalized) &&
      /\b(?:duong|street|road|avenue|boulevard|hem|ngo|phuong|ward|quan|district|city|tinh)\b/.test(
        normalized,
      )
    ) ||
    /\b(?:quan|tiem|cafe|coffee|nha hang|restaurant|bep|com|pho|bun|banh|hu tieu|mi|chao|lau)\b/.test(
      normalized,
    )
  const legacyLandline =
    Boolean(parenthesized) && digits.length >= 9 && digits.length <= 11
  const validShape =
    /^0[35789]\d{8}$/.test(local) ||
    /^02\d{8,9}$/.test(local) ||
    (digits.length === 8 && hasContactContext) ||
    legacyLandline
  return validShape &&
    (hasContactContext || hasAddressOrPlaceContext)
    ? local
    : null
}

function addressParts(value) {
  const source = String(value || '')
  const normalized = normalizeText(value)
  const hasHouseNumber =
    /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/.test(normalized)
  const hasStreetIndicator =
    /\b(?:duong|street|road|avenue|boulevard|hem|ngo)\b/.test(normalized) ||
    /(?:^|[\s,;])(?:đ|d)\s*\.(?=\s*[\p{L}\d])/iu.test(source)
  const hasAdmin =
    /\b(?:p|q)\s*\d{1,2}\b/.test(normalized) ||
    /\b(?:phuong|ward|quan|district|thanh pho|city|province|tinh|tp hcm|tphcm)\b/.test(
      normalized,
    )
  const streetWords = normalized
    .replace(
      /^.*?\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s*/,
      '',
    )
    .split(' ')
    .filter(
      (word) =>
        /^[a-z]{2,}$/.test(word) &&
        ![
          'duong',
          'street',
          'road',
          'avenue',
          'boulevard',
          'hem',
          'ngo',
          'phuong',
          'ward',
          'quan',
          'district',
          'city',
          'tinh',
        ].includes(word),
    ).length
  const hasStreet =
    hasStreetIndicator ||
    (hasHouseNumber && streetWords >= 2) ||
    (hasHouseNumber && hasAdmin && streetWords >= 1)
  const adminOnly = hasAdmin && !hasHouseNumber && !hasStreet
  return {
    hasHouseNumber,
    hasStreet,
    hasStreetIndicator,
    hasAdmin,
    adminOnly,
  }
}

function adaptiveNoisePenalty(line) {
  const variants = Array.isArray(line?.evidenceVariants)
    ? line.evidenceVariants
    : []
  const adaptiveOnly =
    variants.length > 0 &&
    variants.every((variant) =>
      /adaptive|threshold|full/i.test(
        `${variant?.pass || ''} ${variant?.variant || ''}`,
      ),
    )
  return adaptiveOnly ? 0.22 : 0
}

function lineScore(line) {
  const text = String(line?.text || '').trim()
  const words = normalizeText(text).split(' ').filter(Boolean)
  const contact = phoneValue(text)
  const address = addressParts(text)
  let score =
    Number(line?.quality || 0) * 0.5 +
    Number(line?.confidence || 0) * 0.24 +
    Math.min(Number(line?.supportCount || 1), 3) * 0.06

  if (contact) score += 0.35
  if (address.hasHouseNumber && address.hasStreet) score += 0.24
  if (address.hasAdmin) score += 0.06
  if (line?.type === 'sign') score += 0.12
  if (
    /\b(?:com|pho|bun|banh|hu tieu|mi|chao|lau|cafe|coffee)\b/i.test(
      normalizeText(text),
    )
  ) {
    score += 0.1
  }
  if (address.adminOnly) score -= 0.3
  if (words.length > 18) score -= 0.25
  if (words.length > 28) score -= 0.25
  score -= adaptiveNoisePenalty(line)
  return roundScore(Math.max(0, Math.min(1.5, score)))
}

function contactLine(line) {
  const phone = phoneValue(line?.text)
  if (!phone) return null
  const normalized = normalizeText(line?.text)
  const words = normalized.split(' ').filter(Boolean)
  const compactContact =
    words.length <= 4 &&
    /\b(?:dt|phone|tel|hotline|dien thoai)\b/.test(normalized)
  return {
    ...line,
    text: /^02|^0[35789]/.test(phone) ? `ĐT: ${phone}` : line.text,
    selectionScore:
      lineScore(line) +
      0.2 +
      Number(compactContact) * 0.18 -
      Number(words.length > 10) * 0.22,
  }
}

export function selectFinalOcrEvidence({
  canonicalClusters = [],
  strongLines = [],
  weakLines = [],
  provider = null,
} = {}) {
  const candidates = uniqueLines([
    ...strongLines.map((line) => ({ ...line, tier: line.tier || 'strong' })),
    ...weakLines.map((line) => ({ ...line, tier: line.tier || 'weak' })),
  ])
  const contacts = []
  for (const line of candidates
    .map(contactLine)
    .filter(Boolean)
    .sort((left, right) => right.selectionScore - left.selectionScore)) {
    const phone = phoneValue(line.text)
    if (
      !phone ||
      contacts.some((existing) => phoneValue(existing.text) === phone)
    ) {
      continue
    }
    contacts.push(line)
  }
  const addresses = candidates
    .filter((line) => {
      const parts = addressParts(line.text)
      return (
        !phoneValue(line.text) &&
        !parts.adminOnly &&
        parts.hasHouseNumber &&
        parts.hasStreet &&
        (
          parts.hasAdmin ||
          Number(line.supportCount || 1) >= 2 ||
          (
            (line.type === 'address' || parts.hasStreetIndicator) &&
            Number(line.confidence || 0) >= 0.65
          )
        )
      )
    })
    .map((line) => ({ ...line, selectionScore: lineScore(line) }))
    .sort((left, right) => right.selectionScore - left.selectionScore)
  const menu = candidates
    .filter(
      (line) =>
        !phoneValue(line.text) &&
        line.type !== 'address' &&
        !String(line.clusterType || '').startsWith('address') &&
        /\b(?:com|pho|bun|banh|hu tieu|mi|chao|lau)\b/i.test(
          normalizeText(line.text),
        ),
    )
    .map((line) => ({ ...line, selectionScore: lineScore(line) }))
    .sort((left, right) => right.selectionScore - left.selectionScore)
  const signs = candidates
    .filter(
      (line) =>
        line.type === 'sign' &&
        !phoneValue(line.text) &&
        !addressParts(line.text).adminOnly,
    )
    .map((line) => ({ ...line, selectionScore: lineScore(line) }))
    .sort((left, right) => right.selectionScore - left.selectionScore)

  const selectedLines = uniqueLines([
    ...signs.slice(0, 2),
    ...addresses.slice(0, 1),
    ...contacts.slice(0, 2),
    ...menu.slice(0, 2),
  ])
    .filter(
      (line) =>
        line.selectionScore >= (line.tier === 'weak' ? 0.48 : 0.42),
    )
    .slice(0, MAX_SELECTED_LINES)
  const selectedKeys = new Set(
    selectedLines.map((line) => normalizeText(line.text)),
  )
  const rejectedUsefulButNoisy = candidates
    .filter((line) => !selectedKeys.has(normalizeText(line.text)))
    .slice(0, 8)
    .map((line) => ({
      text: line.text,
      reason: addressParts(line.text).adminOnly
        ? 'admin_only_location'
        : adaptiveNoisePenalty(line)
          ? 'adaptive_full_image_noise'
          : 'lower_ranked_secondary_evidence',
    }))
  const confidence = selectedLines.length
    ? Math.max(
        ...selectedLines.map((line) =>
          Math.min(
            1,
            Number(line.confidence || 0) * 0.45 +
              Math.min(1, line.selectionScore) * 0.55,
          ),
        ),
      )
    : 0

  return {
    finalText: selectedLines.length
      ? selectedLines.map((line) => line.text).join('\n')
      : null,
    selectedLines,
    selectedContacts: contacts.slice(0, 3),
    selectedAddressCandidates: addresses.slice(0, 3),
    selectedMenuOrDishLines: menu.slice(0, 3),
    selectedSignLines: signs.slice(0, 3),
    rejectedUsefulButNoisy,
    confidence: roundScore(confidence),
    reason: selectedLines.length
      ? 'concise_evidence_selected'
      : candidates.length
        ? 'no_line_met_final_selection_threshold'
        : 'no_canonical_evidence',
    provider,
    canonicalClusterCount: Array.isArray(canonicalClusters)
      ? canonicalClusters.length
      : 0,
  }
}

export function applyFinalOcrEvidenceSelection(evidence = {}, provider = null) {
  const selection = selectFinalOcrEvidence({
    canonicalClusters: evidence?.debug?.canonicalClusters || [],
    strongLines: evidence?.strongLines || [],
    weakLines: evidence?.weakLines || [],
    provider,
  })
  const usable = Boolean(selection.finalText)

  return {
    ...evidence,
    text: selection.finalText,
    usable,
    ocrUsable: usable,
    confidence: usable ? selection.confidence : 0,
    reason: usable ? 'usable' : selection.reason,
    lines: selection.selectedLines,
    debug: {
      ...(evidence?.debug || {}),
      finalSelection: selection,
    },
  }
}

export default selectFinalOcrEvidence
