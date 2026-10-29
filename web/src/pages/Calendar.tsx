import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ActivityForm, ConflictWarning, useVenueConflicts } from '../components/ActivityForm'
import { eventTitle, fromLocalInput, StatusBadge, toLocalInput, TypeDot } from '../components/EventBits'
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui'
import { loadCategories, loadTeams, loadVenues } from '../lib/data'
import { addDays, fmtDate, fmtDateTime, fmtTime, isoDate, startOfWeek } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { EVENT_TYPE_LABEL, type EventRow, type EventType, type MatchRow, type Team, type Venue } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** Actividades con pista que se solapan (no cuentan canceladas ni partidos sin fecha). */
export function findConflicts(events: EventRow[]): Set<string> {
  const ids = new Set<string>()
  const live = events.filter((e) => e.venue_id && e.status !== 'cancelado' && e.status !== 'pendiente')
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]
      const b = live[j]
      if (a.venue_id === b.venue_id && a.starts_at < b.ends_at && b.starts_at < a.ends_at) {
        ids.add(a.id)
        ids.add(b.id)
      }
    }
  return ids
}

export function CalendarPage() {
  const { isCoord, staff, seasonId, isStaffOf, seasons } = useAuth()
  const seasonOpen = seasons.find((s) => s.id === seasonId)?.status === 'activa'
  const [params, setParams] = useSearchParams()
  const [week, setWeek] = useState(() => {
    const s = params.get('semana')
    return startOfWeek(s ? new Date(s + 'T00:00:00') : new Date())
  })
  const [teamFilter, setTeamFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const openId = params.get('evento')

  const myIds = staff.map((s) => s.team_id)
  const { data, error, loading, reload } = useAsync(async () => {
    const [allTeams, venues, categories] = await Promise.all([loadTeams(seasonId), loadVenues(), loadCategories()])
    const teams = isCoord ? allTeams : allTeams.filter((t) => myIds.includes(t.id))
    const ids = teams.map((t) => t.id)
    let events: EventRow[] = []
    if (ids.length) {
      events = must(
        await supabase
          .from('events')
          .select('*')
          .in('team_id', ids)
          .gte('starts_at', week.toISOString())
          .lt('starts_at', addDays(week, 7).toISOString())
          .order('starts_at'),
      ) as EventRow[]
    }
    const matchIds = events.filter((e) => e.type === 'partido').map((e) => e.id)
    const matches = matchIds.length ? (must(await supabase.from('matches').select('*').in('event_id', matchIds)) as MatchRow[]) : []
    return { teams, venues, categories, events, matches }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isCoord, staff, week])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.events.filter((e) => {
      const t = data.teams.find((x) => x.id === e.team_id)
      return (
        (!teamFilter || e.team_id === teamFilter) &&
        (!catFilter || t?.category_id === catFilter) &&
        (!venueFilter || e.venue_id === venueFilter) &&
        (!typeFilter || e.type === typeFilter)
      )
    })
  }, [data, teamFilter, catFilter, venueFilter, typeFilter])
  const conflicts = useMemo(() => findConflicts(data?.events ?? []), [data])

  const coachTeams = (data?.teams ?? []).filter((t) => isCoord || (seasonOpen && staff.some((s) => s.team_id === t.id && s.staff_role !== 'delegado')))
  const openEvent = openId ? data?.events.find((e) => e.id === openId) : undefined
  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('evento', id)
    else p.delete('evento')
    setParams(p, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={isCoord ? 'Vista semanal de toda la agrupación' : 'Vista semanal de tus equipos'}
        actions={
          <>
            <button className="btn no-print" onClick={() => window.print()}>
              Imprimir
            </button>
            {coachTeams.length > 0 && (
              <button className="btn btn-primary no-print" onClick={() => setCreating(true)}>
                + {isCoord ? 'Nueva actividad' : 'Proponer actividad'}
              </button>
            )}
          </>
        }
      />
      <div className="row gap-s wrap week-nav">
        <button className="btn btn-s no-print" onClick={() => setWeek(addDays(week, -7))}>
          ← Semana anterior
        </button>
        <strong>
          {fmtDate(week)} – {fmtDate(addDays(week, 6))}
        </strong>
        <button className="btn btn-s no-print" onClick={() => setWeek(addDays(week, 7))}>
          Semana siguiente →
        </button>
        <button className="btn btn-ghost btn-s no-print" onClick={() => setWeek(startOfWeek(new Date()))}>
          Hoy
        </button>
      </div>
      {data && (
        <div className="filters no-print">
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Equipo">
            <option value="">Todos los equipos</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {isCoord && (
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} aria-label="Pista">
            <option value="">Todas las pistas</option>
            {data.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Tipo">
            <option value="">Todas las actividades</option>
            {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="legend small muted">
        {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
          <span key={t}>
            <TypeDot type={t} /> {EVENT_TYPE_LABEL[t]}
          </span>
        ))}
        <span>⚠ Coincidencia de pista</span>
      </div>
      <ErrorBox error={error} />
      {loading || !data ? (
        <Loading />
      ) : data.teams.length === 0 ? (
        <Empty>No tienes equipos asignados en esta temporada.</Empty>
      ) : (
        <div className="cal-week">
          {DAY_NAMES.map((name, i) => {
            const day = addDays(week, i)
            const evs = filtered.filter((e) => isoDate(new Date(e.starts_at)) === isoDate(day))
            const today = isoDate(day) === isoDate(new Date())
            return (
              <section key={name} className={`cal-day ${today ? 'today' : ''}`}>
                <h3>
                  {name} <span className="muted">{fmtDate(day).slice(0, 5)}</span>
                </h3>
                {evs.length === 0 && <p className="muted small">—</p>}
                {evs.map((ev) => {
                  const m = data.matches.find((x) => x.event_id === ev.id)
                  const team = data.teams.find((t) => t.id === ev.team_id)
                  return (
                    <button key={ev.id} className={`cal-event type-${ev.type} st-ev-${ev.status}`} onClick={() => setOpen(ev.id)}>
                      <span className="cal-time">
                        {fmtTime(ev.starts_at)}–{fmtTime(ev.ends_at)}
                        {conflicts.has(ev.id) && <span title="Coincidencia de pista"> ⚠</span>}
                      </span>
                      <strong>{eventTitle(ev, m)}</strong>
                      <span className="small">
                        <b>{team?.code}</b> {data.venues.find((v) => v.id === ev.venue_id)?.name ?? (m && !m.home ? m.away_location ?? 'Fuera' : '')}
                      </span>
                      {ev.status !== 'programado' && <StatusBadge status={ev.status} />}
                      {m?.score_for != null && (
                        <span className="small">
                          {m.score_for}-{m.score_against}
                        </span>
                      )}
                    </button>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
      {openEvent && data && (
        <EventModal
          ev={openEvent}
          match={data.matches.find((m) => m.event_id === openEvent.id)}
          team={data.teams.find((t) => t.id === openEvent.team_id)}
          venues={data.venues}
          canCoach={isCoord || staff.some((s) => s.team_id === openEvent.team_id && s.staff_role !== 'delegado')}
          canSee={isStaffOf(openEvent.team_id)}
          onClose={() => setOpen(null)}
          onChanged={() => void reload()}
        />
      )}
      {creating && data && (
        <ActivityForm
          teams={coachTeams}
          venues={data.venues}
          initialTeam={teamFilter || undefined}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void reload()
          }}
        />
      )}
    </>
  )
}

function EventModal({
  ev,
  match,
  team,
  venues,
  canCoach,
  onClose,
  onChanged,
}: {
  ev: EventRow
  match?: MatchRow
  team?: Team
  venues: Venue[]
  canCoach: boolean
  canSee: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { isCoord, seasons } = useAuth()
  const [mode, setMode] = useState<'view' | 'change' | 'cancel' | 'reject'>('view')
  const [notes, setNotes] = useState(ev.notes ?? '')
  const [reason, setReason] = useState('')
  const [start, setStart] = useState(toLocalInput(ev.starts_at))
  const [end, setEnd] = useState(toLocalInput(ev.ends_at))
  const [venue, setVenue] = useState(ev.venue_id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const conflicts = useVenueConflicts(mode === 'change' ? venue : '', start, end, ev.id)
  const seasonOpen = seasons.find((s) => s.id === team?.season_id)?.status === 'activa'
  const editable = canCoach && (seasonOpen || isCoord)
  const active = ev.status === 'programado' || ev.status === 'aplazado'
  const directChange = isCoord || ev.type === 'partido'

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setErr(null)
    try {
      await fn()
      setMsg(done ?? null)
      setMode('view')
      onChanged()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  return (
    <Modal title={`${EVENT_TYPE_LABEL[ev.type]} · ${team?.name ?? ''}`} onClose={onClose} wide>
      <div className="row gap-s wrap">
        <TypeDot type={ev.type} />
        <strong>{eventTitle(ev, match)}</strong>
        <StatusBadge status={ev.status} />
        {ev.extraordinary && ev.type === 'entrenamiento' && <Badge tone="info">Extraordinario</Badge>}
      </div>
      <p>
        {ev.status === 'pendiente' ? 'Sin fecha' : `${fmtDateTime(ev.starts_at)} – ${fmtTime(ev.ends_at)}`} ·{' '}
        {venues.find((v) => v.id === ev.venue_id)?.name ?? (match && !match.home ? match.away_location ?? 'Fuera' : 'Sin pista')}
      </p>
      {ev.original_starts_at && <p className="muted small">Fecha original: {fmtDateTime(ev.original_starts_at)}</p>}
      {ev.status === 'cancelado' && ev.cancel_reason && <div className="alert alert-error">Motivo: {ev.cancel_reason}</div>}
      {ev.postpone_reason && <p className="muted small">Motivo del aplazamiento: {ev.postpone_reason}</p>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={err} />

      {mode === 'view' && (
        <>
          <Field label="Observaciones">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} />
          </Field>
          <div className="row gap-s wrap">
            {editable && notes !== (ev.notes ?? '') && (
              <button className="btn btn-s" onClick={() => void run(async () => must(await supabase.rpc('set_event_notes', { p_event: ev.id, p_notes: notes })), 'Observaciones guardadas.')}>
                Guardar observaciones
              </button>
            )}
            {ev.type === 'partido' && (
              <Link className="btn btn-s btn-primary" to={`/partidos/${ev.id}`}>
                Abrir partido
              </Link>
            )}
            {ev.status !== 'pendiente_aprobacion' && ev.status !== 'pendiente' && (
              <Link className="btn btn-s" to={`/asistencia?equipo=${ev.team_id}&semana=${isoDate(startOfWeek(new Date(ev.starts_at)))}`}>
                Asistencia
              </Link>
            )}
            {isCoord && ev.status === 'pendiente_aprobacion' && (
              <>
                <button className="btn btn-s btn-primary" onClick={() => void run(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: ev.id, p_approve: true })), 'Aprobada.')}>
                  Aprobar
                </button>
                <button className="btn btn-s btn-danger" onClick={() => setMode('reject')}>
                  Rechazar
                </button>
              </>
            )}
            {editable && active && ev.type !== 'partido' && (
              <button className="btn btn-s" onClick={() => setMode('change')}>
                {directChange ? 'Modificar horario/pista' : 'Solicitar cambio'}
              </button>
            )}
            {editable && active && ev.type !== 'partido' && (
              <button className="btn btn-s btn-danger" onClick={() => setMode('cancel')}>
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'cancel' && (
        <>
          <Field label="Motivo de la cancelación (obligatorio)">
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="row gap-s">
            <button
              className="btn btn-danger"
              disabled={!reason.trim()}
              onClick={() => {
                if (!confirm('¿Cancelar esta actividad? Se avisará a los afectados.')) return
                void run(async () => must(await supabase.rpc('cancel_event', { p_event: ev.id, p_reason: reason })), 'Actividad cancelada.')
              }}
            >
              Confirmar cancelación
            </button>
            <button className="btn" onClick={() => setMode('view')}>
              Volver
            </button>
          </div>
        </>
      )}

      {mode === 'reject' && (
        <>
          <Field label="Motivo del rechazo (opcional)">
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="row gap-s">
            <button className="btn btn-danger" onClick={() => void run(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: ev.id, p_approve: false, p_note: reason })), 'Rechazada.')}>
              Rechazar propuesta
            </button>
            <button className="btn" onClick={() => setMode('view')}>
              Volver
            </button>
          </div>
        </>
      )}

      {mode === 'change' && (
        <>
          {!directChange && <p className="muted small">El cambio no será definitivo hasta que coordinación lo apruebe.</p>}
          <div className="form-grid">
            <Field label="Inicio">
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fin">
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Pista">
              <select value={venue} onChange={(e) => setVenue(e.target.value)}>
                <option value="">Sin pista</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!directChange && (
            <Field label="Motivo (obligatorio)">
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <ConflictWarning conflicts={conflicts} />
          <div className="row gap-s">
            <button
              className="btn btn-primary"
              disabled={!start || !end || end <= start || (!directChange && !reason.trim())}
              onClick={() =>
                void run(async () => {
                  const args = { p_event: ev.id, p_starts: fromLocalInput(start), p_ends: fromLocalInput(end), p_venue: venue || null }
                  if (directChange) must(await supabase.rpc('update_event', args))
                  else must(await supabase.rpc('request_event_change', { ...args, p_reason: reason }))
                }, directChange ? 'Cambio guardado. Se ha avisado al cuerpo técnico.' : 'Solicitud enviada a coordinación.')
              }
            >
              {directChange ? 'Guardar cambio' : 'Enviar solicitud'}
            </button>
            <button className="btn" onClick={() => setMode('view')}>
              Volver
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
