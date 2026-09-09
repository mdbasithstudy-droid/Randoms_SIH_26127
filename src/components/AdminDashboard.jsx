import React, { useState } from 'react'
import { useSimulation } from '../context/SimulationContext'
import { displayDate, withSeconds } from '../utils/format'
import SimulationConfig from './SimulationConfig'
import VehicleForm from './VehicleForm'
import TrackVehicle from './TrackVehicle'
import JourneyTimeline from './JourneyTimeline'
import CameraEvents from './CameraEvents'

export default function AdminDashboard() {
  const {
    phase, stats, events, vehicles, cameras, configuredCount, allConfigured,
    startSimulation, resetSimulation, sim, addToast
  } = useSimulation()
  const [trackOpen, setTrackOpen] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const running = phase === 'running'

  const openTrack = () => {
    setTrackOpen(true)
  }

  return (
    <div className="view">
      <div className="section-label">// TrafIQ Authority Console · Command & Control</div>

      {phase === 'running' && (
        <div className="status-banner running">▶ ACTIVE SIMULATION — {stats.launched} VEHICLE(S) ON THE ROAD NETWORK. CAMERA PASSAGES ARE BEING RECORDED.</div>
      )}
      {phase === 'done' && (
        <div className="status-banner done">✓ SIMULATION COMPLETE — {stats.events} CAMERA PASSAGE EVENT(S). USE TRACK VEHICLE TO RECONSTRUCT JOURNEYS.</div>
      )}

      {/* KPI strip */}
      <div className="admin-kpi mb-12">
        <div className="hud-tile"><div className="hk">PLACE</div><div className="hv cyan">{sim.place || '—'}</div></div>
        <div className="hud-tile"><div className="hk">SESSION DATE</div><div className="hv">{sim.date || '—'}</div></div>
        <div className="hud-tile"><div className="hk">START TIME</div><div className="hv">{sim.time || '—'}</div></div>
        <div className="hud-tile"><div className="hk">FLEET</div><div className="hv">{vehicles.length}</div></div>
        <div className="hud-tile"><div className="hk">RUN PASSAGES</div><div className="hv">{stats.events}</div></div>
      </div>

      <SimulationConfig title="SIMULATION SETUP" />

      <div className="admin-grid mt-16">
        {/* ---------------- LEFT COLUMN ---------------- */}
        <div className="admin-col">
          <VehicleForm />

          <div className="panel accent">
            <div className="panel-title">
              <span className="bar" />
              START SIMULATION
              <span className="hint">// launch the fleet across CAM-01 → CAM-02 → CAM-03</span>
            </div>
            <p className="mono muted" style={{ fontSize: '0.66rem', lineHeight: 1.7 }}>
              Validates the session config & fleet, resets the previous run, then moves every vehicle smoothly from START to END. Each camera crossing writes exactly one CAMERA_PASSAGE event.
            </p>
            <div className="spread">
              <button
                className="btn btn-primary btn-big"
                disabled={running}
                onClick={() => {
                  if (!vehicles.length) {
                    addToast('warn', 'ADD VEHICLES FIRST — fleet is empty')
                    return
                  }
                  startSimulation()
                }}
              >
                ▶ START SIMULATION
              </button>
              <button className="btn btn-danger" disabled={running} onClick={resetSimulation}>
                ↺ RESET SIMULATION
              </button>
            </div>
            {!allConfigured && (
              <div className="msg info mt-12">CONFIGURE ALL CAMERAS BEFORE STARTING SIMULATION — click each camera on the CAMERA SIMULATION road.</div>
            )}
            <div className="mt-8 run-strip">
              <span>STATUS: <b style={{ color: running ? 'var(--cyan)' : 'var(--text-mid)' }}>{running ? 'RUNNING' : phase === 'done' ? 'COMPLETE' : 'STANDBY'}</b></span>
              <span>OPEN <b style={{ color: 'var(--cyan)' }}>CAMERA SIMULATION</b> TAB TO WATCH THE ROAD</span>
            </div>
          </div>
        </div>

        {/* ---------------- RIGHT COLUMN ---------------- */}
        <div className="admin-col">
          <div className="panel">
            <div className="panel-title spread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="bar" />
                CAMERA NETWORK
                <span className="hint">// configured fixed nodes</span>
              </div>
              <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
                <span className="dot" />{configuredCount}/{cameras.length} CONFIGURED
              </span>
            </div>
            <div className="camnet-list">
              {cameras.map((c) => {
                const set = Boolean(c.location && c.date && c.startTime)
                return (
                  <div className="camnet-row" key={c.id}>
                    <span className="camnet-id">{c.id}</span>
                    <div className="camnet-info">
                      <div className={`loc ${set ? '' : 'muted'}`}>
                        {c.location || 'LOCATION NOT CONFIGURED'}
                      </div>
                      <div className="meta mono">
                        {set ? `${displayDate(c.date)} · ${withSeconds(c.startTime)} IST` : 'DATE/TIME — NOT SET'}
                      </div>
                    </div>
                    <span className={`cfg-badge ${set ? 'ok' : 'warn'}`}>{set ? 'SET' : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel accent">
            <div className="panel-title">
              <span className="bar" />
              TRACK VEHICLE
              <span className="hint">// journey reconstruction from stored events</span>
            </div>
            <p className="mono muted" style={{ fontSize: '0.66rem', lineHeight: 1.7 }}>
              Query the vehicleEvents database by number plate to replay the full journey timeline across the camera network.
            </p>
            <button className="btn btn-primary btn-big" onClick={openTrack}>⌕ TRACK VEHICLE</button>

            <div className="mt-16">
              <JourneyTimeline result={lastResult} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span className="bar" />
              LATEST CAMERA ACTIVITY
              <span className="hint">// live from vehicleEvents</span>
            </div>
            <CameraEvents events={events} />
          </div>
        </div>
      </div>

      {/* Track modal */}
      {trackOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setTrackOpen(false)}>
          <div className="modal">
            <div className="modal-head">
              <h3>⌕ VEHICLE TRACK SEARCH</h3>
              <button className="btn btn-ghost" onClick={() => setTrackOpen(false)}>✕ CLOSE</button>
            </div>
            <TrackVehicle
              onClose={() => setTrackOpen(false)}
              onResult={(r) => setLastResult(r)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
