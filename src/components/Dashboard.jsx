import React, { useMemo } from 'react'
import { useSimulation } from '../context/SimulationContext'

export default function Dashboard({ setView }) {
  const { cameras, configuredCount, vehicles, events, mode, phase, stats } = useSimulation()

  const journeys = useMemo(() => {
    const plates = new Set((events || []).map((e) => e.numberPlate))
    return plates.size
  }, [events])

  const aiOn = mode === 'firestore' ? 'Firebase Connected' : 'Local Engine Ready'

  const caps = [
    { icon: '📷', title: 'AI Vehicle Detection', text: 'Automatically identifies configured vehicles as they pass fixed camera points.' },
    { icon: '🔤', title: 'AI ANPR', text: 'Associates each detected vehicle with its registered number plate.' },
    { icon: '🔗', title: 'AI Journey Correlation', text: 'Connects multiple camera detections to reconstruct a complete vehicle journey.' },
    { icon: '🛣️', title: 'AI Traffic Monitoring', text: 'Gives authorities a centralized view of camera activity in real time.' }
  ]

  const sys = [
    { name: 'AI Engine', state: 'Online', on: true },
    { name: 'Camera Network', state: `${configuredCount} / ${cameras.length} configured`, on: configuredCount === cameras.length },
    { name: 'ANPR Engine', state: configuredCount === cameras.length ? 'Ready' : 'Awaiting cameras', on: configuredCount === cameras.length },
    { name: 'Firebase / Data', state: mode === 'firestore' ? 'Connected' : 'Demo store', on: true },
    { name: 'Simulation', state: phase === 'running' ? 'Running' : phase === 'done' ? 'Last run complete' : 'Ready', on: phase !== 'idle' }
  ]

  return (
    <div className="view">
      <div className="dash-hero">
        <span className="ai-badge">✦ AI Traffic Intelligence</span>
        <h1>Welcome to TrafIQ</h1>
        <p>
          AI-powered traffic monitoring and vehicle journey correlation. Configured vehicles are
          detected as they cross each camera in a simulated AI camera network, then correlated into
          a single journey history for authorities.
        </p>
        <div className="quick-links">
          <button className="btn btn-primary" onClick={() => setView('camera')}>Open Camera Simulation</button>
          <button className="btn" onClick={() => setView('admin')}>Authority Console</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="m-top">
            <span className="m-label">Cameras</span>
            <span className="m-ico">📷</span>
          </div>
          <div className="m-value">{configuredCount} <small>/ {cameras.length}</small></div>
          <div className="m-desc">AI camera network configured</div>
        </div>
        <div className="metric-card">
          <div className="m-top">
            <span className="m-label">Vehicles</span>
            <span className="m-ico">🚗</span>
          </div>
          <div className="m-value">{vehicles.length}</div>
          <div className="m-desc">Vehicles in the simulation fleet</div>
        </div>
        <div className="metric-card">
          <div className="m-top">
            <span className="m-label">Detections</span>
            <span className="m-ico">⚡</span>
          </div>
          <div className="m-value">{(events || []).length}</div>
          <div className="m-desc">AI camera detections recorded</div>
        </div>
        <div className="metric-card">
          <div className="m-top">
            <span className="m-label">Tracked Journeys</span>
            <span className="m-ico">🔗</span>
          </div>
          <div className="m-value">{journeys}</div>
          <div className="m-desc">Vehicle journeys correlated</div>
        </div>
      </div>

      {/* AI capabilities */}
      <div className="panel">
        <div className="panel-title">AI Intelligence</div>
        <div className="ai-grid">
          {caps.map((c) => (
            <div className="ai-card" key={c.title}>
              <span className="ai-ico">{c.icon}</span>
              <h4>{c.title}</h4>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI system status + simulation info */}
      <div className="admin-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div className="admin-col">
          <div className="panel">
            <div className="panel-title">AI System Status</div>
            <div className="sys-list">
              {sys.map((s) => (
                <div className="sys-row" key={s.name}>
                  <span className="s-name">{s.name}</span>
                  <span className={`s-state ${s.on ? '' : 'off'}`}>
                    <span className="status-dot" style={{ background: s.on ? 'var(--green)' : 'var(--amber)' }} />
                    {s.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-col">
          <div className="panel">
            <div className="panel-title">Simulation Console</div>
            <p style={{ fontSize: '0.86rem', marginTop: 0 }}>
              This demonstration runs a <strong>simulated AI ANPR camera network</strong>. No real
              cameras or number plates are read — vehicles, plates and detections are generated by
              the simulation and correlated by the AI journey engine.
            </p>
            <div className="sys-list">
              <div className="sys-row">
                <span className="s-name">Last run detections</span>
                <span className="s-state"><span className="status-dot" style={{ background: 'var(--green)' }} />{stats.events} events</span>
              </div>
              <div className="sys-row">
                <span className="s-name">Fleet on road</span>
                <span className="s-state"><span className="status-dot" style={{ background: 'var(--green)' }} />{vehicles.length} vehicles</span>
              </div>
              <div className="sys-row">
                <span className="s-name">Cameras configured</span>
                <span className="s-state"><span className="status-dot" style={{ background: configuredCount === cameras.length ? 'var(--green)' : 'var(--amber)' }} />{configuredCount}/{cameras.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-low)', fontSize: '0.74rem', marginTop: 10 }}>
        TrafIQ · AI Traffic Intelligence · Vehicle Journey Correlation · Simulated ANPR demonstration
      </p>
    </div>
  )
}
