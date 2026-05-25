import express from 'express';
import { authenticateRequest, signIn, signUp } from '../services/authService.js';

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

  router.get('/me', authenticateRequest.bind(null, db), (req, res) => {
    res.json({ user: req.user });
  });

  router.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Authentication failed.' });
  });

  return router;
}
