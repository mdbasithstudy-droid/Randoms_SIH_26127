import React from 'react'
import { useSimulation } from '../context/SimulationContext'

/**
 * Simulation metadata for the monitoring session. Shared with the Authority
 * Console — editing here is reflected there and vice-versa. The values are
 * frozen into every camera passage event when the simulation runs.
 */
export default function SimulationConfig({ compact = false, title = 'SIMULATION CONFIGURATION' }) {
  const { sim, setSim } = useSimulation()

  return (
    <div className="panel accent">
      <div className="panel-title">
        <span className="bar" />
        {title}
        <span className="hint">// traffic monitoring session metadata</span>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="sim-place">Place</label>
          <input
            id="sim-place"
            type="text"
            value={sim.place}
            placeholder="e.g. Chennai"
            onChange={(e) => setSim({ place: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="sim-date">Date</label>
          <input
            id="sim-date"
            type="date"
            value={sim.date}
            onChange={(e) => setSim({ date: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="sim-time">Start Time</label>
          <input
            id="sim-time"
            type="time"
            value={sim.time}
            onChange={(e) => setSim({ time: e.target.value })}
          />
        </div>
      </div>
      {!compact && (
        <div className="mt-12 muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '1px' }}>
          ⚠ These values define this monitoring session and are attached to every camera passage event recorded to Firebase.
        </div>
      )}
    </div>
  )
}
