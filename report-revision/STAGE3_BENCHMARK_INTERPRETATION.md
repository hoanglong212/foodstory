# Stage 3 Controlled Benchmark Interpretation

## Valid measured comparison

The only valid Stage 3 Vision comparison is the deterministic router replay in `FoodStory_Comparative_Benchmark.zip`. Track 2 V3 (`852d573`) and Final (`c100723`) each replayed the same 30 labelled routing cases five measured times, producing 150 measured case-runs per version after warm-up.

| Version | n | Safe routing | False promotion | Review route | Timeout | Router p50 | Router p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Track 2 V3 | 150 | 96.67% | 0.00% | 70.00% | 0.00% | 0.045200 ms | 0.190700 ms |
| Final | 150 | 96.67% | 0.00% | 70.00% | 0.00% | 0.048400 ms | 0.194600 ms |

The result supports a narrow non-regression claim: Final retained the same safe-routing and false-promotion rates as the compatible Track 2 V3 snapshot on this fixture. Final router latency was slightly higher in this run (p50 +0.0032 ms; p95 +0.0039 ms), but both values measure only synchronous route selection and are far below unmeasured media/provider stages.

## Measurement classification

| Evidence category | Present? | What it supports |
|---|---|---|
| Router-only logic | Yes | Safe Track 1/Track 2 selection, false promotion, route/review proportion, router latency. |
| Adapter logic | Tested, not benchmarked | Deterministic correctness tests; no performance/accuracy benchmark. |
| Deterministic fixture behaviour | Yes | Repeatable 30-case network-blocked replay. |
| Full video pipeline | No | No common labelled media acquisition, frame, OCR, ASR, resolver, and UI timing. |
| Live provider behaviour | No | Providers were excluded to avoid quota/network variability. |

## Values intentionally not reported

- Exact-place accuracy: unavailable because the compatible corpus does not label resolved place identity.
- Address precision/recall: unavailable under the retained common ground truth.
- Dish top-1/top-3 accuracy: unavailable because dish labels are absent.
- Full Vision Auto latency: unavailable because router timing excludes media, OCR/ASR, model, place provider, queue, network, adapter, and render time.
- `not_found` rate: the benchmark records router tracks rather than public full-pipeline terminal statuses, so a full-pipeline not-found percentage would be misleading.

## Review-rate wording

The 70.00% value is the proportion routed to Track 2/review processing in the representative deterministic repeat. It must not be described as 70% of live videos requiring review, nor as a full-pipeline `review_required` outcome rate.

## Broader comparative evidence for Integrated Testing and Evaluation

The controlled package also supports these general report claims outside the Stage 3 Vue-focused section:

- Desktop Home LCP mean: Stage 1 165.340 ms; Stage 2 262.979 ms; Final 147.739 ms. Five warm-cache local Lighthouse runs per version.
- Production build wall-clock mean: Stage 1 1241.704 ms; Stage 2 1446.277 ms; Final 4187.078 ms. Five warm builds per version.
- Final generated output: 830,251 JavaScript bytes, 408,739 CSS bytes, and 516,439,802 total bytes. The total is dominated by static assets and must not be presented as transferred page weight.
- API loopback p50/p95 is available for four shared read-only/login endpoints; provider latency is excluded.
- Final request-to-WebSocket-receive distributions contain 640 per-viewer observations; pre-WebSocket latency is unavailable, not zero.
- Food Map main-view lines fell from 8,481 to 3,124, while distributed feature lines reached 9,091. This is architecture evidence, not FPS evidence.
- Responsive structural audit values are per route and viewport; they should be reported as issue deltas, not universal responsiveness scores.

## Source files used

- `comparative-benchmark/vision/vision_summary.csv`
- `comparative-benchmark/vision/vision_runs.csv`
- `comparative-benchmark/chart_data/01_vision_latency_p50_p95.csv`
- `comparative-benchmark/chart_data/02_vision_outcome_rates.csv`
- `comparative-benchmark/COMPARATIVE_BENCHMARK_REPORT.md`
- `comparative-benchmark/VERSION_SELECTION.md`

No values were estimated or reconstructed from screenshots.
