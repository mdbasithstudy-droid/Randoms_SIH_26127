// TrafIQ Firestore layer — resilient local mirror + two collections.
//
//   cameraEvents        → NORMAL (non-blacklisted) camera passages ONLY
//   blacklistedVehicles → the watchlist AND blacklisted vehicle detections
//
// A vehicle is written to Firestore ONLY when it actually crosses a camera.
// Fleet creation is application state only — it never touches Firestore.
//
// `detectionTimestamp` is ALWAYS the camera's configured session date/time
// (Camera Configuration UI), never serverTimestamp() and never the browser
// clock. See buildDetectionDate() / src/utils/format.js -> cameraDateTime().
//
// The UI reads from in-memory/local caches (newest-first, de-duplicated by
// refId) so detections, the recent list and tracking work instantly and survive
// a refresh even when Firestore is briefly unavailable.
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  limit,
  where,
  onSnapshot,
  getDocs,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'

import { getFirestoreDb, isFirebaseConfigured } from '../firebase/firebaseConfig'
import { uid } from '../utils/format'
import { STORAGE_KEYS } from '../data/constants'

const COLLECTION = 'cameraEvents'
const BLACKLIST_COLLECTION = 'blacklistedVehicles'

// Discriminates a blacklisted DETECTION document from a blacklist watchlist
// ENTRY inside `blacklistedVehicles`.
const BLACKLIST_DETECTION_EVENT = 'BLACKLISTED_VEHICLE_DETECTION'
const CAMERA_PASSAGE_EVENT = 'CAMERA_PASSAGE'

const listeners = new Set()
let cache = [] // newest-first cameraEvents (de-duplicated)
let firestoreUnsub = null

// Watchlist entries: [{ id, numberPlate, createdAt }]
const blacklistListeners = new Set()
let blacklistCache = []
let firestoreBlacklistUnsub = null

// Blacklisted detections: [{ id, refId, numberPlate, ..., detectionTimestamp }]
const blacklistDetectionListeners = new Set()
let blacklistDetectionCache = []

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
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.blacklist) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function persistLocalBlacklist() {
  try {
    localStorage.setItem(STORAGE_KEYS.blacklist, JSON.stringify(blacklistCache))
  } catch {
    /* ignore */
  }
}

function loadLocalBlacklistDetections() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.blacklistDetections) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function persistLocalBlacklistDetections() {
  try {
    localStorage.setItem(STORAGE_KEYS.blacklistDetections, JSON.stringify(blacklistDetectionCache.slice(0, 500)))
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

function notifyBlacklistDetections() {
  blacklistDetectionListeners.forEach((cb) => {
    try {
      cb(blacklistDetectionCache)
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
  // `detectionTimestamp` is the camera's configured session time — authoritative.
  const ts = detTs != null ? detTs : (typeof d.ts === 'number' ? d.ts : (tsVal != null ? tsVal : Date.now()))
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
    eventType: d.eventType || CAMERA_PASSAGE_EVENT,
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

// A watchlist ENTRY — created by the Authority Console when a plate is added.
function normalizeBlacklistEntry(id, data) {
  return {
    id,
    numberPlate: normalizePlate(data.numberPlate),
    createdAt: data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.now()
  }
}

// A blacklisted vehicle DETECTION — one document per camera crossing.
function normalizeBlacklistDetectionDoc(id, d) {
  if (!d) return null
  const detTs = d.detectionTimestamp && typeof d.detectionTimestamp.toMillis === 'function'
    ? d.detectionTimestamp.toMillis()
    : null
  const ts = detTs != null ? detTs : (typeof d.ts === 'number' ? d.ts : Date.now())
  return {
    id,
    refId: d.refId || id,
    vehicleId: d.vehicleId || '',
    numberPlate: d.numberPlate || '',
    vehicleModel: d.vehicleModel || '',
    vehicleColour: d.vehicleColour || '',
    cameraId: d.cameraId || '',
    location: d.location || '',
    simulationPlace: d.simulationPlace || '',
    simulationDate: d.simulationDate || '',
    eventType: BLACKLIST_DETECTION_EVENT,
    isBlacklisted: true,
    ts,
    source: 'firestore'
  }
}

const isBlacklistDetectionDoc = (data) => data && data.eventType === BLACKLIST_DETECTION_EVENT

function listenFirestoreBlacklist() {
  const db = getFirestoreDb()
  if (!db) return
  const q = query(collection(db, BLACKLIST_COLLECTION), limit(500))
  firestoreBlacklistUnsub = onSnapshot(
    q,
    (snap) => {
      const entries = []
      let detections = blacklistDetectionCache
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data()
        if (!data || !data.numberPlate) return
        if (isBlacklistDetectionDoc(data)) {
          const rec = normalizeBlacklistDetectionDoc(docSnap.id, data)
          if (rec) detections = upsertDetection(detections, rec)
        } else {
          entries.push(normalizeBlacklistEntry(docSnap.id, data))
        }
      })
      entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      blacklistCache = entries
      blacklistDetectionCache = detections
      persistLocalBlacklist()
      persistLocalBlacklistDetections()
      notifyBlacklist()
      notifyBlacklistDetections()
    },
    (err) => {
      console.error('Firestore blacklist connection error', err)
    }
  )
}

function upsertDetection(list, rec) {
  const k = keyOf(rec)
  const next = list.filter((e) => keyOf(e) !== k)
  next.push(rec)
  next.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return next.slice(0, 500)
}

// ---------- public API ----------
function getMode() {
  return mode
}

/**
 * Camera-configured session time -> Firestore Timestamp.
 *
 * `date` is a LOCAL-time Date built from the camera's configured date + start
 * time (src/utils/format.js -> cameraDateTime). We deliberately never use
 * serverTimestamp() or the browser clock here: the time configured for that
 * camera in the Camera Configuration UI is the authoritative detection time.
 */
function toTimestamp(date) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) return Timestamp.fromDate(date)
  console.error('TrafIQ: no camera-configured detection date — using Timestamp.now() as a fallback')
  return Timestamp.now()
}

async function addEvent(payload) {
  // Invariant: `cameraEvents` NEVER contains a blacklisted plate. A blacklisted
  // vehicle is a security alert, not a traffic record, and lives only in
  // `blacklistedVehicles` (see addBlacklistDetection). SimulationContext
  // already routes blacklisted crossings away from here, so this guards against
  // a future caller getting it wrong — firestore.rules rejects it too.
  if (payload.isBlacklisted) {
    console.warn('[trafiq] refused to write blacklisted plate to cameraEvents:', payload.numberPlate)
    return { ok: true, skipped: true, reason: 'BLACKLISTED_NOT_A_CAMERA_EVENT' }
  }

  const detDate = payload.detectionDate instanceof Date ? payload.detectionDate : null
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
    eventType: payload.eventType || CAMERA_PASSAGE_EVENT,
    isBlacklisted: false,
    ts: detDate ? detDate.getTime() : (typeof payload.ts === 'number' ? payload.ts : Date.now())
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
        isBlacklisted: false,
        refId: rec.refId,
        ts: rec.ts,
        detectionTimestamp: toTimestamp(detDate)
      })
      rec.id = docRef.id
      rec.source = 'firestore'
      return rec
    } catch (e) {
      console.error('Failed to save camera detection:', e)
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

function subscribeBlacklistDetections(cb) {
  blacklistDetectionListeners.add(cb)
  cb(blacklistDetectionCache)
  return () => blacklistDetectionListeners.delete(cb)
}

function getBlacklistedVehicles() {
  return blacklistCache
}

function getBlacklistDetections() {
  return blacklistDetectionCache
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

  // Watchlist ENTRY only. Blacklisted vehicle DETECTIONS are separate documents
  // in the same collection, tagged eventType: 'BLACKLISTED_VEHICLE_DETECTION'.
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
          // Legacy / optimistic entry — match the WATCHLIST ENTRY only.
          // Detection documents for the same plate are preserved history.
          const q = query(collection(db, BLACKLIST_COLLECTION), where('numberPlate', '==', normTarget))
          const snap = await getDocs(q)
          await Promise.all(
            snap.docs.filter((d) => !isBlacklistDetectionDoc(d.data())).map((d) => deleteDoc(d.ref))
          )
        }
      }
    } catch (e) {
      console.error('Firestore remove blacklisted vehicle failed', e)
    }
  }

  return { ok: true }
}

/**
 * Record a BLACKLISTED vehicle crossing a camera.
 *
 * Writes ONE document to `blacklistedVehicles` tagged
 * eventType: 'BLACKLISTED_VEHICLE_DETECTION'. Blacklisted plates are never
 * written to `cameraEvents` — the two collections never mix.
 *
 * `detectionDate` is the CAMERA's configured date + start time (authoritative);
 * it is stored as a real Firestore Timestamp, never serverTimestamp().
 */
async function addBlacklistDetection({ vehicle, camera, simulation, detectionDate }) {
  const detDate = detectionDate instanceof Date ? detectionDate : null
  const plate = normalizePlate(vehicle?.numberPlate)
  if (!plate) {
    console.error('Failed to save blacklist detection: missing number plate')
    return { ok: false, error: 'Empty number plate' }
  }

  const rec = {
    refId: uid('bld'),
    vehicleId: vehicle?.id,
    numberPlate: vehicle?.numberPlate,
    vehicleModel: vehicle?.model,
    vehicleColour: vehicle?.colour,
    cameraId: camera?.id,
    location: camera?.location,
    simulationPlace: simulation?.place,
    simulationDate: simulation?.date,
    eventType: BLACKLIST_DETECTION_EVENT,
    isBlacklisted: true,
    ts: detDate ? detDate.getTime() : Date.now()
  }

  // local-first: the Authority Console reflects the alert immediately
  blacklistDetectionCache = upsertDetection(blacklistDetectionCache, rec)
  persistLocalBlacklistDetections()
  notifyBlacklistDetections()

  if (mode === 'firestore') {
    try {
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore not initialised')
      const docRef = await addDoc(collection(db, BLACKLIST_COLLECTION), {
        vehicleId: rec.vehicleId,
        numberPlate: rec.numberPlate,
        vehicleModel: rec.vehicleModel,
        vehicleColour: rec.vehicleColour,
        cameraId: rec.cameraId,
        location: rec.location,
        simulationPlace: rec.simulationPlace,
        simulationDate: rec.simulationDate,
        eventType: BLACKLIST_DETECTION_EVENT,
        refId: rec.refId,
        ts: rec.ts,
        detectionTimestamp: toTimestamp(detDate)
      })
      rec.id = docRef.id
      rec.source = 'firestore'
      return { ok: true, item: rec, source: 'firestore' }
    } catch (e) {
      console.error('Failed to save blacklist detection:', e)
      return { ok: false, error: e, item: rec, source: 'local' }
    }
  }

  return { ok: true, item: rec, source: 'local' }
}

function init() {
  mode = isFirebaseConfigured ? 'firestore' : 'demo'
  blacklistCache = loadLocalBlacklist()
  blacklistDetectionCache = loadLocalBlacklistDetections()
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

/**
 * Query a vehicle journey across BOTH collections.
 *
 * Normal vehicles live in `cameraEvents`; blacklisted vehicles live in
 * `blacklistedVehicles` (as detection documents). Results are merged and
 * de-duplicated so the journey is complete whichever collection it came from.
 *
 * Plates are matched space-insensitively — the same rule the blacklist uses —
 * so "MH12AB4921" and "MH 12 AB 4921" resolve to the same vehicle.
 */
async function trackVehicle({ numberPlate, vehicleModel, vehicleColour }) {
  const plate = normalizePlate(numberPlate)
  if (!plate) return { ok: false, reason: 'NUMBER_PLATE_REQUIRED' }

  const raw = (numberPlate || '').trim().toUpperCase()
  const matchesPlate = (r) => normalizePlate(r.numberPlate) === plate

  let rows = cache.filter(matchesPlate)
  let blacklistedRows = blacklistDetectionCache.filter(matchesPlate)

  if (mode === 'firestore') {
    const db = getFirestoreDb()
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), where('numberPlate', '==', raw), limit(300)))
      snap.docs.forEach((d) => {
        const rec = normalizeDoc(d.id, d.data())
        if (rec) cache = upsert(cache, rec)
      })
      rows = cache.filter(matchesPlate)
    } catch (e) {
      console.warn('Firestore track (cameraEvents) unavailable — using local history', e)
    }
    try {
      const snap = await getDocs(query(collection(db, BLACKLIST_COLLECTION), where('numberPlate', '==', raw), limit(300)))
      snap.docs.forEach((d) => {
        // watchlist entries share the collection — they are not detections
        if (!isBlacklistDetectionDoc(d.data())) return
        const rec = normalizeBlacklistDetectionDoc(d.id, d.data())
        if (rec) blacklistDetectionCache = upsertDetection(blacklistDetectionCache, rec)
      })
      blacklistedRows = blacklistDetectionCache.filter(matchesPlate)
    } catch (e) {
      console.warn('Firestore track (blacklistedVehicles) unavailable — using local history', e)
    }
  }

  const merged = []
  const seen = new Set()
  ;[...rows, ...blacklistedRows].forEach((r) => {
    const k = keyOf(r)
    if (seen.has(k)) return
    seen.add(k)
    merged.push(r)
  })

  merged.sort((a, b) => (a.ts || 0) - (b.ts || 0)) // chronological
  const filtered = applyFilters(merged, vehicleModel, vehicleColour)
  return { ok: true, rows: filtered, count: filtered.length }
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
 * Clear the recorded blacklisted DETECTIONS (and purge any legacy blacklisted
 * rows still sitting in `cameraEvents`). The watchlist entries themselves are
 * preserved — removing a plate from the watchlist is a separate action.
 */
async function clearBlacklistRecordings() {
  const detectionsToDelete = [...blacklistDetectionCache]
  blacklistDetectionCache = []
  persistLocalBlacklistDetections()
  notifyBlacklistDetections()

  // legacy cleanup — blacklisted plates should never sit in cameraEvents
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
          detectionsToDelete
            .filter((e) => e.id && !String(e.id).startsWith('bld_'))
            .map((e) => deleteDoc(doc(db, BLACKLIST_COLLECTION, e.id)))
        )
        await Promise.all(
          legacyEvents
            .filter((e) => e.id && !String(e.id).startsWith('evt_'))
            .map((e) => deleteDoc(doc(db, COLLECTION, e.id)))
        )
      }
    } catch (e) {
      console.error('Failed to clear blacklist recordings:', e)
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
  subscribeBlacklistDetections,
  getBlacklistedVehicles,
  getBlacklistDetections,
  isBlacklisted,
  addBlacklistedVehicle,
  removeBlacklistedVehicle,
  addBlacklistDetection,
  clearBlacklistRecordings,
  clearAllDetections,
  getEvents,
  trackVehicle,
  onError,
  isFirebaseConfigured
}

