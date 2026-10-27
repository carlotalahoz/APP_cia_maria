import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui'
import { computeStats, formatPct } from '../lib/attendance'
import { loadTeams } from '../lib/data'
import { addDays, fmtShort, fmtTime, startOfWeek } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { AttendanceRow, EventRow, Team } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

interface HomeData {
  teams: Team[]
  week: EventRow[]
  pendingByTeam: Record<string, number>
  pctByTeam: Record<string, number | null>
}

async function loadHome(seasonId: string | null, myTeamIds: string[] | null): Promise<HomeData> {
  let teams = await loadTeams(seasonId)
  if (myTeamIds) teams = teams.filter((t) => myTeamIds.includes(t.id))
  const ids = teams.map((t) => t.id)
  if (!ids.length) return { teams, week: [], pendingByTeam: {}, pctByTeam: {} }

  const monday = startOfWeek(new Date())
  const week = must(
    await supabase
      .from('events')
      .select('*')
      .in('team_id', ids)
      .gte('starts_at', monday.toISOString())
      .lt('starts_at', addDays(monday, 7).toISOString())
      .order('starts_at'),
  ) as EventRow[]

  // Pendientes de asistencia: entrenamientos pasados con jugadores "Sin registrar" (últimos 30 días)
  const past = must(
    await supabase
      .from('events')
      .select('id,team_id,status')
      .in('team_id', ids)
      .eq('status', 'programado')
      .lt('starts_at', new Date().toISOString())
      .gte('starts_at', addDays(new Date(), -30).toISOString()),
  ) as Pick<EventRow, 'id' | 'team_id' | 'status'>[]
  const pendingByTeam: Record<string, number> = {}
  const pctByTeam: Record<string, number | null> = {}
  if (past.length) {
    const evIds = past.map((e) => e.id)
    const att = must(await supabase.from('attendance').select('event_id,player_id,status').in('event_id', evIds)) as AttendanceRow[]
    const enr = must(
      await supabase.from('enrollments').select('player_id,team_id,kind').in('team_id', ids).eq('kind', 'plantilla').is('end_date', null),
    ) as { player_id: string; team_id: string }[]
    for (const t of ids) {
      const evs = past.filter((e) => e.team_id === t)
      const players = enr.filter((e) => e.team_id === t).map((e) => e.player_id)
      const statuses = evs.flatMap((ev) =>
        players.map((p) => att.find((a) => a.event_id === ev.id && a.player_id === p)?.status ?? 'sin_registrar'),
      )
      const s = computeStats(statuses)
      pendingByTeam[t] = evs.filter((ev) =>
        players.some((p) => (att.find((a) => a.event_id === ev.id && a.player_id === p)?.status ?? 'sin_registrar') === 'sin_registrar'),
      ).length
      pctByTeam[t] = s.percentage
    }
  }
  return { teams, week, pendingByTeam, pctByTeam }
}

export function HomePage() {
  const { profile, isCoord, staff, seasonId } = useAuth()
  const myTeamIds = isCoord ? null : staff.map((s) => s.team_id)
  const { data, error, loading } = useAsync(() => loadHome(seasonId, myTeamIds), [seasonId, isCoord, staff])

  const teamName = (id: string) => data?.teams.find((t) => t.id === id)?.name ?? ''
  const totalPending = data ? Object.values(data.pendingByTeam).reduce((a, b) => a + b, 0) : 0

  return (
    <>
      <PageHeader title={`Hola, ${profile?.full_name.split(' ')[0] ?? ''}`} subtitle="Resumen de tu semana" />
      <ErrorBox error={error} />
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="quick">
            <Link to="/asistencia" className="quick-btn">
              <span>✓</span>Registrar asistencia
            </Link>
            <Link to="/jugadores" className="quick-btn">
              <span>☺</span>Jugadores
            </Link>
            <Link to="/equipos" className="quick-btn">
              <span>◎</span>Equipos
            </Link>
            {isCoord && (
              <Link to="/usuarios" className="quick-btn">
                <span>⚇</span>Usuarios
              </Link>
            )}
          </div>

          <div className="grid-2">
            <section className="card">
              <h2>Entrenamientos de esta semana</h2>
              {data.week.length === 0 ? (
                <p className="muted">No hay actividades esta semana.</p>
              ) : (
                <ul className="list">
                  {data.week.map((ev) => (
                    <li key={ev.id} className={ev.status === 'cancelado' ? 'cancelled' : ''}>
                      <span className="list-main">
                        <strong>{teamName(ev.team_id)}</strong>
                        <span className="muted">
                          {fmtShort(ev.starts_at)} · {fmtTime(ev.starts_at)}–{fmtTime(ev.ends_at)}
                        </span>
                      </span>
                      {ev.status === 'cancelado' ? <Badge tone="danger">Cancelado</Badge> : <Badge tone="info">Entrenamiento</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <h2>
                Asistencia pendiente <Badge tone={totalPending ? 'warn' : 'ok'}>{totalPending}</Badge>
              </h2>
              <p className="muted small">Entrenamientos de los últimos 30 días con jugadores sin registrar.</p>
              {data.teams.length === 0 ? (
                <p className="muted">No tienes equipos asignados en esta temporada.</p>
              ) : (
                <ul className="list">
                  {data.teams.map((t) => (
                    <li key={t.id}>
                      <Link to={`/asistencia?equipo=${t.id}`} className="list-main">
                        <strong>{t.name}</strong>
                        <span className="muted">Asistencia últimos 30 días: {formatPct(data.pctByTeam[t.id] ?? null)}</span>
                      </Link>
                      {data.pendingByTeam[t.id] ? (
                        <Badge tone="warn">{data.pendingByTeam[t.id]} pendientes</Badge>
                      ) : (
                        <Badge tone="ok">Al día</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2>Mis equipos</h2>
            <div className="chips">
              {data.teams.map((t) => (
                <Link key={t.id} to={`/equipos/${t.id}`} className="chip">
                  <b>{t.code}</b> {t.name}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}
