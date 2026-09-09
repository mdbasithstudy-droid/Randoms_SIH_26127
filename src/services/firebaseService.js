// Unified "vehicleEvents" store.
//
// Two runtime modes, auto-detected from the environment:
//
//  LIVE MODE   — VITE_FIREBASE_* configured → events live in Firestore.
//                • Writes go through the Python API (POST /api/camera-event),
//                  which writes Firestore server-side with the Admin SDK.
//                  If the backend is unreachable we fall back to a direct
//                  client-side Firestore add (still safe — web SDK, no secrets).
//                • Reads / realtime updates use Firestore onSnapshot.
//
//  DEMO MODE   — No Firebase env → fully self-contained local store persisted
//                in localStorage. Perfect for the demonstration: events are
//                written instantly, survive a page refresh, and the admin
//                dashboard updates in real time with zero external services.
//
// IMPORTANT: vehicle position / animation frames are NEVER stored. Only
// CAMERA_PASSAGE events reach this store.
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'firebase/firestore'

import { getFirestoreDb, isFirebaseConfigured } from '../firebase/firebaseConfig'
import { uid } from '../utils/format'
import { STORAGE_KEYS } from '../data/constants'
import * as api from './api'

const COLLECTION = 'vehicleEvents'

const listeners = new Set()
let cache = [] // newest-first cached records (demo mode source of truth)
let firestoreUnsub = null
let mode = isFirebaseConfigured ? 'firestore' : 'demo'

// ---------- demo-mode local persistence ----------
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(cache.slice(0, 500)))
  } catch {
    /* storage full / private mode — keep in memory */
  }
}

function notify() {
  listeners.forEach((cb) => {
    try {
      cb(cache)
    } catch {
      /* ignore listener errors */
    }
  })
}

// ---------- firestore live mode ----------
function listenFirestore() {
  const db = getFirestoreDb()
  if (!db) return
  const q = query(collection(db, COLLECTION), orderBy('timestamp', 'desc'), limit(300))
  firestoreUnsub = onSnapshot(
    q,
    (snap) => {
      cache = snap.docs
        .map((doc) => normalizeDoc(doc.id, doc.data()))
        .filter(Boolean)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      notify()
    },
    (err) => {
      console.error('FIREBASE CONNECTION ERROR', err)
      emitError(`FIREBASE CONNECTION ERROR — ${err?.message || 'listener failed'}`)
    }
  )
}

function normalizeDoc(id, d) {
  if (!d) return null
  const serverTs = d.timestamp && typeof d.timestamp.toMillis === 'function' ? d.timestamp.toMillis() : null
  return {
    id,
    refId: d.refId || id,
    vehicleId: d.vehicleId || '',
    numberPlate: d.numberPlate || '',
    vehicleModel: d.vehicleModel || '',
    vehicleColour: d.vehicleColour || '',
    cameraId: d.cameraId || '',
    location: d.location || '',
    simPlace: d.simPlace || '',
    simDate: d.simDate || '',
    simStartTime: d.simStartTime || '',
    eventType: d.eventType || 'CAMERA_PASSAGE',
    ts: serverTs || d.ts || Date.now(),
    source: 'firestore'
  }
}

// ---------- public API ----------
function getMode() {
  return mode
}

async function addEvent(payload) {
  const rec = {
    refId: payload.refId || uid('evt'),
    vehicleId: payload.vehicleId,
    numberPlate: payload.numberPlate,
    vehicleModel: payload.vehicleModel,
    vehicleColour: payload.vehicleColour,
    cameraId: payload.cameraId,
    location: payload.location,
    simPlace: payload.simPlace,
    simDate: payload.simDate,
    simStartTime: payload.simStartTime,
    eventType: payload.eventType || 'CAMERA_PASSAGE',
    // the simulation-clock detection time (actual crossing time); falls back to now
    ts: payload.ts || Date.now()
  }

  if (mode === 'firestore') {
    // Preferred authoritative path: Python backend -> Firestore Admin.
    const r = await api.postCameraEvent(rec).catch(() => ({ ok: false }))
    if (r.ok) return { ...rec, source: 'backend' }
    // Fallback: write directly with the client web SDK (no secrets exposed).
    try {
      const db = getFirestoreDb()
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...rec,
        timestamp: serverTimestamp()
      })
      return { ...rec, id: docRef.id, source: 'firestore' }
    } catch (e) {
      console.error('Firestore write failed', e)
      return { ...rec, ok: false, error: e }
    }
  }

  // demo mode — local store is authoritative and instant
  cache = [rec, ...cache.filter((x) => x.refId !== rec.refId)]
  persistLocal()
  notify()

  // Best-effort sync to the Python backend so a real Firestore/DB record also
  // exists when the backend is running (never blocks the UI).
  if (api.isBackendOnline() !== false) {
    api.postCameraEvent(rec).then(() => {}).catch(() => {})
  }
  return { ...rec, id: rec.refId, source: 'local' }
}

/** Subscribe to realtime camera events. Returns unsubscribe fn. */
function subscribe(cb) {
  listeners.add(cb)
  if (cache.length) cb(cache)
  return () => listeners.delete(cb)
}

/** Initialise live listeners for the current mode. Safe to call repeatedly. */
function init() {
  mode = isFirebaseConfigured ? 'firestore' : 'demo'
  if (mode === 'demo') {
    cache = loadLocal()
    // probe backend once (non-blocking) so event sync can activate
    api.checkBackend().then(() => {})
  } else if (!firestoreUnsub) {
    cache = []
    listenFirestore()
  }
  return mode
}

function getEvents() {
  return cache
}

/** Query the local / live store for a vehicle journey. */
async function trackVehicle({ numberPlate, vehicleModel, vehicleColour }) {
  const plate = (numberPlate || '').trim().toUpperCase()
  if (!plate) return { ok: false, reason: 'NUMBER_PLATE_REQUIRED' }

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      let q = query(
        collection(db, COLLECTION),
        where('numberPlate', '==', plate),
        orderBy('timestamp', 'desc'),
        limit(200)
      )
      const snap = await getDocs(q)
      let rows = snap.docs.map((d) => normalizeDoc(d.id, d.data())).filter(Boolean)
      rows = applyFilters(rows, vehicleModel, vehicleColour)
      return { ok: true, rows, count: rows.length }
    } catch (e) {
      console.error('Firestore track failed', e)
      return { ok: false, reason: 'FIREBASE_ERROR', error: e }
    }
  }

  // demo mode — local store
  let rows = cache.filter((r) => r.numberPlate.toUpperCase() === plate)
  rows = applyFilters(rows, vehicleModel, vehicleColour)
  return { ok: true, rows, count: rows.length }
}

function applyFilters(rows, model, colour) {
  let out = rows
  if (model) {
    const m = model.trim().toLowerCase()
    if (m) out = out.filter((r) => (r.vehicleModel || '').toLowerCase() === m)
  }
  if (colour) {
    const c = colour.trim().toLowerCase()
    if (c) out = out.filter((r) => (r.vehicleColour || '').toLowerCase() === c)
  }
  return out
}

function emitError(msg) {
  const errs = new Set(window.__trafiqErrors || [])
  errs.add(msg)
  window.__trafiqErrors = [...errs]
}

function onError(cb) {
  const poll = setInterval(() => {
    const arr = window.__trafiqErrors || []
    if (arr.length) {
      arr.splice(0).forEach(cb)
    }
  }, 800)
  return () => clearInterval(poll)
}

export const firebaseService = {
  init,
  getMode,
  addEvent,
  subscribe,
  getEvents,
  trackVehicle,
  onError,
  isFirebaseConfigured
}
