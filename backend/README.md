# Backend

Express API used by the frontend dashboard. It proxies GitHub requests, handles OAuth flows, session cookies, and billing endpoints.

## Quick Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Run in development:

```bash
npm run dev
```

3. Production start:

```bash
npm start
```

By default the server listens on `http://localhost:5000`.

## Required Environment Variables

Create `backend/.env` with at least:

- `FRONTEND_URL` (e.g. `http://localhost:5173`)
- `BACKEND_URL` (e.g. `http://localhost:5000`)
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `JWT_SECRET`

Optional / production:

- `MONGO_URI` (recommended for persistent subscriptions)
- `GITHUB_TOKEN` (improves GitHub rate limits)
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_TEAM_MONTHLY`
- Email: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `EMAIL_SECURE`

If `MONGO_URI` is not provided, subscription state falls back to ephemeral in-memory storage.

## Main Routes (summary)

- Auth: `/auth/github`, `/auth/google`, `/auth/me`, `/auth/logout`
- GitHub data: `/api/github/:username`, `/api/github/:username/repos`, `/api/github/:username/languages`, `/api/github/:username/insights`, `/api/github/search/users`
- Billing: `/api/billing/*` (plans, subscription, checkout, cancel, resume, stripe webhook)

See the code for detailed request/response shapes.

## Deployment Notes

- Configure all required env vars on your host.
- Ensure OAuth callback URLs registered in GitHub/Google match your deployed `BACKEND_URL` + `/auth/*` callbacks.

## Troubleshooting

- If login appears successful but UI shows signed out, verify `GET /auth/me` and cookie delivery.
- For GitHub rate limits, set `GITHUB_TOKEN` on the backend host.
