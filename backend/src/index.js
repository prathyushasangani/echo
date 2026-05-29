import 'dotenv/config';
import { initDb } from './db/database.js';
import { createApp } from './app.js';
import { NotificationService } from './services/NotificationService.js';
import { startScheduler } from './services/scheduler.js';
import { startWakeWordListener } from './services/wakeWordService.js';

const port = Number(process.env.PORT || 4000);
const databaseProvider = String(process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const useSharedCloudDatabase = databaseProvider === 'firebase';
const enableLocalScheduler = process.env.ENABLE_LOCAL_SCHEDULER === 'true' || !useSharedCloudDatabase;
const enableWakeWord = process.env.WAKE_WORD_ENABLED === 'true';
const db = await initDb();
const app = createApp(db);
const notificationService = new NotificationService({ db });

if (enableLocalScheduler) {
  startScheduler({ db, notificationService });
} else {
  console.log('Local scheduler is disabled for shared cloud reminder data.');
}

if (enableWakeWord) {
  startWakeWordListener({ db });
} else {
  console.log('Wake-word listener is disabled.');
}

app.listen(port, () => {
  console.log(`Reminder agent backend listening on http://localhost:${port}`);
});
