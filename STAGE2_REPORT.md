# FoodStory Stage 2 Project Report

## 1. Main Functionality

FoodStory is extended from the Stage 1 Vue food discovery app into a full-stack recipe and news application. The original Home, News, About, NewsDetail, router, theme toggle, responsive layout, and local JSON news source are preserved, with news now migrated into a MySQL-backed API for Stage 2.

Implemented Stage 2 features:

- Register, login, logout, and current-user retrieval through JWT authentication.
- Role-based navigation and content visibility for guests, users, and admins.
- News loaded from the Express/MySQL API with server-side search, category/date filtering, pagination, loading, error, and empty states.
- Public recipe list and recipe detail pages with search, category/tag filters, server-side pagination, ingredients, instructions, and nutrition.
- Admin-only recipe create, edit, and delete through protected API routes.
- User rating system with one rating per user per recipe and update support.
- User comments with owner-only edit and delete.
- User favorites saved in MySQL and shown on the Profile page.
- Ingredient checklist generation from recipe ingredients, with persistent checked state.
- Nutrition doughnut chart using Chart.js.
- TheMealDB Daily Inspiration on the Home page with loading, error, and fallback behavior.
- Dark mode preference stored in `localStorage`.

The Stage 3 FoodMap/Leaflet feature is not implemented. Recipe detail includes only a disabled placeholder button for the future map feature.

## 2. Technical Components and Tools

- Vue 3 and Vite for the frontend application.
- Vue Router for public, authenticated, and admin-only routes.
- Pinia stores for authentication, recipes, favorites, checklists, and UI state.
- Axios for frontend API communication and JWT Authorization headers.
- Axios response interceptor for 401/session-expired handling.
- Bootstrap grid CSS plus existing responsive CSS for desktop, tablet, and mobile layouts.
- Chart.js doughnut chart for nutrition data.
- Custom Vue directive `v-permission` for role-based admin UI visibility.
- `v-bind`, `v-model`, `v-if`, `v-for`, and `v-on` across forms, filters, cards, ratings, comments, checklists, and pagination.
- Node.js and Express.js backend.
- MySQL persistent storage with `mysql2/promise`.
- JWT authentication with two-hour token lifetime.
- bcrypt password hashing with salt rounds 10.
- Parameterized SQL queries for all database access.
- CORS and dotenv configuration.
- Frontend `localStorage` only for JWT/current user and UI preferences.

## 3. Innovative or Unique Features

- FoodStory combines internal MySQL recipe data with external TheMealDB daily inspiration.
- A custom `v-permission` directive hides admin-only create/edit/delete actions unless the logged-in user has the admin role.
- News and recipes use server-side pagination instead of client-only slicing.
- Recipe detail includes nutrition macros rendered as a Chart.js doughnut chart.
- The ingredient checklist is generated from recipe ingredients and is user-specific.
- Social interaction is implemented through ratings, comments, and favorites.
- The app keeps Stage 1 pages while adding full-stack Stage 2 features.

## 4. Challenges and Solutions

- Challenge: Extending Stage 1 without breaking existing pages.
  Solution: Existing routes were preserved and new Stage 2 routes were added to the same router.
- Challenge: Migrating local JSON news into persistent storage.
  Solution: `backend/database/migrateNews.js` reads `src/data/news.json` and inserts news records into MySQL safely.
- Challenge: Authentication and token expiry.
  Solution: JWTs are stored on the frontend, attached by Axios, and cleared on 401 responses with a session-expired message.
- Challenge: Preventing unauthorized management actions.
  Solution: Admin-only recipe routes use JWT middleware plus `requireAdmin`, and the frontend uses route guards plus `v-permission`.
- Challenge: Preventing SQL injection.
  Solution: All backend routes use parameterized `pool.execute()` queries.
- Challenge: External API reliability.
  Solution: TheMealDB fetch include
- s loading, error, and fallback meal states.
- Challenge: Accessibility.
  Solution: Forms use real labels, `aria-invalid`, `aria-describedby`, inline validation errors, semantic buttons, descriptive image alt text, and keyboard-friendly controls.

## 5. Requirement Mapping

### Technical Requirements

- Vue components, router, and custom directives: `RecipeCard.vue`, `NutritionChart.vue`, router routes, and `v-permission`.
- Arrays and dynamic data handling: recipes, tags, ingredients, comments, checklist items, ratings, news items.
- Vue directives: `v-bind`, `v-model`, `v-if`, `v-for`, and `v-on` are used throughout forms, cards, filters, pagination, comments, ratings, and checklists.
- Form validation: Register, Login, RecipeForm, comments, ratings, and backend validation.
- Responsive design: Bootstrap grid and existing CSS media queries for desktop, tablet, and mobile.
- Accessibility: labels, error associations, semantic controls, descriptive alt text, and clear pagination labels.
- Coding conventions: modular backend routes, middleware, stores, services, views, and components.
- Methods and computed properties: Pinia actions, component methods, computed auth/recipe state.
- Pagination: API-backed news and recipes pagination.
- External source/API: TheMealDB Daily Inspiration.

### Functional Requirements

- Registration and login: `/api/auth/register`, `/api/auth/login`, `Register.vue`, `Login.vue`.
- Logout: `/api/auth/logout` and auth store logout action.
- Authenticated/unauthenticated visibility: App navigation, profile route, admin recipe buttons.
- Search and filters: News search/category/date and recipe search/category/tag.
- Like/vote/social feature: Ratings, comments, and favorites.
- Authorized CRUD: Admin-only recipe create/edit/delete.
- Persistent storage: MySQL for app data; `localStorage` for JWT/current user and dark mode.
- Unauthorized protection: backend JWT/admin middleware and frontend route guards.

## Setup and Test Credentials

Backend setup:

1. Create a MySQL database using `backend/database/schema.sql`.
2. Copy `backend/.env.example` to `backend/.env` and update database credentials and `JWT_SECRET`.
3. From `backend/`, run `npm install`.
4. Run `mysql -u root -p foodstory < database/seed.sql`.
5. Run `npm run seed:users` to create bcrypt-hashed test users.
6. Run `npm run migrate:news` to migrate Stage 1 news JSON to MySQL.
7. Run `npm run dev` or `npm start`.

Frontend setup:

1. Copy `.env.example` to `.env` if the API URL differs from `http://localhost:3000/api`.
2. Run `npm install`.
3. Run `npm run dev`.

Test credentials created by `npm run seed:users`:

- Admin: `admin@foodstory.test` / `Admin123!`
- User: `long@foodstory.test` / `User123!`

Security note: This project uses proper backend JWT and bcrypt for Stage 2, but it remains coursework code. Production deployment would require HTTPS, stronger secret management, refresh-token strategy, rate limiting, and more detailed audit logging.
