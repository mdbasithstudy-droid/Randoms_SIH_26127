import React from 'react'

export default function Header({ mode, vehiclesCount, eventsCount, clock }) {
  return (
    <header className="app-header">
      <div className="brand">
        <img src="/logo.png" alt="TrafIQ" />
        <div className="brand-txt">
          <b>TRAFI<span>Q</span></b>
          <div className="brand-sub">INTELLIGENT TRAFFIC MONITORING & VEHICLE JOURNEY CORRELATION</div>
        </div>
      </div>

      <div className="status-row">
        <span className="status-chip ok"><span className="dot" />SYSTEM ONLINE</span>
        <span className="status-chip ok"><span className="dot" />CAMERAS 03/03</span>
        {mode === 'firestore' ? (
          <span className="status-chip live"><span className="dot" />FIREBASE CONNECTED</span>
        ) : (
          <span className="status-chip warn"><span className="dot" />DEMO DATA STORE</span>
        )}
        <span className="status-chip live"><span className="dot" />VEHICLES {vehiclesCount}</span>
        <span className="status-chip ok"><span className="dot" />EVENTS {eventsCount}</span>
        {clock && <span className="status-chip"><span className="dot" />{clock}</span>}
      </div>
    </header>
  )
}
