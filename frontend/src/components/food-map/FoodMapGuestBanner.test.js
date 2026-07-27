import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FoodMapGuestBanner from './FoodMapGuestBanner.vue'

describe('FoodMapGuestBanner', () => {
  it('explains the read-only preview and offers an authentication path', () => {
    const wrapper = mount(FoodMapGuestBanner, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.get('[aria-label="Guest Food Map preview"]').text()).toContain(
      'Exploring as a guest',
    )
    expect(wrapper.text()).toContain('Vision and map browsing work now.')
    expect(wrapper.text()).toContain('Sign in for precise address search and saving.')
    expect(wrapper.get('a').text()).toBe('Sign in for more')
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({
      name: 'login',
      query: { redirect: '/food-map' },
    })
  })
})
