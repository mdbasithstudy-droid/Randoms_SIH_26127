import React from 'react'
import { shortStamp } from '../utils/format'

export default function DetectionFeed({ feed }) {
  if (!feed.length) {
    return (
      <div className="empty-state mt-12">
        <div className="big">ANPR MONITOR STANDBY</div>
        <div>Camera detections will appear here as vehicles cross each fixed detection zone.</div>
      </div>
    )
  }
  return (
    <div className="feed-section mt-12">
      {feed.map((d) => (
        <div className="anpr-card" key={d.id}>
          <div className="ac-head">
            <span>◉ ANPR MATCH DETECTED</span>
            <span className="tag">{d.cameraId}</span>
          </div>
          <div className="ac-plate">{d.numberPlate}</div>
          <div className="ac-row"><span className="k">VEHICLE</span><span className="v">{d.model}</span></div>
          <div className="ac-row"><span className="k">COLOUR</span><span className="v">{d.colour}</span></div>
          <div className="ac-row"><span className="k">LOCATION</span><span className="v">{d.location}</span></div>
          <div className="ac-row"><span className="k">DETECTED</span><span className="v" style={{ color: 'var(--cyan)' }}>{shortStamp(d.ts)}</span></div>
        </div>
      ))}
    </div>
  )
}
