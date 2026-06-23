#!/usr/bin/env node
/*
 * Vision Auto v13 - Gemini JSON parser hardening patch
 * Run from backend root:
 *   node scripts/apply_v13_gemini_json_parser.cjs
 */
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const target = path.join(root, 'services', 'geminiEvidenceValidationService.js')

if (!fs.existsSync(target)) {
  console.error(`[v13] Cannot find target file: ${target}`)
  console.error('[v13] Run this from your backend root, e.g. C:\\COS30043\\foodstory\\backend')
  process.exit(1)
}

let source = fs.readFileSync(target, 'utf8')
const original = source
const newline = source.includes('\r\n') ? '\r\n' : '\n'

const helper = `
function parseGeminiJsonText(value, { code = 'json_parse_failed' } = {}) {
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return parseGeminiJsonText(value.text, { code })
    }
    if (typeof value.output === 'string') {
      return parseGeminiJsonText(value.output, { code })
    }
    if (typeof value.content === 'string') {
      return parseGeminiJsonText(value.content, { code })
    }
    if (typeof value.response === 'string') {
      return parseGeminiJsonText(value.response, { code })
    }
    return value
  }

  const raw = String(value || '').trim()
  const candidates = []
  const addCandidate = (candidate) => {
    const text = String(candidate || '')
      .replace(/^\uFEFF/u, '')
      .trim()
    if (text && !candidates.includes(text)) candidates.push(text)
  }

  addCandidate(raw)

  // Gemini sometimes wraps otherwise valid JSON in fenced markdown.
  const fenced = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i)
  if (fenced?.[1]) addCandidate(fenced[1])

  addCandidate(
    raw
      .replace(/^\`\`\`(?:json)?\s*/i, '')
      .replace(/\s*\`\`\`$/i, '')
      .trim(),
  )

  // Some models prepend/explain text before or after the JSON object.
  const objectStart = raw.indexOf('{')
  const objectEnd = raw.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    addCandidate(raw.slice(objectStart, objectEnd + 1))
  }

  const arrayStart = raw.indexOf('[')
  const arrayEnd = raw.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    addCandidate(raw.slice(arrayStart, arrayEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next bounded candidate.
    }
  }

  const error = new Error('Gemini returned invalid JSON.')
  error.code = code
  error.rawPreview = raw.slice(0, 500)
  throw error
}
`

function fail(message) {
  console.error(`[v13] ${message}`)
  console.error('[v13] No changes were written.')
  process.exit(1)
}

let helperInserted = false
if (!source.includes('function parseGeminiJsonText(')) {
  const safeModelPattern = /function safeModel\(value\) \{[\s\S]*?\n\}/
  if (!safeModelPattern.test(source)) {
    fail('Could not locate safeModel() insertion point.')
  }
  source = source.replace(safeModelPattern, (match) => `${match}${newline}${helper.replace(/\n/g, newline)}`)
  helperInserted = true
}

let replacements = 0
function replaceAll(pattern, replacement, label) {
  const before = source
  source = source.replace(pattern, replacement)
  const changed = before !== source
  if (changed) {
    replacements += 1
    console.log(`[v13] patched ${label}`)
  }
}

// Provider HTTP JSON payload parser. Keep api_invalid_response semantics here.
replaceAll(
  /JSON\.parse\(\s*text\s*\)/g,
  "parseGeminiJsonText(text, { code: 'api_invalid_response' })",
  'strict response JSON.parse(text)',
)

// Model-output parser paths. These are the usual source of gemini_json_parse_failed.
replaceAll(
  /JSON\.parse\(\s*raw\s*\)/g,
  'parseGeminiJsonText(raw)',
  'model JSON.parse(raw)',
)
replaceAll(
  /JSON\.parse\(\s*String\(\s*raw\s*\|\|\s*(['\"])\1\s*\)\s*\)/g,
  'parseGeminiJsonText(raw)',
  'model JSON.parse(String(raw || empty))',
)
replaceAll(
  /JSON\.parse\(\s*(raw\?\.text\s*\|\|\s*raw\s*\|\|\s*['\"]{2})\s*\)/g,
  'parseGeminiJsonText($1)',
  'model JSON.parse(raw?.text || raw || empty)',
)
replaceAll(
  /JSON\.parse\(\s*String\(\s*(raw\?\.text\s*\|\|\s*raw\s*\|\|\s*['\"]{2})\s*\)\s*\)/g,
  'parseGeminiJsonText($1)',
  'model JSON.parse(String(raw?.text || raw || empty))',
)
replaceAll(
  /JSON\.parse\(\s*(raw\.text|raw\?\.text)\s*\)/g,
  'parseGeminiJsonText($1)',
  'model JSON.parse(raw.text)',
)

// If the old strict response parser catch still hardcodes api_invalid_response after our helper,
// leave it alone: parseGeminiJsonText(text, { code: 'api_invalid_response' }) preserves that behavior.

if (!helperInserted && replacements === 0) {
  console.log('[v13] Helper already exists and no JSON.parse patterns needed patching.')
} else if (replacements === 0) {
  console.warn('[v13] Helper inserted, but no JSON.parse patterns were found. Please inspect the file manually.')
}

if (source === original) {
  console.log('[v13] File already appears patched. No changes written.')
  process.exit(0)
}

const backup = `${target}.bak-v13-${new Date().toISOString().replace(/[:.]/g, '-')}`
fs.writeFileSync(backup, original)
fs.writeFileSync(target, source)

console.log(`[v13] Patched: ${target}`)
console.log(`[v13] Backup:  ${backup}`)
console.log('[v13] Next: node --check .\\services\\geminiEvidenceValidationService.js')
