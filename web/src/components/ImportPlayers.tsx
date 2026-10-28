import { useState } from 'react'
import { downloadExcel, readExcel } from '../lib/excel'
import { IMPORT_COLUMNS, mapImportRows, type ImportRow } from '../lib/playerImport'
import { errorMessage, supabase } from '../lib/supabase'
import { must } from '../lib/useAsync'
import { Badge, ErrorBox, Modal } from './ui'

interface Dup {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  teams: string | null
}
type Decision = 'crear' | 'omitir' | `vincular:${string}`
interface Row extends ImportRow {
  dups: Dup[]
  decision: Decision
  result?: string
}

/** Importación de jugadores desde Excel con vista previa, validación y detección de duplicados. */
export function ImportPlayers({ teamId, onClose, onDone }: { teamId: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const template = () =>
    void downloadExcel('plantilla_importacion_jugadores.xlsx', [
      {
        name: 'Jugadores',
        columns: IMPORT_COLUMNS.map(([h]) => ({ header: h, key: h, width: 16 })),
        rows: [{ Nombre: 'Lucía', Apellidos: 'Ejemplo Pérez', 'Fecha de nacimiento': '12/03/2015', Dorsal: 7 }],
      },
    ])

  const load = async (file: File) => {
    setErr(null)
    setBusy(true)
    try {
      const mapped = mapImportRows(await readExcel(file))
      if (!mapped.length) throw new Error('El archivo no tiene filas de jugadores.')
      const out: Row[] = []
      for (const r of mapped) {
        let dups: Dup[] = []
        if (!r.errors.length) {
          dups = must(
            await supabase.rpc('find_player_duplicates', { p_first: r.data.first_name, p_last: r.data.last_name, p_birth: r.data.birth_date }),
          ) as Dup[]
        }
        out.push({ ...r, dups, decision: r.errors.length ? 'omitir' : dups.length ? `vincular:${dups[0].id}` : 'crear' })
      }
      setRows(out)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!rows) return
    setBusy(true)
    const next = [...rows]
    for (const r of next) {
      if (r.decision === 'omitir' || r.result) continue
      try {
        if (r.decision === 'crear') {
          must(await supabase.rpc('create_player_in_team', { p_team: teamId, p_player: r.data, p_dorsal: r.dorsal, p_kind: 'plantilla' }))
          r.result = 'Creado'
        } else {
          must(await supabase.rpc('link_player_to_team', { p_team: teamId, p_player: r.decision.slice(9), p_kind: 'plantilla', p_dorsal: r.dorsal }))
          r.result = 'Vinculado'
        }
      } catch (e) {
        r.result = `Error: ${errorMessage(e)}`
      }
      setRows([...next])
    }
    setBusy(false)
    setDone(true)
  }

  const valid = rows?.filter((r) => r.decision !== 'omitir').length ?? 0
  return (
    <Modal
      title="Importar jugadores desde Excel"
      onClose={() => (done ? onDone() : onClose())}
      wide
      footer={
        done ? (
          <button className="btn btn-primary" onClick={onDone}>Cerrar</button>
        ) : (
          rows && (
            <button className="btn btn-primary" disabled={busy || !valid} onClick={() => void confirmImport()}>
              Confirmar importación ({valid})
            </button>
          )
        )
      }
    >
      <p className="muted small">
        Primera fila con cabeceras. Obligatorias: Nombre, Apellidos y Fecha de nacimiento. Antes de guardar se revisan duplicados: si el jugador ya existe se vincula su ficha en vez de crear otra.{' '}
        <button className="link" onClick={template}>Descargar plantilla</button>
      </p>
      {!rows && <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />}
      <ErrorBox error={err} />
      {busy && !rows && <p className="muted">Leyendo archivo…</p>}
      {rows && (
        <table className="table">
          <thead>
            <tr><th>Fila</th><th>Jugador</th><th>Nacimiento</th><th>Dorsal</th><th>Revisión</th><th>Acción</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.line}>
                <td>{r.line}</td>
                <td>{r.data.first_name} {r.data.last_name}</td>
                <td>{r.data.birth_date ?? '—'}</td>
                <td>{r.dorsal ?? ''}</td>
                <td>
                  {r.errors.length ? <Badge tone="danger">{r.errors.join(' · ')}</Badge> : r.dups.length ? <Badge tone="warn">Posible duplicado</Badge> : <Badge tone="ok">Nuevo</Badge>}
                  {r.result && <div className="small">{r.result}</div>}
                </td>
                <td>
                  <select
                    value={r.decision}
                    disabled={!!r.errors.length || done}
                    aria-label={`Acción fila ${r.line}`}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, decision: e.target.value as Decision } : x)))}
                  >
                    {!r.errors.length && <option value="crear">Crear ficha nueva</option>}
                    {r.dups.map((d) => (
                      <option key={d.id} value={`vincular:${d.id}`}>
                        Vincular a {d.first_name} {d.last_name} ({d.birth_date}{d.teams ? ` · ${d.teams}` : ''})
                      </option>
                    ))}
                    <option value="omitir">Omitir</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
