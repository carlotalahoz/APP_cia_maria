import { useEffect, useState } from 'react'
import { db, subscribe, syncPending } from '../lib/offline'

/** Indicador global: Sin conexión / Pendiente de sincronizar / Sincronizado. */
export function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState(0)

  useEffect(() => {
    const refresh = async () => {
      const all = await db.pending.toArray()
      setPending(all.length)
      setConflicts(all.filter((p) => p.conflict).length)
    }
    void refresh()
    const unsub = subscribe(() => void refresh())
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      unsub()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  let cls = 'sync-ok'
  let text = 'Sincronizado'
  if (conflicts) {
    cls = 'sync-conflict'
    text = `${conflicts} conflicto${conflicts > 1 ? 's' : ''} por revisar`
  } else if (pending) {
    cls = 'sync-pending'
    text = `Pendiente de sincronizar (${pending})`
  }
  if (!online) {
    cls = pending ? 'sync-pending' : 'sync-offline'
    text = pending ? `Sin conexión · pendiente de sincronizar (${pending})` : 'Sin conexión'
  }

  return (
    <button
      className={`sync-status ${cls}`}
      onClick={() => void syncPending()}
      title={`${text}. Pulsa para sincronizar ahora`}
      data-testid="sync-status"
    >
      <span className="dot" /> <span className="sync-text">{text}</span>
    </button>
  )
}
