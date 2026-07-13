import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildShortsTrack2V3TemporalOcrConsensus } from '../../src/services/shorts/track2-v3/shortsTrack2V3TemporalOcrConsensusService.js'

const observations = [
  '153 Nam Hy Khởi Nghia, Phường 6, Quận 3',
  '153 Nam Kỳ Khởi Nghĩa, Phường 6, Quận 3',
  '153 Nam Kỳ Khởi Nghia, Phường 6, Quận 3',
]

describe('Track2 V3 temporal OCR consensus', () => {
  it('selects one actual observation instead of synthesising address text', () => {
    const result = buildShortsTrack2V3TemporalOcrConsensus(observations.map((rawText, index) => ({
      id: `obs-${index}`,
      episodeId: 'episode-007',
      segmentId: 'segment-003',
      timestampSeconds: 12 + index * 0.4,
      rawText,
      confidence: 0.8,
    })))
    assert.equal(result.consensusBlockCount, 1)
    const block = result.consensusBlocks[0]
    assert.ok(observations.includes(block.rawText))
    assert.equal(block.providerMetadata.consensusPolicy, 'OBSERVED_MEDOID_ONLY')
    assert.equal(block.rawObservations.length, 3)
    assert.ok(block.supportCount >= 2)
  })

  it('clusters repeated partial address observations across stage-local episode ids and favors supported 242', () => {
    const observations = [
      { id: 'normal', rawText: '242 Déc Lap”. . A', provider: 'local_tesseract', episodeId: 'episode-155', timestampSeconds: 96.375, confidence: 0.76 },
      { id: 'adaptive', rawText: '242 Độc Lap,', provider: 'local_tesseract', episodeId: 'episode-049', timestampSeconds: 97.875, confidence: 0.71 },
      { id: 'gemini-bad', rawText: '4242 Dọc Lapy', provider: 'local_tesseract', timestampSeconds: 99.375, confidence: 0.82 },
      { id: 'gemini-good', rawText: '242 Doc Lap,', provider: 'local_tesseract', timestampSeconds: 99.75, confidence: 0.73 },
    ]

    const result = buildShortsTrack2V3TemporalOcrConsensus(observations)
    const addressConsensus = result.consensusBlocks.find((block) => block.supportCount >= 3)

    assert.ok(addressConsensus, 'expected cross-stage partial-address consensus')
    assert.ok(observations.some((item) => item.rawText === addressConsensus.rawText))
    assert.match(addressConsensus.rawText, /242/u)
    assert.doesNotMatch(addressConsensus.rawText, /^4242/u)
    assert.ok(addressConsensus.evidenceIds.includes('normal'))
    assert.ok(addressConsensus.evidenceIds.includes('gemini-good'))
  })

  it('keeps distant incompatible observations separate when stage-local episode ids collide', () => {
    const result = buildShortsTrack2V3TemporalOcrConsensus([
      {
        id: 'listicle-first',
        rawText: '18 Nguyễn Trãi, Phường 2, Quận 5',
        episodeId: 'episode-001',
        segmentId: 'segment-001',
        timestampSeconds: 1,
      },
      {
        id: 'listicle-second',
        rawText: '92 Lê Lợi, Phường 7, Quận 3',
        episodeId: 'episode-001',
        segmentId: 'segment-001',
        timestampSeconds: 90,
      },
    ])

    assert.equal(result.consensusBlockCount, 2)
    assert.ok(result.consensusBlocks.every((block) => block.rawObservations.length === 1))
  })

})
