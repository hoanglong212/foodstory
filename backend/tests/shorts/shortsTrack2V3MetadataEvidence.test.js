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

function metadataCandidates(description, extra = {}) {
  return buildMetadataCandidatesFromEvidence(
    extractMetadataEvidence({ description, ...extra }),
  )
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

  it('extracts explicit branch addresses with a range house number', () => {
    const evidence = extractMetadataEvidence({
      title: 'Quán ăn địa phương',
      description: [
        'Địa chỉ quán:',
        'Cơ sở 1: 165-167 Núi Thành, Đà Nẵng',
        'Cơ sở 2: 283 Hải Phòng, Đà Nẵng',
      ].join('\n'),
    })

    assert.deepEqual(
      evidence.map((item) => item.addressFragment),
      ['165-167 Núi Thành, Đà Nẵng', '283 Hải Phòng, Đà Nẵng'],
    )
    assert.deepEqual(
      evidence.map((item) => item.houseNumberAlternatives[0]),
      ['165-167', '283'],
    )
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

  for (const text of [
    '18H -2H SÁNG',
    '18h-2h',
    '19H30 – HẾT',
    '10 Street Foods UNDER 100K',
    '10 Street Foods UNDER 1 in Saigon',
    '16 MÓN NGON RẺ ĂN LÀ GHIỀN QUẬN PHÚ NHUẬN',
    '20 QUÁN NGON QUẬN 5',
    '5 ĐỊA ĐIỂM ĂN UỐNG BÌNH THẠNH',
    'TOP 10 STREET FOODS',
    '10 RESTAURANTS IN SAIGON',
  ]) {
    it(`rejects metadata hour/list/count text: ${text}`, () => {
      assert.deepEqual(extractMetadataEvidence({ description: text }), [])
      assert.deepEqual(metadataCandidates(text), [])
    })
  }

  it('keeps an explicit address while rejecting adjacent CTA prose as placeName', () => {
    const candidates = metadataCandidates(`Đừng quên Like video, đăng ký kênh và để lại ý kiến của mình về món ăn ngày hôm nay nhé!
Chúc các bạn xem clip vui vẻ!
Địa chỉ: 160 Phạm Phú Thứ, P.4, Q.6, Sài Gòn`)

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].addressFragment, '160 Phạm Phú Thứ, P.4, Q.6, Sài Gòn')
    assert.equal(candidates[0].placeName, null)
    assert.equal(candidates[0].displayText, '160 Phạm Phú Thứ, P.4, Q.6, Sài Gòn')
    assert.doesNotMatch(candidates[0].displayText, /Like video|đăng ký kênh|Chúc các bạn/u)
  })

  it('keeps consecutive explicitly labeled addresses independent', () => {
    const candidates = metadataCandidates(`ĐỊA CHỈ: Số 1 Huỳnh Đình Hai, Bình Thạnh
ĐỊA CHỈ: 1 Công Trường Hòa Bình, Phường 19, Bình Thạnh`)

    assert.equal(candidates.length, 2)
    assert.match(candidates[0].addressFragment, /Số 1 Huỳnh Đình Hai/u)
    assert.match(candidates[1].addressFragment, /^1 Công Trường Hòa Bình/u)
    assert.equal(candidates[0].placeName, null)
    assert.equal(candidates[1].placeName, null)
    assert.doesNotMatch(candidates[0].displayText, /Công Trường Hòa Bình/u)
    assert.doesNotMatch(candidates[1].displayText, /Huỳnh Đình Hai/u)
  })

  it('keeps multi-slash and opposite-side labeled addresses independent', () => {
    const candidates = metadataCandidates(`ĐỊA CHỈ: 189/2/3 Hoàng Hoa Thám, Phường 6, Bình Thạnh
ĐỊA CHỈ: 71 D1, Phường 25, Bình Thạnh
ĐỊA CHỈ: Đối diện 318 Bùi Hữu Nghĩa, Bình Thạnh
ĐỊA CHỈ: 98 Diên Hồng, P.1, Q.Bình Thạnh`)

    assert.equal(candidates.length, 4)
    assert.deepEqual(candidates.map((candidate) => candidate.houseNumberAlternatives[0]), [
      '189/2/3',
      '71',
      '318',
      '98',
    ])
    assert.ok(candidates.every((candidate) => candidate.placeName === null))
    assert.ok(candidates.every((candidate) => candidate.canAutoResolve === false))
  })

  it('does not use a label-only address line as a branch placeName', () => {
    const candidates = metadataCandidates(`Địa chỉ:
• Chi nhánh 1: 15 Nguyễn Thị Đặng, P.Hiệp Thành, Q.12, Tp.HCM`)

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].addressFragment, '15 Nguyễn Thị Đặng, P.Hiệp Thành, Q.12, Tp.HCM')
    assert.equal(candidates[0].placeName, null)
    assert.equal(candidates[0].displayText, '15 Nguyễn Thị Đặng, P.Hiệp Thành, Q.12, Tp.HCM')
  })

  it('preserves a plausible numbered place heading before an ADDRESS block', () => {
    const candidates = metadataCandidates(`1. THỌ PHÁT
ADDRESS: 78 Nguyễn Tri Phương Street, District 5, HCMC`)

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].placeName, '1. THỌ PHÁT')
    assert.equal(candidates[0].addressFragment, '78 Nguyễn Tri Phương Street, District 5, HCMC')
    assert.equal(candidates[0].canAutoResolve, false)
    assert.ok(candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('preserves a plausible restaurant heading before a labeled branch address', () => {
    const candidates = metadataCandidates(`1. Cơm Quê Mười Khó của nghệ sĩ Trường Giang
• Chi nhánh 1: 27 Trần Quốc Thảo, P.6, Q.3, Tp.HCM`)

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].placeName, '1. Cơm Quê Mười Khó của nghệ sĩ Trường Giang')
    assert.equal(candidates[0].addressFragment, '27 Trần Quốc Thảo, P.6, Q.3, Tp.HCM')
    assert.equal(candidates[0].canAutoResolve, false)
    assert.ok(candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('preserves a real address with trailing opening hours and its house number', () => {
    const candidates = metadataCandidates(
      '160 Phạm Phú Thứ, P.4, Q.6, Sài Gòn — mở cửa 18H-2H',
    )

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].houseNumberAlternatives[0], '160')
    assert.deepEqual(candidates[0].houseNumberAlternatives, ['160'])
    assert.match(candidates[0].addressFragment, /^160 Phạm Phú Thứ/u)
    assert.equal(candidates[0].canAutoResolve, false)
  })

  it('skips an opening-hours prefix and preserves the following labeled address', () => {
    const candidates = metadataCandidates(
      'ĐỊA CHỈ: (11h -19h) — 194/4 Bùi Đình Túy, Phường 12, Bình Thạnh',
    )

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].addressFragment, '194/4 Bùi Đình Túy, Phường 12, Bình Thạnh')
    assert.deepEqual(candidates[0].houseNumberAlternatives, ['194/4'])
  })

  it('keeps a list-like street name when an explicit address label independently validates it', () => {
    const candidates = metadataCandidates('Địa chỉ: 10 Street 3, Phường 1, Quận 5')

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].addressFragment, '10 Street 3, Phường 1, Quận 5')
    assert.deepEqual(candidates[0].houseNumberAlternatives, ['10'])
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

  it('locks confirmed listicles before a single channel contact metadata address can satisfy rescue', async () => {
    const result = await runShortsTrack2V3SmartOverlayOcr(
      {
        url: 'https://www.youtube.com/shorts/listicleMetadataContactMock',
        videoId: 'listicleMetadataContactMock',
        title: 'Top 5 quán ăn sáng Cần Thơ',
        description: `Tổng hợp 5 quán ăn sáng nên thử\nĐịa chỉ: 15 Phạm Sơn Khai, P. An Khánh, Q. Ninh Kiều, Cần Thơ`,
      },
      metadataOnlyConfig(),
      { smartOverlayResult: emptySelectorResult() },
    )

    assert.equal(result.inputClass, 'MULTI_PLACE_LISTICLE')
    assert.equal(result.mustNotResolve, true)
    assert.equal(result.resolution, 'NEEDS_REVIEW')
    assert.equal(result.reason, 'MULTI_PLACE_REVIEW_ONLY')
    assert.equal(result.candidates.length, 0)
    assert.equal(result.lateRescueSufficient, false)
    assert.equal(result.debug.metadataCandidateCount, 1)
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
