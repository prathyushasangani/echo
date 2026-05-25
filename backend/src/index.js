import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/database.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createChatRouter } from './routes/chat.js';
import { createSpeechRouter } from './routes/speech.js';
import { createTaskRouter } from './routes/tasks.js';
import { NotificationService } from './services/NotificationService.js';
import { startScheduler } from './services/scheduler.js';
import { getWakeWordStatus, startWakeWordListener, testWakeWordCommand } from './services/wakeWordService.js';
import { authenticateRequest } from './services/authService.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://prathyushasangani.github.io',
  'https://prathyushasangani.com'
];
const allowedOrigins = [
  ...defaultAllowedOrigins,
  ...(process.env.CORS_ORIGIN || '').split(',')
]
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`));
      }
    }
  })
);
app.use(express.json());

const db = await initDb();
const notificationService = new NotificationService();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', createAuthRouter(db));
app.use('/api/admin', createAdminRouter(db));
app.use('/api/tasks', authenticateRequest.bind(null, db), createTaskRouter(db));
app.use('/api/chat', authenticateRequest.bind(null, db), createChatRouter(db));
app.use('/api/speech', createSpeechRouter());

app.get('/api/wake/status', (_req, res) => {
  res.json(getWakeWordStatus());
});

app.post('/api/wake/test', async (req, res, next) => {
  try {
    const command = String(req.body.command || 'hello echo').trim();
    res.json(await testWakeWordCommand(db, command));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (!error.statusCode || error.statusCode >= 500) {
    console.error(error);
  }
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unexpected server error.' });
});

startScheduler({ db, notificationService });
startWakeWordListener({ db });

app.listen(port, () => {
  console.log(`Reminder agent backend listening on http://localhost:${port}`);
});
