import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback
} from 'react'
import { CAMERAS } from '../data/cameras'
import {
  STORAGE_KEYS,
  ROAD_TRAVEL_MS,
  LAUNCH_STAGGER_MS,
  DETECT_UI_MS,
  ANPR_TOAST_MS,
  SIM_DEFAULTS
} from '../data/constants'
import { uid, todayLocalISO, nowLocalTime, blankCameraConfigs } from '../utils/format'
import { firebaseService } from '../services/firebaseService'

const SimulationContext = createContext(null)

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* ignore */
  }
}

export function SimulationProvider({ children }) {
  // ---------- persistent configuration ----------
  const [sim, setSimState] = useState(() =>
    loadJSON(STORAGE_KEYS.sim, {
      place: SIM_DEFAULTS.place,
      date: todayLocalISO(),
      time: nowLocalTime()
    })
  )
  const [vehicles, setVehiclesState] = useState(() => loadJSON(STORAGE_KEYS.vehicles, []))
  // per-camera user configuration — cameras are physically fixed, metadata is configurable
  const [cameraConfigs, setCameraConfigs] = useState(() => loadJSON(STORAGE_KEYS.cameras, blankCameraConfigs(CAMERAS)))
  const cameras = useMemo(() => CAMERAS.map((g) => ({ ...g, ...(cameraConfigs[g.id] || {}) })), [cameraConfigs])
  const configuredCount = cameras.filter((c) => c.location && c.date && c.startTime).length
  const allConfigured = configuredCount === cameras.length

  // persist the initial defaults once so they don't reset to page-load time
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEYS.sim)) {
      saveJSON(STORAGE_KEYS.sim, {
        place: SIM_DEFAULTS.place,
        date: todayLocalISO(),
        time: nowLocalTime()
      })
    }
    if (!localStorage.getItem(STORAGE_KEYS.cameras)) {
      saveJSON(STORAGE_KEYS.cameras, blankCameraConfigs(CAMERAS))
    }
  }, [])

  // ---------- runtime state ----------
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [positions, setPositions] = useState({}) // id -> progress 0..1
  const [lanes, setLanes] = useState({}) // id -> 'top' | 'bottom'
  const [detected, setDetected] = useState({}) // id -> [cameraIds detected]
  const [flash, setFlash] = useState({}) // id -> cameraId currently highlighting
  const [camUI, setCamUI] = useState({}) // cameraId -> {status, ...vehicle}
  const [feed, setFeed] = useState([]) // ANPR detection feed (newest first)
  const [events, setEvents] = useState([]) // recent camera events (from store)
  const [mode, setMode] = useState('demo')
  const [toasts, setToasts] = useState([])
  const [stats, setStats] = useState({ launched: 0, events: 0, done: 0 })
  const [simClock, setSimClock] = useState(null) // sim clock epoch ms (live while running)
  const [cameraConfigTarget, setCameraConfigTarget] = useState(null) // camera id for config modal
  const [attention, setAttention] = useState([]) // unconfigured cameras highlighted after a blocked start

  // refs (avoid stale closures inside the rAF loop)
  const phaseRef = useRef(phase)
  const vehiclesRef = useRef([]) // ordered vehicles frozen at start
  const simSnapshotRef = useRef(sim)
  const positionsRef = useRef({})
  const detectedRef = useRef({})
  const startAtRef = useRef(0)
  const simBaseRef = useRef(0)
  const camerasRef = useRef([])
  const attentionTimeout = useRef(null)
  const runEventsRef = useRef(0)
  const camTimeout = useRef({})
  const flashTimeout = useRef({})
  const rafRef = useRef(null)
  const runIdRef = useRef(0)

  phaseRef.current = phase

  // ---------- toasts ----------
  const addToast = useCallback((type, msg) => {
    const id = uid('t')
    setToasts((prev) => [...prev, { id, type, msg }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4600)
  }, [])

  // ---------- data-layer init / realtime events ----------
  useEffect(() => {
    const m = firebaseService.init()
    setMode(m)
    const unsub = firebaseService.subscribe((rows) => setEvents(rows))
    const errUnsub = firebaseService.onError((msg) => addToast('err', msg))
    return () => {
      unsub()
      errUnsub()
    }
  }, [addToast])

  // ---------- setters with persistence ----------
  const setSim = useCallback(
    (patch) => {
      setSimState((prev) => {
        const next = { ...prev, ...patch }
        saveJSON(STORAGE_KEYS.sim, next)
        return next
      })
    },
    []
  )

  const saveVehicles = useCallback((list) => {
    setVehiclesState(list)
    saveJSON(STORAGE_KEYS.vehicles, list)
  }, [])

  const addVehicles = useCallback(
    (list) => {
      const fresh = list.map((v) => ({
        id: uid('veh'),
        model: (v.model || '').trim(),
        colour: (v.colour || '').trim(),
        numberPlate: (v.numberPlate || '').trim().toUpperCase(),
        createdAt: Date.now()
      }))
      setVehiclesState((prev) => {
        const next = [...prev, ...fresh]
        saveJSON(STORAGE_KEYS.vehicles, next)
        return next
      })
      return fresh
    },
    []
  )

  const clearVehicles = useCallback(() => {
    saveVehicles([])
    addToast('info', 'ALL VEHICLES CLEARED FROM CONSOLE')
  }, [saveVehicles, addToast])

  // ---------- camera configuration (React state only — never written to Firebase) ----------
  const updateCamera = useCallback((id, patch) => {
    setCameraConfigs((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), ...patch } }
      saveJSON(STORAGE_KEYS.cameras, next)
      return next
    })
    setAttention((a) => a.filter((x) => x !== id))
  }, [])

  const openCameraConfig = useCallback((id) => {
    setCameraConfigTarget(id)
    setAttention((a) => a.filter((x) => x !== id))
  }, [])

  const closeCameraConfig = useCallback(() => setCameraConfigTarget(null), [])

  const highlightUnconfigured = useCallback((ids) => {
    setAttention(ids)
    if (attentionTimeout.current) clearTimeout(attentionTimeout.current)
    attentionTimeout.current = setTimeout(() => setAttention([]), 4000)
  }, [])

  // ---------- fire a camera passage event ----------
  const fireDetection = useCallback(
    (vehicle, camera, detectTs) => {
      const ts = detectTs || Date.now()
      // local visual: highlight vehicle + camera + feed
      setCamUI((prev) => ({
        ...prev,
        [camera.id]: {
          status: 'DETECTED',
          cameraId: camera.id,
          location: camera.location,
          numberPlate: vehicle.numberPlate,
          model: vehicle.model,
          colour: vehicle.colour,
          ts
        }
      }))
      const prevT = camTimeout.current[camera.id]
      if (prevT) clearTimeout(prevT)
      camTimeout.current[camera.id] = setTimeout(() => {
        setCamUI((prev) => ({ ...prev, [camera.id]: { status: 'SENSOR_ACTIVE' } }))
      }, DETECT_UI_MS)

      // highlight the vehicle briefly
      setFlash((prev) => ({ ...prev, [vehicle.id]: camera.id }))
      const ft = flashTimeout.current[vehicle.id]
      if (ft) clearTimeout(ft)
      flashTimeout.current[vehicle.id] = setTimeout(() => {
        setFlash((prev) => {
          const n = { ...prev }
          delete n[vehicle.id]
          return n
        })
      }, 1900)

      // ANPR feed card
      const feedItem = {
        id: uid('anpr'),
        cameraId: camera.id,
        location: camera.location,
        cfgTime: camera.startTime,
        cfgDate: camera.date,
        numberPlate: vehicle.numberPlate,
        model: vehicle.model,
        colour: vehicle.colour,
        ts
      }
      setFeed((prev) => [feedItem, ...prev].slice(0, 8))
      setTimeout(() => {
        setFeed((prev) => prev.filter((f) => f.id !== feedItem.id))
      }, ANPR_TOAST_MS)

      // Firestore / local store write (the ONLY thing persisted — CAMERA_PASSAGE)
      runEventsRef.current += 1
      setStats((s) => ({ ...s, events: runEventsRef.current }))
      const payload = {
        vehicleId: vehicle.id,
        numberPlate: vehicle.numberPlate,
        vehicleModel: vehicle.model,
        vehicleColour: vehicle.colour,
        cameraId: camera.id,
        location: camera.location,
        simPlace: simSnapshotRef.current.place,
        simDate: simSnapshotRef.current.date,
        simStartTime: simSnapshotRef.current.time,
        ts,
        eventType: 'CAMERA_PASSAGE'
      }
      firebaseService.addEvent(payload).then((res) => {
        if (res && res.ok === false) addToast('err', `CAMERA EVENT FAILED — ${camera.id}`)
      }).catch(() => {
        addToast('err', `CAMERA EVENT FAILED — ${camera.id}`)
      })
    },
    [addToast]
  )

  // ---------- start simulation ----------
  const startSimulation = useCallback(() => {
    if (vehiclesRef.current.length === 0 && vehicles.length === 0) {
      addToast('warn', 'ADD VEHICLES FIRST — No vehicles in the fleet')
      return
    }
    if (!sim.place || !sim.date || !sim.time) {
      addToast('warn', 'SIMULATION CONFIG REQUIRED — set place / date / time')
      return
    }
    if (!allConfigured) {
      addToast('warn', 'CONFIGURE ALL CAMERAS BEFORE STARTING SIMULATION')
      const need = cameras.filter((c) => !(c.location && c.date && c.startTime)).map((c) => c.id)
      highlightUnconfigured(need)
      return
    }
    // freeze a run
    const list = vehicles.length ? vehicles : vehiclesRef.current
    if (!list.length) return
    simSnapshotRef.current = sim
    camerasRef.current = cameras.map((c) => ({ ...c }))
    // simulation clock: anchored to the configured session start time, ticks in real time
    const baseDate = new Date(`${sim.date}T${sim.time}:00`)
    const base = Number.isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime()
    simBaseRef.current = base
    setSimClock(base)
    vehiclesRef.current = list.map((v, i) => ({ ...v, index: i, lane: i % 2 === 0 ? 'top' : 'bottom' }))

    const lanesMap = {}
    vehiclesRef.current.forEach((v) => {
      lanesMap[v.id] = v.lane
      detectedRef.current[v.id] = new Set()
    })
    setLanes(lanesMap)
    setDetected({})
    setFeed([])
    setCamUI({})
    Object.values(camTimeout.current).forEach(clearTimeout)
    Object.values(flashTimeout.current).forEach(clearTimeout)
    camTimeout.current = {}
    flashTimeout.current = {}
    runEventsRef.current = 0
    setStats({ launched: list.length, events: 0, done: 0 })

    // queue vehicles at the start
    const startMap = {}
    list.forEach((v) => {
      startMap[v.id] = 0
    })
    positionsRef.current = startMap
    setPositions(startMap)

    const runId = ++runIdRef.current
    startAtRef.current = performance.now()
    setPhase('running')
    addToast('ok', `SIMULATION STARTED — ${list.length} VEHICLE(S) ON ROAD`)
    cancelAnimationFrame(rafRef.current)

    const loop = (now) => {
      if (runId !== runIdRef.current) return
      const elapsed = now - startAtRef.current
      setSimClock(simBaseRef.current + elapsed)
      const next = { ...positionsRef.current }
      let allDone = list.length > 0
      vehiclesRef.current.forEach((v) => {
        const delay = v.index * LAUNCH_STAGGER_MS
        let p = 0
        if (elapsed >= delay) {
          p = Math.min(1, (elapsed - delay) / ROAD_TRAVEL_MS)
        }
        const prev = positionsRef.current[v.id] || 0
        if (p < prev) p = prev // never go backwards
        if (p > prev) {
          // crossing check against each fixed camera once
          CAMERAS.forEach((geo) => {
            const set = detectedRef.current[v.id]
            if (set && !set.has(geo.id) && prev < geo.detectionProgress && p >= geo.detectionProgress) {
              set.add(geo.id)
              const fullCam = camerasRef.current.find((x) => x.id === geo.id) || geo
              const detectTs = simBaseRef.current + elapsed
              fireDetection(v, fullCam, detectTs)
            }
          })
        }
        next[v.id] = p
        if (p < 1) allDone = false
      })
      positionsRef.current = next
      setPositions(next)
      if (allDone) {
        setStats((s) => ({ ...s, done: list.length }))
        setPhase('done')
        addToast('ok', `SIMULATION COMPLETE — ${runEventsRef.current} CAMERA PASSAGE EVENT(S) RECORDED`)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [vehicles, sim, cameras, allConfigured, highlightUnconfigured, addToast])

  // ---------- reset simulation ----------
  const resetSimulation = useCallback(() => {
    runIdRef.current += 1
    cancelAnimationFrame(rafRef.current)
    positionsRef.current = {}
    vehiclesRef.current = []
    detectedRef.current = {}
    Object.values(camTimeout.current).forEach(clearTimeout)
    Object.values(flashTimeout.current).forEach(clearTimeout)
    camTimeout.current = {}
    flashTimeout.current = {}
    setPositions({})
    setDetected({})
    setLanes({})
    setFeed([])
    setCamUI({})
    setFlash({})
    setStats({ launched: 0, events: 0, done: 0 })
    setSimClock(null)
    setPhase('idle')
    addToast('info', 'SIMULATION RESET — historical Firebase records preserved')
  }, [addToast])

  // expose
  const value = useMemo(
    () => ({
      sim,
      setSim,
      vehicles,
      addVehicles,
      saveVehicles,
      clearVehicles,
      cameras,
      configuredCount,
      allConfigured,
      updateCamera,
      openCameraConfig,
      closeCameraConfig,
      cameraConfigTarget,
      attention,
      phase,
      positions,
      lanes,
      detected,
      flash,
      camUI,
      feed,
      events,
      mode,
      stats,
      toasts,
      simClock,
      startSimulation,
      resetSimulation,
      addToast
    }),
    [
      sim, setSim, vehicles, addVehicles, saveVehicles, clearVehicles,
      cameras, configuredCount, allConfigured, updateCamera, openCameraConfig,
      closeCameraConfig, cameraConfigTarget, attention,
      phase, positions, lanes, detected, flash, camUI, feed, events, mode,
      stats, toasts, simClock, startSimulation, resetSimulation, addToast
    ]
  )

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
}

export function useSimulation() {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error('useSimulation must be used inside SimulationProvider')
  return ctx
}
