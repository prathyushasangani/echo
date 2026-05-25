# Deployment

## Frontend on GitHub Pages

This repo includes a GitHub Actions workflow that builds `frontend/` and deploys it to GitHub Pages.

Custom domain:

```text
echo.prathyushasangani.com
```

After pushing to `main`, open the repository on GitHub and set:

```text
Settings -> Pages -> Source -> GitHub Actions
```

## DNS

In the DNS manager for `prathyushasangani.com`, add this record:

```text
Type: CNAME
Name: echo
Value: prathyushasangani5.github.io
```

If GitHub shows a different Pages target in repository settings, use that value instead.

## Backend

GitHub Pages hosts only static frontend files. Echo's reminders, voice API, database, and scheduler need the Node backend running somewhere else, such as Render, Railway, Fly.io, or a VPS.

After hosting the backend, add this GitHub repository variable:

```text
VITE_API_URL=https://your-backend-url
```

Then rerun the Pages workflow so the frontend connects to the hosted backend.
