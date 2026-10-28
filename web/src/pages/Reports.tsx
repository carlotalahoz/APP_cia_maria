import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { BarChart } from '../components/BarChart'
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader } from '../components/ui'
import { computeStats, formatPct, STATUS_INFO, STATUS_ORDER } from '../lib/attendance'
import { loadTeams } from '../lib/data'
import { fmtDate, fmtShort, isoDate, startOfWeek } from '../lib/dates'
import { downloadExcel } from '../lib/excel'
import { outcome, OUTCOME_LABEL, teamRecord } from '../lib/matches'
import { errorMessage, supabase } from '../lib/supabase'
import type { AttendanceRow, AttendanceStatus, Enrollment, EventRow, MatchRow, Player, Team, TeamStaff } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type Tab = 'asistencia' | 'resultados' | 'general' | 'jugador'
type Group = 'semana' | 'mes' | 'temporada'
type Ev = EventRow & { matches: MatchRow | null }

const PERSONAL_COLUMNS: [string, keyof Player][] = [
  ['Nombre', 'first_name'], ['Apellidos', 'last_name'], ['Fecha de nacimiento', 'birth_date'], ['DNI', 'dni'], ['GIR', 'gir'],
  ['Teléfono', 'phone'], ['Email', 'email'], ['Dirección', 'address'], ['Localidad', 'city'], ['CP', 'postal_code'], ['Talla', 'size'],
  ['Posición', 'position'], ['Alergias', 'allergies'], ['Padre', 'father_name'], ['Teléfono padre', 'father_phone'],
  ['Madre', 'mother_name'], ['Teléfono madre', 'mother_phone'], ['Licencia', 'license_number'],
]

/** Exporta la plantilla con datos personales (solo coordinadora y principal; se registra y avisa a coordinación). */
export async function exportPersonalExcel(team: Pick<Team, 'id' | 'name' | 'code'>) {
  must(await supabase.rpc('log_export', { p_kind: 'plantilla_datos_personales', p_team: team.id, p_personal: true }))
  const enr = must(await supabase.from('enrollments').select('kind,dorsal,end_date, players(*)').eq('team_id', team.id)) as unknown as (Enrollment & { players: Player | null })[]
  const today = isoDate(new Date())
  const rows = enr
    .filter((e) => e.players && e.players.active && !e.players.deleted_at && (!e.end_date || e.end_date >= today))
    .map((e) => ({ dorsal: e.dorsal, tipo: e.kind, ...e.players }))
  await downloadExcel(`plantilla_${team.code}_datos_personales.xlsx`, [
    {
      name: team.name,
      columns: [{ header: 'Dorsal', key: 'dorsal', width: 8 }, ...PERSONAL_COLUMNS.map(([h, k]) => ({ header: h, key: k as string, width: 18 })), { header: 'Tipo', key: 'tipo' }],
      rows,
    },
  ])
}

function bucketKey(iso: string, g: Group) {
  const d = new Date(iso)
  if (g === 'semana') return isoDate(startOfWeek(d))
  if (g === 'mes') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return 'Temporada'
}
function bucketLabel(k: string, g: Group) {
  if (g === 'semana') return fmtDate(k).slice(0, 5)
  if (g === 'mes') return new Date(k + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  return k
}

export function ReportsPage() {
  const { isCoord, staff, seasonId, seasons } = useAuth()
  const [params, setParams] = useSearchParams()
  const playerParam = params.get('jugador')
  const season = seasons.find((s) => s.id === seasonId)
  const [tab, setTab] = useState<Tab>(playerParam ? 'jugador' : (params.get('tipo') as Tab) || 'asistencia')
  const [teamId, setTeamId] = useState('')
  const [from, setFrom] = useState(season?.start_date ?? isoDate(new Date(new Date().getFullYear(), 0, 1)))
  const [to, setTo] = useState(isoDate(new Date()))
  const [group, setGroup] = useState<Group>('mes')
  const [err, setErr] = useState<string | null>(null)
  const myIds = staff.map((s) => s.team_id)

  const { data, error, loading } = useAsync(async () => {
    const all = await loadTeams(seasonId)
    const teams = isCoord ? all : all.filter((t) => myIds.includes(t.id))
    const ids = teams.map((t) => t.id)
    if (!ids.length) return { teams, events: [] as Ev[], attendance: [] as AttendanceRow[], enrollments: [] as (Enrollment & { players: Player | null })[], staffRows: [] as TeamStaff[] }
    const fromIso = new Date(from + 'T00:00:00').toISOString()
    const toIso = new Date(to + 'T23:59:59').toISOString()
    const events = must(
      await supabase.from('events').select('*, matches(*)').in('team_id', ids).gte('starts_at', fromIso).lte('starts_at', toIso).in('status', ['programado', 'aplazado', 'finalizado']).order('starts_at'),
    ) as Ev[]
    const evIds = events.map((e) => e.id)
    const attendance: AttendanceRow[] = []
    for (let i = 0; i < evIds.length; i += 150) {
      attendance.push(...(must(await supabase.from('attendance').select('*').in('event_id', evIds.slice(i, i + 150))) as AttendanceRow[]))
    }
    const enrollments = must(await supabase.from('enrollments').select('*, players(id,first_name,last_name,active,deleted_at)').in('team_id', ids)) as (Enrollment & { players: Player | null })[]
    const staffRows = must(await supabase.from('team_staff').select('*').in('team_id', ids)) as TeamStaff[]
    return { teams, events, attendance, enrollments, staffRows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isCoord, staff, from, to])

  const tabs: [Tab, string][] = [
    ['asistencia', 'Asistencia'],
    ['resultados', 'Resultados'],
    ...(isCoord ? ([['general', 'Informe general']] as [Tab, string][]) : []),
    ...(playerParam ? ([['jugador', 'Jugador']] as [Tab, string][]) : []),
  ]
  const team = data?.teams.find((t) => t.id === teamId)
  const evs = (data?.events ?? []).filter((e) => !teamId || e.team_id === teamId)
  const attOf = (evId: string) => (data?.attendance ?? []).filter((a) => a.event_id === evId)

  // Asistencia por jugador
  const trainings = evs.filter((e) => e.type !== 'partido')
  const players = new Map<string, { name: string; statuses: AttendanceStatus[]; notes: string[] }>()
  for (const ev of trainings)
    for (const a of attOf(ev.id)) {
      const enr = data!.enrollments.find((e) => e.player_id === a.player_id && e.team_id === ev.team_id)
      if (!enr?.players) continue
      const p = players.get(a.player_id) ?? { name: `${enr.players.last_name}, ${enr.players.first_name}`, statuses: [], notes: [] }
      p.statuses.push(a.status)
      if (a.notes) p.notes.push(a.notes)
      players.set(a.player_id, p)
    }
  const playerRows = [...players.entries()]
    .map(([id, p]) => ({ id, name: p.name, ...computeStats(p.statuses), absences: p.statuses.filter((s) => s !== 'asistencia' && s !== 'retraso' && s !== 'sin_registrar').length, notes: p.notes.length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const teamStats = computeStats(trainings.flatMap((e) => attOf(e.id).map((a) => a.status)))
  const buckets = new Map<string, AttendanceStatus[]>()
  for (const e of trainings) {
    const k = bucketKey(e.starts_at, group)
    buckets.set(k, [...(buckets.get(k) ?? []), ...attOf(e.id).map((a) => a.status)])
  }
  const bucketData = [...buckets.entries()].sort().map(([k, s]) => ({ label: bucketLabel(k, group), value: computeStats(s).percentage }))
  const matches = evs.filter((e) => e.type === 'partido' && e.matches)
  const finished = matches.filter((e) => e.status === 'finalizado')
  const record = teamRecord(finished.map((e) => e.matches!))

  const exportAttendance = () =>
    void (async () => {
      setErr(null)
      try {
        await supabase.rpc('log_export', { p_kind: 'asistencia', p_team: teamId || null, p_personal: false })
        await downloadExcel(`asistencia_${team?.code ?? 'todos'}_${from}_${to}.xlsx`, [
          {
            name: 'Por jugador',
            columns: [
              { header: 'Jugador', key: 'name', width: 30 },
              { header: '% asistencia', key: 'pct', width: 12 },
              { header: 'Asistencias', key: 'attended' },
              { header: 'Retrasos', key: 'late' },
              { header: 'Justificadas', key: 'justified' },
              { header: 'Sin justificar', key: 'unjustified' },
              ...STATUS_ORDER.filter((s) => !['sin_registrar', 'asistencia'].includes(s)).map((s) => ({ header: STATUS_INFO[s].label, key: s })),
            ],
            rows: playerRows.map((r) => ({ ...r, pct: r.percentage == null ? '' : Math.round(r.percentage), ...r.byStatus })),
          },
          { name: 'Evolución', columns: [{ header: 'Periodo', key: 'label' }, { header: '% asistencia', key: 'value' }], rows: bucketData.map((b) => ({ ...b, value: b.value == null ? '' : Math.round(b.value) })) },
        ])
      } catch (e) {
        setErr(errorMessage(e))
      }
    })()

  const exportResults = () =>
    void (async () => {
      setErr(null)
      try {
        must(await supabase.rpc('log_export', { p_kind: 'resultados', p_team: teamId || null, p_personal: false }))
        await downloadExcel(`resultados_${team?.code ?? 'todos'}_${from}_${to}.xlsx`, [
          {
            name: 'Resultados',
            columns: [
              { header: 'Fecha', key: 'fecha', width: 12 },
              { header: 'Equipo', key: 'equipo', width: 22 },
              { header: 'Rival', key: 'rival', width: 24 },
              { header: 'Campo', key: 'campo' },
              { header: 'Competición', key: 'comp', width: 24 },
              { header: 'A favor', key: 'pf' },
              { header: 'En contra', key: 'pc' },
              { header: 'Resultado', key: 'res' },
            ],
            rows: matches.map((e) => ({
              fecha: fmtDate(e.starts_at),
              equipo: data!.teams.find((t) => t.id === e.team_id)?.name,
              rival: e.matches!.opponent,
              campo: e.matches!.home ? 'Local' : 'Visitante',
              comp: e.matches!.competition ?? (e.matches!.kind === 'amistoso' ? 'Amistoso' : ''),
              pf: e.matches!.score_for,
              pc: e.matches!.score_against,
              res: outcome(e.matches!) ? OUTCOME_LABEL[outcome(e.matches!)!] : EVENT_PENDING,
            })),
          },
        ])
      } catch (e) {
        setErr(errorMessage(e))
      }
    })()

  return (
    <>
      <PageHeader
        title="Informes"
        subtitle={`Temporada ${season?.name ?? ''}`}
        actions={
          <button className="btn no-print" onClick={() => window.print()}>
            Descargar PDF / imprimir
          </button>
        }
      />
      <div className="tabs no-print" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab !== 'jugador' && (
        <div className="filters no-print">
          {tab !== 'general' && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Equipo">
              <option value="">{isCoord ? 'Todos los equipos' : 'Todos mis equipos'}</option>
              {(data?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <Field label="Desde">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {season && (
            <button className="btn btn-s" onClick={() => { setFrom(season.start_date); setTo(season.end_date) }}>
              Toda la temporada
            </button>
          )}
        </div>
      )}
      <p className="print-only">
        AD Compañía de María · Informe de {tabs.find((t) => t[0] === tab)?.[1].toLowerCase()} · {team?.name ?? 'Todos los equipos'} · {fmtDate(from)} – {fmtDate(to)}
      </p>
      <ErrorBox error={error ?? err} />
      {tab === 'jugador' && playerParam ? (
        <PlayerReport playerId={playerParam} onClose={() => { params.delete('jugador'); setParams(params); setTab('asistencia') }} />
      ) : loading || !data ? (
        <Loading />
      ) : data.teams.length === 0 ? (
        <Empty>No tienes equipos en esta temporada.</Empty>
      ) : tab === 'asistencia' ? (
        <>
          <div className="stats">
            <div className="stat"><span>{formatPct(teamStats.percentage)}</span>Asistencia</div>
            <div className="stat"><span>{trainings.length}</span>Sesiones</div>
            <div className="stat"><span>{teamStats.late}</span>Retrasos</div>
            <div className="stat"><span>{teamStats.justified}</span>Justificadas</div>
            <div className="stat"><span>{teamStats.unjustified}</span>Sin justificar</div>
            <div className="stat"><span>{teamStats.pending}</span>Sin registrar</div>
          </div>
          <section className="card">
            <div className="row between wrap">
              <h2>Evolución de la asistencia</h2>
              <select value={group} onChange={(e) => setGroup(e.target.value as Group)} aria-label="Agrupar" className="no-print">
                <option value="semana">Por semanas</option>
                <option value="mes">Por meses</option>
                <option value="temporada">Temporada</option>
              </select>
            </div>
            <BarChart data={bucketData} max={100} unit="%" />
          </section>
          <section className="card">
            <div className="row between wrap">
              <h2>Por jugador</h2>
              <button className="btn btn-s no-print" onClick={exportAttendance}>Exportar a Excel</button>
            </div>
            {playerRows.length === 0 ? (
              <Empty>No hay asistencias registradas en el periodo.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Jugador</th><th>%</th><th>Asist.</th><th>Retrasos</th>
                    {(['lesion', 'viaje', 'estudios', 'medico', 'injustificada'] as AttendanceStatus[]).map((s) => <th key={s}>{STATUS_INFO[s].label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {playerRows.map((r) => (
                    <tr key={r.id}>
                      <td><Link to={`/informes?jugador=${r.id}`}>{r.name}</Link></td>
                      <td>{formatPct(r.percentage)}</td>
                      <td>{r.attended}</td>
                      <td>{r.late}</td>
                      {(['lesion', 'viaje', 'estudios', 'medico', 'injustificada'] as AttendanceStatus[]).map((s) => <td key={s}>{r.byStatus[s] ?? 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card">
            <h2>Más ausencias</h2>
            <ol>
              {[...playerRows].sort((a, b) => b.absences - a.absences).filter((r) => r.absences > 0).slice(0, 5).map((r) => (
                <li key={r.id}>{r.name}: {r.absences} ausencias ({r.unjustified} sin justificar)</li>
              ))}
            </ol>
          </section>
        </>
      ) : tab === 'resultados' ? (
        <>
          <div className="stats">
            <div className="stat"><span>{record.played}</span>Jugados</div>
            <div className="stat"><span>{record.won}</span>Ganados</div>
            <div className="stat"><span>{record.lost}</span>Perdidos</div>
            <div className="stat"><span>{record.drawn}</span>Empatados</div>
            <div className="stat"><span>{record.pointsFor}-{record.pointsAgainst}</span>Puntos</div>
            <div className="stat"><span>{record.diff > 0 ? `+${record.diff}` : record.diff}</span>Diferencia</div>
          </div>
          <section className="card">
            <h2>Diferencia de puntos por partido</h2>
            <BarChart data={finished.map((e) => ({ label: fmtDate(e.starts_at).slice(0, 5), value: e.matches!.score_for! - e.matches!.score_against! }))} />
          </section>
          <section className="card">
            <div className="row between wrap">
              <h2>Partidos</h2>
              <button className="btn btn-s no-print" onClick={exportResults}>Exportar a Excel</button>
            </div>
            {matches.length === 0 ? <Empty>No hay partidos en el periodo.</Empty> : (
              <table className="table">
                <thead><tr><th>Fecha</th><th>Equipo</th><th>Rival</th><th>Competición</th><th>Resultado</th></tr></thead>
                <tbody>
                  {matches.map((e) => {
                    const o = outcome(e.matches!)
                    return (
                      <tr key={e.id}>
                        <td>{fmtShort(e.starts_at)}</td>
                        <td>{data.teams.find((t) => t.id === e.team_id)?.name}</td>
                        <td><Link to={`/partidos/${e.id}`}>{e.matches!.home ? 'vs' : '@'} {e.matches!.opponent}</Link></td>
                        <td>{e.matches!.competition ?? (e.matches!.kind === 'amistoso' ? 'Amistoso' : '—')}</td>
                        <td>{o ? <>{e.matches!.score_for}-{e.matches!.score_against} <Badge tone={o === 'G' ? 'ok' : o === 'P' ? 'danger' : 'neutral'}>{OUTCOME_LABEL[o]}</Badge></> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <GeneralReport data={data} from={from} to={to} setErr={setErr} />
      )}
    </>
  )
}

const EVENT_PENDING = 'Pendiente'

function GeneralReport({
  data,
  from,
  to,
  setErr,
}: {
  data: { teams: Team[]; events: Ev[]; attendance: AttendanceRow[]; enrollments: (Enrollment & { players: Player | null })[]; staffRows: TeamStaff[] }
  from: string
  to: string
  setErr: (e: string | null) => void
}) {
  const today = isoDate(new Date())
  const rows = data.teams.map((t) => {
    const evs = data.events.filter((e) => e.team_id === t.id)
    const st = computeStats(evs.filter((e) => e.type !== 'partido').flatMap((e) => data.attendance.filter((a) => a.event_id === e.id).map((a) => a.status)))
    const rec = teamRecord(evs.filter((e) => e.type === 'partido' && e.status === 'finalizado' && e.matches).map((e) => e.matches!))
    const players = new Set(data.enrollments.filter((e) => e.team_id === t.id && e.kind === 'plantilla' && (!e.end_date || e.end_date >= today) && e.players?.active).map((e) => e.player_id)).size
    return { t, players, staff: data.staffRows.filter((s) => s.team_id === t.id).length, sessions: evs.filter((e) => e.type !== 'partido').length, pct: st.percentage, rec }
  })
  const exportAll = async () => {
    setErr(null)
    try {
      must(await supabase.rpc('log_export', { p_kind: 'informe_general', p_team: null, p_personal: false }))
      await downloadExcel(`informe_general_${from}_${to}.xlsx`, [
        {
          name: 'Equipos',
          columns: [
            { header: 'Equipo', key: 'equipo', width: 24 }, { header: 'Jugadores', key: 'players' }, { header: 'Técnicos', key: 'staff' },
            { header: 'Sesiones', key: 'sessions' }, { header: '% asistencia', key: 'pct' }, { header: 'PJ', key: 'pj' }, { header: 'G', key: 'g' },
            { header: 'P', key: 'p' }, { header: 'E', key: 'e' }, { header: 'PF', key: 'pf' }, { header: 'PC', key: 'pc' },
          ],
          rows: rows.map((r) => ({ equipo: r.t.name, players: r.players, staff: r.staff, sessions: r.sessions, pct: r.pct == null ? '' : Math.round(r.pct), pj: r.rec.played, g: r.rec.won, p: r.rec.lost, e: r.rec.drawn, pf: r.rec.pointsFor, pc: r.rec.pointsAgainst })),
        },
      ])
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  const exportPersonal = async () => {
    setErr(null)
    try {
      must(await supabase.rpc('log_export', { p_kind: 'exportacion_global', p_team: null, p_personal: true }))
      const players = must(await supabase.from('players').select('*').is('deleted_at', null).order('last_name')) as Player[]
      const enr = must(await supabase.from('enrollments').select('player_id,kind,dorsal,end_date,team_id')) as Enrollment[]
      await downloadExcel(`exportacion_global_${today}.xlsx`, [
        {
          name: 'Jugadores',
          columns: [...PERSONAL_COLUMNS.map(([h, k]) => ({ header: h, key: k as string, width: 18 })), { header: 'Equipos', key: 'equipos', width: 30 }, { header: 'Activo', key: 'activo' }],
          rows: players.map((p) => ({ ...p, activo: p.active ? 'Sí' : 'No', equipos: enr.filter((e) => e.player_id === p.id && (!e.end_date || e.end_date >= today)).map((e) => data.teams.find((t) => t.id === e.team_id)?.name).filter(Boolean).join(', ') })),
        },
        { name: 'Equipos', columns: [{ header: 'Código', key: 'code' }, { header: 'Equipo', key: 'name', width: 26 }, { header: 'Rama', key: 'branch' }], rows: data.teams },
      ])
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  return (
    <>
      <section className="card">
        <div className="row between wrap">
          <h2>Equipos de la agrupación</h2>
          <span className="row gap-s no-print">
            <button className="btn btn-s" onClick={() => void exportAll()}>Exportar a Excel</button>
            <button className="btn btn-s" onClick={() => void exportPersonal()}>Exportación global (datos personales)</button>
          </span>
        </div>
        <table className="table">
          <thead><tr><th>Equipo</th><th>Jugadores</th><th>Técnicos</th><th>Sesiones</th><th>% asistencia</th><th>PJ</th><th>G</th><th>P</th><th>E</th><th>PF-PC</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id}>
                <td>{r.t.name}</td><td>{r.players}</td><td>{r.staff}</td><td>{r.sessions}</td><td>{formatPct(r.pct)}</td>
                <td>{r.rec.played}</td><td>{r.rec.won}</td><td>{r.rec.lost}</td><td>{r.rec.drawn}</td><td>{r.rec.pointsFor}-{r.rec.pointsAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Asistencia por equipo</h2>
        <BarChart data={rows.map((r) => ({ label: r.t.code, value: r.pct }))} max={100} unit="%" />
      </section>
    </>
  )
}

function PlayerReport({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { data, error, loading } = useAsync(async () => {
    const player = must(await supabase.from('players').select('id,first_name,last_name,birth_date').eq('id', playerId).single()) as Player
    const enr = must(await supabase.from('enrollments').select('*, teams(name, seasons(name))').eq('player_id', playerId).order('start_date')) as (Enrollment & { teams: { name: string; seasons: { name: string } | null } | null })[]
    const att = must(await supabase.from('attendance').select('status, notes, events(starts_at,type,status)').eq('player_id', playerId)) as unknown as { status: AttendanceStatus; notes: string | null; events: Pick<EventRow, 'starts_at' | 'type' | 'status'> | null }[]
    return { player, enr, att: att.filter((a) => a.events && a.events.status !== 'cancelado') }
  }, [playerId])
  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const st = computeStats(data.att.filter((a) => a.events!.type !== 'partido').map((a) => a.status))
  const matchesPlayed = data.att.filter((a) => a.events!.type === 'partido' && (a.status === 'asistencia' || a.status === 'retraso')).length
  return (
    <>
      <div className="row between wrap">
        <h2>
          {data.player.first_name} {data.player.last_name} <span className="muted small">· nacido el {fmtDate(data.player.birth_date)}</span>
        </h2>
        <button className="btn btn-s no-print" onClick={onClose}>Cerrar informe</button>
      </div>
      <div className="stats">
        <div className="stat"><span>{formatPct(st.percentage)}</span>Asistencia</div>
        <div className="stat"><span>{st.attended}</span>Asistencias</div>
        <div className="stat"><span>{st.late}</span>Retrasos</div>
        <div className="stat"><span>{st.justified}</span>Justificadas</div>
        <div className="stat"><span>{st.unjustified}</span>Sin justificar</div>
        <div className="stat"><span>{matchesPlayed}</span>Partidos jugados</div>
      </div>
      <section className="card">
        <h3>Ausencias por motivo</h3>
        <div className="chips">
          {STATUS_ORDER.filter((s) => !['sin_registrar', 'asistencia'].includes(s)).map((s) => (
            <span key={s} className={`chip st-${s}`}>{STATUS_INFO[s].label}: {st.byStatus[s] ?? 0}</span>
          ))}
        </div>
        <h3>Equipos y temporadas</h3>
        <ul className="list">
          {data.enr.map((e) => (
            <li key={e.id}>
              <span className="list-main">
                <strong>{e.teams?.name} · {e.teams?.seasons?.name}</strong>
                <span className="muted small">{fmtDate(e.start_date)} – {e.end_date ? fmtDate(e.end_date) : 'actualidad'} · {e.kind.replace('_', ' ')}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
