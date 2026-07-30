# Benchmark Execution Log

All timestamps are ISO 8601. Commands were run on the controlled local machine. Secrets were never printed to this log.

## Discovery and isolation

- Read `C:\Users\Admin\.codex\RTK.md` and the attached benchmark brief.
- Confirmed current commit `c1007231c2bf1dc77091bb381df5462de3dd6b6f`; current checkout had one unrelated untracked file: `report-evidence/FINAL_SNAPSHOT_METADATA.md`.
- Inspected branches, tags, Git log, feature-path histories, package manifests, routes, existing fixtures, system listeners, and installed runtimes.
- Created seven detached worktrees under `C:\COS30043\foodstory-benchmark-worktrees`; the current checkout was not overwritten.
- Installed locked frontend dependencies with `npm.cmd ci --ignore-scripts --no-audit --no-fund` in the Stage 1, Stage 2, monolithic Food Map, and final frontend worktrees.

## Discovery failures and fixes

- `rtk pwd` could not resolve PowerShell's `pwd` alias; the working directory was already supplied explicitly as `C:\COS30043\foodstory` and was verified through Git worktree output.
- Two nested PowerShell commands expanded `$` variables in the outer shell. Retried with literal paths and commands that did not require interpolated variables.
- Browser `--version` invocations attached to existing sessions instead of printing versions. File-version metadata is used in `environment.json`.
- `mysql.exe` was not on `PATH`; database version is queried through the application's installed `mysql2` driver without printing credentials.
- First build-harness launch failed before any build with Node `spawn EINVAL` when spawning `npm.cmd` directly. The harness was corrected to invoke the same command through `cmd.exe /d /s /c`.

## Production build benchmark

Started: 2026-07-18T11:13:23.856Z

- 2026-07-18T11:13:23.863Z | frontend_stage1 | warmup 0 | `npm.cmd run build`

## Production build benchmark

Started: 2026-07-18T11:13:49.591Z

- 2026-07-18T11:13:49.593Z | frontend_stage1 | warmup 0 | `npm.cmd run build`
  - exit=0; wall_clock_ms=3396.102; modules=27; stderr=none
- 2026-07-18T11:13:52.993Z | frontend_stage1 | measured_warm 1 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1392.141; modules=27; stderr=none
- 2026-07-18T11:13:54.389Z | frontend_stage1 | measured_warm 2 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1292.235; modules=27; stderr=none
- 2026-07-18T11:13:55.686Z | frontend_stage1 | measured_warm 3 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1171.683; modules=27; stderr=none
- 2026-07-18T11:13:56.861Z | frontend_stage1 | measured_warm 4 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1177.786; modules=27; stderr=none
- 2026-07-18T11:13:58.042Z | frontend_stage1 | measured_warm 5 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1174.677; modules=27; stderr=none
- 2026-07-18T11:13:59.220Z | frontend_stage2 | warmup 0 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1881.478; modules=115; stderr=none
- 2026-07-18T11:14:01.110Z | frontend_stage2 | measured_warm 1 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1562.987; modules=115; stderr=none
- 2026-07-18T11:14:02.681Z | frontend_stage2 | measured_warm 2 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1512.616; modules=115; stderr=none
- 2026-07-18T11:14:04.201Z | frontend_stage2 | measured_warm 3 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1331.525; modules=115; stderr=none
- 2026-07-18T11:14:05.551Z | frontend_stage2 | measured_warm 4 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1367.601; modules=115; stderr=none
- 2026-07-18T11:14:06.928Z | frontend_stage2 | measured_warm 5 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1456.655; modules=115; stderr=none
- 2026-07-18T11:14:08.395Z | foodmap_monolith | warmup 0 | `npm.cmd run build`
  - exit=0; wall_clock_ms=2351.521; modules=140; stderr=none
- 2026-07-18T11:14:10.776Z | foodmap_monolith | measured_warm 1 | `npm.cmd run build`
  - exit=0; wall_clock_ms=2375.181; modules=140; stderr=none
- 2026-07-18T11:14:13.212Z | foodmap_monolith | measured_warm 2 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1835.061; modules=140; stderr=none
- 2026-07-18T11:14:15.082Z | foodmap_monolith | measured_warm 3 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1813.539; modules=140; stderr=none
- 2026-07-18T11:14:16.952Z | foodmap_monolith | measured_warm 4 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1984.918; modules=140; stderr=none
- 2026-07-18T11:14:19.056Z | foodmap_monolith | measured_warm 5 | `npm.cmd run build`
  - exit=0; wall_clock_ms=1629.376; modules=140; stderr=none
- 2026-07-18T11:14:20.715Z | final | warmup 0 | `npm.cmd run build`
  - exit=0; wall_clock_ms=6912.113; modules=159; stderr=[33m[33m[PLUGIN_TIMINGS] [0mYour build spent significant time in plugins. Here is a breakdown: - vite:vue (35%) - vite:css (19%) - vite:css-post (18%) - vite:prepare-out-dir (13%) - vite:asset (9%) See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details. [39m
- 2026-07-18T11:14:27.680Z | final | measured_warm 1 | `npm.cmd run build`
  - exit=0; wall_clock_ms=3130.847; modules=159; stderr=none
- 2026-07-18T11:14:30.897Z | final | measured_warm 2 | `npm.cmd run build`
  - exit=0; wall_clock_ms=4788.218; modules=159; stderr=[33m[33m[PLUGIN_TIMINGS] [0mYour build spent significant time in plugins. Here is a breakdown: - vite:vue (35%) - vite:css-post (21%) - vite:css (21%) - vite:prepare-out-dir (10%) - vite:asset (8%) See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details. [39m
- 2026-07-18T11:14:35.766Z | final | measured_warm 3 | `npm.cmd run build`
  - exit=0; wall_clock_ms=3154.137; modules=159; stderr=none
- 2026-07-18T11:14:39.009Z | final | measured_warm 4 | `npm.cmd run build`
  - exit=0; wall_clock_ms=4218.989; modules=159; stderr=[33m[33m[PLUGIN_TIMINGS] [0mYour build spent significant time in plugins. Here is a breakdown: - vite:vue (37%) - vite:css (21%) - vite:css-post (20%) - vite:prepare-out-dir (9%) - vite:asset (8%) See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details. [39m
- 2026-07-18T11:14:43.696Z | final | measured_warm 5 | `npm.cmd run build`
  - exit=0; wall_clock_ms=5643.201; modules=159; stderr=[33m[33m[PLUGIN_TIMINGS] [0mYour build spent significant time in plugins. Here is a breakdown: - vite:css-post (31%) - vite:vue (25%) - vite:prepare-out-dir (18%) - vite:css (15%) - vite:asset (6%) See https://rolldown.rs/reference/InputOptions.checks#plugintimings for more details. [39m

CSV validation via artifact-tool: success (24 data rows).

## Resumed controlled benchmark

- Preserved the existing 24 production-build rows and seven detached worktrees.
- Installed each snapshot's locked dependencies with `npm.cmd ci --ignore-scripts --no-audit --no-fund`; installed benchmark-only Lighthouse/Playwright/axe packages under `comparative-benchmark`.
- Started four production preview servers on loopback ports 4171–4174 and the final backend on port 3000.
- Captured 16 equivalent public-route screenshots at 1440x900 and 390x844.
- Collected 48 structural responsive-audit rows across widths 320, 375, 390, 768, 1024, and 1440.
- Attempted to start pre-WebSocket commit `54779d5` on port 3101. It failed with `ERR_MODULE_NOT_FOUND` because the revision imports `backend/config/env.js` but does not contain that file.
- Added an untracked compatibility shim containing only `dotenv.config()` inside the isolated pre-WebSocket worktree. This shim is not part of the measured source snapshot and is disclosed in the version limitations.
- The first Lighthouse process reached its 30-minute command limit after 94/96 runs. All 94 rows and their JSON/HTML reports were already persisted. The harness was changed to resume by `(version, page, viewport, run_index)` and skip completed keys.
- Verification after the timeout found all 96 rows and reports had completed before process cleanup. A resume invocation skipped every completed key, then `chrome-launcher` reported `EPERM` while removing its temporary profile. No benchmark-owned Lighthouse Chrome process remained, so no measurement was rerun or discarded.
- First API summary validation found 100% errors for login and checklist because optional test-user `.env` fields were absent and the harness sent undefined credentials. Added the documented local test-user defaults used by the repository acceptance script and reran the full API dataset.
- First WebSocket summary validation found impossible negative request-to-receive latencies. The waiter was matching stale events from earlier iterations for broad event types. Scoped each wait to the event-array index captured immediately before the request and reran the temporary-fixture benchmark.


## Lighthouse production-page benchmark

Started: 2026-07-18T15:23:53.201Z

- 2026-07-18T15:23:53.729Z | frontend_stage1__home__desktop_1440x900__warmup_0 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=257.76
- 2026-07-18T15:24:10.395Z | frontend_stage1__home__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=152.747
- 2026-07-18T15:24:25.948Z | frontend_stage1__home__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=185.298
- 2026-07-18T15:24:41.492Z | frontend_stage1__home__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=160.698
- 2026-07-18T15:24:56.912Z | frontend_stage1__home__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=166.161
- 2026-07-18T15:25:12.631Z | frontend_stage1__home__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=161.794
- 2026-07-18T15:25:28.084Z | frontend_stage1__home__mobile_390x844__warmup_0 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=170.152
- 2026-07-18T15:25:43.468Z | frontend_stage1__home__mobile_390x844__measured_warm_1 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=143.025
- 2026-07-18T15:25:58.804Z | frontend_stage1__home__mobile_390x844__measured_warm_2 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=156.611
- 2026-07-18T15:26:14.674Z | frontend_stage1__home__mobile_390x844__measured_warm_3 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=135.509
- 2026-07-18T15:26:30.449Z | frontend_stage1__home__mobile_390x844__measured_warm_4 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=151.902
- 2026-07-18T15:26:48.119Z | frontend_stage1__home__mobile_390x844__measured_warm_5 | http://127.0.0.1:4171/
  - success; performance=100; lcp_ms=174.875
- 2026-07-18T15:27:04.623Z | frontend_stage2__home__desktop_1440x900__warmup_0 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=433.953
- 2026-07-18T15:27:21.987Z | frontend_stage2__home__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=341.016
- 2026-07-18T15:27:38.975Z | frontend_stage2__home__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=259.913
- 2026-07-18T15:27:55.926Z | frontend_stage2__home__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=257.799
- 2026-07-18T15:28:15.623Z | frontend_stage2__home__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=224.116
- 2026-07-18T15:28:33.530Z | frontend_stage2__home__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=232.052
- 2026-07-18T15:28:51.190Z | frontend_stage2__home__mobile_390x844__warmup_0 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=232.972
- 2026-07-18T15:29:07.929Z | frontend_stage2__home__mobile_390x844__measured_warm_1 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=235.165
- 2026-07-18T15:29:29.595Z | frontend_stage2__home__mobile_390x844__measured_warm_2 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=227.347
- 2026-07-18T15:29:49.013Z | frontend_stage2__home__mobile_390x844__measured_warm_3 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=215.353
- 2026-07-18T15:30:09.225Z | frontend_stage2__home__mobile_390x844__measured_warm_4 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=228.813
- 2026-07-18T15:30:29.610Z | frontend_stage2__home__mobile_390x844__measured_warm_5 | http://127.0.0.1:4172/
  - success; performance=100; lcp_ms=250.118
- 2026-07-18T15:30:46.250Z | frontend_stage2__recipes__desktop_1440x900__warmup_0 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=732.131
- 2026-07-18T15:31:05.867Z | frontend_stage2__recipes__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4172/recipes
  - success; performance=99; lcp_ms=938.856
- 2026-07-18T15:31:27.892Z | frontend_stage2__recipes__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4172/recipes
  - success; performance=99; lcp_ms=910.635
- 2026-07-18T15:31:46.221Z | frontend_stage2__recipes__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4172/recipes
  - success; performance=99; lcp_ms=857.767
- 2026-07-18T15:32:03.872Z | frontend_stage2__recipes__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4172/recipes
  - success; performance=99; lcp_ms=883.855
- 2026-07-18T15:32:21.453Z | frontend_stage2__recipes__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4172/recipes
  - success; performance=99; lcp_ms=883.667
- 2026-07-18T15:32:40.962Z | frontend_stage2__recipes__mobile_390x844__warmup_0 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=864.028
- 2026-07-18T15:33:00.645Z | frontend_stage2__recipes__mobile_390x844__measured_warm_1 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=843.834
- 2026-07-18T15:33:17.811Z | frontend_stage2__recipes__mobile_390x844__measured_warm_2 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=846.215
- 2026-07-18T15:33:34.793Z | frontend_stage2__recipes__mobile_390x844__measured_warm_3 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=840.522
- 2026-07-18T15:33:53.427Z | frontend_stage2__recipes__mobile_390x844__measured_warm_4 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=831.47
- 2026-07-18T15:34:14.965Z | frontend_stage2__recipes__mobile_390x844__measured_warm_5 | http://127.0.0.1:4172/recipes
  - success; performance=100; lcp_ms=850.677
- 2026-07-18T15:34:35.055Z | frontend_stage2__recipe_detail__desktop_1440x900__warmup_0 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=569.716
- 2026-07-18T15:34:52.737Z | frontend_stage2__recipe_detail__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=555.059
- 2026-07-18T15:35:14.756Z | frontend_stage2__recipe_detail__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=565.725
- 2026-07-18T15:35:34.404Z | frontend_stage2__recipe_detail__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=541.384
- 2026-07-18T15:35:53.556Z | frontend_stage2__recipe_detail__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=570.69
- 2026-07-18T15:36:13.106Z | frontend_stage2__recipe_detail__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4172/recipes/1
  - success; performance=100; lcp_ms=569.006
- 2026-07-18T15:36:30.172Z | frontend_stage2__recipe_detail__mobile_390x844__warmup_0 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=879.366
- 2026-07-18T15:36:52.307Z | frontend_stage2__recipe_detail__mobile_390x844__measured_warm_1 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=537.981
- 2026-07-18T15:37:15.899Z | frontend_stage2__recipe_detail__mobile_390x844__measured_warm_2 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=501.981
- 2026-07-18T15:37:32.856Z | frontend_stage2__recipe_detail__mobile_390x844__measured_warm_3 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=514.532
- 2026-07-18T15:37:52.726Z | frontend_stage2__recipe_detail__mobile_390x844__measured_warm_4 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=510.432
- 2026-07-18T15:38:09.855Z | frontend_stage2__recipe_detail__mobile_390x844__measured_warm_5 | http://127.0.0.1:4172/recipes/1
  - success; performance=91; lcp_ms=523.893
- 2026-07-18T15:38:29.346Z | final__home__desktop_1440x900__warmup_0 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=694.168
- 2026-07-18T15:38:48.513Z | final__home__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=139.145
- 2026-07-18T15:39:08.195Z | final__home__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=177.713
- 2026-07-18T15:39:29.132Z | final__home__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=129.314
- 2026-07-18T15:39:49.015Z | final__home__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=150.942
- 2026-07-18T15:40:12.089Z | final__home__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4174/
  - success; performance=100; lcp_ms=141.581
- 2026-07-18T15:40:31.236Z | final__home__mobile_390x844__warmup_0 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=140.266
- 2026-07-18T15:40:56.333Z | final__home__mobile_390x844__measured_warm_1 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=129
- 2026-07-18T15:41:13.955Z | final__home__mobile_390x844__measured_warm_2 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=108.866
- 2026-07-18T15:41:32.153Z | final__home__mobile_390x844__measured_warm_3 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=118.33
- 2026-07-18T15:41:50.107Z | final__home__mobile_390x844__measured_warm_4 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=139.574
- 2026-07-18T15:42:10.201Z | final__home__mobile_390x844__measured_warm_5 | http://127.0.0.1:4174/
  - success; performance=99; lcp_ms=120.161
- 2026-07-18T15:42:27.649Z | final__recipes__desktop_1440x900__warmup_0 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=891.281
- 2026-07-18T15:43:00.630Z | final__recipes__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=900.79
- 2026-07-18T15:43:18.893Z | final__recipes__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=915.399
- 2026-07-18T15:43:39.250Z | final__recipes__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=906.223
- 2026-07-18T15:43:59.884Z | final__recipes__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=896.78
- 2026-07-18T15:44:18.463Z | final__recipes__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4174/recipes
  - success; performance=99; lcp_ms=977.871
- 2026-07-18T15:44:38.490Z | final__recipes__mobile_390x844__warmup_0 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=864.714
- 2026-07-18T15:44:55.934Z | final__recipes__mobile_390x844__measured_warm_1 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=844.154
- 2026-07-18T15:45:15.489Z | final__recipes__mobile_390x844__measured_warm_2 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=851.675
- 2026-07-18T15:45:37.939Z | final__recipes__mobile_390x844__measured_warm_3 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=873.57
- 2026-07-18T15:46:00.644Z | final__recipes__mobile_390x844__measured_warm_4 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=877.928
- 2026-07-18T15:46:20.490Z | final__recipes__mobile_390x844__measured_warm_5 | http://127.0.0.1:4174/recipes
  - success; performance=100; lcp_ms=902.806
- 2026-07-18T15:46:40.806Z | final__recipe_detail__desktop_1440x900__warmup_0 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=588.351
- 2026-07-18T15:46:58.966Z | final__recipe_detail__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=560.412
- 2026-07-18T15:47:20.463Z | final__recipe_detail__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=603.797
- 2026-07-18T15:47:39.642Z | final__recipe_detail__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=567.923
- 2026-07-18T15:47:57.413Z | final__recipe_detail__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=610.238
- 2026-07-18T15:48:14.855Z | final__recipe_detail__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=600.652
- 2026-07-18T15:48:32.433Z | final__recipe_detail__mobile_390x844__warmup_0 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=556.575
- 2026-07-18T15:48:49.545Z | final__recipe_detail__mobile_390x844__measured_warm_1 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=557.219
- 2026-07-18T15:49:11.221Z | final__recipe_detail__mobile_390x844__measured_warm_2 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=589.74
- 2026-07-18T15:49:30.443Z | final__recipe_detail__mobile_390x844__measured_warm_3 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=628.203
- 2026-07-18T15:49:48.530Z | final__recipe_detail__mobile_390x844__measured_warm_4 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=526.902
- 2026-07-18T15:50:06.731Z | final__recipe_detail__mobile_390x844__measured_warm_5 | http://127.0.0.1:4174/recipes/1
  - success; performance=100; lcp_ms=544.754
- 2026-07-18T15:50:25.303Z | final__food_map__desktop_1440x900__warmup_0 | http://127.0.0.1:4174/food-map
  - success; performance=99; lcp_ms=891.563
- 2026-07-18T15:50:48.008Z | final__food_map__desktop_1440x900__measured_warm_1 | http://127.0.0.1:4174/food-map
  - success; performance=99; lcp_ms=756.096
- 2026-07-18T15:51:08.216Z | final__food_map__desktop_1440x900__measured_warm_2 | http://127.0.0.1:4174/food-map
  - success; performance=99; lcp_ms=794.865
- 2026-07-18T15:51:30.006Z | final__food_map__desktop_1440x900__measured_warm_3 | http://127.0.0.1:4174/food-map
  - success; performance=99; lcp_ms=784.888
- 2026-07-18T15:51:52.096Z | final__food_map__desktop_1440x900__measured_warm_4 | http://127.0.0.1:4174/food-map
  - success; performance=99; lcp_ms=773.473
- 2026-07-18T15:52:12.201Z | final__food_map__desktop_1440x900__measured_warm_5 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=632.024
- 2026-07-18T15:52:31.980Z | final__food_map__mobile_390x844__warmup_0 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=126.964
- 2026-07-18T15:52:52.837Z | final__food_map__mobile_390x844__measured_warm_1 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=131.847
- 2026-07-18T15:53:11.715Z | final__food_map__mobile_390x844__measured_warm_2 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=124.969
- 2026-07-18T15:53:30.796Z | final__food_map__mobile_390x844__measured_warm_3 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=134.25
- 2026-07-18T15:53:50.166Z | final__food_map__mobile_390x844__measured_warm_4 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=117.804
- 2026-07-18T15:54:11.928Z | final__food_map__mobile_390x844__measured_warm_5 | http://127.0.0.1:4174/food-map
  - success; performance=100; lcp_ms=136.643

## Lighthouse production-page benchmark

Started: 2026-07-18T15:54:55.310Z

## Sequential API latency benchmark

Started: 2026-07-18T15:55:45.831Z

- realtime_pre_ws POST /auth/login: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /recipes: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /recipes/1: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /checklists: 1 warm-up + 30 retained measured requests
- final POST /auth/login: 1 warm-up + 30 retained measured requests
- final GET /recipes: 1 warm-up + 30 retained measured requests
- final GET /recipes/1: 1 warm-up + 30 retained measured requests
- final GET /checklists: 1 warm-up + 30 retained measured requests
- final GET /food-spots/public: 1 warm-up + 30 retained measured requests
- final GET /restaurants: 1 warm-up + 30 retained measured requests

## Real-time WebSocket benchmark

Started: 2026-07-18T15:56:07.958Z

- final WebSocket: 1 viewer(s), 10 iterations x 4 event types, all individual deliveries retained
- final WebSocket: 5 viewer(s), 10 iterations x 4 event types, all individual deliveries retained
- final WebSocket: 10 viewer(s), 10 iterations x 4 event types, all individual deliveries retained

## Deterministic Vision routing benchmark

- Replayed 30 labelled cases for one warm-up and five measured repeats against Track 2 V3 and final router implementations.
- Network access was blocked; provider call count was zero.
- Full Vision/OCR/dish/place metrics were left unavailable because the corpus does not label them.

## Summary and chart-data generation

- Generated frontend/build/accessibility summaries, 18 chart-ready CSV files, and COMPARATIVE_BENCHMARK_REPORT.md.
- Retained blank fields for unsupported metrics; no unavailable value was converted to zero.

## Final integrity validation

- Re-ran API latency after correcting the benchmark runner's default fixture credentials; all 300 retained measured API requests completed without error.
- Re-ran real-time delivery after constraining event matching to messages received after each request; 640 per-viewer observations were retained with no negative latency, lost event, duplicate event, or out-of-order event.
- Confirmed the two router snapshots share one deterministic mismatch (`shorts_010` expected Track 1 but routed to Track 2), yielding 96.67% safe-routing accuracy and 0% false promotion.
- Generated and formula-validated `FoodStory_Comparative_Benchmark_Data.xlsx`; visually inspected all eight rendered worksheet previews.
- Reset the controlled browser viewport and closed the benchmark browser tabs after capture.
- Removed test-login fallback values from the packaged runner scripts; reruns now require credentials through environment variables, and `environment.json` retains only redacted presence markers.

## Packaging and cleanup

- Created `C:\COS30043\FoodStory_Comparative_Benchmark.zip` with raw CSV/JSON observations, summaries, all Lighthouse JSON/HTML reports, screenshots, scripts, the workbook, report, log, and version manifest.
- Excluded `node_modules`, the artifact runtime junction and preview renders, runtime server logs, environment files, virtual environments, media files, credentials, and private-key material.
- Extracted the archive into a new verification directory, confirmed all required files, and scanned paths and content for forbidden material. Token-like matches inside Lighthouse base64 screenshot payloads were rechecked after stripping embedded images; no non-image secret match remained.
- Stopped only the six benchmark listeners started for this run (ports 3000, 3101, and 4171-4174) after resolving and validating their process IDs.

## Summary and chart-data generation

- Generated frontend/build/accessibility summaries, 18 chart-ready CSV files, and COMPARATIVE_BENCHMARK_REPORT.md.
- Retained blank fields for unsupported metrics; no unavailable value was converted to zero.

## Sequential API latency benchmark

Started: 2026-07-18T16:00:37.330Z

- realtime_pre_ws POST /auth/login: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /recipes: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /recipes/1: 1 warm-up + 30 retained measured requests
- realtime_pre_ws GET /checklists: 1 warm-up + 30 retained measured requests
- final POST /auth/login: 1 warm-up + 30 retained measured requests
- final GET /recipes: 1 warm-up + 30 retained measured requests
- final GET /recipes/1: 1 warm-up + 30 retained measured requests
- final GET /checklists: 1 warm-up + 30 retained measured requests
- final GET /food-spots/public: 1 warm-up + 30 retained measured requests
- final GET /restaurants: 1 warm-up + 30 retained measured requests

## Real-time WebSocket benchmark

Started: 2026-07-18T16:00:51.712Z

- final WebSocket: 1 viewer(s), 10 iterations x 4 event types, all individual deliveries retained
- final WebSocket: 5 viewer(s), 10 iterations x 4 event types, all individual deliveries retained
- final WebSocket: 10 viewer(s), 10 iterations x 4 event types, all individual deliveries retained

## Summary and chart-data generation

- Generated frontend/build/accessibility summaries, 18 chart-ready CSV files, and COMPARATIVE_BENCHMARK_REPORT.md.
- Retained blank fields for unsupported metrics; no unavailable value was converted to zero.

## Summary and chart-data generation

- Generated frontend/build/accessibility summaries, 18 chart-ready CSV files, and COMPARATIVE_BENCHMARK_REPORT.md.
- Retained blank fields for unsupported metrics; no unavailable value was converted to zero.
