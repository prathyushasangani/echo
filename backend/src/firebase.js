import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initDb } from './db/database.js';
import { createApp } from './app.js';
import { NotificationService } from './services/NotificationService.js';
import { processDueReminders } from './services/scheduler.js';

const db = await initDb();
const app = createApp(db);
const notificationService = new NotificationService({ db, provider: process.env.NOTIFICATION_PROVIDER || 'push' });

export const api = onRequest(
  {
    region: process.env.FUNCTION_REGION || 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  app
);

export const reminderScheduler = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: process.env.FUNCTION_REGION || 'us-central1',
    timeZone: process.env.TZ || 'Asia/Kolkata'
  },
  async () => {
    await processDueReminders({ db, notificationService });
  }
);
