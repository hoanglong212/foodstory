# FoodStory Final Demonstration Script (12 minutes)

## 0:00–0:45 — Introduction

Introduce FoodStory as a Vue 3/Express/MySQL food-discovery platform that evolved across three stages. State that final claims are backed by current source, tests and screenshots, while Stage 1 static evidence is identified as historical.

## 0:45–2:00 — Stage 1 evolution

Show Home in light/dark modes, responsive navigation, About, and the food-mood selection. Then open News and explain that the final list now comes from the Guardian through an Express proxy; the original static news data is historical evidence only.

## 2:00–4:00 — Recipe ecosystem

Open Recipes, demonstrate search/filter/pagination, and enter a Recipe Detail. Point out ingredients, instructions, notes and nutrition. As a user, rate, comment, favourite and generate a checklist; briefly show persistence in Profile.

## 4:00–5:00 — Authentication and roles

Show registration validation, login/session restoration and a protected user page. Switch to the admin account, show the dashboard, pending moderation, approval/rejection controls and recipe CRUD. Mention that backend authorization—not only Vue routing—enforces roles.

## 5:00–6:30 — Real-time interaction

Open the same recipe in two independent sessions. Post a comment as User A and show it arriving for User B without refresh. Edit and delete it, then update a rating and show the aggregate changing. Explain database-first broadcast, owner checks, client de-duplication and the per-user rating unique constraint.

## 6:30–8:00 — Food Map personalization

Show the guest preview, then the authenticated map. Demonstrate local restaurant markers, clustering, filters, focus, map origin and a personal saved place. Explain that external candidates are visually distinct and require user review.

## 8:00–9:45 — Vision Auto and dish-first discovery

Open Dish Vision and paste a public YouTube URL. Explain `useVisionAuto`: request cancellation, progress, retry, stale-run protection and unmount cleanup. Use either a previously verified deterministic fixture or a provider-configured example. Show dish candidates, select one, then show local/external serving-place candidates. Explicitly state that these alternatives are not claimed as the original filming location.

## 9:45–10:30 — Safe uncertainty

Show the insufficient-evidence and provider-unavailable states. Explain that weak OCR/ASR/metadata evidence remains review-only and that FoodStory prefers an honest not-found result over an invented restaurant or address.

## 10:30–11:15 — Safe live-coding segment

In `frontend/src/composables/useVisionAuto.js`, add a small computed progress label derived only from the existing state, for example mapping `dish_analyzing` to “Identifying dish” and `dish_searching` to “Finding serving places”. Add one unit assertion for the mapping. Do not change provider calls, evidence gates, result status, cancellation, or place resolution. Run the focused frontend test and build, then revert the demonstration-only edit unless it is intended for submission.

## 11:15–12:00 — Tests and conclusion

Show `FINAL_TEST_REPORT.md`: frontend 19/19, backend 360/360, API 87/87, real-time 4/4, Track 2 V3 75/75, Vision reliability 31/31, adapter 25/25, AI 4/4 and database 5/5. End with known limitations: provider quota, YouTube-only async jobs, process-local queue/rooms, and CPU/GPU model differences.

## Demo safeguards

- Use seeded test accounts and temporary records; remove them afterward.
- Never open `.env`, service-account files, network authorization headers or provider consoles on screen.
- Label fixtures as deterministic fixtures.
- If a live provider fails, show the real graceful failure and continue with the deterministic example.
- Do not tune safety thresholds or promote review-only evidence during the demo.
