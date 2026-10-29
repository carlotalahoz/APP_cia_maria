import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { eventTitle, StatusBadge } from '../components/EventBits'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { loadProfiles, loadTeams, loadVenues } from '../lib/data'
import { fmtDateTime, fmtTime } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { EVENT_TYPE_LABEL, type EventRequest, type EventRow, type MatchRow } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

const REQ_LABEL: Record<EventRequest['status'], [string, 'warn' | 'ok' | 'danger' | 'neutral']> = {
  pendiente: ['Pendiente', 'warn'],
  aprobada: ['Aprobada', 'ok'],
  rechazada: ['Rechazada', 'danger'],
  anulada: ['Anulada', 'neutral'],
}

/** Aprobaciones: propuestas de actividades/partidos y solicitudes de cambio de horario o pista. */
export function RequestsPage() {
  const { isCoord, staff, seasonId, profile, seasons } = useAuth()
  const seasonOpen = seasons.find((s) => s.id === seasonId)?.status === 'activa'
  const [err, setErr] = useState<string | null>(null)
  const myIds = staff.map((s) => s.team_id)

  const { data, error, loading, reload } = useAsync(async () => {
    const [all, venues, profiles] = await Promise.all([loadTeams(seasonId), loadVenues(), loadProfiles()])
    const teams = isCoord ? all : all.filter((t) => myIds.includes(t.id))
    const ids = teams.map((t) => t.id)
    if (!ids.length) return { teams, venues, profiles, proposals: [], requests: [], events: [], matches: [] }
    const proposals = must(
      await supabase.from('events').select('*').in('team_id', ids).not('created_by', 'is', null).order('created_at', { ascending: false }).limit(60),
    ) as (EventRow & { created_at: string })[]
    const requests = must(await supabase.from('event_requests').select('*').order('created_at', { ascending: false }).limit(60)) as EventRequest[]
    const evIds = [...new Set(requests.map((r) => r.event_id))]
    const events = evIds.length ? (must(await supabase.from('events').select('*').in('id', evIds)) as EventRow[]) : []
    const allEv = [...proposals, ...events]
    const mIds = allEv.filter((e) => e.type === 'partido').map((e) => e.id)
    const matches = mIds.length ? (must(await supabase.from('matches').select('*').in('event_id', mIds)) as MatchRow[]) : []
    return {
      teams,
      venues,
      profiles,
      // Solo propuestas del cuerpo técnico (las creadas por coordinación nacen aprobadas)
      proposals: proposals.filter((p) => p.created_by && profiles.find((x) => x.id === p.created_by)?.role !== 'coordinadora'),
      requests: requests.filter((r) => events.some((e) => e.id === r.event_id && ids.includes(e.team_id))),
      events,
      matches,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isCoord, staff])

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  const ask = (msg: string) => {
    const r = prompt(msg)
    return r === null ? null : r
  }

  if (loading || !data) return <Loading />
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? ''
  const who = (id?: string | null) => data.profiles.find((p) => p.id === id)?.full_name ?? '—'
  const venue = (id: string | null) => data.venues.find((v) => v.id === id)?.name ?? 'Sin pista'
  const match = (id: string) => data.matches.find((m) => m.event_id === id)
  const pendingProps = data.proposals.filter((p) => p.status === 'pendiente_aprobacion')
  const pendingReqs = data.requests.filter((r) => r.status === 'pendiente')

  return (
    <>
      <PageHeader
        title={isCoord ? 'Aprobaciones' : 'Solicitudes'}
        subtitle={isCoord ? 'Propuestas del cuerpo técnico y cambios de horario o pista' : 'Estado de las propuestas y cambios de tus equipos'}
      />
      <ErrorBox error={error ?? err} />

      <section className="card">
        <h2>
          Propuestas de actividades y partidos <Badge tone={pendingProps.length ? 'warn' : 'ok'}>{pendingProps.length} pendientes</Badge>
        </h2>
        {data.proposals.length === 0 ? (
          <Empty>No hay propuestas.</Empty>
        ) : (
          <ul className="list">
            {data.proposals.map((p) => (
              <li key={p.id}>
                <span className="list-main">
                  <strong>
                    <Link to={p.type === 'partido' ? `/partidos/${p.id}` : `/calendario?evento=${p.id}&semana=${p.starts_at.slice(0, 10)}`}>
                      {EVENT_TYPE_LABEL[p.type]}: {eventTitle(p, match(p.id))}
                    </Link>
                  </strong>
                  <span className="muted small">
                    {teamName(p.team_id)} · {fmtDateTime(p.starts_at)}–{fmtTime(p.ends_at)} · {venue(p.venue_id)} · propuesto por {who(p.created_by)}
                  </span>
                  {p.resolution_note && <span className="muted small">Nota: {p.resolution_note}</span>}
                </span>
                <StatusBadge status={p.status} />
                {isCoord && p.status === 'pendiente_aprobacion' && (
                  <>
                    <button className="btn btn-s btn-primary" onClick={() => void act(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: p.id, p_approve: true })))}>
                      Aprobar
                    </button>
                    <button
                      className="btn btn-s btn-danger"
                      onClick={() => {
                        const note = ask('Motivo del rechazo (opcional):')
                        if (note !== null) void act(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: p.id, p_approve: false, p_note: note })))
                      }}
                    >
                      Rechazar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>
          Cambios de horario o pista <Badge tone={pendingReqs.length ? 'warn' : 'ok'}>{pendingReqs.length} pendientes</Badge>
        </h2>
        {data.requests.length === 0 ? (
          <Empty>No hay solicitudes de cambio.</Empty>
        ) : (
          <ul className="list">
            {data.requests.map((r) => {
              const ev = data.events.find((e) => e.id === r.event_id)!
              const [label, tone] = REQ_LABEL[r.status]
              return (
                <li key={r.id}>
                  <span className="list-main">
                    <strong>
                      {eventTitle(ev, match(ev.id))} · {teamName(ev.team_id)}
                    </strong>
                    <span className="muted small">
                      Ahora: {fmtDateTime(ev.starts_at)}–{fmtTime(ev.ends_at)} · {venue(ev.venue_id)}
                    </span>
                    <span className="small">
                      Propuesto: {fmtDateTime(r.new_starts_at)}–{fmtTime(r.new_ends_at)} · {venue(r.new_venue_id)}
                    </span>
                    <span className="muted small">
                      Motivo: {r.reason} · {who(r.requested_by)}
                    </span>
                    {r.resolution_note && <span className="muted small">Nota: {r.resolution_note}</span>}
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                  {isCoord && r.status === 'pendiente' && (
                    <>
                      <button className="btn btn-s btn-primary" onClick={() => void act(async () => must(await supabase.rpc('resolve_event_request', { p_request: r.id, p_approve: true })))}>
                        Aprobar
                      </button>
                      <button
                        className="btn btn-s btn-danger"
                        onClick={() => {
                          const note = ask('Motivo del rechazo (opcional):')
                          if (note !== null) void act(async () => must(await supabase.rpc('resolve_event_request', { p_request: r.id, p_approve: false, p_note: note })))
                        }}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  {!isCoord && seasonOpen && r.status === 'pendiente' && r.requested_by === profile?.id && (
                    <button className="btn btn-s" onClick={() => void act(async () => must(await supabase.rpc('cancel_event_request', { p_request: r.id })))}>
                      Anular
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
