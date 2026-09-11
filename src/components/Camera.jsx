import React, { memo } from 'react'

/**
 * A single FIXED traffic-surveillance camera unit.
 * Cameras are physically immovable (never dragged/rotated/resized). Clicking a
 * camera opens its CAMERA CONFIGURATION panel (location / date / session start
 * timestamp). Visual state:
 *   - not configured  -> "LOCATION NOT CONFIGURED" · SENSOR READY
 *   - configured idle -> "<LOCATION>" · SENSOR ACTIVE
 *   - detecting       -> "<LOCATION>" · VEHICLE DETECTED
 */
function Camera({ camera, status = 'IDLE', attention = false, onConfigure }) {
  const configured = Boolean(camera.location && camera.date && camera.startTime)
  const detecting = status === 'DETECTED'

  const label = detecting ? 'AI Detection · Detected' : configured ? 'AI Detection · Active' : 'AI Detection · Setup'
  const statusMod = detecting ? 'detect' : configured ? 'active' : 'ready'
  const locText = configured ? camera.location : 'Location not configured'

  const cls = ['cam-unit']
  if (detecting) cls.push('detecting')
  if (!configured) cls.push('unconfigured')
  if (attention) cls.push('attention')

  return (
    <button
      type="button"
      className={cls.join(' ')}
      onClick={() => onConfigure && onConfigure(camera.id)}
      aria-haspopup="dialog"
      aria-label={`Configure ${camera.id}`}
      title={`Configure ${camera.id}`}
    >
      <span className="cam-bracket">
        <span className="cam-pole" />
        <span className="cam-body">
          <span className="cam-lens" />
        </span>
      </span>
      <span className="cam-meta">
        <span className="cam-id">
          {camera.id}
          <span className="rec" />
        </span>
        <span className={`cam-loc ${configured ? '' : 'notconfigured'}`}>{locText}</span>
        <span className={`cam-status ${statusMod}`}>
          <span className="dot" />
          {label}
        </span>
      </span>
      <span className="cam-hint">Click to configure</span>
    </button>
  )
}

export default memo(Camera, (prev, next) => {
  // Cameras are static nodes — only re-render when their real inputs change.
  return (
    prev.camera === next.camera &&
    prev.status === next.status &&
    prev.attention === next.attention &&
    prev.onConfigure === next.onConfigure
  )
})
