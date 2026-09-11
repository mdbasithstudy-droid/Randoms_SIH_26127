// cameraEvents — the ONLY Firestore writes in the app.
//
// Firestore is written exclusively when a vehicle crosses a fixed camera
// detection point. Vehicle position / animation frames are never written.
//
// saveCameraDetection(vehicle, camera, simulation, detectionTs, isBlacklisted)
//   vehicle       -> { id, numberPlate, model, colour }
//   camera        -> { id, location }            (configured camera info)
//   simulation    -> { place, date }             (session metadata)
//   detectionTs   -> number                      (simulation clock ts)
//   isBlacklisted -> boolean                     (blacklist status at detection time)
//
// Writes ONE document to the `cameraEvents` collection per call. The engine
// guarantees this fires at most once per vehicle per camera per simulation.
import { firebaseService } from '../services/firebaseService'

export async function saveCameraDetection(vehicle, camera, simulation, detectionTs, isBlacklisted = false) {
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
    isBlacklisted: Boolean(isBlacklisted),
    ts: detectionTs || Date.now() // client-side simulation-clock time (for display)
  }
  return firebaseService.addEvent(payload)
}

