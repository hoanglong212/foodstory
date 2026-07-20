# Stage 3 Implementation Audit

Audit date: 20 July 2026  
Source baseline: `c1007231c2bf1dc77091bb381df5462de3dd6b6f`  
Revision branch: `stage3-report-improvement`

## Assessment boundary

The assessed advanced Vue technique is the reusable `useVisionAuto` composable. It owns reactive request state, computed derivations, cancellable polling, elapsed-time tracking, run identity, cleanup, and the boundary between public backend results and the Food Map UI. Ordinary HTTP methods live in `visionAutoService.js`; queueing and worker management live in the backend; OCR, ASR, Gemini, metadata extraction, and place resolution are AI/model or media-pipeline implementation. Those supporting layers are not themselves the advanced Vue technique.

## Public composable contract

`useVisionAuto` is exported from `frontend/src/composables/useVisionAuto.js:73` and accepts five injectable functions. Its returned contract begins at line 351.

| Member | Kind | Purpose |
|---|---|---|
| `inputMode` | ref | Selects the compact menu or link-entry surface. |
| `state` | ref | Authoritative UI lifecycle/result state. |
| `url` | ref | Bounded source URL input. |
| `inputError` | ref | Client validation feedback. |
| `errorMessage` | ref | Sanitised service/network feedback. |
| `result` | ref | Adapted place result or dish-first response. |
| `elapsedSeconds` | ref | Display-only elapsed analysis time. |
| `hasSubmittedSource` | ref | Distinguishes edited input from an already-submitted source. |
| `isAnalyzing` | computed | True for active place or dish operations. |
| `hasValidUrl` | computed | Uses the shared HTTP URL validator. |
| `canAnalyze` | computed | Requires a valid URL and no active operation. |
| `sourceSummary` | computed | Produces a compact, non-authoritative source label. |
| `analyzingCopy` | computed | Maps stage/time to user-facing progress copy. |
| `openLink`, `backToMenu` | action | Navigate the compact import UI. |
| `setUrl`, `clearUrl` | action | Bound, set, validate, and clear input. |
| `clearResult` | action | Clear the current adapted outcome. |
| `submit` | async action | Create and poll a cancellable place-discovery job. |
| `submitDishDiscovery` | async action | Run dish identification. |
| `selectDish` | async action | Search mapped places for a chosen dish. |
| `cancel` | action | Invalidate the run, abort HTTP, clear the poll delay, and request backend cancellation. |
| `retry` | action | Submit the current URL under a new run identity. |
| `reset` | action | Cancel and restore the complete public state to defaults. |
| `dispose` | action | Lifecycle-safe cancellation hook. |

## Reactive refs and computed state

The eight refs are declared at `useVisionAuto.js:80-87`. Five computed values are declared at lines 96-100. This is advanced Vue logic because UI eligibility, busy state, source description, and progress copy derive reactively without duplicating state in `FoodMapView` or child panels.

There are no watchers inside the composable. This is intentional: actions own side effects, while computed values remain pure. `FoodMapView.vue` contains product-context watchers for map filters, layout, and store data; these are not part of the composable's job lifecycle.

## Timers and polling lifecycle

`startElapsedTimer` and `stopElapsedTimer` at `useVisionAuto.js:110-122` update elapsed display time every 500 ms. `waitForNextPoll` at lines 124-137 owns the 1.5-second polling delay and resolves immediately on abort. The submit lifecycle is:

1. Validate a complete HTTP(S) URL.
2. Abort any preceding controller and allocate a new `AbortController` and run ID.
3. Clear prior errors/results, set `analyzing`, mark the source submitted, and start elapsed timing.
4. Call the injected create-job function.
5. Reject or cancel the new backend job immediately if its create response belongs to a stale/aborted run.
6. Store the current job ID and poll until `completed`, `not_found`, `failed`, `cancelled`, or `timed_out`.
7. Reflect `fast_analysis`, `deep_analysis`, and `resolving` stages reactively.
8. Adapt the public terminal result and assign a safe UI state.
9. Stop timers and clear run-local handles only when the completing run is still current.

The polling loop is frontend coordination, not the video/AI pipeline. The backend can continue through metadata, deep analysis, resolution, and cleanup independently of Vue rendering.

## Cancellation and backend cancellation

`cancel` at `useVisionAuto.js:170` performs four distinct operations: invalidate the run guard, abort the HTTP controller, clear the active polling delay, and fire a best-effort backend DELETE for the active job. It then stops elapsed timing and clears active UI states. The API method is ordinary HTTP (`visionAutoService.js`); coordinating it with reactive state and stale-run invalidation is the advanced Vue concern.

The final audit found and fixed two real lifecycle defects:

- A late create response from a superseded run could overwrite shared `activeJobId`, letting a newer run poll/cancel the wrong backend job. Job IDs are now run-local and stale late-created jobs are cancelled.
- The elapsed interval was cleared on cancellation, but an in-progress 1.5-second polling timeout remained queued. The polling delay now listens to the abort signal and clears immediately.

## Backend job cancellation and coordinator boundary

The frontend DELETE route is `backend/routes/visionAutoRoutes.js:241-243`. The job service owns terminal states (`visionAutoJobService.js:17`), exactly-once settlement (line 122), deadlines (line 161), worker startup (line 181), queue pumping (line 339), submission/deduplication (line 360), and cancellation (line 459). The worker creates its own `AbortController` (`backend/workers/visionAutoWorker.js:34`) and reports bounded stages/results to the coordinator.

This is backend orchestration supporting the composable. It should be described as a boundary, not as evidence of Vue sophistication.

## Stale-run protection, retry, reset, and disposal

`visionAutoRunGuard.js` supplies monotonically increasing run identities. Starting a newer operation invalidates the older identity; cancellation explicitly invalidates the active identity. Every async response checks currency before mutating refs. Retry delegates to `submit`, so it creates a new controller and identity. Reset cancels, clears URL/result/errors, returns to menu mode, and zeros elapsed time. `onBeforeUnmount(dispose)` at `useVisionAuto.js:349` provides component-lifecycle cleanup; `FoodMapView.vue:1947-1967` separately tears down map timers, marker collections, and Leaflet itself.

## Backend-response adaptation

`frontend/src/adapters/visionAutoUiAdapter.js:65` maps public backend status to UI state. It accepts only FoodStory or external resolver records with bounded identity/address data. External records require finite coordinates and a provider place ID. Review candidates must explicitly be `reviewRequired: true` and `canAutoResolve: false`; their coordinates remain null. A malformed match, weak multi-place result, or empty review set degrades to safe `not_found` rather than inventing a place.

Important terminology:

- `review_required` evidence is a candidate for human review, not a resolved location.
- `provider_unavailable` is preserved as the reason on a safe `not_found` state.
- `not_found` is an intentional terminal safety outcome.
- Google Places/other provider alternatives are places serving a selected dish, not claimed filming locations.

Dish-first responses use a separate public endpoint and are retained as dish candidates or serving-place alternatives. They do not pass through the place-resolution adapter because their contract is product discovery rather than source-location resolution.

## Leaflet and Food Map synchronisation

`FoodMapView.vue` remains the owner of the Leaflet map, marker clusters, store-backed place collections, and teardown. The composable supplies state/result only. The view then:

- resolves adapted FoodStory matches against real local records (`findExistingVisionPlace`, line 493);
- derives a map-ready matched place (`visionMatchedMapPlace`, line 392);
- focuses an existing marker or finite fallback coordinates (`focusVisionMatchedPlace`, line 1495);
- keeps review-only candidates out of automatic map targeting (`reviewVisionCandidate`, line 1597);
- runs dish selection and focuses real local/external serving places (`handleVisionDishSelection`, line 1624; `focusVisionDishPlace`, line 1634);
- routes confirmed drafts through the existing add-place workflow rather than silently writing to the database.

This separation is the core architectural result: the composable synchronises safe structured outcomes, while the view retains imperative Leaflet ownership.

## Test coverage by concern

| Concern | Direct evidence |
|---|---|
| Invalid URL; submit transition; terminal polling | `frontend/src/composables/useVisionAuto.test.js` |
| Cancellation, AbortController, backend cancel | `frontend/src/composables/useVisionAuto.test.js` |
| Stale late create response; newer-run authority | `frontend/src/composables/useVisionAuto.test.js` |
| Retry identity; reset; unmount; timer cleanup | `frontend/src/composables/useVisionAuto.test.js` |
| Provider unavailable; review-only; safe not-found | `frontend/src/adapters/visionAutoUiAdapter.test.js` |
| Dish candidates | `frontend/src/composables/useVisionAuto.test.js` |
| Queue, cancellation, timeouts, worker lifecycle | `backend/tests/visionAutoJobService.test.js` |
| Public resolver/review boundary | `backend/tests/visionAutoTrack2V3Adapter.test.js` |
| Track 2 V3 closure and review-only safety | `backend/tests/shorts/shortsTrack2V3OutputClosure.test.js` and complete suite |

## Remaining weaknesses

- Polling uses a fixed 1.5-second interval; there is no adaptive backoff or server-driven retry hint.
- Backend cancellation is best-effort and intentionally does not replace frontend invalidation as the safety boundary.
- Dish-first calls are cancellable but are request/response operations, not asynchronous backend jobs.
- `analyzingCopy` contains a duplicated `elapsedSeconds >= 35` branch and has limited stage granularity.
- The composable depends on browser globals (`window`, `AbortController`), so SSR use would need injected timer/controller primitives.
- `FoodMapView` is still large and remains responsible for substantial imperative product integration; further extraction would need careful protection of Leaflet behavior.
- No controlled benchmark measures full video acquisition, OCR/ASR/provider, place resolution, or end-to-end user latency.

## Technique classification summary

| Layer | Classification | Assessed as advanced Vue? |
|---|---|---|
| Reactive refs/computed state, run guard, polling, cancellation coordination, cleanup | Advanced Vue composable logic | Yes |
| Axios create/get/delete/dish requests | Ordinary API calls | No |
| Queue, worker, deadlines, heartbeat, cancellation | Backend orchestration | Supporting boundary only |
| Metadata, frames, OCR, ASR, Gemini, resolver/provider logic | AI/model/media implementation | No; relevant only as input/output context |
