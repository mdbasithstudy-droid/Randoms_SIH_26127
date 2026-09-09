"""
TrafIQ — Python backend (FastAPI, Vercel serverless compatible).

Endpoints
---------
POST /api/camera-event   Register a CAMERA_PASSAGE event (authoritative write).
GET  /api/track          Query a vehicle journey by number plate (+ optional filters).
GET  /api/events         Recent camera passage events.
GET  /api/health         Liveness probe.

Storage
-------
* If Firebase Admin credentials are configured (server-side env vars only),
  events are persisted to the Firestore `vehicleEvents` collection.
* Otherwise the server transparently falls back to a lightweight JSON file
  store so the API still works locally / on Vercel with no external service.

Secrets are NEVER exposed to the frontend — reads on the admin dashboard use
the Firebase Web SDK (client rules) or the local browser demo store.
"""

import os
import json
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:  # optional — only needed when live Firebase is configured
    from mangum import Mangum
except Exception:  # pragma: no cover
    Mangum = None

# ----------------------------------------------------------------------------
# Optional Firebase Admin (server-side only)
# ----------------------------------------------------------------------------
_db = None
_FIREBASE_ENABLED = False


def _init_firebase():
    global _db, _FIREBASE_ENABLED
    if _db is not None:
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        service_account = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        cred = None
        if service_account:
            cred = credentials.Certificate(json.loads(service_account))
        else:
            path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if path and os.path.exists(path):
                cred = credentials.Certificate(path)

        if cred is None:
            raise RuntimeError("No Firebase service-account env configured")

        app = firebase_admin.initialize_app(cred) if not firebase_admin._apps else firebase_admin.get_app()
        _db = firestore.client(app)
        _FIREBASE_ENABLED = True
    except Exception as exc:  # pragma: no cover
        print("[trafiq] Firebase disabled -> local JSON store:", exc)
        _db = None
        _FIREBASE_ENABLED = False


# ----------------------------------------------------------------------------
# Local JSON fallback store (survives restarts when a writable dir exists)
# ----------------------------------------------------------------------------
def _data_path() -> Path:
    base = os.environ.get("TRAFIQ_DATA_DIR")
    if base:
        p = Path(base)
    else:
        # local dev writes under ./data (gitignored); Vercel uses /tmp
        p = Path("/tmp/trafiq") if os.environ.get("VERCEL") else Path(__file__).resolve().parent.parent / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p / "vehicle_events.json"


def _read_local():
    try:
        raw = _data_path().read_text()
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_local(rows):
    try:
        _data_path().write_text(json.dumps(rows[-1000:]))
    except Exception as exc:  # pragma: no cover
        print("[trafiq] local store write failed:", exc)


# ----------------------------------------------------------------------------
# App
# ----------------------------------------------------------------------------
app = FastAPI(title="TrafIQ Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CameraEventPayload(BaseModel):
    vehicleId: str = Field(default="")
    numberPlate: str = Field(..., min_length=1)
    vehicleModel: str = Field(default="")
    vehicleColour: str = Field(default="")
    cameraId: str = Field(..., min_length=1)
    location: str = Field(default="")
    simPlace: str = Field(default="")
    simDate: str = Field(default="")
    simStartTime: str = Field(default="")
    eventType: str = Field(default="CAMERA_PASSAGE")
    refId: str = Field(default="")


@app.get("/api/health")
def health():
    _init_firebase()
    return {"ok": True, "service": "trafiq-backend", "storage": "firestore" if _FIREBASE_ENABLED else "local-file"}


@app.post("/api/camera-event")
def camera_event(payload: CameraEventPayload):
    if not payload.numberPlate.strip():
        return {"ok": False, "error": "numberPlate is required"}
    if not payload.cameraId.strip():
        return {"ok": False, "error": "cameraId is required"}

    record = payload.model_dump()
    record["eventType"] = "CAMERA_PASSAGE"
    if not record.get("refId"):
        record["refId"] = f"evt_{uuid.uuid4().hex[:10]}"
    record["id"] = record["refId"]
    record["ts"] = int(time.time() * 1000)
    record["iso"] = datetime.now(timezone.utc).isoformat()

    _init_firebase()
    if _FIREBASE_ENABLED:
        try:
            from firebase_admin import firestore

            _, doc_ref = _db.collection("vehicleEvents").add(
                {**record, "timestamp": firestore.SERVER_TIMESTAMP}
            )
            return {"ok": True, "id": doc_ref.id, "source": "firestore", "refId": record["refId"]}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "error": f"firestore write failed: {exc}"}

    # local fallback
    rows = _read_local()
    record["id"] = record["refId"]
    rows.append(record)
    _write_local(rows)
    return {"ok": True, "id": record["refId"], "source": "local-file"}


@app.get("/api/events")
def events(limit: int = Query(60, ge=1, le=500)):
    _init_firebase()
    if _FIREBASE_ENABLED:
        try:
            docs = (
                _db.collection("vehicleEvents")
                .order_by("timestamp", direction="DESCENDING")
                .limit(limit)
                .stream()
            )
            out = []
            for d in docs:
                data = d.to_dict()
                ts = data.get("timestamp")
                data["ts"] = ts.timestamp() * 1000 if hasattr(ts, "timestamp") else data.get("ts", 0)
                data["id"] = d.id
                out.append(data)
            return {"ok": True, "count": len(out), "events": out}
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "error": str(exc), "events": []}

    rows = _read_local()
    rows.sort(key=lambda r: r.get("ts", 0), reverse=True)
    return {"ok": True, "count": min(limit, len(rows)), "events": rows[:limit]}


@app.get("/api/track")
def track(
    numberPlate: str = Query(""),
    vehicleModel: str = Query(None),
    vehicleColour: str = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    plate = numberPlate.strip().upper()
    if not plate:
        return {"ok": False, "reason": "NUMBER_PLATE_REQUIRED", "count": 0, "rows": []}

    def matches(r):
        if str(r.get("numberPlate", "")).strip().upper() != plate:
            return False
        if vehicleModel and str(r.get("vehicleModel", "")).strip().lower() != vehicleModel.strip().lower():
            return False
        if vehicleColour and str(r.get("vehicleColour", "")).strip().lower() != vehicleColour.strip().lower():
            return False
        return True

    _init_firebase()
    if _FIREBASE_ENABLED:
        try:
            q = _db.collection("vehicleEvents").where("numberPlate", "==", plate).limit(limit)
            docs = q.stream()
            rows = [d.to_dict() | {"id": d.id} for d in docs]
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "reason": "FIREBASE_ERROR", "error": str(exc), "count": 0, "rows": []}
    else:
        rows = [r for r in _read_local() if matches(r)]

    rows = [r for r in rows if matches(r)]
    rows.sort(key=lambda r: r.get("ts", 0))
    return {"ok": True, "count": len(rows), "rows": rows}


# Vercel Python Functions entrypoint (mangum adapter) when present
handler = Mangum(app, lifespan="off") if Mangum is not None else None
