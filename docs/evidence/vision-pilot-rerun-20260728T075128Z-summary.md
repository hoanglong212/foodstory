# Stage 3 dish-first Vision Auto controlled 429 follow-up

> This is a controlled follow-up of eight cases from a small formative pilot. It is not a representative population-level benchmark.

## Combination protocol

The first-run and rerun observations are retained independently and displayed side by side. The rerun does not silently select the better observation. Rerun accuracy uses all eight requested cases as the denominator; technical failures and unattempted cases count as not correct. For a retried case, the last rerun attempt is the terminal rerun observation. Rerun per-case latency includes provider request time and any exponential-backoff waits for that case.

## Run record

- Status: `completed`
- Commit: `0473287788bad6a098f1d2724ec0e3d0c81bd412`
- Started: `2026-07-28T07:51:28.890Z`
- Finished: `2026-07-28T08:06:37.815Z`
- Command: `"C:\\Program Files\\nodejs\\node.exe" "C:\\COS30043\\foodstory\\backend\\scripts\\runVisionDishPilotFollowup.js" "--between-case-delay-ms" "90000" "--initial-backoff-ms" "75000" "--max-attempts" "3" "--stop-after-quota-failures" "3"`
- Endpoint: `http://127.0.0.1:3000/api/food-map/vision-auto-v2/dish-discovery`
- Cases: V03, V04, V06, V07, V08, V09, V11, V13
- Between-case delay: 90000 ms
- Exponential backoff: 75000 ms, doubling per retry
- Maximum attempts per case: 3
- Stop threshold: 3 consecutive HTTP 429 attempts
- Stop reason: none
- Resume runs: 1
  - 2026-07-28T08:05:13.522Z to 2026-07-28T08:06:37.815Z (completed); cases V13; command `"C:\\Program Files\\nodejs\\node.exe" "C:\\COS30043\\foodstory\\backend\\scripts\\runVisionDishPilotFollowup.js" "--resume-run-id" "20260728T075128Z" "--initial-backoff-ms" "75000" "--max-attempts" "3" "--stop-after-quota-failures" "3"`.

Original evidence was read-only. Its pre-run and post-run checksums are recorded in the rerun raw JSON.

## Rerun metrics

| Metric | Rerun observation |
|---|---:|
| Requested cases | 8 |
| Attempted cases | 8 |
| Completed provider responses | 8 |
| Top-1 accuracy | 8/8 (100.00%) |
| Top-3 accuracy | 8/8 (100.00%) |
| Remaining HTTP 429 | 0/8 (0.00%) |
| No-result | 0/8 (0.00%) |
| Review-required | 8/8 (100.00%) |
| Median latency | 10667.5 ms |
| Maximum latency | 103582 ms |

## Combined per-case observations

| Case | Expected | First-run result | First top 1 | First correct | Rerun result | Rerun top 1 | Rerun correct | Attempts | Rerun latency |
|---|---|---|---|---:|---|---|---:|---:|---:|
| V03 | phở gà | technical_failure | — | no | review_required | Pho Ga | yes | 1 | 11853 |
| V04 | bún bò Huế | technical_failure | — | no | review_required | Bun Bo Hue | yes | 1 | 9907 |
| V06 | bánh mì | technical_failure | — | no | review_required | Banh Mi | yes | 1 | 13390 |
| V07 | bún chả | technical_failure | — | no | review_required | Bún chả | yes | 1 | 8141 |
| V08 | bánh bèo | technical_failure | — | no | review_required | Bánh bèo | yes | 1 | 7962 |
| V09 | bánh bột lọc | technical_failure | — | no | review_required | Bánh bột lọc | yes | 1 | 8643 |
| V11 | cơm tấm | technical_failure | — | no | review_required | Cơm Tấm Đặc Biệt | yes | 1 | 11428 |
| V13 | mì Quảng | technical_failure | — | no | review_required | Mì Quảng | yes | 2 | 103582 |

## Remaining quota failures

- None.
