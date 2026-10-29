import Dexie, { type Table } from 'dexie'
import type { AttendanceStatus } from './types'
import { supabase } from './supabase'

/** Cambio de asistencia pendiente de enviar al servidor. */
export interface PendingAttendance {
  key: string // event_id:player_id
  event_id: string
  player_id: string
  status: AttendanceStatus
  notes: string | null
  base_updated_at: string | null
  queued_at: number
  error?: string
  conflict?: {
    status: AttendanceStatus
    notes: string | null
    updated_at: string
    updated_by: string | null
  }
}

/** Instantánea de la cuadrícula de asistencia para poder registrar sin conexión. */
export interface GridSnapshot {
  key: string // team_id:week_start
  data: unknown
  saved_at: number
}

class OfflineDB extends Dexie {
  pending!: Table<PendingAttendance, string>
  grids!: Table<GridSnapshot, string>
  constructor() {
    super('ad-cia-maria')
    this.version(1).stores({ pending: 'key, event_id, queued_at', grids: 'key, saved_at' })
  }
}

export const db = new OfflineDB()

export async function queueAttendance(item: Omit<PendingAttendance, 'key' | 'queued_at'>) {
  const key = `${item.event_id}:${item.player_id}`
  const existing = await db.pending.get(key)
  await db.pending.put({
    ...item,
    // conserva la versión base original si ya había un cambio en cola
    base_updated_at: existing ? existing.base_updated_at : item.base_updated_at,
    key,
    queued_at: Date.now(),
  })
  notify()
}

/** Cambios que el servidor rechazó definitivamente; se muestran hasta que el usuario los cierra. */
let rejectedMessages: string[] = []
export function getRejected() {
  return rejectedMessages
}
export function clearRejected() {
  rejectedMessages = []
  notify()
}

type Listener = () => void
const listeners = new Set<Listener>()
export function subscribe(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
function notify() {
  listeners.forEach((l) => l())
}

let syncing = false

/** Envía la cola. Los conflictos quedan marcados para que el usuario elija. */
export async function syncPending(): Promise<{ sent: number; conflicts: number; failed: number; rejected: string[] }> {
  if (syncing || !navigator.onLine) return { sent: 0, conflicts: 0, failed: 0, rejected: [] }
  syncing = true
  let sent = 0
  let conflicts = 0
  let failed = 0
  const rejected: string[] = []
  try {
    const items = await db.pending.orderBy('queued_at').toArray()
    for (const item of items) {
      if (item.conflict) {
        conflicts++
        continue
      }
      const { data, error } = await supabase.rpc('save_attendance', {
        p_event: item.event_id,
        p_player: item.player_id,
        p_status: item.status,
        p_notes: item.notes,
        p_base_updated_at: item.base_updated_at,
        p_force: false,
      })
      if (error) {
        failed++
        if (isNetworkError(error.message)) {
          await db.pending.update(item.key, { error: error.message })
          break
        }
        // Rechazo definitivo del servidor (permisos, temporada cerrada…): no se reintenta.
        rejected.push(error.message)
        rejectedMessages = [...rejectedMessages, error.message]
        await db.pending.delete(item.key)
        continue
      }
      if (data?.conflict) {
        conflicts++
        await db.pending.update(item.key, { conflict: data.server, error: undefined })
      } else {
        sent++
        await db.pending.delete(item.key)
      }
    }
  } finally {
    syncing = false
    notify()
  }
  return { sent, conflicts, failed, rejected }
}

/** Resuelve un conflicto conservando el valor local ("mine") o el del servidor. */
export async function resolveConflict(key: string, keep: 'mine' | 'server') {
  const item = await db.pending.get(key)
  if (!item) return
  if (keep === 'server') {
    await db.pending.delete(key)
    notify()
    return
  }
  const { error } = await supabase.rpc('save_attendance', {
    p_event: item.event_id,
    p_player: item.player_id,
    p_status: item.status,
    p_notes: item.notes,
    p_base_updated_at: item.base_updated_at,
    p_force: true,
  })
  if (error) throw error
  await db.pending.delete(key)
  notify()
}

function isNetworkError(msg: string) {
  return /fetch|network|Failed to|load failed/i.test(msg)
}

/** Borra los datos locales (al cerrar sesión o revocar acceso). */
export async function clearOfflineData() {
  await db.pending.clear()
  await db.grids.clear()
  notify()
}

export function startAutoSync() {
  const run = () => void syncPending()
  window.addEventListener('online', run)
  const timer = window.setInterval(run, 30_000)
  run()
  return () => {
    window.removeEventListener('online', run)
    window.clearInterval(timer)
  }
}
