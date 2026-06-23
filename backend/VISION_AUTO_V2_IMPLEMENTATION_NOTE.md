# Vision Auto v2 Implementation Note

Date: 2026-06-20

## Current pipeline and primary risks

The current public flow is:

1. `POST /api/food-map/social-discovery`
2. `backend/routes/foodMapSocialDiscoveryRoutes.js`
3. `backend/services/foodMapSocialDiscoveryService.js`
4. `backend/services/foodMapSocialDecisionService.js`

`foodMapSocialDiscoveryService.js` currently coordinates URL resolution, uploaded
image OCR, metadata thumbnail OCR, source precedence, rule extraction, Gemini
validation, location-query construction, location resolution, duplicate/draft
integration, next-action selection, warnings, and response construction.

The highest-risk overlaps are:

- `socialInputResolverService.js` mixes input classification, URL provider
  selection, hint injection, remote image download, thumbnail OCR, evidence
  merging, and debug shaping.
- `foodMapSocialDiscoveryService.js` contains both orchestration and policy.
- `foodMapNextActionService.js` contains interactive outcomes such as
  `ask_for_hint`, which are incompatible with auto mode.
- `foodMapSocialDecisionService.js` serializes the legacy response contract and
  exposes v1-specific statuses and next actions.
- Entity, validation, location, and response state can become stale when a later
  stage rejects evidence but an earlier object is reused.
- The frontend in `src/views/FoodMapView.vue` is coupled to the v1 contract and
  currently renders optional hints and `ask_for_hint`.

The old endpoint remains unchanged during v2 development.

## A. Reuse

These are leaf capabilities with bounded responsibilities and can be called
through v2 adapters:

- `backend/services/socialUrlExtractionService.js`
  - SSRF-safe metadata and image fetching.
- `backend/services/socialUrlProviders/youtubeUrlProvider.js`
  - YouTube metadata, oEmbed fallback, bounded warnings, and thumbnail source.
- `backend/services/socialUrlProviders/blogUrlProvider.js`
  - Public blog metadata and structured business evidence.
- `backend/services/socialUrlProviders/genericSocialUrlProvider.js`
  - Public generic social metadata without private scraping.
- `backend/services/ocrProviders/index.js`
  - Google Vision/Tesseract provider routing and fallback.
- `backend/services/ocrProviders/googleVisionOcrProvider.js`
- `backend/services/ocrProviders/tesseractOcrProvider.js`
- `backend/services/localOcrService.js`
  - OCR normalization and noise filtering.
- `backend/services/foodMapOcrEvidenceSelector.js`
  - Final bounded OCR evidence selection.
- `backend/services/foodMapEntityExtractionService.js`
  - Evidence-backed rule extraction, including descriptive-title and ambiguous
    `quan` safeguards.
- `backend/services/geminiEvidenceValidationService.js`
  - Bounded Gemini request/response handling and validation-aware entity
    correction. V2 must adapt its result and ignore its v1 `ask_for_hint`
    recommendation.
- `backend/services/foodMapLocationQueryService.js`
  - Pure location evidence gate.
- `backend/services/foodMapLocationResolutionService.js`
  - Optional Google Places lookup and candidate ranking. It remains disabled by
    default.

## B. Deprecate after v2 stabilizes

- `backend/services/foodMapSocialDiscoveryService.js`
- `backend/services/socialInputResolverService.js`
- `backend/services/foodMapSocialDecisionService.js`
- `backend/services/foodMapNextActionService.js`
- `backend/routes/foodMapSocialDiscoveryRoutes.js`
- v1 Social Discovery sections in `src/views/FoodMapView.vue`
- `backend/FOOD_MAP_SOCIAL_DISCOVERY.md`

These files remain active for the old endpoint until frontend migration and
regression verification are complete.

## C. Remove later

Remove only after the v2 endpoint and migrated frontend pass all required tests:

- `POST /api/food-map/social-discovery`
- v1 response statuses such as `needs_screenshot_or_hint`
- v1 `nextAction` and `ask_for_hint` UI behavior
- hint-only input handling
- legacy mixed orchestration and serializer code that has no remaining caller

Leaf URL, OCR, validation, and location services should not be removed merely
because their current v1 callers are removed.

## Vision Auto v2 isolation rules

- V2 has its own route, orchestrator, response builder, and status enum.
- V2 does not call `foodMapSocialDiscoveryService.js`,
  `socialInputResolverService.js`, `foodMapSocialDecisionService.js`, or
  `foodMapNextActionService.js`.
- V2 accepts exactly one automatic input: uploaded image or URL.
- V2 does not accept or request hints.
- Collector output is evidence only; it cannot create place entities.
- Normalization cannot infer missing accents or administrative meaning.
- Extraction creates candidates only.
- Validation rebuilds the complete final entity set; rejected entities cannot
  survive in a stale object.
- Place resolution receives only validated entities.
- Final decision is limited to `matched_place`, `draft_candidate`, or
  `unresolved_best_effort`.
- Provider failure is represented by bounded warning codes and never throws a
  public stack trace.
- Public debug is summary-only and never contains keys, prompts, raw provider
  responses, credential paths, or unbounded OCR output.
- Google Places, frame scanning, and Speech-to-Text remain disabled by default.

## Initial implementation scope

- Phase 0: v2 structure, response contract, configuration, and guarded route.
- Phase 1: uploaded-image OCR, normalization, extraction, validation, and
  draft/unresolved decision.
- Phase 2: YouTube/blog/social metadata and safe thumbnail OCR, with the
  descriptive-title regression fixed.
- Phase 3: optional Places resolution and candidate decisions behind the
  existing disabled provider flag.
- Phase 4/5 preparation: disabled frame and speech collectors with bounded
  configuration, dependency-injected failure guards, and no production media
  download implementation yet.

## Implemented v2 boundary

- Endpoint: `POST /api/food-map/vision-auto-v2`
- Route mount flag: `VISION_AUTO_V2_ROUTE_ENABLED`
- Service execution flag: `VISION_AUTO_V2_ENABLED`
- Accepted input: exactly one multipart `image` or `url`
- Rejected input: `hint`
- Public statuses:
  - `matched_place`
  - `draft_candidate`
  - `unresolved_best_effort`
- Public response keys:
  - `status`
  - `confidence`
  - `input`
  - `evidenceSummary`
  - `entities`
  - `placeCandidates`
  - `bestResult`
  - `addPlaceDraft`
  - `reason`
  - `debug`

The response builder caps metadata, OCR lines, frame text, audio text, warnings,
entity evidence, candidates, and debug steps. It strips sensitive URL query
parameters and does not serialize provider debug objects.

Current Phase 4/5 limitation: frame OCR and Speech-to-Text have disabled,
bounded adapter contracts and failure/cleanup handling, but no production
`yt-dlp`, `ffmpeg`, or speech provider implementation is enabled.
