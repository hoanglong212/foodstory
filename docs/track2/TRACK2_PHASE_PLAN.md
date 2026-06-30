# Track 2 Phase Plan

## Global Rules

* Track 1 is frozen.
* Track 2 must run only after `runShortsTrack1Pipeline(url)` returns `track: TRACK_2`.
* Track 2 must never return `track: TRACK_1`.
* Track 2 output must always use:
  * `track: TRACK_2`
  * `resolution: RESOLVED | CANDIDATES | UNRESOLVED | NEEDS_REVIEW`
* `UNRESOLVED` is a resolution, not a track.
* Do not implement later phases early.
* Each phase must pass lock criteria before moving to the next phase.

## Frozen Track 1 Files

* `src/services/shortsAddressRouterService.js`
* `src/services/shortsTrack1EvidenceExtractor.js`
* `src/services/shortsTrack1PipelineService.js`
* `src/services/shortsGeminiAddressCleanService.js`
* `src/services/shortsPlacesConfirmService.js`
* `src/services/shortsGeminiAddressConfirmService.js`

These files must not be modified during Track 2 work unless a regression is proven and a regression test is added first.

## Phase 0 - Track 1 Lock

### Lock Criteria

* `npm test -- shortsAddressRouter` PASS
* `npm test -- shortsGeminiAddress` PASS
* `npm test -- shortsPlacesConfirm` PASS
* `npm test -- shortsTrack1Pipeline` PASS
* `npm run audit:shorts-track1-live-testset` PASS
* `npm run audit:shorts-track1-providers` PASS
* `npm run build` PASS

## Phase 1 - Track 2 Contract Shell

### Goal

Create top-level two-track orchestrator and Track 2 shell. No OCR, no ASR, no Places inference, no Gemini Track 2.

### Required Output Contract

```js
{
  track: 'TRACK_2',
  resolution: 'UNRESOLVED',
  reason: 'TRACK_2_NOT_IMPLEMENTED_YET',
  sourceUrl,
  videoId,
  metadata,
  signals,
  candidates: [],
  diagnostics: [],
  stages: {
    track1,
    track2: null
  }
}
```

### Lock Criteria

* Track 1 success returns Track 1 result directly.
* Track 1 fallback calls Track 2 shell.
* Track 2 receives metadata/stages/signals from Track 1.
* Track 2 does not fetch YouTube metadata again.
* Track 2 never returns TRACK_1.
* Unit tests pass.
* Build passes.

## Phase 2 - OCR Frame Extraction

### Goal

Extract frames and OCR text only. No address extraction. No Places. No Gemini. No RESOLVED.

### Resource Limits

* max video duration 60 seconds
* max frames 8
* max frame size 3 MB
* max total frame bytes 16 MB
* max OCR/frame extraction budget 30 seconds
* cleanup temp files on success and failure

### Lock Criteria

* binary unavailable returns controlled UNRESOLVED
* video too long returns controlled UNRESOLVED
* frame extraction success passes frames to OCR
* temp files are cleaned
* unit tests do not require real yt-dlp/ffmpeg

## Phase 3 - OCR Address Candidate Extraction

### Goal

Extract address candidates from OCR text. No Places. No Gemini. No RESOLVED.

### Candidate Schema

```js
{
  sourceType: 'ocr_frame',
  candidateAddress,
  normalizedAddress,
  rawText,
  timestampSeconds,
  ocrConfidence,
  extractionRule,
  riskFlags
}
```

### Candidate Rules

Accept only explicit address label or full address-like text:

* `Địa chỉ:`
* `ĐC:`
* `Address:`

or:

* house number + street/alley/lane + ward/district/city marker

### Lock Criteria

* dirty OCR rejected
* truncated OCR rejected
* social/link/hashtag text rejected
* multiple addresses returns CANDIDATES or NEEDS_REVIEW
* no provider calls

## Phase 4 - OCR Candidate Verification

### Goal

First phase allowed to return RESOLVED.

### Flow

OCR candidate
-> cleanAddressNoRepair
-> confirmAddressWithPlaces
-> Track 2 Gemini confirm
-> RESOLVED / CANDIDATES / UNRESOLVED / NEEDS_REVIEW

### Lock Criteria

* clean OCR + Places match + Gemini confirm returns RESOLVED
* Places no match does not RESOLVE
* Gemini UNSURE does not RESOLVE
* provider errors do not crash
* dirty candidates do not call Places/Gemini
* Track 2 never returns TRACK_1

## Phase 5 - ASR Resolver

### Goal

Extract transcript address candidates and reuse Phase 4 verifier.

### Lock Criteria

* full address phrase creates candidate
* area-only phrase does not create resolved address
* unclear transcript returns UNRESOLVED or NEEDS_REVIEW
* ASR provider errors are controlled

## Phase 6 - Place-name Inference + Safety Guard

### Goal

Resolve only specific shop-name + area cases.

### Must Block Generic/List Titles

* top
* tổng hợp
* những quán
* các quán
* quán ngon
* món ngon
* nên thử
* rất nhiều quán
* food tour
* phần 1
* part 1

### Lock Criteria

* generic/list title never RESOLVED
* multi-place video never RESOLVED as a single place
* specific shop + area may return CANDIDATES or RESOLVED only after verification
* high score alone is not enough without safety checks

## Phase 7 - Full Track 2 Audit

### Goal

End-to-end live audit.

### Audit Summary Must Include

* total
* track1Returned
* track2Resolved
* track2Candidates
* track2Unresolved
* track2NeedsReview
* falseResolved
* providerErrors
* avgLatency

### Definition of Done

* Track 1 no regression
* falseResolved = 0 on safety set
* generic/list titles not resolved
* OCR full-address cases resolve when evidence is clean
* provider errors controlled
* all tests pass
* build passes

## Phase Change Rule

A phase can only be modified after it is locked if:

* a real regression is found
* a regression test is added first
* the patch is documented as `PATCH_PHASE_X_Y`
