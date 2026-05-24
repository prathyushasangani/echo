import { createLlmClient, getLlmConfig } from './llmClient.js';

const NEWS_RSS_URL = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 8000;

export async function answerGeneralQuestion(message) {
  const normalized = String(message || '').trim();
  if (!normalized) return null;

  if (isNewsQuestion(normalized)) {
    return answerNewsQuestion();
  }

  if (isWeatherQuestion(normalized)) {
    return answerWeatherQuestion(normalized);
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

function isWeatherQuestion(message) {
  return /\b(weather|temperature|rain|raining|forecast|climate)\b/i.test(message);
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

async function answerWeatherQuestion(question) {
  const location = extractWeatherLocation(question);
  if (!location) {
    return 'Tell me the place name, and I will check the weather for you.';
  }

  const place = await findPlace(location);
  if (!place) {
    return `I could not find weather for ${location}. Try a more specific city or island name.`;
  }

  const weather = await fetchCurrentWeather(place);
  if (!weather) {
    return `I found ${formatPlaceName(place)}, but I could not fetch the weather right now.`;
  }

  const condition = describeWeatherCode(weather.weather_code);
  const temperature = Math.round(weather.temperature_2m);
  const feelsLike = Math.round(weather.apparent_temperature);
  const wind = Math.round(weather.wind_speed_10m);
  const rainChance = weather.precipitation_probability ?? null;
  const rainText = rainChance === null ? '' : ` Rain chance is ${Math.round(rainChance)} percent.`;

  return `In ${formatPlaceName(place)}, it is ${temperature} degrees Celsius and ${condition}. It feels like ${feelsLike} degrees, with wind around ${wind} kilometers per hour.${rainText}`;
}

function extractWeatherLocation(question) {
  const cleaned = String(question || '')
    .toLowerCase()
    .replace(/\b(what is|what's|whats|how is|how's|hows|tell me|show me|give me|current|today|now|right now|please)\b/g, ' ')
    .replace(/\b(is|it|the|weather|temperature|forecast|climate|rain|raining|in|at|for|of|like)\b/g, ' ')
    .replace(/[^a-z0-9\s,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizeWeatherLocation(cleaned);
}

function normalizeWeatherLocation(location) {
  const normalized = String(location || '').trim();
  if (!normalized) return '';

  if (/^andaman(s)?$|^andaman nicobar$|^andaman and nicobar$|^andaman island(s)?$/.test(normalized)) {
    return 'Andaman Islands';
  }

  return normalized;
}

async function findPlace(location) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const payload = await fetchJson(url).catch(() => null);
  return payload?.results?.[0] || null;
}

async function fetchCurrentWeather(place) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    hourly: 'precipitation_probability',
    forecast_days: '1',
    timezone: 'auto'
  });
  const payload = await fetchJsonWithRetry(`${FORECAST_URL}?${params.toString()}`);
  if (!payload?.current) return null;

  const currentTime = new Date(payload.current.time).getTime();
  const hourlyTimes = payload.hourly?.time || [];
  const probabilities = payload.hourly?.precipitation_probability || [];
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  hourlyTimes.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - currentTime);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return {
    ...payload.current,
    precipitation_probability: nearestIndex >= 0 ? probabilities[nearestIndex] : null
  };
}

async function fetchJsonWithRetry(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const payload = await fetchJson(url).catch(() => null);
    if (payload) return payload;
    if (attempt < retries) {
      await delay(350);
    }
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPlaceName(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

function describeWeatherCode(code) {
  const descriptions = {
    0: 'clear',
    1: 'mostly clear',
    2: 'partly cloudy',
    3: 'cloudy',
    45: 'foggy',
    48: 'foggy',
    51: 'light drizzle',
    53: 'drizzling',
    55: 'heavy drizzle',
    61: 'light rain',
    63: 'raining',
    65: 'heavy rain',
    71: 'light snow',
    73: 'snowing',
    75: 'heavy snow',
    80: 'light showers',
    81: 'showery',
    82: 'heavy showers',
    95: 'thunderstorms',
    96: 'thunderstorms with hail',
    99: 'severe thunderstorms with hail'
  };

  return descriptions[code] || 'showing changing weather';
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
