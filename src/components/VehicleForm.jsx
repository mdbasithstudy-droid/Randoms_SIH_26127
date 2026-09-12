import React, { useRef, useState } from 'react'
import { useSimulation } from '../context/SimulationContext'

// ─── Demo fleet ───────────────────────────────────────────────────────────────
const DEMO_FLEET = [
  { model: 'Hyundai Creta', colour: 'White',  numberPlate: 'MH 12 AB 4921' },
  { model: 'Toyota Innova', colour: 'Black',  numberPlate: 'TN 38 AX 1234' },
  { model: 'Tata Nexon',    colour: 'Red',    numberPlate: 'KA 01 MN 5678' }
]

const COLOUR_PRESETS = ['White', 'Black', 'Red', 'Silver', 'Blue', 'Grey', 'Green', 'Yellow']

// ─── CSV parser ───────────────────────────────────────────────────────────────
// Accepted header variants (trimmed, lowercase)
const MODEL_KEYS  = ['vehicle model', 'model', 'vehiclemodel']
const COLOUR_KEYS = ['vehicle colour', 'colour', 'color', 'vehiclecolour', 'vehicle color']
const PLATE_KEYS  = ['number plate', 'numberplate', 'plate', 'number_plate', 'reg', 'registration']

function findHeader(headers, candidates) {
  return headers.findIndex((h) => candidates.includes(h.trim().toLowerCase()))
}

/**
 * parseCSV(text, existingPlates)
 * Returns { imported: [{model,colour,numberPlate}], invalid: [{row,reason}], duplicates: number }
 */
function parseCSV(text, existingPlates) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { imported: [], invalid: [{ row: 0, reason: 'CSV is empty or has only a header row.' }], duplicates: 0 }

  const headers = lines[0].split(',')
  const modelIdx  = findHeader(headers, MODEL_KEYS)
  const colourIdx = findHeader(headers, COLOUR_KEYS)
  const plateIdx  = findHeader(headers, PLATE_KEYS)

  if (modelIdx === -1 || colourIdx === -1 || plateIdx === -1) {
    const missing = []
    if (modelIdx  === -1) missing.push('"Vehicle Model"')
    if (colourIdx === -1) missing.push('"Vehicle Colour"')
    if (plateIdx  === -1) missing.push('"Number Plate"')
    return {
      imported: [],
      invalid: [{ row: 0, reason: `Missing required column(s): ${missing.join(', ')}` }],
      duplicates: 0
    }
  }

  const imported  = []
  const invalid   = []
  let   duplicates = 0
  const seenInFile = new Set()
  const existingSet = new Set(existingPlates.map((p) => p.toUpperCase().replace(/\s+/g, '')))

  lines.slice(1).forEach((line, idx) => {
    const rowNum = idx + 2 // 1-indexed, accounting for header
    const cols = line.split(',')
    const model       = (cols[modelIdx]  || '').trim()
    const colour      = (cols[colourIdx] || '').trim()
    const numberPlate = (cols[plateIdx]  || '').trim().toUpperCase()

    if (!model || !colour || !numberPlate) {
      const missing2 = []
      if (!model)       missing2.push('Model')
      if (!colour)      missing2.push('Colour')
      if (!numberPlate) missing2.push('Number Plate')
      invalid.push({ row: rowNum, reason: `Row ${rowNum}: missing ${missing2.join(', ')}` })
      return
    }

    const normalized = numberPlate.replace(/\s+/g, '')

    if (existingSet.has(normalized)) {
      duplicates++
      invalid.push({ row: rowNum, reason: `Row ${rowNum}: ${numberPlate} — duplicate plate (already in fleet)` })
      return
    }
    if (seenInFile.has(normalized)) {
      duplicates++
      invalid.push({ row: rowNum, reason: `Row ${rowNum}: ${numberPlate} — duplicate plate within CSV` })
      return
    }

    seenInFile.add(normalized)
    imported.push({ model, colour, numberPlate })
  })

  return { imported, invalid, duplicates }
}

// ─── CsvImport sub-component ──────────────────────────────────────────────────
function CsvImport({ vehicles, addVehicles, clearVehicles }) {
  const fileRef   = useRef(null)
  const [result,  setResult]  = useState(null)   // { filename, imported, invalid, duplicates, mode }
  const [confirm, setConfirm] = useState(null)   // pending import data waiting for replace-confirmation

  const triggerPicker = () => {
    setResult(null)
    fileRef.current && fileRef.current.click()
  }

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''           // reset so same file can be re-selected
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setResult({ error: 'Invalid file type. Please select a .csv file.' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setResult({ error: 'File too large. Maximum supported size is 5 MB.' })
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result || ''
      if (!text.trim()) {
        setResult({ error: 'The selected CSV file is empty.' })
        return
      }
      const existingPlates = vehicles.map((v) => v.numberPlate)
      const parsed = parseCSV(text, existingPlates)

      if (parsed.imported.length === 0 && parsed.invalid.length === 0) {
        setResult({ error: 'No valid vehicle rows found in the CSV.' })
        return
      }

      // Store pending data so the user can choose Add or Replace
      setConfirm({ filename: file.name, ...parsed })
      setResult(null)
    }
    reader.onerror = () => {
      setResult({ error: 'Failed to read the file. Please try again.' })
    }
    reader.readAsText(file)
  }

  const doImport = (mode) => {
    if (!confirm) return
    const { filename, imported, invalid, duplicates } = confirm

    if (mode === 'replace') {
      clearVehicles()
    }

    const added = imported.length ? addVehicles(imported) : []
    setResult({ filename, imported: added.length, invalid, duplicates, mode })
    setConfirm(null)
  }

  const cancelConfirm = () => setConfirm(null)

  // ── Confirm dialog ──
  if (confirm) {
    return (
      <div className="csv-confirm-box">
        <div className="csv-confirm-title">
          📂 <strong>{confirm.filename}</strong>
        </div>
        <div className="csv-confirm-summary">
          {confirm.imported.length} valid vehicle{confirm.imported.length !== 1 ? 's' : ''} ready to import
          {confirm.duplicates > 0 && ` · ${confirm.duplicates} duplicate plate${confirm.duplicates !== 1 ? 's' : ''} skipped`}
          {confirm.invalid.length > confirm.duplicates && ` · ${confirm.invalid.length - confirm.duplicates} invalid row${confirm.invalid.length - confirm.duplicates !== 1 ? 's' : ''}`}
        </div>

        {vehicles.length > 0 && (
          <div className="csv-confirm-choice">
            <div className="csv-choice-label">How should these vehicles be added?</div>
            <div className="csv-choice-btns">
              <button className="btn btn-primary" onClick={() => doImport('add')}>
                ＋ Add to fleet
                <span className="csv-choice-sub"> (keep {vehicles.length} existing)</span>
              </button>
              <button className="btn btn-danger" onClick={() => doImport('replace')}>
                ↺ Replace fleet
                <span className="csv-choice-sub"> (remove {vehicles.length} existing)</span>
              </button>
            </div>
          </div>
        )}

        {vehicles.length === 0 && (
          <div className="csv-confirm-choice">
            <button className="btn btn-primary" onClick={() => doImport('add')}>
              ＋ Import {confirm.imported.length} vehicles
            </button>
          </div>
        )}

        <button className="btn btn-ghost btn-sm csv-cancel" onClick={cancelConfirm}>
          Cancel
        </button>

        {confirm.invalid.length > 0 && (
          <div className="csv-invalid-list">
            <div className="csv-invalid-title">
              Rows that will be skipped ({confirm.invalid.length}):
            </div>
            {confirm.invalid.slice(0, 8).map((e, i) => (
              <div key={i} className="csv-invalid-row">{e.reason}</div>
            ))}
            {confirm.invalid.length > 8 && (
              <div className="csv-invalid-row muted">…and {confirm.invalid.length - 8} more</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Result summary ──
  const resultBanner = result && (
    result.error
      ? <div className="msg error" style={{ marginTop: 8 }}>{result.error}</div>
      : (
        <div className={`msg ${result.invalid.length > result.duplicates ? 'info' : 'success'}`} style={{ marginTop: 8 }}>
          <strong>
            {result.invalid.length > result.duplicates
              ? '⚠ CSV imported with warnings'
              : '✓ CSV import complete'}
          </strong>
          {' — '}
          {result.imported} vehicle{result.imported !== 1 ? 's' : ''} {result.mode === 'replace' ? 'replaced fleet' : 'added to fleet'}
          {result.duplicates > 0 && ` · ${result.duplicates} duplicate plate${result.duplicates !== 1 ? 's' : ''} skipped`}
          {result.invalid.length - result.duplicates > 0 && ` · ${result.invalid.length - result.duplicates} invalid row${result.invalid.length - result.duplicates !== 1 ? 's' : ''} rejected`}
          {result.filename && <span className="csv-filename"> · {result.filename}</span>}
        </div>
      )
  )

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button className="btn btn-ghost" onClick={triggerPicker} title="Import vehicles from a CSV file">
        📂 Import CSV
      </button>
      {resultBanner}
    </>
  )
}

// ─── Main VehicleForm ─────────────────────────────────────────────────────────
export default function VehicleForm() {
  const { vehicles, addVehicles, clearVehicles } = useSimulation()
  const [count,  setCount]  = useState(3)
  const [rows,   setRows]   = useState(() =>
    Array.from({ length: 3 }, () => ({ model: '', colour: '', numberPlate: '' }))
  )
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
    const dup  = rows.some((r) => {
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
      text: `${added.length} vehicle(s) saved to the fleet — they now appear at the START of the Camera Simulation road.`
    })
    setRows(Array.from({ length: count }, () => ({ model: '', colour: '', numberPlate: '' })))
  }

  return (
    <div className="panel">
      <div className="panel-title">
        Vehicle Management
        <span className="hint">add vehicles to the simulation fleet</span>
      </div>

      {/* ── Stepper row — unchanged + CSV import added inline ── */}
      <div className="num-stepper">
        <span className="lbl">Number of Vehicles</span>
        <button className="btn" onClick={() => setCountV(count - 1)}>−</button>
        <span className="val">{count}</span>
        <button className="btn" onClick={() => setCountV(count + 1)}>+</button>
        <button className="btn btn-ghost" onClick={loadDemo}>Load demo fleet</button>
        {/* ↓ NEW — CSV import lives here, beside Load demo fleet */}
        <CsvImport
          vehicles={vehicles}
          addVehicles={addVehicles}
          clearVehicles={clearVehicles}
        />
      </div>

      {/* ── Manual vehicle rows — unchanged ── */}
      <div className="vehicle-rows">
        {rows.map((row, i) => (
          <div className="vf-block" key={i}>
            <div className="vf-head">
              <span>Vehicle {String(i + 1).padStart(2, '0')}</span>
              <span className="muted" style={{ color: 'var(--text-low)' }}>fleet slot</span>
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
        <button className="btn btn-success btn-big" onClick={save}>Save Vehicles</button>
        {vehicles.length > 0 && (
          <button className="btn btn-danger" onClick={() => { clearVehicles(); setMsg(null); }}>
            Clear fleet ({vehicles.length})
          </button>
        )}
      </div>

      {vehicles.length > 0 && (
        <div className="mt-12">
          <div className="mono muted mb-8" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
            Saved fleet — {vehicles.length} vehicle(s) ready for simulation
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

