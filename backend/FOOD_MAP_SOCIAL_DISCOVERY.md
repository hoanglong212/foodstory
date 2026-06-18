# Food Map Social Discovery

## Part 2 Scope

Part 2 adds public URL metadata extraction to
`POST /api/food-map/social-discovery`. It does not identify or match a place,
query Google Places, run OCR, or classify a dish.

For an HTTP or HTTPS URL, the backend may extract:

- Final URL after validated redirects
- Platform from the hostname
- HTML title and meta description
- OpenGraph title, description, image, and site name
- Twitter card title, description, and image
- Canonical URL
- A short visible-text snippet with scripts, styles, and markup removed

The Food Map response prefers OpenGraph title/description, then Twitter card
values, then the standard HTML values. Extracted text is only an input signal.
It is not treated as proof of a restaurant, address, or dish.

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

## Next Step

The next implementation step can be Part 3 screenshot OCR to recover visible
place text, followed by Part 4 text-based place matching. Place matching remains
deliberately outside Part 2.
