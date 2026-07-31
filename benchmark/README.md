# FoodStory benchmark — round 2

Measurement harness and raw results for the 2026-07-30/31 benchmark round.
Committed so that, unlike the 2026-07-18 run, it cannot be lost again.

## Ground rules this harness follows

- No value is generated, simulated, or interpolated. Anything that could not be
  measured is written as `"status": "unavailable"` with a reason.
- No number from the previous report is ever reused as a measured value.
- Every individual observation is kept, not just the summary — that is precisely
  what was lost last time.
- Bad results stay in. Several findings here contradict the report.
- Runtime source under `frontend/`, `backend/`, and `ai-service/` is never modified.
- Every output embeds run metadata: commit, ISO timestamp, Node, npm, Chrome, OS,
  CPU, RAM, and a CPU-load sample.

## Layout

```
benchmark/
  lib/                 shared helpers (env/metadata, static server, db)
  harness/             one script per measurement, plus diagnostics
  out/                 latest results (stable filenames)
  runs/round2-<ISO>/   timestamped snapshot, Vision-pilot naming convention
  archive/             recovered 2026-07-18 run — historical, NOT round 2
  summarise.mjs        builds out/summary.json, out/summary.md, out/CHECKSUMS.txt
```

## Prerequisites

1. MySQL running with the `foodstory` schema and `backend/.env` present.
2. Built dists for the two compared commits, in detached worktrees:
   - `522c5f2` (Final) — `<wt>/final/frontend/dist`
   - `b996954` (pre-Bootstrap-migration) — `<wt>/preboot/frontend/dist`
   Paths are constants at the top of the scripts that need them.
3. `npm install` inside `benchmark/`.

## Running

```bash
node harness/start-backend.mjs &      # must be running for most measurements
node harness/route-budget.mjs         # Tier 1A
node harness/cls.mjs                  # Tier 1B  (~40 min)
node harness/darkmode-coverage.mjs    # Tier 1C1
node harness/contrast.mjs             # Tier 1C2
npx vitest run --config ./vitest.vision.config.js   # Tier 1D (NODE_OPTIONS=--expose-gc)
node harness/tier2-map-scale.mjs      # Tier 2E
node harness/tier2-api-fanout.mjs     # Tier 2F
node harness/tier2-asset-payload.mjs  # Tier 2G
node harness/tier2-css-coverage.mjs   # Tier 2H
node harness/tier3-build.mjs          # Tier 3
node harness/tier3-api.mjs
node harness/tier3-realtime.mjs
node harness/tier3-responsive.mjs
node summarise.mjs
```

## Deliberate deviations from a stock environment

These change the system under test and are therefore recorded in the affected
output files as well as here.

- **Rate limits raised.** `start-backend.mjs` sets `API_RATE_LIMIT_MAX` and
  `AUTH_RATE_LIMIT_MAX` high. The shipped default is 500 requests / 15 min per IP
  globally. At that default a benchmark run exhausts the quota mid-sweep: the first
  API pass returned HTTP 200 five times then HTTP 429 twenty-five times. Raised via
  the documented env vars, not by editing `server.js`.
- **Dist served on port 5173.** The built bundle falls back to a hardcoded
  `http://localhost:3000/api` because `VITE_API_BASE_URL` was unset at build time,
  and the backend's non-production CORS allowlist only accepts the 5173/5174 dev
  origins. Serving anywhere else makes every authenticated XHR fail CORS, which
  clears the token and silently redirects `/profile` and `/admin` to `/login`.
- **CLS throttling.** Lighthouse desktop profile (10 Mbps / 40 ms) plus 4x CPU
  slowdown. A 1.6 Mbps mobile profile was tried first and abandoned: routes that pull
  remote Unsplash images stalled on third-party CDN transfer until the navigation
  timeout, which measured Unsplash rather than FoodStory.
- **jsdom shims for Tier 1D.** `matchMedia`, `ResizeObserver`, `IntersectionObserver`,
  `scrollTo`, `scrollIntoView`, and a null-returning canvas `getContext` are stubbed
  in the harness so `FoodMapView` can mount. Inert stubs only; they cannot manufacture
  behaviour the app does not have.

## Known measurement limits

- **CSS rule-count coverage is not reported.** CDP returns entries only for rules it
  observed as used, so used/total is always a constant 100% artifact. Byte coverage
  against full stylesheet text is the valid figure.
- **Contrast "indeterminate" ≠ pass.** Text over an image or gradient backdrop —
  including one painted by a `::before`/`::after` pseudo-element — has no backdrop
  colour resolvable from computed style, so no ratio is claimed. Those nodes still
  need manual review. An earlier revision checked only element backgrounds and
  wrongly reported the home hero as near-white-on-near-white; a screenshot showed
  white text on a dark Unsplash photo painted by `section.hero-section::before`.
- **Responsive violation counts are capped** at 120 entries per rule per combination,
  so a capped rule is a lower bound. `/food-map` hits the cap at every viewport.
- **Leaflet scale is a standalone harness page**, not the assembled `FoodMapView`.
  The component exposes no marker-injection seam, and adding one would mean editing
  runtime source. Library builds and clusterer options are identical to the app.
- **Tier 1D uses injected fake network functions.** No provider is contacted. Cancel
  latency is sub-millisecond by construction because `cancel()` is synchronous; the
  meaningful result is whether each effect happened at all, recorded per iteration.
- **Heap slope**: read `heapSlopeSecondHalfBytesPerCycle`, not the full-range slope,
  which is inflated by allocator and JIT warm-up.

## Data hygiene

The WebSocket measurement creates real comments through the real API. They are tagged
with a per-run marker, deleted afterwards, and the comment count is asserted back to
its baseline (`meta.cleanupVerified`). Nothing under `docs/evidence/` is read, written,
or deleted by any script here.
