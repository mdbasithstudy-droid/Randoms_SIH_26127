import React, { memo } from 'react'

/**
 * Small top-view vehicle rendered on the road.
 * Travel direction is left -> right (headlights on the right, taillights left).
 */
function Vehicle({ vehicle, progress, lane, isDetected, isDone, pxShift = 0 }) {
  const laneTop = lane === 'top' ? 26 : 74
  const style = {
    left: `calc(${progress * 100}% + ${pxShift}px)`,
    top: `${laneTop}%`
  }
  const cls = ['vehicle']
  if (isDetected) cls.push('detected')
  if (isDone) cls.push('done')

  return (
    <div className={cls.join(' ')} style={style}>
      <div className="car-wrap">
        <div className="car" title={`${vehicle.model} · ${vehicle.numberPlate}`}>
          <span className="car-body-color" style={{ '--vc': vehicle.colour }} />
          <span className="headlights" />
          <span className="taillights" />
        </div>
        <span className="plate">{vehicle.numberPlate}</span>
      </div>
    </div>
  )
}

export default memo(Vehicle)
