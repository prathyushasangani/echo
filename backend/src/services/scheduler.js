import { all, run } from '../db/database.js';
import { hasExplicitReminderTime, nextFutureDailyOccurrence } from './taskDates.js';

const ONE_MINUTE = 60 * 1000;
const STARTUP_GRACE_MS = 2 * ONE_MINUTE;
const STALE_DUE_MS = 15 * ONE_MINUTE;

export function startScheduler({ db, notificationService }) {
  async function tick({ isStartup = false } = {}) {
    const now = new Date().toISOString();
    const nowTime = Date.now();
    const dueTasks = await all(
      db,
      `SELECT * FROM todos
       WHERE due_at <= ?
       AND status = 'pending'
       AND last_notified_at IS NULL
       ORDER BY due_at ASC`,
      [now]
    );

    for (const task of dueTasks) {
      if (!hasExplicitReminderTime(task.description || task.title)) {
        await run(db, 'UPDATE todos SET last_notified_at = ? WHERE id = ?', [now, task.id]);
        continue;
      }

      const dueTime = new Date(task.due_at).getTime();
      const ageMs = nowTime - dueTime;

      if (Number.isNaN(dueTime)) {
        await run(db, 'UPDATE todos SET last_notified_at = ? WHERE id = ?', [now, task.id]);
        continue;
      }

      if (task.is_recurring && ageMs > STALE_DUE_MS) {
        await run(db, 'UPDATE todos SET due_at = ?, last_notified_at = NULL WHERE id = ?', [
          nextFutureDailyOccurrence(task.due_at),
          task.id
        ]);
        continue;
      }

      if (!task.is_recurring && ageMs > STALE_DUE_MS) {
        await run(db, 'UPDATE todos SET last_notified_at = ? WHERE id = ?', [now, task.id]);
        continue;
      }

      if (isStartup && ageMs > STARTUP_GRACE_MS) {
        await run(db, 'UPDATE todos SET last_notified_at = ? WHERE id = ?', [now, task.id]);
        continue;
      }

      try {
        await notificationService.notify(task);
        await run(db, 'UPDATE todos SET last_notified_at = ? WHERE id = ?', [now, task.id]);
      } catch (error) {
        console.error(`Failed to process reminder ${task.id}:`, error);
      }
    }
  }

  setInterval(tick, ONE_MINUTE);
  tick({ isStartup: true }).catch((error) => console.error('Initial scheduler tick failed:', error));
}
