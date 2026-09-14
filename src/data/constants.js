// TrafIQ — shared application constants.
//
// Everything here is pure data (no React, no Firebase). Timings are tuned so
// the compressed demo simulation reads clearly: vehicles leave START one after
// another, each camera's "detecting" state is visible long enough to register,
// and the ANPR feed cards linger while the convoy is still crossing.

import { todayLocalISO } from '../utils/format'

// localStorage keys — namespaced like the blacklist key ('trafiq_blacklist')
// used by services/firebaseService.js. Only camera-passage events, vehicles,
// per-camera config and session metadata are persisted; positions never are.
export const STORAGE_KEYS = {
  sim: 'trafiq_sim',
  vehicles: 'trafiq_vehicles',
  cameras: 'trafiq_cameras',
  events: 'trafiq_events'
}

// ---------- simulation timing (milliseconds) ----------

// Wall-clock time for one vehicle to travel the whole road (START -> END).
export const ROAD_TRAVEL_MS = 14000

// Delay applied per vehicle index, so vehicles launch as a convoy instead of
// all at once.
export const LAUNCH_STAGGER_MS = 900

// How long a camera stays in its "DETECTED" visual state after a crossing.
export const DETECT_UI_MS = 1600

// Lifetime of an ANPR detection card in the live feed.
export const ANPR_TOAST_MS = 6000

// ---------- defaults ----------

// Initial session metadata. Date/time default to "now" (see SimulationContext);
// only the place has a sensible fixed default.
export const SIM_DEFAULTS = {
  place: 'Chennai'
}

// One-click demo metadata per camera id, offered by the Camera Configuration
// modal ("Use demo value"). The configured timestamp is only the camera's
// session reference — real detection times come from the simulation clock.
export const SAMPLE_CAMERA_CONFIGS = {
  'CAM-01': {
    location: 'Anna Salai Junction',
    date: todayLocalISO(),
    startTime: '08:30:00'
  },
  'CAM-02': {
    location: 'Tidel Park Signal',
    date: todayLocalISO(),
    startTime: '09:00:00'
  },
  'CAM-03': {
    location: 'Marina Beach Road',
    date: todayLocalISO(),
    startTime: '09:30:00'
  }
}
