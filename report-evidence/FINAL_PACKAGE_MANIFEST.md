# FoodStory Final Package Manifest

Archive: `C:\COS30043\FoodStory_Final_Submission_Source.zip`  
Companion checksum: `C:\COS30043\FoodStory_Final_Submission_Source.zip.sha256`

## Included

- `frontend/` source, tests, `package.json`, lockfile and `.env.example` where present.
- `backend/` source, routes, services, workers, tests, scripts, database schema/migrations, package manifest/lockfile and `.env.example`.
- `ai-service/` source, deterministic smoke test, requirements and `.env.example`.
- `docs/`, root project manifests/examples, and the complete `report-evidence/` directory.

## Excluded

Git metadata; real `.env` files; secret/service-account/credential JSON; `node_modules`; virtual environments; Python/tool caches; build/coverage output; logs; local databases; downloaded video/audio/frame files; temporary provider artifacts; editor/Codex/browser profiles; and temporary test records.

## Verification contract

After the archive is built, the finalization workflow lists its entries, rejects forbidden filename patterns, scans extracted text/source for high-confidence secret signatures, extracts it into a new temporary directory, and confirms the required top-level directories exist. The final byte size, entry count and SHA-256 are reported in the final Codex response and the adjacent `.sha256` sidecar.

The ZIP cannot contain its own final cryptographic hash without changing that hash. The adjacent checksum file is therefore the authoritative machine-readable digest.

## Verification result

The final build completed the required archive listing, forbidden-path scan, fresh-directory extraction, and high-confidence secret-signature scan successfully. The archive contained 836 entries (777 extracted files); no forbidden filename or high-confidence secret signature was reported. Exact final byte size and SHA-256 are intentionally externalized to the final response and `.sha256` sidecar to avoid a self-referential digest.
