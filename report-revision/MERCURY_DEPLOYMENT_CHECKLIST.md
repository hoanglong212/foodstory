# Mercury Deployment Readiness Checklist

Audit date: 20 July 2026. This is readiness evidence, not a claim that Mercury deployment occurred.

| Check | Status | Evidence / next action |
|---|---|---|
| Production frontend build | VERIFIED | `frontend: npm.cmd run build` passed; Vite 8.1.4, 159 modules, built in 4.46 s. |
| Production backend syntax/start entry | PARTIAL | `node --check server.js` passed and `backend/package.json` defines `start: node server.js`. A production start was not run because it could consume existing local DB/provider credentials without explicit permission. |
| Environment examples | VERIFIED | Root, frontend, backend, and AI service examples exist. |
| Production API base URL | ACTION REQUIRED | `frontend/.env.example` defaults to `http://localhost:3000/api`; set `VITE_API_BASE_URL` to the Mercury HTTPS backend `/api` URL before building. |
| Production WebSocket URL | ACTION REQUIRED | `frontend/.env.example` defaults to `ws://localhost:3000`; set `VITE_WS_URL` to the Mercury `wss://` endpoint. |
| Deep-link refresh | NOT VERIFIED | Configure SPA fallback to `index.html`, then directly refresh `/recipes`, `/food-map`, `/profile`, and `/admin`. No Mercury host was supplied. |
| Guest route | VERIFIED IN CODE/TEST | `/food-map` has `guestPreview: true`; frontend route suite passed. Verify deployed direct navigation. |
| User route | VERIFIED IN CODE | `/profile`, favourites, and checklists require auth. Live deployed auth was not exercised. |
| Admin route | VERIFIED IN CODE | `/admin` and admin recipe routes require auth/admin metadata. Live RBAC was not exercised. |
| News proxy | PARTIAL | Backend exposes `/api/news/external` through server-side Guardian integration. Live provider execution not run. Verify category, timeout, and missing-key behaviour on Mercury. |
| WebSocket server | VERIFIED IN CODE | Backend initialises `WebSocketServer` on the HTTP server; frontend uses `VITE_WS_URL`. Live Mercury upgrade/proxy not verified. |
| Food Map route/build | VERIFIED | Route test and production build passed. Live tiles, stores, and responsive interaction require deployed browser QA. |
| Vision Auto provider unavailable | VERIFIED BY TEST | Provider gating and safe `not_found`/`provider_unavailable` adaptation tests passed. Live provider not invoked. |
| Vision Auto asynchronous jobs | VERIFIED BY TEST | Reliability suite 31/31; adapter boundary 25/25; safe-contract script passed. |
| Track 2 V3 bounded behaviour | VERIFIED BY TEST | Selected complete suite passed 75/75. |
| Secrets excluded | VERIFIED FOR TRACKING | Only `.env.example` files are tracked. Root/backend/frontend/AI `.env` paths are ignored. No secret values were opened or copied. |

## Mercury configuration actions

- [ ] Set Node runtime compatible with the committed lockfiles.
- [ ] Build frontend with production `VITE_API_BASE_URL` and `VITE_WS_URL`.
- [ ] Serve `frontend/dist` with SPA history fallback and immutable hashed assets.
- [ ] Run backend with `NODE_ENV=production` and an explicit `PORT`.
- [ ] Configure trusted frontend origin(s) for HTTP and WebSocket access.
- [ ] Terminate TLS and proxy WebSocket upgrade headers.
- [ ] Configure the production database using Mercury secrets, never committed files.
- [ ] Keep Vision Auto and Track 2 provider flags disabled unless required binaries/keys and readiness checks pass.
- [ ] Configure worker/media binaries and writable bounded temporary storage if Vision Auto is enabled.
- [ ] Configure Guardian and optional location/model keys only in server secrets.
- [ ] Confirm log redaction and avoid logging source tokens, request bodies, or credentials.
- [ ] Add health checks for the base API and Vision Auto readiness endpoint.

## Post-deployment smoke sequence

1. Open `/` and refresh directly.
2. Open `/food-map` as a guest and refresh directly.
3. Confirm API calls target the HTTPS Mercury backend, not localhost.
4. Sign in with a deployment-specific test account supplied by the student; do not use personal credentials.
5. Open `/profile` and confirm auth redirect/guard behaviour.
6. Use an authorised test admin account to verify `/admin` without exposing credentials.
7. Fetch internal news and one supported external news category; confirm provider errors are bounded.
8. Trigger a comment/rating flow and verify the browser uses `wss://` and receives one event without duplicate rendering.
9. Open Food Map on desktop and mobile; verify tiles, marker clusters, guest banner, import panel, and deep-link refresh.
10. With Vision providers intentionally disabled, verify the UI shows a safe provider-unavailable/not-found state and does not fabricate a place.
11. If providers are enabled, run readiness and a controlled public URL without claiming success until the actual result is observed.
12. Inspect deployed source maps, static files, and network responses for secret leakage.

## Deployment blockers

- No Mercury application URL, build/start contract, environment slot, proxy configuration, or test credentials were supplied.
- Live deep-link, News provider, WebSocket, database, authenticated routes, and Vision provider execution therefore remain student/deployment-operator tasks.
