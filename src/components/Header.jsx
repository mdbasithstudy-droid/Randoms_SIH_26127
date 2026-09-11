import React, { useState } from 'react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'camera', label: 'Camera Simulation' },
  { id: 'admin', label: 'Authority Console' }
]

export default function Header({ view, setView, configuredCount, vehiclesCount }) {
  const [open, setOpen] = useState(false)

  const go = (id) => {
    setView(id)
    setOpen(false)
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <img src="/logo.png" alt="TrafIQ" />
          <div className="brand-txt">
            <b>TRAFI<span>Q</span></b>
            <div className="brand-sub">AI Traffic Intelligence</div>
          </div>
        </div>

        <nav className={`main-nav ${open ? 'open' : ''}`}>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-link ${view === n.id ? 'active' : ''}`}
              onClick={() => go(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <button
          className="nav-toggle"
          aria-label="Toggle navigation"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '✕' : '☰'}
        </button>

        <div className="header-right">
          <span className="ai-chip">✦ AI-Powered</span>
          <span className="status-pill live">
            <span className="status-dot" />
            AI Engine Online
          </span>
          <span className="status-pill">Cameras {configuredCount}/3</span>
          <span className="status-pill">Vehicles {vehiclesCount}</span>
        </div>
      </div>
    </header>
  )
}
