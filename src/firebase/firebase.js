// TrafIQ Firebase initialisation (Firebase Web SDK — no Admin credentials).
//
// CONFIG RESOLUTION, per field:
//   1. VITE_FIREBASE_* from the environment — but only when it is NON-EMPTY.
//   2. FALLBACK_FIREBASE_CONFIG below — committed on purpose.
//
// Why the fallback exists: Vite gives host environment variables precedence
// over `.env.production`, so a host dashboard that defines VITE_FIREBASE_* with
// BLANK values silently overrode the committed config and left the deployed app
// in demo mode (writing nothing to Firestore). Empty values are now ignored, so
// the app cannot be knocked into demo mode by a half-filled dashboard.
//
// These are Firebase **Web SDK client identifiers**, not credentials. Google
// ships them in the browser bundle by design; access is controlled by
// firestore.rules and API key restrictions. Never put a service-account JSON or
// Admin SDK key in this file.
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const FALLBACK_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyByyL0MS2DAUzJBNeOTEStQOmsB8XZO8M4',
  authDomain: 'trafiq-7680f.firebaseapp.com',
  projectId: 'trafiq-7680f',
  storageBucket: 'trafiq-7680f.firebasestorage.app',
  messagingSenderId: '512367291994',
  appId: '1:512367291994:web:ee05cdcd954eb2c9abb263'
}

const env = import.meta.env || {}

// Use the environment value only when it actually carries a value.
const pick = (envValue, fallback) => {
  const v = typeof envValue === 'string' ? envValue.trim() : ''
  return v || fallback
}

const firebaseConfig = {
  apiKey: pick(env.VITE_FIREBASE_API_KEY, FALLBACK_FIREBASE_CONFIG.apiKey),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, FALLBACK_FIREBASE_CONFIG.authDomain),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, FALLBACK_FIREBASE_CONFIG.projectId),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, FALLBACK_FIREBASE_CONFIG.storageBucket),
  messagingSenderId: pick(env.VITE_FIREBASE_MESSAGING_SENDER_ID, FALLBACK_FIREBASE_CONFIG.messagingSenderId),
  appId: pick(env.VITE_FIREBASE_APP_ID, FALLBACK_FIREBASE_CONFIG.appId)
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

// Only reachable if the committed fallback above is deliberately blanked out.
if (!isFirebaseConfigured && import.meta.env.PROD) {
  console.warn(
    '[TrafIQ] Firebase is not configured in this production build — running in local demo mode.\n' +
      'Fill in FALLBACK_FIREBASE_CONFIG in src/firebase/firebase.js, or supply the ' +
      'VITE_FIREBASE_* variables at build time.'
  )
}

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
