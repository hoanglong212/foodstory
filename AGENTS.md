# FoodStory Codex Instructions

## Project Overview

FoodStory is a Vue 3 + Node.js/Express + MySQL food discovery project.

Main areas:

- Frontend: Vue 3, Vite, Pinia.
- Backend: Node.js/Express, ES modules.
- Database: MySQL.
- Main feature in progress: Food Map / Vision Map / Social Food Discovery.

Important backend endpoint:

- `POST /api/food-map/social-discovery`

Important backend services:

- `backend/services/foodMapSocialDiscoveryService.js`
- `backend/services/socialInputResolverService.js`
- `backend/services/foodMapEntityExtractionService.js`
- `backend/services/foodMapLocationQueryService.js`
- `backend/services/foodMapNextActionService.js`

## Command Rules

Use RTK when running test/build commands.

Preferred commands:

```bash
rtk npm run test:food-map-social-discovery
rtk npm run test:food-map-discovery
rtk npm run build
```

If running from `backend`, use backend package scripts.

Before reporting success, run the relevant test suite and build when the change affects shared behavior.

## Current Feature Rules

The Food Map / Vision Map feature accepts:

- uploaded food/storefront images,
- screenshots,
- social/blog URLs,
- short-video URLs,
- optional user hints.

The system should extract evidence such as:

- place name,
- address,
- dish,
- phone,
- location hints,
- URL metadata,
- OCR text.

## Safety Rules

Do not hard-code:

- restaurant names,
- exact addresses,
- exact phone numbers,
- URLs,
- fixture names,
- image filenames,
- OCR outputs from one specific test image.

Examples in prompts are test examples, not special cases.

Use generalized Vietnamese food-place extraction logic:

- Vietnamese address patterns,
- street forms such as Đ., D., Đường, Duong,
- district forms such as Q1, Q.1, Quận 1, Quan 1,
- accented and no-accent Vietnamese,
- Vietnamese mobile and landline phone patterns,
- dish/place/address separation.

## URL and Social Rules

Do not bypass platform restrictions.

Do not:

- scrape private or blocked Instagram/TikTok/Facebook content,
- use headless browser scraping unless explicitly requested,
- download videos,
- extract video frames,
- pretend weak metadata is reliable.

Safe URL evidence may include:

- title,
- description,
- OpenGraph metadata,
- Twitter card metadata,
- JSON-LD if available,
- thumbnail URL,
- thumbnail OCR if already supported safely.

Weak one-word metadata should remain weak unless user hint adds enough context.

## Hint Rules

User hint is first-class evidence.

If hint is provided, it should participate in:

- textSources,
- entity extraction,
- location hints,
- locationQuery scoring,
- nextAction decision.

Strong hint can rescue weak URL metadata.

Vague dish-only hint must not create a fake place or resolvable location.

## OCR Rules

Google Vision may be used for uploaded images if configured.

Automated tests must not call real:

- Google Vision,
- Google Places,
- YouTube,
- Instagram,
- TikTok,
- Facebook.

Tests should mock external services.

Tesseract fallback should remain safe.

## Location Resolution Rules

Google Places is disabled by default.

Do not enable Google Places unless explicitly requested.

Phone-only evidence must not resolve a location.

Dish-only evidence must not resolve a location.

Address + district/city can resolve.

Place + dish + location hint can resolve.

AI must not insert directly into main Food Map tables:

- `restaurants`
- `food_spots`

Drafts must remain review-only unless explicitly confirmed by user workflow.

## Frontend Rules

Do not redesign frontend unless asked.

When changing API response behavior, check that frontend still handles:

- `nextAction`,
- `place`,
- `addPlaceDraft`,
- `textSources`,
- `ocrEvidence`,
- `entities`,
- `locationQuery`,
- `locationResolution`.

## Done Definition

A task is done only when:

- the intended behavior is implemented,
- no restaurant-specific hard-code was added,
- existing safety behavior remains intact,
- relevant tests pass,
- frontend build passes if frontend or shared contracts were affected,
- the final report lists files changed, tests run, and remaining limitations.
