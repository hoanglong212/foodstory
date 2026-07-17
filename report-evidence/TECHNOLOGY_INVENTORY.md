# FoodStory Technology Inventory

Installed versions are from the audited local environment or pinned Python requirements on 2026-07-17.

| Technology | Version | Purpose / where used | Alternatives considered | FoodStory-specific advantage | Limitation |
|---|---:|---|---|---|---|
| Vue 3 | 3.5.34 | Component/composition UI in `frontend/src` | React, Svelte | Composition API fits reusable map, auth and Vision state | SPA requires client JavaScript. |
| Vite | 8.1.4 | Dev server and production bundling | Webpack, Vue CLI | Fast Vue development and code splitting | Toolchain/node compatibility must be maintained. |
| Vue Router | 5.0.7 | Public, guest, user and admin routes | Manual routing | Central metadata guards and lazy pages | Client guards must be paired with backend authorization. |
| Pinia | 3.0.4 | Auth, recipes, ratings, comments, map and UI state | Vuex, local component state | Clear domain stores and socket updates | In-memory UI state needs explicit persistence. |
| Bootstrap | 5.3.8 | Grid/utilities alongside custom responsive CSS | Tailwind, pure CSS | Familiar responsive primitives | Custom design can conflict with framework defaults. |
| Axios | frontend 1.16.1; backend 1.17.0 | API client, cancellation and provider calls | Fetch | Interceptors and consistent errors/timeouts | Two installed versions require update coordination. |
| Chart.js | 4.5.1 | Admin/dashboard visualizations | D3, ECharts | Small learning curve for academic metrics | Less flexible than low-level D3. |
| Express | 4.22.2 | REST API/proxy and middleware | Fastify, NestJS | Simple fit for existing route/service architecture | Manual structure and validation discipline. |
| MySQL | server 8.0.19; mysql2 3.22.4 | Persistent users, recipes, engagement and map data | PostgreSQL, SQLite | Relational constraints match ownership/moderation | External server setup and migration management. |
| JWT | jsonwebtoken 9.0.3 | Stateless API/WebSocket authentication | Cookie sessions, OAuth | Shared HTTP/WebSocket identity contract | Revocation and localStorage exposure require care. |
| bcrypt | bcryptjs 2.4.3 | Password hashing | Argon2, scrypt | Portable pure-JS local setup | Slower/less modern than Argon2; cost tuning required. |
| WebSocket | ws 8.21.0 | Recipe-room comments/ratings | Socket.IO, SSE | Lightweight event contract | Current rooms do not span processes. |
| Leaflet | 1.9.4 | Interactive Food Map | Mapbox GL, Google Maps JS | Open ecosystem and simple marker control | Raster rendering and manual state synchronization. |
| MarkerCluster | 1.5.3 | Dense marker grouping | Supercluster | Integrates directly with Leaflet | Cluster state is browser-side. |
| FastAPI | 0.136.3 | Python embedding/image endpoints | Flask, Django REST | Typed validation and async image URL checks | Separate service deployment and model memory. |
| SentenceTransformer | 5.5.1 | Text embeddings/retrieval | Hosted embedding APIs, TF-IDF | Local semantic capability without per-call provider cost | Model download, RAM and CPU latency. |
| OpenCLIP | 3.3.0 | Image/food/dish visual embeddings | Hosted vision API, torchvision classifier | Local image-text alignment and explicit dish prompts | Full model startup can be slow on CPU. |
| Tesseract.js | 7.0.0 | Local OCR and safe fallback | EasyOCR, PaddleOCR | No cloud credential required | Noisy overlays and Vietnamese OCR variability. |
| Google Cloud Vision | 5.3.7 | Optional stronger OCR provider | Tesseract, Azure Vision | Managed OCR quality when configured | Credential/quota/privacy dependency. |
| ASR providers | configurable Track 2 adapters | Bounded speech evidence for video | Whisper local, cloud speech APIs | Adds evidence when text is spoken rather than visible | Audio extraction, latency and provider availability. |
| Gemini | configurable; SDK path through current backend AI stack | Bounded validation/crop judgment/repair gates | Rules-only, OpenAI vision | Useful as a gated second opinion | Quota, nondeterminism; never allowed to bypass safety. |
| Google Places | server-side HTTP integration | Alternative serving-place candidates | Geoapify, local-only search | Rich place/rating/photo metadata | Candidates do not prove the filming location. |
| Guardian News API | server-side REST | Current external food-news listing | NewsAPI, static JSON | Food-section content and server-side proxy | Key/quota/provider availability; Stage 1 JSON remains historical. |
| FFmpeg | local executable | Frame/audio extraction | GStreamer | Mature bounded media processing | Native dependency and process cleanup. |
| yt-dlp | local executable | YouTube media/metadata acquisition | YouTube Data API plus downloader | Broad URL/media handling | Upstream site changes and network instability. |
