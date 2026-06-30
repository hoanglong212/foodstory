# YouTube Shorts Address Router Spec

## Goal

Implement a strict two-track router for Vietnamese YouTube Shorts address extraction.

The main goal is to prevent Track 1 and Track 2 from being mixed.

Track 1 must be precision-first and only accept explicit address evidence. Everything else must fall back to Track 2.

---

## Scope

This implementation is only for YouTube Shorts URLs.

Accepted URL formats:

```txt
https://www.youtube.com/shorts/<videoId>
https://m.youtube.com/shorts/<videoId>
```

Do not implement or modify long-form YouTube video handling in this task.

---

## Core Rule

Track 1 is only allowed when there is valid explicit evidence from non-OCR sources.

Track 1 can be entered only if at least one of these is true:

1. Non-OCR text contains one of these exact prefixes:
   - `ĐC:`
   - `Địa chỉ:`
   - `Address:`
2. JSON-LD structured data contains an `address` field.
3. YouTube `snippet.description` contains a clear address clause with:
   - house number
   - street name
   - district/local admin

Example valid clear description:

```txt
Tiệm bún bò Phú Hưng tại số 284/3 Chợ Lớn (Q.6, TP.HCM)
```

---

## Sources Eligible For Track 1

Allowed:

```txt
title
snippet.description
visible page metadata text
JSON-LD
```

Important:

Even though `title` can be scanned for exact prefix labels, title-only address-like text without an exact prefix must not be promoted to Track 1.

Allowed title example:

```txt
Bún Đậu Hùng Cường Địa chỉ: Số 9, ngõ 56 Trần Quang Diệu...
```

Rejected title-only example:

```txt
NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội
```

---

## Sources Not Eligible For Track 1

Never allow these sources to create Track 1:

```txt
OCR-only address
ASR-only address
title-only address-like text without exact prefix
Google SERP snippet
Gemini repaired address
Places-only match
damaged or truncated text
```

If an address comes from OCR, ASR, inferred text, or Gemini repair, route to Track 2.

Even if Google Places finds a strong match, it must still remain Track 2 when the original evidence source is not eligible.

---

## Required Track 1 Decision Flow

The router must follow this order:

```txt
1. Parse Shorts URL
2. Fetch YouTube metadata and Shorts HTML
3. Extract Track 1 eligible evidence only
4. If no eligible evidence, return Track 2
5. Safe normalize candidate
6. Gemini clean only, no repair
7. If damaged or repaired, return Track 2
8. Google Places confirm
9. Gemini confirm
10. If confidence >= 0.90 and source is eligible, return Track 1
11. Otherwise return Track 2
```

---

## Safe Normalize Rules

Allowed deterministic normalization:

```txt
Unicode NFKC
whitespace normalization
full-width colon to ASCII colon
comma/parentheses/dash normalization
remove surrounding bullet or emoji
safe abbreviation expansion from closed lexicon
```

Allowed closed lexicon:

```txt
Q. -> Quận
P. -> Phường
TP.HCM -> TP. Hồ Chí Minh
HCMC -> TP. Hồ Chí Minh
HN -> Hà Nội
```

Do not guess missing information.

Do not infer district from city, street, shop name, or context.

---

## Exact Prefix Rule

Allowed prefixes are exactly:

```js
const ALLOWED_PREFIXES = ["ĐC:", "Địa chỉ:", "Address:"];
```

Do not expand baseline to:

```txt
dc:
dia chi:
Đ/C:
Address :
Địa chỉ :
```

Those can be added later as a separate recall experiment, but not in this implementation.

---

## Clear Description Rule

Only apply this rule to YouTube `snippet.description`.

A clear description address must contain all three:

```txt
house number
street name
district/local admin
```

Examples of accepted house numbers:

```txt
39
284/3
129F/138/92
01
8D1
371/67A
```

Examples of accepted district/local admin:

```txt
Quận 1
Q.6
Quận Tân Bình
Thủ Đức
Hai Bà Trưng
Hoàn Kiếm
TP.HCM
Hà Nội
```

Reject if missing house number.

Reject if missing district/local admin.

Reject if the text is truncated.

---

## Gemini Clean Contract

Gemini clean is only allowed to clean and normalize.

Allowed actions:

```txt
format address
normalize punctuation
expand safe abbreviations from closed lexicon
remove decorations
```

Forbidden actions:

```txt
add missing house number
add missing district
guess street name
repair OCR-damaged text
infer address from shop name
infer address from Places results
merge multiple branches into one address
```

Expected output:

```js
{
  status: 'OK' | 'DAMAGED' | 'NO_ADDRESS' | 'MULTIPLE_ADDRESSES',
  normalizedAddress: string,
  operationsApplied: string[],
  disallowedRepairDetected: boolean,
  explanation: string
}
```

If `status !== 'OK'`, return Track 2.

If `disallowedRepairDetected === true`, return Track 2.

---

## Gemini Confirm Contract

Gemini confirm is only a judge. It must not create new addresses.

Expected output:

```js
{
  decision: 'CONFIRMED' | 'REJECT_TO_TRACK2' | 'UNSURE',
  confidence: number,
  bestPlaceId: string | null,
  reasonCodes: string[],
  explanation: string
}
```

Allowed reason codes:

```txt
EXACT_HOUSE_NUMBER
STREET_MATCH
DISTRICT_MATCH
CITY_MATCH
NAME_MATCH
TYPE_MATCH
SOURCE_NOT_ELIGIBLE
REPAIR_NEEDED
CONFLICTING_CANDIDATES
TRUNCATED_EVIDENCE
```

Final Track 1 condition:

```js
confirm.decision === "CONFIRMED" &&
  confirm.confidence >= 0.9 &&
  sourceIsTrack1Eligible === true &&
  clean.disallowedRepairDetected === false;
```

Otherwise return Track 2.

---

## Required Output Shape

Router output must use this shape:

```js
{
  track: 'TRACK_1' | 'TRACK_2',
  reason:
    | 'EXPLICIT_LABEL'
    | 'JSONLD_ADDRESS'
    | 'CLEAR_DESCRIPTION'
    | 'NO_EXPLICIT_EVIDENCE'
    | 'OCR_ONLY'
    | 'ASR_ONLY'
    | 'TITLE_ONLY'
    | 'LOW_CONFIDENCE'
    | 'DAMAGED_EVIDENCE'
    | 'REPAIR_DETECTED'
    | 'CONFLICTING_CANDIDATES'
    | 'TRUNCATED_EVIDENCE',
  evidenceSource:
    | 'title'
    | 'description'
    | 'page_text'
    | 'jsonld'
    | 'ocr'
    | 'asr'
    | 'places'
    | null,
  candidateAddress: string | null,
  normalizedAddress: string | null,
  placeId: string | null,
  confidence: number | null,
  signals: object[]
}
```

---

## Implementation Files

Create or update these files only unless absolutely necessary:

```txt
src/services/shortsAddressRouterService.js
src/services/shortsTrack1EvidenceExtractor.js
src/services/shortsAddressNormalizer.js
src/services/shortsGeminiAddressCleanService.js
src/services/shortsPlacesConfirmService.js
src/services/shortsGeminiAddressConfirmService.js
```

Test files:

```txt
tests/shortsAddressRouter.track1.test.js
tests/shortsAddressRouter.track2.test.js
tests/shortsAddressRouter.edge.test.js
tests/fixtures/youtube-shorts-address-30.json
```

Do not rewrite the old vision pipeline in this task.

Do not modify OCR frame extraction logic unless a test requires wiring signals into Track 2.

---

## Must-Pass Tests

### Track 1: exact label

Input:

```txt
Địa chỉ: 92C Cao Thắng, Phường 4, Quận 3, TP.HCM
```

Expected:

```txt
TRACK_1
reason = EXPLICIT_LABEL
```

---

### Track 1: English label

Input:

```txt
Address: 39 Nguyen Trai, District 1, HCMC
```

Expected:

```txt
TRACK_1
reason = EXPLICIT_LABEL
```

---

### Track 1: clear description

Input:

```txt
Tiệm bún bò Phú Hưng tại số 284/3 Chợ Lớn (Q.6, TP.HCM)
```

Expected:

```txt
TRACK_1
reason = CLEAR_DESCRIPTION
```

---

### Track 2: OCR-only

Input:

```txt
The address is pinned on the screen.
```

OCR text contains:

```txt
52 Nguyễn Công Trứ, Bình Thạnh
```

Expected:

```txt
TRACK_2
reason = OCR_ONLY
```

---

### Track 2: title-only address

Input title:

```txt
NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội
```

Expected:

```txt
TRACK_2
reason = TITLE_ONLY
```

---

### Track 2: truncated evidence

Input:

```txt
Địa chỉ: 114 Lê Thị Riêng, Quận ...
```

Expected:

```txt
TRACK_2
reason = TRUNCATED_EVIDENCE
```

---

### Track 2: Gemini repair detected

Input:

```txt
Địa chỉ: 114 Le Thi Rieng, Quan ...
```

Gemini attempts to output:

```txt
114 Lê Thị Riêng, Quận 1, TP.HCM
```

Expected:

```txt
TRACK_2
reason = REPAIR_DETECTED
```

---

### Track 2: low confidence

Input has valid explicit address, but Gemini confirm returns:

```js
{
  decision: 'CONFIRMED',
  confidence: 0.89
}
```

Expected:

```txt
TRACK_2
reason = LOW_CONFIDENCE
```

---

## Hard Requirements

1. OCR must never create Track 1.
2. ASR must never create Track 1.
3. Google Places must never create Track 1 by itself.
4. Gemini repair must never create Track 1.
5. Confidence must never override evidence policy.
6. Google SERP snippets must not be used for Track 1 routing.
7. Track 1 must prefer precision over recall.
8. All borderline cases must fall back to Track 2.

---

## Definition Of Done

The task is done when:

```txt
npm test -- shortsAddressRouter
```

passes all Track 1, Track 2, and edge tests.

The implementation must log evidence provenance for every candidate address.

Each Track 1 result must explain:

```txt
which source produced the candidate
which rule allowed Track 1
whether Gemini clean changed anything
which Places candidate was selected
why confidence passed 0.90
```

Each Track 2 result must explain why Track 1 was rejected.
