import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBk-yimzqJm_TYS2bEJFu8Qd4G1RTvKs2E',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'echo-96caa.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'echo-96caa',
  appId: env.VITE_FIREBASE_APP_ID || '1:1015467883772:web:c76a5f37cb04b78fc02b79'
};

let app;

export function getFirebaseApp() {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}

export function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every(Boolean);
}
