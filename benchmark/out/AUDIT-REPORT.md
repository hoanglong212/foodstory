# FoodStory — consolidated defect register

Audit performed 2026-07-31 against commit `c9e3791` on branch `codex/render-deployment`,
running the Vite dev server on `localhost:5173` with the Express backend on `127.0.0.1:3000`
and the live MySQL `foodstory` schema.

Every item below is reproducible from a script in `benchmark/harness/`. Raw evidence is in
`benchmark/out/`. Nothing here is inferred; where a check was inconclusive it says so.

---

## Severity summary

| Severity | Count | Items |
|---|--:|---|
| High | 2 | Session wiped on any slow/failed verification; Vietnamese never reaches grounded retrieval |
| Medium | 6 | Contrast failures; light basemap in dark mode; chat launcher overlaps ticker; backend prod dependencies; silent Food Map failure; unaccented Vietnamese fails outright |
| Low | 7 | Food Map hidden from guests; banner text clipped; mobile page length; empty-form submit silent; focus rings; off-domain answers; off-brand daily inspiration |

---

## HIGH

### H1. Any slow or failed session check logs the user out entirely
**Evidence:** `benchmark/harness/audit-admin-race.mjs`

| Condition | Reached `/admin` |
|---|---|
| Normal network | 6/6 |
| `/api/auth/me` delayed 3500 ms | **0/6** — redirected to `/login`, token deleted |
| `/api/auth/me` aborted | **0/6** — redirected to `/login`, token deleted |

**Root cause** — `frontend/src/stores/authStore.js`, `fetchMe`:

```js
const response = await api.get('/auth/me', { timeout: options.timeoutMs ?? 3000 })
...
} catch (error) {
  this.clearAuth(...)   // fires for timeout, offline, 500 — not just 401
}
```

A single `catch` treats a network timeout the same as invalid credentials and calls
`clearAuth()`, which removes the token. The router then sees `!isLoggedIn` and redirects.

This is not theoretical: `/admin` silently landed on `/` in three separate batch runs
(the a11y sweep, the link sweep, and the screenshot sweep) while scoring 10/10 in
isolation — i.e. it fails exactly when the machine or API is busy.

**Fix** — only clear auth on 401/403. On timeout or network error keep the session and
retry, or fail open and let the next API call decide.

---

### H2. Vietnamese input never reaches the grounded retrieval path
**Evidence:** `benchmark/harness/ux-chatbot4.mjs`, 3 repetitions per variant, isolated
conversation each time (localStorage cleared — required, because the bot restores prior
conversations and an earlier version of this test read stale answers).

| Input | Failed | Returned a real FoodStory dish |
|---|--:|--:|
| EN "Which vegetarian dish is fastest under 30 minutes?" | 0/3 | **3/3** |
| VI with diacritics "Món chay nào nhanh nhất dưới 30 phút?" | 0/3 | **0/3** |
| VI without diacritics "Mon chay nao nhanh nhat duoi 30 phut?" | **3/3** | 0/3 |

Same pattern for dessert ("Cho tôi món tráng miệng" vs "Show me a dessert").

Three-tier degradation:
1. **English** → grounded answer from the 321-recipe catalogue.
2. **Vietnamese with diacritics** → generic LLM prose (bánh flan, salad rau củ) that never
   touches FoodStory data.
3. **Vietnamese without diacritics** → "Tôi không thể hiểu rõ câu hỏi của bạn."

The bot's own greeting says "Ask in English or Tiếng Việt". For a Vietnamese-cuisine
product, unaccented Vietnamese — the most common typing style — failing outright is the
single largest functional gap found.

**Fix** — normalise input (NFD + strip combining marks) before keyword matching, and map
Vietnamese filter vocabulary (chay, tráng miệng, nhanh, dưới N phút) onto the existing
English filter tokens.

---

## MEDIUM

### M1. Colour contrast is the only accessibility defect, and it is everywhere
Two independent tools agree:

- axe-core (`audit-a11y.mjs`): **179 violation nodes**, `color-contrast`, impact *serious*,
  on 17 of 20 route×theme combinations. It is the **only** rule that fails anywhere.
- Own WCAG 2.2 AA pass (`contrast.mjs`): **128 failures** over 1,422 text nodes
  (71 light, 57 dark), worst ratio **1.50:1**.

Everything else is clean: `h1` count is 1 on every page, no heading-level jumps, every
image has `alt`, no ARIA misuse, no unlabelled form controls.

**Root cause** — `frontend/src/styles/01-foundation.css` has **zero** `[data-theme="dark"]`
rules; it carries 11 `[data-theme="light"]` rules. The base `:root` *is* the dark theme and
light is the override, so components that hardcode a light value are never corrected in
dark mode. Confirmed example: `.btn-outline` keeps `background: rgba(255,253,248,0.75)`,
composites to `#c8c5c0` over the dark panel, and keeps near-white text → 1.50:1.

### M2. Food Map uses a light basemap in dark mode
Tile URL is `basemaps.cartocdn.com/rastertiles/voyager` in **both** themes, with
`filter: none` on the tile and tile pane. The entire chrome is dark while the map is white.
CARTO ships `dark_all` for exactly this. Affects the flagship Stage 3 feature.

### M3. Chat launcher overlaps the Food Map ticker
Measured geometry, both themes: launcher `x 1202–1416, y 816–876`; ticker
`x 86–1424, y 828–886` → `launcherOverlapsTicker: true`. The launcher covers a ticker item.

### M4. Backend production dependencies carry 7 high-severity advisories
`npm audit --omit=dev` in `backend/`: **7 high**, all transitive from
`@google-cloud/vision` → `google-gax`/`gcp-metadata` → `gaxios` → `rimraf` → `glob` →
`minimatch` → `brace-expansion` (DoS via unbounded expansion).

For contrast, `frontend` production is **0 vulnerabilities** — its 6 high advisories are
devDependencies only (`@vue/test-utils` → `js-beautify`) and never ship.

### M5. Food Map fails silently when the API is down
With every `/api/` request aborted, `/food-map` renders "All places **0**" with no error
and no retry affordance. A user cannot distinguish "no places exist" from "the backend is
down". By comparison `/recipes/1` shows "Unable to reach the FoodStory API…" and
`/recipes` offers a retry — so error handling is inconsistent across routes.

### M6. Unaccented Vietnamese — see H2
Listed separately because it is the failure mode most likely to be hit by real users.

---

## LOW

### L1. Food Map is missing from the guest navigation
Guest nav: Home / News / About Us / Recipes / Login / Register. The route is
`guestPreview: true`, so guests *can* use it — they just have no way to find it. Once
logged in, "Food Map" appears.

### L2. Guest banner text is clipped mid-sentence
Renders as "Vision and map browsing work now. Sign in for …" while the full string is
"…Sign in for precise address search and saving."

### L3. `/recipes` is 18,731 px tall on mobile
Desktop 7,047 px. The 3-column grid collapses to 1 column and 24 cards stack — roughly 22
screens of scrolling for a single page of results. Pagination exists (Page 1 of 14), so the
fix is page size or a 2-column mobile grid.

### L4. Submitting an empty login form gives no feedback
The form is `novalidate` and neither input is `required`. Clicking Log in with both fields
empty leaves the page unchanged with no message. Labels and `autocomplete` are correct
otherwise (`email`, `current-password`).

### L5. Four focusable controls have no visible focus ring
`outline-style: none` on the recipes search input and the news "Previous" button, in both
themes. 4 of ~380 focusable elements checked. (Detection is computed-style based, so it
cannot see rings drawn only via `:focus-visible` on real keyboard interaction.)

### L6. The chatbot answers confidently outside its domain
"Who won the 1998 FIFA World Cup?" → "France… 3-0" (3/3). It will also write a Python
linked-list implementation. Responses are labelled "Answered with Groq knowledge", so it is
not passing this off as FoodStory data — but a "FoodStory concierge" answering football and
programming dilutes the product. Separately, "Solve 17 * 23" routes into the recipe intent
and replies "Which recipe do you mean?" (3/3) rather than declining.

### L7. Daily Inspiration shows non-Vietnamese dishes
The homepage panel pulled "Burck", a Croatian dish, from TheMealDB, directly under the
"Discover Vietnamese Cuisine" hero.

---

## Verified clean

These were checked and found sound — worth stating, because they are the areas that most
often fail.

**Security — 0 findings** (`audit-security.mjs`)

| Check | Result |
|---|---|
| Admin endpoints (`/admin/stats,users,recipes,comments`) | anon **401**, normal user **403**, admin **200** — enforced server-side |
| Comment ownership (edit/delete another user's comment) | **403** both |
| User enumeration | identical 401 + message for known vs unknown email |
| Password policy | rejects a 1-character password (min 8, server-side) |
| Security headers | `nosniff`, `SAMEORIGIN`, HSTS, CSP `default-src 'self'`, `no-referrer` |
| CORS from `https://evil.example.com` | no `Access-Control-Allow-Origin` returned |
| Secrets / sourcemaps in `dist/` | 0 secret pattern hits, 0 sourcemaps, 0 `VITE_` values inlined |
| XSS surface | **0** `v-html`, **0** `innerHTML` assignments in `frontend/src` |
| SQL injection probes | `' OR '1'='1`, `UNION SELECT`, huge/negative/NaN ids → empty results or clean 400, no internals leaked |
| Interpolated SQL on the request path | reviewed all 7 sites: only `${placeholders}` ("?,?,?"), constant column lists, and `${whereSql}` built purely from hardcoded fragments with bound params and an allowlisted `role`. Safe. |

**Data integrity — 0 problems** (`audit-data-backend.mjs`)

- 0 orphan rows across comments→recipes, comments→users, ratings→recipes, ratings→users, recipes→categories
- 0 duplicate recipe titles, 0 duplicate user emails
- 322 recipes: **0 missing local image files**, 0 empty `image_url`, 1 external URL
- All five hot foreign-key columns indexed

**Correctness and robustness**

- Test suites: frontend **48/48**, backend **411/411** — 459 passing, 0 failing
- **0 console warnings and 0 console errors** across 14 routes (Vue warnings included, not filtered)
- **73 internal links checked, 0 render a 404**; 0 failed requests; 0 HTTP 4xx/5xx
- Invalid ids handled precisely: "Recipe not found.", "Invalid recipe id.", "News item not found.", "Invalid news id."; `/404` route renders a proper 404 with the right `<title>`
- No technical error text (`TypeError`, `AxiosError`, stack frames) leaked to users in any failure scenario
- Recipe images: 36/36 load. An earlier suspicion that many cards had broken images was a
  full-page-screenshot artifact with lazy loading, not a defect.

**Performance** (from the round-2 benchmark, same commit)

- **TBT 0 ms on all 8 routes** — the main thread is never blocked
- API p50 37–65 ms, p95 ≤ 124 ms; WebSocket p50 19 ms with 0 loss / 0 duplication / 0 misordering over 640 observations
- Leaflet draws 5,000 markers in 44 ms with 0 long tasks (production data is 10 places)
- CLS unchanged across the Bootstrap grid migration on all 16 route×viewport combinations

---

## Suggested order of work

1. **H1** — one `catch` branch in `authStore.fetchMe`. Smallest change, removes spurious logouts.
2. **H2** — diacritic normalisation + Vietnamese filter vocabulary in the chatbot.
3. **M1** — add dark counterparts in `01-foundation.css`; this is the root of ~179 contrast nodes.
4. **M2 / M3** — dark basemap; lift the launcher clear of the ticker.
5. **M4** — `npm audit fix` in `backend/`, or pin `@google-cloud/vision` if it is optional.
6. **M5 / L1 / L2 / L3 / L4** — error state on Food Map, guest nav entry, banner width, mobile page size, empty-form feedback.
