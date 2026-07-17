# FoodStory Feature Evidence Matrix

| Report chapter | Assignment requirement | Feature | Source file | Test file or command | Screenshot | Status | Limitation |
|---|---|---|---|---|---|---|---|
| Stage 1 | Public landing experience | Home, responsive nav, themes | `frontend/src/views/Home.vue`, `frontend/src/App.vue`, `uiStore.js` | `npm.cmd test`; `npm.cmd run build` | 01, 02, 19 | Complete | Visual evaluation is local, not a user study. |
| Stage 1 | About interaction | Food mood/personality selection | `frontend/src/views/About.vue` | Browser interaction | 03–05 | Complete | Two current mood choices. |
| Stage 1 historical | Static news evidence | Original `news.json`/database-era content retained as history | historical assets and `backend/database/migrateNews.js` | Source inspection | n/a | Historical only | Must not be described as the final live source. |
| Final News | External API integration | Guardian listing, search, category/date filters, pagination | `News.vue`, `newsRoutes.js`, `guardianNewsService.js` | 7 Guardian tests; live HTTP 200 | 06 | Complete | Requires server-side key/quota for live use. |
| Stage 2 | Account creation | Register validation | `Register.vue`, `authRoutes.js` | API smoke validation cases | 07 | Complete | No disposable banned-user mutation. |
| Stage 2 | Authentication | Login, logout, session restoration | `Login.vue`, `authStore.js`, router guard | API smoke 87/87; router tests | 08 | Complete | JWT stored in browser local storage. |
| Stage 2 | Role access | Guest/user/admin guards | `router/index.js`, auth/admin middleware | API 401/403 cases | 16–18 | Complete | Shared test accounts only. |
| Stage 2 | Recipe discovery | Search, filters, pagination | `Recipes.vue`, `recipeStore.js`, `recipeRoutes.js` | API list/filter checks | 09 | Complete | Current dataset is seeded/local. |
| Stage 2 | Recipe content | Ingredients, steps, notes, nutrition | `RecipeDetail.vue`, recipe routes/schema | API detail checks | 10 | Complete | Nutrition is stored content, not medical advice. |
| Stage 2 | Ratings | Per-user rating and aggregate | `ratingStore.js`, `ratingRoutes.js`, schema unique/check constraints | API smoke; realtime acceptance; DB audit | 11, 23 | Complete | Single-process live broadcast. |
| Stage 2 | Comments | CRUD, ownership and persistence | `commentStore.js`, `commentRoutes.js` | API smoke; realtime acceptance | 12, 20–22 | Complete | No load/scale test. |
| Stage 2 | Favourites | Save/remove/list | `favoriteStore.js`, `favoriteRoutes.js` | API smoke | 13 | Complete | Per-user DB persistence. |
| Stage 2 | Shopping | Ingredient checklist and toggles | `checklistStore.js`, `checklistRoutes.js` | API smoke | 14 | Complete | Generated from stored ingredients. |
| Stage 2 | Profile | User activity persistence | `Profile.vue`, user comment/favourite/checklist routes | API smoke/profile list checks | 15 | Complete | No profile-photo upload. |
| Stage 2 | User contribution | Pending recipe submission | `RecipeForm.vue`, recipe submission route | API smoke | 16 | Complete | Requires admin review. |
| Stage 2 | Administration | Dashboard, moderation, recipe CRUD | `AdminDashboardView.vue`, `adminStore.js`, `admin.js` | API smoke admin cases | 17, 18 | Complete | Admin UX needs further usability validation. |
| Stage 2 | Real time | Comment/rating push to two clients | `useRealtimeComments.js`, `wsServer.js` | `npm.cmd run test:realtime` 4/4 | 20–23 | Complete | Rooms are in-memory and process-local. |
| Stage 3 | Map preview/access | Guest preview and authenticated map | `FoodMapView.vue`, `FoodMapGuestBanner.vue`, router | frontend Food Map/router tests | 24 | Complete | Browser geolocation permission varies. |
| Stage 3 | Personal Food Map | User spots, focus, filters, clustering | `FoodMapView.vue`, `foodSpotStore.js`, `foodSpots.js` | Browser temp-spot flow; DB/API checks | 25 | Complete | One local dataset; no traffic study. |
| Stage 3 | Local restaurants | Verified local restaurant rendering | restaurant store/routes/catalog | catalog tests | 24 | Complete | Catalog coverage is bounded. |
| Stage 3 | Vision input | YouTube video/Short source | `FoodMapImportPanel.vue`, `visionAutoService.js` | URL policy and contract tests | 26 | Complete | Async video jobs are YouTube-only. |
| Stage 3 | Async lifecycle | Queue, polling, cancel, timeout, retry, stale/unmount safety | `useVisionAuto.js`, `visionAutoJobService.js` | Vision reliability 31/31 and adapter 25/25 | 27 | Complete | 27 is a deterministic fixture state. |
| Stage 3 | Dish-first discovery | Dish candidates and user selection | `visionDishDiscoveryService.js`, result panel | `visionDishDiscovery.test.js` and production gate | 28 | Complete | Dish identity does not prove place. |
| Stage 3 | Serving-place search | Local then optional Google candidates | dish external place service | Vision tests | 29 | Complete | Screenshot is fixture data, not live Google success. |
| Stage 3 | Safe uncertainty | Not-found and provider-unavailable states | result panel, response builder, provider gates | provider-optionality and safe resolver tests | 30, 31 | Complete | Provider success depends on configuration/quota. |
| AI service | Semantic/image capability | SentenceTransformer/OpenCLIP/FastAPI | `ai-service/main.py` | `test_smoke.py` 4/4; imports/syntax | n/a | Partially runtime-verified | Full CLIP inference/startup not forced. |
| Security | Secret handling | Server-side keys, ignores, safe output | `.gitignore`, env examples, provider services | scans; npm audits | n/a | Complete for local snapshot | Remote cloud/GitHub audit not included. |
| Submission | Reproducibility | Tests, evidence and clean package | `report-evidence/` | final ZIP scan/extract/hash | 01–31 | Complete after package manifest | Terminal screenshots remain manual. |
