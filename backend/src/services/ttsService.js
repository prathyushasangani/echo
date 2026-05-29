import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const DEFAULT_VOICE = process.env.TTS_VOICE || 'en-US-JennyNeural';
const DEFAULT_RATE = Number(process.env.TTS_RATE || 0);
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%';
const DEFAULT_PITCH = process.env.TTS_PITCH || '+0Hz';
const MAX_TTS_LENGTH = 400;

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

  const tts = new MsEdgeTTS();
  await tts.setMetadata(DEFAULT_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, {
    rate: DEFAULT_RATE,
    volume: DEFAULT_VOLUME,
    pitch: DEFAULT_PITCH
  });

  return streamToBuffer(audioStream);
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
