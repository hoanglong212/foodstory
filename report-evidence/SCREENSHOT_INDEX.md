# FoodStory Screenshot Evidence Index

All captured browser images use the current localhost application on 2026-07-17. Desktop viewport is 1440 x 900 unless noted. Temporary database records used for screenshots were deleted after capture. “Deterministic fixture” means the current UI rendered a bounded intercepted test response; it is not a live-provider claim.

| File | Page / feature | Role | Viewport | Requirement proved | Evidence type | Suggested figure caption |
|---|---|---|---|---|---|---|
| `01-home-light.png` | Home, light theme | Guest | 1440x900 | Current Home and light theme | Live current UI | FoodStory final Home page in light mode. |
| `02-home-dark.png` | Home, dark theme | Guest | 1440x900 | Theme persistence and dark presentation | Live current UI | FoodStory final Home page in dark mode. |
| `03-about-light.png` | About | Guest | 1440x900 | Stage 1 About interaction layout | Live current UI | About page and food-personality interaction in light mode. |
| `04-about-dark.png` | About | Guest | 1440x900 | About dark theme | Live current UI | About page in dark mode. |
| `05-about-food-mood-selection.png` | About food mood | Guest | 1440x900 | Interactive mood selection | Live current UI | Street Food Hunter mood selection and responsive result. |
| `06-news-current.png` | External News | Guest | 1440x900 | Backend-proxied Guardian listing/search/filter/pagination | Live current provider response | Current external food-news listing supplied through Express. |
| `07-register-validation.png` | Register validation | Guest | 1440x900 | Invalid email/short-password validation state | Live current UI | Client-side account registration validation. |
| `08-login.png` | Login | Guest | 1440x900 | Authentication entry | Live current UI | FoodStory login interface. |
| `09-recipes-list.png` | Recipe list | User | 1440x900 | Search/filter/pagination-ready recipe catalogue | Live current UI | Authenticated recipe discovery catalogue. |
| `10-recipe-detail.png` | Recipe detail | User | 1440x900 | Ingredients, instructions, nutrition and actions | Live UI with temporary record | Complete recipe detail and interaction surface. |
| `11-recipe-rating.png` | Rating section | User | 1440x900 | Per-user rating interaction | Live DB interaction | A user rating persisted on a temporary recipe. |
| `12-recipe-comments.png` | Comments | User | 1440x900 | Authenticated comment creation | Live DB interaction | Comment activity on a temporary recipe. |
| `13-favourite-saved.png` | Favourite state | User | 1440x900 | Favourite persistence | Live DB interaction | Recipe saved to the user's favourites. |
| `14-shopping-checklist.png` | Checklist | User | 1440x900 | Generated ingredient checklist | Live DB interaction | Persistent shopping checklist generated from recipe ingredients. |
| `15-profile.png` | Profile | User | 1440x900 | Profile persistence/activity | Live current UI | Authenticated profile and FoodStory activity. |
| `16-recipe-submission.png` | User recipe submission | User | 1440x900 | Submission form and role access | Live current UI | User-facing recipe submission workflow. |
| `17-admin-dashboard.png` | Admin overview | Admin | 1440x900 | Admin metrics and restricted access | Live current UI | Administrator dashboard overview. |
| `18-admin-moderation.png` | Pending moderation | Admin | 1440x900 | Pending user recipe moderation | Live UI with temporary pending record | Administrator review queue for user-submitted recipes. |
| `19-mobile-navigation.png` | Home navigation | Guest | 390x844 | Mobile responsive navigation | Live current UI | FoodStory mobile navigation at phone viewport. |
| `20-realtime-before.png` | Recipe comments before | Admin (User B) | 1440x900 | Baseline for two-session evidence | Live two-browser session | User B before User A posts a live comment. |
| `21-realtime-comment-user-a.png` | Comment created | User A | 1440x900 | User A persisted a comment | Live two-browser session | User A posts a comment to the shared recipe. |
| `22-realtime-comment-user-b.png` | Comment received | Admin (User B) | 1440x900 | WebSocket comment delivery without refresh | Live two-browser session | User B receives User A's comment in real time. |
| `23-realtime-rating-user-b.png` | Rating aggregate | Admin (User B) | 1440x900 | WebSocket rating update without refresh | Live two-browser session | User B receives the updated recipe rating aggregate. |
| `24-food-map-overview.png` | Food Map | User | 1440x900 | Map, local restaurants and clustering surface | Live current UI | Authenticated Food Map overview with real local records. |
| `25-food-map-personal-spot.png` | Personal map spot | User | 1440x900 | Personal saved-place rendering | Live UI with temporary spot | A user-owned place rendered on the Food Map. |
| `26-vision-auto-input.png` | Vision Auto input | User | 1440x900 | YouTube/Short input and supported-source copy | Live current UI | Dish Vision input for a public YouTube source. |
| `27-vision-auto-analyzing.png` | Dish analysis progress | User | 1440x900 | Busy/progress state | Deterministic fixture | Deterministic Dish Vision analysis progress state. |
| `28-vision-auto-dish-candidates.png` | Dish candidates | User | 1440x900 | Dish-first selection and uncertainty note | Deterministic fixture | Reviewable dish candidates without a filming-location claim. |
| `29-vision-auto-place-results.png` | Alternative places | User | 1440x900 | External-place rendering and safety copy | Deterministic fixture, not live Google result | Fixture alternatives around the map, explicitly not the filming location. |
| `30-vision-auto-safe-not-found.png` | Insufficient dish evidence | User | 1440x900 | Safe not-found behavior | Deterministic fixture | Honest insufficient-evidence result from Dish Vision. |
| `31-vision-auto-provider-unavailable.png` | Provider failure | User | 1440x900 | Graceful provider-unavailable handling | Deterministic fixture | Safe provider-unavailable response without fabricated success. |
| `32-frontend-build-terminal.png` | Frontend build terminal | n/a | n/a | Requested terminal evidence | Not captured | Manual capture required; use the passing build command in `FINAL_TEST_REPORT.md`. |
| `33-backend-tests-terminal.png` | Backend test terminal | n/a | n/a | Requested terminal evidence | Not captured | Manual capture required; use the 360/360 test run. |
| `34-vision-tests-terminal.png` | Vision tests terminal | n/a | n/a | Requested terminal evidence | Not captured | Manual capture required; use the production Vision Auto gate. |
