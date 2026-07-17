# FoodStory Architecture Summary

## Overall full-stack architecture

```mermaid
flowchart LR
  Browser["Vue 3 browser application"] -->|"HTTPS JSON + JWT"| API["Express API"]
  Browser <-->|"Authenticated WebSocket"| WS["ws room server"]
  API --> DB[("MySQL 8 / MariaDB-compatible schema")]
  API --> News["Guardian Content API"]
  API --> Places["Google Places / Geoapify when configured"]
  API --> OCR["Tesseract / Google Vision"]
  API --> AI["FastAPI embedding and OpenCLIP service"]
  API --> Queue["In-memory Vision Auto job service"]
  Queue --> Worker["Child-process Vision Auto worker"]
  Worker --> Media["yt-dlp + FFmpeg"]
  Worker --> OCR
  Worker --> Places
  Worker --> Gemini["Gemini / ASR when configured"]
```

## Authentication and role flow

```mermaid
sequenceDiagram
  participant U as Browser
  participant V as Vue auth store
  participant A as Express auth routes
  participant D as MySQL
  U->>V: Register or login form
  V->>A: Validated credentials
  A->>D: Find user / store bcrypt hash
  D-->>A: User and role
  A-->>V: JWT plus safe user fields
  V->>V: Persist token and user in localStorage
  V->>A: Bearer JWT on protected request
  A->>A: Verify JWT and role middleware
  A-->>U: User/admin resource or 401/403
```

## Real-time comments and ratings

```mermaid
sequenceDiagram
  participant A as User A
  participant API as Express route
  participant DB as MySQL
  participant WS as Recipe WebSocket room
  participant B as User B
  A->>API: Create/edit/delete comment or rate
  API->>DB: Validate owner and persist mutation
  DB-->>API: Committed/observable row or aggregate
  API->>WS: Broadcast bounded event after persistence
  WS-->>A: Event
  WS-->>B: Event without refresh
  B->>B: Pinia upsert/delete by stable ID
```

The UI stores de-duplicate comments by ID, while the database enforces one rating per `(user_id, recipe_id)`. Comment update/delete routes require the authenticated owner.

## Food Map architecture

```mermaid
flowchart TB
  View["FoodMapView.vue"] --> Leaflet["Leaflet map + MarkerCluster"]
  View --> SpotStore["Personal/community food-spot store"]
  View --> RestaurantStore["Verified restaurant store"]
  View --> Discovery["Discovery and filter trays"]
  View --> VisionUI["Dish Vision / Vision result panels"]
  SpotStore --> SpotAPI["Express food-spots routes"]
  RestaurantStore --> RestaurantAPI["Express restaurants routes"]
  SpotAPI --> DB[("MySQL")]
  RestaurantAPI --> DB
  VisionUI --> VisionAPI["Vision Auto and dish-discovery routes"]
  VisionAPI --> LocalResolver["Local place/duplicate resolver"]
  VisionAPI --> External["Optional external candidates"]
  LocalResolver --> DB
```

## Vision Auto frontend job flow

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Validating: submit URL
  Validating --> Queued: POST asynchronous job
  Queued --> FastAnalysis: poll status
  FastAnalysis --> DeepAnalysis
  DeepAnalysis --> Resolving
  Resolving --> Completed
  Resolving --> SafeNotFound
  Queued --> Cancelled: cancel or unmount
  FastAnalysis --> TimedOut
  FastAnalysis --> Failed
  Completed --> Idle: dismiss or retry
  SafeNotFound --> Idle: retry
  Failed --> Idle: retry
```

`useVisionAuto` uses an abort controller, active job ID, polling terminal-state allowlist, elapsed timer, stale-run guard and unmount cleanup. Dish-first discovery is a related two-step flow rather than proof of a filming location.

## Vision Auto backend worker flow

```mermaid
flowchart TD
  Create["Validate and canonicalize YouTube URL"] --> Backpressure{"Queue capacity available?"}
  Backpressure -- No --> Busy["429 bounded busy response"]
  Backpressure -- Yes --> Queue["In-memory queued job"]
  Queue --> Child["Start isolated child worker"]
  Child --> Metadata["Bounded metadata hypothesis"]
  Metadata --> Exact{"Exact safe local match?"}
  Exact -- Yes --> Publish["Whitelisted matched place"]
  Exact -- No --> Media["Shared media session"]
  Media --> Frames["Bounded frame sampling"]
  Frames --> Evidence["OCR / optional ASR / optional Gemini"]
  Evidence --> Gate["Quality, safety and intent gates"]
  Gate --> Resolve["Local then configured external resolution"]
  Resolve --> Publish
  Gate --> Review["Review-only candidate or safe not-found"]
  Child -->|"heartbeat/deadline/cancel"| Cleanup["Process-tree and temporary-file cleanup"]
```

## Dish-first discovery flow

```mermaid
flowchart LR
  URL["Public YouTube URL"] --> Identify["Identify bounded dish candidates"]
  Identify --> Choice{"User selects a dish"}
  Choice --> Local["Search FoodStory places near map origin"]
  Local --> Enough{"Useful local results?"}
  Enough -- Yes --> Candidates["Reviewable serving-place candidates"]
  Enough -- No --> Google["Optional Google Places search"]
  Google --> Candidates
  Candidates --> Safety["Explicitly not claimed as original filming location"]
```
