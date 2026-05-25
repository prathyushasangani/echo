import { all, get, mapTask, run } from '../db/database.js';
import { createLlmClient, getLlmConfig } from './llmClient.js';
import { createTaskFromInput } from './taskService.js';
import { addDaysPreservingTime, hasExplicitReminderTime } from './taskDates.js';
import { parseTaskInput } from './taskParser.js';
import { answerGeneralQuestion } from './generalAgent.js';

const pendingPostponeBySession = new Map();
const pendingCreateBySession = new Map();

export async function askReminderAgent(db, messages = [], sessionId = 'default') {
  const rawLatestMessage = String(messages.at(-1)?.content || '').trim();
  const latestMessage = stripEchoWakePhrase(rawLatestMessage);
  const pendingPostponeTaskId = pendingPostponeBySession.get(sessionId);
  const pendingCreate = pendingCreateBySession.get(sessionId);

  if (pendingCreate) {
    const timeReply = normalizeTimeReply(latestMessage);
    if (!hasExplicitReminderTime(timeReply)) {
      pendingCreateBySession.delete(sessionId);
    } else {
    try {
      const task = await createTaskFromInput(db, `${pendingCreate.input} ${timeReply}`, {
        category: pendingCreate.category,
        is_recurring: pendingCreate.is_recurring
      });
      pendingCreateBySession.delete(sessionId);
      return {
        reply: `Done. I will remind you about ${formatTaskForHumanReminder(task)}.`,
        task
      };
    } catch (error) {
      if (error.statusCode === 400) {
        return { reply: 'I still need a time. You can say something like at 8 PM, tomorrow morning, or after 30 minutes.' };
      }
      throw error;
    }
    }
  }

  if (pendingPostponeTaskId) {
    const task = await get(db, 'SELECT * FROM todos WHERE id = ?', [pendingPostponeTaskId]);
    if (!task) {
      pendingPostponeBySession.delete(sessionId);
      return { reply: 'I could not find that reminder anymore.' };
    }

    const parsed = await parseTaskInput(normalizePostponeTimeReply(latestMessage));
    await run(db, 'UPDATE todos SET due_at = ?, last_notified_at = NULL WHERE id = ?', [parsed.due_at, task.id]);
    pendingPostponeBySession.delete(sessionId);
    const updated = mapTask(await get(db, 'SELECT * FROM todos WHERE id = ?', [task.id]));
    return {
      reply: `Postponed ${updated.title} to ${new Date(updated.due_at).toLocaleString()}.`,
      task: updated
    };
  }

  const responseAction = await handleReminderResponse(db, latestMessage, sessionId);
  if (responseAction) return responseAction;

  if (isGreeting(rawLatestMessage) || isGreeting(latestMessage)) {
    return { reply: 'Hello, I am Echo. How can I help?' };
  }

  const createRequest = parseCreateReminderRequest(latestMessage);

  if (createRequest) {
    try {
      const task = await createTaskFromInput(db, createRequest.input, {
        category: createRequest.category,
        is_recurring: createRequest.is_recurring
      });
      return {
        reply: `Done. I will remind you about ${formatTaskForHumanReminder(task)}.`,
        task
      };
    } catch (error) {
      if (error.statusCode === 400) {
        pendingCreateBySession.set(sessionId, createRequest);
        return { reply: `Sure. When should I remind you about ${formatPendingReminderTitle(createRequest.input)}?` };
      }
      throw error;
    }
  }

  const tasks = (await all(db, 'SELECT * FROM todos ORDER BY due_at ASC')).map(mapTask);
  const contextualTasks = latestMessage.toLowerCase().includes('today') ? filterTasksDueToday(tasks) : tasks;
  const localAnswer = answerLocally(latestMessage, tasks);
  if (localAnswer) return { reply: localAnswer };

  if (!isReminderDomainMessage(latestMessage)) {
    return { reply: await answerGeneralQuestion(latestMessage, messages) };
  }

  const config = getLlmConfig();
  const client = createLlmClient(config);

  if (!latestMessage) {
    return {
      reply: 'Ask me about your reminders, routines, or schedule.',
      outOfDomain: true,
      shouldSpeak: false
    };
  }

  if (!client || !config) {
    return { reply: 'I can help with reminders, routines, due times, and one-time tasks.' };
  }

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'You are Echo, a concise personal reminder agent. Stay strictly inside this domain: reminders, routines, due times, schedules, and replies to active reminders. Answer questions using the reminder data provided. If the user asks to list reminders, summarize them naturally instead of repeating the request. If the answer is outside the reminder domain, say you only handle reminders. Keep replies short and useful.'
      },
      {
        role: 'user',
        content: `Current time: ${new Date().toISOString()}\nReminder data JSON:\n${JSON.stringify(contextualTasks, null, 2)}`
      },
      ...messages.slice(-8)
    ]
  });

  return { reply: completion.choices[0].message.content || 'I could not form an answer.' };
}

function isGreeting(message) {
  const normalized = normalizeAssistantCall(message);
  return /^(hello echo|hi echo|hey echo|echo|hello|hi|hey)$/.test(normalized);
}

function stripEchoWakePhrase(message) {
  return String(message || '')
    .trim()
    .replace(/^(hello|hi|hey)?\s*(echo|eco|eko|ecko|ekko|ego|aiko|go)\b[\s,.:;-]*/i, '')
    .trim() || String(message || '').trim();
}

function normalizeAssistantCall(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/\b(eco|eko|ecko|ekko|ego|aiko)\b/g, 'echo')
    .replace(/^(hello|hi|hey)\s+go$/, '$1 echo')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getActiveReminder(db) {
  const task = await getLastNotifiedTask(db);
  return task ? mapTask(task) : null;
}

export async function respondToActiveReminder(db, { action, time } = {}) {
  const task = await getLastNotifiedTask(db);
  if (!task) return { reply: 'There is no active reminder waiting for a response.', task: null };

  if (action === 'done') {
    return completeReminderTask(db, task);
  }

  if (action === 'postpone') {
    if (!time) {
      return { reply: `When should I postpone ${task.title} to?`, needsTime: true, task: mapTask(task) };
    }

    const parsed = await parseTaskInput(normalizePostponeTimeReply(time));
    await run(db, 'UPDATE todos SET due_at = ?, last_notified_at = NULL WHERE id = ?', [parsed.due_at, task.id]);
    const updated = mapTask(await get(db, 'SELECT * FROM todos WHERE id = ?', [task.id]));
    return {
      reply: `Postponed ${updated.title} to ${new Date(updated.due_at).toLocaleString()}.`,
      task: updated
    };
  }

  return { reply: 'Choose Done or Postpone for this reminder.', task: mapTask(task) };
}

function normalizePostponeTimeReply(message) {
  const trimmed = message.trim();
  if (/^\d{1,2}([:\s]\d{2})?\s*(am|pm)?$/i.test(trimmed)) {
    return `at ${trimmed}`;
  }

  const duration = normalizeBareDuration(trimmed);
  if (duration) {
    return `after ${duration}`;
  }

  return trimmed;
}

function normalizeTimeReply(message) {
  const trimmed = String(message || '').trim();
  if (/^\d{1,2}([:\s]\d{2})?\s*(am|pm)?$/i.test(trimmed)) {
    return `at ${trimmed}`;
  }

  const duration = normalizeBareDuration(trimmed);
  if (duration) {
    return `after ${duration}`;
  }

  return trimmed;
}

function normalizeBareDuration(message) {
  const cleaned = String(message || '')
    .trim()
    .replace(/^(maybe|probably|possibly|just)\s+/i, '');

  return /^\d+\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)$/i.test(cleaned) ? cleaned : '';
}

async function handleReminderResponse(db, message, sessionId) {
  const normalized = message.toLowerCase();
  const task = await getLastNotifiedTask(db);
  if (!task) return null;

  if (/\b(postpone|later|snooze|delay)\b/.test(normalized)) {
    const postponeTime = extractPostponeTime(message);
    if (postponeTime) {
      const parsed = await parseTaskInput(postponeTime);
      await run(db, 'UPDATE todos SET due_at = ?, last_notified_at = NULL WHERE id = ?', [parsed.due_at, task.id]);
      const updated = mapTask(await get(db, 'SELECT * FROM todos WHERE id = ?', [task.id]));
      return {
        reply: `Postponed ${updated.title} to ${new Date(updated.due_at).toLocaleString()}.`,
        task: updated
      };
    }

    pendingPostponeBySession.set(sessionId, task.id);
    return { reply: `When should I postpone ${task.title} to?` };
  }

  if (/\b(done|completed|complete|i did|i finished|i worked|worked|yes|finish)\b/.test(normalized)) {
    return completeReminderTask(db, task);
  }

  return null;
}

async function completeReminderTask(db, task) {
  if (task.is_recurring) {
    const nextDueAt = addDaysPreservingTime(task.due_at, 1);
    await run(db, 'UPDATE todos SET due_at = ?, status = ?, last_notified_at = NULL WHERE id = ?', [
      nextDueAt,
      'pending',
      task.id
    ]);
    const updated = mapTask(await get(db, 'SELECT * FROM todos WHERE id = ?', [task.id]));
    return {
      reply: `Marked ${updated.title} done. I moved it to tomorrow.`,
      task: updated
    };
  }

  await run(db, 'UPDATE todos SET status = ?, last_notified_at = NULL WHERE id = ?', ['completed', task.id]);
  return { reply: `Marked ${task.title} as completed.`, task: mapTask({ ...task, status: 'completed' }) };
}

function extractPostponeTime(message) {
  const cleaned = message
    .replace(/\b(postpone|snooze|delay|later)\b/gi, '')
    .replace(/\b(to|for|until)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^after\b/i.test(cleaned) || /^tomorrow\b/i.test(cleaned) || /^today\b/i.test(cleaned)) return cleaned;
  if (/^\d{1,2}([:\s]\d{2})?\s*(am|pm)?$/i.test(cleaned)) return `at ${cleaned}`;

  return cleaned;
}

async function getLastNotifiedTask(db) {
  return get(
    db,
    `SELECT * FROM todos
     WHERE status = 'pending'
     AND last_notified_at IS NOT NULL
     ORDER BY last_notified_at DESC
     LIMIT 1`
  );
}

function parseCreateReminderRequest(message) {
  const normalized = message.toLowerCase();
  const isQuestionOnly = /^(what|which|how many|show|list|tell me)\b/.test(normalized);
  if (isQuestionOnly) return null;

  const isCreateIntent = /\b(add|create|set|remind me|reminder|reminders|schedule|order|buy|call|wake|remember)\b/.test(
    normalized
  );
  if (!isCreateIntent) return null;

  const category = ['Travel', 'Home', 'Office', 'General'].find((item) => normalized.includes(item.toLowerCase()));
  const isOneTime = /\b(1 time|one time|one-time|single|once|one time reminders?|1 time reminders?)\b/.test(
    normalized
  );
  const isRecurring = category ? !isOneTime : /\b(every day|daily|each day|routine)\b/.test(normalized);

  return {
    input: cleanReminderCommand(message),
    category: isOneTime ? 'General' : category || 'General',
    is_recurring: isRecurring
  };
}

function isReminderDomainMessage(message) {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return false;

  const hasReminderWord =
    /\b(reminders?|remind|tasks?|routines?|schedule|due|pending|daily|every day|one[-\s]?time|once)\b/.test(
      normalized
    );
  const hasReminderAction =
    /\b(done|complete|completed|finish|finished|postpone|snooze|delay|later|call|buy|order|wake)\b/.test(normalized);
  const hasCategory = /\b(travel|home|office|general)\b/.test(normalized);

  return hasReminderWord || hasReminderAction || hasCategory;
}

function cleanReminderCommand(message) {
  return (
    message
      .replace(/^(you\s+are|you're|your|ur)\s+(the\s+)?reminder\s+(to|for|about)?\s*/i, '')
      .replace(/^(i\s+asked\s+you\s+to|asked\s+you\s+to)\s+(remind\s+me\s+to|remind\s+to|remember\s+to)?\s*/i, '')
      .replace(/^(when you|can you|could you|will you|please)\s+/i, '')
      .replace(/\b(in|into|to)\s+(1 time|one time|one-time)\s+reminders?\b/gi, '')
      .replace(/\b(1 time|one time|one-time)\s+reminders?\b/gi, '')
      .replace(/\b(travel|home|office|general)\s+(reminders?|tasks?|routine|routines)\b/gi, '')
      .replace(/^(please\s+)?(can you\s+|could you\s+|will you\s+)?/i, '')
      .replace(/^(add|create|set|schedule)\s+(a\s+)?(reminder\s+)?(to\s+)?/i, '')
      .replace(/^remind me\s+(to\s+)?/i, '')
      .replace(/^reminder\s+(to\s+)?/i, '')
      .replace(/^remind\s+to\s+/i, '')
      .replace(/^add\s+(a\s+)?reminder\s+(for|about)?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!,;:]$/, '') || message
  );
}

function answerLocally(question, tasks) {
  const normalized = question.toLowerCase();
  if (!normalized.trim()) return '';

  const hasReminderIntent =
    /\b(reminders?|remind|tasks?|routines?|schedule|due|pending|one[-\s]?time|daily|every day)\b/.test(normalized);
  const pending = (normalized.includes('today') ? filterTasksDueToday(tasks) : tasks).filter(
    (task) => task.status === 'pending'
  );
  const categoryMatch = ['travel', 'office', 'home', 'general'].find((category) => normalized.includes(category));
  if (!hasReminderIntent && !categoryMatch) return '';

  const filtered = categoryMatch
    ? pending.filter((task) => (task.category || 'General').toLowerCase() === categoryMatch)
    : pending;

  if (isContextualReminderCheck(normalized)) {
    return answerContextualReminderCheck(categoryMatch, filtered);
  }

  if (hasReminderIntent && normalized.includes('how many')) {
    return `You have ${filtered.length} pending reminder${filtered.length === 1 ? '' : 's'}${categoryMatch ? ` in ${categoryMatch}` : ''}.`;
  }

  const asksForList =
    /\b(list|show|tell me|what are|read|give me)\b/.test(normalized) &&
    /\b(reminders?|tasks?|routines?|schedule)\b/.test(normalized);

  if (
    asksForList ||
    (hasReminderIntent && (normalized.includes('next') || normalized.includes('upcoming') || normalized.includes('today'))) ||
    categoryMatch
  ) {
    return answerReminderSummary(categoryMatch, filtered);
  }

  return '';
}

function answerReminderSummary(categoryMatch, tasks) {
  const spokenTasks = uniqueTasksForSpeech(tasks).slice(0, 4).map(formatTaskForHumanReminder);
  const scope = categoryMatch ? ` for ${categoryMatch}` : '';

  if (!spokenTasks.length) {
    return `I do not see anything pending${scope}.`;
  }

  if (spokenTasks.length === 1) {
    return `For ${categoryMatch || 'today'}, remember ${spokenTasks[0]}.`;
  }

  const extraCount = uniqueTasksForSpeech(tasks).length - spokenTasks.length;
  const extraText = extraCount > 0 ? ` There ${extraCount === 1 ? 'is' : 'are'} ${extraCount} more too.` : '';
  return `For ${categoryMatch || 'your reminders'}, remember ${joinHumanList(spokenTasks)}.${extraText}`;
}

function isContextualReminderCheck(normalized) {
  const hasReminderCheck = /\b(anything|something|what|do you have|did i forget|forgot|forget|remind|remember)\b/.test(
    normalized
  );
  const hasMovementContext =
    /\b(leaving|leave|going|go|heading|head|starting|start|on my way|stepping out|before i go)\b/.test(normalized);

  return hasReminderCheck && hasMovementContext;
}

function answerContextualReminderCheck(categoryMatch, tasks) {
  const destination = categoryMatch ? ` for ${categoryMatch}` : '';
  if (!tasks.length) {
    return `You look good to go${destination}. I do not see anything pending to remind you about.`;
  }

  const importantTasks = uniqueTasksForSpeech(tasks).slice(0, 3);
  if (importantTasks.length === 1) {
    const reminder = formatTaskForHumanReminder(importantTasks[0]);
    if (reminder === 'your lunch box') {
      return 'Wait, I think you forgot your lunch box. Did you pick it up?';
    }

    return `Wait, I think you may have forgotten ${reminder}. Did you take care of it?`;
  }

  const spokenTasks = importantTasks.map(formatTaskForHumanReminder);
  const extraCount = uniqueTasksForSpeech(tasks).length - importantTasks.length;
  const extraText = extraCount > 0 ? ` There ${extraCount === 1 ? 'is' : 'are'} ${extraCount} more after that.` : '';
  return `Wait, before you leave${destination}, check these: ${joinHumanList(spokenTasks)}.${extraText}`;
}

function formatTaskForHumanReminder(task) {
  const title = String(task.title || '')
    .trim()
    .replace(/^(travel|office|home|general)\s+/i, '')
    .replace(/[.!,;:]$/, '');
  const lowerTitle = title.toLowerCase();

  if (/^(in\s+)?office$/.test(lowerTitle)) return 'your office reminder';
  if (/^(in\s+)?home$/.test(lowerTitle)) return 'your home reminder';
  if (/^(in\s+)?travel$/.test(lowerTitle)) return 'your travel reminder';
  if (/^remind me$/.test(lowerTitle)) return 'your general reminder';
  if (/\bwake\b/.test(lowerTitle)) return 'your wake-up reminder';
  if (/\bexer(s|c)ise\b/.test(lowerTitle)) return lowerTitle.replace(/\bexersise\b/g, 'exercise');
  if (/^charge\b/.test(lowerTitle)) return `charging ${title.replace(/^charge\s+/i, '').replace(/^my\s+/i, 'your ')}`;
  if (/^call\b/.test(lowerTitle)) return `calling ${title.replace(/^call\s+/i, '')}`;
  if (/^buy\b/.test(lowerTitle)) return `buying ${title.replace(/^buy\s+/i, '')}`;
  if (/^pack\b/.test(lowerTitle)) return `packing ${title.replace(/^pack\s+/i, '')}`;
  if (/\blunch\s*box\b/.test(lowerTitle)) return 'your lunch box';
  if (/\bpassport\b/.test(lowerTitle)) return 'your passport';
  if (/\btickets?\b/.test(lowerTitle)) return 'your tickets';
  if (/\bkeys?\b/.test(lowerTitle)) return 'your keys';
  if (/\bwallet\b/.test(lowerTitle)) return 'your wallet';
  if (/\bid card|badge\b/.test(lowerTitle)) return 'your ID card';

  return title || 'that reminder';
}

function formatPendingReminderTitle(input) {
  const title = String(input || '')
    .replace(/\b(at|after|tomorrow|today|tonight|morning|evening|afternoon)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!,;:]$/, '');

  if (!title) return 'that';
  return formatTaskForHumanReminder({ title });
}

function uniqueTasksForSpeech(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = formatTaskForHumanReminder(task).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function joinHumanList(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function filterTasksDueToday(tasks) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return tasks.filter((task) => {
    const due = new Date(task.due_at);
    return due >= start && due < end;
  });
}
