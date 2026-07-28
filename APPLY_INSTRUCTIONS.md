# FoodStory UX Refinement + Recipe Image Recovery

This package performs the two requested updates:

1. Applies the FoodStory UX refinement files to the current project.
2. Repairs recipe-image display so existing local image files can be found instead of showing missing or repeated fallback images.

## Why the images looked missing or duplicated

The browser displays the value stored in each recipe's `image_url`; it does not automatically search the project for an image file. Images therefore appear missing when the database contains a blank value, a Windows file-system path, a relative path that resolves from the wrong route, or a path that points to `src/assets` without being imported.

The earlier recipe listing also used a small category-based Unsplash fallback collection. Recipes with blank or broken `image_url` values could therefore display the same fallback image even though different local files still existed.

## Files added or changed

The original UX changes remain included for Recipes, Recipe Detail, Food Map, News, CSS, and geocoding.

The image fix additionally changes/adds:

- `frontend/src/utils/recipeImage.js`
- `frontend/src/components/RecipeCard.vue`
- `frontend/src/views/Recipes.vue`
- `frontend/src/views/RecipeDetail.vue`
- `backend/database/syncLocalRecipeImages.js`

## Safe application

From the repository root:

```powershell
git switch -c ux-refinement-image-fix
```

Extract this ZIP into:

```text
C:\COS30043\foodstory
```

Allow Windows to overwrite matching files under `frontend/src`. The package does not overwrite `.env`, database schema, recipe data, or image files.

Check the intended changes:

```powershell
git status --short
```

## Repair the database image paths

Put recipe images in either of these locations:

```text
frontend\public\images\recipes
frontend\src\assets\recipes
```

The safest filename format is the recipe title in lowercase with hyphens, for example:

```text
Hanoi Beef Pho          -> hanoi-beef-pho.jpg
Kimchi Fried Rice Egg   -> kimchi-fried-rice-egg.webp
```

Run a dry check first from the repository root:

```powershell
node backend/database/syncLocalRecipeImages.js
```

The dry run only reports matches and does not modify MySQL.

When the reported matches are correct, apply them:

```powershell
node backend/database/syncLocalRecipeImages.js --write
```

In write mode, matched files under `frontend/src/assets` are copied into `frontend/public/images/recipes`, then the corresponding `recipes.image_url` value is updated to a browser-safe path such as:

```text
/images/recipes/hanoi-beef-pho.jpg
```

Ambiguous or low-confidence matches are not written automatically.

## Install and verify

If dependencies are already installed, do not delete them again. Run:

```powershell
npm --prefix frontend run build
npm --prefix frontend run test -- --run src/services/geocodingService.test.js
```

If the test command is not configured on the current branch, the frontend build is the required check.

Start the application:

```powershell
npm run dev
```

Then force-refresh the browser with `Ctrl + F5` so old failed image responses are not reused.

## Commit

```powershell
git add frontend/src backend/database/syncLocalRecipeImages.js
git commit -m "feat: refine UX and recover recipe images"
```

## Important behavior of the image resolver

For each recipe, the frontend now tries these sources in order until an image loads:

1. A normalized `image_url` from the API.
2. The same filename under common public/assets folders.
3. A slug generated from the recipe title under common recipe-image folders.
4. A unique FoodStory placeholder labelled for that recipe.

It no longer falls back to one shared food photograph for many unrelated recipes.
