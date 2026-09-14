// TrafIQ — FIXED camera network geometry.
//
// The surveillance network is made of 3 physically immovable camera units.
// Their position along the simulated road is described by `detectionProgress`
// (0 = START of the road, 1 = END of the road) and `side` picks which camera
// row the unit is mounted on ('top' above the asphalt, 'bottom' below it).
//
// Geometry is HARD-CODED and never changes at runtime. Only each camera's
// network metadata (location / date / session start time) is configurable —
// it is stored in localStorage under STORAGE_KEYS.cameras via
// `blankCameraConfigs(CAMERAS)` and merged over these entries by
// SimulationContext. Keeping the metadata out of this file means the physical
// layout can never be corrupted by persisted user config.

export const CAMERAS = [
  {
    id: 'CAM-01',
    detectionProgress: 0.18,
    side: 'top'
  },
  {
    id: 'CAM-02',
    detectionProgress: 0.5,
    side: 'bottom'
  },
  {
    id: 'CAM-03',
    detectionProgress: 0.82,
    side: 'top'
  }
]

export default CAMERAS
