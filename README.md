# FoodStory

FoodStory is a Vue 3 + Vite food discovery application extended for COS30043 Stage 2 with an Express/MySQL API.

## Frontend

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Start MySQL, create the database with `backend/database/schema.sql`, seed recipes with `backend/database/seed.sql`, create hashed users with `npm run seed:users`, and migrate Stage 1 news with `npm run migrate:news`.

For an existing database, also apply new SQL files from `backend/migrations/`. On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd run dev`.

## API Testing

Run the Stage 2 API smoke test after MySQL is running and seeded:

```bash
cd backend
npm run test:api
```

The test logs in as admin/user, creates and deletes a temporary recipe, and verifies auth, news, recipes, ratings, comments, favorites, checklists, profile data endpoints, and error cases. See `API_TESTING_README.md` for the full endpoint table, curl examples, and test results.

## Test Credentials

- Admin: `admin@foodstory.test` / `Admin123!`
- User: `long@foodstory.test` / `User123!`

## Stage 2 Features

- Preserves Stage 1 Home, News, About, NewsDetail, router, search, pagination, theme toggle, and responsiveness.
- JWT login/register/logout using Express, MySQL, and bcrypt.
- API-backed news with server-side search, filters, and pagination.
- Recipe list/detail with search, filters, pagination, ratings, comments, favorites, ingredient checklists, and Chart.js nutrition chart.
- Admin-only recipe create, edit, and delete.
- TheMealDB Daily Inspiration external API section.
- Pinia stores, Axios interceptors, Bootstrap grid, and custom `v-permission` directive.

See `STAGE2_REPORT.md` for the full requirement mapping.
