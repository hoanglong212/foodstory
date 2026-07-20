# Stage 3 Live-Coding Plan

## Goal

Make one small, explainable Vue improvement in `useVisionAuto` while preserving API and product behaviour: extract progress copy to a lookup and remove the duplicate 35-second condition.

## Preparation

1. Checkout the revision branch and confirm a clean/understood working tree.
2. Open `frontend/src/composables/useVisionAuto.js` and `frontend/src/composables/useVisionAuto.test.js` side by side.
3. Keep terminals at repository root and `frontend`.
4. Do not open `.env` or any provider console during recording.
5. Pre-run the focused tests once before recording.

## Coding steps to perform personally

1. Add a module-level or composable-local `progressCopyByState` object for `fast_analysis`, `deep_analysis`, and `resolving`.
2. Keep the `dish_searching`, `dish_analyzing`, and elapsed >= 35 cases first.
3. Delete the duplicate elapsed branch.
4. Replace the nested state conditional with the lookup plus `Preparing analysis` fallback.
5. Save and run the focused tests.

## Exact commands

```powershell
cd C:\COS30043\foodstory\frontend
rtk npm.cmd test -- --run src/composables/useVisionAuto.test.js src/adapters/visionAutoUiAdapter.test.js
rtk npm.cmd run build
```

If time is short, run only the focused test command during the video and state that the production build was separately verified.

## Speaking prompts

- "This remains a computed derivation; I am not adding another mutable state variable."
- "The change does not touch the backend, model, provider, or Leaflet map."
- "The test count is implementation evidence, not model accuracy."
- "The fallback handles queued/starting states without exposing backend internals."

## Fallbacks

- If tests cannot start: show `frontend/package.json`, confirm `vitest run`, and use the previously captured exact result in `STAGE3_TEST_EVIDENCE.md`; do not claim the new run passed.
- If a test fails: read the failing assertion, explain the intended state, and revert only the live change if needed. Do not hide the failure.
- If the UI/backend is unavailable: demonstrate the injected deterministic composable test. Do not claim provider execution.
- If the editor/font is unreadable: increase zoom before continuing; do not rush through tiny code.
- If internet fails: no impact on the focused unit test; avoid substituting a different live URL.

## After recording

The student should review audio, face visibility, code legibility, terminal result, and duration. Recording/upload/submission remain student-only tasks.
