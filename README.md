# TRAFIQ — Intelligent Traffic Monitoring & Vehicle Journey Correlation

A **working demonstration prototype** (React + Python + Firebase/Vercel) that
simulates 3 fixed ANPR cameras on a road, moves admin-created vehicles across
them, and records **one Firebase event per camera crossing** — enabling a
complete vehicle-journey reconstruction in an authority console.

Preserves the TrafIQ cyber/traffic-monitoring theme: dark navy surfaces,
neon-cyan accents, glassmorphism panels, thin glowing borders and monospace
technical labels.

---

## What it does

```
ADMIN ENTERS VEHICLE  →  VEHICLE ENTERS SIMULATION  →  VEHICLE MOVES ON ROAD
        ↓                                                 ↓
   CAM-01 DETECTS ──► Firebase CAMERA_PASSAGE event       ...
        ↓                                                 ↓
   CAM-02 DETECTS ──► Firebase CAMERA_PASSAGE event   VEHICLE REACHES END
        ↓                                                 ↓
   CAM-03 DETECTS ──► Firebase CAMERA_PASSAGE event  ADMIN TRACKS NUMBER PLATE
                                                            ↓
                                              COMPLETE JOURNEY HISTORY DISPLAYED
```

**Key rule:** Firebase is *only* written when a vehicle crosses a fixed camera
detection point. Vehicle position / animation frames are **never** written.
One vehicle + three cameras = exactly three events.

### Two sides
- **CAMERA SIMULATION** — the simulated road, 3 fixed cameras (CAM-01 Forum
  Nexus Mall, CAM-02 Koyambedu Flyover, CAM-03 VR Mall), smooth vehicle
  animation, live ANPR detection feed and detection effects.
- **AUTHORITY CONSOLE** — simulation setup, vehicle management, start/reset,
  track-vehicle search, journey timeline map, and latest camera activity.

---

## Quick start (frontend only — works fully offline)

> This is the recommended path for the demonstration. With no Firebase env
> configured the app runs in **DEMO MODE**: events persist in the browser
> (localStorage), the admin dashboard updates live, and history survives a
> page refresh — zero external services required.

```bash
npm install
npm run dev
# open http://localhost:5173
```

### Demo script (acceptance flow)
The 3 cameras are **physically fixed** but their metadata is **configurable** —
click any camera on the road to open its CAMERA CONFIGURATION panel.

1. Open the app → **CAMERA SIMULATION**.
2. Cameras start unconfigured (`LOCATION NOT CONFIGURED · SENSOR READY`).
3. Click **CAM-01** → configuration modal → press **USE DEMO VALUE** (or type
   it) → **SAVE CONFIGURATION**. Repeat for CAM-02 and CAM-03:
   - CAM-01 · Forum Nexus Mall · 2026-09-08 · 14:02:10
   - CAM-02 · Koyambedu Flyover · 2026-09-08 · 14:08:45
   - CAM-03 · VR Mall · 2026-09-08 · 14:15:30
   The header badge goes `0/3 → 3/3` and shows **● SYSTEM READY**; cameras turn
   `SENSOR ACTIVE`. (START is blocked until all 3 are configured.)
4. Simulation Setup (place/date/time at the top) defines the session — the
   **SIM CLOCK** starts from this time when the simulation runs.
5. Open **AUTHORITY CONSOLE** → **ADD VEHICLES** → **USE DEMO FLEET** → **SAVE VEHICLES**:
   - Hyundai Creta · White · MH 12 AB 4921
   - Toyota Innova · Black · TN 38 AX 1234
   - Tata Nexon · Red · KA 01 MN 5678
6. Return to **CAMERA SIMULATION** — the 3 vehicles are queued at START.
7. Press **START SIMULATION** — vehicles move smoothly across CAM-01 → CAM-02 → CAM-03.
   The SIM CLOCK ticks live (e.g. 14:02:00 → 14:02:01 → …).
8. Each crossing flips the camera to **VEHICLE DETECTED** with a scan beam, an
   ANPR card and **exactly one** event whose timestamp is the **actual
   simulation-clock crossing time** (never the static configured value). End: **9 events** (3×3).
9. In **AUTHORITY CONSOLE → TRACK VEHICLE**, search `MH 12 AB 4921` → full
   journey with camera-configured locations and live detection times.
10. **RESET SIMULATION** stops the run and clears the road/clock but keeps camera
    configurations and historical events. Refresh → search again → history is still there.

> Two distinct concepts: **CAMERA CONFIGURATION TIME** (the per-camera session
> reference entered in the modal, e.g. 14:02:10) vs **ACTUAL VEHICLE DETECTION
> TIME** (generated live by the simulation clock when a vehicle crosses, e.g.
> 14:02:17). Only CAMERA_PASSAGE events are ever written — never configuration
> or per-frame movement.

---

## Run the Python backend locally (optional)

The Python (FastAPI) backend is used as the server-side write path to
Firestore. Without it, DEMO MODE is fully self-contained. With it running,
the frontend additionally syncs every camera event to the API.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
npm run api          # = uvicorn api.index:app --port 8000  (Vite proxies /api → :8000)
```

Verify: `curl http://localhost:8000/api/health`

Endpoints:
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/camera-event` | Register a camera passage (Firestore write) |
| GET | `/api/track?numberPlate=...` | Journey query (+ optional `vehicleModel`, `vehicleColour`) |
| GET | `/api/events` | Recent camera events |
| GET | `/api/health` | Liveness / storage-mode probe |

> If Firebase Admin credentials are **not** configured the API falls back to a
> local JSON file store (`data/vehicle_events.json`, gitignored) so it still
> works everywhere.

---

## Going live with Firebase + Vercel

### 1. Firebase
Create a Firebase project → enable **Firestore**.
- **Web app config** → paste into a local `.env` (copy `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
With this set, the app switches to **LIVE Firestore mode**: camera events are
written through the Python API, and the console streams updates via Firestore
realtime listeners (`vehicleEvents` collection).

- **Service account** (server-side only) → Project settings → Service accounts →
  generate a private key. Never commit it. Use one of:
  - `FIREBASE_SERVICE_ACCOUNT` env var = the entire JSON (Vercel-friendly), or
  - `GOOGLE_APPLICATION_CREDENTIALS` = path on a local machine.

- Firestore rules (for demo reads) — for a throwaway demo you can open reads/writes:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /vehicleEvents/{doc} { allow read, write: if true; }
  }
}
```

### 2. Vercel
- Push the repo to GitHub and import into Vercel (framework preset **Vite/React**).
- The Python API in `api/index.py` (FastAPI + Mangum) is auto-deployed as a
  serverless function by the `vercel.json` rewrites.
- Add the backend env vars (`FIREBASE_SERVICE_ACCOUNT`, …) in Project → Settings → Environment Variables.
- Add the `VITE_FIREBASE_*` vars to the frontend environment.

Build/check locally:
```bash
npm run build      # production frontend (verified)
npm run preview    # serve the production build
```

---

## Project structure

```
Proto/
├─ api/
│  └─ index.py              # FastAPI backend (Vercel serverless, Mangum)
├─ public/
│  └─ logo.png              # reused TrafIQ asset
├─ src/
│  ├─ components/           # Header, CameraSimulation, Road, Camera, Vehicle,
│  │                        #   SimulationConfig, DetectionFeed, AdminDashboard,
│  │                        #   VehicleForm, TrackVehicle, JourneyTimeline, CameraEvents
│  ├─ context/
│  │  └─ SimulationContext.jsx   # shared state + rAF animation + detection engine
│  ├─ data/                 # camera network + tuning constants
│  ├─ firebase/             # web SDK config (env-gated)
│  ├─ services/             # api.js (Python client), firebaseService.js (event store)
│  ├─ utils/                # IST formatting helpers
│  ├─ App.jsx               # tab shell (Camera Simulation | Authority Console)
│  └─ main.jsx
├─ .env.example
├─ index.html
├─ package.json
├─ requirements.txt
├─ vercel.json
└─ vite.config.js
```

### Why no camera-drag / aim controls?
The 3 cameras are **fixed surveillance nodes** — never draggable, movable,
rotated or resized. Clicking a camera opens a **CAMERA CONFIGURATION** modal
(CameraConfigModal.jsx) to set its location / date / session-time reference.
Detection zones stay at static positions and vehicles move through them.

---

## Error handling
- Firebase unavailable → `FIREBASE CONNECTION ERROR` toast; app keeps running on the demo store.
- Camera-event write failure → `CAMERA EVENT FAILED` toast; local simulation continues.
- Tracking with empty plate → `NUMBER PLATE IS REQUIRED`.
- No results → `NO VEHICLE HISTORY FOUND`.
- Incomplete vehicle rows → validation message on SAVE.

## Notes / decisions
- Detection timestamps are shown in **IST** (`Asia/Kolkata`).
- Firestore documents use `serverTimestamp()`; the UI also keeps a client
  timestamp for instant rendering.
- The road is CSS-driven and scales responsively (no fixed widths, no CSS
  `zoom`, no transform scaling of the page) so mobile stays usable with zero
  horizontal overflow.
