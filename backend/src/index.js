import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/database.js';
import { createChatRouter } from './routes/chat.js';
import { createSpeechRouter } from './routes/speech.js';
import { createTaskRouter } from './routes/tasks.js';
import { NotificationService } from './services/NotificationService.js';
import { startScheduler } from './services/scheduler.js';
import { startWakeWordListener } from './services/wakeWordService.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
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

app.use('/api/tasks', createTaskRouter(db));
app.use('/api/chat', createChatRouter(db));
app.use('/api/speech', createSpeechRouter());

startScheduler({ db, notificationService });
startWakeWordListener({ db });

app.listen(port, () => {
  console.log(`Reminder agent backend listening on http://localhost:${port}`);
});
