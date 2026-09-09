import React, { memo, useMemo } from 'react'
import Camera from './Camera'
import Vehicle from './Vehicle'

// travel band inside the road surface (so cars start/end inside the asphalt)
const BAND_LEFT = 2.5
const BAND_W = 95

const toX = (progress) => `${(BAND_LEFT + progress * BAND_W).toFixed(3)}%`

/**
 * The simulated road + 3 FIXED cameras.
 * `cameras` carries geometry AND the user-configured metadata so detection
 * lines, camera labels and vehicles all stay in sync.
 */
function Road({ vehicles, positions, lanes, flash, camUI, phase, cameras, attention = [], onConfigure, overlay = null }) {
  const renderItems = useMemo(() => {
    if (!vehicles.length) return []
    return vehicles.map((v, i) => {
      const prog = positions[v.id] ?? 0
      const lane = lanes[v.id] || (i % 2 === 0 ? 'top' : 'bottom')
      const idle = phase === 'idle'
      return {
        vehicle: v,
        progress: prog,
        lane,
        pxShift: idle ? (i % 2 === 0 ? 0 : 10) : 0,
        isDetected: Boolean(flash[v.id]),
        isDone: !idle && prog >= 1
      }
    })
  }, [vehicles, positions, lanes, flash, phase])

  const ordered = useMemo(() => [...cameras].sort((a, b) => a.detectionProgress - b.detectionProgress), [cameras])
  const topCams = ordered.filter((c) => c.side === 'top')
  const bottomCams = ordered.filter((c) => c.side === 'bottom')

  const chevrons = useMemo(() => {
    const xs = []
    for (let i = 0.06; i < 1; i += 0.086) {
      const tooClose = ordered.some((c) => Math.abs(i - c.detectionProgress) < 0.035)
      if (!tooClose) xs.push(i)
    }
    return xs
  }, [ordered])

  const renderCamRow = (cams, rowCls) => (
    <div className={`camera-row ${rowCls}`}>
      {cams.map((cam) => (
        <div key={cam.id} className="cam-slot" style={{ left: toX(cam.detectionProgress) }}>
          <Camera
            camera={cam}
            status={camUI[cam.id]?.status || 'IDLE'}
            attention={attention.includes(cam.id)}
            onConfigure={onConfigure}
          />
        </div>
      ))}
    </div>
  )

  return (
    <div className="road-stage">
      {renderCamRow(topCams, 'top')}

      {/* road surface */}
      <div className="road-surface">
        <span className="road-edge-line top" />
        <span className="road-edge-line bottom" />

        <span className="gate-label start">▮ START</span>
        <span className="gate-label end">END ▮</span>

        {/* painted direction chevrons */}
        {chevrons.map((x, i) => (
          <span key={i} className="chevron" style={{ left: toX(x) }}>
            ▸
          </span>
        ))}

        {/* fixed detection lines */}
        {ordered.map((cam) => {
          const lit = camUI[cam.id]?.status === 'DETECTED'
          return (
            <div
              key={cam.id}
              className={`detection-line ${lit ? 'lit' : ''}`}
              style={{ left: toX(cam.detectionProgress) }}
            >
              {lit && <span className="seg-label">{cam.id} SCAN</span>}
            </div>
          )
        })}

        {/* scanning beams while detecting */}
        {ordered.filter((c) => camUI[c.id]?.status === 'DETECTED').map((cam) => (
          <span key={`beam-${cam.id}`} className="scan-beam" style={{ left: toX(cam.detectionProgress) }} />
        ))}

        {/* vehicles */}
        <div className="vehicles-layer">
          {renderItems.map((it) => (
            <Vehicle
              key={it.vehicle.id}
              vehicle={it.vehicle}
              progress={it.progress}
              lane={it.lane}
              pxShift={it.pxShift}
              isDetected={it.isDetected}
              isDone={it.isDone}
            />
          ))}
        </div>
      </div>

      {renderCamRow(bottomCams, 'bottom')}

      {overlay && <div className="stage-hint">{overlay}</div>}
    </div>
  )
}

export default memo(Road)
