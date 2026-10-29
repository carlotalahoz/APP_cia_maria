import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { fmtDateTime } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../lib/types'

export function NotificationBell() {
  const { session } = useAuth()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setItems((data ?? []) as NotificationRow[])
  }

  useEffect(() => {
    if (!session) return
    void load()
    const t = window.setInterval(load, 60_000)
    // Tiempo real: avisa al instante y, si el usuario lo ha permitido, con una notificación del navegador.
    const channel = supabase
      .channel('notificaciones')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, (payload) => {
        void load()
        const n = payload.new as NotificationRow
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification(n.title, { body: n.body ?? undefined, icon: '/icon-192.png' })
        }
      })
      .subscribe()
    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(channel)
    }
  }, [session])
  const canAskPermission = 'Notification' in window && Notification.permission === 'default'

  const unread = items.filter((n) => !n.read_at)

  const openItem = async (n: NotificationRow) => {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    setOpen(false)
    void load()
    if (n.link) navigate(n.link)
  }

  const markAll = async () => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
    void load()
  }

  return (
    <div className="bell">
      <button className="btn-icon bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread.length > 0 && <span className="bell-count">{unread.length}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <strong>Notificaciones</strong>
            {unread.length > 0 && (
              <button className="link" onClick={markAll}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          {canAskPermission && (
            <p className="pad small">
              <button className="link" onClick={() => void Notification.requestPermission().then(() => setOpen(false))}>
                Activar avisos del navegador
              </button>
            </p>
          )}
          {items.length === 0 && <p className="muted pad">No hay notificaciones.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={n.read_at ? '' : 'unread'}>
                <button onClick={() => openItem(n)}>
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="bell-date">{fmtDateTime(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
