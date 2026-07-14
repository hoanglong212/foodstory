const SAFE_ABBREVIATIONS = [
  [/\bQ\.\s*(?=\d|[A-ZÀ-Ỹ])/giu, 'Quận '],
  [/\bP\.\s*(?=\d|[A-ZÀ-Ỹ])/giu, 'Phường '],
  [/\bTP\.?\s*HCM\b/giu, 'TP. Hồ Chí Minh'],
  [/\bHCMC\b/giu, 'TP. Hồ Chí Minh'],
  [/\bHN\b/gu, 'Hà Nội'],
]

function stripEdgeDecorations(value) {
  return String(value || '')
    .replace(/^[\s•*\-–—|()[\]{}"'“”‘’.,:;!@#$%^&+=~`<>/\\]+/u, '')
    .replace(/[\s•*\-–—|([\]{}"'“”‘’,:;!@#$%^&+=~`<>/\\]+$/u, '')
}

export function safePreNormalize(text) {
  let value = String(text || '')
    .normalize('NFKC')
    .replace(/\uFF1A/g, ':')
    .replace(/[，、]/gu, ',')
    .replace(/[（]/gu, '(')
    .replace(/[）]/gu, ')')
    .replace(/[‐‑‒–—―]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()

  value = stripEdgeDecorations(value)
  for (const [pattern, replacement] of SAFE_ABBREVIATIONS) {
    value = value.replace(pattern, replacement)
  }

  return value
    .replace(/\s*,\s*/gu, ', ')
    .replace(/\s+\)/gu, ')')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function isTruncatedEvidence(text) {
  const value = String(text || '')
  return /(?:\.{3,}|…|\b(?:quận|quan|q\.?|district|phường|phuong|p\.?)\s*(?:\.{3,}|…)\b)/iu.test(value)
}

export function normalizeAddress(text) {
  return safePreNormalize(text)
    .replace(/\b(?:số|so)\s+(?=\d)/giu, '')
    .replace(/\s+([,.])/gu, '$1')
    .replace(/\s*,\s*/gu, ', ')
    .replace(/,\s*\)/gu, ')')
    .replace(/\(\s*,?\s*/gu, '(')
    .replace(/\s+/gu, ' ')
    .trim()
}

export default {
  safePreNormalize,
  isTruncatedEvidence,
  normalizeAddress,
}
