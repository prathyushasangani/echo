import webPush from 'web-push';
import { all, run } from '../db/database.js';

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (publicKey && privateKey) {
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

export function getPushPublicKey() {
  return publicKey;
}

export function isPushConfigured() {
  return Boolean(publicKey && privateKey);
}

export async function savePushSubscription(db, userId, subscription) {
  validateSubscription(subscription);
  const now = new Date().toISOString();
  await run(db, 'DELETE FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
  await run(
    db,
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, subscription.endpoint, JSON.stringify(subscription), now, now]
  );
}

export async function deletePushSubscription(db, userId, endpoint) {
  await run(db, 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
}

export async function sendPushToUser(db, userId, payload) {
  if (!isPushConfigured() || !userId) return;

  const subscriptions = await all(db, 'SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  await Promise.all(
    subscriptions.map(async (record) => {
      try {
        await webPush.sendNotification(JSON.parse(record.subscription_json), JSON.stringify(payload));
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await run(db, 'DELETE FROM push_subscriptions WHERE endpoint = ?', [record.endpoint]);
          return;
        }

        console.error('Push notification failed:', error.message);
      }
    })
  );
}

function validateSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const error = new Error('Invalid push subscription.');
    error.statusCode = 400;
    throw error;
  }
}
