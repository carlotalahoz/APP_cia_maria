import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ActivityForm } from '../components/ActivityForm'
import { StatusBadge } from '../components/EventBits'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { loadTeams, loadVenues } from '../lib/data'
import { fmtDateTime } from '../lib/dates'
import { outcome, OUTCOME_LABEL, teamRecord } from '../lib/matches'
import { supabase } from '../lib/supabase'
import { EVENT_STATUS_LABEL, type EventRow, type EventStatus, type MatchRow } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

export function MatchesPage() {
  const { isCoord, staff, seasonId } = useAuth()
  const navigate = useNavigate()
  const [teamFilter, setTeamFilter] = useState('')
  const [compFilter, setCompFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const myIds = staff.map((s) => s.team_id)

  const { data, error, loading } = useAsync(async () => {
    const [all, venues] = await Promise.all([loadTeams(seasonId), loadVenues()])
    const teams = isCoord ? all : all.filter((t) => myIds.includes(t.id))
    const ids = teams.map((t) => t.id)
    const events = ids.length
      ? (must(await supabase.from('events').select('*').in('team_id', ids).eq('type', 'partido').order('starts_at')) as EventRow[])
      : []
    const matches = events.length
      ? (must(await supabase.from('matches').select('*').in('event_id', events.map((e) => e.id))) as MatchRow[])
      : []
    return { teams, venues, events, matches }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isCoord, staff])

  const rows = useMemo(() => {
    if (!data) return []
    return data.events
      .map((ev) => ({ ev, m: data.matches.find((m) => m.event_id === ev.id)! }))
      .filter(({ ev, m }) => m && (!teamFilter || ev.team_id === teamFilter) && (!compFilter || (m.competition ?? '') === compFilter) && (!statusFilter || ev.status === statusFilter))
  }, [data, teamFilter, compFilter, statusFilter])

  const competitions = [...new Set((data?.matches ?? []).map((m) => m.competition).filter(Boolean))] as string[]
  const coachTeams = (data?.teams ?? []).filter((t) => isCoord || staff.some((s) => s.team_id === t.id && s.staff_role !== 'delegado'))
  const teamName = (id: string) => data?.teams.find((t) => t.id === id)?.name ?? ''

  return (
    <>
      <PageHeader
        title="Partidos"
        subtitle="Partidos oficiales y amistosos, convocatorias, resultados y actas"
        actions={
          coachTeams.length > 0 && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + {isCoord ? 'Nuevo partido' : 'Proponer partido'}
            </button>
          )
        }
      />
      <ErrorBox error={error} />
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <section className="card">
            <h2>Estadísticas de resultados</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th title="Jugados">PJ</th>
                  <th title="Ganados">G</th>
                  <th title="Perdidos">P</th>
                  <th title="Empatados">E</th>
                  <th title="Puntos a favor">PF</th>
                  <th title="Puntos en contra">PC</th>
                  <th title="Diferencia">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((t) => {
                  const r = teamRecord(
                    data.matches.filter((m) => {
                      const ev = data.events.find((e) => e.id === m.event_id)
                      return ev?.team_id === t.id && ev.status === 'finalizado' && (!compFilter || m.competition === compFilter)
                    }),
                  )
                  return (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{r.played}</td>
                      <td>{r.won}</td>
                      <td>{r.lost}</td>
                      <td>{r.drawn}</td>
                      <td>{r.pointsFor}</td>
                      <td>{r.pointsAgainst}</td>
                      <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          <div className="filters">
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Equipo">
              <option value="">Todos los equipos</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={compFilter} onChange={(e) => setCompFilter(e.target.value)} aria-label="Competición">
              <option value="">Todas las competiciones</option>
              {competitions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {(Object.keys(EVENT_STATUS_LABEL) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EVENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {rows.length === 0 ? (
            <Empty>No hay partidos.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Equipo</th>
                  <th>Rival</th>
                  <th>Competición</th>
                  <th>Estado</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ev, m }) => {
                  const o = outcome(m)
                  return (
                    <tr key={ev.id} className="clickable" onClick={() => navigate(`/partidos/${ev.id}`)}>
                      <td>{ev.status === 'pendiente' ? 'Sin fecha' : fmtDateTime(ev.starts_at)}</td>
                      <td>{teamName(ev.team_id)}</td>
                      <td>
                        <Link to={`/partidos/${ev.id}`} onClick={(e) => e.stopPropagation()}>
                          {m.home ? 'vs' : '@'} {m.opponent}
                        </Link>
                        {m.kind === 'amistoso' && <Badge>Amistoso</Badge>}
                      </td>
                      <td>
                        {m.competition ?? '—'}
                        {m.matchday && <span className="muted small"> · J{m.matchday}</span>}
                      </td>
                      <td>
                        <StatusBadge status={ev.status} />
                      </td>
                      <td>
                        {o ? (
                          <>
                            <strong>
                              {m.score_for}-{m.score_against}
                            </strong>{' '}
                            <Badge tone={o === 'G' ? 'ok' : o === 'P' ? 'danger' : 'neutral'}>{OUTCOME_LABEL[o]}</Badge>
                            {m.suspended && <Badge tone="warn">Suspendido</Badge>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
      {creating && data && (
        <ActivityForm
          teams={coachTeams}
          venues={data.venues}
          initialType="partido"
          initialTeam={teamFilter || undefined}
          onClose={() => setCreating(false)}
          onSaved={(id) => navigate(`/partidos/${id}`)}
        />
      )}
    </>
  )
}
