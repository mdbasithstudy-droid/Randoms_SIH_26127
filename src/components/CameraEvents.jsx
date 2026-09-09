import React from 'react'
import { shortStamp } from '../utils/format'

/**
 * LATEST CAMERA ACTIVITY — newest camera passage events first, streamed live
 * from the vehicleEvents store (Firestore or the local demo store).
 */
export default function CameraEvents({ events }) {
  const recent = (events || []).slice(0, 10)

  if (!recent.length) {
    return (
      <div className="empty-state">
        <div className="big">NO CAMERA ACTIVITY YET</div>
        <div>Run a simulation — every camera crossing is recorded here in real time.</div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="evt-table">
        <thead>
          <tr>
            <th>CAMERA</th>
            <th>NUMBER PLATE</th>
            <th>VEHICLE</th>
            <th>LOCATION</th>
            <th>TIME (IST)</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((e) => (
            <tr key={e.id || e.refId}>
              <td><span className="cam-tag">{e.cameraId}</span></td>
              <td><span className="plate-tag">{e.numberPlate}</span></td>
              <td>{e.vehicleModel}</td>
              <td>{e.location}</td>
              <td><span className="stamp">{shortStamp(e.ts)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
