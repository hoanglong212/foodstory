import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve('services/foodMapLocationResolutionService.js')
let source = fs.readFileSync(target, 'utf8')

if (source.includes('v25_provider_disabled_guard')) {
  console.log('[v25] provider_disabled guard already present')
  process.exit(0)
}

const guard = `
  // v25_provider_disabled_guard: no provider configured must be a safe no-op,
  // not a provider error. Keep this before any fetch/key logic.
  const selectedProvider = String(provider || process.env.LOCATION_RESOLUTION_PROVIDER || 'disabled').trim().toLowerCase()
  if (selectedProvider !== 'google') {
    return {
      status: 'provider_disabled',
      resolvedLocation: null,
      candidates: [],
      confidence: 0,
      reason: 'provider_disabled',
      warnings: [],
    }
  }
`

// Common signature in this project: second argument contains provider/apiKey.
// Insert after the opening brace of export async function resolveFoodMapLocation(...){
const functionMatch = source.match(/export\s+async\s+function\s+resolveFoodMapLocation\s*\([^)]*\)\s*\{/s)
if (!functionMatch) {
  console.error('[v25] Could not find resolveFoodMapLocation function. Upload services/foodMapLocationResolutionService.js for a direct patch.')
  process.exit(1)
}

const insertAt = functionMatch.index + functionMatch[0].length
source = source.slice(0, insertAt) + guard + source.slice(insertAt)

fs.writeFileSync(target, source)
console.log('[v25] Patched services/foodMapLocationResolutionService.js provider_disabled guard')
