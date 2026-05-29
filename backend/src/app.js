import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createChatRouter } from './routes/chat.js';
import { createPushRouter } from './routes/push.js';
import { createSpeechRouter } from './routes/speech.js';
import { createTaskRouter } from './routes/tasks.js';
import { authenticateRequest } from './services/authService.js';
import { getWakeWordStatus, testWakeWordCommand } from './services/wakeWordService.js';

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://echo-96caa.web.app',
  'https://echo-96caa.firebaseapp.com',
  'https://personal-reminder-agent.vercel.app',
  'https://echo.prathyushasangani.com'
];

export function createApp(db) {
  const app = express();
  const allowedOrigins = [
    ...defaultAllowedOrigins,
    ...(process.env.CORS_ORIGIN || '').split(',')
  ]
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || isAllowedVercelPreview(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked origin: ${origin}`));
        }
      }
    })
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/admin', createAdminRouter(db));
  app.use('/api/tasks', authenticateRequest.bind(null, db), createTaskRouter(db));
  app.use('/api/chat', authenticateRequest.bind(null, db), createChatRouter(db));
  app.use('/api/push', authenticateRequest.bind(null, db), createPushRouter(db));
  app.use('/api/speech', createSpeechRouter());

  app.get('/api/wake/status', (_req, res) => {
    res.json(getWakeWordStatus());
  });

  app.post('/api/wake/test', async (req, res, next) => {
    try {
      const command = String(req.body.command || 'hello echo').trim();
      res.json(await testWakeWordCommand(db, command));
    } catch (error) {
      next(error);
    }
  });

  const frontendDist = resolveFrontendDist();
  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((error, _req, res, _next) => {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error(error);
    }
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unexpected server error.' });
  });

  return app;
}

function isAllowedVercelPreview(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.startsWith('personal-reminder-agent-') && hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function resolveFrontendDist() {
  const configuredPath = process.env.FRONTEND_DIST;
  const candidate = configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), '../frontend/dist');
  const indexPath = path.join(candidate, 'index.html');
  return fs.existsSync(indexPath) ? candidate : '';
}
