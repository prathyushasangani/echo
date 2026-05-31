import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseClient.js';

const env = import.meta.env || {};
const API_URL = env.VITE_API_URL || (env.DEV ? 'http://localhost:4000' : '');
const TOKEN_KEY = 'echo_auth_token';
const USER_KEY = 'echo_auth_user';
const ADMIN_EMAIL = 'pratsa@gmail.com';
const USE_FIREBASE_CLIENT = !env.DEV && !env.VITE_API_URL && env.VITE_BACKEND_MODE !== 'api';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getAuthToken();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });
  } catch {
    throw new Error('Cannot reach the backend API. Make sure the backend is running.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    throw new Error(payload.error || 'Request failed.');
  }

  if (response.status === 204) return null;
  if (!contentType.includes('application/json')) {
    throw new Error('The backend returned a non-JSON response.');
  }
  return response.json();
}

export async function signUpAccount({ name, email, password }) {
  if (USE_FIREBASE_CLIENT) {
    const auth = getFirebaseAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    const user = await ensureUserProfile(credential.user, name);
    setAuthToken('firebase');
    setCachedUser(user);
    return user;
  }

  const result = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  setAuthToken(result.token);
  setCachedUser(result.user);
  return result.user;
}

export async function signInAccount({ email, password }) {
  if (USE_FIREBASE_CLIENT) {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    const user = await ensureUserProfile(credential.user);
    setAuthToken('firebase');
    setCachedUser(user);
    return user;
  }

  const result = await request('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAuthToken(result.token);
  setCachedUser(result.user);
  return result.user;
}

export async function signInWithGoogleAccount(idToken) {
  if (USE_FIREBASE_CLIENT) {
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser) throw new Error('Google sign-in did not finish. Please try again.');
    const user = await ensureUserProfile(firebaseUser);
    setAuthToken('firebase');
    setCachedUser(user);
    return user;
  }

  const result = await request('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
  setAuthToken(result.token);
  setCachedUser(result.user);
  return result.user;
}

export async function fetchCurrentUser() {
  if (USE_FIREBASE_CLIENT) {
    const firebaseUser = await waitForFirebaseUser();
    if (!firebaseUser) throw new Error('No signed-in user.');
    const user = await ensureUserProfile(firebaseUser);
    setCachedUser(user);
    return user;
  }

  const result = await request('/api/auth/me');
  setCachedUser(result.user);
  return result.user;
}

export function signOutAccount() {
  if (USE_FIREBASE_CLIENT) {
    signOut(getFirebaseAuth()).catch(() => {});
  }
  setAuthToken('');
  setCachedUser(null);
}

export async function fetchAdminStatus() {
  if (USE_FIREBASE_CLIENT) return { hasAdmin: true };
  return request('/api/auth/admin-status');
}

export async function claimAdminAccount() {
  if (USE_FIREBASE_CLIENT) return fetchCurrentUser();
  const result = await request('/api/auth/claim-admin', { method: 'POST' });
  return result.user;
}

export async function fetchTasks(includeCompleted = false) {
  if (USE_FIREBASE_CLIENT) {
    const tasksRef = await getTasksCollection();
    const snapshot = await getDocs(query(tasksRef, orderBy('due_at')));
    return snapshot.docs
      .map((taskDoc) => mapClientTask(taskDoc.id, taskDoc.data()))
      .filter((task) => includeCompleted || task.status === 'pending');
  }

  return request(`/api/tasks?includeCompleted=${includeCompleted}`);
}

export async function parseTask(input, options = {}) {
  if (USE_FIREBASE_CLIENT) {
    const inputText = String(input || '').trim();
    const title = cleanClientTitle(inputText);
    if (!inputText) throw new Error('Input is required.');

    const tasksRef = await getTasksCollection();
    const task = {
      title,
      description: '',
      created_at: new Date().toISOString(),
      due_at: parseClientDueDate(inputText).toISOString(),
      status: 'pending',
      is_recurring: Boolean(options.is_recurring),
      category: options.category || 'General',
      last_notified_at: null
    };
    const created = await addDoc(tasksRef, { ...task, createdAt: serverTimestamp() });
    return { id: created.id, ...task };
  }

  return request('/api/tasks/parse', {
    method: 'POST',
    body: JSON.stringify({ input, ...options })
  });
}

export async function completeTask(id) {
  if (USE_FIREBASE_CLIENT) {
    const taskRef = await getTaskDoc(id);
    const snapshot = await getDoc(taskRef);
    if (!snapshot.exists()) throw new Error('Task not found.');

    const task = snapshot.data();
    if (task.is_recurring) {
      const nextDue = new Date(task.due_at);
      nextDue.setDate(nextDue.getDate() + 1);
      await updateDoc(taskRef, { due_at: nextDue.toISOString(), status: 'pending', last_notified_at: null });
    } else {
      await updateDoc(taskRef, { status: 'completed' });
    }
    return { id, ...task };
  }

  return request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'completed' })
  });
}

export async function deleteTask(id) {
  if (USE_FIREBASE_CLIENT) {
    await deleteDoc(await getTaskDoc(id));
    return null;
  }

  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export async function notifyDueTasks() {
  if (!USE_FIREBASE_CLIENT) return [];

  const now = new Date().toISOString();
  const tasksRef = await getTasksCollection();
  const snapshot = await getDocs(query(tasksRef, orderBy('due_at')));
  const dueTasks = snapshot.docs
    .map((taskDoc) => mapClientTask(taskDoc.id, taskDoc.data()))
    .filter((task) => isDueForClientNotification(task, now));

  await Promise.all(
    dueTasks.map((task) => updateDoc(doc(tasksRef, String(task.id)), { last_notified_at: now }))
  );
  return dueTasks;
}

export function askAgent(messages, sessionId = 'browser') {
  if (USE_FIREBASE_CLIENT) {
    const latest = messages.at(-1)?.content || '';
    return Promise.resolve({
      reply: latest
        ? 'Hosted free mode can save reminders, but the chat assistant needs the local backend or Firebase Functions.'
        : 'How can I help?'
    });
  }

  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, sessionId })
  });
}

export function listenForSpeech() {
  if (USE_FIREBASE_CLIENT) {
    return Promise.reject(new Error('Voice listening needs the local backend.'));
  }
  return request('/api/speech/listen', { method: 'POST' });
}

export function fetchActiveReminder() {
  if (USE_FIREBASE_CLIENT) return Promise.resolve(null);
  return request('/api/chat/active-reminder');
}

export function respondToActiveReminder(action, time = '') {
  if (USE_FIREBASE_CLIENT) return Promise.resolve(null);
  return request('/api/chat/active-reminder/respond', {
    method: 'POST',
    body: JSON.stringify({ action, time })
  });
}

export function fetchAdminOverview() {
  if (USE_FIREBASE_CLIENT) {
    return Promise.resolve({ users: [], reminders: [] });
  }
  return request('/api/admin/overview');
}

export function fetchGeminiLiveStatus() {
  if (USE_FIREBASE_CLIENT) {
    return Promise.resolve({ enabled: false, model: '', voice: '' });
  }
  return request('/api/gemini/status');
}

export function createGeminiLiveToken() {
  if (USE_FIREBASE_CLIENT) {
    return Promise.reject(new Error('Gemini Live needs the hosted backend.'));
  }
  return request('/api/gemini/live-token', { method: 'POST' });
}

export function updateUserAdmin(id, isAdmin) {
  if (USE_FIREBASE_CLIENT) return Promise.resolve(null);
  return request(`/api/admin/users/${id}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin })
  });
}

async function ensureUserProfile(firebaseUser, fallbackName = '') {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', firebaseUser.uid);
  const snapshot = await getDoc(userRef);
  const email = firebaseUser.email || '';
  const profile = {
    id: firebaseUser.uid,
    name: snapshot.data()?.name || fallbackName || firebaseUser.displayName || email.split('@')[0] || 'User',
    email,
    is_admin: email.toLowerCase() === ADMIN_EMAIL,
    created_at: snapshot.data()?.created_at || new Date().toISOString()
  };

  await setDoc(userRef, profile, { merge: true });
  return profile;
}

function waitForFirebaseUser() {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function getTasksCollection() {
  const firebaseUser = await waitForFirebaseUser();
  if (!firebaseUser) throw new Error('Please sign in again.');
  return collection(getFirebaseDb(), 'users', firebaseUser.uid, 'tasks');
}

async function getTaskDoc(id) {
  const firebaseUser = await waitForFirebaseUser();
  if (!firebaseUser) throw new Error('Please sign in again.');
  return doc(getFirebaseDb(), 'users', firebaseUser.uid, 'tasks', String(id));
}

function mapClientTask(id, data) {
  return {
    id,
    title: data.title || '',
    description: data.description || '',
    created_at: data.created_at || new Date().toISOString(),
    due_at: data.due_at || new Date().toISOString(),
    status: data.status || 'pending',
    is_recurring: Boolean(data.is_recurring),
    category: data.category || 'General',
    last_notified_at: data.last_notified_at || null
  };
}

export function parseClientDueDate(input, now = new Date()) {
  const lower = String(input || '').toLowerCase();
  const durationDue = parseRelativeDuration(lower, now);
  if (durationDue) return durationDue;

  const due = new Date(now);
  const timeMatch = lower.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);

  if (lower.includes('tomorrow')) {
    due.setDate(due.getDate() + 1);
  }

  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3];
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    due.setHours(hour, minute, 0, 0);
    if (!lower.includes('tomorrow') && due <= now) due.setDate(due.getDate() + 1);
  } else {
    due.setHours(now.getHours() + 1, 0, 0, 0);
  }

  return due;
}

function parseRelativeDuration(input, now) {
  const match = String(input || '').match(
    /\b(?:after|in)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|d)\b/i
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith('s')
    ? 1000
    : unit.startsWith('m')
      ? 60 * 1000
      : unit.startsWith('h')
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

  return new Date(now.getTime() + amount * multiplier);
}

function cleanClientTitle(input) {
  return String(input || '')
    .replace(/^(can\s+you|could\s+you|please)\s+/i, '')
    .replace(/^(remind me to|remind me|remember to|add a reminder to|reminder to)\s+/i, '')
    .replace(/\b(?:after|in)\s+\d+(?:\.\d+)?\s*(seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|d)\b/gi, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!,;:]$/, '') || 'Reminder';
}

function isDueForClientNotification(task, nowIso) {
  return task.status === 'pending' && !task.last_notified_at && task.due_at <= nowIso;
}

function formatFirebaseError(error) {
  if (error?.code === 'auth/popup-closed-by-user') {
    return new Error('Google sign-in was closed before it finished.');
  }
  if (error?.code === 'auth/unauthorized-domain') {
    return new Error('Google sign-in is blocked because this site domain is not authorized in Firebase Authentication.');
  }
  if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
    return new Error('Invalid email or password.');
  }
  if (error?.code === 'auth/email-already-in-use') {
    return new Error('An account with this email already exists.');
  }
  if (error?.code === 'auth/operation-not-allowed') {
    return new Error('Password sign-in is not enabled in Firebase Authentication yet.');
  }
  return new Error(error?.message || 'Authentication failed.');
}
