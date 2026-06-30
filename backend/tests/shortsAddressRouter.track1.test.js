import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  extractTrack1Evidence,
  findExactPrefixAddress,
  isClearDescriptionAddress,
} from '../src/services/shortsTrack1EvidenceExtractor.js'
import { routeShortsAddress } from '../src/services/shortsAddressRouterService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'
const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/youtube-shorts-address-30.json', import.meta.url),
    'utf8',
  ),
)

function fixtureCase(id) {
  const item = fixture.cases.find((candidate) => candidate.id === id)
  assert.ok(item, `missing fixture case ${id}`)
  return item
}

describe('shortsAddressRouter TRACK_1 routing', () => {
  it('shortsAddressRouter routes exact Vietnamese address label to TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Địa chỉ: 92C Cao Thắng, Phường 4, Quận 3, TP.HCM',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.equal(result.normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.ok(result.signals.some((signal) => signal.rule === 'EXACT_PREFIX'))
  })

  it('shortsAddressRouter routes exact English address label to TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Address: 39 Nguyen Trai, District 1, HCMC',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
  })

  it('shortsAddressRouter bounds raw Thánh Riviu description after exact address label', () => {
    const description = `Lạc Concept
Địa chỉ: Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. HCM
Giá trung bình: 40k - 60k
---------------------
Theo dõi các địa điểm vui chơi, giải trí, trend mới, xu hướng du lịch tại cộng đồng Thánh Riviu 

- Group Thánh Riviu : https://www.facebook.com/groups/riviu...
- Page Thánh Riviu : https://www.facebook.com/Riviu.Official
- Tiktok : https://www.tiktok.com/@thanhriviuoff...
- Instagram : https://www.instagram.com/thanhriviu....
- Youtube : Thánh Riviu
- Liên hệ Email : contact@riviu.vn
#Thanhriviu #riviu #shorts #youtubeshorts #ramen #ramennhat #amthucnhat`

    const result = routeShortsAddress({
      url: 'https://www.youtube.com/shorts/TIflqSNgcl8',
      title: 'Quán cà phê Nhật Bản giữa lòng Sài Gòn | Thánh Riviu',
      description,
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh')
    assert.equal(result.normalizedAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh')
  })

  it('shortsAddressRouter bounds raw Phở Chào description after exact address label', () => {
    const description = `Mama's Dung restaurant - Phở Chào ► https://www.facebook.com/phochaosaigon/
Order direct via foodbooking/Grab Food ► https://www.foodbooking.com/api/fb/v4_dov
► Whatsapp: 0902701208
► Address: 52 Nguyen Cong Tru, Ward 19, Binh Thanh District, Ho Chi Minh city

►Follow me on◄
FITNESS CHANNEL:
https://www.youtube.com/channel/example
INSTAGRAM: @example
TikTok: @example
Business Inquires: example@email.com`

    const result = routeShortsAddress({
      url: 'https://www.youtube.com/shorts/Hmd7A_1Xb44',
      title: '#shorts Vietnamese Phở With… French Fries!!??',
      description,
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, '52 Nguyen Cong Tru, Ward 19, Binh Thanh District, Ho Chi Minh city')
    assert.equal(result.normalizedAddress, '52 Nguyen Cong Tru, Ward 19, Binh Thanh District, Ho Chi Minh city')
  })

  it('shortsAddressRouter extracts bounded candidates from raw live Track 1 descriptions', () => {
    for (const id of ['shorts_004', 'shorts_007', 'shorts_008', 'shorts_009', 'shorts_010']) {
      const item = fixtureCase(id)
      const result = routeShortsAddress({
        ...item,
        description: item.descriptionRawFromYoutube,
      })

      assert.equal(result.track, 'TRACK_1', id)
      assert.equal(result.reason, item.expectedReason, id)
      assert.equal(result.evidenceSource, item.expectedEvidenceSource, id)
      assert.equal(result.candidateAddress, item.expectedCandidateAddress, id)
      assert.equal(result.normalizedAddress, item.expectedNormalizedAddress, id)
      assert.equal(result.candidateAddress.includes('\n'), false, id)
      assert.equal(result.candidateAddress.includes('http'), false, id)
    }
  })

  it('shortsAddressRouter allows YouTube page metadata exact prefix evidence into TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      pageMetadataText: 'Địa chỉ: 92C Cao Thắng, Phường 4, Quận 3, TP.HCM',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'page_metadata')
    assert.equal(result.normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
  })

  it('shortsAddressRouter allows title exact prefix evidence into TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      title: 'Bún đậu Địa chỉ: Số 9, ngõ 56 Trần Quang Diệu, Đống Đa, Hà Nội',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'title')
    assert.equal(result.normalizedAddress, '9, ngõ 56 Trần Quang Diệu, Đống Đa, Hà Nội')
  })

  it('shortsAddressRouter routes clear YouTube description address to TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      description: 'Tiệm bún bò Phú Hưng tại số 284/3 Chợ Lớn (Q.6, TP.HCM)',
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'CLEAR_DESCRIPTION')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.normalizedAddress, '284/3 Chợ Lớn (Quận 6, TP. Hồ Chí Minh)')
  })

  it('shortsAddressRouter routes JSON-LD address to TRACK_1', () => {
    const result = routeShortsAddress({
      url: SHORTS_URL,
      jsonldObjects: [
        {
          '@type': 'Restaurant',
          address: {
            streetAddress: '92C Cao Thắng',
            addressLocality: 'Phường 4, Quận 3',
            addressRegion: 'TP.HCM',
          },
        },
      ],
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'JSONLD_ADDRESS')
    assert.equal(result.evidenceSource, 'jsonld')
    assert.equal(result.normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
  })

  it('shortsAddressRouter exposes Track 1 evidence helpers', () => {
    const exact = findExactPrefixAddress('Bún đậu Địa chỉ: Số 9, ngõ 56 Trần Quang Diệu, Đống Đa, Hà Nội')
    assert.equal(exact.prefix, 'Địa chỉ:')
    assert.equal(exact.normalizedAddress, '9, ngõ 56 Trần Quang Diệu, Đống Đa, Hà Nội')

    const clear = isClearDescriptionAddress('Tiệm bún bò Phú Hưng tại số 284/3 Chợ Lớn (Q.6, TP.HCM)')
    assert.equal(clear.ok, true)

    const extracted = extractTrack1Evidence({
      pageMetadataText: 'Address: 39 Nguyen Trai, District 1, HCMC',
    })
    assert.equal(extracted.accepted, true)
    assert.equal(extracted.reason, 'EXPLICIT_LABEL')
    assert.equal(extracted.evidenceSource, 'page_metadata')
  })
})
