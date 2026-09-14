// Ad-hoc verification helper — dumps both TrafIQ Firestore collections.
// Usage: node scripts/verify-firestore.mjs
// Reads the public Web SDK config from .env.local (or .env.example).
import { readFileSync } from 'node:fs'

function readEnv(key) {
  for (const file of ['.env.local', '.env.example']) {
    try {
      const txt = readFileSync(file, 'utf8')
      const m = txt.match(new RegExp('^' + key + '="?([^"\\n]+)"?', 'm'))
      if (m) return m[1].trim()
    } catch {
      /* file may not exist */
    }
  }
  return null
}

const key = readEnv('VITE_FIREBASE_API_KEY')
const projectId = readEnv('VITE_FIREBASE_PROJECT_ID')
if (!key || !projectId) {
  console.error('Missing VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID')
  process.exit(1)
}

const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

function val(v) {
  if (v === undefined || v === null) return undefined
  if (v.stringValue !== undefined) return v.stringValue
  if (v.booleanValue !== undefined) return v.booleanValue
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue !== undefined) return Number(v.doubleValue)
  if (v.timestampValue !== undefined) return v.timestampValue
  if (v.nullValue !== undefined) return null
  return JSON.stringify(v)
}

async function fetchCollection(name) {
  const res = await fetch(`${BASE}/${name}?key=${key}&pageSize=300`)
  const json = await res.json()
  if (json.error) {
    console.log(`${name}: ERROR ${json.error.status} ${json.error.message}`)
    return []
  }
  return (json.documents || []).map((d) => ({ id: d.name.split('/').pop(), f: d.fields || {} }))
}

const cameraEvents = await fetchCollection('cameraEvents')
const blacklist = await fetchCollection('blacklistedVehicles')

const detections = blacklist.filter((d) => val(d.f.eventType) === 'BLACKLISTED_VEHICLE_DETECTION')
const entries = blacklist.filter((d) => val(d.f.eventType) !== 'BLACKLISTED_VEHICLE_DETECTION')

console.log('=== cameraEvents ===', cameraEvents.length, 'documents')
for (const d of cameraEvents.slice().sort((a, b) => String(val(a.f.cameraId)).localeCompare(String(val(b.f.cameraId))))) {
  console.log(
    ' ', val(d.f.cameraId), '|', val(d.f.numberPlate), '| eventType=' + val(d.f.eventType),
    '| isBlacklisted=' + val(d.f.isBlacklisted), '| detectionTimestamp=' + val(d.f.detectionTimestamp)
  )
}

console.log('\n=== blacklistedVehicles ===', blacklist.length, 'documents')
if (entries.length) {
  console.log('  ⚠ unexpected NON-detection documents:', entries.length, '->', entries.map((e) => val(e.f.numberPlate)).join(', '))
}
console.log('  detection records:', detections.length)
for (const d of detections.slice().sort((a, b) => String(val(a.f.cameraId)).localeCompare(String(val(b.f.cameraId))))) {
  console.log(
    ' ', val(d.f.cameraId), '|', val(d.f.numberPlate), '| eventType=' + val(d.f.eventType),
    '| detectionTimestamp=' + val(d.f.detectionTimestamp)
  )
}

// ── invariant checks ────────────────────────────────────────────────────────
// The watchlist is application state (localStorage), never Firestore, so the
// only things verifiable from the database are:
//   1. no blacklisted plate leaked into `cameraEvents`
//   2. `blacklistedVehicles` contains nothing but detection records
const leakedIntoCameraEvents = cameraEvents.filter((d) => val(d.f.isBlacklisted) === true)
const nonDetectionDocs = blacklist.filter((d) => val(d.f.eventType) !== 'BLACKLISTED_VEHICLE_DETECTION')

console.log('\n=== invariants ===')
console.log(
  '  cameraEvents docs flagged isBlacklisted=true  :', leakedIntoCameraEvents.length,
  leakedIntoCameraEvents.length ? '(VIOLATION)' : '(ok)'
)
console.log(
  '  blacklistedVehicles docs that are NOT detections:', nonDetectionDocs.length,
  nonDetectionDocs.length ? '(VIOLATION)' : '(ok)'
)
