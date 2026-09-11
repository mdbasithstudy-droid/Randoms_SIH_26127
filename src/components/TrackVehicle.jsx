import React, { useState } from 'react'
import { firebaseService } from '../services/firebaseService'
import JourneyTimeline from './JourneyTimeline'
import { CAMERAS } from '../data/cameras'

/**
 * TRACK VEHICLE — query the store (Firestore when configured, local history in
 * demo mode) by number plate. Model / colour are optional filters.
 */
export default function TrackVehicle({ onResult, onClose }) {
  const [numberPlate, setNumberPlate] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehicleColour, setVehicleColour] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState(null)
  const [msg, setMsg] = useState(null)

  const search = async () => {
    const plate = numberPlate.trim().toUpperCase()
    if (!plate) {
      setMsg({ type: 'error', text: 'NUMBER PLATE IS REQUIRED' })
      setResult(null)
      if (onResult) onResult(null)
      return
    }
    setSearching(true)
    setMsg(null)
    const res = await firebaseService.trackVehicle({ numberPlate: plate, vehicleModel, vehicleColour })
    setSearching(false)

    if (!res.ok) {
      setMsg({ type: 'error', text: res.reason === 'NUMBER_PLATE_REQUIRED' ? 'NUMBER PLATE IS REQUIRED' : 'FIREBASE CONNECTION ERROR' })
      setResult(null)
      if (onResult) onResult(null)
      return
    }

    const rows = (res.rows || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0))
    if (!rows.length) {
      setMsg({ type: 'info', text: 'NO VEHICLE HISTORY FOUND' })
      setResult(null)
      if (onResult) onResult(null)
      return
    }
    // rebuild ordered route (per camera, newest event kept)
    const ordered = CAMERAS.map((c) => {
      const matches = rows.filter((r) => r.cameraId === c.id)
      if (!matches.length) return null
      return matches[0]
    }).filter(Boolean)

    const meta = rows[0]
    const summary = {
      ok: true,
      vehicle: { numberPlate: meta.numberPlate, model: meta.vehicleModel, colour: meta.vehicleColour },
      events: ordered
    }
    setResult(summary)
    setMsg(null)
    if (onResult) onResult(summary)
  }

  return (
    <div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="tr-plate">Number Plate <em>*</em></label>
          <input
            id="tr-plate"
            value={numberPlate}
            placeholder="MH 12 AB 4921"
            style={{ textTransform: 'uppercase' }}
            onChange={(e) => setNumberPlate(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </div>
        <div className="field">
          <label htmlFor="tr-model">Vehicle Model <span className="muted">(optional)</span></label>
          <input
            id="tr-model"
            value={vehicleModel}
            placeholder="e.g. Hyundai Creta"
            onChange={(e) => setVehicleModel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </div>
        <div className="field">
          <label htmlFor="tr-colour">Vehicle Colour <span className="muted">(optional)</span></label>
          <input
            id="tr-colour"
            value={vehicleColour}
            placeholder="e.g. White"
            onChange={(e) => setVehicleColour(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
        </div>
      </div>

      <div className="mt-12 spread">
        <button className="btn btn-primary" disabled={searching} onClick={search}>
          {searching ? 'Tracking…' : 'Track Vehicle'}
        </button>
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Close</button>}
      </div>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      {result && <div className="mt-12"><JourneyTimeline result={result} /></div>}
    </div>
  )
}
