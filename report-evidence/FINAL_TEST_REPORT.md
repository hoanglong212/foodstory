# FoodStory Final Test Report

Execution date: 2026-07-17 (Asia/Saigon)  
Runtime: Node.js 24.11.0, npm 11.6.1, Python 3.13.0, MySQL 8.0.19  
Branch: `report-finalization`

Counts below belong only to the named invocation. Counts from separate invocations are not combined.

| Area | Working directory | Exact command | Start/time evidence | Result | Passed / failed / skipped | Credentials | Duration |
|---|---|---|---|---|---|---|---|
| Frontend lock validation (first run) | `frontend` | `npm.cmd ci --dry-run` | 2026-07-17 09:46 ICT | Failed: lock missing `@emnapi/core` and `@emnapi/runtime` | n/a | No | 6.8 s shell |
| Frontend lock repair | `frontend` | `npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund` | Immediately after failed validation | Passed | n/a | Registry access | 1 s |
| Frontend lock validation (rerun) | `frontend` | `npm.cmd ci --dry-run --ignore-scripts --no-audit --no-fund` | 2026-07-17 session | Passed | n/a | Registry metadata | 2 s |
| Frontend unit/component | `frontend` | `npm.cmd test` | Runner emitted 09:46:20 | Passed | 19 / 0 / 0 across 7 files | No | 12.72 s |
| Frontend production build | `frontend` | `npm.cmd run build` | 2026-07-17 session | Passed; 159 modules transformed | n/a | No | 7.73 s |
| Frontend dependency audit | `frontend` | `npm.cmd audit --omit=dev --audit-level=high` | 2026-07-17 session | Passed: 0 vulnerabilities | n/a | npm advisory service | 2.4 s |
| Backend lock validation | `backend` | `npm.cmd ci --dry-run --ignore-scripts --no-audit --no-fund` | 2026-07-17 session | Passed | n/a | Registry metadata | 4 s |
| Backend top-level Node tests | `backend` | `npm.cmd test` | approximately 09:47 ICT; Node runner did not emit wall-clock start | Passed | 360 / 0 / 0; 33 suites | No live provider credentials required | 3.987 s runner |
| Shorts chained package gate | `backend` | `npm.cmd run test:shorts` | 2026-07-17 session | Passed; every chained subcommand exited 0 | Not aggregated because each subcommand is a separate run | Deterministic/injected providers | Included in 50.9 s three-command shell |
| Track 2 V3 complete | `backend` | `npm.cmd run test:shorts:track2-v3-complete` | 2026-07-17 session | Passed | 75 / 0 / 0; 12 suites | No live provider credentials required | 0.980 s runner |
| Vision Auto reliability | `backend` | package subcommand `test:vision-auto:reliability` within `verify:vision-auto:production` | 2026-07-17 session | Passed | 31 / 0 / 0; 5 suites | No live provider credentials required | 1.746 s runner |
| Vision Auto Track 2 adapter | `backend` | package subcommand `test:vision-auto:track2-v3-adapter` | 2026-07-17 session | Passed | 25 / 0 / 0; 3 suites | No | 0.735 s runner |
| Vision Auto safe-contract script | `backend` | package subcommand `test:vision-auto` | 2026-07-17 session | Passed (`Vision Auto safe-contract tests passed`) | Script emits no numeric count | No paid provider required | Included in production gate |
| API/database smoke | `backend` | `npm.cmd run test:api` | 2026-07-17 session | Passed with temporary data cleaned | 87 / 0 / 0 | Seeded local test accounts | 4.4 s shell |
| Two-client WebSocket acceptance (first fixture run) | `backend` | `npm.cmd run test:realtime` | 2026-07-17 session | Failed before socket checks because fixture omitted required `image_url` | 0 acceptance checks executed | Seeded local test accounts | 4.9 s shell |
| Two-client WebSocket acceptance (corrected) | `backend` | `npm.cmd run test:realtime` | 2026-07-17 session | Passed; temporary recipe cleaned | 4 / 0 / 0 | Seeded local test accounts | 3.4 s shell |
| Guardian focused tests | `backend` | `node --test tests/guardianNewsService.test.js` | 2026-07-17 session | Passed, including cache and timeout | 7 / 0 / 0; 1 suite | No real key; injected provider | 1.081 s runner |
| Guardian live proxy status | `backend` | `curl.exe ... http://localhost:3000/api/news/external?page=1&pageSize=2` | 2026-07-17 session | HTTP 200 through backend proxy | HTTP check only | Server-side Guardian configuration | 5.1 s combined shell |
| Backend dependency audit | `backend` | `npm.cmd audit --omit=dev --audit-level=high` | 2026-07-17 session | Passed: 0 vulnerabilities | n/a | npm advisory service | 2.5 s |
| Database schema audit (first run) | `backend` | `npm.cmd run audit:database` | 2026-07-17 session | Four checks passed; audit compatibility failed on old ledger without `applied_at` | Audit harness issue | Local DB credentials | 2.0 s combined shell |
| Database schema audit (corrected) | `backend` | `npm.cmd run audit:database` | 2026-07-17 session | Passed | 5 / 0 / 0 | Local DB credentials | 1.3 s |
| Seed/migration syntax | `backend` | `node --check database/migrate.js` and three named seed scripts | 2026-07-17 session | Passed; no syntax output | 4 files / 0 failures | No | under 2 s combined |
| Python syntax | `ai-service` | `.venv\\Scripts\\python.exe -m py_compile main.py` | 2026-07-17 session | Passed | 1 / 0 / 0 | No | 4.5 s combined validation shell |
| Python imports | `ai-service` | `.venv\\Scripts\\python.exe -c "import ..."` (FastAPI, SentenceTransformer, OpenCLIP separately) | 2026-07-17 session | Passed | 3 import checks / 0 | Hugging Face cache used; no token | FastAPI 4.5 s combined; SentenceTransformer 25.3 s; OpenCLIP 58.6 s |
| AI deterministic smoke | `ai-service` | `.venv\\Scripts\\python.exe test_smoke.py` | 2026-07-17 session | Passed | 4 / 0 / 0 | No provider key; cached model weights | 27.2 s |
| Final frontend regression | `frontend` | `npm.cmd test` | Runner emitted 23:08:17 | Passed | 19 / 0 / 0 across 7 files | No | 4.53 s |
| Final frontend build | `frontend` | `npm.cmd run build` | Immediately after final frontend tests | Passed; 159 modules transformed | n/a | No | 1.92 s |
| Final backend regression | `backend` | `npm.cmd test` | 2026-07-17 finalization session | Passed after adding two Guardian tests | 362 / 0 / 0; 33 suites | No live provider credentials required | 2.138 s runner |
| Final real-time regression | `backend` | `npm.cmd run test:realtime` | Immediately after final backend tests | Passed; temporary data cleaned | 4 / 0 / 0 | Seeded local test accounts | within 6.4 s combined shell |
| Final database regression | `backend` | `npm.cmd run audit:database` | Immediately after final real-time test | Passed | 5 / 0 / 0 | Local DB credentials | within 6.4 s combined shell |

## Feature verification conclusions

- Public routes, responsive navigation, themes, About interaction, recipes, News filters/pagination, and backend-proxied live Guardian content were verified through source, browser capture, API response, and tests.
- Register/login/logout/session restore and route-role guards were verified through source, 87 API checks, and browser flows. Banned-login behavior exists in source, but no disposable banned fixture was created because banning the shared seeded user removes its engagement data.
- Recipe details, ingredients, instructions, nutrition, ratings, comments, favourites, checklist, profile, user submission, moderation, and admin CRUD were exercised using temporary records that were removed after capture.
- The live two-context browser sequence verified that User B received User A's comment and rating without refresh. The dedicated acceptance script also verified create/edit/delete/rating broadcasts, persistence, exact-once delivery in each client, owner-only comment mutation, and one-rating-per-user behavior.
- Food Map guest/auth routing, local data, personal spot, filters/focus/clustering source paths, and external-candidate safety were inspected. A temporary personal spot was removed after capture.
- Vision Auto creation/polling/cancel/timeout/stale-run/unmount/unsupported/not-found/dish/search/provider-unavailable behavior is covered by deterministic suites. No screenshot is represented as proof of a paid-provider live success.

## Checks not fully run

- A destructive fresh-schema migration/seed was not run against the user's active database. Schema, live constraints, migration ledger, and script syntax were verified non-destructively.
- Full CLIP startup/model inference was not forced; OpenCLIP import passed, while the deterministic smoke loaded and exercised SentenceTransformer. CPU/GPU model startup remains environment-dependent.
- Banned-account login was source-verified but not mutated on the shared seeded account.
- Terminal screenshots 32–34 could not be captured because this environment exposes browser screenshots but not desktop terminal pixels. No fake terminal images were created.
- Paid/quota-bearing Google Places, Gemini, Google Vision, or external ASR success was not forced. Failure/configuration and injected-provider paths passed.
