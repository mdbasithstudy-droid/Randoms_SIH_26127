import React, { useEffect, useState } from 'react'
import { SimulationProvider, useSimulation } from './context/SimulationContext'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import CameraSimulation from './components/CameraSimulation'
import AdminDashboard from './components/AdminDashboard'
import CameraConfigModal from './components/CameraConfigModal'
import BlacklistAlertModal from './components/BlacklistAlertModal'
import UrbanAnalytics from './components/UrbanAnalytics'

function Shell() {
  const [view, setView] = useState('dashboard')
  const { vehicles, configuredCount, toasts, blacklistAlerts, dismissBlacklistAlert } = useSimulation()

  return (
    <div className="app">
      <Header view={view} setView={setView} configuredCount={configuredCount} vehiclesCount={vehicles.length} />

      <main className="main">
        {view === 'dashboard' && <Dashboard setView={setView} />}
        {view === 'camera' && <CameraSimulation />}
        {view === 'admin' && <AdminDashboard />}
        {view === 'analytics' && <UrbanAnalytics />}
      </main>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* click-a-camera -> configuration modal */}
      <CameraConfigModal />

      {/* Authority Blacklist Alert Modal */}
      <BlacklistAlertModal alerts={blacklistAlerts} onDismiss={dismissBlacklistAlert} />
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
