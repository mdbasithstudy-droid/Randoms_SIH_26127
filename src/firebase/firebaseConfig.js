// Lazy Firebase web configuration.
// If the VITE_FIREBASE_* env vars are not set, the app automatically runs in
// OFFLINE DEMO MODE (a self-contained local event store) so the prototype
// works with zero external dependencies — ideal for demonstrations.
//
// When real values are supplied (see .env.example), this module initialises
// the Firebase Web SDK and the app streams from the live Firestore database.
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

function readConfig() {
  const env = import.meta.env || {}
  const apiKey = env.VITE_FIREBASE_API_KEY
  if (!apiKey) return null
  return {
    apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  }
}

const config = readConfig()
export const isFirebaseConfigured = Boolean(config)

let app = null
let db = null

export function getFirebaseApp() {
  if (!config) return null
  if (!app) app = getApps().length ? getApps()[0] : initializeApp(config)
  return app
}

export function getFirestoreDb() {
  if (!config) return null
  if (!db) db = getFirestore(getFirebaseApp())
  return db
}

export { getApp }
