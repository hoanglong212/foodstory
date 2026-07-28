# FoodStory Final Submission Verification

## Source authority

- Verification date: 2026-07-27 (Asia/Saigon)
- Authoritative branch: `codex/render-deployment`
- Authoritative commit: `0473287788bad6a098f1d2724ec0e3d0c81bd412`
- `git branch --show-current`: `codex/render-deployment`
- `git rev-parse HEAD`: `0473287788bad6a098f1d2724ec0e3d0c81bd412`
- `git status --short`: no output (clean worktree at the authority gate)
- Predecessor comparison: exactly one commit ahead of `1789998511d85adf7a6f95a7a403e07f9d409ba9`
- Changed path versus predecessor: `docs/report-input/FoodStory_COS30043_EvidenceReconciled_SubmissionDraft_v7.docx` (added)
- Application runtime source changed versus predecessor: no

## Sensitive-file precheck

- Tracked files inspected: 768
- Forbidden tracked-path scan: PASS
- Likely real-secret scan: PASS
- `.env.example`: sanitised placeholder file, PASS
- `ai-service/.env.example`: sanitised placeholder file, PASS
- `backend/.env.example`: sanitised placeholder file, PASS
- `frontend/.env.example`: sanitised placeholder file, PASS
- Real `.env`, key material, credential JSON, downloaded video, database dump, dependency/build/cache directory findings: none
- Likely real JWT secret, database password, provider API key, bearer token, JWT token, or private-key findings: none

The scan reported only paths, safe line numbers where applicable, categories,
and pass/fail status. It did not print or copy matched values.

## Authoritative source archive

- Filename: `FoodStory_Final_Source_04732877.zip`
- Authoritative commit: `0473287788bad6a098f1d2724ec0e3d0c81bd412`
- Exact byte size: `55,496,926` bytes
- MiB size: `52.925993 MiB`
- SHA-256: `3d66a5f34ac2bbc854c0ce4104c89a85a523385b33216bf4cc60b5d0d2d23e1d`
- Total entries: 814
- File entries: 767
- Directory entries: 47
- ZIP integrity and every-entry read: PASS
- Safe absolute/traversal path scan: PASS
- Forbidden/sensitive-file scan: PASS
- Likely real-secret scan: PASS
- Clean extraction: PASS
- Expected frontend, backend, and project documentation: PASS
- Report-input DOCX excluded: yes

## Configured regression evidence

- Frontend `npm test` script: `vitest run`
- Frontend configured scope: `src/**/*.test.js` in the jsdom environment,
  with mock restoration enabled
- Backend `npm test` script: `node --test ./tests/*.test.js`
- Backend configured scope: top-level `backend/tests/*.test.js` files; nested
  focused suites such as `backend/tests/shorts/*.test.js` are not included by
  this command
- Frontend production build: passed
- Frontend configured regression result: 48/48 passed
- Backend configured regression result: 399/399 passed

These are author-run local command results supplied by the student. They are
not an independent external certification. Historical focused suites may
overlap with the final configured totals and must not be added to them. The
historical 716-case result is not promoted as final regression evidence and is
not treated as comparable with the configured 399-test backend run.

## Optional small Vision benchmark support

- Manual CSV template:
  `docs/vision-auto-small-benchmark-template.csv`
- Summary script: `scripts/summarise-vision-benchmark.mjs`
- Script syntax check: PASS
- Benchmark execution: not run because no manually labelled cases were
  supplied

The helper validates the allowed outcomes, requires manually supplied
ground-truth labels, reports the sample size and percentages, and warns that a
small convenience sample is not representative. It does not infer or modify
ground truth.

## Report finalisation and rendering

- Input:
  `docs/report-input/FoodStory_COS30043_EvidenceReconciled_SubmissionDraft_v7.docx`
- Output DOCX:
  `docs/FoodStory_COS30043_Final_Report_ArchiveVerified_VideoPending.docx`
- Output PDF:
  `docs/FoodStory_COS30043_Final_Report_ArchiveVerified_VideoPending.pdf`
- PDF pages: 67
- DOCX ZIP integrity: PASS
- Embedded image relationships: 37/37 readable, PASS
- Table count preserved: 25/25, PASS
- Footer references: 4/4 present, PASS
- Page-number fields and continuity: PASS
- Table of contents heading consistency: PASS
- Programmatic PDF page-render audit: PASS
- Visual review of every rendered page: PASS
- Missing images, broken tables, clipped text, or unintended blank pages:
  none
- Obsolete commit/archive metadata, historical 716 comparison, draft status,
  archive-pending wording, or archive-outstanding wording: none
- Report OOXML likely-secret scan: PASS
- Remaining intentional pending marker:
  `[STAGE_3_VIDEO_URL_TO_BE_INSERTED]`

The report remains explicitly video-pending and is not represented as the
fully final submission while the Stage 3 video URL placeholder remains.
