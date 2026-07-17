import test from 'node:test'
import assert from 'node:assert/strict'
import { expandedRecipeCatalog } from '../database/expandedRecipeCatalog.js'
import { recipes as originalSeedRecipes } from '../database/seedRecipes.js'

test('expanded catalog contains exactly 200 new, uniquely titled recipes', () => {
  assert.equal(expandedRecipeCatalog.length, 200)
  const normalized = expandedRecipeCatalog.map((recipe) => recipe.title.toLowerCase())
  assert.equal(new Set(normalized).size, 200)

  const originalTitles = new Set(originalSeedRecipes.map((recipe) => recipe.title.toLowerCase()))
  assert.deepEqual(
    expandedRecipeCatalog.filter((recipe) => originalTitles.has(recipe.title.toLowerCase())),
    [],
  )
})

test('expanded catalog is evenly diverse across 20 cuisines and collections', () => {
  const counts = new Map()
  for (const recipe of expandedRecipeCatalog) {
    counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1)
  }
  assert.equal(counts.size, 20)
  assert.deepEqual([...counts.values()], Array(20).fill(10))
})

test('every expanded recipe carries complete metadata and measured ingredients', () => {
  for (const recipe of expandedRecipeCatalog) {
    assert.ok(recipe.title.length >= 4, recipe.title)
    assert.ok(recipe.description.includes('serve four'), recipe.title)
    assert.equal(recipe.imageUrl, `/images/${encodeURIComponent(recipe.title)}.png`, recipe.title)
    assert.ok(!recipe.imageUrl.includes('placeholder'), recipe.title)
    assert.ok(Number.isInteger(recipe.prepTime) && recipe.prepTime >= 0, recipe.title)
    assert.ok(Number.isInteger(recipe.cookTime) && recipe.cookTime >= 0, recipe.title)
    assert.equal(recipe.servings, 4, recipe.title)
    assert.ok(['Easy', 'Medium', 'Hard'].includes(recipe.difficulty), recipe.title)
    assert.ok(recipe.calories > 0 && recipe.protein >= 0 && recipe.carbs >= 0 && recipe.fat >= 0)
    assert.ok(recipe.tags.length >= 3, recipe.title)
    assert.ok(recipe.allIngredients.length >= 8, recipe.title)
    for (const ingredient of recipe.allIngredients) {
      assert.ok(ingredient.name.trim(), recipe.title)
      assert.ok(ingredient.quantity.trim(), `${recipe.title}: ${ingredient.name}`)
    }
  }
})

test('every recipe has five detailed steps with timing, doneness, and storage guidance', () => {
  const instructionFingerprints = new Set()
  for (const recipe of expandedRecipeCatalog) {
    const steps = recipe.instructions.match(/^\d+\. .+$/gm) || []
    assert.equal(steps.length, 5, recipe.title)
    assert.match(recipe.instructions, /\b(minutes?|hours?| C \/| C$|temperature|simmer|boil|bake|grill|fry|cook)/im, recipe.title)
    assert.match(recipe.instructions, /refrigerat|store|freeze|chill|consume within|keep .*days/i, recipe.title)
    assert.ok(recipe.instructions.length >= 600, `${recipe.title}: ${recipe.instructions.length}`)
    assert.ok(!instructionFingerprints.has(recipe.instructions), recipe.title)
    instructionFingerprints.add(recipe.instructions)
  }
})
