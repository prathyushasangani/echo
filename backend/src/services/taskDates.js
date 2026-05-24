export function addDaysPreservingTime(isoTimestamp, days) {
  const date = new Date(isoTimestamp);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function nextFutureDailyOccurrence(isoTimestamp) {
  let next = new Date(isoTimestamp);
  const now = new Date();

  while (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

export function normalizeTask(task) {
  const now = new Date();
  const due = task.due_at ? new Date(task.due_at) : new Date(now.getTime() + 60 * 60 * 1000);

  if (Number.isNaN(due.getTime())) {
    throw new Error('Parser returned an invalid due_at timestamp.');
  }

  return {
    title: String(task.title || 'Reminder').trim(),
    description: String(task.description || '').trim(),
    due_at: due.toISOString(),
    is_recurring: Boolean(task.is_recurring),
    category: normalizeCategory(task.category)
  };
}

export function normalizeCategory(category) {
  const cleanCategory = String(category || 'General').trim().toLowerCase();
  const allowedCategories = {
    travel: 'Travel',
    office: 'Office',
    work: 'Office',
    home: 'Home',
    house: 'Home',
    general: 'General',
    other: 'General'
  };

  return allowedCategories[cleanCategory] || 'General';
}

export function hasExplicitReminderTime(input) {
  const text = String(input || '').toLowerCase();

  return (
    /\b(after|in)\s+\d+\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/.test(text) ||
    /\b(at|by|around)\s+\d{1,2}([:\s]\d{2})?\s*(am|pm)?\b/.test(text) ||
    /\b\d{1,2}:\d{2}\s*(am|pm)?\b/.test(text) ||
    /\b\d{1,2}\s*(am|pm)\b/.test(text) ||
    /\b(noon|midnight)\b/.test(text)
  );
}
