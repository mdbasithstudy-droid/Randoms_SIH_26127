import React, { useEffect, useState } from 'react'
import { SimulationProvider, useSimulation } from './context/SimulationContext'
import Header from './components/Header'
import CameraSimulation from './components/CameraSimulation'
import AdminDashboard from './components/AdminDashboard'
import CameraConfigModal from './components/CameraConfigModal'
import { formatIST } from './utils/format'

function Shell() {
  const [view, setView] = useState('camera')
  const { vehicles, events, mode, toasts } = useSimulation()
  const [clock, setClock] = useState(() => formatIST(new Date()))

  useEffect(() => {
    const t = setInterval(() => setClock(formatIST(new Date())), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="app">
      <Header mode={mode} vehiclesCount={vehicles.length} eventsCount={events.length} clock={clock} />

      <div className="view-tabs">
        <button
          className={`tab-btn ${view === 'camera' ? 'active' : ''}`}
          onClick={() => setView('camera')}
        >
          <span className="t-ico">◉</span> CAMERA SIMULATION
        </button>
        <button
          className={`tab-btn ${view === 'admin' ? 'active' : ''}`}
          onClick={() => setView('admin')}
        >
          <span className="t-ico">⬢</span> AUTHORITY CONSOLE
        </button>
      </div>

      <main className="main">
        {view === 'camera' ? <CameraSimulation /> : <AdminDashboard />}
      </main>

      {/* toasts */}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* click-a-camera -> configuration modal */}
      <CameraConfigModal />
    </div>
  )
}

export default function App() {
  return (
    <SimulationProvider>
      <Shell />
    </SimulationProvider>
  )
}
