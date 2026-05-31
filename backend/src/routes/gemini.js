import express from 'express';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview';
const DEFAULT_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE || 'Kore';

let geminiClient = null;

export function createGeminiRouter() {
  const router = express.Router();

  router.get('/status', (_req, res) => {
    res.json({
      enabled: Boolean(process.env.GEMINI_API_KEY),
      model: DEFAULT_LIVE_MODEL,
      voice: DEFAULT_LIVE_VOICE
    });
  });

  router.post('/live-token', async (_req, res, next) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        const error = new Error('Gemini Live is not configured yet.');
        error.statusCode = 503;
        throw error;
      }

      const token = await getGeminiClient().authTokens.create({
        config: {
          uses: 3,
          newSessionExpireTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          liveConnectConstraints: {
            model: DEFAULT_LIVE_MODEL,
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: DEFAULT_LIVE_VOICE
                  }
                }
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction:
                'You are Echo, a warm realtime reminder assistant. For any request about reminders, routines, schedules, due times, travel, office, home, or general tasks, call run_reminder_agent with the user message. For casual greetings or tiny conversational filler, you can answer directly. Keep spoken replies short and natural.'
            }
          },
          lockAdditionalFields: [
            'responseModalities',
            'speechConfig',
            'inputAudioTranscription',
            'outputAudioTranscription',
            'systemInstruction'
          ]
        }
      });

      res.json({
        token: token.name,
        model: DEFAULT_LIVE_MODEL,
        voice: DEFAULT_LIVE_VOICE
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error(error);
    }
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Gemini Live failed to start.' });
  });

  return router;
}

function getGeminiClient() {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1alpha'
    });
  }

  return geminiClient;
}
