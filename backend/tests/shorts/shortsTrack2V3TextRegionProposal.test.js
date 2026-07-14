import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { proposeShortsTrack2V3TextRegions } from '../../src/services/shorts/track2-v3/shortsTrack2V3TextRegionProposalService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function makeTempFrame() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-text-region-'))
  tempDirs.push(directory)
  const imagePath = path.join(directory, 'frame.jpg')
  const svg = `
    <svg width="480" height="854" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="854" fill="#777777"/>
      <rect x="20" y="260" width="440" height="150" fill="#ffffff"/>
      <text x="35" y="315" font-size="38" font-family="Arial" fill="#000000">153 NAM KY KHOI NGHIA</text>
      <text x="35" y="370" font-size="32" font-family="Arial" fill="#000000">PHUONG 6 QUAN 3</text>
    </svg>`
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(imagePath)
  return imagePath
}

describe('Track 2 V3 dynamic text-region proposal', () => {
  it('proposes bounded text bands around an address-like overlay instead of five fixed vertical crops', async () => {
    const imagePath = await makeTempFrame()
    const regions = await proposeShortsTrack2V3TextRegions(
      { imagePath },
      { textRegionProposalEnabled: true, maxDynamicTextRegionsPerFrame: 4 },
    )

    assert.ok(regions.length > 0)
    assert.ok(regions.length <= 4)
    assert.ok(regions.some((region) => region.yStart < 0.44 && region.yEnd > 0.30))
    assert.ok(regions.every((region) => region.proposalType === 'DYNAMIC_TEXT_BAND'))
    assert.ok(regions.every((region) => region.yStart >= 0 && region.yEnd <= 1 && region.yStart < region.yEnd))
  })

  it('fails closed when dynamic proposal is disabled', async () => {
    const imagePath = await makeTempFrame()
    const regions = await proposeShortsTrack2V3TextRegions(
      { imagePath },
      { textRegionProposalEnabled: false, maxDynamicTextRegionsPerFrame: 4 },
    )
    assert.deepEqual(regions, [])
  })
})
