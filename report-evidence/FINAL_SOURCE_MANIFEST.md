# FoodStory Final Source Manifest

Branch: `report-finalization`  
Baseline commit before finalization: `dd00c76257ad2c04468615e8b85a2037f178d80d`  
Final commit: use `git rev-parse HEAD` after the final local commit; the exact value is also reported in the final Codex response. A commit cannot embed its own SHA without changing that SHA.

## Project directories

- `frontend/`: Vue 3/Vite single-page application, Pinia stores, router, components, styles and Vitest tests.
- `backend/`: Express API, MySQL access, WebSocket server, Food Map/Vision services, workers, migrations, scripts and Node tests.
- `ai-service/`: FastAPI application with SentenceTransformer and OpenCLIP dependencies.
- `report-evidence/`: audit, verification, architecture, screenshots, matrices and submission records.
- `docs/`: historical design, Stage/Track plans and project documentation.

## Runtime technology snapshot

- Node.js 24.11.0; npm 11.6.1.
- Frontend installed: Vue 3.5.34, Vite 8.1.4, Vue Router 5.0.7, Pinia 3.0.4, Bootstrap 5.3.8, Axios 1.16.1, Chart.js 4.5.1, Leaflet 1.9.4, MarkerCluster 1.5.3.
- Backend installed: Express 4.22.2, mysql2 3.22.4, jsonwebtoken 9.0.3, bcryptjs 2.4.3, ws 8.21.0, Axios 1.17.0, Tesseract.js 7.0.0, Google Cloud Vision 5.3.7, Sharp 0.35.1.
- Python 3.13.0; FastAPI 0.136.3, SentenceTransformers 5.5.1, OpenCLIP 3.3.0, Torch 2.12.0 (from `requirements.txt`/validated environment).
- Database runtime: MySQL 8.0.19; schema remains MariaDB-compatible where supported by the declared SQL.

## Important source files

- Frontend shell/routes/state: `frontend/src/App.vue`, `frontend/src/router/index.js`, `frontend/src/stores/`.
- News: `frontend/src/views/News.vue`, `backend/routes/newsRoutes.js`, `backend/services/guardianNewsService.js`.
- Recipes/auth/admin: `frontend/src/views/RecipeDetail.vue`, `frontend/src/views/AdminDashboardView.vue`, `backend/routes/authRoutes.js`, `backend/routes/recipeRoutes.js`, `backend/routes/admin.js`.
- Real time: `frontend/src/composables/useRealtimeComments.js`, `backend/websocket/wsServer.js`, comment/rating routes.
- Food Map: `frontend/src/views/FoodMapView.vue`, `frontend/src/components/food-map/`, Food Map routes/services.
- Vision Auto: `frontend/src/composables/useVisionAuto.js`, `backend/routes/visionAutoRoutes.js`, `backend/services/visionAuto/visionAutoJobService.js`, `backend/workers/visionAutoWorker.js`.
- Database: `backend/database/schema.sql`, `backend/database/migrate.js`, `backend/migrations/`.
- AI: `ai-service/main.py`, `ai-service/requirements.txt`.

## Practical counts

At audit time, Git reported approximately 358 tracked source-like paths by extension/name scan and 85 tracked test-related paths. The three primary application directories accounted for 492 tracked paths. Counts are practical inventory figures, not a language-aware line-of-code metric; generated screenshot evidence added during finalization is separate.

## Excluded from submission

`.git`, real `.env` files, secret/service-account/credential JSON, `node_modules`, virtual environments, caches/bytecode, logs, local databases, coverage/build output, downloaded media, frames/audio/video, temporary provider artifacts, and editor/browser profiles.

## Environment dependencies

MySQL/MariaDB, Node/npm, Python, FFmpeg and yt-dlp for video paths, optional Tesseract/Google Vision OCR, optional ASR/Gemini/Google Places/Guardian credentials, network access for external providers, and sufficient CPU/GPU/RAM for local embedding and OpenCLIP inference.
