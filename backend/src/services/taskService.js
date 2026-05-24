import { get, mapTask, run } from '../db/database.js';
import { hasExplicitReminderTime, normalizeCategory, normalizeTask } from './taskDates.js';
import { parseTaskInput } from './taskParser.js';

export async function createTaskFromInput(db, input, options = {}) {
  if (!hasExplicitReminderTime(input)) {
    const error = new Error('Please include a time, like "at 8 AM" or "after 30 minutes".');
    error.statusCode = 400;
    throw error;
  }

  const parsed = normalizeTask(await parseTaskInput(input));
  const category = options.category ? normalizeCategory(options.category) : parsed.category;
  const isRecurring = typeof options.is_recurring === 'boolean' ? options.is_recurring : parsed.is_recurring;
  const createdAt = new Date().toISOString();
  const result = await run(
    db,
    `INSERT INTO todos (title, description, created_at, due_at, status, is_recurring, category)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [parsed.title, parsed.description, createdAt, parsed.due_at, isRecurring ? 1 : 0, category]
  );
  const task = await get(db, 'SELECT * FROM todos WHERE id = ?', [result.id]);

  return mapTask(task);
}
