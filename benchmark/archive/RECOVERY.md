# Recovered benchmark archive — run of 2026-07-18

## Status: RECOVERED HISTORICAL DATA — NOT a round-2 measurement

Everything under `comparative-benchmark-20260718/` is the **original benchmark run
of 2026-07-18**, recovered verbatim from the Git object database. It is archived
here for provenance and reproducibility only.

**These numbers must never be presented as round-2 (2026-07-30) measurements.**
Round-2 measurements live in `benchmark/out/` and were produced by the harness in
`benchmark/harness/`.

## How it was lost, and how it was recovered

The 2026-07-18 harness was **never committed**. It lived in a working directory
alongside seven detached worktrees under `C:\COS30043\foodstory-benchmark-worktrees\`.
Those directories were later deleted from disk. Because nothing referenced the
content, its Git objects became *dangling* — still present in `.git/objects`, but
reachable from no branch, tag, or reflog entry, and therefore eligible for deletion
by the next `git gc` / `git prune`.

Verification that the harness was never committed:

```
git log --all --oneline -- 'benchmark/*' 'benchmark'   # empty
```

Recovery source — a single dangling tree object found via `git fsck --dangling`:

```
tree b1aba45883744223de7abdd7763966c41cf77269
```

Extracted with `git archive` (which reads the tree directly and does not touch the
index or working tree):

```
git archive --format=tar b1aba45883744223de7abdd7763966c41cf77269 comparative-benchmark \
  | tar -x -C benchmark/archive/
```

## Integrity

| Check | Result |
|---|---|
| Blobs referenced by the tree | 274 |
| Blobs missing from object DB | 0 |
| Files extracted to disk | 274 |
| Files whose `git hash-object` matches the tree blob SHA | **274 / 274** |
| Mismatches | **0** |

Recovery is byte-exact. No file was reconstructed, patched, or inferred.

A second, smaller dangling tree (`aeb53a1223bc9bf24b848123dd3cfa55f39c9538`) holds an
earlier partial snapshot of the same harness — build-benchmark scripts and an earlier
6,566-byte `BENCHMARK_EXECUTION_LOG.md`. It is a strict subset in scope and was not
extracted, since the larger tree supersedes it. It remains retrievable by SHA if the
earlier execution log is ever needed.

## Recorded environment of the 2026-07-18 run

From `comparative-benchmark-20260718/environment.json`:

- Recorded at `2026-07-18T22:35:09+07:00`
- Final commit under test: `c1007231c2bf1dc77091bb381df5462de3dd6b6f`
- Windows 11 Home Single Language, build 26200
- Intel Core i7-14700HX — 20 physical cores / 28 logical processors
- RAM 16,868,368,384 bytes (15.71 GiB)
- Node v24.11.0, npm 11.6.1, Python 3.13.0, Chrome 150.0.7871.127, MySQL 8.0.19
- Paid/cloud providers (Google Vision, Gemini, Groq, Places) disabled in controlled runs

Self-declared limitations of that run, quoted from its own `control_notes`:

- Power plan and background OS activity were not programmatically pinned.
- Filesystem cache was not flushed between warm production builds.
- Historical snapshots use their committed lockfiles while sharing the same Node/npm.

## Version selection used by the 2026-07-18 run

From `VERSION_SELECTION.md` and `version_manifest.csv`:

| Family | ID | Commit | Date |
|---|---|---|---|
| frontend | `frontend_stage1` | `6df998aa33f1f28a958610dce97a0b1bc83e0556` | 2026-05-31 |
| frontend | `frontend_stage2` | `35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5` | 2026-06-06 |
| frontend / vision / realtime / foodmap | `final` | `c1007231c2bf1dc77091bb381df5462de3dd6b6f` | 2026-07-17 |
| vision | `vision_early` | `5746fdf39dc38d3b50b71513a270a59a853ffed6` | 2026-06-12 |
| vision | `track2_v3` | `852d5735c5e20abf995ffa3a4e096e04add88586` | 2026-07-04 |
| realtime | `realtime_pre_ws` | `54779d5d7aa87eb65a2e6b66cc4a1b20711d8630` | 2026-06-06 |
| foodmap | `foodmap_monolith` | `770d84cacd02a76ef7e082a34175b1a7d3cb5697` | 2026-06-23 |

Note on the pre-WebSocket baseline: the 2026-07-18 run used `54779d5`. The immediate
parent of the commit that introduced the WebSocket server (`7d9c87e`) is actually
`94377cb`, which is a tighter baseline. Round 2 records `94377cb` as well.

## Why committing this costs almost no repository size

All 274 blobs were **already present** in `.git/objects` as dangling objects.
Committing them adds references, not new object storage. The working-tree checkout is
~130 MB, but the incremental packfile cost is close to zero.
