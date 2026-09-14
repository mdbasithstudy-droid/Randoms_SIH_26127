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

These are Firebase **Web SDK client identifiers**, not credentials — Google ships
them in the browser bundle by design. Access is controlled by `firestore.rules`
and API key restrictions, never by hiding these values.

**Config resolution** (`src/firebase/firebase.js`), per field:

1. `VITE_FIREBASE_*` from the environment — **only when non-empty**.
2. `FALLBACK_FIREBASE_CONFIG` committed in `src/firebase/firebase.js`.

The committed fallback means the app is configured out of the box. Empty host
environment variables are ignored on purpose: Vite gives host vars precedence
over `.env.production`, so a dashboard that defines `VITE_FIREBASE_*` with
**blank** values would otherwise silently knock the deployed app into demo mode.

The app only degrades to fully-local **demo mode** (status panel shows
"Demo store") if that fallback is blanked out deliberately.

### Firestore data model — exactly TWO collections

A vehicle reaches Firestore **only when it actually crosses a camera**. Fleet
creation ("Save Vehicles") is application state + `localStorage` only — there is
no `vehicles` collection and `firestore.rules` denies creating one. Nothing is
written on Start Simulation, on animation frames, or on movement updates.

| Event | Collection | Document `eventType` |
|---|---|---|
| Normal vehicle detected | `cameraEvents` | `CAMERA_PASSAGE` |
| Blacklisted vehicle detected | `blacklistedVehicles` | `BLACKLISTED_VEHICLE_DETECTION` |
| Plate added to the watchlist | *(no write)* — `localStorage` only | — |

Adding a plate to the blacklist writes **nothing** to Firestore. `blacklistedVehicles`
receives a document only when a blacklisted vehicle actually crosses a camera, so
it contains detection records and nothing else.

```text
                 VEHICLE DETECTED
                        |
              is plate blacklisted?
                 +------+------+
                NO            YES
                 |              |
                 v              v
          cameraEvents   blacklistedVehicles
                 |              |
         normal detection   blacklist detection
```

A blacklisted plate **never** appears in `cameraEvents`, and a normal plate
**never** appears in `blacklistedVehicles`. Blacklist status is evaluated from
the current watchlist at the moment of the crossing (plates normalised —
uppercase, spaces stripped), not from any value stored at fleet-creation time.

A blacklisted crossing still shows the live ANPR feed card, the red toast and
the Authority alert modal, and the vehicle completes the whole
START → CAM-01 → CAM-02 → CAM-03 → END run. Detection is fire-and-forget, so a
Firebase failure can never stall or reject the vehicle.

### `detectionTimestamp` — the camera's configured time

`detectionTimestamp` is a real Firestore **Timestamp** built from the **date and
start time configured for that camera** in the Camera Configuration UI. It is
never `serverTimestamp()`, never `Date.now()` and never the browser clock.

With CAM-01 = `10:30:00`, CAM-02 = `10:35:00`, CAM-03 = `10:40:00` on
`2026-09-14`, the three documents carry those three times respectively.

The value is parsed as **local** time (`new Date('YYYY-MM-DDTHH:mm:ss')` carries
no timezone designator, so it is read as local — the convention the simulation
clock already used), so the configured wall-clock time is preserved with no
accidental UTC shift. That same instant drives the in-app ANPR feed and the
Track Vehicle journey, so the UI and Firestore always agree.

### `blacklistedVehicles` — detection records only

Every document in this collection is one blacklisted vehicle crossing one
camera, tagged `eventType: "BLACKLISTED_VEHICLE_DETECTION"`:

```jsonc
{
  "numberPlate": "TN01BB2222",
  "vehicleId": "veh_…",
  "vehicleModel": "Honda",
  "vehicleColour": "Black",
  "cameraId": "CAM-01",
  "location": "Anna Salai Junction",
  "simulationPlace": "Chennai",
  "simulationDate": "2026-09-14",
  "detectionTimestamp": "<Timestamp — the camera's configured date + time>",
  "eventType": "BLACKLISTED_VEHICLE_DETECTION"
}
```

There are no watchlist documents here — `firestore.rules` rejects any create
without that `eventType`. The **Authority Console → Blacklist Alert History**
panel reads these records; **Clear Recordings** deletes them (and purges legacy
blacklisted rows left in `cameraEvents`) without affecting the watchlist.

**The watchlist itself lives in this browser** (`localStorage`), so it is not
shared between devices and is lost if site data is cleared. Detect-and-record is
unaffected — only the list of plates to watch is local. If it needs to be shared,
the watchlist wants its own collection.

**Track Vehicle** searches both collections, so a journey resolves whether the
plate is normal or blacklisted.

### Verifying the collections

`scripts/verify-firestore.mjs` dumps both collections and asserts the
separation invariant:

```bash
node scripts/verify-firestore.mjs
```

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
| "Demo store", no console errors | Build had no usable Firebase config — **blank** `VITE_FIREBASE_*` host vars overriding `.env.production`. Clear them in the host dashboard, or ensure `FALLBACK_FIREBASE_CONFIG` is filled in |
| "Connected" but writes fail with `Missing or insufficient permissions` | `firestore.rules` not deployed, or the API key is restricted to another origin |
| Collections missing in Firebase Console | Expected until the first write — an empty collection does not exist. Run a simulation; the collection appears on the first camera crossing |

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
- `src/services/firebaseService.js` — `addBlacklistDetection(...)` writes ONE
  document per blacklisted crossing into `blacklistedVehicles` (tagged
  `BLACKLISTED_VEHICLE_DETECTION`), and `trackVehicle()` queries both collections.
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
