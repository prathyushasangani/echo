import 'dotenv/config';
import { initDb } from '../backend/src/db/database.js';
import { createApp } from '../backend/src/app.js';

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = initDb().then((db) => createApp(db));
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
