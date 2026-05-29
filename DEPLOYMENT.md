# Deployment

Echo has two Firebase deployment modes:

```text
Project: echo-96caa
Public URLs:
  https://echo-96caa.web.app
  https://echo-96caa.firebaseapp.com
```

## Spark/free plan

The free Spark plan can deploy the static frontend to Firebase Hosting:

```bash
npm run deploy
```

This uses `firebase.spark.json` and deploys Hosting only. It does not deploy the Node/Express backend, `/api/**`, scheduled reminders, or server push delivery.

Because Spark cannot run the backend, the hosted Spark build has limited browser-only behavior. Voice/chat agent routes, server-side scheduled reminders, and reliable push delivery need a real Node web service.

## Vercel Full-Stack Hosting

Firebase Spark cannot run the Node backend. For a free hosted version with real `/api/**` routes, deploy to Vercel. This repo includes `vercel.json` and `api/index.js`.

Vercel deployment shape:

```text
Frontend: Vercel static output from frontend/dist
Backend: Vercel Node serverless function at api/index.js
/api/** and /health are rewritten to the backend function
```

Vercel project settings:

```text
Install command: npm run install:all
Build command: cd frontend && VITE_BACKEND_MODE=api npm run build
Output directory: frontend/dist
```

Required environment variables on Vercel:

```text
NODE_ENV=production
DATABASE_PROVIDER=firebase
FIREBASE_PROJECT_ID=echo-96caa
FIREBASE_SERVICE_ACCOUNT_JSON=your full Firebase service account JSON
AUTH_SECRET=use-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
ALLOW_PASSWORD_SIGNUP=true
NOTIFICATION_PROVIDER=push
VAPID_PUBLIC_KEY=your VAPID public key
VAPID_PRIVATE_KEY=your VAPID private key
VAPID_SUBJECT=mailto:your-email@example.com
WAKE_WORD_ENABLED=false
```

Vercel limitations: API routes wake up per request. Login, tasks, chat requests, and push subscription APIs can work, but an always-running scheduler and always-on wake-word listener cannot run continuously on Vercel Hobby.

## Full backend mode

The complete full-stack Firebase setup uses:

```text
Frontend: Firebase Hosting
Backend: Firebase Functions
Database: Firestore
```

In full mode, Firebase Hosting serves the Vite build from `frontend/dist`. Requests to `/api/**` and `/health` are rewritten to the `api` Firebase Function exported by `backend/src/firebase.js`, so the production frontend does not need `VITE_API_URL`.

Firebase Functions require the Blaze pay-as-you-go plan. Firebase's pricing docs list Cloud Functions as available with Blaze access, and the Functions docs say deploying functions requires upgrading to Blaze.

## One-time Firebase setup

Install and sign in to Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use echo-96caa
```

For Spark/free frontend-only deploys, enable:

```text
Hosting
Authentication -> Google provider
Firestore
```

For full backend deploys, also enable:

```text
Functions
```

Scheduled reminders use Firebase scheduled functions, which are part of the full backend mode and require Blaze.

## Runtime configuration

Set backend runtime values with Firebase Functions environment config/secrets before deploying full backend mode. Required production values:

```text
DATABASE_PROVIDER=firebase
FIREBASE_PROJECT_ID=echo-96caa
AUTH_SECRET=use-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
ALLOW_PASSWORD_SIGNUP=false
APP_URL=https://echo-96caa.web.app/
NOTIFICATION_PROVIDER=push
VAPID_PUBLIC_KEY=your VAPID public key
VAPID_PRIVATE_KEY=your VAPID private key
VAPID_SUBJECT=mailto:your-email@example.com
```

Optional LLM values:

```text
LLM_PROVIDER=local
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ABACUSAI_API_KEY=
ABACUS_BASE_URL=https://routellm.abacus.ai/v1
ABACUS_MODEL=route-llm
```

Local service account files such as `backend/firebase-service-account.json` are ignored by git. Do not commit Firebase private keys.

## Deploy from local machine on Spark/free

Build the frontend, then deploy Hosting only:

```bash
npm ci --prefix frontend
npm run deploy
```

After deploy, verify:

```text
https://echo-96caa.web.app
```

## Deploy full backend mode

This requires Blaze:

```bash
npm ci --prefix frontend
npm ci --prefix backend
npm run deploy:full
```

## Deploy from GitHub Actions

The workflow `.github/workflows/deploy-firebase.yml` deploys both frontend and backend on pushes to `main`, so it is for full backend mode and requires Blaze. For Spark/free only, deploy from your local machine with `npm run deploy`.

Add this GitHub Actions secret:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

Use a Firebase/GCP service account JSON with permission to deploy Firebase Hosting and Cloud Functions.

Add these GitHub Actions repository variables for the frontend Firebase web app:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=echo-96caa.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=echo-96caa
VITE_FIREBASE_APP_ID
```

Do not set `VITE_API_URL` for production Firebase Hosting. The app should call same-origin `/api/...`.

## Phone Push Reminders

After Firebase deploy, sign in on your phone and tap `Phone push`. The browser will ask for notification permission. Once accepted, reminders can arrive even if the site is not currently open.

Platform notes:

```text
Android Chrome: works after notification permission is granted.
iPhone Safari: install the site to Home Screen first, then enable notifications from the installed web app.
Desktop browser: works while the browser profile is available.
```

The wake-word feature (`hey Echo`) is local only. Hosted servers cannot listen to your phone microphone in the background from a normal website.
