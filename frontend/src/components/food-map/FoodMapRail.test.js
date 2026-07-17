import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import FoodMapRail from './FoodMapRail.vue'

const wrappers = []

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

function mountMenu() {
  const wrapper = mount(FoodMapRail, {
    attachTo: document.body,
    props: {
      activeId: 'budget',
      items: [
        { id: 'discover', label: 'All places', icon: 'map-pin', count: 10 },
        { id: 'budget', label: 'Budget picks', icon: 'tags', count: 8 },
        { id: 'surprise', label: 'Surprise me', icon: 'sparkles', utility: true },
      ],
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('FoodMapRail compact map views menu', () => {
  it('keeps map views hidden until requested and emits the selected view', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('.food-map-view-trigger')

    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.food-map-view-menu').exists()).toBe(false)
    expect(trigger.text()).toContain('Budget picks')

    await trigger.trigger('click')

    const items = wrapper.findAll('.food-map-view-item')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(items).toHaveLength(3)
    expect(items[1].attributes('aria-label')).toBe('Budget picks, 8 places')
    expect(items[1].attributes('aria-checked')).toBe('true')

    await items[2].trigger('click')
    expect(wrapper.emitted('select')).toEqual([['surprise']])
    expect(wrapper.find('.food-map-view-menu').exists()).toBe(false)
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.get('.food-map-view-trigger')

    await trigger.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.food-map-view-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })
})
