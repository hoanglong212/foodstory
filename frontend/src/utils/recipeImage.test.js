import { describe, expect, it } from 'vitest'
import {
  getRecipeImageCandidates,
  normalizeRecipeImagePath,
  slugifyRecipeTitle,
} from './recipeImage'

describe('recipe image resolver', () => {
  it('keeps a browser-safe public image path', () => {
    expect(
      normalizeRecipeImagePath(
        'C:\\COS30043\\foodstory\\frontend\\public\\images\\Hanoi Beef Pho.jpg',
      ),
    ).toBe('/images/Hanoi Beef Pho.jpg')
  })

  it('tries local title and extension variants before the generated placeholder', () => {
    const candidates = getRecipeImageCandidates({
      title: 'African Hibiscus Ginger Cooler',
      category_name: 'Drinks',
      image_url: '/images/African%20Hibiscus%20Ginger%20Cooler.webp',
    })

    const localPng = '/images/African%20Hibiscus%20Ginger%20Cooler.png'
    expect(candidates).toContain(localPng)
    expect(candidates.indexOf(localPng)).toBeLessThan(candidates.length - 1)
    expect(candidates.at(-1)).toMatch(/^data:image\/svg\+xml/)
  })

  it('normalizes Vietnamese recipe titles for slug fallbacks', () => {
    expect(slugifyRecipeTitle('Phở Bò Hà Nội')).toBe('pho-bo-ha-noi')
  })
})
