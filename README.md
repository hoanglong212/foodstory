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

Create the MySQL database with `backend/database/schema.sql`, seed recipes with `backend/database/seed.sql`, create hashed users with `npm run seed:users`, and migrate Stage 1 news with `npm run migrate:news`.

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
