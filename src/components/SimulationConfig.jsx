import React from 'react'
import { useSimulation } from '../context/SimulationContext'

/**
 * Simulation metadata for the monitoring session. Shared with the Authority
 * Console — editing here is reflected there and vice-versa. The values are
 * frozen into every camera passage event when the simulation runs.
 */
export default function SimulationConfig({ compact = false, title = 'Simulation Configuration' }) {
  const { sim, setSim } = useSimulation()

  return (
    <div className="panel">
      <div className="panel-title">
        {title}
        <span className="hint">simulation session metadata</span>
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
        <p className="field-note">
          These values define this monitoring session and are attached to every AI camera detection event.
        </p>
      )}
    </div>
  )
}
