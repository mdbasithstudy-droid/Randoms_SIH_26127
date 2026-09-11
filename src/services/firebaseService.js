// TrafIQ unified `cameraEvents` store — resilient local mirror + Firestore.
//
// The UI always reads from a single in-memory/local cache (newest-first,
// de-duplicated by refId), so detections, the recent-detections list and
// tracking work instantly and survive a refresh even if Firestore is briefly
// unavailable. In LIVE mode every CAMERA_PASSAGE is ALSO written to Firestore:
//   • Firestore collection: `cameraEvents`
//   • document: { vehicleId, numberPlate, vehicleModel, vehicleColour,
//                cameraId, location, simulationPlace, simulationDate,
//                eventType: "CAMERA_PASSAGE", detectionTimestamp: serverTimestamp() }
//
// Only camera-passage events are stored — never vehicle positions or camera config.
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
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

const COLLECTION = 'cameraEvents'
const BLACKLIST_COLLECTION = 'blacklistedVehicles'

const listeners = new Set()
let cache = [] // newest-first records (de-duplicated)
let firestoreUnsub = null

const blacklistListeners = new Set()
let blacklistCache = [] // Array of { id, numberPlate, createdAt }
let firestoreBlacklistUnsub = null

let mode = isFirebaseConfigured ? 'firestore' : 'demo'

const keyOf = (e) => e.refId || e.id || `${e.vehicleId}_${e.cameraId}_${e.ts}`

function normalizePlate(plate) {
  return (plate || '').toUpperCase().replace(/\s+/g, '')
}

// ---------- local persistence (mirror) ----------
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
    /* ignore */
  }
}

function loadLocalBlacklist() {
  try {
    const raw = JSON.parse(localStorage.getItem('trafiq_blacklist') || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function persistLocalBlacklist() {
  try {
    localStorage.setItem('trafiq_blacklist', JSON.stringify(blacklistCache))
  } catch {
    /* ignore */
  }
}

function upsert(list, rec) {
  const k = keyOf(rec)
  const next = list.filter((e) => keyOf(e) !== k)
  next.push(rec)
  next.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return next.slice(0, 500)
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

function notifyBlacklist() {
  blacklistListeners.forEach((cb) => {
    try {
      cb(blacklistCache)
    } catch {
      /* ignore listener errors */
    }
  })
}

function emitError(msg) {
  const errs = new Set(window.__trafiqErrors || [])
  errs.add(msg)
  window.__trafiqErrors = [...errs]
}

function normalizeDoc(id, d) {
  if (!d) return null
  const tsVal = d.timestamp && typeof d.timestamp.toMillis === 'function' ? d.timestamp.toMillis() : null
  const detTs = d.detectionTimestamp && typeof d.detectionTimestamp.toMillis === 'function' ? d.detectionTimestamp.toMillis() : null
  // prefer the client simulation-clock ts for a consistent journey display
  const ts = typeof d.ts === 'number' ? d.ts : detTs || tsVal || Date.now()
  return {
    id,
    refId: d.refId || id,
    vehicleId: d.vehicleId || '',
    numberPlate: d.numberPlate || '',
    vehicleModel: d.vehicleModel || '',
    vehicleColour: d.vehicleColour || '',
    cameraId: d.cameraId || '',
    location: d.location || '',
    simulationPlace: d.simulationPlace || d.simPlace || '',
    simulationDate: d.simulationDate || d.simDate || '',
    eventType: d.eventType || 'CAMERA_PASSAGE',
    isBlacklisted: Boolean(d.isBlacklisted),
    ts,
    source: 'firestore'
  }
}

function listenFirestore() {
  const db = getFirestoreDb()
  if (!db) return
  const q = query(collection(db, COLLECTION), limit(300))
  firestoreUnsub = onSnapshot(
    q,
    (snap) => {
      snap.docs.forEach((doc) => {
        const rec = normalizeDoc(doc.id, doc.data())
        if (rec) cache = upsert(cache, rec)
      })
      notify()
    },
    (err) => {
      console.error('Firebase connection error', err)
      emitError('Firebase connection error — showing local detections')
    }
  )
}

function listenFirestoreBlacklist() {
  const db = getFirestoreDb()
  if (!db) return
  const q = query(collection(db, BLACKLIST_COLLECTION))
  firestoreBlacklistUnsub = onSnapshot(
    q,
    (snap) => {
      const list = []
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data()
        if (data && data.numberPlate) {
          list.push({
            id: docSnap.id,
            numberPlate: normalizePlate(data.numberPlate),
            createdAt: data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.now()
          })
        }
      })
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      blacklistCache = list
      persistLocalBlacklist()
      notifyBlacklist()
    },
    (err) => {
      console.error('Firestore blacklist connection error', err)
    }
  )
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
    simulationPlace: payload.simulationPlace || payload.simPlace,
    simulationDate: payload.simulationDate || payload.simDate,
    eventType: payload.eventType || 'CAMERA_PASSAGE',
    isBlacklisted: Boolean(payload.isBlacklisted),
    ts: payload.ts || Date.now()
  }

  if (mode === 'firestore') {
    // local-first: record + persist instantly (UI + offline history always work)
    cache = upsert(cache, rec)
    persistLocal()
    notify()
    // best-effort Firestore write (client Web SDK — no secrets)
    try {
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore not initialised')
      const docRef = await addDoc(collection(db, COLLECTION), {
        vehicleId: rec.vehicleId,
        numberPlate: rec.numberPlate,
        vehicleModel: rec.vehicleModel,
        vehicleColour: rec.vehicleColour,
        cameraId: rec.cameraId,
        location: rec.location,
        simulationPlace: rec.simulationPlace,
        simulationDate: rec.simulationDate,
        eventType: rec.eventType,
        isBlacklisted: rec.isBlacklisted,
        refId: rec.refId,
        ts: rec.ts,
        detectionTimestamp: serverTimestamp()
      })
      rec.id = docRef.id
      rec.source = 'firestore'
      return rec
    } catch (e) {
      console.error('Firestore write failed', e)
      return { ...rec, ok: false, error: e }
    }
  }

  // demo mode (no Firebase env) — local store only
  cache = upsert(cache, rec)
  persistLocal()
  notify()
  return { ...rec, id: rec.refId, source: 'local' }
}

function subscribe(cb) {
  listeners.add(cb)
  if (cache.length) cb(cache)
  return () => listeners.delete(cb)
}

function subscribeBlacklist(cb) {
  blacklistListeners.add(cb)
  cb(blacklistCache)
  return () => blacklistListeners.delete(cb)
}

function getBlacklistedVehicles() {
  return blacklistCache
}

function isBlacklisted(rawPlate) {
  const plate = normalizePlate(rawPlate)
  if (!plate) return false
  return blacklistCache.some((item) => normalizePlate(item.numberPlate) === plate)
}

async function addBlacklistedVehicle(rawPlate) {
  const plate = normalizePlate(rawPlate)
  if (!plate) {
    return { ok: false, error: 'Empty number plate' }
  }
  if (blacklistCache.some((item) => normalizePlate(item.numberPlate) === plate)) {
    return { ok: false, error: 'Vehicle is already blacklisted' }
  }

  const newItem = {
    id: uid('bl'),
    numberPlate: plate,
    createdAt: Date.now()
  }

  blacklistCache = [newItem, ...blacklistCache]
  persistLocalBlacklist()
  notifyBlacklist()

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore not initialised')
      const docRef = await addDoc(collection(db, BLACKLIST_COLLECTION), {
        numberPlate: plate,
        createdAt: serverTimestamp()
      })
      newItem.id = docRef.id
      return { ok: true, item: newItem }
    } catch (e) {
      console.error('Firestore add blacklisted vehicle failed', e)
      return { ok: true, item: newItem, warning: 'Saved locally' }
    }
  }

  return { ok: true, item: newItem }
}

async function removeBlacklistedVehicle(target) {
  const normTarget = normalizePlate(target)
  const itemToRemove = blacklistCache.find(
    (item) => item.id === target || normalizePlate(item.numberPlate) === normTarget
  )

  if (!itemToRemove) {
    return { ok: false, error: 'Vehicle not found in blacklist' }
  }

  blacklistCache = blacklistCache.filter(
    (item) => item.id !== itemToRemove.id && normalizePlate(item.numberPlate) !== normTarget
  )
  persistLocalBlacklist()
  notifyBlacklist()

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (db) {
        if (itemToRemove.id && !itemToRemove.id.startsWith('bl_')) {
          await deleteDoc(doc(db, BLACKLIST_COLLECTION, itemToRemove.id))
        } else {
          const q = query(collection(db, BLACKLIST_COLLECTION), where('numberPlate', '==', normTarget))
          const snap = await getDocs(q)
          const deletePromises = snap.docs.map((d) => deleteDoc(d.ref))
          await Promise.all(deletePromises)
        }
      }
    } catch (e) {
      console.error('Firestore remove blacklisted vehicle failed', e)
    }
  }

  return { ok: true }
}

function init() {
  mode = isFirebaseConfigured ? 'firestore' : 'demo'
  blacklistCache = loadLocalBlacklist()
  cache = loadLocal()

  if (mode === 'firestore') {
    if (!firestoreUnsub) listenFirestore()
    if (!firestoreBlacklistUnsub) listenFirestoreBlacklist()
  }
  return mode
}

function getEvents() {
  return cache
}

/** Query a vehicle journey from the merged (mirror + Firestore) store. */
async function trackVehicle({ numberPlate, vehicleModel, vehicleColour }) {
  const plate = (numberPlate || '').trim().toUpperCase()
  if (!plate) return { ok: false, reason: 'NUMBER_PLATE_REQUIRED' }

  let rows = cache.filter((r) => r.numberPlate.toUpperCase() === plate)

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      const q = query(collection(db, COLLECTION), where('numberPlate', '==', plate), limit(300))
      const snap = await getDocs(q)
      snap.docs.forEach((doc) => {
        const rec = normalizeDoc(doc.id, doc.data())
        if (rec) cache = upsert(cache, rec)
      })
      rows = cache.filter((r) => r.numberPlate.toUpperCase() === plate)
    } catch (e) {
      console.warn('Firestore track unavailable — using local history', e)
    }
  }

  rows.sort((a, b) => (a.ts || 0) - (b.ts || 0)) // chronological
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

function onError(cb) {
  const poll = setInterval(() => {
    const arr = window.__trafiqErrors || []
    if (arr.length) {
      arr.splice(0).forEach(cb)
    }
  }, 900)
  return () => clearInterval(poll)
}

async function clearBlacklistRecordings() {
  const isBlacklistedRec = (e) => Boolean(e.isBlacklisted) === true || isBlacklisted(e.numberPlate)
  const toDelete = cache.filter(isBlacklistedRec)
  cache = cache.filter((e) => !isBlacklistedRec(e))
  persistLocal()
  notify()

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (db) {
        const deletePromises = toDelete
          .filter((e) => e.id && !e.id.startsWith('evt_'))
          .map((e) => deleteDoc(doc(db, COLLECTION, e.id)))
        await Promise.all(deletePromises)
      }
    } catch (e) {
      console.error('Failed to clear blacklisted cameraEvents from Firestore', e)
    }
  }

  return { ok: true }
}

async function clearAllDetections() {
  const toDelete = [...cache]
  cache = []
  persistLocal()
  notify()

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (db) {
        const deletePromises = toDelete
          .filter((e) => e.id && !e.id.startsWith('evt_'))
          .map((e) => deleteDoc(doc(db, COLLECTION, e.id)))
        await Promise.all(deletePromises)
      }
    } catch (e) {
      console.error('Failed to clear cameraEvents from Firestore', e)
    }
  }

  return { ok: true }
}

export const firebaseService = {
  init,
  getMode,
  addEvent,
  subscribe,
  subscribeBlacklist,
  getBlacklistedVehicles,
  isBlacklisted,
  addBlacklistedVehicle,
  removeBlacklistedVehicle,
  clearBlacklistRecordings,
  clearAllDetections,
  getEvents,
  trackVehicle,
  onError,
  isFirebaseConfigured
}

