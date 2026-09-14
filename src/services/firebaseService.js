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
  updateDoc,
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
// Each entry is
//   { id, numberPlate, createdAt,
//     detectionCount, lastDetectedAt, lastCameraId, lastLocation,
//     detections: [{ ts, cameraId, location, vehicleModel, vehicleColour }] }
// Blacklisted plates are NEVER written to `cameraEvents` — their camera
// crossings are recorded here, on the blacklist document itself.
let blacklistCache = []
let firestoreBlacklistUnsub = null

// How many recent crossings are kept per blacklisted vehicle.
const BLACKLIST_DETECTION_LIMIT = 20

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

function normalizeBlacklistDoc(id, data) {
  const detections = Array.isArray(data.detections)
    ? data.detections.filter(Boolean).slice(0, BLACKLIST_DETECTION_LIMIT)
    : []
  const newest = detections[0] || null
  return {
    id,
    numberPlate: normalizePlate(data.numberPlate),
    createdAt: data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.now(),
    detectionCount: typeof data.detectionCount === 'number' ? data.detectionCount : detections.length,
    lastDetectedAt: typeof data.lastDetectedAt === 'number' ? data.lastDetectedAt : (newest ? newest.ts : null),
    lastCameraId: data.lastCameraId || (newest ? newest.cameraId : '') || '',
    lastLocation: data.lastLocation || (newest ? newest.location : '') || '',
    detections
  }
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
          list.push(normalizeBlacklistDoc(docSnap.id, data))
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
  // Invariant: `cameraEvents` NEVER contains a blacklisted plate. A blacklisted
  // vehicle is a security alert, not a traffic record, and lives only in
  // `blacklistedVehicles` (see recordBlacklistDetection). SimulationContext
  // already routes blacklisted crossings away from here, so this is a guard
  // against a future caller getting it wrong — and firestore.rules rejects it too.
  if (payload.isBlacklisted) {
    console.warn('[trafiq] refused to write blacklisted plate to cameraEvents:', payload.numberPlate)
    return { ok: true, skipped: true, reason: 'BLACKLISTED_NOT_A_CAMERA_EVENT' }
  }

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
    createdAt: Date.now(),
    detectionCount: 0,
    lastDetectedAt: null,
    lastCameraId: '',
    lastLocation: '',
    detections: []
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
        createdAt: serverTimestamp(),
        detectionCount: 0,
        detections: []
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

/**
 * Record a blacklisted vehicle crossing a camera — ON its blacklist entry.
 *
 * Blacklisted plates are deliberately never written to `cameraEvents`: they are
 * security alerts, not traffic records, and live only in `blacklistedVehicles`.
 * Each crossing is prepended to `detections` (capped at BLACKLIST_DETECTION_LIMIT)
 * and summarised by `lastDetectedAt` / `lastCameraId` / `lastLocation` /
 * `detectionCount`.
 */
async function recordBlacklistDetection({ numberPlate, vehicleModel, vehicleColour, cameraId, location, ts }) {
  const plate = normalizePlate(numberPlate)
  if (!plate) return { ok: false, error: 'Empty number plate' }

  const idx = blacklistCache.findIndex((item) => normalizePlate(item.numberPlate) === plate)
  if (idx === -1) return { ok: false, error: 'Vehicle is not blacklisted' }

  const prev = blacklistCache[idx]
  const detection = {
    ts: ts || Date.now(),
    cameraId: cameraId || '',
    location: location || '',
    vehicleModel: vehicleModel || '',
    vehicleColour: vehicleColour || ''
  }
  const nextItem = {
    ...prev,
    detectionCount: (prev.detectionCount || 0) + 1,
    lastDetectedAt: detection.ts,
    lastCameraId: detection.cameraId,
    lastLocation: detection.location,
    detections: [detection, ...(prev.detections || [])].slice(0, BLACKLIST_DETECTION_LIMIT)
  }

  // local-first: the Authority Console reflects the alert immediately
  blacklistCache = blacklistCache.map((item, i) => (i === idx ? nextItem : item))
  persistLocalBlacklist()
  notifyBlacklist()

  if (mode === 'firestore' && prev.id && !prev.id.startsWith('bl_')) {
    try {
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore not initialised')
      await updateDoc(doc(db, BLACKLIST_COLLECTION, prev.id), {
        detections: nextItem.detections,
        detectionCount: nextItem.detectionCount,
        lastDetectedAt: nextItem.lastDetectedAt,
        lastCameraId: nextItem.lastCameraId,
        lastLocation: nextItem.lastLocation
      })
      return { ok: true, item: nextItem, source: 'firestore' }
    } catch (e) {
      console.error('Firestore blacklist detection write failed', e)
      return { ok: true, item: nextItem, source: 'local', warning: 'Saved locally' }
    }
  }

  return { ok: true, item: nextItem, source: 'local' }
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
  // Plates are matched space-insensitively — the same rule the blacklist uses —
  // so "MH12AB4921" and "MH 12 AB 4921" resolve to the same vehicle. The full
  // event stream is already mirrored in `cache` (local history + realtime
  // listener), so the normalized filter works in both demo and Firestore mode.
  const plate = normalizePlate(numberPlate)
  if (!plate) return { ok: false, reason: 'NUMBER_PLATE_REQUIRED' }

  const matchesPlate = (r) => normalizePlate(r.numberPlate) === plate

  let rows = cache.filter(matchesPlate)

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      const q = query(collection(db, COLLECTION), where('numberPlate', '==', (numberPlate || '').trim().toUpperCase()), limit(300))
      const snap = await getDocs(q)
      snap.docs.forEach((doc) => {
        const rec = normalizeDoc(doc.id, doc.data())
        if (rec) cache = upsert(cache, rec)
      })
      rows = cache.filter(matchesPlate)
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

/**
 * Clear the recorded crossings from every blacklist entry, and purge any
 * legacy blacklisted records still sitting in `cameraEvents` from before the
 * two were separated.
 */
async function clearBlacklistRecordings() {
  blacklistCache = blacklistCache.map((item) => ({
    ...item,
    detectionCount: 0,
    lastDetectedAt: null,
    lastCameraId: '',
    lastLocation: '',
    detections: []
  }))
  persistLocalBlacklist()
  notifyBlacklist()

  // legacy cleanup — blacklisted plates should never be in cameraEvents
  const isBlacklistedRec = (e) => Boolean(e.isBlacklisted) === true || isBlacklisted(e.numberPlate)
  const legacyEvents = cache.filter(isBlacklistedRec)
  if (legacyEvents.length) {
    cache = cache.filter((e) => !isBlacklistedRec(e))
    persistLocal()
    notify()
  }

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (db) {
        await Promise.all(
          blacklistCache
            .filter((item) => item.id && !item.id.startsWith('bl_'))
            .map((item) =>
              updateDoc(doc(db, BLACKLIST_COLLECTION, item.id), {
                detections: [],
                detectionCount: 0,
                lastDetectedAt: null,
                lastCameraId: '',
                lastLocation: ''
              })
            )
        )
        await Promise.all(
          legacyEvents
            .filter((e) => e.id && !e.id.startsWith('evt_'))
            .map((e) => deleteDoc(doc(db, COLLECTION, e.id)))
        )
      }
    } catch (e) {
      console.error('Failed to clear blacklist recordings from Firestore', e)
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
  recordBlacklistDetection,
  clearBlacklistRecordings,
  clearAllDetections,
  getEvents,
  trackVehicle,
  onError,
  isFirebaseConfigured
}

