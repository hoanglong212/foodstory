# FoodStory API Testing README

## 1. Purpose

This document verifies the actual FoodStory Stage 2 backend APIs implemented in the Express route files. It covers Auth, News, Recipes, Ratings, Comments, Favorites, Checklist/Profile data, and Health. Stage 3 Food Spots/FoodMap APIs are not required for Stage 2 and were not marked as missing.

Last verified: 2026-06-02.

## 2. Prerequisites

- Node.js 18+.
- MySQL running locally.
- Backend `.env` configured in `backend/.env`.
- Database schema from `backend/database/schema.sql`.
- Seed recipe/category/tag data from `backend/database/seed.sql`.
- Seed users from `npm run seed:users`.
- Migrated news data from `npm run migrate:news`.
- Backend running on `http://localhost:3000`.
- Frontend is not required for API tests, but can run on `http://localhost:5173`.

The local backend `.env` must point to a valid MySQL user/password. A malformed DB password caused DB-backed API routes to return 500 during testing; correcting the local `.env` and restarting the backend fixed it.

## 3. Setup Commands

```bash
cd backend
npm install
copy .env.example .env
```

Create/import the database:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p foodstory < database/seed.sql
npm run seed:users
npm run migrate:news
```

No `npm run migrate:indexes` script currently exists. If your database was created before indexes were added to `schema.sql`, add those indexes manually or recreate the database from the latest schema.

Start the backend:

```bash
npm run dev
```

Or:

```bash
npm start
```

## 4. Test Credentials

- Admin: `admin@foodstory.test` / `Admin123!`
- User: `long@foodstory.test` / `User123!`

## 5. Authentication Flow

Login returns a JWT token and safe user object. Protected endpoints require:

```http
Authorization: Bearer <TOKEN>
```

Admin endpoints require an authenticated user with `role: "admin"`.

Example login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@foodstory.test\",\"password\":\"Admin123!\"}"
```

## 6. API Endpoint Table

| Method | URL | Auth | Role | Request body | Success response | Error responses | Test status | Notes |
|---|---|---:|---|---|---|---|---|---|
| GET | `/api/health` | No | Public | None | `200 { status, service }` | `404` unknown route | Pass | Health only; no DB check |
| POST | `/api/auth/register` | No | Public | `username,email,password` | `201 { user }` | `400`, `409` | Pass | Password hashed with bcrypt |
| POST | `/api/auth/login` | No | Public | `email,password` | `200 { token, user }` | `400`, `401` | Pass | JWT expires per env, default 2h |
| POST | `/api/auth/logout` | Yes | User/Admin | None | `200 { message }` | `401` | Pass | JWT logout is client-side in practice |
| GET | `/api/auth/me` | Yes | User/Admin | None | `200 { user }` | `401` | Pass | Does not expose password hash |
| GET | `/api/news/categories` | No | Public | None | `200 { categories }` | `500` on DB failure | Pass | Actual route discovered in code |
| GET | `/api/news` | No | Public | Query: `page,pageSize,search,category,date` | `200 { items,currentPage,totalPages,totalItems,categories }` | `400` invalid date/filter | Pass | MySQL-backed Stage 1 news |
| GET | `/api/news/:id` | No | Public | Path id | `200 { item }` | `400`, `404` | Pass | Invalid ID handled |
| GET | `/api/recipes/meta` | No | Public | None | `200 { categories,tags }` | `500` on DB failure | Pass | Used by admin form/filter UI |
| GET | `/api/recipes` | Optional | Public/User | Query: `page,pageSize,search,category,tag,includeMeta` | `200 { items,currentPage,totalPages,totalItems,categories,tags }` | `400` long filters | Pass | Auth adds user favorite/rating context |
| GET | `/api/recipes/:id` | Optional | Public/User | Path id | `200 { recipe }` | `400`, `404` | Pass | Includes ingredients/tags/comments |
| POST | `/api/recipes` | Yes | Admin | Recipe payload | `201 { recipe }` | `400`, `401`, `403` | Pass | Admin-only create |
| PUT | `/api/recipes/:id` | Yes | Admin | Recipe payload | `200 { recipe }` | `400`, `401`, `403`, `404` | Pass | Admin-only update |
| DELETE | `/api/recipes/:id` | Yes | Admin | None | `200 { message }` | `400`, `401`, `403`, `404` | Pass | Cascades dependent data |
| POST | `/api/recipes/:id/rating` | Yes | User/Admin | `rating_value` | `200 { current_user_rating, average_rating,total_ratings }` | `400`, `401`, `404` | Pass | Duplicate rating updates existing row |
| GET | `/api/comments/user` | Yes | User/Admin | None | `200 { items }` | `401` | Pass | Profile comment history |
| POST | `/api/recipes/:id/comments` | Yes | User/Admin | `content` | `201 { comment }` | `400`, `401`, `404` | Pass | Minimum 5 characters |
| PUT | `/api/comments/:id` | Yes | Owner | `content` | `200 { comment }` | `400`, `401`, `403`, `404` | Pass | Owner-only edit |
| DELETE | `/api/comments/:id` | Yes | Owner | None | `200 { message }` | `400`, `401`, `403`, `404` | Pass | Owner-only delete |
| GET | `/api/favorites` | Yes | User/Admin | None | `200 { items }` | `401` | Pass | Profile favorites |
| POST | `/api/favorites/:recipeId` | Yes | User/Admin | None | `201 { message }` | `400`, `401`, `404` | Pass | Duplicate prevented by primary key/`INSERT IGNORE` |
| DELETE | `/api/favorites/:recipeId` | Yes | User/Admin | None | `200 { message }` | `400`, `401` | Pass | Idempotent delete behavior |
| GET | `/api/checklists` | Yes | User/Admin | None | `200 { items }` | `401` | Pass | Profile checklist summaries |
| POST | `/api/checklists` | Yes | User/Admin | `recipe_id` | `201 { checklist }` | `400`, `401`, `404` | Pass | Generated from recipe ingredients |
| GET | `/api/checklists/:recipeId` | Yes | Owner | Path recipe id | `200 { checklist }` | `400`, `401`, `404` | Pass | Other users receive 404 |
| PATCH | `/api/checklist-items/:id` | Yes | Owner | None | `200 { id,is_checked }` | `400`, `401`, `404` | Pass | Other users receive 404 |

Total actual endpoints discovered: 26.

## 7. Detailed API Test Cases

The automated script ran 79 test cases. All expected and actual statuses matched.

### Health

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Health check | `GET /api/health` | 200 | 200 | Pass | Service responds |

### Auth

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Register invalid email | `POST /api/auth/register` | 400 | 400 | Pass | Clear validation error |
| Register short password | `POST /api/auth/register` | 400 | 400 | Pass | Password min length enforced |
| Login missing password | `POST /api/auth/login` | 400 | 400 | Pass | Required field enforced |
| Login bad credentials | `POST /api/auth/login` | 401 | 401 | Pass | No raw error |
| Login admin success | `POST /api/auth/login` | 200 | 200 | Pass | Admin token issued |
| Login user success | `POST /api/auth/login` | 200 | 200 | Pass | User token issued |
| Me success | `GET /api/auth/me` | 200 | 200 | Pass | Safe user returned |
| Me missing token | `GET /api/auth/me` | 401 | 401 | Pass | Protected |
| Me invalid token | `GET /api/auth/me` | 401 | 401 | Pass | No crash |
| Logout success | `POST /api/auth/logout` | 200 | 200 | Pass | Token required |
| Logout missing token | `POST /api/auth/logout` | 401 | 401 | Pass | Protected |

### News

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| News list | `GET /api/news?page=1&pageSize=2` | 200 | 200 | Pass | Paginated |
| News categories | `GET /api/news/categories` | 200 | 200 | Pass | Category array |
| News filters | `GET /api/news?search=a&category=all` | 200 | 200 | Pass | Search/filter accepted |
| News invalid date | `GET /api/news?date=bad-date` | 400 | 400 | Pass | Validation |
| News detail | `GET /api/news/:id` | 200 | 200 | Pass | Existing item |
| News invalid id | `GET /api/news/not-a-number` | 400 | 400 | Pass | Validation |
| News not found | `GET /api/news/999999` | 404 | 404 | Pass | Not found |

### Recipes and Admin CRUD

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Recipe list | `GET /api/recipes?page=1&pageSize=2&includeMeta=1` | 200 | 200 | Pass | Paginated |
| Recipe filters | `GET /api/recipes?search=a&category=all&tag=all` | 200 | 200 | Pass | Server-side filters |
| Recipe meta | `GET /api/recipes/meta` | 200 | 200 | Pass | Categories/tags |
| Recipe detail | `GET /api/recipes/:id` | 200 | 200 | Pass | Existing recipe |
| Recipe invalid id | `GET /api/recipes/not-a-number` | 400 | 400 | Pass | Validation |
| Recipe not found | `GET /api/recipes/999999` | 404 | 404 | Pass | Not found |
| Create missing token | `POST /api/recipes` | 401 | 401 | Pass | Protected |
| Create invalid token | `POST /api/recipes` | 401 | 401 | Pass | No crash |
| Create forbidden user | `POST /api/recipes` | 403 | 403 | Pass | Admin-only |
| Create validation | `POST /api/recipes` empty body | 400 | 400 | Pass | Required fields |
| Create success | `POST /api/recipes` admin | 201 | 201 | Pass | Temp recipe created |
| Update missing token | `PUT /api/recipes/:id` | 401 | 401 | Pass | Protected |
| Update forbidden user | `PUT /api/recipes/:id` | 403 | 403 | Pass | Admin-only |
| Update invalid nutrition | `PUT /api/recipes/:id` | 400 | 400 | Pass | Nutrition validation |
| Update success | `PUT /api/recipes/:id` admin | 200 | 200 | Pass | Temp recipe updated |
| Update not found | `PUT /api/recipes/999999` | 404 | 404 | Pass | Not found |
| Delete missing token | `DELETE /api/recipes/:id` | 401 | 401 | Pass | Protected |
| Delete forbidden user | `DELETE /api/recipes/:id` | 403 | 403 | Pass | Admin-only |
| Delete success | `DELETE /api/recipes/:id` admin | 200 | 200 | Pass | Temp data cleaned |
| Delete not found | `DELETE /api/recipes/999999` | 404 | 404 | Pass | Not found |

### Ratings

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Rating missing token | `POST /api/recipes/:id/rating` | 401 | 401 | Pass | Protected |
| Rating invalid token | `POST /api/recipes/:id/rating` | 401 | 401 | Pass | No crash |
| Rating out of range | `POST /api/recipes/:id/rating` with `6` | 400 | 400 | Pass | 1-5 only |
| Rating create | `POST /api/recipes/:id/rating` with `4` | 200 | 200 | Pass | Created |
| Rating update duplicate | `POST /api/recipes/:id/rating` with `5` | 200 | 200 | Pass | Updates same row |

### Comments and Profile Comments

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Comment missing token | `POST /api/recipes/:id/comments` | 401 | 401 | Pass | Protected |
| Comment too short | `POST /api/recipes/:id/comments` | 400 | 400 | Pass | Minimum 5 chars |
| Comment create | `POST /api/recipes/:id/comments` | 201 | 201 | Pass | Created |
| Comment edit missing token | `PUT /api/comments/:id` | 401 | 401 | Pass | Protected |
| Comment edit other user | `PUT /api/comments/:id` as admin | 403 | 403 | Pass | Owner-only |
| Comment edit owner | `PUT /api/comments/:id` as user | 200 | 200 | Pass | Updated |
| Profile comments | `GET /api/comments/user` | 200 | 200 | Pass | Profile data |
| Profile comments missing token | `GET /api/comments/user` | 401 | 401 | Pass | Protected |
| Comment delete other user | `DELETE /api/comments/:id` as admin | 403 | 403 | Pass | Owner-only |
| Comment delete owner | `DELETE /api/comments/:id` as user | 200 | 200 | Pass | Deleted |
| Comment delete not found | `DELETE /api/comments/:id` after delete | 404 | 404 | Pass | Not found |

### Favorites

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Favorites missing token | `GET /api/favorites` | 401 | 401 | Pass | Protected |
| Favorites list | `GET /api/favorites` | 200 | 200 | Pass | Profile data |
| Favorite add missing token | `POST /api/favorites/:recipeId` | 401 | 401 | Pass | Protected |
| Favorite invalid id | `POST /api/favorites/not-a-number` | 400 | 400 | Pass | Validation |
| Favorite not found | `POST /api/favorites/999999` | 404 | 404 | Pass | Not found |
| Favorite add | `POST /api/favorites/:recipeId` | 201 | 201 | Pass | Saved |
| Favorite duplicate | `POST /api/favorites/:recipeId` again | 201 | 201 | Pass | No duplicate row |
| Favorite no duplicate in list | `GET /api/favorites` | 200 | 200 | Pass | Count is one |
| Favorite remove missing token | `DELETE /api/favorites/:recipeId` | 401 | 401 | Pass | Protected |
| Favorite remove | `DELETE /api/favorites/:recipeId` | 200 | 200 | Pass | Removed |
| Favorite removed from list | `GET /api/favorites` | 200 | 200 | Pass | Not present |

### Checklist and Profile Checklists

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Checklist generate missing token | `POST /api/checklists` | 401 | 401 | Pass | Protected |
| Checklist invalid recipe id | `POST /api/checklists` | 400 | 400 | Pass | Validation |
| Checklist recipe not found | `POST /api/checklists` | 404 | 404 | Pass | Not found |
| Checklist generate | `POST /api/checklists` | 201 | 201 | Pass | Items from ingredients |
| Checklist profile list | `GET /api/checklists` | 200 | 200 | Pass | Profile data |
| Checklist profile missing token | `GET /api/checklists` | 401 | 401 | Pass | Protected |
| Checklist get by recipe | `GET /api/checklists/:recipeId` | 200 | 200 | Pass | Owner gets list |
| Checklist get missing token | `GET /api/checklists/:recipeId` | 401 | 401 | Pass | Protected |
| Checklist owner isolation | `GET /api/checklists/:recipeId` as other user | 404 | 404 | Pass | Access hidden |
| Checklist toggle missing token | `PATCH /api/checklist-items/:id` | 401 | 401 | Pass | Protected |
| Checklist toggle other user | `PATCH /api/checklist-items/:id` as other user | 404 | 404 | Pass | Access hidden |
| Checklist toggle owner | `PATCH /api/checklist-items/:id` | 200 | 200 | Pass | Boolean changed |

### Unknown Routes

| Test name | Request | Expected | Actual | Result | Notes |
|---|---|---:|---:|---|---|
| Unknown route | `GET /api/does-not-exist` | 404 | 404 | Pass | JSON error |

## 8. Curl Examples

Set base URL:

```bash
API=http://localhost:3000/api
```

Register:

```bash
curl -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"newuser\",\"email\":\"newuser@example.test\",\"password\":\"Password123!\"}"
```

Login:

```bash
curl -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"long@foodstory.test\",\"password\":\"User123!\"}"
```

Use token:

```bash
TOKEN=replace_with_login_token
curl "$API/auth/me" -H "Authorization: Bearer $TOKEN"
```

Get recipes:

```bash
curl "$API/recipes?page=1&pageSize=6&search=pho&category=all&tag=all"
```

Get recipe detail:

```bash
curl "$API/recipes/1"
```

Admin create recipe:

```bash
ADMIN_TOKEN=replace_with_admin_token
curl -X POST "$API/recipes" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Recipe\",\"category_id\":1,\"image_url\":\"https://example.com/recipe.jpg\",\"description\":\"Test\",\"instructions\":\"Cook it.\",\"calories\":100,\"protein\":5,\"carbs\":15,\"fat\":2,\"ingredients\":[{\"ingredient_name\":\"Rice\",\"quantity\":\"1 cup\"}],\"tags\":[1]}"
```

Admin update recipe:

```bash
curl -X PUT "$API/recipes/RECIPE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Updated Recipe\",\"category_id\":1,\"image_url\":\"https://example.com/recipe.jpg\",\"description\":\"Updated\",\"instructions\":\"Cook it again.\",\"calories\":120,\"protein\":6,\"carbs\":16,\"fat\":3,\"ingredients\":[{\"ingredient_name\":\"Rice\",\"quantity\":\"1 cup\"}],\"tags\":[1]}"
```

Admin delete recipe:

```bash
curl -X DELETE "$API/recipes/RECIPE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Add rating:

```bash
curl -X POST "$API/recipes/1/rating" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"rating_value\":5}"
```

Add comment:

```bash
curl -X POST "$API/recipes/1/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"This recipe worked well.\"}"
```

Edit comment:

```bash
curl -X PUT "$API/comments/COMMENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"Updated comment text.\"}"
```

Delete comment:

```bash
curl -X DELETE "$API/comments/COMMENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Add favorite:

```bash
curl -X POST "$API/favorites/1" \
  -H "Authorization: Bearer $TOKEN"
```

Remove favorite:

```bash
curl -X DELETE "$API/favorites/1" \
  -H "Authorization: Bearer $TOKEN"
```

Generate checklist:

```bash
curl -X POST "$API/checklists" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"recipe_id\":1}"
```

Toggle checklist item:

```bash
curl -X PATCH "$API/checklist-items/CHECKLIST_ITEM_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## 9. Automated Test Script

Script path:

```text
backend/scripts/apiSmokeTest.js
```

Run:

```bash
cd backend
npm run test:api
```

Optional environment variables:

```bash
API_BASE_URL=http://localhost:3000/api
ADMIN_EMAIL=admin@foodstory.test
ADMIN_PASSWORD=Admin123!
USER_EMAIL=long@foodstory.test
USER_PASSWORD=User123!
```

What it tests:

- Public health/news/recipe endpoints.
- Auth validation, login, logout, `/me`.
- Missing-token and invalid-token paths.
- Admin-only recipe create/update/delete.
- User forbidden from admin APIs.
- Recipe validation and not-found cases.
- Rating create and duplicate update.
- Comment create/edit/delete and owner-only checks.
- Favorite add/remove and duplicate prevention.
- Checklist generation, owner isolation, and item toggle.
- Unknown API route JSON 404.

Expected output:

```text
API smoke test complete: 79/79 passed, 0 failed.
```

The script creates a temporary recipe as admin, interacts with it as the normal user, and deletes it at the end. Dependent ratings/comments/favorites/checklists are cleaned through database cascade or explicit delete.

## 10. Known Limitations

- Stage 3 Food Spots/FoodMap APIs are not implemented and are not required for Stage 2.
- TheMealDB Daily Inspiration is a frontend-only external API call and is not written to MySQL.
- `GET /api/health` verifies the Express server only; it does not verify MySQL connectivity.
- `DELETE /api/favorites/:recipeId` returns success even if the favorite did not exist. This is acceptable idempotent behavior, but it is worth documenting.
- There is no dedicated profile endpoint. Profile data is assembled from `/api/auth/me`, `/api/favorites`, `/api/comments/user`, and `/api/checklists`.
- No `migrate:indexes` command exists. Existing databases may need manual index migration if they predate the latest schema.

## 11. Final API Readiness Summary

- Total actual endpoints discovered: 26.
- Total automated test cases: 79.
- Passed: 79.
- Partial: 0.
- Failed: 0.
- Critical issues fixed during testing: local backend `.env` DB password formatting was corrected so DB-backed endpoints no longer return 500.
- Remaining risks: keep `.env` out of source control and ensure MySQL schema/seed data are applied before running tests.
