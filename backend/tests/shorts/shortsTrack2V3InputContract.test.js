import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyShortsTrack2V3Intent, SHORTS_TRACK2_V3_INPUT_CLASSES } from '../../src/services/shorts/track2-v3/shortsTrack2V3IntentClassifierService.js'

describe('Track2 V3 locked input contract', () => {
  const cases = [
    [{ title: 'Review quán bún bò này ở Sài Gòn' }, SHORTS_TRACK2_V3_INPUT_CLASSES.SINGLE_PLACE],
    [{ title: 'Top 8 quán ngon Quận 10' }, SHORTS_TRACK2_V3_INPUT_CLASSES.MULTI_PLACE_LISTICLE],
    [{ title: 'Cách làm phở bò tại nhà' }, SHORTS_TRACK2_V3_INPUT_CLASSES.RELEVANT_NEGATIVE],
    [{ title: 'How to replace a laptop battery' }, SHORTS_TRACK2_V3_INPUT_CLASSES.UNSUPPORTED],
  ]
  for (const [context, expected] of cases) {
    it(`classifies ${expected}`, () => {
      assert.equal(classifyShortsTrack2V3Intent(context).inputClass, expected)
    })
  }
})
