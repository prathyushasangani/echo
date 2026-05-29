import notifier from 'node-notifier';
import { spawn } from 'node:child_process';
import { sendPushToUser } from './pushService.js';

export class NotificationService {
  constructor({ db, provider = process.env.NOTIFICATION_PROVIDER || 'local' } = {}) {
    this.db = db;
    this.provider = provider;
  }

  async notify(task) {
    const message = createReminderMessage(task);
    await this.notifyPush(task, 'Reminder', message);

    if (this.provider === 'push') {
      return;
    }

    if (this.provider === 'telegram') {
      return this.notifyTelegram('Reminder', message);
    }

    if (this.provider === 'discord') {
      return this.notifyDiscord('Reminder', message);
    }

    if (this.provider === 'voice') {
      return this.notifyVoice('Reminder', message);
    }

    return this.notifyLocal('Reminder', message);
  }

  async notifyPush(task, title, message) {
    if (!this.db) return;

    await sendPushToUser(this.db, task.user_id, {
      title: `Reminder: ${task.title || title}`,
      body: message,
      url: process.env.APP_URL || '/',
      taskId: task.id
    });
  }

  notifyLocal(title, message) {
    return new Promise((resolve) => {
      notifier.notify(
        {
          title: `Reminder: ${title}`,
          message,
          sound: true,
          wait: false
        },
        () => resolve()
      );
    });
  }

  notifyVoice(title, message) {
    const normalizedMessage = normalizeSpeechText(message);
    const voiceText = normalizedMessage || normalizeSpeechText(title);
    const escapedText = voiceText.replace(/'/g, "''");
    const voiceName = process.env.VOICE_NAME || '';
    const escapedVoiceName = voiceName.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$speaker.Rate = ${Number(process.env.VOICE_RATE || 0)}`,
      `$speaker.Volume = ${Number(process.env.VOICE_VOLUME || 100)}`,
      escapedVoiceName
        ? `$preferred = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq '${escapedVoiceName}' } | Select-Object -First 1; if ($preferred) { $speaker.SelectVoice($preferred.VoiceInfo.Name) }`
        : '',
      "$female = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1; if ($female -and $speaker.Voice.Name -notmatch 'Zira|Aria|Jenny|Susan|Samantha|Victoria|Karen|Moira|Tessa') { $speaker.SelectVoice($female.VoiceInfo.Name) }",
      `$speaker.Speak('${escapedText}')`
    ]
      .filter(Boolean)
      .join('; ');

    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Voice reminder failed with exit code ${code}.`));
      });
    });
  }

  async notifyTelegram(title, message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      throw new Error('Telegram notifications require TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Reminder: ${title}\n${message}`
      })
    });
  }

  async notifyDiscord(title, message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error('Discord notifications require DISCORD_WEBHOOK_URL.');
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**Reminder: ${title}**\n${message}`
      })
    });
  }
}

function normalizeSpeechText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.!,;:]+$/g, '')
    .trim();
}

function createReminderMessage(task) {
  const title = normalizeSpeechText(task.title);
  const description = normalizeSpeechText(task.description);
  const source = description || title;
  const lower = source.toLowerCase();

  const wakeMatch = lower.match(/\bwake\s+me\s+(?:up\s+)?after\s+(.+)/i);
  if (wakeMatch) {
    return `The ${cleanDuration(wakeMatch[1])} timer is over. You asked me to wake you.`;
  }

  if (/\bwake\s+me\b/i.test(lower)) {
    return 'It is time to wake up. You asked me to remind you.';
  }

  if (/\bcharger|chargers|charge cable|charging cable\b/i.test(lower)) {
    return 'Do not forget your chargers.';
  }

  if (/\bpassport|ticket|tickets|boarding pass|visa\b/i.test(lower)) {
    return `Before you leave, remember ${title}.`;
  }

  if (/\bmedicine|tablet|pill|dose\b/i.test(lower)) {
    return `It is time for ${title}.`;
  }

  if (/\bmeeting|call|standup|report|email\b/i.test(lower)) {
    return `Your office reminder is due: ${title}.`;
  }

  if (/\bwater plants|plants\b/i.test(lower)) {
    return 'It is time to water the plants.';
  }

  if (/^(buy|order|book|call|send|check|pack|take|pay|water|clean|charge)\b/i.test(title)) {
    return `It is time to ${title}.`;
  }

  return `Reminder: ${title}.`;
}

function cleanDuration(value) {
  return String(value)
    .replace(/\b(mins?|minutes?)\b/i, 'minutes')
    .replace(/\b(secs?|seconds?)\b/i, 'seconds')
    .replace(/\b(hrs?|hours?)\b/i, 'hours')
    .replace(/\s+/g, ' ')
    .trim();
}
