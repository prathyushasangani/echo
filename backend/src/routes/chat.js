import express from 'express';
import { askReminderAgent, getActiveReminder, respondToActiveReminder } from '../services/chatAgent.js';

export function createChatRouter(db) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
      const sessionId = String(req.body.sessionId || 'default');
      const answer = await askReminderAgent(db, messages, sessionId);
      res.json(answer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/active-reminder', async (_req, res, next) => {
    try {
      res.json({ reminder: await getActiveReminder(db) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/active-reminder/respond', async (req, res, next) => {
    try {
      const answer = await respondToActiveReminder(db, req.body);
      res.json(answer);
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error(error);
    }
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Chat agent failed to answer.' });
  });

  return router;
}
