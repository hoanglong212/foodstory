import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildShortsTrack2V3AsrOpportunityWindows } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrOpportunityWindowService.js'

describe('Track2 V3 ASR opportunity windows', () => {
  it('builds a padded bounded window around weak address-like OCR', () => {
    const windows = buildShortsTrack2V3AsrOpportunityWindows({
      textBlocks: [{
        rawText: '153 Nam Ky Khoi Nghia Q.3',
        episodeId: 'episode-007',
        segmentId: 'segment-003',
        startSeconds: 32,
        endSeconds: 37,
      }],
      durationSeconds: 60,
      config: { windowedAsrEnabled: true, asrWindowPaddingSeconds: 6, asrWindowMaxSeconds: 22, asrWindowMaxCount: 3 },
    })
    assert.equal(windows.length, 1)
    assert.equal(windows[0].startSeconds, 26)
    assert.equal(windows[0].endSeconds, 43)
    assert.equal(windows[0].segmentId, 'segment-003')
  })

  it('does not make a window from unrelated subtitle text', () => {
    const windows = buildShortsTrack2V3AsrOpportunityWindows({
      textBlocks: [{ rawText: 'Món này ngon quá mọi người ơi', timestampSeconds: 20 }],
      durationSeconds: 60,
      config: { windowedAsrEnabled: true },
    })
    assert.deepEqual(windows, [])
  })

  it('does not route a folded Vietnamese bare đ subtitle fragment into ASR', () => {
    const windows = buildShortsTrack2V3AsrOpportunityWindows({
      textBlocks: [{ rawText: '~\ncoi thường đ ï', timestampSeconds: 37.125 }],
      durationSeconds: 100,
      config: { windowedAsrEnabled: true },
    })
    assert.deepEqual(windows, [])
  })

})
