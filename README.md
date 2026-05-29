# Personal Reminder Agent

A small full-stack reminder app with:

- Node.js + Express backend
- Firebase Functions backend for production
- SQLite database at `backend/agents.db` locally or Firestore in Firebase
- AI-assisted natural-language task parsing
- Background scheduler that checks due reminders every 60 seconds
- Startup-safe scheduler behavior so old overdue reminders are not spoken all at once
- Modular notification service with local, Telegram, and Discord adapters
- Chat assistant that can answer reminder questions, greetings, and general questions such as current news headlines
- React single-page dashboard
- Firebase Hosting deployment for frontend and backend API rewrites

## Project Layout

```text
personal-reminder-agent/
  backend/
    src/
      db/
      routes/
      services/
      index.js
    .env.example
    package.json
  frontend/
    src/
      components/
      lib/
      App.jsx
      main.jsx
      styles.css
    .env.example
    package.json
  README.md
  firebase.json
  package.json
```

## Setup

Install everything:

```bash
npm install
npm run install:all
```

Create backend environment:

```bash
cp backend/.env.example backend/.env
```

Optional: add an OpenAI key to `backend/.env` for LLM parsing. Without it, the backend uses a local fallback parser.

Create frontend environment:

```bash
cp frontend/.env.example frontend/.env
```

## Run

Start backend and frontend together:

```bash
npm run dev
```

Or separately:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

Default URLs:

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Deploy

Production runs on Firebase Hosting and Firebase Functions in project `echo-96caa`.

```bash
npm ci --prefix frontend
npm run build --prefix frontend
npm ci --prefix backend
firebase deploy --only hosting,functions --project echo-96caa
```

Firebase Hosting rewrites `/api/**` and `/health` to the backend `api` function, so production should not set `VITE_API_URL`. See `DEPLOYMENT.md` for GitHub Actions setup and required Firebase runtime secrets.

## API

### `GET /api/tasks`

Returns active pending tasks by default.

Query:

- `includeCompleted=true` includes completed one-time tasks for history.

### `POST /api/tasks/parse`

Body:

```json
{
  "input": "Remind me to water plants every day at 8 AM"
}
```

Creates a parsed task and returns it.

### `PUT /api/tasks/:id`

Body:

```json
{
  "status": "completed"
}
```

For recurring tasks, completion advances `due_at` to the next day and resets status to `pending`.
For one-time tasks, completion archives the task by setting status to `completed`.

### `DELETE /api/tasks/:id`

Deletes a task.

## Notification Configuration

Local system notifications are enabled by default through `node-notifier`.

For Telegram:

```env
NOTIFICATION_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=123456:abc
TELEGRAM_CHAT_ID=123456789
```

For Discord:

```env
NOTIFICATION_PROVIDER=discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

The adapter lives in `backend/src/services/NotificationService.js`, so adding another provider is intentionally small.

## Voice and General Questions

Echo responds to greetings such as `hello echo` or `echo`.

Reminder questions use local reminder data:

```text
What are my travel reminders?
```

General questions are routed outside the reminder flow. News/headline questions fetch current headlines from a news RSS feed:

```text
What are the news headlines today?
```

Wake-word mode is available but disabled by default in `backend/.env.example` because always-on listening can compete with browser microphone capture on Windows.
