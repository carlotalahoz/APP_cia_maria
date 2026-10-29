import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { ROLE_LABEL } from '../lib/types'
import { NotificationBell } from './NotificationBell'
import { Shield } from './Shield'
import { SyncStatus } from './SyncStatus'

interface NavItem {
  to: string
  label: string
  icon: string
  coordOnly?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: '⌂' },
  { to: '/equipos', label: 'Equipos', icon: '◎' },
  { to: '/jugadores', label: 'Jugadores', icon: '☺' },
  { to: '/calendario', label: 'Calendario', icon: '▤' },
  { to: '/partidos', label: 'Partidos', icon: '◉' },
  { to: '/asistencia', label: 'Asistencia', icon: '✓' },
  { to: '/solicitudes', label: 'Solicitudes', icon: '✉' },
  { to: '/documentacion', label: 'Documentación', icon: '▣' },
  { to: '/informes', label: 'Informes', icon: '▥' },
  { to: '/incidencias', label: 'Incidencias', icon: '⚑' },
  { to: '/temporadas', label: 'Temporadas', icon: '▦', coordOnly: true },
  { to: '/configuracion', label: 'Categorías y pistas', icon: '⚙', coordOnly: true },
  { to: '/usuarios', label: 'Usuarios', icon: '⚇', coordOnly: true },
  { to: '/papelera', label: 'Papelera', icon: '⌫', coordOnly: true },
  { to: '/auditoria', label: 'Auditoría', icon: '☰', coordOnly: true },
  { to: '/copias', label: 'Copias de seguridad', icon: '⛁', coordOnly: true },
]

export function Layout() {
  const { profile, isCoord, seasons, seasonId, setSeasonId, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => setMenuOpen(false), [location.pathname])

  const season = seasons.find((s) => s.id === seasonId)

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Shield size={42} />
          <div>
            <strong>AD Compañía de María</strong>
            <span>Baloncesto · Zaragoza</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.filter((n) => !n.coordOnly || isCoord).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-btn">
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              {n.to === '/solicitudes' && isCoord ? 'Aprobaciones' : n.to === '/incidencias' && !isCoord ? 'Comunicar incidencia' : n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <strong>{profile?.full_name}</strong>
            <span>{profile && ROLE_LABEL[profile.role]}</span>
          </div>
          <div className="row gap-s">
            <button className="btn btn-ghost btn-s" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀ Modo claro' : '☾ Modo oscuro'}
            </button>
            <button className="btn btn-ghost btn-s" onClick={() => void signOut()}>
              Salir
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn-icon menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú">
            ☰
          </button>
          <label className="season-select">
            <span>Temporada</span>
            <select value={seasonId ?? ''} onChange={(e) => setSeasonId(e.target.value)}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === 'cerrada' ? ' (cerrada)' : ''}
                </option>
              ))}
            </select>
          </label>
          {season?.status === 'cerrada' && <span className="badge badge-warn">Temporada cerrada</span>}
          <div className="spacer" />
          <SyncStatus />
          <NotificationBell />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <div className="scrim" onClick={() => setMenuOpen(false)} />
    </div>
  )
}
