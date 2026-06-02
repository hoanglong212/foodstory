<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { useRecipeStore } from '../stores/recipeStore'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const isEditMode = computed(() => Boolean(route.params.id))
const isSubmitting = ref(false)
const isLoadingForm = ref(false)
const serverError = ref('')
const loadError = ref('')
const errors = reactive({})
const maxTitleLength = 255
const maxImageUrlLength = 500
const maxDescriptionLength = 1000
const maxInstructionsLength = 10000
const maxIngredientNameLength = 150
const maxIngredientQuantityLength = 50
let isAlive = true

function getEmptyForm() {
  return {
    title: '',
    category_id: '',
    image_url: '',
    description: '',
    instructions: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ingredientsText: '',
    tags: [],
  }
}

const form = reactive(getEmptyForm())

function setError(field, message = '') {
  errors[field] = message
}

function resetForm() {
  Object.assign(form, getEmptyForm())
  Object.keys(errors).forEach((field) => setError(field))
  serverError.value = ''
  loadError.value = ''
}

function parseIngredients() {
  return form.ingredientsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, quantity] = line.split('|').map((part) => part.trim())
      return {
        ingredient_name: name,
        quantity: quantity || '',
      }
    })
    .filter((ingredient) => ingredient.ingredient_name)
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validate() {
  serverError.value = ''
  ;[
    'title',
    'category_id',
    'image_url',
    'description',
    'instructions',
    'calories',
    'protein',
    'carbs',
    'fat',
    'ingredientsText',
  ].forEach((field) => setError(field))

  if (!form.title.trim()) {
    setError('title', 'Title is required.')
  } else if (form.title.trim().length > maxTitleLength) {
    setError('title', `Title must be ${maxTitleLength} characters or fewer.`)
  }
  if (!form.category_id) {
    setError('category_id', 'Category is required.')
  }
  if (!form.image_url.trim()) {
    setError('image_url', 'Image URL is required.')
  } else if (!isValidHttpUrl(form.image_url.trim())) {
    setError('image_url', 'Enter a valid http or https image URL.')
  } else if (form.image_url.trim().length > maxImageUrlLength) {
    setError('image_url', `Image URL must be ${maxImageUrlLength} characters or fewer.`)
  }
  if (!form.instructions.trim()) {
    setError('instructions', 'Instructions are required.')
  } else if (form.instructions.trim().length > maxInstructionsLength) {
    setError('instructions', `Instructions must be ${maxInstructionsLength} characters or fewer.`)
  }
  if (form.description.trim().length > maxDescriptionLength) {
    setError('description', `Description must be ${maxDescriptionLength} characters or fewer.`)
  }

  ;['calories', 'protein', 'carbs', 'fat'].forEach((field) => {
    const value = Number(form[field])
    if (!Number.isInteger(value) || value < 0) {
      setError(field, 'Enter a whole number greater than or equal to 0.')
    }
  })

  const ingredients = parseIngredients()
  if (ingredients.length === 0) {
    setError('ingredientsText', 'Add at least one ingredient.')
  } else if (
    ingredients.some(
      (ingredient) =>
        ingredient.ingredient_name.length > maxIngredientNameLength ||
        ingredient.quantity.length > maxIngredientQuantityLength,
    )
  ) {
    setError(
      'ingredientsText',
      `Ingredient names must be ${maxIngredientNameLength} characters or fewer and quantities ${maxIngredientQuantityLength} or fewer.`,
    )
  }

  return Object.values(errors).every((message) => !message)
}

function buildPayload() {
  return {
    title: form.title.trim(),
    category_id: Number(form.category_id),
    image_url: form.image_url.trim(),
    description: form.description.trim() || null,
    instructions: form.instructions.trim(),
    calories: Number(form.calories),
    protein: Number(form.protein),
    carbs: Number(form.carbs),
    fat: Number(form.fat),
    ingredients: parseIngredients(),
    tags: form.tags.map((tag) => Number(tag)),
  }
}

async function handleSubmit() {
  if (isSubmitting.value) {
    return
  }

  if (!validate()) {
    return
  }

  isSubmitting.value = true
  try {
    const payload = buildPayload()
    const recipe = isEditMode.value
      ? await recipeStore.updateRecipe(route.params.id, payload)
      : await recipeStore.createRecipe(payload)
    if (!isAlive) {
      return
    }
    router.push({ name: 'recipe-detail', params: { id: recipe.id } })
  } catch (error) {
    if (!isAlive) {
      return
    }
    serverError.value = error.message
  } finally {
    if (isAlive) {
      isSubmitting.value = false
    }
  }
}

async function loadForm() {
  if (!isAlive) {
    return
  }

  resetForm()
  isLoadingForm.value = true
  loadError.value = ''

  try {
    await recipeStore.fetchMeta()
    if (!isAlive) {
      return
    }

    if (!isEditMode.value) {
      return
    }

    const recipe = await recipeStore.fetchRecipeById(route.params.id)
    if (!isAlive || !recipe) {
      return
    }
    form.title = recipe.title
    form.category_id = recipe.category_id
    form.image_url = recipe.image_url
    form.description = recipe.description || ''
    form.instructions = recipe.instructions
    form.calories = recipe.calories
    form.protein = recipe.protein
    form.carbs = recipe.carbs
    form.fat = recipe.fat
    form.ingredientsText = recipe.ingredients
      .map((ingredient) =>
        ingredient.quantity
          ? `${ingredient.ingredient_name} | ${ingredient.quantity}`
          : ingredient.ingredient_name,
      )
      .join('\n')
    form.tags = recipe.tags.map((tag) => tag.id)
  } catch (error) {
    if (!isAlive) {
      return
    }
    loadError.value = error.message
  } finally {
    if (isAlive) {
      isLoadingForm.value = false
    }
  }
}

onMounted(loadForm)

watch(
  () => route.params.id,
  (id, previousId) => {
    if (id !== previousId) {
      loadForm()
    }
  },
)

onBeforeUnmount(() => {
  isAlive = false
  recipeStore.cancelSelectedRecipeRequest()
})
</script>

<template>
  <section class="form-page page-pad">
    <div class="form-shell">
      <div class="section-heading">
        <p class="eyebrow">Admin Recipe Management</p>
        <h1>{{ isEditMode ? 'Edit Recipe' : 'Create Recipe' }}</h1>
        <p>
          Admin-only form with frontend validation and backend validation through the API.
        </p>
      </div>

      <p v-if="loadError || serverError" class="form-error" role="alert">
        {{ loadError || serverError }}
      </p>

      <p v-if="isLoadingForm" class="status-panel">Loading form...</p>

      <form
        v-else-if="!loadError"
        class="recipe-editor-form"
        novalidate
        @submit.prevent="handleSubmit"
      >
        <div class="form-field">
          <label for="recipe-title">Title</label>
          <input
            id="recipe-title"
            v-focus
            v-model="form.title"
            type="text"
            :aria-invalid="Boolean(errors.title)"
            aria-describedby="recipe-title-error"
          />
          <p v-if="errors.title" id="recipe-title-error" class="field-error">
            {{ errors.title }}
          </p>
        </div>

        <div class="form-grid two">
          <div class="form-field">
            <label for="recipe-category">Category</label>
            <select
              id="recipe-category"
              v-model="form.category_id"
              :aria-invalid="Boolean(errors.category_id)"
              aria-describedby="recipe-category-error"
            >
              <option value="">Select category</option>
              <option
                v-for="category in recipeStore.categories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select>
            <p v-if="errors.category_id" id="recipe-category-error" class="field-error">
              {{ errors.category_id }}
            </p>
          </div>

          <div class="form-field">
            <label for="recipe-tags">Tags</label>
            <select id="recipe-tags" v-model="form.tags" multiple>
              <option v-for="tag in recipeStore.tags" :key="tag.id" :value="tag.id">
                {{ tag.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-field">
          <label for="recipe-image">Image URL</label>
          <input
            id="recipe-image"
            v-model="form.image_url"
            type="url"
            :aria-invalid="Boolean(errors.image_url)"
            aria-describedby="recipe-image-error"
          />
          <p v-if="errors.image_url" id="recipe-image-error" class="field-error">
            {{ errors.image_url }}
          </p>
        </div>

        <div class="form-field">
          <label for="recipe-description">Description</label>
          <textarea
            id="recipe-description"
            v-model="form.description"
            rows="4"
            placeholder="Optional short overview for the recipe detail page"
            :aria-invalid="Boolean(errors.description)"
            aria-describedby="recipe-description-error"
          ></textarea>
          <p v-if="errors.description" id="recipe-description-error" class="field-error">
            {{ errors.description }}
          </p>
        </div>

        <div class="form-field">
          <label for="recipe-instructions">Instructions</label>
          <textarea
            id="recipe-instructions"
            v-model="form.instructions"
            rows="6"
            :aria-invalid="Boolean(errors.instructions)"
            aria-describedby="recipe-instructions-error"
          ></textarea>
          <p v-if="errors.instructions" id="recipe-instructions-error" class="field-error">
            {{ errors.instructions }}
          </p>
        </div>

        <div class="form-field">
          <label for="recipe-ingredients">Ingredients</label>
          <textarea
            id="recipe-ingredients"
            v-model="form.ingredientsText"
            rows="6"
            placeholder="One per line: Ingredient name | quantity"
            :aria-invalid="Boolean(errors.ingredientsText)"
            aria-describedby="recipe-ingredients-help recipe-ingredients-error"
          ></textarea>
          <small id="recipe-ingredients-help">
            Use one ingredient per line. Example: Bánh phở | 400g
          </small>
          <p
            v-if="errors.ingredientsText"
            id="recipe-ingredients-error"
            class="field-error"
          >
            {{ errors.ingredientsText }}
          </p>
        </div>

        <fieldset class="nutrition-fieldset">
          <legend>Nutrition</legend>
          <div class="form-grid four">
            <div class="form-field">
              <label for="recipe-calories">Calories</label>
              <input
                id="recipe-calories"
                v-model.number="form.calories"
                type="number"
                min="0"
                :aria-invalid="Boolean(errors.calories)"
                aria-describedby="recipe-calories-error"
              />
              <p v-if="errors.calories" id="recipe-calories-error" class="field-error">
                {{ errors.calories }}
              </p>
            </div>
            <div class="form-field">
              <label for="recipe-protein">Protein</label>
              <input
                id="recipe-protein"
                v-model.number="form.protein"
                type="number"
                min="0"
                :aria-invalid="Boolean(errors.protein)"
                aria-describedby="recipe-protein-error"
              />
              <p v-if="errors.protein" id="recipe-protein-error" class="field-error">
                {{ errors.protein }}
              </p>
            </div>
            <div class="form-field">
              <label for="recipe-carbs">Carbs</label>
              <input
                id="recipe-carbs"
                v-model.number="form.carbs"
                type="number"
                min="0"
                :aria-invalid="Boolean(errors.carbs)"
                aria-describedby="recipe-carbs-error"
              />
              <p v-if="errors.carbs" id="recipe-carbs-error" class="field-error">
                {{ errors.carbs }}
              </p>
            </div>
            <div class="form-field">
              <label for="recipe-fat">Fat</label>
              <input
                id="recipe-fat"
                v-model.number="form.fat"
                type="number"
                min="0"
                :aria-invalid="Boolean(errors.fat)"
                aria-describedby="recipe-fat-error"
              />
              <p v-if="errors.fat" id="recipe-fat-error" class="field-error">
                {{ errors.fat }}
              </p>
            </div>
          </div>
        </fieldset>

        <div class="form-actions">
          <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
            <AppIcon name="send" size="18" />
            <span>{{ isSubmitting ? 'Saving...' : 'Save Recipe' }}</span>
          </button>
          <button class="btn btn-outline" type="button" @click="router.push('/recipes')">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
