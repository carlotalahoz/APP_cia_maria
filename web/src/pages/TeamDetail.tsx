import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AddPlayerModal } from '../components/AddPlayerModal'
import { TeamForm } from '../components/TeamForm'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { hhmm, loadCategories, loadProfiles, loadVenues } from '../lib/data'
import { fmtDate, isoDate } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import {
  BRANCH_LABEL,
  KIND_LABEL,
  STAFF_LABEL,
  WEEKDAYS,
  type Enrollment,
  type EventRow,
  type Player,
  type Team,
  type TeamStaff,
  type TrainingSlot,
} from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type EnrollmentWithPlayer = Enrollment & { players: Pick<Player, 'id' | 'first_name' | 'last_name' | 'birth_date' | 'position'> | null }

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isCoord, isPrincipalOf, seasons } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    const team = must(await supabase.from('teams').select('*').eq('id', id!).maybeSingle()) as Team | null
    if (!team) throw new Error('Equipo no encontrado o sin permiso.')
    const [slots, staff, enrollments, events, categories, venues, profiles] = await Promise.all([
      supabase.from('training_slots').select('*').eq('team_id', id!).order('weekday'),
      supabase.from('team_staff').select('*').eq('team_id', id!),
      supabase
        .from('enrollments')
        .select('*, players(id,first_name,last_name,birth_date,position)')
        .eq('team_id', id!)
        .order('dorsal', { nullsFirst: false }),
      supabase.from('events').select('*').eq('team_id', id!).gte('starts_at', new Date().toISOString()).order('starts_at').limit(20),
      loadCategories(),
      loadVenues(),
      loadProfiles(),
    ])
    return {
      team,
      slots: must(slots) as TrainingSlot[],
      staff: must(staff) as TeamStaff[],
      enrollments: (must(enrollments) as EnrollmentWithPlayer[]).filter((e) => e.players),
      events: must(events) as EventRow[],
      categories,
      venues,
      profiles,
    }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox error={error} />

  const { team } = data
  const season = seasons.find((s) => s.id === team.season_id)
  const open = season?.status === 'activa'
  const canPrincipal = isPrincipalOf(team.id) && (open || isCoord)
  const today = isoDate(new Date())
  const current = data.enrollments.filter((e) => !e.end_date || e.end_date >= today)
  const past = data.enrollments.filter((e) => e.end_date && e.end_date < today)
  const name = (uid: string) => data.profiles.find((p) => p.id === uid)?.full_name ?? '—'
  const venue = (vid: string | null) => data.venues.find((v) => v.id === vid)?.name ?? 'Sin pista'

  const run = async (fn: () => Promise<string | void>) => {
    setActionError(null)
    setMsg(null)
    try {
      const m = await fn()
      if (m) setMsg(m)
      await reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const generate = () =>
    run(async () => {
      const n = must(await supabase.rpc('generate_training_sessions', { p_team: team.id, p_from: today })) as number
      return `Se han generado ${n} entrenamientos nuevos.`
    })

  const endEnrollment = (e: EnrollmentWithPlayer) =>
    run(async () => {
      if (!confirm(`¿Dar de baja a ${e.players?.first_name} de este equipo? Su ficha e historial se conservan.`)) return
      must(await supabase.from('enrollments').update({ end_date: today }).eq('id', e.id))
    })

  const removeTeam = () =>
    run(async () => {
      if (!confirm('¿Enviar el equipo a la papelera? Podrás restaurarlo desde Papelera.')) return
      must(await supabase.from('teams').update({ deleted_at: new Date().toISOString() }).eq('id', team.id))
      navigate('/equipos')
    })

  return (
    <>
      <PageHeader
        title={team.name}
        subtitle={
          <>
            <span className="team-code">{team.code}</span> {data.categories.find((c) => c.id === team.category_id)?.name} ·{' '}
            {BRANCH_LABEL[team.branch]} · Temporada {season?.name}
          </>
        }
        actions={
          <>
            <Link className="btn" to={`/asistencia?equipo=${team.id}`}>
              Asistencia
            </Link>
            {isCoord && (
              <>
                <button className="btn" onClick={() => setEditing(true)}>
                  Editar
                </button>
                <button className="btn" onClick={generate}>
                  Generar entrenamientos
                </button>
                <button className="btn btn-danger" onClick={removeTeam}>
                  Eliminar
                </button>
              </>
            )}
          </>
        }
      />
      <ErrorBox error={actionError} />
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="grid-2">
        <section className="card">
          <h2>Horario</h2>
          {data.slots.length === 0 ? (
            <p className="muted">Sin horario fijo.</p>
          ) : (
            <ul className="list">
              {data.slots.map((s) => (
                <li key={s.id}>
                  <span className="list-main">
                    <strong>{WEEKDAYS[s.weekday]}</strong>
                    <span className="muted">
                      {hhmm(s.start_time)}–{hhmm(s.end_time)} · {venue(s.venue_id)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Cuerpo técnico</h2>
          <ul className="list">
            {data.staff.map((s) => (
              <li key={s.user_id}>
                <span className="list-main">
                  <strong>{name(s.user_id)}</strong>
                </span>
                <Badge tone={s.staff_role === 'principal' ? 'info' : 'neutral'}>{STAFF_LABEL[s.staff_role]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <h2>Jugadores ({current.length})</h2>
          {open && (
            <button className="btn btn-primary btn-s" onClick={() => setAdding(true)}>
              + Añadir jugador
            </button>
          )}
        </div>
        {current.length === 0 ? (
          <Empty>Sin jugadores.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Dorsal</th>
                <th>Jugador</th>
                <th>Nacimiento</th>
                <th>Posición</th>
                <th>Tipo</th>
                {canPrincipal && <th />}
              </tr>
            </thead>
            <tbody>
              {current.map((e) => (
                <tr key={e.id}>
                  <td>{e.dorsal ?? '—'}</td>
                  <td>
                    <Link to={`/jugadores/${e.player_id}`}>
                      {e.players!.last_name}, {e.players!.first_name}
                    </Link>
                  </td>
                  <td>{fmtDate(e.players!.birth_date)}</td>
                  <td>{e.players!.position ?? '—'}</td>
                  <td>
                    <Badge tone={e.kind === 'plantilla' ? 'neutral' : 'info'}>{KIND_LABEL[e.kind]}</Badge>
                    {e.end_date && <span className="muted small"> hasta {fmtDate(e.end_date)}</span>}
                  </td>
                  {canPrincipal && (
                    <td className="right">
                      <button className="btn btn-ghost btn-s" onClick={() => endEnrollment(e)}>
                        Dar de baja
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {past.length > 0 && (
          <details>
            <summary className="muted">Historial de bajas ({past.length})</summary>
            <ul className="list">
              {past.map((e) => (
                <li key={e.id}>
                  <Link to={`/jugadores/${e.player_id}`}>
                    {e.players!.first_name} {e.players!.last_name}
                  </Link>
                  <span className="muted small">
                    {fmtDate(e.start_date)} – {fmtDate(e.end_date!)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {editing && (
        <TeamForm
          seasonId={team.season_id}
          team={team}
          slots={data.slots}
          staff={data.staff}
          categories={data.categories}
          venues={data.venues}
          profiles={data.profiles}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            void reload()
          }}
        />
      )}
      {adding && (
        <AddPlayerModal
          teamId={team.id}
          canCreate={canPrincipal}
          events={data.events}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            setMsg('Jugador añadido. Coordinación ha sido notificada.')
            void reload()
          }}
        />
      )}
    </>
  )
}
