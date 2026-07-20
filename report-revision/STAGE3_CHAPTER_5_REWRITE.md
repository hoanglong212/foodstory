# Chapter 5 - Stage 3 Advanced Technique

> Integration note: this evidence-driven rewrite is ready to replace Chapter 5 in the source report. The specified source DOCX was unavailable during revision, so the original first-person reflection, citations, academic integrity statement, and cross-references could not be merged or preserved automatically. Section 5.16 deliberately requires the student's existing reflection rather than inventing a replacement.

## 5.1 Advanced Technique Definition and Assessment Relevance

The Stage 3 advanced technique is a reusable Vue 3 composable, `useVisionAuto`, that manages long-running and cancellable Vision Auto jobs and safely synchronises structured food-discovery outcomes with an interactive Leaflet Food Map. The technical contribution is not the use of an HTTP endpoint or an AI provider by itself. It is the composable's coordinated control of reactive state, computed eligibility and progress, asynchronous polling, abort signals, backend cancellation, stale-response protection, retry/reset behaviour, and component-lifecycle cleanup.

This definition makes the assessed Vue work observable. A user can submit a video URL, see progress change as the backend job advances, cancel without a stale result reopening the panel, retry under a new run identity, and receive a matched, review-required, not-found, provider-unavailable, or dish-first outcome without exposing raw model/provider internals.

## 5.2 Food Map as the Existing Product Context

The Food Map already owned a real Leaflet instance, marker clusters, FoodStory and restaurant stores, filters, map focus, coordinate picking, detail drawers, and cleanup. Stage 3 did not replace that map. `FoodMapView` remains the imperative Leaflet owner while the composable supplies bounded reactive job state. This preserved existing product behaviour and avoided coupling network orchestration to marker creation.

The final source contains 3,124 lines in the main view compared with 8,481 in the earlier monolithic snapshot. Across the extracted CSS and five production Vue components, the final distributed feature contains 9,091 lines. This is evidence of architectural decomposition, not evidence of faster rendering or higher FPS.

## 5.3 Evolution from Image OCR to Vision-Assisted Video Discovery

The implementation evolved through five bounded stages: single-image OCR; early video sampling; explicit Track 1/Track 2 routing; candidate-first review; and dish-first discovery. Early stages treated visible text as the central input. Later stages introduced safer routing and preserved uncertain evidence as review-only candidates. The final product pivot recognises that many food videos identify a dish more reliably than a filming location, so the UI can identify a dish and then search for places that serve it without claiming those alternatives are the filming location.

[Insert Figure: `figures/01_vision_auto_evolution_timeline.png`]

## 5.4 The Accuracy-Frame-Latency Problem

Video discovery creates a three-way engineering tension. Sampling more frames can expose short-lived overlays, but increases acquisition and OCR work. Aggressive promotion can improve apparent match rate but increases false locations. Conservative routing protects users but creates more review or not-found outcomes. The chosen boundary prioritises safety: only resolver-backed FoodStory or external place records can become map targets; OCR/ASR evidence remains review-only until confirmed.

The controlled benchmark does not measure this full trade-off because it contains router fixtures rather than labelled media runs. Full frame count, OCR latency, provider latency, exact-place accuracy, and dish accuracy therefore remain limitations rather than estimated results.

## 5.5 Track 1, Track 2 and Candidate-First Evidence

Track 1 handles strong metadata/address cases through deterministic routing. Track 2 V3 performs bounded evidence recovery for uncertain cases. The candidate-first boundary prevents a plausible OCR string from becoming a real place card merely because it has a confidence score. Review candidates explicitly carry `reviewRequired: true` and `canAutoResolve: false`, have no map coordinates, and must not be described as resolved locations.

The controlled 30-case routing fixture produced 96.67% safe-routing accuracy and 0.00% false-promotion for both Track 2 V3 and Final over 150 measured case-runs per version. The 70.00% review-route value is a router track proportion, not the percentage of live videos that end in a public review state.

## 5.6 Advanced Vue Design of `useVisionAuto`

### 5.6.1 Public Composable Contract

| Contract group | Members | Responsibility |
|---|---|---|
| Input | `inputMode`, `url`, `inputError`, `hasSubmittedSource` | Own URL-entry state and validation feedback. |
| Lifecycle | `state`, `elapsedSeconds`, `isAnalyzing`, `analyzingCopy` | Represent progress and terminal outcomes. |
| Result | `result`, `errorMessage`, `sourceSummary` | Expose bounded result and public error state. |
| Eligibility | `hasValidUrl`, `canAnalyze` | Derive whether a run can start. |
| Navigation/input actions | `openLink`, `backToMenu`, `setUrl`, `clearUrl` | Manage the compact import surface. |
| Job actions | `submit`, `cancel`, `retry`, `reset`, `dispose` | Coordinate the long-running job lifecycle. |
| Dish-first actions | `submitDishDiscovery`, `selectDish` | Identify a dish and search serving-place alternatives. |
| Result actions | `clearResult` | Dismiss the current outcome without modifying map ownership. |

Five dependencies are injectable: create job, get job, cancel job, discover dish, and search dish places. This makes the asynchronous lifecycle testable without a live backend or provider.

### 5.6.2 Reactive State and Computed Derivations

Eight refs hold mutable public state. Five computed values derive busy status, URL validity, submission eligibility, source summary, and progress copy. The composable uses no watcher for network side effects; explicit actions make the cause of each request and transition testable. This avoids storing redundant booleans that could disagree with the authoritative `state` ref.

### 5.6.3 Polling and Backend Job Coordination

`submit` validates the URL, allocates a new `AbortController` and run identity, starts elapsed timing, creates the backend job, and polls every 1.5 seconds until a terminal status. Intermediate backend stages are reduced to `fast_analysis`, `deep_analysis`, or `resolving`; queue/start implementation details are not leaked into the panel. Terminal public data is passed through the response adapter before reactive assignment.

[Insert Figure: `figures/02_use_vision_auto_state_machine.png`]

### 5.6.4 Cancellation and Lifecycle Cleanup

Cancellation is multi-layered. The run guard is invalidated first, so a late result cannot update refs. The HTTP controller is aborted. The current polling delay and elapsed interval are cleared. If a backend job ID exists, the composable sends a best-effort DELETE request. `onBeforeUnmount(dispose)` applies the same cleanup when the component leaves the page. `FoodMapView` separately removes its key listener, timers, animation frames, marker collections, and Leaflet map.

### 5.6.5 Stale-Run and Race-Condition Protection

Each operation receives a monotonically increasing run ID. Async continuations check that ID before polling or committing a result. The final revision fixed a race where a superseded create response could overwrite a shared active job ID. Job IDs are now captured per run, and a stale late-created backend job is cancelled rather than adopted by the newer run.

### 5.6.6 Result Adaptation and Leaflet Synchronisation

The adapter is a client safety backstop. A public place requires a supported source type, stable ID, name, and address. An external place additionally requires finite coordinates and a provider place ID. Review evidence is accepted only when explicitly review-only and is never added to `mapTargets`. Malformed positive results degrade to safe `not_found`.

`FoodMapView` then resolves a FoodStory ID against real store data, focuses an existing marker when possible, and falls back to finite coordinates for valid external places. Review candidates enter the existing manual draft/coordinate-picking workflow; they are never silently written to the database.

[Insert Figure: `figures/03_stage3_sequence_diagram.png`]

### 5.6.7 Why a Composable Was Selected

| Option | Strength | Limitation for this problem |
|---|---|---|
| Logic inside `FoodMapView` | Direct access to Leaflet and stores | Makes a large imperative view own timers, HTTP, cancellation, adaptation, and map lifecycle; difficult to test in isolation. |
| Pinia store | Shared application-wide state and persistence | The operation is page-scoped and disposable; global state risks retaining controllers/results beyond the map lifecycle. |
| Generic API service | Clean HTTP wrappers | Cannot by itself express Vue refs, computed state, cleanup hooks, polling state, or stale-run protection. |
| Reusable composable | Vue-native reactivity, lifecycle cleanup, injected dependencies, page-scoped reuse | Still requires a separate view owner for imperative Leaflet operations. |

The composable is the best project-specific choice because the asynchronous state is reusable and Vue-lifecycle-bound, while map ownership remains deliberately outside it.

## 5.7 Backend Boundary Supporting the Composable

The backend job coordinator supplies queue limits, idempotency/deduplication, worker startup, heartbeat/deadline handling, exactly-once terminal settlement, result sanitisation, retention, and cancellation. These details support the composable's public job contract but are not the assessed Vue technique. Detailed queue configuration and provider matrices should be moved to an appendix.

## 5.8 Media and Evidence Pipeline

The worker can attempt a fast metadata path before deeper media analysis and place resolution. Track 2 V3 can use bounded frame/evidence stages and optional providers. The report should describe these only far enough to explain why the frontend operation is long-running and why uncertainty states exist. Native tool/provider details belong in an appendix.

## 5.9 Security Boundary and SSRF Protection

The frontend validates a complete HTTP(S) URL for usability, but the backend remains the security authority. Backend URL-policy tests reject localhost/private IPs and embedded credentials, preserve signed image queries where required, and constrain asynchronous video jobs to supported YouTube sources. Uploaded/remote images are bounded and sniffed rather than trusted solely by declared MIME type. Secrets remain server-side and `.env` files are ignored.

## 5.10 Dish-First Product Pivot

The dish-first path returns bounded dish candidates from a supported video. A user selects a candidate, after which the product searches local and external records for places serving that dish. These are alternatives for discovery, not evidence of the video's filming location. This pivot makes uncertainty useful without weakening location safety.

## 5.11 User-Facing Uncertainty States

The UI distinguishes matched place, external place, multiple resolved places, review-required candidate, safe not-found, provider-unavailable reason, timeout reason, error, dish candidates, dish places found, and dish places not found. `not_found` is intentional when evidence cannot safely justify a place. `provider_unavailable` is a qualified reason, not proof that no place exists.

## 5.12 Failure Cases and Engineering Learning

Two final lifecycle tests exposed real concurrency/cleanup issues. First, a late create response could contaminate the newer run's job ID. Second, cancellation cleared the elapsed interval but not the current polling timeout. The corrected implementation treats run identity and timer ownership as explicit resources. This was a practical lesson that aborting HTTP is insufficient by itself: every queued continuation must also be prevented from mutating current UI state.

## 5.13 Quantitative Evaluation

| Version | n | Safe routing | False promotion | Review route | Timeout | Router p50 | Router p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Track 2 V3 | 150 | 96.67% | 0.00% | 70.00% | 0.00% | 0.045200 ms | 0.190700 ms |
| Final | 150 | 96.67% | 0.00% | 70.00% | 0.00% | 0.048400 ms | 0.194600 ms |

[Insert Figure: `figures/04_track2_v3_vs_final_router_benchmark.png`]

The compatible evidence supports safe-routing non-regression. It does not establish exact-place accuracy, dish accuracy, OCR accuracy, or full Vision Auto latency. Test results provide separate implementation evidence: the focused frontend lifecycle/adapter suite passed 10/10; the full frontend suite passed 29/29; backend Vision reliability passed 31/31; the adapter boundary passed 25/25; and the complete selected Track 2 V3 suite passed 75/75. These counts are tests passed, not model accuracy.

[Insert Figure: `figures/05_test_to_concern_matrix.png`]

## 5.14 Limitations of the Evaluation

The router corpus has 30 unique cases and five measured repeats, but no common labelled media ground truth for exact place or dish. Network and live providers were disabled. Queue wait, media acquisition, frame extraction, OCR, ASR, provider, adapter, map focus, and user-visible end-to-end latency were not jointly instrumented. Fixture screenshots, if retained elsewhere in the report, must be captioned as deterministic fixture evidence rather than live-provider proof.

## 5.15 Technology Decisions

Vue refs/computed values were chosen for reactive UI state; an injected composable for page-scoped testability and cleanup; Axios/AbortController for cancellable transport; a monotonically increasing run guard for stale-response safety; Leaflet/markercluster for the existing map; and a backend worker coordinator for long-running isolation. Optional AI/provider services remain behind server-side configuration and safe public response builders.

## 5.16 Personal Reflection

Preserve and lightly edit the student's existing first-person reflection here. It should connect specific personal decisions to evidence - particularly extracting the composable, discovering the stale job-ID race, treating safe not-found as a product outcome, and learning to separate router tests from model accuracy. Do not replace the student's voice with generic generated reflection.

## Appendix relocation notes

Move detailed queue limits, environment flags, provider matrix, OCR/ASR/native tool comparisons, and low-level worker settings to an appendix. Keep only the backend contract and lifecycle facts required to understand the advanced Vue technique in Chapter 5.
