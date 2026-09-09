import React from 'react'
import { useSimulation } from '../context/SimulationContext'
import { shortStamp } from '../utils/format'

/**
 * Simplified journey map for a tracked vehicle:
 *
 *   START
 *    │
 *    ▼
 *   ● CAM-01 ........  (completed nodes glow cyan, pending nodes stay dim)
 *    │
 *    ▼
 *   ● CAM-02
 *    │
 *    ▼
 *   ● CAM-03
 *    │
 *    ▼
 *   END
 *
 * Locations are read from the stored events (which are captured from each
 * camera's configuration at detection time), never hardcoded.
 */
export default function JourneyTimeline({ result }) {
  const { cameras } = useSimulation()

  if (!result || !result.ok) {
    return (
      <div className="empty-state">
        <div className="big">VEHICLE JOURNEY MAP</div>
        <div>Track a number plate from the AUTHORITY CONSOLE to reconstruct its journey.</div>
      </div>
    )
  }

  const { vehicle, events } = result
  const evByCam = {}
  ;(events || []).forEach((e) => {
    if (!evByCam[e.cameraId]) evByCam[e.cameraId] = e
  })
  const routeCams = [...cameras].sort((a, b) => a.detectionProgress - b.detectionProgress)
  const foundCount = routeCams.filter((c) => evByCam[c.id]).length

  return (
    <div>
      <div className="journey-vehicle-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="mono" style={{ fontSize: '0.56rem', letterSpacing: '1.6px', color: 'var(--text-low)' }}>
              VEHICLE TRACK HISTORY
            </div>
            <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '2px', color: '#fff', marginTop: 4 }}>
              {vehicle?.numberPlate || '—'}
            </div>
          </div>
          <div className="mono" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-mid)' }}>{vehicle?.model || '—'}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-low)' }}>
              COLOUR: <span style={{ color: 'var(--text-mid)' }}>{vehicle?.colour || '—'}</span>
            </div>
          </div>
        </div>
        <div className="mono mt-8" style={{ fontSize: '0.62rem', color: 'var(--text-low)' }}>
          {events?.length || 0} CAMERA PASSAGE(S) · {foundCount}/{routeCams.length} ROUTE NODES
        </div>
      </div>

      <div className="journey mt-12">
        <div className="journey-track">
          {/* START */}
          <div className="journey-node start">
            <span className="node-dot" />
            <div className="n-cam">START — {vehicle?.numberPlate || ''}</div>
            <div className="n-loc">Simulation origin</div>
          </div>

          {routeCams.map((cam) => {
            const ev = evByCam[cam.id]
            const complete = Boolean(ev)
            // location comes from the stored event (captured from camera config at detection)
            const loc = ev?.location || cam.location || 'LOCATION NOT CONFIGURED'
            return (
              <div key={cam.id} className={`journey-node ${complete ? 'complete' : 'pending'}`}>
                <span className="node-dot" />
                <div className="n-cam">
                  {cam.id}
                  {complete && <span className="n-state">✓ DETECTED</span>}
                </div>
                <div className="n-loc">{loc}</div>
                <div className="n-time">{complete ? `DETECTED ${shortStamp(ev.ts)}` : '— NOT YET DETECTED —'}</div>
              </div>
            )
          })}

          {/* END */}
          <div className="journey-node end complete">
            <span className="node-dot" />
            <div className="n-cam">END — JOURNEY {foundCount === routeCams.length ? 'COMPLETE' : 'PARTIAL'}</div>
            <div className="n-loc">{foundCount === routeCams.length ? 'Full route reconstructed' : 'Awaiting remaining detections'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
