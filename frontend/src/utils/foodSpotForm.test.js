import { describe, expect, it } from 'vitest'
import {
  buildFoodSpotPayload,
  createFoodSpotForm,
  hasFoodSpotCoordinates,
  validateFoodSpotForm,
} from './foodSpotForm'

describe('food spot form', () => {
  it('requires a place name and a valid map location', () => {
    const errors = validateFoodSpotForm(createFoodSpotForm())

    expect(errors).toEqual({
      name: 'Enter a place name.',
      coordinates: 'Choose a valid location on the map.',
    })
  })

  it('rejects coordinates outside valid latitude and longitude ranges', () => {
    const form = createFoodSpotForm({ name: 'Test place', latitude: '91', longitude: '181' })

    expect(hasFoodSpotCoordinates(form)).toBe(false)
    expect(validateFoodSpotForm(form).coordinates).toBe('Choose a valid location on the map.')
  })

  it('normalizes a complete draft into the backend payload contract', () => {
    const form = createFoodSpotForm({
      name: '  Pho Hoa  ',
      dish_name: '  Pho tai  ',
      category: 'Pho',
      district: 'District 3',
      latitude: '10.7823000',
      longitude: '106.6842000',
      rating: 4,
      notes: '  Fast service  ',
      tags: '  breakfast, noodles  ',
      recipe_id: '12',
    })

    expect(validateFoodSpotForm(form)).toEqual({})
    expect(buildFoodSpotPayload(form)).toEqual({
      name: 'Pho Hoa',
      dish_name: 'Pho tai',
      category: 'Pho',
      district: 'District 3',
      latitude: 10.7823,
      longitude: 106.6842,
      rating: 4,
      notes: 'Fast service',
      tags: 'breakfast, noodles',
      recipe_id: 12,
    })
  })

  it('sends unused optional fields as null', () => {
    const payload = buildFoodSpotPayload(
      createFoodSpotForm({ name: 'Cafe', latitude: 10.7, longitude: 106.6 }),
    )

    expect(payload.dish_name).toBeNull()
    expect(payload.rating).toBeNull()
    expect(payload.recipe_id).toBeNull()
  })
})
