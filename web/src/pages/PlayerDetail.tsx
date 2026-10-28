import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { PlayerForm, validatePlayer, type PlayerDraft } from '../components/PlayerForm'
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui'
import { computeStats, formatPct, STATUS_INFO, STATUS_ORDER } from '../lib/attendance'
import { age, fmtDate, fmtShort, fmtTime, isoDate } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { KIND_LABEL, type AttendanceRow, type Enrollment, type EventRow, type Player, type Season, type Team } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type Tab = 'datos' | 'equipos' | 'documentos' | 'asistencias' | 'partidos' | 'observaciones'
const TABS: [Tab, string][] = [
  ['datos', 'Datos personales'],
  ['equipos', 'Equipos y temporadas'],
  ['documentos', 'Documentos'],
  ['asistencias', 'Asistencias'],
  ['partidos', 'Partidos'],
  ['observaciones', 'Observaciones'],
]

type PlayerCallup = {
  event_id: string
  events:
    | (Pick<EventRow, 'id' | 'team_id' | 'starts_at' | 'status'> & {
        teams: { name: string } | null
        matches: { opponent: string; home: boolean; competition: string | null; score_for: number | null; score_against: number | null } | null
      })
    | null
}

type EnrollmentFull = Enrollment & { teams: (Pick<Team, 'id' | 'name' | 'code'> & { seasons: Pick<Season, 'name' | 'status'> | null }) | null }

export function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isCoord, isPrincipalOf } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('datos')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PlayerDraft>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data, error, loading, reload } = useAsync(async () => {
    const player = must(await supabase.from('players').select('*').eq('id', id!).maybeSingle()) as Player | null
    if (!player) throw new Error('Jugador no encontrado o sin permiso para verlo.')
    const enrollments = must(
      await supabase.from('enrollments').select('*, teams(id,name,code,seasons(name,status))').eq('player_id', id!).order('start_date'),
    ) as EnrollmentFull[]
    const attendance = must(
      await supabase.from('attendance').select('*, events(id,team_id,type,starts_at,ends_at,status)').eq('player_id', id!),
    ) as (AttendanceRow & { events: EventRow | null })[]
    const callups = must(
      await supabase
        .from('match_callups')
        .select('event_id, events(id,team_id,starts_at,status, teams(name), matches(opponent,home,competition,score_for,score_against))')
        .eq('player_id', id!),
    ) as unknown as PlayerCallup[]
    return {
      player,
      enrollments: enrollments.filter((e) => e.teams),
      attendance: attendance.filter((a) => a.events),
      callups: callups.filter((c) => c.events).sort((a, b) => b.events!.starts_at.localeCompare(a.events!.starts_at)),
    }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox error={error} />
  const { player } = data
  const today = isoDate(new Date())
  const canEdit =
    isCoord ||
    data.enrollments.some(
      (e) => (!e.end_date || e.end_date >= today) && isPrincipalOf(e.team_id) && e.teams?.seasons?.status === 'activa',
    )

  const save = async () => {
    const v = validatePlayer(draft)
    if (v) return setActionError(v)
    setActionError(null)
    try {
      const fields = Object.fromEntries(
        Object.entries(draft).filter(([k]) => !['id', 'active', 'deleted_at', 'created_at', 'updated_at', 'created_by'].includes(k)),
      )
      must(await supabase.from('players').update(fields).eq('id', player.id))
      setEditing(false)
      setSaved(true)
      await reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const coordAction = async (patch: Partial<Player>, question: string, after?: () => void) => {
    if (!confirm(question)) return
    try {
      must(await supabase.from('players').update(patch).eq('id', player.id))
      if (after) after()
      else await reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const trainings = data.attendance.filter((a) => a.events!.type !== 'partido' && ['programado', 'aplazado', 'finalizado'].includes(a.events!.status))
  const stats = computeStats(trainings.map((a) => a.status))

  return (
    <>
      <PageHeader
        title={`${player.first_name} ${player.last_name}`}
        subtitle={
          <>
            {age(player.birth_date)} años · {player.position ?? 'Sin posición'}{' '}
            {!player.active && <Badge tone="warn">Inactivo</Badge>}
          </>
        }
        actions={
          <>
            {canEdit && !editing && tab === 'datos' && (
              <button className="btn btn-primary" onClick={() => { setDraft(player); setEditing(true); setSaved(false) }}>
                Editar datos
              </button>
            )}
            {isCoord &&
              (player.active ? (
                <button className="btn" onClick={() => coordAction({ active: false }, '¿Desactivar al jugador? Se ocultará de los listados pero conservará su ficha e historial.')}>
                  Desactivar
                </button>
              ) : (
                <button className="btn" onClick={() => coordAction({ active: true }, '¿Reactivar al jugador?')}>
                  Reactivar
                </button>
              ))}
            {isCoord && (
              <button
                className="btn btn-danger"
                onClick={() =>
                  coordAction({ deleted_at: new Date().toISOString() }, '¿Enviar la ficha a la papelera? Podrás restaurarla.', () => navigate('/jugadores'))
                }
              >
                Eliminar
              </button>
            )}
          </>
        }
      />
      <ErrorBox error={actionError} />
      {saved && <div className="alert alert-ok">Datos guardados.{!isCoord && ' Coordinación ha sido notificada.'}</div>}
      {player.allergies && <div className="alert alert-warn">Alergias: {player.allergies}</div>}

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <section className="card">
        {tab === 'datos' && (
          <>
            <PlayerForm value={editing ? draft : player} onChange={setDraft} readOnly={!editing} />
            {editing && (
              <div className="row gap-s">
                <button className="btn btn-primary" onClick={save}>
                  Guardar
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              </div>
            )}
            {!canEdit && <p className="muted small">Solo el entrenador principal y coordinación pueden modificar estos datos.</p>}
          </>
        )}
        {tab === 'equipos' && (
          <table className="table">
            <thead>
              <tr>
                <th>Temporada</th>
                <th>Equipo</th>
                <th>Tipo</th>
                <th>Dorsal</th>
                <th>Desde</th>
                <th>Hasta</th>
              </tr>
            </thead>
            <tbody>
              {data.enrollments.map((e) => (
                <tr key={e.id}>
                  <td>{e.teams!.seasons?.name}</td>
                  <td>
                    <Link to={`/equipos/${e.team_id}`}>{e.teams!.name}</Link>
                  </td>
                  <td>{KIND_LABEL[e.kind]}</td>
                  <td>{e.dorsal ?? '—'}</td>
                  <td>{fmtDate(e.start_date)}</td>
                  <td>{e.end_date ? fmtDate(e.end_date) : 'Actual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'documentos' && <p className="muted">La gestión documental llegará en la fase 3.</p>}
        {tab === 'partidos' &&
          (data.callups.length === 0 ? (
            <p className="muted">No ha sido convocado a ningún partido.</p>
          ) : (
            <>
              <div className="stats">
                <div className="stat">
                  <span>{data.callups.length}</span>Convocatorias
                </div>
                <div className="stat">
                  <span>
                    {data.attendance.filter((a) => a.events?.type === 'partido' && (a.status === 'asistencia' || a.status === 'retraso')).length}
                  </span>
                  Partidos jugados
                </div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Equipo</th>
                    <th>Rival</th>
                    <th>Resultado</th>
                    <th>Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.callups.map((c) => {
                    const ev = c.events!
                    const m = ev.matches
                    const att = data.attendance.find((a) => a.event_id === c.event_id)
                    return (
                      <tr key={c.event_id}>
                        <td>
                          <Link to={`/partidos/${c.event_id}`}>{fmtShort(ev.starts_at)}</Link>
                        </td>
                        <td>{ev.teams?.name}</td>
                        <td>
                          {m?.home ? 'vs' : '@'} {m?.opponent}
                        </td>
                        <td>{m?.score_for != null ? `${m.score_for}-${m.score_against}` : '—'}</td>
                        <td>{att ? <span className={`st st-${att.status}`}>{STATUS_INFO[att.status].label}</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ))}
        {tab === 'asistencias' && (
          <>
            <div className="stats">
              <div className="stat">
                <span>{formatPct(stats.percentage)}</span>Asistencia
              </div>
              <div className="stat">
                <span>{stats.attended}</span>Asistencias
              </div>
              <div className="stat">
                <span>{stats.late}</span>Retrasos
              </div>
              <div className="stat">
                <span>{stats.justified}</span>Justificadas
              </div>
              <div className="stat">
                <span>{stats.unjustified}</span>Sin justificar
              </div>
            </div>
            <div className="chips">
              {STATUS_ORDER.filter((s) => s !== 'sin_registrar' && stats.byStatus[s]).map((s) => (
                <span key={s} className={`chip st-${s}`}>
                  {STATUS_INFO[s].label}: {stats.byStatus[s]}
                </span>
              ))}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {[...trainings]
                  .sort((a, b) => b.events!.starts_at.localeCompare(a.events!.starts_at))
                  .map((a) => (
                    <tr key={a.event_id}>
                      <td>
                        {fmtShort(a.events!.starts_at)} {fmtTime(a.events!.starts_at)}
                      </td>
                      <td>
                        <span className={`st st-${a.status}`}>{STATUS_INFO[a.status].label}</span>
                      </td>
                      <td>{a.notes ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
        {tab === 'observaciones' && (
          <ObservationsTab
            value={player.observations ?? ''}
            canEdit={canEdit}
            onSave={async (v) => {
              must(await supabase.from('players').update({ observations: v || null }).eq('id', player.id))
              await reload()
            }}
          />
        )}
      </section>
    </>
  )
}

function ObservationsTab({ value, canEdit, onSave }: { value: string; canEdit: boolean; onSave: (v: string) => Promise<void> }) {
  const [text, setText] = useState(value)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} className="full" />
      {canEdit && (
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await onSave(text)
              setMsg('Observaciones guardadas.')
            } catch (e) {
              setMsg(errorMessage(e))
            }
          }}
        >
          Guardar observaciones
        </button>
      )}
      {msg && <p className="muted small">{msg}</p>}
    </>
  )
}
