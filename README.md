# RepoInsight - Github Profile Analysis

RepoInsight is a full-stack GitHub analytics dashboard composed of a React + Vite frontend and an Express backend. It provides OAuth login, repository/profile analytics, charts, and optional billing via Stripe.

## Quick Start

1. Install dependencies for root, backend, and frontend:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

2. Start both apps (from repository root):

```bash
npm run dev
```

3. Open the frontend at `http://localhost:5173` and the backend at `http://localhost:5000`.

## Repo Layout

See the component READMEs for details:

- Backend: [Backend README](backend/README.md)
- Frontend: [Frontend README](frontend/README.md)

## Scripts

- `npm run dev` — start both frontend and backend for development
- `npm run dev:backend` — run backend only
- `npm run dev:frontend` — run frontend only

Check `backend/package.json` and `frontend/package.json` for additional scripts.

## Environment (development)

Create `.env` files for each service when required.

- Backend (`backend/.env`): set `FRONTEND_URL`, `BACKEND_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`, and optional `MONGO_URI`, `GITHUB_TOKEN`, and Stripe keys.
- Frontend (`frontend/.env`): set `VITE_API_BASE_URL` to your backend origin (default `http://localhost:5000`).

## Deployment

Typical deployment flow:

- Deploy backend to your chosen host (Railway, Render, Vercel, etc.) and set required env vars.
- Deploy frontend to Netlify (or similar). For Netlify use `frontend` as base directory and `npm run build` as build command. Set `VITE_API_BASE_URL` to the deployed backend URL.

## Contributing

Open an issue or submit a PR. Please run lints and basic tests before opening a PR.

## License

MIT
