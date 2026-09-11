import React from 'react'
import { shortStamp } from '../utils/format'

export default function BlacklistAlertModal({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null

  // Display the most recent alert on top
  const current = alerts[0]
  const timeDisplay = current.timeStr || (current.ts ? shortStamp(current.ts).replace(' IST', '') : '—')

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal" style={{ borderColor: 'var(--red)', boxShadow: '0 18px 50px -12px rgba(220, 38, 38, 0.35)' }}>
        <div className="modal-head" style={{ borderBottom: '1px solid #f3c7cc', paddingBottom: 12, marginBottom: 16 }}>
          <h3 style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem' }}>
            <span>⚠</span> BLACKLISTED VEHICLE DETECTED
          </h3>
          <button className="btn btn-ghost" onClick={() => onDismiss(current.id)}>✕ Close</button>
        </div>

        <div style={{ background: 'var(--red-dim)', border: '1px solid #f3c7cc', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.88rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Vehicle Number</div>
              <div style={{ fontFamily: 'var(--font-code)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--red)', letterSpacing: '0.04em', marginTop: 2 }}>
                {current.numberPlate}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Vehicle</div>
              <div style={{ fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
                {current.model || '—'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Colour</div>
              <div style={{ fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
                {current.colour || '—'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Camera</div>
              <div style={{ fontWeight: 700, color: 'var(--cyan)', marginTop: 2 }}>
                {current.cameraId}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Location</div>
              <div style={{ fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
                {current.location || '—'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase' }}>Detection Time</div>
              <div style={{ fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
                {timeDisplay}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '0.82rem',
          letterSpacing: '0.08em',
          color: 'var(--red)',
          background: '#fff',
          border: '1px dashed var(--red)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16
        }}>
          AUTHORITY ATTENTION REQUIRED
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {alerts.length > 1 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-low)', alignSelf: 'center', marginRight: 'auto' }}>
              +{alerts.length - 1} more alert(s)
            </span>
          )}
          <button className="btn btn-danger btn-big" onClick={() => onDismiss(current.id)}>
            Acknowledge &amp; Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
