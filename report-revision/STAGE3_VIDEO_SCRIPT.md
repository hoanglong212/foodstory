# Stage 3 Video Script (8-10 minutes)

The student must personally record the face-visible introduction and live-coding segment. This document is a script, not evidence that recording occurred.

## 0:00-0:45 - Introduction (face visible)

"Hello, I am [state your name and student ID]. My Stage 3 advanced technique is a reusable Vue 3 composable that manages long-running, cancellable Vision Auto jobs and safely synchronises structured food-discovery outcomes with the Leaflet Food Map. I will focus on the Vue lifecycle and race-safety design, not AI theory. The source snapshot is commit `c100723`, with the final evidence revision on `stage3-report-improvement`."

Show: title slide and the state-machine figure.

## 0:45-1:45 - Why extraction was needed

Open `frontend/src/views/FoodMapView.vue` around the `useVisionAuto` destructuring and Leaflet setup.

"FoodMapView already owns the map instance, marker clusters, stores, focus, coordinate picking, and teardown. Putting polling, timers, cancellation, error adaptation, and stale-response protection in the same view would make it harder to reason about both lifecycles. I kept imperative Leaflet ownership here and extracted the reusable async state machine into `useVisionAuto`."

Show: `visionMatchedMapPlace`, `findExistingVisionPlace`, and `focusVisionMatchedPlace`.

## 1:45-3:30 - Public API, refs, computed values, injection

Open `frontend/src/composables/useVisionAuto.js:73`.

"The composable injects five functions: create, get, cancel, dish identification, and serving-place search. Production defaults come from the API service, while tests substitute deterministic functions."

Point to the eight refs and five computed values.

"`state` is the authority. Computed values derive whether analysis is active, whether the URL is valid, whether submit is allowed, a source summary, and progress copy. I do not use a watcher to start network work; explicit actions make transitions testable."

Scroll to the returned contract and briefly name input, lifecycle, result, job, and dish-first groups.

## 3:30-4:45 - Polling, abort, run guard, unmount

Show `waitForNextPoll`, `cancel`, `submit`, and `onBeforeUnmount`.

"Submit allocates a fresh AbortController and monotonically increasing run ID. Polling updates only bounded UI stages. Every continuation checks that its run is still current. Cancellation invalidates the run first, aborts HTTP, clears the polling timeout and elapsed interval, and requests backend cancellation when a job ID exists. Unmount calls the same disposal path."

"The final tests found a real race: a superseded create response could overwrite the new run's job ID. The fix captures job ID per run and cancels a stale late-created job."

## 4:45-6:00 - Live UI: submit, progress, cancel, retry

Use a prepared public demo URL only if the local backend is already configured and preflighted. Do not expose `.env` or provider keys.

1. Open Food Map guest or authorised route as appropriate.
2. Open the compact Dish Vision panel.
3. Paste the prepared URL and submit.
4. Narrate progress copy and elapsed time.
5. Cancel during an active stage and show the panel safely returning.
6. Submit again/retry and identify that it is a new run.

If the backend/provider is unavailable, say: "This is the designed provider-unavailable boundary. I will use the deterministic test next rather than claim a live success."

## 6:00-7:00 - Dish candidates, review, safe not-found

Show the result panel templates or prepared fixture states.

"A review candidate is visible evidence, not a resolved place. It has no coordinates and cannot auto-resolve. A safe not-found result is intentional when evidence cannot justify a place. In dish-first mode, candidate dishes can lead to places serving the dish; those alternatives are not described as the filming location."

Show `visionAutoUiAdapter.js` validation for resolver records and review candidates.

## 7:00-8:15 - Personal live-coding change

Recommended small change: improve the progress-copy mapping without changing API contracts.

Before recording, reset this change so the student can type it personally. Suggested change:

```js
const progressCopyByState = {
  fast_analysis: 'Checking the video details',
  deep_analysis: 'Looking more closely at the video',
  resolving: 'Checking possible places',
}
```

Then replace the nested conditional fallback with `progressCopyByState[state.value] || 'Preparing analysis'`. Remove the duplicate `elapsedSeconds >= 35` branch. Explain that the output remains computed from reactive state and time.

Do not paste a prepared block during the assessment; type and explain the change.

## 8:15-9:00 - Focused test and conclusion

Run:

```powershell
cd C:\COS30043\foodstory\frontend
rtk npm.cmd test -- --run src/composables/useVisionAuto.test.js src/adapters/visionAutoUiAdapter.test.js
```

Expected evidence from this revision: 2 files passed, 10 tests passed.

"The focused tests demonstrate lifecycle and adaptation behaviour; they are not model accuracy. The controlled benchmark separately shows router-only non-regression: 96.67 percent safe routing and zero false promotion for both compatible versions. The main Stage 3 contribution is the Vue composable boundary that keeps long-running work cancellable, race-safe, and compatible with the existing Leaflet map."

## Optional 9:00-9:30 - Closing reflection

Use the student's own words to explain what was learned from the stale-run and timer-cleanup defects. Do not read a generic reflection.
