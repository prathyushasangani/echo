import { get, mapTask, run } from '../db/database.js';
import { hasExplicitReminderTime, normalizeCategory, normalizeTask } from './taskDates.js';
import { logReminderParseEvent } from './parseLogService.js';
import { parseTaskInput } from './taskParser.js';

export async function createTaskFromInput(db, input, options = {}) {
  const requestedRecurring = typeof options.is_recurring === 'boolean' ? options.is_recurring : null;
  if (!hasExplicitReminderTime(input) && requestedRecurring !== true) {
    const error = new Error('One-time reminders need a time, like "at 8 AM" or "after 30 minutes".');
    error.statusCode = 400;
    throw error;
  }

  const rawParsed = await parseTaskInput(input);
  const parsed = normalizeTask(rawParsed);
  const category = options.category ? normalizeCategory(options.category) : parsed.category;
  const isRecurring = requestedRecurring ?? parsed.is_recurring;
  const userId = options.userId || null;
  const createdAt = new Date().toISOString();
  const result = await run(
    db,
    `INSERT INTO todos (user_id, title, description, created_at, due_at, status, is_recurring, category)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [userId, parsed.title, parsed.description, createdAt, parsed.due_at, Boolean(isRecurring), category]
  );
  const task = await get(db, 'SELECT * FROM todos WHERE id = ?', [result.id]);
  await logReminderParseEvent({
    source: options.source || 'tasks-api',
    user_id: userId,
    input,
    caller_options: {
      category: options.category || null,
      is_recurring: requestedRecurring
    },
    parser_output: rawParsed,
    normalized_output: parsed,
    saved_task: mapTask(task)
  });

  return mapTask(task);
}
