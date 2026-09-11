import React from 'react'
import { shortStamp } from '../utils/format'

/**
 * RECENT AI DETECTIONS — newest camera detections first, streamed live from the
 * cameraEvents store (Firestore onSnapshot + local mirror).
 */
export default function CameraEvents({ events }) {
  const recent = (events || []).slice(0, 10)

  if (!recent.length) {
    return (
      <div className="empty-state">
        <div className="big">No detections yet</div>
        <div>Run a simulation — each AI camera crossing is recorded here in real time.</div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="evt-table">
        <thead>
          <tr>
            <th>Camera</th>
            <th>Number plate</th>
            <th>Vehicle</th>
            <th>Location</th>
            <th>Time (IST)</th>
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
