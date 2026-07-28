import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VisionAutoResultPanel from './VisionAutoResultPanel.vue'

const externalPlace = {
  id: 'geoapify:funny-beef',
  name: 'Nhà Hàng Funny Beef',
  address: '44 Nguyễn Huệ, Phường Sài Gòn, Thành phố Thủ Đức, Việt Nam',
  district: 'Thành phố Thủ Đức',
  category: 'catering.restaurant',
  distanceKm: 0.5,
  rating: null,
  userRatingCount: 0,
  priceLevel: null,
  mapUri: 'https://www.openstreetmap.org/?mlat=10.1&mlon=106.1',
  photo: null,
  reviews: [],
}

function mountPanel() {
  return mount(VisionAutoResultPanel, {
    props: {
      state: 'external_places_found',
      result: {
        selectedDish: { dishName: 'Bún Đậu Mắm Tôm' },
        restaurants: [externalPlace],
      },
    },
  })
}

describe('VisionAutoResultPanel external place results', () => {
  it('presents a no-photo place as a full-width, informative card without duplicate distance', () => {
    const wrapper = mountPanel()
    const card = wrapper.get('.vision-external-place')

    expect(card.find('.vision-place-photo').exists()).toBe(false)
    expect(card.get('.vision-place-eyebrow').text()).toBe('Restaurant · nearby option 1')
    expect(card.get('.vision-place-address').text()).toContain(externalPlace.address)
    expect(card.get('.vision-place-match').text()).toContain('Bún Đậu Mắm Tôm')
    expect(card.get('.vision-place-source').text()).toContain('Geoapify + OpenStreetMap')
    expect(card.get('.vision-place-source a').attributes('href')).toBe(externalPlace.mapUri)
    expect(card.text().match(/0\.5 km/g)).toHaveLength(1)
  })

  it('keeps the two primary place actions available', async () => {
    const wrapper = mountPanel()
    const actions = wrapper.findAll('.vision-candidate-actions button')

    expect(actions.map((button) => button.text())).toEqual(['View on map', 'Add to FoodStory'])
    await actions[0].trigger('click')
    await actions[1].trigger('click')

    expect(wrapper.emitted('focus-dish-place')).toEqual([[externalPlace]])
    expect(wrapper.emitted('add-dish-place')).toEqual([[externalPlace]])
  })
})

describe('VisionAutoResultPanel dish evidence', () => {
  it('labels title evidence without claiming it came from the thumbnail', () => {
    const wrapper = mount(VisionAutoResultPanel, {
      props: {
        state: 'dish_candidates',
        result: {
          dishCandidates: [{
            id: 'dish:title:cao-lau',
            dishName: 'Cao Lầu',
            evidenceLabel: 'Title evidence',
            visualEvidence: ['Named explicitly in the public video title'],
            aliases: [],
          }],
        },
      },
    })

    expect(wrapper.text()).toContain('Title evidence:')
    expect(wrapper.text()).toContain('Named explicitly in the public video title')
    expect(wrapper.text()).not.toContain('Seen in the thumbnail')
  })
})
