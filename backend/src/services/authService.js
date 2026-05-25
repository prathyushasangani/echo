import crypto from 'node:crypto';
import { get, run } from '../db/database.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SECRET = process.env.AUTH_SECRET || 'echo-local-dev-secret-change-me';

export async function signUp(db, { name, email, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  validatePassword(password);

  if (!cleanName) {
    const error = new Error('Name is required.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await get(db, 'SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing) {
    const error = new Error('An account with this email already exists.');
    error.statusCode = 409;
    throw error;
  }

  const createdAt = new Date().toISOString();
  const result = await run(
    db,
    'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    [cleanName, cleanEmail, hashPassword(password), createdAt]
  );
  const user = await getPublicUser(db, result.id);
  return { user, token: createToken(user) };
}

export async function signIn(db, { email, password }) {
  const user = await get(db, 'SELECT * FROM users WHERE email = ?', [normalizeEmail(email)]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const publicUser = toPublicUser(user);
  return { user: publicUser, token: createToken(publicUser) };
}

export async function authenticateRequest(db, req, _res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const payload = verifyToken(token);
    const user = payload ? await getPublicUser(db, payload.id) : null;

    if (!user) {
      const error = new Error('Please sign in first.');
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function getPublicUser(db, id) {
  const user = await get(db, 'SELECT id, name, email, created_at FROM users WHERE id = ?', [id]);
  return user ? toPublicUser(user) : null;
}

function normalizeEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const error = new Error('Enter a valid email address.');
    error.statusCode = 400;
    throw error;
  }

  return cleanEmail;
}

function validatePassword(password) {
  if (String(password || '').length < 6) {
    const error = new Error('Password must be at least 6 characters.');
    error.statusCode = 400;
    throw error;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;

  const candidate = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  const candidateBuffer = Buffer.from(candidate, 'hex');
  const storedBuffer = Buffer.from(hash, 'hex');
  return candidateBuffer.length === storedBuffer.length && crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}

function createToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encodedPayload, signature] = String(token || '').split('.');
    if (!encodedPayload || !signature || sign(encodedPayload) !== signature) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload?.id || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}
