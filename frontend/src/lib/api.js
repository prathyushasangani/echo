const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed.');
  }

  if (response.status === 204) return null;
  return response.json();
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
