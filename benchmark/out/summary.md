# FoodStory benchmark — round 2

Measured 2026-07-31T05:54:06.455Z on commit `1384d59` (codex/render-deployment).

| Environment | |
|---|---|
| Commit | `1384d59573d0927da3ea0e7828c19d692056bc41` |
| Node / npm | v24.11.0 / 11.6.1 |
| Chrome | 151.0.7922.71 |
| OS | Microsoft Windows 11 Home Single Language 10.0.26200 |
| CPU | Intel(R) Core(TM) i7-14700HX (28 logical) |
| RAM | 15.71 GB |
| Load at summary time | cpu_load_percent=12 |

This is a new measurement round. It does not reuse any value from the 2026-07-18
benchmark, which is archived verbatim at `benchmark/archive/comparative-benchmark-20260718/`.

## Tier 1A — route weight budget

| Route | Req | JS route | JS shared | CSS | Images | LCP p50 | CLS | TBT | TTI |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `/` | 23 | 3982 | 133351 | 53647 | 1001157 | 1334.958 | 0 | 0 | 1334.958 |
| `/news` | 22 | 6351 | 133351 | 54620 | 163965 | 1109.314 | 0 | 0 | 1109.314 |
| `/about` | 15 | 2232 | 133351 | 52584 | 100441 | 1087.907 | 0 | 0 | 1087.907 |
| `/recipes` | 37 | 15757 | 133351 | 54045 | 2817666 | 693.026 | 0 | 0 | 693.026 |
| `/recipes/1` | 21 | 17301 | 133351 | 54459 | 240776 | 1708.679 | 0.005 | 0 | 1708.679 |
| `/food-map` | 57 | 33907 | 133351 | 70476 | 1106340 | 2155.128 | 0 | 0 | 2155.128 |
| `/profile` | 16 | 6370 | 133351 | 51550 | 0 | 775.246 | 0 | 0 | 775.246 |
| `/admin` | 17 | 5963 | 133351 | 55300 | 0 | 776.234 | 0 | 0 | 776.234 |

Bundle vs images as an LCP predictor — Pearson r: JS **0.721**, images **-0.0484**, total transfer **-0.0549**, request count **0.6006**.

Shared vendor floor is identical on every route: **133351 bytes** transferred.

## Tier 1B — CLS across the Bootstrap grid migration

16 route x viewport combinations compared before and after. Worsened by >0.005: **0**. Improved: **0**. Unchanged: **16**.

| Route | Migrated | Viewport | CLS before | CLS after | Delta |
|---|---|---|--:|--:|--:|
| recipes | yes | 390x844 | 0 | 0 | 0 |
| recipes | yes | 768x1024 | 0 | 0 | 0 |
| recipes | yes | 1024x768 | 0.0139 | 0.0139 | 0 |
| recipes | yes | 1440x900 | 0.0185 | 0.0185 | 0 |
| news | yes | 390x844 | 0 | 0 | 0 |
| news | yes | 768x1024 | 0 | 0 | 0 |
| news | yes | 1024x768 | 0 | 0 | 0 |
| news | yes | 1440x900 | 0.0001 | 0.0001 | 0 |
| about | yes | 390x844 | 0 | 0 | 0 |
| about | yes | 768x1024 | 0 | 0 | 0 |
| about | yes | 1024x768 | 0 | 0 | 0 |
| about | yes | 1440x900 | 0.0001 | 0.0001 | 0 |
| home | control | 390x844 | 0.077 | 0.077 | 0 |
| home | control | 768x1024 | 0 | 0 | 0 |
| home | control | 1024x768 | 0 | 0 | 0 |
| home | control | 1440x900 | 0.0001 | 0.0001 | 0 |

## Tier 1C1 — dark mode coverage

| Stylesheet | Lines | Dark rules | Light rules | Colour selectors | No dark counterpart |
|---|--:|--:|--:|--:|--:|
| `components/ChatBotRedesign.css` | 597 | 0 | 0 | 57 | 57 |
| `style.css` | 10 | 0 | 0 | 0 | 0 |
| `styles/01-foundation.css` | 3210 | 0 | 11 | 291 | 291 |
| `styles/02-global-responsive.css` | 474 | 0 | 0 | 1 | 1 |
| `styles/03-recipe-detail-components.css` | 444 | 0 | 0 | 17 | 17 |
| `styles/04-recipe-blog.css` | 760 | 0 | 0 | 59 | 59 |
| `styles/05-recipe-editorial.css` | 1629 | 0 | 0 | 178 | 178 |
| `styles/06-recipe-browse.css` | 1391 | 0 | 0 | 163 | 163 |
| `styles/07-recipe-listing.css` | 1925 | 0 | 0 | 131 | 131 |
| `styles/08-recipe-detail.css` | 2000 | 58 | 0 | 108 | 0 |
| `styles/09-recipe-listing-theme-rails.css` | 532 | 67 | 0 | 1 | 0 |
| `views/FoodMapView.css` | 4278 | 0 | 0 | 428 | 428 |

## Tier 1C2 — WCAG 2.2 AA contrast

1422 text nodes checked across 16 route x theme combinations. **128 failures** (71 light, 57 dark), 287 indeterminate.

| Route | Theme | Nodes | Failures | Worst ratio |
|---|---|--:|--:|--:|
| home | light | 82 | 23 | 1.921 |
| home | dark | 82 | 14 | 2.551 |
| news | light | 76 | 13 | 1.921 |
| news | dark | 76 | 13 | 2.058 |
| about | light | 54 | 5 | 3.545 |
| about | dark | 54 | 4 | 3.96 |
| recipes | light | 169 | 10 | 2.61 |
| recipes | dark | 169 | 5 | 2.482 |
| recipe_detail | light | 145 | 9 | 2.449 |
| recipe_detail | dark | 145 | 6 | 1.496 |
| food_map | light | 46 | 0 | — |
| food_map | dark | 46 | 0 | — |
| profile | light | 48 | 7 | 3.389 |
| profile | dark | 48 | 7 | 3.128 |
| admin | light | 91 | 4 | 3.545 |
| admin | dark | 91 | 8 | 3.433 |

## Tier 1D — useVisionAuto lifecycle

**Cancel** (30 iterations): abort observed 30/30, reached idle 30/30, cancelJob called 30/30, intervals left behind 0.
**Stale-run guard**: 0/30 superseded runs overwrote state.
**Polling**: 7 polls for a 10000 ms job (configured delay 1500 ms, overshoot 559.28 ms).
**Leak** (50 mount/unmount cycles against FoodMapView, global.gc forced): listener delta **0**, live-timer delta **2**, retained DOM nodes **0**. Heap slope 101447 B/cycle over all cycles but **19553 B/cycle over the second half** — second-half slope is well below the full-range slope: growth is decelerating, consistent with allocator/JIT warm-up rather than an unbounded leak

## Tier 2E — Leaflet clustering at scale

_Scope_: standalone harness page, not the assembled FoodMapView component. FoodMapView exposes no marker-injection seam, so an in-app marker sweep is not possible without modifying runtime source, which this benchmark does not do. Library builds and clusterer options are identical to the app.

| Markers | chunked | Draw p50 ms | Pan p50 ms | Zoom p50 ms | Long tasks >50ms | Worst task ms |
|--:|---|--:|--:|--:|--:|--:|
| 50 | true | 6.9 | 276.9 | 277.8 | 0 | 0 |
| 200 | true | 8.7 | 273 | 278.3 | 0 | 0 |
| 1000 | true | 15.6 | 324.9 | 278.4 | 0 | 0 |
| 5000 | true | 44 | 273.8 | 288.7 | 0 | 0 |
| 50 | false | 6 | 275.7 | 278.8 | 0 | 0 |
| 200 | false | 8.4 | 276.9 | 278.1 | 0 | 0 |
| 1000 | false | 14.9 | 304.5 | 278.8 | 0 | 0 |
| 5000 | false | 42.9 | 296.4 | 296.5 | 0 | 0 |

## Tier 2F — API fan-out

| Route | API reqs | Unique endpoints | Max parallel | Longest chain | Last API − LCP ms |
|---|--:|--:|--:|--:|--:|
| `/` | 1 | 1 | 1 | 1 | -502.7 |
| `/about` | 0 | 0 | 0 | 0 | — |
| `/login` | 0 | 0 | 0 | 0 | — |
| `/news` | 1 | 1 | 1 | 1 | -349.7 |
| `/recipes` | 2 | 1 | 2 | 1 | 382.5 |
| `/recipes/1` | 1 | 1 | 1 | 1 | -118.3 |
| `/food-map` | 2 | 2 | 1 | 2 | -447.1 |
| `/profile` | 1 | 1 | 1 | 1 | -704.6 |
| `/admin` | 3 | 2 | 2 | 2 | -348.9 |

## Tier 2G — image payload

public/ is 49.97 MB across 325 files. 123 JPGs remain; converting them to WebP q82 would save **1.54 MB (13.3%)**.

## Tier 2H — CSS coverage

Rule-count percentages are deliberately omitted: CDP reports only rules it observed
as used, so used/total is always a constant 100% artifact. Byte coverage against the
full stylesheet text is the valid measure.

| Route | Used bytes | Stylesheet bytes | Used % of bytes | Unused bytes |
|---|--:|--:|--:|--:|
| home | 20089 | 299949 | 6.7 | 279860 |
| news | 17704 | 302036 | 5.86 | 284332 |
| about | 17714 | 296822 | 5.97 | 279108 |
| recipes | 44437 | 299949 | 14.81 | 255512 |
| recipe_detail | 60086 | 301330 | 19.94 | 241244 |
| food_map | 26975 | 400569 | 6.73 | 373594 |
| profile | 13359 | 296822 | 4.5 | 283463 |
| admin | 17679 | 314976 | 5.61 | 297297 |

## Tier 3 — build

Wall clock p50 **1322 ms** (p95 1372.4), vite-reported p50 **666 ms**. dist 51.21 MB across 358 files; JS gzip 287814 B (shared 201134, route 86680).

## Tier 3 — API latency

| Endpoint | n | p50 ms | p95 ms | min | max |
|---|--:|--:|--:|--:|--:|
| POST /auth/login | 30 | 65.104 | 124.3385 | 48.436 | 128.821 |
| GET /recipes | 30 | 37.2455 | 51.4781 | 12.478 | 91.822 |
| GET /recipes/1 | 30 | 46.5535 | 50.0624 | 38.428 | 50.247 |
| GET /checklists | 30 | 1.988 | 2.5074 | 1.447 | 3.197 |

## Tier 3 — WebSocket

640 observations (design: 4 operations x {1,5,10} viewers x 10 iterations). Loss **0**, duplication **0**, misordered sequences **0**. Latency p50 19.1675 ms, p95 34.451 ms.

## Tier 3 — responsive audit

Violations per rule, summed across all measured combinations:

- `documentHorizontalOverflow`: **3**
- `elementOverflowsViewport`: **898**
- `touchTargetTooSmall`: **849**
- `textTooSmall`: **398**
- `imageWithoutDimensions`: **374**
- `innerHorizontalScroll`: **6**

## Unavailable measurements

None — every planned measurement produced data.
