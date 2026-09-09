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
  const simClockLabel = simClock ? formatIST(new Date(simClock)) : `READY · BASE ${sim.date} ${sim.time || '--:--'}:00`

  return (
    <div className="view">
      <div className="section-label">// Camera Simulation · Live ANPR Feed</div>

      {/* sim HUD tiles */}
      <div className="sim-hud">
        <div className="hud-tile"><div className="hk">SIM PLACE</div><div className="hv cyan">{sim.place || '—'}</div></div>
        <div className="hud-tile"><div className="hk">DATE</div><div className="hv">{sim.date || '—'}</div></div>
        <div className="hud-tile"><div className="hk">START TIME</div><div className="hv">{sim.time || '—'}</div></div>
        <div className="hud-tile"><div className="hk">CAMERAS CONFIG</div><div className={`hv ${allConfigured ? 'cyan' : ''}`}>{configuredCount}/{cameras.length}</div></div>
        <div className="hud-tile"><div className="hk">FLEET</div><div className="hv">{vehicles.length} VEH</div></div>
        <div className="hud-tile"><div className="hk">THIS RUN PASSAGES</div><div className="hv">{stats.events}</div></div>
        <div className="hud-tile"><div className="hk">RECORDED EVENTS</div><div className="hv cyan">{events.length}</div></div>
      </div>

      <SimulationConfig />

      <div className="panel mt-12">
        <div className="panel-title spread">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="bar" />
            ROAD NETWORK — CAM-01 · CAM-02 · CAM-03
            <span className="hint">// 3 fixed detection cameras · click a camera to configure</span>
          </div>
          <div className="road-cfg-badges">
            <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
              <span className="dot" />CAMERAS CONFIGURED: {configuredCount}/{cameras.length}
            </span>
            <span className={`cfg-badge ${allConfigured ? 'ok' : 'warn'}`}>
              {allConfigured ? '● SYSTEM READY' : '● CONFIGURATION REQUIRED'}
            </span>
          </div>
        </div>

        {!allConfigured && phase === 'idle' && (
          <div className="status-banner warn">
            CONFIGURE ALL CAMERAS BEFORE STARTING SIMULATION — click each camera and set Place / Date / Timestamp.
          </div>
        )}
        {running && (
          <div className="status-banner running">▶ SIMULATION RUNNING — VEHICLES IN TRANSIT ACROSS CAMERA NETWORK</div>
        )}
        {phase === 'done' && (
          <div className="status-banner done">
            ✓ SIMULATION COMPLETE — {stats.events} CAMERA PASSAGE EVENT(S) RECORDED. TRACK A VEHICLE FROM THE AUTHORITY CONSOLE.
          </div>
        )}
        {phase === 'idle' && allConfigured && !emptyFleet && (
          <div className="status-banner" style={{ color: 'var(--text-mid)', borderColor: 'var(--line)' }}>
            ⚡ {vehicles.length} VEHICLE(S) QUEUED AT START LINE — PRESS START SIMULATION TO LAUNCH THE CONVOY
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
                <b>NO VEHICLES IN FLEET</b><br />
                Open the AUTHORITY CONSOLE to configure the simulation and add vehicles.
              </div>
            ) : null
          }
        />

        <div className="actions-bar">
          <div>
            <button className="btn btn-primary btn-big" disabled={running} onClick={startSimulation}>
              {running ? '▶ RUNNING…' : '▶ START SIMULATION'}
            </button>
            <button className="btn btn-danger ml" style={{ marginLeft: 10 }} disabled={running} onClick={resetSimulation}>
              ↺ RESET SIMULATION
            </button>
          </div>
          <div className="sim-clock-wrap">
            <span className={`sim-clock ${running ? 'live' : ''}`}>
              <span className="dot" />SIM CLOCK — <b>{simClockLabel}</b>
            </span>
            <span className="live-clock">SYS {sysClock}</span>
          </div>
        </div>
      </div>

      <div className="panel mt-12 accent">
        <div className="panel-title">
          <span className="bar" />
          LIVE ANPR DETECTION FEED
          <span className="hint">// simulated plate recognition on camera crossing</span>
        </div>
        <DetectionFeed feed={feed} />
      </div>
    </div>
  )
}
