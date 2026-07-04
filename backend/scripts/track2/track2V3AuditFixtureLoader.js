import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parseShortsTrack2V3AuditFixture } from '../../src/services/shorts/track2-v3/shortsTrack2V3AuditService.js'

export const DEFAULT_TRACK2_V3_AUDIT_FIXTURE = path.join(
  'tests',
  'fixtures',
  'track2-v3-audit-cases.json',
)

function fixtureArgument(argv = []) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || '')
    if (value === '--fixture') return String(argv[index + 1] || '').trim()
    if (value.startsWith('--fixture=')) return value.slice('--fixture='.length).trim()
  }
  return ''
}

function isWithinDirectory(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveTrack2V3AuditFixturePath(options = {}) {
  const backendRoot = path.resolve(options.backendRoot || process.cwd())
  const fixturesRoot = path.join(backendRoot, 'tests', 'fixtures')
  const requested = fixtureArgument(options.argv || process.argv.slice(2)) ||
    String((options.env || process.env).TRACK2_V3_AUDIT_FIXTURE || '').trim()
  let resolved

  if (!requested) {
    resolved = path.join(backendRoot, DEFAULT_TRACK2_V3_AUDIT_FIXTURE)
  } else if (path.isAbsolute(requested)) {
    resolved = path.resolve(requested)
  } else {
    const normalized = requested.replace(/\\/gu, '/')
    if (normalized.startsWith('backend/')) {
      resolved = path.resolve(backendRoot, normalized.slice('backend/'.length))
    } else if (normalized.startsWith('tests/')) {
      resolved = path.resolve(backendRoot, normalized)
    } else {
      resolved = path.resolve(options.cwd || process.cwd(), requested)
    }
  }

  if (!isWithinDirectory(fixturesRoot, resolved) || path.extname(resolved).toLowerCase() !== '.json') {
    throw new Error('Track 2 V3 audit fixture must be a JSON file under backend/tests/fixtures')
  }
  return resolved
}

export async function loadTrack2V3AuditFixture(options = {}) {
  const fixturePath = resolveTrack2V3AuditFixturePath(options)
  const raw = await fs.readFile(fixturePath, 'utf8')
  return {
    fixturePath,
    fixture: parseShortsTrack2V3AuditFixture(raw),
  }
}

export default {
  loadTrack2V3AuditFixture,
  resolveTrack2V3AuditFixturePath,
}
