# TRAFIQ — AI Traffic Intelligence (Local + Firebase/Firestore)

A React (Vite) prototype of an **AI-powered traffic monitoring and vehicle
journey correlation** system. This project runs **locally only** — no Vercel
config and no Python backend.

Vehicles are driven across a simulated road with **3 fixed, configurable
cameras** (CAM-01 · CAM-02 · CAM-03). Each time a vehicle crosses a camera the
app writes **one document** to the Firestore **`cameraEvents`** collection.
Vehicle movement is never written to Firebase.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (verified)
npm run preview    # serve the production build
```

## Firebase setup

This project is wired to the Firebase project **`trafiq-7680f`**. The config
lives in **`.env.local`** (gitignored); `.env.example` mirrors it as a template.

To point at a different project, replace the values in `.env.local` with the
Web app config from Firebase Console → Project settings → Your apps, then
**restart the dev server** (Vite reads env at startup):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

If these are missing or blank the app still runs in a fully local **demo mode**
(status panel shows "Demo store") — Firebase is optional.

### Firestore data model — exactly TWO collections

| Collection | Written when | Written by |
|---|---|---|
| `cameraEvents` | a **non-blacklisted** vehicle crosses a camera | `saveCameraDetection()` |
| `blacklistedVehicles` | the Authority adds a plate, **and** each time a blacklisted vehicle crosses a camera | `addBlacklistedVehicle()`, `recordBlacklistDetection()` |

**A vehicle only ever appears in Firestore as the result of a camera detection.**
Registering the fleet ("Save Vehicles") writes to `localStorage` only — there is
no `vehicles` collection, and `firestore.rules` denies creating one.

**Blacklisted plates are never written to `cameraEvents`.** When a blacklisted
vehicle is detected it is recorded on its own `blacklistedVehicles` document
instead, so the two concerns never mix:

- `cameraEvents` = traffic volume, ANPR history, journey correlation.
- `blacklistedVehicles` = the watchlist **and** the audit trail of where/when
each watchlisted plate was seen.

A blacklisted crossing still shows the live ANPR feed card, the red toast and
the Authority alert modal — it simply produces no `cameraEvents` document.

Each blacklist document looks like:

```jsonc
{
  "numberPlate": "TN01AB1234",
  "createdAt": "<server timestamp>",
  "detectionCount": 3,                        // total crossings seen
  "lastDetectedAt": 1757862482000,             // simulation-clock ms
  "lastCameraId": "CAM-03",
  "lastLocation": "Marina Beach Road",
  "detections": [                             // newest first, capped at 20
    { "ts": 1757862482000, "cameraId": "CAM-03",
      "location": "Marina Beach Road",
      "vehicleModel": "Hyundai Creta", "vehicleColour": "White" }
  ]
}
```

The **Authority Console → Blacklist Alert History** panel reads these
`detections`; **Clear Recordings** empties them (and purges any legacy
blacklisted rows still sitting in `cameraEvents` from before the split).

### Security rules

Rules are version-controlled in **`firestore.rules`** (mounted by `firebase.json`)
and are already deployed to `trafiq-7680f`. After editing them, re-deploy:

```bash
firebase login                       # once, if not already authenticated
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` into Firebase Console → Firestore → Rules → Publish.

> The rules are intentionally open for this prototype (unauthenticated
> read/write on the two collections only). `firestore.rules` ends with a note on
> what to tighten before any public deployment.

> Only the **Firebase Web SDK** is used. Do **not** use the Admin SDK or place
> a service-account JSON anywhere in this project.

## Deploying to Vercel

This is a root-level Vite SPA, which Vercel builds with no restructuring —
`vercel.json` just pins the build and adds SPA + asset-caching rules. There is
**no backend**: the browser talks straight to Firestore using the Web SDK, so no
serverless functions are needed.

### 1. Commit — Vercel only deploys what is in Git

```bash
git status --short              # confirm src/data/*.js are not "??" untracked
git add -A
git commit -m "chore: Vercel deployment config"
git push
```

> ⚠️ `src/data/cameras.js` and `src/data/constants.js` must be committed. They
> were hidden by the `.gitignore` `data/` rule for a long time, and a deploy
> without them fails with `Could not resolve "../data/cameras"`.

### 2. Import the project

Vercel → **Add New → Project** → import the repo. The **Vite** preset is
detected automatically; leave Build Command and Output Directory untouched.

### 3. Firebase config in the deploy

`.env.local` is gitignored and is **not** uploaded, so the Firebase values live
in **`.env.production`**, which Vite loads automatically for `vite build` and
which *is* committed. Production builds are therefore configured out of the box —
no dashboard setup required.

> These are Firebase **Web SDK client identifiers**, not credentials — Google
> ships them in the browser bundle by design. Access is controlled by
> `firestore.rules` and API key restrictions, not by hiding them. Never put a
> service-account JSON or Admin SDK key in this file.

**Optional override:** if you set the same names in Vercel →
**Settings → Environment Variables**, those **take precedence** over
`.env.production` (verified). Useful if you ever point the deploy at a different
Firebase project. After changing them you must **redeploy** — Vite inlines
`VITE_*` values at build time, so a page refresh is not enough.

### Troubleshooting: deployed site says "Demo store"

The Dashboard's **Firebase / Data** tile shows **Demo store** when the app built
without Firebase config. Everything still works, but only in `localStorage` —
**nothing is written to Firestore**.

| Symptom | Cause |
|---|---|
| "Demo store", no console errors | Build had no `VITE_FIREBASE_*` (env vars unset or misnamed — a missing `VITE_` prefix fails silently) |
| "Connected" but writes fail with `Missing or insufficient permissions` | `firestore.rules` not deployed, or the API key is restricted to another origin |
| A desktop browser console warning appears | Same as row 1 — the app logs it explicitly in production builds |

To check what a live deployment actually built, grep its bundle for your project
id. If it is absent, the config never made it into the build:

```bash
curl -s https://<your-app>.vercel.app | grep -oE '/assets/[^"]+\.js' | head -1
# then fetch that /assets/*.js and search for your projectId
```


### 4. Post-deploy checks

- Dashboard → **Firebase / Data** reads **Connected**, not "Demo store".
- Run a simulation and confirm documents appear in Firestore.
- **Firestore rules need no change** — they are origin-independent and already
  deployed from `firestore.rules`.
- No Firebase **Auth** is used, so there is no Authorized Domain to add. If you
  later restrict the API key by HTTP referrer in Google Cloud, add
  `https://<your-app>.vercel.app/*`.

## How it works

- `src/firebase/firebase.js` — initialises Firebase from `VITE_FIREBASE_*`.
- `src/firebase/cameraEvents.js` — `saveCameraDetection(vehicle, camera, simulation)`
  is the **only** way a `cameraEvents` document is created (with
  `detectionTimestamp: serverTimestamp()`). Blacklisted plates never reach it.
- `src/services/firebaseService.js` — `recordBlacklistDetection(...)` writes a
  blacklisted crossing onto its `blacklistedVehicles` document.
- `src/context/SimulationContext.jsx` — when a vehicle crosses a camera
  detection point (once per vehicle per camera per run), it calls
  `saveCameraDetection()`.
- `src/services/firebaseService.js` — resilient store: local mirror + Firestore
  realtime listener (used by Recent AI Detections) and journey queries
  (`where("numberPlate", "==", …)`).

### Demo flow
1. **Camera Simulation** → click CAM-01/02/03 → set Location/Date/Simulation
   Time (or use the demo values) → Save.
2. **Authority Console → Vehicle Management** → add a vehicle
   (e.g. `TN01AB1234 · Honda City · White`) → Save Vehicles.
3. Back in **Camera Simulation** → **Start Simulation**.
4. Each crossing writes exactly one `cameraEvents` doc:
   3 cameras × 1 vehicle = 3 docs; 3 × 3 = 9 docs.
5. **Authority Console → Track Vehicle** → enter `TN01AB1234` → journey
   CAM-01 → CAM-02 → CAM-03 with locations and timestamps.

## Firebase error handling

If Firebase fails the vehicle simulation never crashes: the error is logged to
the console, a small **“Firebase connection error”** status/toast appears, and
the detection is kept in the local history so tracking still works.
