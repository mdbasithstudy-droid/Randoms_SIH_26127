import React, { useEffect, useState } from 'react'
import { useSimulation } from '../context/SimulationContext'
import { formatIST } from '../utils/format'
import SimulationConfig from './SimulationConfig'
import Road from './Road'
import DetectionFeed from './DetectionFeed'

export default function CameraSimulation() {
  const {
    sim, vehicles, cameras, configuredCount, allConfigured, phase,
    positions, lanes, flash, camUI, feed, events, attention,
    stats, simClock, startSimulation, resetSimulation, openCameraConfig
  } = useSimulation()

  const [sysClock, setSysClock] = useState(() => formatIST(new Date()))
  useEffect(() => {
    const t = setInterval(() => setSysClock(formatIST(new Date())), 1000)
    return () => clearInterval(t)
  }, [])

  const running = phase === 'running'
  const emptyFleet = vehicles.length === 0
  const simClockLabel = simClock ? formatIST(new Date(simClock)) : `Ready · starts at ${sim.time || '--:--'}:00`

  return (
    <div className="view">
      <div className="section-label">Camera Simulation</div>

      {/* summary strip */}
      <div className="sim-hud">
        <div className="hud-tile"><div className="hk">Location</div><div className="hv">{sim.place || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Date</div><div className="hv">{sim.date || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Start Time</div><div className="hv">{sim.time || '—'}</div></div>
        <div className="hud-tile"><div className="hk">Cameras</div><div className={`hv ${allConfigured ? 'cyan' : ''}`}>{configuredCount}/{cameras.length}</div></div>
        <div className="hud-tile"><div className="hk">Fleet</div><div className="hv">{vehicles.length}</div></div>
        <div className="hud-tile"><div className="hk">Run Detections</div><div className="hv">{stats.events}</div></div>
        <div className="hud-tile"><div className="hk">Total Recorded</div><div className="hv cyan">{events.length}</div></div>
      </div>

      <SimulationConfig />

      <div className="panel mt-12">
        <div className="panel-title spread">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            AI Camera Network
            <span className="hint">3 fixed detection cameras · click a camera to configure</span>
          </div>
          <div className="road-cfg-badges">
            <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
              <span className="dot" />Configured {configuredCount}/{cameras.length}
            </span>
            <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
              <span className="dot" />{allConfigured ? '3 / 3 Online' : 'Setup required'}
            </span>
          </div>
        </div>

        {!allConfigured && phase === 'idle' && (
          <div className="status-banner warn">
            Configure all 3 cameras before starting — click each camera to set its location, date and simulation time.
          </div>
        )}
        {running && (
          <div className="status-banner running">
            AI vehicle detection active — {vehicles.length} vehicles in transit across the AI camera network.
          </div>
        )}
        {phase === 'done' && (
          <div className="status-banner done">
            Simulation complete — {stats.events} camera detections recorded. Track a vehicle from the Authority Console.
          </div>
        )}
        {phase === 'idle' && allConfigured && !emptyFleet && (
          <div className="status-banner info">
            {vehicles.length} vehicles queued at START — press Start Simulation to launch the convoy.
          </div>
        )}

        <Road
          vehicles={vehicles}
          positions={positions}
          lanes={lanes}
          flash={flash}
          camUI={camUI}
          phase={phase}
          cameras={cameras}
          attention={attention}
          onConfigure={openCameraConfig}
          overlay={
            emptyFleet && !running ? (
              <div className="hint-box">
                <b>No vehicles in fleet</b><br />
                Add vehicles from the Authority Console to begin the simulation.
              </div>
            ) : null
          }
        />

        <div className="actions-bar">
          <div>
            <button className="btn btn-primary btn-big" disabled={running} onClick={startSimulation}>
              {running ? 'Running…' : '▶  Start Simulation'}
            </button>
            <button className="btn btn-danger" style={{ marginLeft: 10 }} disabled={running} onClick={resetSimulation}>
              Reset Simulation
            </button>
          </div>
          <div className="sim-clock-wrap">
            <span className={`sim-clock ${running ? 'live' : ''}`}>
              <span className="dot" />Simulation clock <b>{simClockLabel}</b>
            </span>
            <span className="live-clock">System {sysClock}</span>
          </div>
        </div>
      </div>

      <div className="panel mt-12">
        <div className="panel-title">
          Simulated AI ANPR — Detections
          <span className="hint">vehicle detections recorded at each camera crossing</span>
        </div>
        <DetectionFeed feed={feed} />
      </div>
    </div>
  )
}
