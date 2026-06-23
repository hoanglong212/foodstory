# Food Map Social Discovery

## Current Scope

`POST /api/food-map/social-discovery` accepts a public URL, uploaded image, or
user hint. It extracts bounded evidence, optionally resolves a real-world
location, checks Food Map duplicates, and creates only reviewable draft places.

For an HTTP or HTTPS URL, the backend may extract:

- Final URL after validated redirects
- Platform from the hostname
- HTML title and meta description
- OpenGraph title, description, image, and site name
- Twitter card title, description, and image
- Canonical URL
- A short visible-text snippet with scripts, styles, and markup removed

The response prefers OpenGraph title/description, then Twitter card values,
then standard HTML values. URL text remains evidence rather than proof and must
pass the same entity and location gates as OCR evidence.

## URL Fetching Security

The extractor:

- Allows only HTTP and HTTPS.
- Rejects credentials in URLs, localhost, loopback addresses, private IPv4
  ranges, IPv6 unique-local addresses, and IPv6 link-local addresses.
- Resolves DNS before each request and rejects a hostname if any returned
  address is private or unsafe.
- Pins the approved DNS address for the request.
- Revalidates every redirect and follows at most three redirects.
- Uses a five-second timeout and a 1MB response limit.
- Parses only HTML, XHTML, and plain-text responses.
- Sends a fixed FoodStory user agent and does not forward user cookies or
  request headers.
- Never returns raw HTML to the frontend.

Unsafe URLs are not fetched. Failures are represented by explicit extraction
statuses such as `unsafe_url`, `timeout`, `blocked`, `fetch_failed`, and
`no_metadata`.

## Social Platform Limitations

TikTok and Instagram frequently return limited metadata or block anonymous
requests. FoodStory does not use browser automation, login sessions, cookies,
or private-content scraping, so captions from those services are not
guaranteed.

When useful public title or description metadata is unavailable, the API asks
the user for a screenshot or the restaurant name. This fallback is necessary
because a public URL alone may not expose enough information to identify a
place reliably.

## Current Evidence-Driven Pipeline

The social-discovery endpoint now keeps the original local OCR pipeline and
adds modular stages around it:

1. Public URL metadata and uploaded image handling.
2. OCR provider selection (`google_vision`, `tesseract`, or `hybrid`).
3. Existing OCR normalization, line filtering, and canonical clustering.
4. Concise final OCR evidence selection.
5. Rule, Groq, or hybrid evidence-backed entity extraction.
6. A score-based location query gate.
7. Optional Google Places Text Search resolution.
8. Existing Food Map duplicate matching or draft-only creation.
9. A user-facing `nextAction`.

Tesseract remains the default for backward compatibility. Google Cloud Vision
is the primary production OCR provider when configured. In hybrid mode Google
Vision is attempted first, with a configurable Tesseract fallback.

## Configuration

```env
OCR_PROVIDER=tesseract
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_CLOUD_PROJECT=
GOOGLE_VISION_TIMEOUT_MS=8000
GOOGLE_VISION_FEATURE=document_text_detection
OCR_FALLBACK_TO_TESSERACT=true

ENTITY_EXTRACTOR_MODE=rule
ENTITY_EXTRACTOR_TIMEOUT_MS=7000
GROQ_API_KEY=
GROQ_ENTITY_MODEL=llama-3.1-8b-instant

LOCATION_RESOLUTION_PROVIDER=disabled
GOOGLE_MAPS_API_KEY=
LOCATION_RESOLUTION_TIMEOUT_MS=6000
LOCATION_RESOLUTION_MAX_CANDIDATES=5
```

The safe default configuration performs local Tesseract OCR and no Groq, map,
or draft database operation. Google credentials are loaded through Application
Default Credentials; credential JSON is never read into responses or debug
output.

## OCR Evidence Selection

The final OCR summary is selected from canonical strong and weak evidence. It
prefers clean contact lines, supported street addresses, bounded sign crops,
and concise menu or dish text. Weak and rejected evidence remains available in
bounded debug fields but is not copied into the final OCR text dump.

## Hybrid Entity Extraction

Rule extraction always remains available. Hybrid mode runs the rule extractor
first and lets Groq fill missing or lower-confidence fields. Groq receives only
bounded cleaned evidence. Returned values are schema validated and discarded
when their quoted evidence cannot be matched to OCR, metadata, or the user
hint.

## Location Safety

The location query gate is pure and performs no external request. A score of at
least 10 is required. Dish-only, weak-location-only, and noisy OCR inputs do not
call map resolution.

Google resolution is disabled by default. Missing configuration and provider
errors return safe statuses without failing the social-discovery request.

Resolved places are never inserted directly into `restaurants` or
`food_spots`. A strong existing duplicate focuses the existing place. A new
resolved place is inserted only into `draft_places` with `pending` status and
must be confirmed by a later user workflow.
