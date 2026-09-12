/**
 * UrbanAnalytics — AI Traffic Intelligence Layer
 *
 * Reads EXCLUSIVELY from the existing SimulationContext (same `events`,
 * `cameras`, `vehicles`, `phase`, `stats` used by Camera Simulation and
 * Authority Console).  No secondary data pipeline.  All metrics update
 * automatically whenever new detections are written by the simulation.
 *
 * Simulation scale note: the visual simulation runs at compressed time
 * (~10x faster than "real" city traffic).  SIM_SCALE = 10 is applied when
 * converting detection timestamps into plausible urban speeds / travel times.
 */
import React, { useMemo } from 'react'
import { useSimulation } from '../context/SimulationContext'
import { shortStamp } from '../utils/format'

// Scale constants
const SIM_ROAD_KM = 1.0   // conceptual road length (km)
const SIM_SCALE   = 10    // wall-clock ms x SIM_SCALE = simulated-real-time ms

// Congestion colors (reuse CSS variables)
const CONG_COLOR = {
  LOW      : 'var(--green)',
  MODERATE : 'var(--amber)',
  HIGH     : 'var(--red)'
}

// ─── Analytics computation hook ───────────────────────────────────────────────
function useAnalytics(events, cameras) {
  return useMemo(() => {
    const EMPTY = {
      totalDetections: 0, uniquePlates: 0, vehiclesPerHour: 0,
      avgSpeedKmh: 0, avgJourneyMs: 0, congestionLevel: 'LOW',
      activeRoutes: 0, perCamera: {}, routes: [],
      journeys: [], odPairs: [], hotspots: [],
      insights: ['Start the Camera Simulation to populate analytics.']
    }
    if (!events || events.length === 0) return EMPTY

    // Camera position map (detectionProgress 0-1)
    const camPos = {}
    cameras.forEach(c => { camPos[c.id] = c.detectionProgress || 0 })

    // Group events by camera
    const perCamera = {}
    cameras.forEach(c => { perCamera[c.id] = [] })
    events.forEach(e => {
      if (!perCamera[e.cameraId]) perCamera[e.cameraId] = []
      perCamera[e.cameraId].push(e)
    })

    // Group events by plate, sort by ts
    const byVehicle = {}
    events.forEach(e => {
      if (!byVehicle[e.numberPlate]) byVehicle[e.numberPlate] = []
      byVehicle[e.numberPlate].push(e)
    })

    // Build journey objects
    const journeys = Object.entries(byVehicle)
      .map(([plate, evts]) => {
        const sorted = [...evts].sort((a, b) => a.ts - b.ts)
        const first = sorted[0]
        const last  = sorted[sorted.length - 1]
        return {
          numberPlate : plate,
          model       : first.vehicleModel  || '',
          colour      : first.vehicleColour || '',
          events      : sorted,
          startCamera : first.cameraId,
          endCamera   : last.cameraId,
          startLoc    : first.location || first.cameraId,
          endLoc      : last.location  || last.cameraId,
          startTs     : first.ts,
          endTs       : last.ts,
          durationMs  : last.ts - first.ts,
          cameraCount : sorted.length
        }
      })
      .sort((a, b) => b.startTs - a.startTs)

    // Build route-segment map (consecutive camera pairs per vehicle)
    const routeMap = {}
    journeys.forEach(j => {
      for (let i = 0; i < j.events.length - 1; i++) {
        const from   = j.events[i]
        const to     = j.events[i + 1]
        const distKm = Math.abs(
          (camPos[to.cameraId] || 0) - (camPos[from.cameraId] || 0)
        ) * SIM_ROAD_KM
        const key = `${from.cameraId}:${to.cameraId}`
        if (!routeMap[key]) {
          routeMap[key] = {
            from: from.cameraId, to: to.cameraId,
            fromLoc: from.location || from.cameraId,
            toLoc  : to.location   || to.cameraId,
            count: 0, totalMs: 0, distKm
          }
        }
        routeMap[key].count++
        routeMap[key].totalMs += to.ts - from.ts
      }
    })

    // Enrich routes with speed + congestion
    const routes = Object.values(routeMap).map(r => {
      const avgMs       = r.count > 0 ? r.totalMs / r.count : 0
      const realMs      = avgMs * SIM_SCALE
      const avgHr       = realMs / 3600000
      const avgSpeedKmh = avgHr > 0 ? r.distKm / avgHr : 0
      const avgTimeSec  = realMs / 1000
      const congestion  =
        avgSpeedKmh === 0  ? 'LOW'
        : avgSpeedKmh < 25 ? 'HIGH'
        : avgSpeedKmh < 40 ? 'MODERATE'
        : 'LOW'
      return { ...r, avgMs, avgSpeedKmh, avgTimeSec, congestion }
    }).sort((a, b) => b.count - a.count)

    // Global averages
    const uniquePlates    = Object.keys(byVehicle).length
    const totalDetections = events.length
    const speedSamples    = routes.filter(r => r.avgSpeedKmh > 0)
    const avgSpeedKmh     = speedSamples.length
      ? speedSamples.reduce((s, r) => s + r.avgSpeedKmh, 0) / speedSamples.length
      : 0
    const multiCam    = journeys.filter(j => j.cameraCount > 1)
    const avgJourneyMs = multiCam.length
      ? multiCam.reduce((s, j) => s + j.durationMs * SIM_SCALE, 0) / multiCam.length
      : 0
    const congestionLevel =
      avgSpeedKmh === 0  ? 'LOW'
      : avgSpeedKmh < 25 ? 'HIGH'
      : avgSpeedKmh < 40 ? 'MODERATE'
      : 'LOW'

    // Vehicles / hour (scaled)
    const tss    = events.map(e => e.ts)
    const spanMs = tss.length > 1 ? Math.max(...tss) - Math.min(...tss) : 0
    const vehiclesPerHour = spanMs > 0
      ? uniquePlates / ((spanMs * SIM_SCALE) / 3600000)
      : uniquePlates > 0 ? uniquePlates * 60 : 0

    // OD pairs
    const odMap = {}
    journeys.forEach(j => {
      if (j.startCamera !== j.endCamera) {
        const k = `${j.startCamera} -> ${j.endCamera}`
        odMap[k] = (odMap[k] || 0) + 1
      }
    })
    const odPairs = Object.entries(odMap)
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count)

    // Hotspots
    const camRanked = cameras
      .map(c => ({
        id: c.id, location: c.location || c.id,
        count: (perCamera[c.id] || []).length
      }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)

    const hotspots = [
      ...camRanked.map((c, i) => {
        const cong =
          c.count >= uniquePlates                         ? 'HIGH'
          : c.count >= Math.ceil(uniquePlates * 0.5)     ? 'MODERATE'
          : 'LOW'
        return {
          rank: i + 1, label: c.id, sub: c.location,
          detail: `${c.count} detection${c.count !== 1 ? 's' : ''}`,
          congestion: cong, type: 'camera'
        }
      }),
      ...routes.slice(0, 2).map((r, i) => ({
        rank: camRanked.length + i + 1,
        label: `${r.from} -> ${r.to}`,
        sub: `${r.fromLoc}`,
        detail: `${r.count} vehicle${r.count !== 1 ? 's' : ''} - ${r.avgSpeedKmh.toFixed(0)} km/h`,
        congestion: r.congestion, type: 'route'
      }))
    ].slice(0, 5)

    // AI Insights (all derived from actual values)
    const insights = []
    if (camRanked.length > 0) {
      const top = camRanked[0]
      insights.push(
        `${top.id} is recording the highest vehicle volume with ${top.count} detection${top.count !== 1 ? 's' : ''}.`
      )
    }
    if (avgSpeedKmh > 0) {
      insights.push(
        `Average simulated travel speed across the network is ${avgSpeedKmh.toFixed(1)} km/h.`
      )
    }
    if (odPairs.length > 0) {
      const top = odPairs[0]
      insights.push(
        `Most frequent movement corridor: ${top.pair} — ${top.count} vehicle${top.count !== 1 ? 's' : ''} tracked.`
      )
    }
    if (routes.length > 0) {
      const slow = [...routes].sort((a, b) => a.avgSpeedKmh - b.avgSpeedKmh)[0]
      if (slow.avgSpeedKmh > 0) {
        insights.push(
          `Lowest average speed is on the ${slow.from}–${slow.to} segment at ${slow.avgSpeedKmh.toFixed(1)} km/h.`
        )
      }
    }
    if (camRanked.length > 1) {
      const quiet = camRanked[camRanked.length - 1]
      insights.push(
        `${quiet.id} has the lowest traffic intensity (${quiet.count} detection${quiet.count !== 1 ? 's' : ''}).`
      )
    }
    if (avgJourneyMs > 0) {
      const secs = Math.round(avgJourneyMs / 1000)
      insights.push(
        `Average multi-camera journey takes approximately ${secs}s of simulated real time.`
      )
    }
    if (congestionLevel === 'HIGH') {
      insights.push('Network congestion is elevated — consider increasing monitoring at high-load nodes.')
    } else if (congestionLevel === 'LOW' && totalDetections > 0) {
      insights.push('Traffic is flowing smoothly across all simulated camera segments.')
    }
    if (insights.length === 0) {
      insights.push('Insufficient data — run more simulation passes to generate insights.')
    }

    return {
      totalDetections, uniquePlates, vehiclesPerHour, avgSpeedKmh,
      avgJourneyMs, congestionLevel, activeRoutes: routes.length,
      perCamera, routes, journeys, odPairs, hotspots, insights
    }
  }, [events, cameras])
}

// ─── Shared small helpers ─────────────────────────────────────────────────────
function CongBadge({ level }) {
  return (
    <span className={`ua-cong-badge ua-cong-${level.toLowerCase()}`}>
      <span className="dot" style={{ background: CONG_COLOR[level] }} />
      {level}
    </span>
  )
}

function fmtSpeed(kph) {
  return kph > 0 ? `${kph.toFixed(1)} km/h` : '—'
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m   = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

// ─── 1. Overview cards ────────────────────────────────────────────────────────
function OverviewCards({ a }) {
  const congIcon =
    a.congestionLevel === 'HIGH' ? '🔴'
    : a.congestionLevel === 'MODERATE' ? '🟡' : '🟢'

  const cards = [
    {
      key: 'volume', label: 'Traffic Volume',
      value: a.totalDetections, unit: 'detections',
      sub: `${a.uniquePlates} unique vehicle${a.uniquePlates !== 1 ? 's' : ''}`,
      foot: a.vehiclesPerHour > 0
        ? `~${Math.round(a.vehiclesPerHour)} vehicles/hr (sim)` : 'Awaiting data',
      icon: '📊', valueColor: ''
    },
    {
      key: 'speed', label: 'Avg. Speed',
      value: a.avgSpeedKmh > 0 ? a.avgSpeedKmh.toFixed(1) : '—', unit: 'km/h',
      sub: 'Simulated urban speed',
      foot: `Derived from detection timestamps x${SIM_SCALE} scale`,
      icon: '⚡', valueColor: ''
    },
    {
      key: 'travel', label: 'Avg. Travel Time',
      value: fmtDuration(a.avgJourneyMs), unit: '',
      sub: 'Multi-camera journeys',
      foot: `Scaled x${SIM_SCALE} from simulation timestamps`,
      icon: '⏱️', valueColor: ''
    },
    {
      key: 'cong', label: 'Congestion Level',
      value: a.congestionLevel, unit: '',
      sub: 'Network-wide assessment',
      foot: 'Based on simulated average speed',
      icon: congIcon,
      valueColor: `ua-cong-val-${a.congestionLevel.toLowerCase()}`
    },
    {
      key: 'routes', label: 'Active Routes',
      value: a.activeRoutes, unit: 'segments',
      sub: `${a.journeys.length} journey${a.journeys.length !== 1 ? 's' : ''} correlated`,
      foot: 'Camera-to-camera route segments',
      icon: '🔗', valueColor: ''
    }
  ]

  return (
    <div className="ua-overview-grid">
      {cards.map(c => (
        <div className="ua-card" key={c.key}>
          <div className="ua-card-top">
            <span className="ua-card-label">{c.label}</span>
            <span className="ua-card-icon">{c.icon}</span>
          </div>
          <div className={`ua-card-value ${c.valueColor}`}>
            {c.value}
            {c.unit && <span className="ua-card-unit"> {c.unit}</span>}
          </div>
          <div className="ua-card-sub">{c.sub}</div>
          <div className="ua-card-foot">{c.foot}</div>
        </div>
      ))}
    </div>
  )
}

// ─── 2. Schematic network SVG ─────────────────────────────────────────────────
function NetworkSchematic({ analytics, cameras }) {
  const { perCamera, routes } = analytics
  const NODE_Y = 105
  const xs     = [110, 360, 610]

  const nodes = cameras
    .slice()
    .sort((a, b) => (a.detectionProgress || 0) - (b.detectionProgress || 0))
    .map((cam, i) => ({
      ...cam,
      x: xs[i] !== undefined ? xs[i] : 110 + i * 250,
      y: NODE_Y,
      count: (perCamera[cam.id] || []).length
    }))

  const getRoute = (fromId, toId) =>
    routes.find(r => r.from === fromId && r.to === toId)

  const lineColor = (fromId, toId) => {
    const r = getRoute(fromId, toId)
    return r ? CONG_COLOR[r.congestion] : '#dce3ec'
  }

  const lineWidth = (fromId, toId) => {
    const r = getRoute(fromId, toId)
    if (!r || r.count === 0) return 2
    return Math.min(2 + r.count * 2, 10)
  }

  const arrowId = (fromId, toId) => {
    const r = getRoute(fromId, toId)
    if (!r) return 'ua-arr-none'
    return `ua-arr-${r.congestion.toLowerCase()}`
  }

  return (
    <div className="ua-network-wrap">
      <div className="ua-network-label">
        <span className="ua-network-badge">SCHEMATIC CAMERA NETWORK — NOT A REAL MAP</span>
        <span className="hint">
          Simulation-based traffic flow · vehicle counts from detection events
        </span>
      </div>

      <svg
        className="ua-network-svg"
        viewBox="0 0 720 210"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {[
            { id: 'ua-arr-low',      fill: CONG_COLOR.LOW      },
            { id: 'ua-arr-moderate', fill: CONG_COLOR.MODERATE  },
            { id: 'ua-arr-high',     fill: CONG_COLOR.HIGH      },
            { id: 'ua-arr-none',     fill: '#dce3ec'            }
          ].map(m => (
            <marker key={m.id} id={m.id}
              markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
              <path d="M0,0 L0,9 L9,4.5 z" fill={m.fill} />
            </marker>
          ))}
        </defs>

        {/* Road baseline */}
        <rect x="70" y="97" width="580" height="16" rx="8" fill="#f0f3f8" />

        {/* Links between cameras */}
        {nodes.slice(0, -1).map((n, i) => {
          const next  = nodes[i + 1]
          const r     = getRoute(n.id, next.id)
          const color = lineColor(n.id, next.id)
          const width = lineWidth(n.id, next.id)
          const midX  = (n.x + next.x) / 2

          return (
            <g key={`link-${i}`}>
              <line
                x1={n.x + 28} y1={NODE_Y}
                x2={next.x - 28} y2={NODE_Y}
                stroke={color} strokeWidth={width}
                strokeLinecap="round"
                markerEnd={`url(#${arrowId(n.id, next.id)})`}
                opacity={r ? 1 : 0.35}
              />
              {r && (
                <>
                  <text x={midX} y={NODE_Y - 18} textAnchor="middle"
                    fontSize="11" fill={color} fontWeight="700"
                    fontFamily="'JetBrains Mono', monospace">
                    {r.avgSpeedKmh.toFixed(0)} km/h
                  </text>
                  <text x={midX} y={NODE_Y + 33} textAnchor="middle"
                    fontSize="10" fill="#64748b" fontWeight="600">
                    {r.count} veh.
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Camera nodes */}
        {nodes.map(n => {
          const active = n.count > 0
          return (
            <g key={n.id}>
              {active && (
                <circle cx={n.x} cy={n.y} r={32} fill="rgba(30,94,255,0.07)" />
              )}
              <circle cx={n.x} cy={n.y} r={26}
                fill={active ? '#1e3a5f' : '#f8fafc'}
                stroke={active ? '#2563eb' : '#cbd5e1'} strokeWidth={2} />
              <text x={n.x} y={n.y - 2} textAnchor="middle"
                fontSize="15" dominantBaseline="middle">
                📷
              </text>
              <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize="9"
                fill={active ? '#90b8e8' : '#94a3b8'} fontWeight="800"
                fontFamily="'JetBrains Mono', monospace" letterSpacing="0.04em">
                {n.id}
              </text>
              {n.count > 0 && (
                <g>
                  <circle cx={n.x + 18} cy={n.y - 18} r={12} fill="#2563eb" />
                  <text x={n.x + 18} y={n.y - 14} textAnchor="middle"
                    fontSize="10" fill="#fff" fontWeight="800">
                    {n.count}
                  </text>
                </g>
              )}
              <text x={n.x} y={n.y + 52} textAnchor="middle"
                fontSize="10" fill="#475569" fontWeight="600">
                {(n.location || n.id).length > 22
                  ? (n.location || n.id).slice(0, 22) + '...'
                  : (n.location || n.id)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="ua-network-legend">
        {[
          { label: 'LOW TRAFFIC',      color: CONG_COLOR.LOW      },
          { label: 'MODERATE TRAFFIC', color: CONG_COLOR.MODERATE  },
          { label: 'HIGH TRAFFIC',     color: CONG_COLOR.HIGH      },
          { label: 'NO DATA',          color: '#dce3ec'            }
        ].map(l => (
          <span className="ua-legend-item" key={l.label}>
            <span className="ua-legend-dot" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 3. Traffic Flow table ─────────────────────────────────────────────────────
function TrafficFlowSection({ routes }) {
  if (routes.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">No route data yet</div>
        <div>Run the simulation with multiple vehicles to generate camera-to-camera segments.</div>
      </div>
    )
  }
  return (
    <div>
      <table className="ua-flow-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Vehicles</th>
            <th>Avg Speed</th>
            <th>Travel Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {routes.map(r => (
            <tr key={`${r.from}-${r.to}`}>
              <td>
                <span className="ua-cam-tag">{r.from}</span>
                <span className="ua-route-arrow"> → </span>
                <span className="ua-cam-tag">{r.to}</span>
              </td>
              <td><strong>{r.count}</strong></td>
              <td>{fmtSpeed(r.avgSpeedKmh)}</td>
              <td>{fmtDuration(r.avgTimeSec * 1000)}</td>
              <td><CongBadge level={r.congestion} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ua-note">
        Simulation-based traffic analysis · speeds scaled x{SIM_SCALE} from detection timestamps
      </p>
    </div>
  )
}

// ─── 4. Congestion grid ────────────────────────────────────────────────────────
function CongestionSection({ analytics, cameras }) {
  const { perCamera, routes, uniquePlates } = analytics
  return (
    <div className="ua-congestion-grid">
      {cameras.map(cam => {
        const count     = (perCamera[cam.id] || []).length
        const camRoutes = routes.filter(r => r.from === cam.id || r.to === cam.id)
        const avgSpeed  = camRoutes.length
          ? camRoutes.reduce((s, r) => s + r.avgSpeedKmh, 0) / camRoutes.length
          : 0
        const congestion =
          count === 0                                      ? 'LOW'
          : count >= uniquePlates                          ? 'HIGH'
          : count >= Math.ceil(uniquePlates * 0.5)         ? 'MODERATE'
          : 'LOW'
        return (
          <div key={cam.id} className={`ua-cong-card ua-cong-card-${congestion.toLowerCase()}`}>
            <div className="ua-cong-cam-id">{cam.id}</div>
            <CongBadge level={congestion} />
            <div className="ua-cong-loc">{cam.location || 'Not configured'}</div>
            <div className="ua-cong-stats">
              <div className="ua-cong-stat">
                <span className="hk">Detections</span>
                <span className="hv">{count}</span>
              </div>
              <div className="ua-cong-stat">
                <span className="hk">Avg Speed</span>
                <span className="hv">{fmtSpeed(avgSpeed)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 5. OD analysis ───────────────────────────────────────────────────────────
function ODAnalysis({ odPairs }) {
  if (odPairs.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">No journey data yet</div>
        <div>Multi-camera vehicle journeys will generate Origin-Destination data.</div>
      </div>
    )
  }
  const maxCount = Math.max(...odPairs.map(p => p.count), 1)
  return (
    <div>
      <div className="ua-od-list">
        {odPairs.map(p => (
          <div key={p.pair} className="ua-od-row">
            <span className="ua-od-label">{p.pair}</span>
            <div className="ua-od-bar-wrap">
              <div
                className="ua-od-bar"
                style={{ width: `${Math.max((p.count / maxCount) * 100, 8)}%` }}
              />
            </div>
            <span className="ua-od-count">{p.count}</span>
          </div>
        ))}
      </div>
      <p className="ua-note">
        Most frequent vehicle movements · derived from correlated journey data
      </p>
    </div>
  )
}

// ─── 6. Recent journeys ────────────────────────────────────────────────────────
function RecentJourneys({ journeys }) {
  if (journeys.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">No journeys recorded</div>
        <div>Vehicles must pass at least one camera to appear here.</div>
      </div>
    )
  }
  return (
    <div>
      <table className="ua-flow-table">
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Route</th>
            <th>First Seen</th>
            <th>Last Seen</th>
            <th>Duration</th>
            <th>Cams</th>
          </tr>
        </thead>
        <tbody>
          {journeys.slice(0, 10).map((j, i) => (
            <tr key={`${j.numberPlate}-${i}`}>
              <td>
                <span className="ua-plate">{j.numberPlate}</span>
                {j.model && (
                  <div className="ua-vehicle-meta">{j.model} · {j.colour}</div>
                )}
              </td>
              <td>
                <span className="ua-cam-tag">{j.startCamera}</span>
                {j.startCamera !== j.endCamera && (
                  <>
                    <span className="ua-route-arrow"> → </span>
                    <span className="ua-cam-tag">{j.endCamera}</span>
                  </>
                )}
              </td>
              <td className="ua-stamp">{shortStamp(j.startTs)}</td>
              <td className="ua-stamp">
                {j.cameraCount > 1 ? shortStamp(j.endTs) : '—'}
              </td>
              <td>{j.cameraCount > 1 ? fmtDuration(j.durationMs * SIM_SCALE) : '—'}</td>
              <td>{j.cameraCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {journeys.length > 10 && (
        <p className="ua-note">{journeys.length - 10} more journeys not shown</p>
      )}
    </div>
  )
}

// ─── 7. Traffic hotspots ───────────────────────────────────────────────────────
function TrafficHotspots({ hotspots }) {
  if (hotspots.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">No hotspot data</div>
        <div>Run the simulation to identify traffic hotspots.</div>
      </div>
    )
  }
  return (
    <div className="ua-hotspot-list">
      {hotspots.map(h => (
        <div key={h.rank} className={`ua-hotspot ua-hotspot-${h.congestion.toLowerCase()}`}>
          <div className="ua-hotspot-rank">#{h.rank}</div>
          <div className="ua-hotspot-body">
            <div className="ua-hotspot-label">{h.label}</div>
            <div className="ua-hotspot-sub">{h.sub}</div>
            <div className="ua-hotspot-detail">{h.detail}</div>
          </div>
          <CongBadge level={h.congestion} />
        </div>
      ))}
    </div>
  )
}

// ─── 8. AI Insights ────────────────────────────────────────────────────────────
function AIInsights({ insights }) {
  return (
    <div className="ua-insights">
      {insights.map((text, i) => (
        <div key={i} className="ua-insight-item">
          <span className="ua-insight-dot">✦</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function UrbanAnalytics() {
  const {
    events, cameras, vehicles, configuredCount, phase, stats, mode
  } = useSimulation()

  const analytics = useAnalytics(events, cameras)
  const hasData   = events && events.length > 0

  return (
    <div className="view">
      {/* Page header */}
      <div className="ua-hero">
        <div className="ua-hero-text">
          <div className="section-label">
            Urban Analytics · City-wide Traffic Intelligence
          </div>
          <h2 className="ua-title">Urban Analytics</h2>
          <p className="ua-desc">
            City-wide traffic intelligence generated from connected AI camera data.
            All metrics are derived from the live Camera Simulation — no separate data source.
          </p>
        </div>
        <div className="ua-hero-right">
          <span className="status-pill live">
            <span className="status-dot" />
            LIVE ANALYTICS
          </span>
          <span className={`status-pill ${mode === 'firestore' ? 'live' : ''}`}>
            <span className="status-dot"
              style={{ background: mode === 'firestore' ? 'var(--green)' : 'var(--amber)' }} />
            {mode === 'firestore' ? 'Firebase' : 'Local Mode'}
          </span>
        </div>
      </div>

      {/* HUD strip */}
      <div className="sim-hud">
        <div className="hud-tile">
          <div className="hk">Cameras Monitored</div>
          <div className={`hv ${configuredCount === cameras.length ? 'cyan' : ''}`}>
            {configuredCount}/{cameras.length}
          </div>
        </div>
        <div className="hud-tile">
          <div className="hk">Vehicles Tracked</div>
          <div className="hv">{analytics.uniquePlates}</div>
        </div>
        <div className="hud-tile">
          <div className="hk">Detections</div>
          <div className="hv cyan">{analytics.totalDetections}</div>
        </div>
        <div className="hud-tile">
          <div className="hk">Journeys</div>
          <div className="hv">{analytics.journeys.length}</div>
        </div>
        <div className="hud-tile">
          <div className="hk">Active Routes</div>
          <div className="hv">{analytics.activeRoutes}</div>
        </div>
        <div className="hud-tile">
          <div className="hk">Sim Status</div>
          <div className={`hv ${phase === 'running' ? 'cyan' : ''}`}>
            {phase === 'running' ? 'Running' : phase === 'done' ? 'Complete' : 'Idle'}
          </div>
        </div>
      </div>

      {/* No-data banner */}
      {!hasData && (
        <div className="status-banner info">
          No detection data yet — run the <strong>Camera Simulation</strong> to populate
          Urban Analytics. All metrics update automatically.
        </div>
      )}

      {/* Traffic Overview cards */}
      <div className="panel mt-12">
        <div className="panel-title">
          Traffic Overview
          <span className="hint">derived from simulation detection events</span>
        </div>
        <OverviewCards a={analytics} />
      </div>

      {/* Network schematic */}
      <div className="panel">
        <div className="panel-title">
          AI Camera Network — Traffic Flow
          <span className="hint">simulated camera network · not a real map</span>
        </div>
        <NetworkSchematic analytics={analytics} cameras={cameras} />
      </div>

      {/* Two-column sections */}
      <div className="admin-grid">
        <div className="admin-col">
          <div className="panel">
            <div className="panel-title">
              Traffic Flow Analysis
              <span className="hint">per camera-to-camera route</span>
            </div>
            <TrafficFlowSection routes={analytics.routes} />
          </div>

          <div className="panel">
            <div className="panel-title">
              Most Frequent Vehicle Movements
              <span className="hint">origin–destination analysis</span>
            </div>
            <ODAnalysis odPairs={analytics.odPairs} />
          </div>

          <div className="panel">
            <div className="panel-title">
              Journey Analytics
              <span className="hint">correlated vehicle journeys</span>
            </div>
            <RecentJourneys journeys={analytics.journeys} />
          </div>
        </div>

        <div className="admin-col">
          <div className="panel">
            <div className="panel-title">
              Congestion Analysis
              <span className="hint">simulation-based analysis per camera node</span>
            </div>
            <CongestionSection analytics={analytics} cameras={cameras} />
          </div>

          <div className="panel">
            <div className="panel-title">
              Traffic Hotspots
              <span className="hint">highest-load nodes and routes</span>
            </div>
            <TrafficHotspots hotspots={analytics.hotspots} />
          </div>

          <div className="panel">
            <div className="panel-title">
              AI Traffic Insights
              <span className="hint">generated from current simulation data</span>
            </div>
            <AIInsights insights={analytics.insights} />
          </div>
        </div>
      </div>

      <p className="ua-footer-note">
        Urban Analytics · TrafIQ · All metrics are derived from the Camera Simulation
        and are not real-world traffic measurements.
      </p>
    </div>
  )
}
