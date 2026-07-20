# Stage 3 Test Evidence

Date: 20 July 2026  
Branch: `stage3-report-improvement`  
Baseline commit: `c1007231c2bf1dc77091bb381df5462de3dd6b6f`

## Tests added

`frontend/src/composables/useVisionAuto.test.js` adds seven lifecycle tests covering invalid input, submit transitions, polling stages, cancellation, backend cancellation, stale-run rejection, retry identity, reset, unmount disposal, timer cleanup, and dish candidates.

`frontend/src/adapters/visionAutoUiAdapter.test.js` adds three adaptation tests covering `provider_unavailable`, review-required evidence, and safe `not_found`.

## Production defects fixed because tests exposed real lifecycle risk

1. Run-local job IDs now prevent a stale late create response from contaminating the active newer run.
2. The polling delay is now abort-aware and is cleared immediately during cancel/unmount.

No backend, AI, OCR, ASR, provider, or Leaflet behavior was changed.

## Exact commands and results

| Command | Result |
|---|---|
| `cd frontend; npm.cmd test -- --run src/composables/useVisionAuto.test.js src/adapters/visionAutoUiAdapter.test.js` | PASS: 2 files, 10 tests, 0 failed; duration 4.24 s. |
| `cd frontend; npm.cmd test` | PASS: 9 files, 29 tests, 0 failed; duration 5.68 s. |
| `cd frontend; npm.cmd run build` | PASS: Vite 8.1.4, 159 modules transformed, built in 4.46 s. |
| `cd backend; npm.cmd run verify:vision-auto:production` | PASS: reliability 31/31; adapter boundary 25/25; safe-contract script passed. |
| `cd backend; npm.cmd run test:shorts:track2-v3-complete` | PASS: 12 suites, 75 tests, 0 failed; duration 2702.8211 ms. |
| `cd backend; node --check server.js` | PASS: syntax check exited 0. |
| `git diff --check` | PASS: no whitespace errors. |

The focused suite initially failed two cleanup assertions because one polling timeout remained scheduled after cancel/unmount. That failure is retained here as diagnostic evidence; the abort-aware delay fix made the rerun pass 10/10.

## Concern matrix

| Lifecycle concern | Test suite/test | Result | Evidence type |
|---|---|---|---|
| Invalid URL handling | `useVisionAuto.test.js` invalid URL | PASS | Direct composable unit test |
| Submit state transitions | `useVisionAuto.test.js` polling stages | PASS | Direct composable unit test |
| Polling until terminal | Same test, queued -> fast -> deep -> completed | PASS | Fake-timer deterministic lifecycle |
| Cancellation during polling | cancellation test | PASS | AbortSignal + timer assertion |
| Backend cancel request | cancellation/unmount tests | PASS | Injected API spy |
| Stale older run | stale late job test | PASS | Deferred-promise race test |
| Retry identity | retry/reset test | PASS | Distinct AbortSignal assertion |
| Reset clearing state | retry/reset test | PASS | Public ref assertions |
| Component unmount disposal | unmount test | PASS | Vue lifecycle mount/unmount |
| Elapsed/poll timer cleanup | terminal, cancel, and unmount tests | PASS | Fake-timer count |
| Provider unavailable | adapter test | PASS | Deterministic adapter unit test |
| Review required | adapter test + backend boundary suite | PASS | Frontend and backend contract tests |
| Safe not-found | adapter and polling tests | PASS | Deterministic terminal adaptation |
| Dish candidates | composable dish-first test | PASS | Injected endpoint response |
| Backend queue/cancel/deadline | `visionAutoJobService.test.js` | PASS within 31-test reliability suite | Backend unit/integration boundary |
| Track 2 V3 closure | complete Track 2 V3 suite | PASS 75/75 | Deterministic fixture/service tests |

## Interpretation limits

These pass counts demonstrate implementation behavior and non-regression. They are not model accuracy, place accuracy, dish accuracy, or full-pipeline success rates. Mocked/fixed responses test orchestration and adaptation, not live provider quality.
