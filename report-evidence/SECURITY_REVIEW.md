# FoodStory Security Review

Audit date: 2026-07-17 (Asia/Saigon)  
Branch: `report-finalization`  
Baseline commit inspected: `dd00c76257ad2c04468615e8b85a2037f178d80d`

## Scope and method

The audit covered tracked and untracked project files, Git tracking state, detectable Git history paths/signatures, environment files, source/log statements, archives, dependency folders, Python caches, downloaded media patterns, and the final package rules. Searches included `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE KEY`, `client_email`, `private_key`, `GOOGLE_APPLICATION_CREDENTIALS`, `JWT_SECRET`, `DATABASE_URL`, `DB_PASSWORD`, `GUARDIAN_API_KEY`, `GEMINI_API_KEY`, and `GOOGLE_PLACES_API_KEY`, plus common high-confidence key/token formats. Results were reviewed by filename/classification without printing secret values.

## Findings

- A live `backend/.env` exists locally. It is ignored by the root `.gitignore`, is not tracked, and no matching tracked-history path was detected.
- A Google service-account JSON exists under `backend/secret/`. The directory is ignored, the file is not tracked, and no matching tracked-history path was detected. Its values were not printed or copied.
- No high-confidence API key, private-key header, GitHub token, OpenAI-style key, or JWT signature was found in the tracked source scan or the detectable Git-history signature scan.
- No ZIP/RAR/7z archive containing credentials was found inside the repository.
- Two generated Python bytecode files were tracked under `ai-service/__pycache__/`; they were removed from source control.
- Seed scripts printed known test passwords. Logging was changed to confirm configuration while omitting the password value.
- Default credentials in smoke/seed scripts are academic local test-account credentials, not production credentials. They must not be reused for a deployed system.
- `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities for both frontend and backend on the audit date.

## Ignore and cleanup changes

The root `.gitignore` now also excludes pytest/mypy/ruff caches, coverage output, common backend download/frame/audio directories, general download directories, and credential-named JSON files. Existing exclusions already cover `.env` files (while allowing `.env.example`), `node_modules`, virtual environments, build output, logs, temporary directories, service accounts, Codex artifacts, and ZIP files.

## Credential rotation recommendation

No evidence was found that the local environment file or service-account JSON was committed. Rotation is therefore not required by the evidence currently available. Rotation is still recommended if either credential has ever been shared outside this checkout, uploaded manually, included in an earlier uninspected archive, or used on an untrusted machine. Cloud credential rotation was not attempted automatically.

## Remaining limitations

- Git signature/path searches cannot prove that every historical binary blob or external archive is clean.
- Ignored local files remain the operator's responsibility and must never be manually added with `git add -f`.
- Browser local storage contains the active JWT during normal use; screenshots were captured without exposing developer tools or token values.
- In-memory queues and WebSocket rooms are process-local and are not a distributed security boundary.
- Provider dashboards, cloud audit logs, and remote GitHub history were not inspected.

## Final ZIP rule

The final ZIP is built from an explicit allowlist/exclusion process and excludes `.git`, all real `.env` files, `secret/` and `secrets/`, service-account/credential JSON, dependencies, virtual environments, caches, logs, build output, downloaded media, temporary frames/audio/video, and local databases. A second filename/signature scan and extraction check are required after ZIP creation; their results are recorded in `FINAL_PACKAGE_MANIFEST.md`.
