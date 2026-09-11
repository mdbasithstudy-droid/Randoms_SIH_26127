// TrafIQ Firebase initialisation (Firebase Web SDK — no Admin credentials).
//
// The app reads configuration from Vite environment variables (see .env.local):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
//   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
//
// If no API key is present the app still runs in a fully-local demo mode (no
// Firebase calls). Never put a service-account JSON / Admin SDK here.
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const env = import.meta.env || {}
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

const existing = getApps()
export const app = isFirebaseConfigured
  ? existing.length
    ? existing[0]
    : initializeApp(firebaseConfig)
  : null

export const db = app ? getFirestore(app) : null

export function getFirebaseApp() {
  return app
}

export function getFirestoreDb() {
  return db
}

export default app
