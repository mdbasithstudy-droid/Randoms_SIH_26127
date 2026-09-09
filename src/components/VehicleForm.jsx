import React, { useState } from 'react'
import { useSimulation } from '../context/SimulationContext'

const DEMO_FLEET = [
  { model: 'Hyundai Creta', colour: 'White', numberPlate: 'MH 12 AB 4921' },
  { model: 'Toyota Innova', colour: 'Black', numberPlate: 'TN 38 AX 1234' },
  { model: 'Tata Nexon', colour: 'Red', numberPlate: 'KA 01 MN 5678' }
]

const COLOUR_PRESETS = ['White', 'Black', 'Red', 'Silver', 'Blue', 'Grey', 'Green', 'Yellow']

export default function VehicleForm() {
  const { vehicles, addVehicles, clearVehicles } = useSimulation()
  const [count, setCount] = useState(3)
  const [rows, setRows] = useState(() => Array.from({ length: 3 }, () => ({ model: '', colour: '', numberPlate: '' })))
  const [msg, setMsg] = useState(null)

  const setCountV = (n) => {
    const c = Math.max(1, Math.min(12, n))
    setCount(c)
    setRows((prev) => {
      const arr = prev.slice(0, c)
      while (arr.length < c) arr.push({ model: '', colour: '', numberPlate: '' })
      return arr
    })
    setMsg(null)
  }

  const updateRow = (i, key, val) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)))
    setMsg(null)
  }

  const loadDemo = () => {
    setCount(DEMO_FLEET.length)
    setRows(DEMO_FLEET.map((d) => ({ ...d })))
    setMsg(null)
  }

  const save = () => {
    const incomplete = rows.some((r) => !r.model.trim() || !r.colour.trim() || !r.numberPlate.trim())
    const seen = {}
    const dup = rows.some((r) => {
      const p = r.numberPlate.trim().toUpperCase()
      if (!p) return false
      if (seen[p]) return true
      seen[p] = true
      return false
    })
    if (incomplete) {
      setMsg({ type: 'error', text: 'VALIDATION ERROR — every vehicle needs a Model, Colour and Number Plate.' })
      return
    }
    if (dup) {
      setMsg({ type: 'error', text: 'VALIDATION ERROR — duplicate number plates are not allowed in the fleet.' })
      return
    }
    const added = addVehicles(rows)
    setMsg({
      type: 'success',
      text: `${added.length} VEHICLE(S) SAVED TO FLEET — they now appear at the START of the CAMERA SIMULATION road.`
    })
    setRows(Array.from({ length: count }, () => ({ model: '', colour: '', numberPlate: '' })))
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span className="bar" />
        ADD VEHICLES
        <span className="hint">// build the simulation fleet</span>
      </div>

      <div className="num-stepper">
        <span className="mono muted" style={{ fontSize: '0.62rem', letterSpacing: '1.4px' }}>NUMBER OF VEHICLES</span>
        <button className="btn" onClick={() => setCountV(count - 1)}>−</button>
        <span className="val">{count}</span>
        <button className="btn" onClick={() => setCountV(count + 1)}>+</button>
        <button className="btn btn-ghost" onClick={loadDemo}>USE DEMO FLEET</button>
      </div>

      <div className="vehicle-rows">
        {rows.map((row, i) => (
          <div className="vf-block" key={i}>
            <div className="vf-head">
              <span>VEHICLE {String(i + 1).padStart(2, '0')}</span>
              <span className="muted" style={{ color: 'var(--text-low)' }}>// fleet slot</span>
            </div>
            <div className="field-grid">
              <div className="field">
                <label>Vehicle Model</label>
                <input
                  value={row.model}
                  placeholder="e.g. Hyundai Creta"
                  onChange={(e) => updateRow(i, 'model', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Vehicle Colour</label>
                <input
                  list="trafiq-colours"
                  value={row.colour}
                  placeholder="e.g. White"
                  onChange={(e) => updateRow(i, 'colour', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Number Plate</label>
                <input
                  value={row.numberPlate}
                  placeholder="e.g. MH 12 AB 4921"
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => updateRow(i, 'numberPlate', e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <datalist id="trafiq-colours">
        {COLOUR_PRESETS.map((c) => <option key={c} value={c} />)}
      </datalist>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <div className="mt-12 spread">
        <button className="btn btn-success btn-big" onClick={save}>SAVE VEHICLES</button>
        {vehicles.length > 0 && (
          <button className="btn btn-danger" onClick={() => { clearVehicles(); setMsg(null); }}>
            CLEAR FLEET ({vehicles.length})
          </button>
        )}
      </div>

      {vehicles.length > 0 && (
        <div className="mt-12">
          <div className="mono muted mb-8" style={{ fontSize: '0.6rem', letterSpacing: '1.4px' }}>
            SAVED FLEET — {vehicles.length} VEHICLE(S) READY FOR SIMULATION
          </div>
          <div className="saved-chip-list">
            {vehicles.map((v) => (
              <span className="saved-chip" key={v.id}>
                <span className="swatch" style={{ background: v.colour || '#888' }} />
                {v.numberPlate} · {v.model}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
