# FoodStory Comparative Benchmark Version Selection

## Selection method

Snapshots were chosen separately by feature family from Git path history. No single commit is treated as the universal “before” state. Every snapshot is checked out as a detached Git worktree under `C:\COS30043\foodstory-benchmark-worktrees`; the final working tree is not overwritten.

## Frontend evolution

- `frontend_stage1` — `6df998aa33f1f28a958610dce97a0b1bc83e0556` (2026-05-31): first committed Stage 1 responsive Vue baseline. It contains Home, About, and News-era routes only.
- `frontend_stage2` — `35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5` (2026-06-06): representative full-stack stage after the backend, authentication, recipe flows, and initial real-time CRUD were present.
- `final` — `c1007231c2bf1dc77091bb381df5462de3dd6b6f` (2026-07-17): evidence-ready final source snapshot.

## Vision Auto evolution

- `vision_early` — `5746fdf39dc38d3b50b71513a270a59a853ffed6` (2026-06-12): earliest runnable image/OCR-era implementation with a local OCR fixture.
- `track2_v3` — `852d5735c5e20abf995ffa3a4e096e04add88586` (2026-07-04): mature Track 2 V3 implementation with deterministic fixtures and safety boundaries.
- `final` — `c1007231c2bf1dc77091bb381df5462de3dd6b6f`: final dish-first orchestration.

The historical 30-URL corpus exists at the Track 2 V3 snapshot but was deliberately removed in commit `669f37528971ceb61af7f6809120eeaa7919fb3a`. Therefore, a full 30-URL accuracy comparison against final is invalid unless a compatibility adapter replays only retained, identical inputs. Live URLs are not used as a substitute for deterministic evidence.

## Real-time evolution

- `realtime_pre_ws` — `54779d5d7aa87eb65a2e6b66cc4a1b20711d8630` (2026-06-06 10:17): last backend commit before WebSocket introduction.
- `realtime_final` — `c1007231c2bf1dc77091bb381df5462de3dd6b6f`: final WebSocket implementation.

The pre-WebSocket snapshot cannot produce broadcast, receive, or render latency. Those fields must remain unavailable rather than be represented as zero.

## Food Map evolution

- `foodmap_monolith` — `770d84cacd02a76ef7e082a34175b1a7d3cb5697` (2026-06-23): representative monolithic `src/views/FoodMapView.vue` before the repository split and later component extraction.
- `foodmap_final` — `c1007231c2bf1dc77091bb381df5462de3dd6b6f`: final refactored Food Map.

Line counts and component counts are architectural evidence only. Runtime improvement is claimed only where measured under an identical deterministic marker fixture.

## Isolation and compatibility

Locked dependencies were installed independently in each worktree. Historical snapshots retain their own dependency versions. All runs use the same machine, Node runtime, local MySQL instance, and loopback network. External AI/provider calls are excluded from controlled comparisons to avoid cost and network variance.
