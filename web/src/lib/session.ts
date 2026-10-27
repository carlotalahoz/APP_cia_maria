const KEY = 'ad-cia-maria:last-activity'
export const INACTIVITY_LIMIT_MS = 7 * 24 * 60 * 60 * 1000

export function touchActivity() {
  localStorage.setItem(KEY, String(Date.now()))
}

export function isInactiveTooLong(now = Date.now()): boolean {
  const last = Number(localStorage.getItem(KEY) ?? 0)
  return last > 0 && now - last > INACTIVITY_LIMIT_MS
}

export function clearActivity() {
  localStorage.removeItem(KEY)
}
