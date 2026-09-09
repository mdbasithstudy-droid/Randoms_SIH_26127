// Thin client for the TrafIQ Python backend (FastAPI, Vercel serverless).
// Every call is best-effort: if the backend is not reachable the app silently
// continues on the local / Firebase store. Nothing here exposes server secrets.
import { isFirebaseConfigured } from '../firebase/firebaseConfig'

const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || '/api'

async function request(path, options = {}, timeoutMs = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, status: res.status, data }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

let _backendOnline = null // null = unknown, then boolean

export async function checkBackend() {
  const r = await request('/health', {}, 2500)
  _backendOnline = r.ok
  return r.ok
}

export function isBackendOnline() {
  return _backendOnline === true
}

/** POST /api/camera-event — authoritative write path (Python -> Firestore). */
export async function postCameraEvent(payload) {
  const r = await request('/camera-event', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return r
}

/** GET /api/track — query a vehicle journey from the Python backend. */
export async function trackVehicle(params) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v)
  })
  const r = await request(`/track?${q.toString()}`)
  return r
}

/** GET /api/events — recent camera passage events (server/Firestore). */
export async function fetchEvents(limit = 60) {
  return request(`/events?limit=${limit}`)
}

export { isFirebaseConfigured }
