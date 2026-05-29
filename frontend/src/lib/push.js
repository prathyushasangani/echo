import { getAuthToken } from './api.js';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '');

export function canUsePushNotifications() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePushNotifications() {
  if (!canUsePushNotifications()) {
    throw new Error('This browser does not support web push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const keyResponse = await fetch(`${API_URL}/api/push/public-key`, {
    headers: authHeaders()
  });
  if (!keyResponse.ok) {
    throw new Error('Could not load push notification settings from the backend.');
  }

  const { publicKey, configured } = await keyResponse.json();
  if (!configured || !publicKey) {
    throw new Error('Push notifications are not configured on the backend.');
  }

  const basePath = import.meta.env.BASE_URL || '/';
  const registration = await navigator.serviceWorker.register(`${basePath}sw.js`);
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

  const response = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify({ subscription })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not save push subscription.');
  }

  return subscription;
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}
