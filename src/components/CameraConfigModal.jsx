import React, { useEffect, useState } from 'react'
import { useSimulation } from '../context/SimulationContext'
import { SAMPLE_CAMERA_CONFIGS } from '../data/constants'
import { withSeconds } from '../utils/format'

/**
 * CAMERA CONFIGURATION modal.
 * Opens when a camera is clicked. Cameras stay physically fixed — only their
 * network metadata is edited here. Saved config lives in React state (locally
 * persisted), never written continuously to Firebase.
 *
 * Fields: Camera ID (read-only), Place/Location, Date, Timestamp.
 * The configured TIMESTAMP is the camera's session-time reference. Actual
 * vehicle detection times are generated live by the simulation clock when a
 * vehicle crosses the camera — they are never the static configured value.
 */
export default function CameraConfigModal() {
  const {
    cameras, cameraConfigTarget, updateCamera, closeCameraConfig, addToast
  } = useSimulation()

  const cam = cameras.find((c) => c.id === cameraConfigTarget)
  const [location, setLocation] = useState(cam?.location || '')
  const [date, setDate] = useState(cam?.date || '')
  const [startTime, setStartTime] = useState(cam?.startTime || '')
  const [error, setError] = useState(null)

  // reset local state whenever a different camera is targeted
  useEffect(() => {
    if (cam) {
      setLocation(cam.location || '')
      setDate(cam.date || '')
      setStartTime(cam.startTime || '')
    }
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraConfigTarget])

  if (!cam) return null

  const useSample = () => {
    const s = SAMPLE_CAMERA_CONFIGS[cam.id]
    if (s) {
      setLocation(s.location)
      setDate(s.date)
      setStartTime(s.startTime)
      setError(null)
    }
  }

  const save = () => {
    if (!location.trim() || !date || !startTime) {
      setError('All camera fields are required — location, date and simulation time')
      return
    }
    updateCamera(cam.id, {
      location: location.trim(),
      date,
      startTime: withSeconds(startTime)
    })
    addToast('ok', `${cam.id} configuration saved — ${location.trim()}`)
    closeCameraConfig()
  }

  const onKey = (e) => {
    if (e.key === 'Escape') closeCameraConfig()
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && closeCameraConfig()}
    >
      <div className="modal cam-config-modal" role="dialog" aria-modal="true" aria-label={`${cam.id} configuration`} onKeyDown={onKey}>
        <div className="modal-head">
          <h3>Camera Configuration</h3>
          <button className="btn btn-ghost" onClick={closeCameraConfig}>✕ Close</button>
        </div>

        <div className="cam-config-id">
          <span className="hk">Camera</span>
          <span className="val">{cam.id}</span>
          <span className="tag">Fixed node — not movable</span>
        </div>

        <div className="field-grid mt-16">
          <div className="field">
            <label htmlFor="cc-loc">Location <em>*</em></label>
            <input
              id="cc-loc"
              type="text"
              value={location}
              placeholder="e.g. Forum Nexus Mall"
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cc-date">Date <em>*</em></label>
            <input
              id="cc-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cc-time">Simulation Time <em>*</em></label>
            <input
              id="cc-time"
              type="time"
              step="1"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        <div className="cam-config-note">
          <span className="mono" style={{ fontWeight: 700 }}>Session reference: <b>{startTime ? `${withSeconds(startTime)} IST` : '—'}</b></span>
          <span>
            This is the camera&apos;s session reference. Actual detection times are generated live
            by the simulation clock when a vehicle crosses — detections are never the static value.
          </span>
        </div>

        <button className="btn btn-ghost mt-8" onClick={useSample}>Use demo value</button>

        {error && <div className="msg error">{error}</div>}

        <div className="spread mt-16">
          <button className="btn btn-primary btn-big" onClick={save}>Save Configuration</button>
          <button className="btn btn-ghost" onClick={closeCameraConfig}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
