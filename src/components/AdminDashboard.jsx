import React, { useMemo, useState } from 'react'
import { useSimulation } from '../context/SimulationContext'
import { displayDate, withSeconds, shortStamp } from '../utils/format'
import SimulationConfig from './SimulationConfig'
import VehicleForm from './VehicleForm'
import TrackVehicle from './TrackVehicle'
import JourneyTimeline from './JourneyTimeline'
import CameraEvents from './CameraEvents'

function BlacklistManager() {
  const { blacklistedVehicles, addBlacklistedVehicle, removeBlacklistedVehicle } = useSimulation()
  const [inputPlate, setInputPlate] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    const normalized = (inputPlate || '').toUpperCase().replace(/\s+/g, '')
    if (!normalized) {
      setErrorMsg('Please enter a vehicle number plate.')
      return
    }
    if (blacklistedVehicles.some((item) => item.numberPlate === normalized)) {
      setErrorMsg('Vehicle is already in the blacklist.')
      return
    }
    const res = await addBlacklistedVehicle(inputPlate)
    if (res && res.ok) {
      setInputPlate('')
    } else if (res && res.error) {
      setErrorMsg(res.error)
    }
  }

  return (
    <div className="panel" style={{ borderLeft: '4px solid var(--red)' }}>
      <div className="panel-title spread">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--red)' }}>⚠</span>
          BLACKLISTED VEHICLES
        </div>
        <span className="hint">{blacklistedVehicles.length} vehicle(s) blacklisted</span>
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1 }}>
          <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-mid)', marginBottom: 4 }}>
            Number Plate:
          </label>
          <input
            value={inputPlate}
            placeholder="e.g. TN01AB1234"
            style={{ textTransform: 'uppercase', fontFamily: 'var(--font-code)', fontWeight: 700 }}
            onChange={(e) => {
              setInputPlate(e.target.value)
              setErrorMsg('')
            }}
          />
        </div>
        <button type="submit" className="btn btn-danger" style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
          Add to Blacklist
        </button>
      </form>

      {errorMsg && <div className="msg error" style={{ marginTop: 0, marginBottom: 12 }}>{errorMsg}</div>}

      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Existing blacklist:
      </div>

      {blacklistedVehicles.length === 0 ? (
        <div className="empty-state" style={{ padding: '16px 12px' }}>
          No vehicles in blacklist.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {blacklistedVehicles.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--line)',
                borderRadius: 8
              }}
            >
              <span style={{ fontFamily: 'var(--font-code)', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--red)' }}>
                {item.numberPlate}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', padding: '3px 8px' }}
                onClick={() => removeBlacklistedVehicle(item.id)}
              >
                [Remove]
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BlacklistAlertHistory() {
  const { blacklistDetections, clearBlacklistRecordings } = useSimulation()

  // Blacklisted crossings are their own documents in `blacklistedVehicles`
  // (eventType: 'BLACKLISTED_VEHICLE_DETECTION') — they are never in
  // `cameraEvents`, so this reads the blacklist detection stream.
  const alerts = useMemo(
    () => [...(blacklistDetections || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [blacklistDetections]
  )

  return (
    <div className="panel" style={{ borderLeft: '4px solid var(--red)' }}>
      <div className="panel-title spread">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--red)' }}>⚠</span>
          BLACKLIST ALERT HISTORY
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="hint">{alerts.length} alert(s) recorded</span>
          {alerts.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)', border: '1px solid #f3c7cc', padding: '3px 9px', fontSize: '0.74rem' }}
              onClick={clearBlacklistRecordings}
            >
              Clear Recordings
            </button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state" style={{ padding: '20px 12px' }}>
          <div className="big">No blacklisted vehicle detections</div>
          <div>When a blacklisted vehicle passes a camera, the crossing is recorded on its blacklist entry.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {alerts.map((e) => {
            const timeStr = shortStamp(e.ts).replace(' IST', '')
            return (
              <div
                key={e.id || e.refId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 14px',
                  background: 'var(--red-dim)',
                  border: '1px solid #f3c7cc',
                  borderRadius: 9
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--font-code)' }}>
                  <span>⚠ {e.numberPlate}</span>
                  {e.vehicleModel && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-mid)', fontFamily: 'var(--font-sans)' }}>
                      ({e.vehicleModel})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: 'var(--cyan)' }}>{e.cameraId}</span>
                  <span>·</span>
                  <span>{e.location}</span>
                  <span>·</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontWeight: 600 }}>{timeStr}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const {
    phase, stats, events, vehicles, cameras, configuredCount, allConfigured,
    startSimulation, resetSimulation, sim, addToast, clearAllDetections
  } = useSimulation()
  const [trackOpen, setTrackOpen] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const running = phase === 'running'

  return (
    <div className="view">
      <div className="section-label">Authority Console · AI Traffic Monitoring & Vehicle Journey Analysis</div>

      {phase === 'running' && (
        <div className="status-banner running">AI vehicle detection active — {stats.launched} vehicles on the road network. Camera detections are being recorded.</div>
      )}
      {phase === 'done' && (
        <div className="status-banner done">Simulation complete — {stats.events} detections. Use Track Vehicle to reconstruct journeys.</div>
      )}

      {/* KPI strip */}
      <div className="admin-kpi mb-12">
        <div className="hud-tile"><div className="hk">Location</div><div className="hv">{sim.place || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Date</div><div className="hv">{sim.date || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Start Time</div><div className="hv">{sim.time || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Fleet</div><div className="hv">{vehicles.length}</div></div>
        <div className="hud-tile"><div className="hk">Run Detections</div><div className="hv">{stats.events}</div></div>
      </div>

      <SimulationConfig title="Simulation Setup" />

      <div className="admin-grid mt-16">
        {/* ---------------- LEFT COLUMN ---------------- */}
        <div className="admin-col">
          <VehicleForm />
          <BlacklistManager />

          <div className="panel">
            <div className="panel-title">Simulation Control</div>
            <p style={{ fontSize: '0.86rem', margin: '0 0 14px' }}>
              Validate the session &amp; fleet, then run the convoy across CAM-01 → CAM-02 → CAM-03.
              Each camera crossing writes exactly one AI camera detection event.
            </p>
            <div className="spread">
              <button
                className="btn btn-primary btn-big"
                disabled={running}
                onClick={() => {
                  if (!vehicles.length) {
                    addToast('warn', 'Add vehicles first — the fleet is empty')
                    return
                  }
                  startSimulation()
                }}
              >
                ▶  Start Simulation
              </button>
              <button className="btn btn-danger" disabled={running} onClick={resetSimulation}>
                Reset Simulation
              </button>
            </div>
            <div className="mt-8 run-strip">
              <span>Status: <b>{running ? 'Running' : phase === 'done' ? 'Complete' : 'Standby'}</b></span>
              <span>Watch the road in the <b>Camera Simulation</b> tab</span>
            </div>
            {!allConfigured && (
              <div className="msg info">Configure all cameras before starting — click each camera on the Camera Simulation road.</div>
            )}
          </div>
        </div>

        {/* ---------------- RIGHT COLUMN ---------------- */}
        <div className="admin-col">
          <div className="panel">
            <div className="panel-title spread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                Camera Network
                <span className="hint">configured fixed nodes</span>
              </div>
              <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
                <span className="dot" />{configuredCount}/{cameras.length} configured
              </span>
            </div>
            <div className="camnet-list">
              {cameras.map((c) => {
                const set = Boolean(c.location && c.date && c.startTime)
                return (
                  <div className="camnet-row" key={c.id}>
                    <span className="camnet-id">{c.id}</span>
                    <div className="camnet-info">
                      <div className="loc">{c.location || 'Not configured'}</div>
                      <div className="meta">
                        {set ? `${displayDate(c.date)} · ${withSeconds(c.startTime)}` : 'Location / date / time not set'}
                      </div>
                    </div>
                    <span className={`cfg-badge ${set ? 'ok' : 'warn'}`}>{set ? 'Active' : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <BlacklistAlertHistory />

          <div className="panel">
            <div className="panel-title">
              Track Vehicle
              <span className="hint">AI journey correlation from recorded detections</span>
            </div>
            <p style={{ fontSize: '0.86rem', margin: '0 0 14px' }}>
              Search a number plate to replay its full journey across the AI camera network.
            </p>
            <button className="btn btn-primary btn-big" onClick={() => setTrackOpen(true)}>Track Vehicle</button>

            <div className="mt-16">
              <JourneyTimeline result={lastResult} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title spread">
              <div>Recent AI Detections</div>
              {events && events.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text-mid)', border: '1px solid var(--line)', padding: '3px 9px', fontSize: '0.74rem' }}
                  onClick={clearAllDetections}
                >
                  Clear Detections
                </button>
              )}
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
              <h3>Track Vehicle — AI Journey Search</h3>
              <button className="btn btn-ghost" onClick={() => setTrackOpen(false)}>✕ Close</button>
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

