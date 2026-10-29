import { useState } from 'react'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { fmtDateTime } from '../lib/dates'
import { saveBlob } from '../lib/files'
import { errorMessage, supabase } from '../lib/supabase'
import type { BackupRow } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

const KIND: Record<BackupRow['kind'], string> = { automatica: 'Automática', manual: 'Manual', previa_restauracion: 'Previa a restaurar' }

export function BackupsPage() {
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loading, reload } = useAsync(
    async () =>
      must(await supabase.from('backups').select('id,created_at,created_by,kind,status,counts,error,restored_at').order('created_at', { ascending: false })) as BackupRow[],
    [],
  )
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      await fn()
      setMsg(done)
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const last = data?.find((b) => b.status === 'ok')
  const total = (b: BackupRow) => Object.values(b.counts ?? {}).reduce((a, n) => a + n, 0)

  return (
    <>
      <PageHeader
        title="Copias de seguridad"
        subtitle="Copia automática diaria (se guardan las 30 últimas) y copias manuales"
        actions={
          <button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => must(await supabase.rpc('create_backup', { p_kind: 'manual' })), 'Copia creada.')}>
            Crear copia ahora
          </button>
        }
      />
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={error ?? err} />
      {last ? (
        <div className="alert alert-ok">
          Última copia correcta: {fmtDateTime(last.created_at)} ({KIND[last.kind].toLowerCase()}, {total(last)} registros).
        </div>
      ) : (
        !loading && <div className="alert alert-warn">Todavía no hay ninguna copia correcta.</div>
      )}
      <p className="muted small">
        Incluye todos los datos de la agrupación (temporadas, equipos, jugadores, asistencia, partidos, documentos…). Los archivos adjuntos y las cuentas de usuario no
        se incluyen; se recomienda además activar las copias del proveedor (Supabase) al publicar la aplicación.
      </p>
      {loading || !data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>No hay copias.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Registros</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id}>
                <td>
                  {fmtDateTime(b.created_at)}
                  {b.restored_at && <div className="muted small">Restaurada el {fmtDateTime(b.restored_at)}</div>}
                </td>
                <td>{KIND[b.kind]}</td>
                <td>{b.status === 'ok' ? <Badge tone="ok">Correcta</Badge> : <Badge tone="danger">Error: {b.error}</Badge>}</td>
                <td>{b.status === 'ok' ? total(b) : '—'}</td>
                <td className="right nowrap">
                  {b.status === 'ok' && (
                    <>
                      <button
                        className="btn btn-s"
                        onClick={() =>
                          void run(async () => {
                            const row = must(await supabase.from('backups').select('created_at,data').eq('id', b.id).single()) as { created_at: string; data: unknown }
                            saveBlob(new Blob([JSON.stringify(row.data)], { type: 'application/json' }), `copia_${row.created_at.slice(0, 16).replace(/[:T]/g, '-')}.json`)
                          }, 'Copia descargada.')
                        }
                      >
                        Descargar
                      </button>{' '}
                      <button
                        className="btn btn-s btn-danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !confirm(
                              `¿Restaurar la copia del ${fmtDateTime(b.created_at)}?\n\nSe sustituirán TODOS los datos actuales por los de esa copia. Antes se guardará automáticamente una copia del estado actual para poder volver atrás.`,
                            )
                          )
                            return
                          if (prompt('Escribe RESTAURAR para confirmar') !== 'RESTAURAR') return
                          void run(async () => must(await supabase.rpc('restore_backup', { p_backup: b.id })), 'Copia restaurada. Se ha guardado una copia previa del estado anterior.')
                        }}
                      >
                        Restaurar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
