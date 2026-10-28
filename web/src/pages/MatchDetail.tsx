import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AddPlayerModal } from '../components/AddPlayerModal'
import { fromLocalInput, StatusBadge, toLocalInput } from '../components/EventBits'
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader } from '../components/ui'
import { loadProfiles, loadVenues } from '../lib/data'
import { fmtDateTime, fmtTime, isoDate, startOfWeek } from '../lib/dates'
import { normalizeRival, outcome, OUTCOME_LABEL, teamRecord } from '../lib/matches'
import { errorMessage, supabase } from '../lib/supabase'
import {
  KIND_LABEL,
  STAFF_LABEL,
  type Enrollment,
  type EventRow,
  type MatchPeriod,
  type MatchReport,
  type MatchRow,
  type Player,
  type Team,
  type TeamStaff,
  type Venue,
  type Profile,
} from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type Tab = 'datos' | 'convocatoria' | 'resultado' | 'actas' | 'historial'
type Enr = Enrollment & { players: Pick<Player, 'id' | 'first_name' | 'last_name' | 'active' | 'deleted_at'> | null }

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isCoord, staff: myStaff, seasons } = useAuth()
  const [tab, setTab] = useState<Tab>('datos')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    const ev = must(await supabase.from('events').select('*').eq('id', id!).maybeSingle()) as EventRow | null
    if (!ev || ev.type !== 'partido') throw new Error('Partido no encontrado o sin permiso.')
    const [m, team, staff, enr, callups, reports, venues, profiles] = await Promise.all([
      supabase.from('matches').select('*').eq('event_id', ev.id).single(),
      supabase.from('teams').select('*').eq('id', ev.team_id).single(),
      supabase.from('team_staff').select('*').eq('team_id', ev.team_id),
      supabase.from('enrollments').select('*, players(id,first_name,last_name,active,deleted_at)').eq('team_id', ev.team_id),
      supabase.from('match_callups').select('player_id').eq('event_id', ev.id),
      supabase.from('match_reports').select('*').eq('event_id', ev.id).order('uploaded_at', { ascending: false }),
      loadVenues(),
      loadProfiles(),
    ])
    const match = must(m) as MatchRow
    const t = must(team) as Team
    // Historial contra el mismo rival (todas las temporadas visibles)
    const sameRival = must(await supabase.from('matches').select('*').ilike('opponent', `%${match.opponent.trim()}%`)) as MatchRow[]
    const rivalIds = sameRival.filter((x) => x.event_id !== ev.id && normalizeRival(x.opponent) === normalizeRival(match.opponent)).map((x) => x.event_id)
    const rivalEvents = rivalIds.length
      ? (must(await supabase.from('events').select('*').in('id', rivalIds).eq('status', 'finalizado').order('starts_at', { ascending: false })) as EventRow[])
      : []
    return {
      ev,
      match,
      team: t,
      staff: must(staff) as TeamStaff[],
      enrollments: (must(enr) as Enr[]).filter((e) => e.players && e.players.active && !e.players.deleted_at),
      callups: (must(callups) as { player_id: string }[]).map((c) => c.player_id),
      reports: must(reports) as MatchReport[],
      venues,
      profiles,
      rival: rivalEvents.map((e) => ({ ev: e, m: sameRival.find((x) => x.event_id === e.id)! })),
    }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const { ev, match, team } = data
  const seasonOpen = seasons.find((s) => s.id === team.season_id)?.status === 'activa'
  const canCoach = (isCoord || myStaff.some((s) => s.team_id === team.id && s.staff_role !== 'delegado')) && (seasonOpen || isCoord)
  const approved = ev.status !== 'pendiente_aprobacion' && ev.status !== 'cancelado'
  const name = (uid: string | null) => data.profiles.find((p) => p.id === uid)?.full_name ?? '—'

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null)
    setMsg(null)
    try {
      await fn()
      setMsg(done)
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const o = outcome(match)
  return (
    <>
      <PageHeader
        title={`${team.name} ${match.home ? 'vs' : '@'} ${match.opponent}`}
        subtitle={
          <>
            {ev.status === 'pendiente' ? 'Sin fecha' : `${fmtDateTime(ev.starts_at)}–${fmtTime(ev.ends_at)}`} ·{' '}
            {data.venues.find((v) => v.id === ev.venue_id)?.name ?? match.away_location ?? 'Fuera'} · <StatusBadge status={ev.status} />
          </>
        }
        actions={
          <>
            <Link className="btn" to={`/calendario?semana=${isoDate(startOfWeek(new Date(ev.starts_at)))}`}>
              Calendario
            </Link>
            {approved && ev.status !== 'pendiente' && (
              <Link className="btn" to={`/asistencia?equipo=${team.id}&semana=${isoDate(startOfWeek(new Date(ev.starts_at)))}`}>
                Asistencia
              </Link>
            )}
          </>
        }
      />
      {o && (
        <div className="scoreboard">
          <span>{team.name}</span>
          <strong>
            {match.score_for} – {match.score_against}
          </strong>
          <span>{match.opponent}</span>
          <Badge tone={o === 'G' ? 'ok' : o === 'P' ? 'danger' : 'neutral'}>{OUTCOME_LABEL[o]}</Badge>
          {match.suspended && <Badge tone="warn">Suspendido</Badge>}
        </div>
      )}
      {ev.status === 'pendiente_aprobacion' && (
        <div className="alert alert-warn">
          Pendiente de aprobación por coordinación.{' '}
          {isCoord && (
            <>
              <button className="btn btn-s btn-primary" onClick={() => void run(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: ev.id, p_approve: true })), 'Partido aprobado.')}>
                Aprobar
              </button>{' '}
              <button
                className="btn btn-s btn-danger"
                onClick={() => {
                  const note = prompt('Motivo del rechazo (opcional):')
                  if (note !== null) void run(async () => must(await supabase.rpc('resolve_event_proposal', { p_event: ev.id, p_approve: false, p_note: note })), 'Partido rechazado.')
                }}
              >
                Rechazar
              </button>
            </>
          )}
        </div>
      )}
      {ev.status === 'cancelado' && <div className="alert alert-error">Cancelado. {ev.cancel_reason}</div>}
      {ev.original_starts_at && (
        <p className="muted small">
          Fecha original: {fmtDateTime(ev.original_starts_at)}
          {ev.postpone_reason && <> · Motivo del aplazamiento: {ev.postpone_reason}</>}
        </p>
      )}
      {!seasonOpen && !isCoord && <div className="alert alert-warn">Temporada cerrada: solo lectura.</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={err} />

      <div className="tabs" role="tablist">
        {(
          [
            ['datos', 'Datos'],
            ['convocatoria', `Convocatoria (${data.callups.length})`],
            ['resultado', 'Resultado'],
            ['actas', `Actas (${data.reports.filter((r) => !r.replaced_at).length})`],
            ['historial', 'Historial vs rival'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <section className="card">
        {tab === 'datos' && <DataTab key={ev.updated_at} data={data} canCoach={canCoach} run={run} />}
        {tab === 'convocatoria' &&
          (approved ? (
            <CallupTab data={data} canCoach={canCoach} run={run} reload={reload} />
          ) : (
            <p className="muted">La convocatoria se prepara cuando el partido está aprobado.</p>
          ))}
        {tab === 'resultado' && (
          <ResultTab
            match={match}
            staff={data.staff}
            name={name}
            canCoach={canCoach && approved && ev.status !== 'pendiente'}
            onSave={(r) => run(async () => must(await supabase.rpc('save_match_result', { p_event: ev.id, ...r })), 'Resultado guardado. Coordinación ha sido notificada.')}
          />
        )}
        {tab === 'actas' && <ReportsTab data={data} canCoach={canCoach && approved} name={name} run={run} />}
        {tab === 'historial' && (
          <>
            {(() => {
              const r = teamRecord(data.rival.map((x) => x.m))
              return (
                <div className="stats">
                  <div className="stat">
                    <span>{r.played}</span>Jugados
                  </div>
                  <div className="stat">
                    <span>{r.won}</span>Ganados
                  </div>
                  <div className="stat">
                    <span>{r.lost}</span>Perdidos
                  </div>
                  <div className="stat">
                    <span>{r.drawn}</span>Empatados
                  </div>
                </div>
              )
            })()}
            {data.rival.length === 0 ? (
              <Empty>No hay otros partidos finalizados contra {match.opponent}.</Empty>
            ) : (
              <ul className="list">
                {data.rival.map(({ ev: e, m }) => (
                  <li key={e.id}>
                    <Link to={`/partidos/${e.id}`} className="list-main">
                      <strong>
                        {m.score_for}-{m.score_against} {m.home ? '(local)' : '(visitante)'}
                      </strong>
                      <span className="muted small">
                        {fmtDateTime(e.starts_at)} · {m.competition ?? 'Amistoso'}
                      </span>
                    </Link>
                    {outcome(m) && <Badge tone={outcome(m) === 'G' ? 'ok' : outcome(m) === 'P' ? 'danger' : 'neutral'}>{OUTCOME_LABEL[outcome(m)!]}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  )
}

interface Data {
  ev: EventRow
  match: MatchRow
  team: Team
  staff: TeamStaff[]
  enrollments: Enr[]
  callups: string[]
  reports: MatchReport[]
  venues: Venue[]
  profiles: Profile[]
}
type Run = (fn: () => Promise<unknown>, done: string) => Promise<void>

function DataTab({ data, canCoach, run }: { data: Data; canCoach: boolean; run: Run }) {
  const { ev, match } = data
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'none' | 'postpone' | 'cancel'>('none')
  const [f, setF] = useState({ ...match, competition: match.competition ?? '', matchday: match.matchday ?? '', away_location: match.away_location ?? '' })
  const [start, setStart] = useState(toLocalInput(ev.starts_at))
  const [end, setEnd] = useState(toLocalInput(ev.ends_at))
  const [venue, setVenue] = useState(ev.venue_id ?? '')
  const [reason, setReason] = useState('')
  const [newDate, setNewDate] = useState('')
  const [notes, setNotes] = useState(ev.notes ?? '')
  const active = ['programado', 'aplazado', 'pendiente'].includes(ev.status)

  if (editing)
    return (
      <>
        <div className="form-grid">
          <Field label="Rival">
            <input value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MatchRow['kind'] })}>
              <option value="oficial">Oficial</option>
              <option value="amistoso">Amistoso</option>
            </select>
          </Field>
          <Field label="Competición">
            <input value={f.competition} onChange={(e) => setF({ ...f, competition: e.target.value })} />
          </Field>
          <Field label="Jornada">
            <input value={f.matchday} onChange={(e) => setF({ ...f, matchday: e.target.value })} />
          </Field>
          <Field label="Campo">
            <select value={f.home ? 'l' : 'v'} onChange={(e) => setF({ ...f, home: e.target.value === 'l' })}>
              <option value="l">Local</option>
              <option value="v">Visitante</option>
            </select>
          </Field>
          {!f.home && (
            <Field label="Instalación del rival">
              <input value={f.away_location} onChange={(e) => setF({ ...f, away_location: e.target.value })} />
            </Field>
          )}
          {ev.status !== 'pendiente' && ev.status !== 'finalizado' && (
            <>
              <Field label="Inicio">
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Fin">
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Pista">
            <select value={venue} onChange={(e) => setVenue(e.target.value)}>
              <option value="">Fuera / otra instalación</option>
              {data.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={f.school} onChange={(e) => setF({ ...f, school: e.target.checked })} /> Competición escolar
          </label>
        </div>
        <div className="row gap-s">
          <button
            className="btn btn-primary"
            onClick={() =>
              void run(async () => {
                must(await supabase.rpc('update_match', { p_event: ev.id, p_match: f }))
                const timeChanged = toLocalInput(ev.starts_at) !== start || toLocalInput(ev.ends_at) !== end || (ev.venue_id ?? '') !== venue
                if (timeChanged && ev.status !== 'finalizado' && ev.status !== 'pendiente')
                  must(await supabase.rpc('update_event', { p_event: ev.id, p_starts: fromLocalInput(start), p_ends: fromLocalInput(end), p_venue: venue || null }))
                setEditing(false)
              }, 'Datos guardados.')
            }
          >
            Guardar
          </button>
          <button className="btn" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      </>
    )

  return (
    <>
      <dl className="dl">
        <dt>Tipo</dt>
        <dd>
          {match.kind === 'oficial' ? 'Oficial' : 'Amistoso'}
          {match.school && ' · Competición escolar'}
        </dd>
        <dt>Competición</dt>
        <dd>
          {match.competition ?? '—'}
          {match.matchday && ` · Jornada ${match.matchday}`}
        </dd>
        <dt>Campo</dt>
        <dd>{match.home ? 'Local' : `Visitante${match.away_location ? ` · ${match.away_location}` : ''}`}</dd>
        <dt>Entrenadores asistentes</dt>
        <dd>{match.staff_present.length ? match.staff_present.map((u) => data.profiles.find((p) => p.id === u)?.full_name).join(', ') : '—'}</dd>
      </dl>
      <Field label="Observaciones">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canCoach} />
      </Field>
      {canCoach && (
        <div className="row gap-s wrap">
          {notes !== (ev.notes ?? '') && (
            <button className="btn btn-s" onClick={() => void run(async () => must(await supabase.rpc('set_event_notes', { p_event: ev.id, p_notes: notes })), 'Observaciones guardadas.')}>
              Guardar observaciones
            </button>
          )}
          {ev.status !== 'cancelado' && (
            <button className="btn btn-s" onClick={() => setEditing(true)}>
              Editar datos
            </button>
          )}
          {active && (
            <button className="btn btn-s" onClick={() => setMode('postpone')}>
              Aplazar
            </button>
          )}
          {active && (
            <button className="btn btn-s btn-danger" onClick={() => setMode('cancel')}>
              Cancelar partido
            </button>
          )}
        </div>
      )}
      {mode !== 'none' && (
        <div className="card pad">
          <Field label={mode === 'postpone' ? 'Motivo del aplazamiento (obligatorio)' : 'Motivo de la cancelación (obligatorio)'}>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          {mode === 'postpone' && (
            <Field label="Nueva fecha y hora" hint="Déjalo vacío si aún no hay fecha: quedará como «Partido pendiente».">
              <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </Field>
          )}
          <div className="row gap-s">
            <button
              className="btn btn-danger"
              disabled={!reason.trim()}
              onClick={() => {
                if (mode === 'cancel' && !confirm('¿Cancelar el partido? Se avisará a los afectados.')) return
                void run(async () => {
                  if (mode === 'cancel') must(await supabase.rpc('cancel_event', { p_event: ev.id, p_reason: reason }))
                  else must(await supabase.rpc('postpone_match', { p_event: ev.id, p_reason: reason, p_starts: newDate ? fromLocalInput(newDate) : null }))
                  setMode('none')
                }, mode === 'cancel' ? 'Partido cancelado.' : 'Partido aplazado.')
              }}
            >
              Confirmar
            </button>
            <button className="btn" onClick={() => setMode('none')}>
              Volver
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CallupTab({ data, canCoach, run, reload }: { data: Data; canCoach: boolean; run: Run; reload: () => Promise<void> }) {
  const { ev } = data
  const day = isoDate(new Date(ev.starts_at))
  const candidates = data.enrollments
    .filter((e) => (e.kind === 'sube_puntual' ? e.event_id === ev.id : e.start_date <= day && (!e.end_date || e.end_date >= day)))
    .filter((e, i, arr) => arr.findIndex((x) => x.player_id === e.player_id) === i)
    .sort((a, b) => Number(b.kind === 'plantilla') - Number(a.kind === 'plantilla') || a.players!.last_name.localeCompare(b.players!.last_name, 'es'))
  // Sin convocatoria guardada, se preseleccionan los habituales (plantilla y suben habituales).
  const saved = !!data.match.callup_saved_at
  const initial = saved ? data.callups : candidates.filter((c) => c.kind !== 'sube_puntual').map((c) => c.player_id)
  const [sel, setSel] = useState<string[]>(initial)
  const [adding, setAdding] = useState(false)
  const dirty = !saved || sel.length !== data.callups.length || sel.some((p) => !data.callups.includes(p))

  return (
    <>
      {!saved && <div className="alert alert-warn">Convocatoria sin guardar: se han preseleccionado los jugadores habituales.</div>}
      <p className="muted small">La asistencia del partido se registra solo para los convocados.</p>
      <ul className="list">
        {candidates.map((c) => (
          <li key={c.player_id}>
            <label className="check">
              <input
                type="checkbox"
                disabled={!canCoach}
                checked={sel.includes(c.player_id)}
                onChange={(e) => setSel(e.target.checked ? [...sel, c.player_id] : sel.filter((p) => p !== c.player_id))}
              />
              <span className="dorsal">{c.dorsal ?? ''}</span> {c.players!.last_name}, {c.players!.first_name}
            </label>
            {c.kind !== 'plantilla' && <Badge tone="info">{KIND_LABEL[c.kind]}</Badge>}
          </li>
        ))}
      </ul>
      {canCoach && (
        <div className="row gap-s wrap">
          <button
            className="btn btn-primary"
            disabled={!dirty}
            onClick={() => void run(async () => must(await supabase.rpc('set_callup', { p_event: ev.id, p_players: sel })), `Convocatoria guardada (${sel.length} jugadores).`)}
          >
            Guardar convocatoria ({sel.length})
          </button>
          <button className="btn" onClick={() => setAdding(true)}>
            + Jugador que sube
          </button>
        </div>
      )}
      {adding && (
        <AddPlayerModal
          teamId={data.team.id}
          canCreate={false}
          events={[ev]}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void reload()
          }}
        />
      )}
    </>
  )
}

function ResultTab({
  match,
  staff,
  name,
  canCoach,
  onSave,
}: {
  match: MatchRow
  staff: TeamStaff[]
  name: (u: string | null) => string
  canCoach: boolean
  onSave: (r: { p_for: number; p_against: number; p_periods: MatchPeriod[]; p_incidents: string; p_suspended: boolean; p_staff: string[] }) => Promise<void>
}) {
  const blank = () => Array.from({ length: 4 }, () => ({ for: '', against: '' }))
  const [periods, setPeriods] = useState<{ for: string; against: string }[]>(
    match.periods.length ? match.periods.map((p) => ({ for: String(p.for), against: String(p.against) })) : blank(),
  )
  const [sf, setSf] = useState(match.score_for?.toString() ?? '')
  const [sa, setSa] = useState(match.score_against?.toString() ?? '')
  const [incidents, setIncidents] = useState(match.incidents ?? '')
  const [suspended, setSuspended] = useState(match.suspended)
  const [present, setPresent] = useState<string[]>(match.staff_present)
  const [err, setErr] = useState<string | null>(null)

  const filled = periods.filter((p) => p.for !== '' || p.against !== '')
  const sumFor = filled.reduce((a, p) => a + (Number(p.for) || 0), 0)
  const sumAgainst = filled.reduce((a, p) => a + (Number(p.against) || 0), 0)
  const mismatch = filled.length > 0 && sf !== '' && sa !== '' && (sumFor !== Number(sf) || sumAgainst !== Number(sa))

  const save = () => {
    setErr(null)
    if (sf === '' || sa === '') return setErr('Indica el marcador final de ambos equipos.')
    void onSave({
      p_for: Number(sf),
      p_against: Number(sa),
      p_periods: filled.map((p) => ({ for: Number(p.for) || 0, against: Number(p.against) || 0 })),
      p_incidents: incidents,
      p_suspended: suspended,
      p_staff: present,
    })
  }

  return (
    <>
      {match.result_at && <p className="muted small">Último registro: {fmtDateTime(match.result_at)}</p>}
      <table className="table periods">
        <thead>
          <tr>
            <th />
            {periods.map((_, i) => (
              <th key={i}>{i < 4 ? `${i + 1}º` : `Pr. ${i - 3}`}</th>
            ))}
            <th>Final</th>
          </tr>
        </thead>
        <tbody>
          {(['for', 'against'] as const).map((side) => (
            <tr key={side}>
              <td>{side === 'for' ? 'Nosotros' : 'Rival'}</td>
              {periods.map((p, i) => (
                <td key={i}>
                  <input
                    type="number"
                    min={0}
                    disabled={!canCoach}
                    value={p[side]}
                    aria-label={`Periodo ${i + 1} ${side === 'for' ? 'nosotros' : 'rival'}`}
                    onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, [side]: e.target.value } : x)))}
                  />
                </td>
              ))}
              <td>
                <input
                  type="number"
                  min={0}
                  disabled={!canCoach}
                  value={side === 'for' ? sf : sa}
                  aria-label={`Marcador final ${side === 'for' ? 'nosotros' : 'rival'}`}
                  onChange={(e) => (side === 'for' ? setSf : setSa)(e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canCoach && (
        <div className="row gap-s wrap">
          <button className="btn btn-s" onClick={() => setPeriods([...periods, { for: '', against: '' }])}>
            + Prórroga
          </button>
          {filled.length > 0 && (
            <button
              className="btn btn-s"
              onClick={() => {
                setSf(String(sumFor))
                setSa(String(sumAgainst))
              }}
            >
              Calcular final desde periodos
            </button>
          )}
        </div>
      )}
      {mismatch && <div className="alert alert-warn">La suma de los periodos ({sumFor}-{sumAgainst}) no coincide con el marcador final.</div>}
      <label className="check block">
        <input type="checkbox" disabled={!canCoach} checked={suspended} onChange={(e) => setSuspended(e.target.checked)} /> Partido suspendido una vez
        comenzado
      </label>
      <Field label="Incidencias">
        <textarea rows={2} disabled={!canCoach} value={incidents} onChange={(e) => setIncidents(e.target.value)} />
      </Field>
      <fieldset className="plain">
        <legend className="field-label">Entrenadores asistentes</legend>
        {staff.map((s) => (
          <label key={s.user_id} className="check block">
            <input
              type="checkbox"
              disabled={!canCoach}
              checked={present.includes(s.user_id)}
              onChange={(e) => setPresent(e.target.checked ? [...present, s.user_id] : present.filter((u) => u !== s.user_id))}
            />
            {name(s.user_id)} <span className="muted small">({STAFF_LABEL[s.staff_role]})</span>
          </label>
        ))}
      </fieldset>
      <ErrorBox error={err} />
      {canCoach && (
        <button className="btn btn-primary" onClick={save}>
          {match.score_for == null ? 'Guardar resultado' : 'Corregir resultado'}
        </button>
      )}
    </>
  )
}

function ReportsTab({ data, canCoach, name, run }: { data: Data; canCoach: boolean; name: (u: string | null) => string; run: Run }) {
  const { ev, match } = data
  const [files, setFiles] = useState<FileList | null>(null)
  const [replace, setReplace] = useState(false)
  const current = data.reports.filter((r) => !r.replaced_at)
  const old = data.reports.filter((r) => r.replaced_at)

  const upload = () =>
    run(async () => {
      if (!files?.length) throw new Error('Selecciona uno o varios archivos (PDF o imagen).')
      if (replace && current.length)
        must(await supabase.from('match_reports').update({ replaced_at: new Date().toISOString() }).in('id', current.map((r) => r.id)))
      for (const f of Array.from(files)) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} supera 10 MB.`)
        const safe = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_')
        const path = `${ev.id}/${crypto.randomUUID()}-${safe}`
        const up = await supabase.storage.from('actas').upload(path, f, { contentType: f.type })
        if (up.error) throw new Error(up.error.message)
        must(await supabase.from('match_reports').insert({ event_id: ev.id, path, file_name: f.name, mime: f.type }))
      }
      setFiles(null)
    }, 'Acta guardada. Se ha avisado a coordinación.')

  const download = async (r: MatchReport) => {
    const { data: d, error } = await supabase.storage.from('actas').createSignedUrl(r.path, 60, { download: r.file_name })
    if (error) return alert(error.message)
    window.open(d.signedUrl, '_blank', 'noopener')
  }

  const row = (r: MatchReport) => (
    <li key={r.id}>
      <span className="list-main">
        <strong>{r.file_name}</strong>
        <span className="muted small">
          Subida el {fmtDateTime(r.uploaded_at)} por {name(r.uploaded_by)}
          {r.replaced_at && ` · sustituida el ${fmtDateTime(r.replaced_at)}`}
        </span>
      </span>
      <button className="btn btn-s" onClick={() => void download(r)}>
        Descargar
      </button>
    </li>
  )

  return (
    <>
      {!match.school && <p className="muted small">Las actas son obligatorias solo en competición escolar, pero puedes adjuntarlas en cualquier partido.</p>}
      {current.length === 0 ? <Empty>Sin actas adjuntas. El resultado puede registrarse igualmente.</Empty> : <ul className="list">{current.map(row)}</ul>}
      {canCoach && (
        <div className="card pad">
          <Field label="Adjuntar acta (PDF o fotos, máx. 10 MB por archivo)">
            <input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setFiles(e.target.files)} />
          </Field>
          {current.length > 0 && (
            <label className="check block">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Sustituir las actas actuales
            </label>
          )}
          <button className="btn btn-primary" disabled={!files?.length} onClick={() => void upload()}>
            Subir
          </button>
          <p className="muted small">De momento el marcador se introduce a mano en la pestaña Resultado.</p>
        </div>
      )}
      {old.length > 0 && (
        <details>
          <summary className="muted">Actas sustituidas ({old.length})</summary>
          <ul className="list">{old.map(row)}</ul>
        </details>
      )}
    </>
  )
}
