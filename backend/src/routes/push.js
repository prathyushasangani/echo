import express from 'express';
import {
  deletePushSubscription,
  getPushPublicKey,
  isPushConfigured,
  savePushSubscription
} from '../services/pushService.js';

export function createPushRouter(db) {
  const router = express.Router();

  router.get('/public-key', (_req, res) => {
    res.json({ publicKey: getPushPublicKey(), configured: isPushConfigured() });
  });

  router.post('/subscribe', async (req, res, next) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ error: 'Push notifications are not configured on the backend.' });
      }

      await savePushSubscription(db, req.user.id, req.body.subscription);
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/subscribe', async (req, res, next) => {
    try {
      await deletePushSubscription(db, req.user.id, String(req.body.endpoint || ''));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
