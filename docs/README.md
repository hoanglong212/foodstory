# FoodStory

FoodStory is a food-discovery application with three maintained application areas:

- `frontend/`: Vue 3, Vite, and Pinia user interface.
- `backend/`: Node.js/Express API, Vision Auto, Food Map, and MySQL access.
- `ai-service/`: Python AI service used by supported assistant flows.

## Setup

Install the JavaScript dependencies from the repository root:

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
```

Copy the root and backend `.env.example` files to local `.env` files and provide only the credentials needed by the features you use. Never commit secrets.

Start the frontend and backend together:

```powershell
npm run dev
```

## Current APIs

The maintained Food Map and Vision Auto routes are mounted under `/api/food-map`:

- `POST /api/food-map/social-discovery`
- `GET /api/food-map/vision-auto-v2/health`
- `POST /api/food-map/vision-auto-v2/jobs`
- `GET /api/food-map/vision-auto-v2/jobs/:jobId`
- `DELETE /api/food-map/vision-auto-v2/jobs/:jobId`

Vision Auto URL jobs currently accept supported YouTube URLs. Results remain review-oriented: weak metadata, dish-only evidence, and phone-only evidence must not become a resolved place. AI output must not write directly to the main `restaurants` or `food_spots` tables.

## Verification

Use RTK for repository test and build commands:

```powershell
rtk npm test --prefix backend
rtk npm run verify:vision-auto:production --prefix backend
rtk npm run test:food-map-social-discovery
rtk npm run test:food-map-discovery
rtk npm run build
```

Automated tests must mock Google Vision, Google Places, YouTube, Instagram, TikTok, and Facebook. Do not add restaurant-specific fixtures or hard-coded OCR results to production logic.

## Maintenance

Keep project documentation in `docs/`. Do not commit generated build output, benchmark artifacts, temporary patches, backup copies, archives, logs, or one-off live audit results.
