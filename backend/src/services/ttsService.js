import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const DEFAULT_PROVIDER = String(process.env.TTS_PROVIDER || 'edge').trim().toLowerCase();
const DEFAULT_VOICE = process.env.TTS_VOICE || 'en-US-JennyNeural';
const DEFAULT_RATE = Number(process.env.TTS_RATE || 0);
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%';
const DEFAULT_PITCH = process.env.TTS_PITCH || '+0Hz';
const DEFAULT_GOOGLE_LANGUAGE_CODE = process.env.GOOGLE_TTS_LANGUAGE_CODE || 'en-US';
const DEFAULT_GOOGLE_VOICE = process.env.GOOGLE_TTS_VOICE || 'en-US-Neural2-F';
const DEFAULT_GOOGLE_SPEAKING_RATE = Number(process.env.GOOGLE_TTS_SPEAKING_RATE || 1.12);
const DEFAULT_GOOGLE_PITCH = Number(process.env.GOOGLE_TTS_PITCH || 0);
const DEFAULT_GOOGLE_VOLUME_GAIN_DB = Number(process.env.GOOGLE_TTS_VOLUME_GAIN_DB || 0);
const MAX_TTS_LENGTH = 400;

let googleAuth = null;

export async function synthesizeSpeech(text) {
  const cleanText = normalizeTtsText(text);
  if (!cleanText) {
    const error = new Error('Speech text is required.');
    error.statusCode = 400;
    throw error;
  }

  if (cleanText.length > MAX_TTS_LENGTH) {
    const error = new Error(`Speech text must be under ${MAX_TTS_LENGTH} characters.`);
    error.statusCode = 400;
    throw error;
  }

  if (shouldUseGoogleTts()) {
    try {
      return {
        provider: 'google',
        audioBuffer: await synthesizeWithGoogle(cleanText)
      };
    } catch (error) {
      console.error('Google TTS failed, falling back to Edge voice.', error);
    }
  }

  return {
    provider: 'edge',
    audioBuffer: await synthesizeWithEdge(cleanText)
  };
}

async function synthesizeWithEdge(cleanText) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(DEFAULT_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, {
    rate: DEFAULT_RATE,
    volume: DEFAULT_VOLUME,
    pitch: DEFAULT_PITCH
  });

  return streamToBuffer(audioStream);
}

async function synthesizeWithGoogle(cleanText) {
  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = typeof accessTokenResponse === 'string' ? accessTokenResponse : accessTokenResponse?.token;
  if (!accessToken) {
    throw new Error('Google access token is unavailable for TTS.');
  }

  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: { text: cleanText },
      voice: {
        languageCode: DEFAULT_GOOGLE_LANGUAGE_CODE,
        name: DEFAULT_GOOGLE_VOICE
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: DEFAULT_GOOGLE_SPEAKING_RATE,
        pitch: DEFAULT_GOOGLE_PITCH,
        volumeGainDb: DEFAULT_GOOGLE_VOLUME_GAIN_DB
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google TTS request failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  if (!payload.audioContent) {
    throw new Error('Google TTS returned no audio content.');
  }

  return Buffer.from(payload.audioContent, 'base64');
}

function shouldUseGoogleTts() {
  return DEFAULT_PROVIDER === 'google';
}

function getGoogleAuth() {
  if (googleAuth) return googleAuth;

  const credentialsJson = getServiceAccountJson();
  googleAuth = credentialsJson
    ? new GoogleAuth({
        credentials: JSON.parse(credentialsJson),
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      })
    : new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

  return googleAuth;
}

function getServiceAccountJson() {
  return (
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    decodeBase64Env(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    decodeBase64Env(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) ||
    readServiceAccountFile(process.env.GOOGLE_SERVICE_ACCOUNT_PATH) ||
    readServiceAccountFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  );
}

function decodeBase64Env(value) {
  if (!value) return '';
  return Buffer.from(value, 'base64').toString('utf8');
}

function readServiceAccountFile(configuredPath) {
  if (!configuredPath) return '';

  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  return fs.readFileSync(resolvedPath, 'utf8');
}

function normalizeTtsText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
