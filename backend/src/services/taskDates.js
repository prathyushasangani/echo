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
    title: normalizeTaskTitle(task.title),
    description: normalizeTaskDescription(task.description || task.title),
    due_at: due.toISOString(),
    is_recurring: Boolean(task.is_recurring),
    category: normalizeCategory(task.category)
  };
}

export function normalizeTaskTitle(title) {
  return (
    String(title || 'Reminder')
      .replace(/^(you\s+are|you're|your|ur)\s+(the\s+)?reminder\s+(to|for|about)?\s*/i, '')
      .replace(/^(i\s+asked\s+you\s+to|asked\s+you\s+to|can\s+you|could\s+you|please)\s+(remind\s+me\s+to|remind\s+to|remember\s+to)?\s*/i, '')
      .replace(/^(remind\s+me\s+to|remind\s+to|reminder\s+to|remember\s+to|add\s+(a\s+)?reminder\s+to)\s*/i, '')
      .replace(/\b(maybe|probably|possibly|just|please)\b/gi, '')
      .replace(/\b(after|in)\s+\d+\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/gi, '')
      .replace(/\b(at|by|around)\s+\d{1,2}([:\s]\d{2})?\s*(am|pm)?\b/gi, '')
      .replace(/\b(today|tomorrow|tonight|morning|afternoon|evening)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!,;:]$/, '') || 'Reminder'
  );
}

function normalizeTaskDescription(description) {
  return (
    String(description || '')
      .replace(/\b(maybe|probably|possibly|just|please)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!,;:]$/, '') || 'Reminder'
  );
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
