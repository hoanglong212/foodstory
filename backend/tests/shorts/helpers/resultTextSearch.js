function safeString(value) {
  return String(value ?? '').trim()
}

export function foldText(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
}

function collectText(value, output = [], seen = new Set()) {
  if (value == null) return output

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value))
    return output
  }

  if (typeof value !== 'object') return output
  if (seen.has(value)) return output
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output, seen)
    return output
  }

  for (const item of Object.values(value)) collectText(item, output, seen)
  return output
}

function flattenArrays(value, keys, output = [], seen = new Set()) {
  if (value == null || typeof value !== 'object') return output
  if (seen.has(value)) return output
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) flattenArrays(item, keys, output, seen)
    return output
  }

  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && Array.isArray(item)) {
      output.push(...item)
    }
    flattenArrays(item, keys, output, seen)
  }

  return output
}

function uniqueObjects(items) {
  const seen = new Set()
  const unique = []
  for (const item of items) {
    const marker = typeof item === 'object' && item !== null
      ? JSON.stringify(item)
      : String(item)
    if (seen.has(marker)) continue
    seen.add(marker)
    unique.push(item)
  }
  return unique
}

export function resultText(result) {
  return collectText(result).join('\n')
}

export function resultIncludesText(result, requiredText) {
  const haystack = foldText(resultText(result))
  return foldText(requiredText)
    .split(/\s+/u)
    .filter(Boolean)
    .every((part) => haystack.includes(part))
}

export function missingTextIncludes(result, requiredTexts = []) {
  return requiredTexts.filter((text) => !resultIncludesText(result, text))
}

export function extractCandidates(result) {
  const candidates = [
    ...(Array.isArray(result?.candidates) ? result.candidates : []),
    ...flattenArrays(result, new Set([
      'candidates',
      'addressCandidates',
      'publicAddressCandidates',
      'rankedCandidates',
      'verifiedCandidates',
      'unresolvedCandidates',
    ])),
  ]
  return uniqueObjects(candidates)
}

export function candidateCount(result) {
  if (Number.isFinite(result?.candidateCount)) return result.candidateCount
  return extractCandidates(result).length
}

export function extractEvidence(result) {
  const evidence = [
    ...(Array.isArray(result?.evidence) ? result.evidence : []),
    ...flattenArrays(result, new Set(['evidence', 'evidenceItems', 'textBlocks', 'signals'])),
  ]
  return uniqueObjects(evidence)
}

export function evidenceCount(result) {
  return extractEvidence(result).length
}

export function candidateHasRequiredType(candidate, requiredType) {
  const fields = [
    candidate?.type,
    candidate?.candidateType,
    candidate?.sourceType,
    candidate?.addressSource,
    candidate?.category,
    candidate?.reason,
  ]
  return fields.some((field) => safeString(field) === requiredType)
}

export function missingCandidateTypes(result, requiredTypes = []) {
  const candidates = extractCandidates(result)
  return requiredTypes.filter((type) => (
    !candidates.some((candidate) => candidateHasRequiredType(candidate, type))
  ))
}

export function extractRiskFlags(result) {
  const flags = []
  const flagArrays = flattenArrays(result, new Set(['riskFlags', 'flags', 'safetyFlags']))
  for (const item of flagArrays) {
    if (Array.isArray(item)) {
      flags.push(...item)
    } else {
      flags.push(item)
    }
  }
  return [...new Set(flags.map(safeString).filter(Boolean))]
}

export function missingRiskFlags(result, requiredFlags = []) {
  const actual = new Set(extractRiskFlags(result))
  return requiredFlags.filter((flag) => !actual.has(flag))
}
