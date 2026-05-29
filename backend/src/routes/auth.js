import express from 'express';
import { authenticateRequest, claimAdmin, getAdminStatus, signIn, signInWithGoogle, signUp } from '../services/authService.js';

export function createAuthRouter(db) {
  const router = express.Router();

  router.post('/signup', async (req, res, next) => {
    try {
      res.status(201).json(await signUp(db, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.post('/signin', async (req, res, next) => {
    try {
      res.json(await signIn(db, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.post('/google', async (req, res, next) => {
    try {
      res.json(await signInWithGoogle(db, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', authenticateRequest.bind(null, db), (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/admin-status', async (_req, res, next) => {
    try {
      res.json(await getAdminStatus(db));
    } catch (error) {
      next(error);
    }
  });

  router.post('/claim-admin', authenticateRequest.bind(null, db), async (req, res, next) => {
    try {
      res.json({ user: await claimAdmin(db, req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Authentication failed.' });
  });

  return router;
}
