import fs from 'node:fs/promises';
import path from 'node:path';

const logPath = path.resolve(process.cwd(), 'logs/reminder-parse-events.jsonl');

export async function logReminderParseEvent(event) {
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(
      logPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
      'utf8'
    );
  } catch (error) {
    console.warn('Could not write reminder parse log:', error.message);
  }
}
