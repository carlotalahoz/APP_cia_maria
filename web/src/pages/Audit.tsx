import { useState } from 'react'
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { loadProfiles } from '../lib/data'
import { fmtDateTime } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'

interface AuditRow {
  id: number
  at: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

const TABLES: Record<string, string> = {
  players: 'Jugadores',
  attendance: 'Asistencia',
  teams: 'Equipos',
  enrollments: 'Altas en equipo',
  team_staff: 'Cuerpo técnico',
  profiles: 'Usuarios',
  seasons: 'Temporadas',
  events: 'Sesiones',
  training_slots: 'Horarios',
}
const ACTIONS: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Borrado' }
const PAGE = 50

function changed(r: AuditRow): string {
  if (!r.old_data || !r.new_data) return ''
  return Object.keys(r.new_data)
    .filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
    .map((k) => `${k}: ${String(r.old_data![k] ?? '—')} → ${String(r.new_data![k] ?? '—')}`)
    .join('; ')
}

export function AuditPage() {
  const [table, setTable] = useState('')
  const [page, setPage] = useState(0)
  const { data, error, loading } = useAsync(async () => {
    let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (table) q = q.eq('table_name', table)
    const [rows, profiles] = await Promise.all([q, loadProfiles()])
    return { rows: must(rows) as AuditRow[], profiles }
  }, [table, page])

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Quién cambió qué y cuándo." />
      <div className="filters">
        <select value={table} onChange={(e) => { setTable(e.target.value); setPage(0) }}>
          <option value="">Todo</option>
          {Object.entries(TABLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox error={error} />
      {loading || !data ? (
        <Loading />
      ) : data.rows.length === 0 ? (
        <Empty>Sin registros.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.at)}</td>
                <td>{data.profiles.find((p) => p.id === r.user_id)?.full_name ?? 'Sistema'}</td>
                <td>
                  {ACTIONS[r.action] ?? r.action} · {TABLES[r.table_name] ?? r.table_name}
                </td>
                <td className="small">{changed(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row gap-s">
        <button className="btn btn-s" disabled={page === 0} onClick={() => setPage(page - 1)}>
          ← Más recientes
        </button>
        <button className="btn btn-s" disabled={(data?.rows.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>
          Más antiguos →
        </button>
      </div>
    </>
  )
}
