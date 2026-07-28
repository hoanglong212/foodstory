# Stage 3 dish-first Vision Auto labelled pilot

> This is a small formative pilot using a convenience sample of public food videos. It is not a representative population-level benchmark.

## Run record

- Commit: `0473287788bad6a098f1d2724ec0e3d0c81bd412`
- Branch: `codex/render-deployment`
- Started: `2026-07-28T04:23:44.222Z`
- Finished: `2026-07-28T04:25:28.274Z`
- Command: `"C:\\Program Files\\nodejs\\node.exe" "C:\\COS30043\\foodstory\\backend\\scripts\\runVisionDishPilot.js"`
- Working directory: `C:\COS30043\foodstory\backend`
- Endpoint: `http://127.0.0.1:3000/api/food-map/vision-auto-v2/dish-discovery`
- Ground truth: `docs/evidence/vision-pilot-cases.csv`
- Environment: Node v24.11.0; win32 x64; OS release 10.0.26200; timezone Asia/Saigon
- Worktree dirty at start: yes
- Execution: sequential; 3000 ms delay; 60000 ms per-case timeout

## Quota-safe retry runs

- 2026-07-28T05:08:56.211Z to 2026-07-28T05:14:06.919Z (stopped_provider_quota): 8 technical-failure cases; 70000 ms backoff; 1 maximum attempt(s) per case; command `"C:\\Program Files\\nodejs\\node.exe" "C:\\COS30043\\foodstory\\backend\\scripts\\runVisionDishPilot.js" "--retry-technical-failures" "--quota-backoff-ms" "70000" "--max-attempts" "1"`.
- 2026-07-28T05:25:25.878Z to 2026-07-28T05:25:31.468Z (completed): 1 technical-failure cases; 70000 ms backoff; 1 maximum attempt(s) per case; command `"C:\\Program Files\\nodejs\\node.exe" "C:\\COS30043\\foodstory\\backend\\scripts\\runVisionDishPilot.js" "--retry-technical-failures" "--retry-case-id" "V03" "--max-attempts" "1" "--quota-backoff-ms" "70000"`.

The harness called only the dish-identification endpoint. It did not call nearby-place search and does not treat restaurant suggestions as the original filming location.

Ground-truth strings were read unchanged from the designated CSV. Accuracy matching uses accent/case/punctuation normalization, then requires either exact equality or the complete ground-truth token phrase in the returned dish name or aliases.

## Observed metrics

| Metric | Observed result |
|---|---:|
| Labelled cases | 13 |
| Top-1 dish accuracy | 5/13 (38.46%) |
| Top-3 dish accuracy | 5/13 (38.46%) |
| No-result rate | 0/13 (0.00%) |
| Review-required rate | 5/13 (38.46%) |
| Technical-failure rate | 8/13 (61.54%) |
| Median end-to-end latency | 4082 ms |
| Maximum end-to-end latency | 18546 ms |

The primary accuracy denominator is all labelled cases. Technical failures are therefore counted as not correct rather than removed from the denominator.

## Case results

| Case | Expected dish | Top 1 | Top 3 | Top-1 correct | Top-3 correct | Terminal state | Result status | Latency (ms) |
|---|---|---|---|---:|---:|---|---|---:|
| V01 | phở | Pho | Pho | yes | yes | dish_candidates | review_required | 10769 |
| V02 | phở bò | Pho | Pho | yes | yes | dish_candidates | review_required | 9865 |
| V03 | phở gà | — | — | no | no | http_429 | technical_failure | 5495 |
| V04 | bún bò Huế | — | — | no | no | http_429 | technical_failure | 3164 |
| V05 | gỏi cuốn | Vietnamese Fresh Spring Roll (GOI CUON) | Vietnamese Fresh Spring Roll (GOI CUON) | yes | yes | dish_candidates | review_required | 3779 |
| V06 | bánh mì | — | — | no | no | http_504 | technical_failure | 18546 |
| V07 | bún chả | — | — | no | no | http_429 | technical_failure | 3686 |
| V08 | bánh bèo | — | — | no | no | http_429 | technical_failure | 4521 |
| V09 | bánh bột lọc | — | — | no | no | http_429 | technical_failure | 5138 |
| V10 | bánh xèo | VIETNAMESE CREPE- BÁNH XÈO | VIETNAMESE CREPE- BÁNH XÈO | yes | yes | dish_candidates | review_required | 3560 |
| V11 | cơm tấm | — | — | no | no | http_429 | technical_failure | 3807 |
| V12 | bánh tráng nướng | BÁNH TRÁNG NƯỚNG tự làm | BÁNH TRÁNG NƯỚNG tự làm | yes | yes | dish_candidates | review_required | 3842 |
| V13 | mì Quảng | — | — | no | no | http_429 | technical_failure | 4082 |

## Technical failures and blocked cases

- V03: dish_provider_quota: Dish recognition provider request failed.
- V04: dish_provider_quota: Dish recognition provider request failed.
- V06: dish_provider_timeout: Dish recognition timed out.
- V07: dish_provider_quota: Dish recognition provider request failed.
- V08: dish_provider_quota: Dish recognition provider request failed.
- V09: dish_provider_quota: Dish recognition provider request failed.
- V11: dish_provider_quota: Dish recognition provider request failed.
- V13: dish_provider_quota: Dish recognition provider request failed.

## Recommended report wording

In a small formative pilot of 13 labelled public food videos, FoodStory returned the ground-truth dish at rank 1 in 5/13 cases (38.46%) and within the top 3 in 5/13 cases (38.46%). The observed no-result rate was 0.00%, the review-required rate was 38.46%, and the technical-failure rate was 61.54%. Technical failures are included in the full-sample accuracy denominator. These results are formative and describe only this small convenience sample; they are not a representative population-level benchmark.
