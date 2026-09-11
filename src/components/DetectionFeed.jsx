import React from 'react'
import { shortStamp } from '../utils/format'

export default function DetectionFeed({ feed }) {
  if (!feed.length) {
    return (
      <div className="empty-state mt-12">
        <div className="big">No detections yet</div>
        <div>AI vehicle detections appear here as vehicles cross each fixed camera point.</div>
      </div>
    )
  }
  return (
    <div className="feed-section mt-12">
      {feed.map((d) => (
        <div className="anpr-card" key={d.id} style={{ borderColor: d.isBlacklisted ? 'var(--red)' : undefined }}>
          <div className="ac-head">
            <span style={{ color: d.isBlacklisted ? 'var(--red)' : 'var(--cyan)' }}>AI VEHICLE DETECTED</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {d.isBlacklisted && (
                <span className="tag" style={{ background: 'var(--red-dim)', color: 'var(--red)', borderColor: '#f3c7cc' }}>
                  BLACKLISTED
                </span>
              )}
              <span className="tag">{d.cameraId}</span>
            </div>
          </div>
          <div className="ac-plate" style={{ color: d.isBlacklisted ? 'var(--red)' : 'var(--text-hi)' }}>
            {d.numberPlate}
          </div>
          <div className="ac-row"><span className="k">VEHICLE</span><span className="v">{d.model}</span></div>
          <div className="ac-row"><span className="k">COLOUR</span><span className="v">{d.colour}</span></div>
          <div className="ac-row"><span className="k">LOCATION</span><span className="v">{d.location}</span></div>
          <div className="ac-row">
            <span className="k">DETECTED</span>
            <span className="v" style={{ color: d.isBlacklisted ? 'var(--red)' : 'var(--cyan)' }}>
              {shortStamp(d.ts)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
