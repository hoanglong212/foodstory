# FoodStory Controlled Comparative Benchmark Report

## Methodology

This benchmark uses feature-specific Git snapshots rather than treating one commit as the universal baseline. Detached worktrees preserve each committed source tree. Production frontend builds, local loopback Lighthouse runs, structural browser audits, sequential API calls, WebSocket delivery probes, and deterministic network-blocked Vision routing fixtures are retained as individual observations.

One warm-up precedes five measured Lighthouse/build/Vision repeats where supported. API endpoints use 30 sequential measured requests after one warm-up. Real-time delivery uses ten iterations at each of 1, 5, and 10 viewers, giving 30 iterations per event type across load levels. Failures and unavailable comparisons remain visible.

## Selected versions

See `VERSION_SELECTION.md` and `version_manifest.csv`. The principal snapshots are Stage 1 `6df998a`, Stage 2 `35c8ddb`, pre-WebSocket `54779d5`, early Vision `5746fdf`, monolithic Food Map `770d84c`, Track 2 V3 `852d573`, and final `c100723`.

## Controlled variables

- Same Windows 11 machine, CPU, RAM, Node/npm/Python executables, MySQL 8.0.19 instance, and loopback network.
- Production Vite builds, fixed desktop/mobile viewports, and retained raw reports.
- External AI/place/OCR/news providers excluded from controlled application-only claims.
- Same existing MySQL fixture for read-only API comparisons.

## Uncontrolled variables

- OS scheduling, power-plan changes, antivirus activity, and filesystem cache state.
- Historical dependency versions differ because each committed lockfile is respected.
- Live map tiles and external media/provider latency are not controlled.

## Results

### Frontend builds and public-page Lighthouse

| Measure | Stage 1 | Final | Change |
|---|---:|---:|---:|
| Warm build wall-clock mean | 1241.704 ms | 4187.078 ms | 237.2% |
| Generated JavaScript | 124997 bytes | 830251 bytes | - |
| Desktop Home LCP mean | 165.340 ms | 147.739 ms | -10.6% |
| Desktop Home accessibility | 95.000% | 96.000% | - |

Transferred-byte measurements are warm-cache Lighthouse observations because storage reset is disabled after the warm-up. They must not be presented as cold first-visit payloads.

### API latency

| Endpoint | Pre-WebSocket p50 | Final p50 | Pre-WebSocket p95 | Final p95 |
|---|---:|---:|---:|---:|
| authentication_login | 87.628 ms | 88.861 ms | 103.015 ms | 107.911 ms |
| recipe_list | 27.166 ms | 27.513 ms | 34.039 ms | 31.276 ms |
| recipe_detail | 51.056 ms | 44.256 ms | 144.068 ms | 217.633 ms |
| checklist_retrieval | 1.568 ms | 1.536 ms | 2.019 ms | 2.736 ms |

Only read-only/login endpoints were executed against the existing database. Comment, rating, and favourite mutation latency is unavailable because no transactionally isolated API fixture existed.

### Real-time delivery

The pre-WebSocket snapshot has no broadcast mechanism, so its event latency is unavailable rather than zero. The final snapshot retained 640 per-viewer delivery observations. Server broadcast timestamps and browser store/render timestamps were not instrumented; the valid metric is request-sent to WebSocket-receive latency.

- 1 viewer(s), comment_create: p50 10.725 ms, p95 13.060 ms, lost 0, duplicates 0.
- 1 viewer(s), comment_edit: p50 11.223 ms, p95 38.124 ms, lost 0, duplicates 0.
- 1 viewer(s), rating_update: p50 12.226 ms, p95 18.316 ms, lost 0, duplicates 0.
- 1 viewer(s), comment_delete: p50 10.136 ms, p95 36.299 ms, lost 0, duplicates 0.
- 5 viewer(s), comment_create: p50 9.702 ms, p95 45.760 ms, lost 0, duplicates 0.
- 5 viewer(s), comment_edit: p50 10.313 ms, p95 13.996 ms, lost 0, duplicates 0.
- 5 viewer(s), rating_update: p50 10.869 ms, p95 45.064 ms, lost 0, duplicates 0.
- 5 viewer(s), comment_delete: p50 9.083 ms, p95 29.360 ms, lost 0, duplicates 0.
- 10 viewer(s), comment_create: p50 10.652 ms, p95 17.068 ms, lost 0, duplicates 0.
- 10 viewer(s), comment_edit: p50 9.749 ms, p95 38.948 ms, lost 0, duplicates 0.
- 10 viewer(s), rating_update: p50 11.457 ms, p95 24.935 ms, lost 0, duplicates 0.
- 10 viewer(s), comment_delete: p50 9.136 ms, p95 10.748 ms, lost 0, duplicates 0.

### Vision routing safety

- track2_v3: safe-routing accuracy 96.67%, false-promotion rate 0.00%, router p50 0.045200 ms (150 measured case-runs).
- final: safe-routing accuracy 96.67%, false-promotion rate 0.00%, router p50 0.048400 ms (150 measured case-runs).

These are synchronous router results, not full Vision Auto media/OCR/place/dish results. Exact-place and dish metrics are blank because the recovered corpus does not label them.

### Food Map architecture

The main `FoodMapView.vue` changed from 8,481 lines to 3,124 lines (-63.2%). When extracted CSS and five production Vue components are counted, the distributed feature total is 9,091 lines (7.2% versus the monolith). This supports a modularity claim, not a runtime-speed claim. Marker/FPS results remain unavailable because the two production snapshots lack a shared deterministic injection seam.

## Statistical coverage

Retained raw observations: 1670 (build 24, lighthouse 96, navigation 192, responsive 48, api 310, realtime 640, vision 360). Summary tables report mean, median, minimum, maximum, p50, and p95 wherever repeated numeric observations exist.

## Major measured improvements

- Final desktop Home LCP mean was 147.739 ms versus 165.340 ms for Stage 1 (10.6% lower) under the warm-cache local Lighthouse method.
- Safe routing and false-promotion behavior are directly comparable between Track 2 V3 and final on the recovered 30-case deterministic corpus.
- Final WebSocket delivery is measurable at 1, 5, and 10 viewers; the earlier snapshot has no equivalent capability.
- The Food Map entry view is substantially smaller, with functionality distributed into explicit components and CSS.

## Major measured regressions

- Final warm build wall-clock mean was 4187.078 ms versus 1241.704 ms for Stage 1; generated total output grew from 170319 to 516439802 bytes.
- Recipe-detail API p95 was 217.633 ms in final versus 144.068 ms in the pre-WebSocket snapshot during this run; this tail result should be repeated before treating it as stable.
- Any page-level Lighthouse regression shown in `frontend_summary.csv` should be reported per route and viewport, not generalized to the entire application.

## Bottlenecks

- Final build output includes a very large static-asset set, which dominates generated-total bytes.
- Full Vision latency is dominated by stages absent from the deterministic router corpus and therefore remains unmeasured here.
- Authenticated UI and mutable API workflows require disposable database fixtures for credible repeated benchmarks.

## Valid comparisons

- Production build time and emitted sizes for the four successfully built frontend snapshots.
- Public equivalent routes that exist in both compared frontend versions.
- Shared read-only/login API endpoints against the same MySQL fixture.
- Track 2 V3 versus final safe routing on the identical recovered 30-case corpus.
- Final request-to-WebSocket-receive distributions across controlled viewer counts.
- Static source complexity measured from immutable Git blobs.

## Invalid or impossible comparisons

- Pages absent from earlier versions, authenticated Admin pages without a controlled auth profile, and the historical protected Food Map versus final guest preview.
- Full Vision exact-place, address precision/recall, dish accuracy, OCR/frame correlations, or stage timing without common labelled media.
- External provider latency as application latency.
- Pre-WebSocket event latency represented as zero.
- Food Map line-count reduction represented as proof of FPS/render improvement.

## Recommended charts and exact captions

1. **Production build cost by FoodStory version.** "Five warm production builds per version on the same Windows machine; bars show p50 and p95 wall-clock time."
2. **Public-page Lighthouse LCP by version and viewport.** "Five warm-cache Lighthouse runs per supported public route; unavailable pages are not imputed."
3. **Safe Shorts routing across compatible Vision versions.** "The same 30 labelled metadata/OCR routing cases were replayed with network access blocked; this is not full Vision Auto accuracy."
4. **API latency for shared endpoints.** "Thirty sequential loopback requests per endpoint and version against the same existing MySQL fixture; external providers excluded."
5. **Final WebSocket request-to-receive latency.** "Ten iterations per event type at 1, 5, and 10 viewers; server broadcast and browser render stages were not instrumented."
6. **Food Map source decomposition.** "Main-view lines decreased after extraction, while total distributed feature lines increased; line counts do not establish runtime speed."

## Statements that must not be made

- "The final application is universally faster than Stage 1/Stage 2."
- "Food Map refactoring improved FPS" or "line reduction caused runtime improvement."
- "Vision Auto achieved exact-place or dish accuracy" from this router-only corpus.
- "External news/AI/provider latency is backend processing time."
- "Pre-WebSocket latency was zero."
- "Blank or unavailable values are failures" or "unavailable values are zero."

## Limitations

This is a credible bounded benchmark, not a complete laboratory evaluation. Authenticated browser profiles, disposable database snapshots, identical downloadable media, provider quota, and internal server/browser instrumentation were not available. Those comparisons remain explicitly unavailable.
