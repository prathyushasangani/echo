import express from 'express';
import { listenOnce } from '../services/speechService.js';

export function createSpeechRouter() {
  const router = express.Router();

  router.post('/listen', async (_req, res, next) => {
    try {
      const transcript = await listenOnce();
      res.json({ transcript });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    const message = error.message || 'Voice input failed.';
    if (!/did not hear|speech recognition exited/i.test(message)) {
      console.error(error);
    }
    res.status(408).json({ error: message });
  });

  return router;
}
