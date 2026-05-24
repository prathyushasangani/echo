import { createLlmClient, getLlmConfig } from './llmClient.js';

const NEWS_RSS_URL = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en';
const REQUEST_TIMEOUT_MS = 8000;

export async function answerGeneralQuestion(message) {
  const normalized = String(message || '').trim();
  if (!normalized) return null;

  if (isNewsQuestion(normalized)) {
    return answerNewsQuestion();
  }

  const instantAnswer = await answerWithDuckDuckGo(normalized);
  if (instantAnswer) return instantAnswer;

  const llmAnswer = await answerWithConfiguredLlm(normalized);
  if (llmAnswer) return llmAnswer;

  return 'I can help with that if web results are available, but I could not find a reliable answer right now.';
}

function isNewsQuestion(message) {
  return /\b(news|headlines?|latest news|today's news|today news)\b/i.test(message);
}

async function answerNewsQuestion() {
  const xml = await fetchText(NEWS_RSS_URL);
  const headlines = extractRssHeadlines(xml)
    .map(simplifyHeadline)
    .filter(Boolean)
    .slice(0, 4);

  if (!headlines.length) {
    return 'I could not fetch the news headlines right now.';
  }

  return [
    "Here's what is making news today:",
    ...headlines.map((headline) => `- ${headline}`),
    '',
    `Quick take: the biggest stories are around ${summarizeNewsThemes(headlines)}.`
  ].join('\n');
}

function extractRssHeadlines(xml) {
  return [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/g)].map(
    (match) => decodeHtml(match[1]).replace(/<[^>]+>/g, '').replace(/\s+-\s+[^-]+$/, '').trim()
  );
}

async function answerWithDuckDuckGo(question) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(question)}&format=json&no_redirect=1&no_html=1`;
  const payload = await fetchJson(url).catch(() => null);
  if (!payload) return '';

  const directAnswer = cleanAnswer(payload.Answer || payload.AbstractText);
  if (directAnswer) return directAnswer;

  const related = flattenRelatedTopics(payload.RelatedTopics).find((topic) => cleanAnswer(topic.Text));
  return related ? cleanAnswer(related.Text) : '';
}

async function answerWithConfiguredLlm(question) {
  const config = getLlmConfig();
  const client = createLlmClient(config);
  if (!client || !config) return '';

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          'You are Echo, a concise assistant. Answer general questions clearly in 2-4 short sentences. If the question needs live facts and you are unsure, say so.'
      },
      { role: 'user', content: question }
    ]
  });

  return completion.choices[0].message.content || '';
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'EchoReminderAgent/1.0'
    }
  }).finally(() => clearTimeout(timeout));
}

function flattenRelatedTopics(topics = []) {
  return topics.flatMap((topic) => (Array.isArray(topic.Topics) ? flattenRelatedTopics(topic.Topics) : [topic]));
}

function cleanAnswer(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function simplifyHeadline(headline) {
  return String(headline || '')
    .replace(/\s+LIVE\b.*$/i, ' live updates')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeNewsThemes(headlines) {
  const text = headlines.join(' ').toLowerCase();
  const themes = [];

  if (/\bwar|iran|israel|gaza|ukraine|russia|missile|ceasefire\b/.test(text)) themes.push('global conflict');
  if (/\bmodi|india|delhi|parliament|court|minister|election|rubio|white house|trump\b/.test(text)) themes.push('politics');
  if (/\bcourt|custody|shooting|police|secret service|death\b/.test(text)) themes.push('law and public safety');
  if (!themes.length) themes.push('world events');

  return themes.slice(0, 3).join(', ');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
