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

1. Create a Firebase project and enable **Cloud Firestore**.
2. Add a **Web app** and copy its config into a local **`.env.local`** file
   (copy `.env.example`). `.env.local` is already gitignored.

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

3. **Security Rules** are configured in the Firebase console
   (Firestore → Rules). For this localhost prototype use development rules
   that allow read/write for `cameraEvents`, e.g.:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cameraEvents/{doc} {
      allow read, write: if true;   // dev only — tighten before going public
    }
  }
}
```

> Only the **Firebase Web SDK** is used. Do **not** use the Admin SDK or place
> a service-account JSON anywhere in this project.

## How it works

- `src/firebase/firebase.js` — initialises Firebase from `VITE_FIREBASE_*`.
- `src/firebase/cameraEvents.js` — `saveCameraDetection(vehicle, camera, simulation)`
  is the **only** Firestore write path (collection `cameraEvents`,
  `detectionTimestamp: serverTimestamp()`).
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
