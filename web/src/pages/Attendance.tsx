import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui'
import { computeStats, formatPct, isEventComplete, STATUS_INFO, STATUS_ORDER } from '../lib/attendance'
import { loadTeams } from '../lib/data'
import { addDays, fmtDate, fmtShort, fmtTime, isoDate, startOfWeek } from '../lib/dates'
import { db, queueAttendance, resolveConflict, subscribe, syncPending, type PendingAttendance } from '../lib/offline'
import { errorMessage, supabase } from '../lib/supabase'
import type { AttendanceRow, AttendanceStatus, Enrollment, EventRow, Player, Team } from '../lib/types'
import { must } from '../lib/useAsync'

interface GridData {
  team: Pick<Team, 'id' | 'name' | 'code'>
  events: EventRow[]
  players: (Pick<Player, 'id' | 'first_name' | 'last_name'> & { dorsal: number | null; kind: Enrollment['kind'] })[]
  /** event_id -> player ids esperados */
  roster: Record<string, string[]>
  attendance: AttendanceRow[]
  fetchedAt: number
}

async function fetchGrid(team: Team, weekStart: Date): Promise<GridData> {
  const from = weekStart
  const to = addDays(weekStart, 7)
  const events = must(
    await supabase
      .from('events')
      .select('*')
      .eq('team_id', team.id)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at'),
  ) as EventRow[]
  const enr = must(
    await supabase.from('enrollments').select('*, players(id,first_name,last_name,active,deleted_at)').eq('team_id', team.id),
  ) as (Enrollment & { players: (Pick<Player, 'id' | 'first_name' | 'last_name' | 'active' | 'deleted_at'>) | null })[]
  const valid = enr.filter((e) => e.players && e.players.active && !e.players.deleted_at)
  const roster: Record<string, string[]> = {}
  for (const ev of events) {
    const day = isoDate(new Date(ev.starts_at))
    roster[ev.id] = [
      ...new Set(
        valid
          .filter((e) =>
            e.kind === 'sube_puntual' ? e.event_id === ev.id : e.start_date <= day && (!e.end_date || e.end_date >= day),
          )
          .map((e) => e.player_id),
      ),
    ]
  }
  const inGrid = new Set(Object.values(roster).flat())
  const players = valid
    .filter((e) => inGrid.has(e.player_id))
    .sort((a, b) => Number(b.kind === 'plantilla') - Number(a.kind === 'plantilla'))
    .filter((e, i, arr) => arr.findIndex((x) => x.player_id === e.player_id) === i)
    .map((e) => ({ ...e.players!, dorsal: e.dorsal, kind: e.kind }))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, 'es'))
  const attendance = events.length
    ? (must(await supabase.from('attendance').select('*').in('event_id', events.map((e) => e.id))) as AttendanceRow[])
    : []
  return { team: { id: team.id, name: team.name, code: team.code }, events, players, roster, attendance, fetchedAt: Date.now() }
}

export function AttendancePage() {
  const { isCoord, staff, seasonId } = useAuth()
  const [params, setParams] = useSearchParams()
  const [teams, setTeams] = useState<Team[]>([])
  const [week, setWeek] = useState(() => startOfWeek(new Date()))
  const [grid, setGrid] = useState<GridData | null>(null)
  const [pending, setPending] = useState<PendingAttendance[]>([])
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteCell, setNoteCell] = useState<{ event: EventRow; playerId: string } | null>(null)

  const teamId = params.get('equipo') ?? ''
  const team = teams.find((t) => t.id === teamId)
  const cacheKey = `${teamId}:${isoDate(week)}`

  useEffect(() => {
    const myIds = staff.map((s) => s.team_id)
    loadTeams(seasonId)
      .then((all) => {
        const list = isCoord ? all : all.filter((t) => myIds.includes(t.id))
        setTeams(list)
        if (!teamId && list[0]) setParams({ equipo: list[0].id }, { replace: true })
      })
      .catch(async () => {
        // sin conexión: reconstruye la lista de equipos desde las instantáneas guardadas
        const snaps = await db.grids.toArray()
        const seen = new Map<string, Team>()
        snaps.forEach((s) => {
          const t = (s.data as GridData).team
          seen.set(t.id, t as Team)
        })
        setTeams([...seen.values()])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isCoord, staff])

  const load = useCallback(async () => {
    if (!team) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const g = await fetchGrid(team, week)
      setGrid(g)
      setFromCache(false)
      await db.grids.put({ key: cacheKey, data: g, saved_at: Date.now() })
    } catch (e) {
      const snap = await db.grids.get(cacheKey)
      if (snap) {
        setGrid(snap.data as GridData)
        setFromCache(true)
      } else {
        setGrid(null)
        setError(navigator.onLine ? errorMessage(e) : 'Sin conexión y sin datos guardados para esta semana. Ábrela una vez con conexión.')
      }
    } finally {
      setLoading(false)
    }
  }, [team, week, cacheKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const refresh = async () => setPending(await db.pending.toArray())
    void refresh()
    const unsub = subscribe(() => void refresh())
    const onOnline = () => void syncPending().then(load)
    window.addEventListener('online', onOnline)
    return () => {
      unsub()
      window.removeEventListener('online', onOnline)
    }
  }, [load])

  const cell = useCallback(
    (eventId: string, playerId: string): { status: AttendanceStatus; notes: string | null; row?: AttendanceRow; queued?: PendingAttendance } => {
      const queued = pending.find((p) => p.event_id === eventId && p.player_id === playerId)
      const row = grid?.attendance.find((a) => a.event_id === eventId && a.player_id === playerId)
      if (queued) return { status: queued.status, notes: queued.notes, row, queued }
      return { status: row?.status ?? 'sin_registrar', notes: row?.notes ?? null, row }
    },
    [pending, grid],
  )

  const setCell = async (eventId: string, playerId: string, status: AttendanceStatus, notes?: string | null) => {
    const c = cell(eventId, playerId)
    await queueAttendance({
      event_id: eventId,
      player_id: playerId,
      status,
      notes: notes === undefined ? c.notes : notes,
      base_updated_at: c.row?.updated_at ?? null,
    })
    const res = await syncPending()
    if (res.sent && navigator.onLine) {
      // refresca solo las filas del servidor para obtener las nuevas versiones
      const fresh = await supabase.from('attendance').select('*').in('event_id', grid!.events.map((e) => e.id))
      if (!fresh.error && grid) {
        const g = { ...grid, attendance: fresh.data as AttendanceRow[] }
        setGrid(g)
        await db.grids.put({ key: cacheKey, data: g, saved_at: Date.now() })
      }
    }
  }

  const markAllPresent = async (ev: EventRow) => {
    for (const pid of grid!.roster[ev.id]) {
      if (cell(ev.id, pid).status === 'sin_registrar') {
        await queueAttendance({ event_id: ev.id, player_id: pid, status: 'asistencia', notes: null, base_updated_at: cell(ev.id, pid).row?.updated_at ?? null })
      }
    }
    await syncPending()
    await load()
  }

  const conflicts = pending.filter((p) => p.conflict && grid?.events.some((e) => e.id === p.event_id))
  const activeEvents = useMemo(() => grid?.events ?? [], [grid])
  const playerName = (id: string) => {
    const p = grid?.players.find((x) => x.id === id)
    return p ? `${p.first_name} ${p.last_name}` : id
  }

  return (
    <>
      <PageHeader
        title="Asistencia"
        subtitle="Cuadrícula semanal: filas jugadores, columnas sesiones"
        actions={
          <select value={teamId} onChange={(e) => setParams({ equipo: e.target.value })} aria-label="Equipo">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        }
      />
      <div className="row gap-s wrap week-nav">
        <button className="btn btn-s" onClick={() => setWeek(addDays(week, -7))}>
          ← Semana anterior
        </button>
        <strong>
          {fmtDate(week)} – {fmtDate(addDays(week, 6))}
        </strong>
        <button className="btn btn-s" onClick={() => setWeek(addDays(week, 7))}>
          Semana siguiente →
        </button>
        <button className="btn btn-ghost btn-s" onClick={() => setWeek(startOfWeek(new Date()))}>
          Hoy
        </button>
      </div>
      {fromCache && (
        <div className="alert alert-warn">
          Sin conexión: mostrando datos guardados el {grid && new Date(grid.fetchedAt).toLocaleString('es-ES')}. Puedes registrar
          asistencia; se enviará al recuperar Internet.
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="alert alert-error">
          <strong>Conflictos de sincronización</strong>: otra persona modificó estos registros mientras tanto. Elige qué valor conservar.
          <ul className="conflicts">
            {conflicts.map((c) => (
              <li key={c.key}>
                <span>
                  {playerName(c.player_id)} · {fmtShort(grid!.events.find((e) => e.id === c.event_id)!.starts_at)}
                </span>
                <button className="btn btn-s" onClick={() => void resolveConflict(c.key, 'mine').then(load)}>
                  Conservar el mío: {STATUS_INFO[c.status].label}
                </button>
                <button className="btn btn-s" onClick={() => void resolveConflict(c.key, 'server').then(load)}>
                  Conservar el de {c.conflict!.updated_by ?? 'servidor'}: {STATUS_INFO[c.conflict!.status].label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !grid ? null : activeEvents.length === 0 ? (
        <Empty>No hay sesiones esta semana.</Empty>
      ) : (
        <div className="grid-wrap">
          <table className="table att-grid">
            <thead>
              <tr>
                <th className="sticky">Jugador</th>
                {activeEvents.map((ev) => {
                  const sts = grid.roster[ev.id].map((p) => cell(ev.id, p).status)
                  const pend = sts.filter((s) => s === 'sin_registrar').length
                  return (
                    <th key={ev.id} className={ev.status === 'cancelado' ? 'cancelled' : ''}>
                      <div>{fmtShort(ev.starts_at)}</div>
                      <div className="muted small">{fmtTime(ev.starts_at)}</div>
                      {ev.status === 'cancelado' ? (
                        <Badge tone="danger">Cancelado</Badge>
                      ) : isEventComplete(sts) ? (
                        <Badge tone="ok">Completo</Badge>
                      ) : (
                        <>
                          <Badge tone="warn">{pend} pendientes</Badge>
                          <button className="link small block" onClick={() => markAllPresent(ev)}>
                            Todos presentes
                          </button>
                        </>
                      )}
                    </th>
                  )
                })}
                <th>% semana</th>
              </tr>
            </thead>
            <tbody>
              {grid.players.map((p) => {
                const weekStatuses = activeEvents
                  .filter((ev) => ev.status !== 'cancelado' && grid.roster[ev.id].includes(p.id))
                  .map((ev) => cell(ev.id, p.id).status)
                return (
                  <tr key={p.id}>
                    <td className="sticky">
                      <span className="dorsal">{p.dorsal ?? ''}</span> {p.last_name}, {p.first_name}
                      {p.kind !== 'plantilla' && <Badge tone="info">Sube</Badge>}
                    </td>
                    {activeEvents.map((ev) => {
                      if (!grid.roster[ev.id].includes(p.id)) return <td key={ev.id} className="na">—</td>
                      const c = cell(ev.id, p.id)
                      const disabled = ev.status === 'cancelado'
                      return (
                        <td key={ev.id} className={`att-cell st-${c.status}`}>
                          <select
                            value={c.status}
                            disabled={disabled}
                            onChange={(e) => void setCell(ev.id, p.id, e.target.value as AttendanceStatus)}
                            aria-label={`Asistencia de ${p.first_name} ${p.last_name} el ${fmtShort(ev.starts_at)}`}
                          >
                            {STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_INFO[s].label}
                              </option>
                            ))}
                          </select>
                          <button
                            className={`note-btn ${c.notes ? 'has-note' : ''}`}
                            title={c.notes ?? 'Añadir observación'}
                            onClick={() => setNoteCell({ event: ev, playerId: p.id })}
                            disabled={disabled}
                          >
                            ✎
                          </button>
                          {c.queued && <span className="pending-dot" title="Pendiente de sincronizar" />}
                        </td>
                      )
                    })}
                    <td>{formatPct(computeStats(weekStatuses).percentage)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted small">
            El retraso cuenta como asistencia; las ausencias justificadas reducen el porcentaje; «Sin registrar» no cuenta en el cálculo.
            Los cambios se guardan automáticamente.
          </p>
        </div>
      )}
      {noteCell && (
        <NoteModal
          initial={cell(noteCell.event.id, noteCell.playerId).notes ?? ''}
          title={`Observación · ${playerName(noteCell.playerId)} · ${fmtShort(noteCell.event.starts_at)}`}
          onClose={() => setNoteCell(null)}
          onSave={async (text) => {
            const c = cell(noteCell.event.id, noteCell.playerId)
            await setCell(noteCell.event.id, noteCell.playerId, c.status, text || null)
            setNoteCell(null)
          }}
        />
      )}
    </>
  )
}

function NoteModal({ initial, title, onClose, onSave }: { initial: string; title: string; onClose: () => void; onSave: (t: string) => Promise<void> }) {
  const [text, setText] = useState(initial)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={() => void onSave(text.trim())}>
          Guardar
        </button>
      }
    >
      <Field label="Observación (opcional)">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Field>
    </Modal>
  )
}
