// Formatting helpers. All detection timestamps are presented in IST
// (Asia/Kolkata) as the TrafIQ console runs on Indian traffic infrastructure.

export function formatIST(date) {
  const d = date instanceof Date ? date : new Date(date)
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(d)
    const get = (t) => parts.find((p) => p.type === t)?.value || '00'
    return `${get('hour')}:${get('minute')}:${get('second')} IST`
  } catch {
    // fallback if Intl timezone data missing
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} IST`
  }
}

export function formatISODate(date) {
  const d = date instanceof Date ? date : new Date(date)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d) // YYYY-MM-DD
  } catch {
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}

export function todayLocalISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function nowLocalTime() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function shortStamp(ts) {
  // e.g. 14:02:10 IST for a timestamp (number of Date)
  return formatIST(typeof ts === 'number' ? new Date(ts) : ts)
}

// Ensure a configured clock time string has seconds (HH:mm -> HH:mm:ss).
export function withSeconds(timeStr) {
  if (!timeStr) return timeStr
  const parts = String(timeStr).trim().split(':')
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`
  return String(timeStr).trim()
}

// dd/mm/yyyy style display for a YYYY-MM-DD date string.
export function displayDate(isoDate) {
  if (!isoDate) return ''
  const m = String(isoDate).split('-') // YYYY-MM-DD
  if (m.length === 3) return `${m[2]}/${m[1]}/${m[0]}`
  return String(isoDate)
}

export function blankCameraConfigs(cameras) {
  const out = {}
  cameras.forEach((c) => {
    out[c.id] = { location: '', date: '', startTime: '' }
  })
  return out
}
