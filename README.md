# RepoInsight

RepoInsight is a full-stack GitHub analysis app with a React + Vite frontend and an Express backend. It supports profile analysis, repository insights, OAuth login (GitHub/Google), and subscription/billing workflows.

## Monorepo Structure

```text
RepoInsight/
├─ api/                  # Vercel serverless entrypoints
├─ backend/              # Express API and OAuth logic
├─ frontend/             # React + Vite dashboard
├─ netlify.toml          # Netlify frontend build config
├─ vercel.json           # Vercel route config
└─ package.json          # root scripts (runs both apps in dev)
```

## Features

- GitHub user search and profile analysis.
- Repository insights: stars, forks, languages, activity trends.
- OAuth login via GitHub and Google.
- Auth-aware UI with profile menu and history.
- Billing plan endpoints and Stripe checkout/webhook integration.

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

Run both apps from root:

```bash
npm run dev
```

Or run separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## Scripts

- Root: `npm run dev`, `npm run dev:backend`, `npm run dev:frontend`
- Backend: `npm run dev`, `npm start`
- Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`

## Environment Setup

Backend `.env` should include at minimum:

- `FRONTEND_URL=http://localhost:5173`
- `BACKEND_URL=http://localhost:5000`
- `MONGO_URI=...` (recommended for persistent subscription data)
- `GITHUB_CLIENT_ID=...`
- `GITHUB_CLIENT_SECRET=...`
- `GITHUB_CALLBACK_URL=http://localhost:5000/auth/github/callback`

Frontend env:

- `VITE_API_BASE_URL=http://localhost:5000`

## Auth + Session Configuration (Important)

For OAuth login to persist correctly in production (frontend and backend on different domains), use cross-site cookie-safe settings.

Backend requirements:

- CORS must allow credentials:

```js
app.use(
	cors({
		origin: FRONTEND_URL,
		credentials: true,
	})
);
```

- Auth cookie must be cross-site compatible in production:

```js
const COOKIE_OPTIONS = {
	path: "/",
	sameSite: "none",
	secure: process.env.NODE_ENV === "production",
};
```

Frontend requirements:

- Always call auth endpoints with credentials enabled:

```js
axios.get(`${API_BASE_URL}/auth/me`, { withCredentials: true });
```

or

```js
fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
```

## Docs

- Backend API and deployment details: [backend/README.md](backend/README.md)
- Frontend UI and OAuth behavior: [frontend/README.md](frontend/README.md)

## Deployment Notes

### Frontend (Netlify)

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Required env: `VITE_API_BASE_URL=<your-backend-url>`

### Backend (Vercel/Railway/Render/etc.)

- Set required OAuth and Stripe env vars.
- Set `FRONTEND_URL` to deployed frontend URL.
- Set `BACKEND_URL` to deployed backend URL.
- Set `GITHUB_CALLBACK_URL` to exact callback registered in GitHub OAuth app.
- Use MongoDB (`MONGO_URI`) for durable subscription storage.

### OAuth Reliability

- Backend now exposes `GET /auth/me` so frontend can re-sync logged-in user state after OAuth redirect.
- Backend exposes `POST /auth/logout` to clear server cookie explicitly.
- Frontend should call `GET /auth/me` on app load (or immediately after OAuth redirect) to hydrate authenticated user state.

## Troubleshooting: Login Success But Profile Missing

If OAuth shows success but profile UI is empty, session cookie is usually not being sent.

Check in this order:

1. Confirm `/auth/me` returns user:

```js
fetch("https://YOUR_BACKEND_URL/auth/me", { credentials: "include" })
	.then((res) => res.json())
	.then(console.log);
```

2. Verify cookie flags on backend auth cookie:
- `sameSite: "none"`
- `secure: true` in production

3. Verify backend CORS:
- `origin` is exact frontend URL
- `credentials: true`

4. Verify frontend request config:
- `withCredentials: true` (axios)
- `credentials: "include"` (fetch)
