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

After hosting the backend, add this GitHub repository variable:

```text
VITE_API_URL=https://your-backend-url
```

Then rerun the Pages workflow so the frontend connects to the hosted backend.
