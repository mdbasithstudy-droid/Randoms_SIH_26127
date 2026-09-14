// cameraEvents — the only CAMERA EVENT write path in the app.
//
// A document is written exclusively when a vehicle crosses a fixed camera
// detection point. Vehicle position / animation frames are never written, and
// fleet creation never touches Firestore.
//
// ⚠ Blacklisted plates NEVER reach this module. When a blacklisted vehicle is
// detected it is written to `blacklistedVehicles` instead — see
// firebaseService.addBlacklistDetection().
//
// saveCameraDetection(vehicle, camera, simulation, detectionDate)
//   vehicle       -> { id, numberPlate, model, colour }
//   camera        -> { id, location, date, startTime }  (configured camera)
//   simulation    -> { place, date }                    (session metadata)
//   detectionDate -> Date   the CAMERA'S configured date + start time, built by
//                           src/utils/format.js -> cameraDateTime()
//
// `detectionDate` is the authoritative detection time and is stored as a real
// Firestore Timestamp (never serverTimestamp(), never the browser clock).
//
// One document per vehicle per camera per simulation — the engine guarantees
// this fires at most once per crossing.
import { firebaseService } from '../services/firebaseService'

export async function saveCameraDetection(vehicle, camera, simulation, detectionDate) {
  const payload = {
    vehicleId: vehicle?.id,
    numberPlate: vehicle?.numberPlate,
    vehicleModel: vehicle?.model,
    vehicleColour: vehicle?.colour,

    cameraId: camera?.id,
    location: camera?.location,

    simulationPlace: simulation?.place,
    simulationDate: simulation?.date,

    eventType: 'CAMERA_PASSAGE',
    isBlacklisted: false,
    detectionDate,
    ts: detectionDate instanceof Date ? detectionDate.getTime() : undefined
  }
  return firebaseService.addEvent(payload)
}

