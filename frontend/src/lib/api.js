const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'echo_auth_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
    throw new Error('Cannot reach the backend API. Check VITE_API_URL or make sure the backend is hosted.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed.');
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function signUpAccount({ name, email, password }) {
  const result = await request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  setAuthToken(result.token);
  return result.user;
}

export async function signInAccount({ email, password }) {
  const result = await request('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAuthToken(result.token);
  return result.user;
}

export async function fetchCurrentUser() {
  const result = await request('/api/auth/me');
  return result.user;
}

export function signOutAccount() {
  setAuthToken('');
}

export function fetchAdminStatus() {
  return request('/api/auth/admin-status');
}

export async function claimAdminAccount() {
  const result = await request('/api/auth/claim-admin', { method: 'POST' });
  return result.user;
}

export function fetchTasks(includeCompleted = false) {
  return request(`/api/tasks?includeCompleted=${includeCompleted}`);
}

export function parseTask(input, options = {}) {
  return request('/api/tasks/parse', {
    method: 'POST',
    body: JSON.stringify({ input, ...options })
  });
}

export function completeTask(id) {
  return request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'completed' })
  });
}

export function deleteTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export function askAgent(messages, sessionId = 'browser') {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, sessionId })
  });
}

export function listenForSpeech() {
  return request('/api/speech/listen', { method: 'POST' });
}

export function fetchActiveReminder() {
  return request('/api/chat/active-reminder');
}

export function respondToActiveReminder(action, time = '') {
  return request('/api/chat/active-reminder/respond', {
    method: 'POST',
    body: JSON.stringify({ action, time })
  });
}

export function fetchAdminOverview() {
  return request('/api/admin/overview');
}

export function updateUserAdmin(id, isAdmin) {
  return request(`/api/admin/users/${id}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin })
  });
}
