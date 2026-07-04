import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildMetadataCandidatesFromEvidence,
  extractMetadataEvidence,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3MetadataEvidenceService.js'
import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'

const multiLocationDescription = `Location 1: Xe nước mía 60 năm Sài Gòn
📍 230 Cống Quỳnh, Phường Phạm Ngũ Lão, Quận 1, Hồ Chí Minh

Location 2: Bánh Mì Bà Huynh
📍 197a Đ. Nguyễn Trãi, Phường Nguyễn Cư Trinh, Quận 1, Hồ Chí Minh`

function metadataOnlyConfig() {
  return {
    enabled: true,
    track2V3SmartOverlayEnabled: true,
    track2V3LocalOcrEnabled: false,
    track2V3GoogleVisionEnabled: false,
    track2V3PlacesEnabled: false,
    track2V3GeminiVisionEnabled: false,
    track2V3AsrEnabled: false,
  }
}

function emptySelectorResult() {
  return {
    status: 'OK',
    sampledFrameCount: 0,
    selectedImageCount: 0,
    selectedImages: [],
    sampledFrames: [],
    providerErrors: [],
  }
}

describe('Track 2 V3 metadata evidence', () => {
  it('extracts one explicitly labeled metadata address', () => {
    const evidence = extractMetadataEvidence({
      videoId: 'metadata-single',
      description: 'Địa chỉ: 105 Trần Hưng Đạo, Quận 5',
    })

    assert.equal(evidence.length, 1)
    assert.equal(evidence[0].source, 'youtube_description')
    assert.equal(evidence[0].addressFragment, '105 Trần Hưng Đạo, Quận 5')
    assert.deepEqual(evidence[0].houseNumberAlternatives, ['105'])
  })

  it('extracts two location blocks with their place names', () => {
    const evidence = extractMetadataEvidence({ description: multiLocationDescription })
    const candidates = buildMetadataCandidatesFromEvidence(evidence)

    assert.equal(candidates.length, 2)
    assert.equal(candidates[0].placeName, 'Xe nước mía 60 năm Sài Gòn')
    assert.match(candidates[0].addressFragment, /^230 Cống Quỳnh/u)
    assert.equal(candidates[1].placeName, 'Bánh Mì Bà Huynh')
    assert.match(candidates[1].addressFragment, /^197a Đ\. Nguyễn Trãi/u)
  })

  it('rejects phone-only metadata', () => {
    assert.deepEqual(
      extractMetadataEvidence({ description: '0906462632 - 0775705149' }),
      [],
    )
  })

  it('rejects prices, dates, and times as metadata addresses', () => {
    const evidence = extractMetadataEvidence({
      description: '17:00-21:00\n25 ngàn\n6-7-8/12/2024',
    })
    assert.deepEqual(evidence, [])
  })

  it('always builds review-only metadata candidates', () => {
    const evidence = extractMetadataEvidence({
      description: 'Địa chỉ: 105 Trần Hưng Đạo, Quận 5',
    })
    const [candidate] = buildMetadataCandidatesFromEvidence(evidence)

    assert.equal(candidate.canAutoResolve, false)
    assert.ok(candidate.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(candidate.riskFlags.includes('METADATA_EVIDENCE'))
    assert.equal(candidate.evidenceSource, 'youtube_description')
  })

  it('integrates multiple food metadata addresses as non-resolving candidates', async () => {
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/metadataMultiMock',
        videoId: 'metadataMultiMock',
        title: 'Saigon food locations',
        description: multiLocationDescription,
      },
      metadataOnlyConfig(),
      { smartOverlayResult: emptySelectorResult() },
    )

    assert.equal(result.resolution, 'CANDIDATES')
    assert.equal(result.reason, 'METADATA_MULTI_LOCATION_REVIEW')
    assert.equal(result.candidates.length, 2)
    assert.ok(result.candidates.every((candidate) => candidate.canAutoResolve === false))
    assert.equal(result.googleVisionCalled, false)
    assert.equal(result.placesCalled, false)
    assert.equal(result.geminiCalled, false)
    assert.equal(result.asrCalled, false)
  })

  it('does not create a metadata candidate for non-food commercial address text', async () => {
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/nonFoodMetadataMock',
        videoId: 'nonFoodMetadataMock',
        title: 'Vách ngăn văn phòng cao cấp',
        description: 'Địa chỉ: 105 Trần Hưng Đạo, Quận 5',
      },
      metadataOnlyConfig(),
      { smartOverlayResult: emptySelectorResult() },
    )

    assert.equal(result.resolution, 'UNRESOLVED')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.canAutoResolve, false)
  })
})
