import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { track2V3TesseractCommandCandidates } from '../src/services/shorts/track2-v3/shortsTrack2V3BinaryResolverService.js'

describe('Track 2 V3 binary resolver', () => {
  it('keeps the configured Tesseract binary as the first runtime candidate', () => {
    const configured = 'C:\\Custom OCR\\tesseract.exe'
    const candidates = track2V3TesseractCommandCandidates({
      env: { TRACK2_TESSERACT_BIN: configured },
      platform: 'win32',
    })

    assert.equal(candidates[0], configured)
    assert.ok(candidates.includes('tesseract'))
  })

  it('builds a valid Windows Program Files fallback without escape corruption', () => {
    const candidates = track2V3TesseractCommandCandidates({
      env: { ProgramFiles: 'C:\\Program Files' },
      platform: 'win32',
    })

    assert.ok(candidates.includes('C:\\Program Files\\Tesseract-OCR\\tesseract.exe'))
    assert.equal(candidates.some((candidate) => candidate.includes('\tesseract.exe')), false)
  })
})
