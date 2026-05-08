# RepoInsight - Github Profile Analysis

RepoInsight is a full-stack GitHub analytics app with a React (Vite) frontend and an Express backend. It supports OAuth login, profile and repository analysis, activity/insight endpoints, and subscription flows (including Stripe checkout/webhooks).

## Project Structure

```text
RepoInsight/
├─ api/                       # Serverless entrypoints (Vercel)
│  ├─ index.js                # Uses backend Express app
│  ├─ github.js               # Lightweight profile proxy
│  ├─ repos.js                # Lightweight repos proxy
│  └─ user.js                 # Lightweight user search proxy
├─ backend/                   # Main Express API
│  ├─ server.js
│  └─ README.md
├─ frontend/                  # React + Vite app
│  ├─ src/
│  ├─ netlify/functions/      # Netlify helper functions
│  └─ README.md
├─ netlify.toml
├─ vercel.json
└─ package.json               # Root dev scripts
```

## Key Features

- OAuth login with GitHub and Google via backend auth routes.
- Bearer token based frontend session sync (`token` returned on OAuth callback).
- GitHub profile and repository analytics with filters, sorting, and charts.
- User search suggestions with backend and direct GitHub fallback.
- Insights endpoints for activity windows, language breakdown, and top repositories.
- Billing plan endpoints and Stripe checkout/subscription lifecycle handlers.

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

## Run Locally

Start both frontend and backend from the repository root:

```bash
npm run dev
```

Or run each app separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Default development URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## Available Scripts

- Root:
  - `npm run dev`
  - `npm run dev:backend`
  - `npm run dev:frontend`
- Backend:
  - `npm run dev`
  - `npm start`
- Frontend:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm run lint`

## Environment Variables

### Backend (`backend/.env`)

Core values:

- `FRONTEND_URL=http://localhost:5173`
- `BACKEND_URL=http://localhost:5000`
- `JWT_SECRET=your-secret`
- `MONGO_URI=...` (recommended for persistent subscriptions)
- `GITHUB_TOKEN=...` (recommended to reduce rate-limit issues)

OAuth values:

- `GITHUB_CLIENT_ID=...`
- `GITHUB_CLIENT_SECRET=...`
- `GITHUB_CALLBACK_URL=http://localhost:5000/auth/github/callback` (optional; auto-derived if omitted)
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`

Stripe values (only if billing is enabled):

- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `STRIPE_PRICE_PRO_MONTHLY=...`
- `STRIPE_PRICE_TEAM_MONTHLY=...`

Email notification values (optional):

- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `EMAIL_SECURE`

### Frontend (`frontend/.env`)

- `VITE_API_BASE_URL=http://localhost:5000`

## API Summary

Main backend routes include:

- Auth:
  - `GET /auth/config`
  - `GET /auth/me`
  - `POST /auth/logout`
  - `GET /auth/github`
  - `GET /auth/google`
  - `GET /auth/github/callback`
  - `GET /auth/google/callback`
- GitHub data:
  - `GET /api/github/search/users`
  - `GET /api/github/:username`
  - `GET /api/github/:username/repos`
  - `GET /api/github/:username/activity`
  - `GET /api/github/:username/languages`
  - `GET /api/github/:username/insights`
- Compatibility routes:
  - `GET /api/github?username=...`
  - `GET /api/repos?username=...`
  - `GET /api/user?q=...`
- Billing:
  - `GET /api/billing/plans`
  - `GET /api/billing/subscription`
  - `POST /api/billing/subscription`
  - `POST /api/billing/checkout-session`
  - `POST /api/billing/subscription/cancel`
  - `POST /api/billing/subscription/resume`
  - `POST /api/billing/stripe/webhook`

## Deployment Notes

### Frontend (Netlify)

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Required env var: `VITE_API_BASE_URL=<deployed-backend-url>`

Optional Netlify function env var for better search-user reliability:

- `GITHUB_TOKEN=<token>`

### Backend (Vercel/Railway/Render/etc.)

- Configure all required env vars from the backend section above.
- Set `FRONTEND_URL` to your deployed frontend origin.
- Set `BACKEND_URL` to deployed backend origin if you do not want auto-derivation.
- Ensure OAuth callback URLs in GitHub/Google apps exactly match deployed callback URLs.

## Troubleshooting

### `concurrently` not found when running root dev command

Run this at repository root:

```bash
npm install
```

### Login succeeds but app still appears signed out

- Verify OAuth callback includes a `token` query param.
- Verify the frontend can call `GET /auth/me` on `VITE_API_BASE_URL`.
- Confirm `JWT_SECRET` is set and stable in backend environment.

### GitHub rate-limit issues

- Set `GITHUB_TOKEN` on backend.
- For Netlify search function fallback, also set `GITHUB_TOKEN` in Netlify env vars.

## Additional Docs

- Backend details: [backend/README.md](backend/README.md)
- Frontend details: [frontend/README.md](frontend/README.md)
