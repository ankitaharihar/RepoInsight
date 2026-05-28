# Frontend

React + Vite frontend for RepoInsight. Renders the dashboard UI and calls the backend API for data and auth.

## Quick Setup

1. Install dependencies and run:

```bash
cd frontend
npm install
npm run dev
```

2. Build for production:

```bash
npm run build
npm run preview
```

## Environment

Set `VITE_API_BASE_URL` in `frontend/.env` to your backend origin (default `http://localhost:5000`).

Optional: set `GITHUB_TOKEN` in the Netlify site settings to improve search suggestions and reduce rate-limiting.

## Key Files

- Main app: [src/App.jsx](src/App.jsx)
- Charts: [src/components/Charts.jsx](src/components/Charts.jsx)
- File browser: [src/components/FileExplorer.jsx](src/components/FileExplorer.jsx) and [src/components/RepoModal.jsx](src/components/RepoModal.jsx)

## Netlify Deployment

1. Connect the repo to Netlify.
2. Base directory: `frontend`
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Set `VITE_API_BASE_URL` in Netlify environment variables to your deployed backend URL.

## Troubleshooting

- If login appears to succeed but UI remains signed out, confirm `GET /auth/me` returns the authenticated user and cookies are delivered.
- If suggestions are limited, add `GITHUB_TOKEN` to Netlify env.
