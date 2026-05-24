import * as chrono from 'chrono-node';
import { createLlmClient } from './llmClient.js';

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const abacusModel = process.env.ABACUS_MODEL || 'route-llm';
const abacusBaseUrl = process.env.ABACUS_BASE_URL || 'https://routellm.abacus.ai/v1';

export async function parseTaskInput(input) {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();

  if ((provider === 'abacus' || process.env.ABACUSAI_API_KEY) && process.env.ABACUSAI_API_KEY) {
    try {
      return await parseWithOpenAICompatibleClient({
        input,
        apiKey: process.env.ABACUSAI_API_KEY,
        baseURL: abacusBaseUrl,
        model: abacusModel
      });
    } catch (error) {
      console.warn('Abacus parsing failed, falling back to local parser:', error.message);
    }
  }

  if ((provider === 'openai' || process.env.OPENAI_API_KEY) && process.env.OPENAI_API_KEY) {
    try {
      return await parseWithOpenAICompatibleClient({
        input,
        apiKey: process.env.OPENAI_API_KEY,
        model
      });
    } catch (error) {
      console.warn('LLM parsing failed, falling back to local parser:', error.message);
    }
  }

  return parseLocally(input);
}

async function parseWithOpenAICompatibleClient({ input, apiKey, baseURL, model }) {
  const client = createLlmClient({ apiKey, baseURL, model });
  const now = new Date();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Extract a reminder task. Return only JSON matching the schema. Use ISO timestamps. Treat daily/every day reminders as recurring. Spoken times like "11 30" mean 11:30, not 11:00 with title suffix 30. Relative phrases like "after 2 sec" mean now plus that duration. The title must be the clean action only, without time words, recurrence words, or category words.'
      },
      {
        role: 'user',
        content: `Current time: ${now.toISOString()}\nReminder text: ${input}`
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'parsed_reminder',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            due_at: { type: 'string' },
            is_recurring: { type: 'boolean' },
            category: { type: 'string', enum: ['Travel', 'Office', 'Home', 'General'] }
          },
          required: ['title', 'description', 'due_at', 'is_recurring', 'category']
        }
      }
    }
  });

  return JSON.parse(completion.choices[0].message.content);
}

function parseLocally(input) {
  const now = new Date();
  const normalizedInput = normalizeSpokenTime(input);
  const isRecurring = /\b(every day|daily|each day|every morning|every evening|routine)\b/i.test(normalizedInput);
  const relativeDue = parseRelativeDuration(normalizedInput, now);
  const parsedDate = relativeDue || chrono.parseDate(normalizedInput, now, { forwardDate: true });
  const due = parsedDate || new Date(now.getTime() + 60 * 60 * 1000);
  const title = cleanTitle(normalizedInput);

  return {
    title,
    description: normalizedInput,
    due_at: due.toISOString(),
    is_recurring: isRecurring,
    category: inferCategory(normalizedInput)
  };
}

function inferCategory(input) {
  if (/\b(travel|trip|flight|airport|train|bus|cab|taxi|hotel|passport|visa)\b/i.test(input)) {
    return 'Travel';
  }

  if (/\b(office|work|meeting|standup|email|client|report|project|call|presentation)\b/i.test(input)) {
    return 'Office';
  }

  if (/\b(home|house|kitchen|laundry|plants|groceries|clean|cook|rent|family)\b/i.test(input)) {
    return 'Home';
  }

  return 'General';
}

function cleanTitle(input) {
  return input
    .replace(/^(remind me to|add a reminder to|reminder to|remember to)\s+/i, '')
    .replace(
      /\b(maybe|probably|possibly|just|please|tomorrow|today|tonight|every day|daily|after\s+\d+\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|on\s+\w+)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!,;:]$/, '') || 'Reminder';
}

function normalizeSpokenTime(input) {
  return input.replace(
    /\bat\s+(\d{1,2})\s+(\d{2})(\s*(am|pm))?\b/gi,
    (_match, hour, minute, suffix = '') => `at ${hour}:${minute}${suffix}`
  );
}

function parseRelativeDuration(input, now) {
  const match = input.match(/\bafter\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith('sec')
    ? 1000
    : unit.startsWith('min')
      ? 60 * 1000
      : 60 * 60 * 1000;

  return new Date(now.getTime() + amount * multiplier);
}
