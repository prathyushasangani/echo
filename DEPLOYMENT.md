# Deployment

## Frontend on GitHub Pages

This repo includes a GitHub Actions workflow that builds `frontend/` and deploys it to GitHub Pages.

Target project path:

```text
prathyushasangani.com/echo
```

For this path, rename the GitHub repository to:

```text
echo
```

Then open the repository on GitHub and set:

```text
Settings -> Pages -> Source -> GitHub Actions
```

## DNS

Do not add a DNS record for `echo.prathyushasangani.com` for this setup.

The `/echo` path works when `prathyushasangani.com` itself is already connected to GitHub Pages. If the main domain is not connected yet, configure the apex/root domain in the GitHub Pages site that owns `prathyushasangani.com`.

If you instead want the old subdomain setup, use:

```text
Type: CNAME
Name: echo
Value: prathyushasangani5.github.io
```

## Backend

GitHub Pages hosts only static frontend files. Echo's reminders, voice API, database, and scheduler need the Node backend running somewhere else, such as Render, Railway, Fly.io, or a VPS.

## Database Storage

Local development can still use `backend/agents.db`, but production should use hosted Postgres through `DATABASE_URL`.

Free hosted Postgres options:

```text
Neon
Supabase
Railway Postgres
```

Create a free Postgres database and add these backend environment variables wherever the backend is hosted:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
DATABASE_SSL=true
AUTH_SECRET=use-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
```

The first signed-up user becomes admin automatically on a fresh database. If an old database has no admin yet, sign in and use the one-time `Claim Admin` button.

After hosting the backend, add this GitHub repository variable:

```text
VITE_API_URL=https://your-backend-url
```

Then rerun the Pages workflow so the frontend connects to the hosted backend.
