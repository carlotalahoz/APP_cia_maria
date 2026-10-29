import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { DOC_ACCEPT, downloadDocument, downloadZip, uploadDocument } from '../lib/files'
import { fmtDateTime } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import type { DocumentType, PlayerDocument } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'
import { Badge, ErrorBox, Field, Loading } from './ui'

/** Pestaña Documentos de la ficha del jugador. */
export function PlayerDocuments({ playerId, playerName, canManage }: { playerId: string; playerName: string; canManage: boolean }) {
  const { seasonId, seasons, isCoord } = useAuth()
  const [typeId, setTypeId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loading, reload } = useAsync(async () => {
    const [types, docs] = await Promise.all([
      supabase.from('document_types').select('*').eq('owner', 'jugador').order('sort_order'),
      supabase.from('player_documents').select('*').eq('player_id', playerId).is('deleted_at', null).order('uploaded_at', { ascending: false }),
    ])
    return { types: must(types) as DocumentType[], docs: must(docs) as PlayerDocument[] }
  }, [playerId])

  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const seasonName = (id: string | null) => seasons.find((s) => s.id === id)?.name ?? '—'
  const visibleTypes = data.types.filter((t) => isCoord || !t.reserved)
  const missing = visibleTypes.filter(
    (t) => t.required && t.active && !data.docs.some((d) => d.type_id === t.id && (!t.per_season || d.season_id === seasonId)),
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

  return (
    <>
      {missing.length > 0 ? (
        <div className="alert alert-warn">
          Faltan documentos obligatorios {seasonName(seasonId) !== '—' && `(${seasonName(seasonId)})`}: {missing.map((t) => t.name).join(', ')}.
        </div>
      ) : (
        <div className="alert alert-ok">Documentación obligatoria completa.</div>
      )}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={err} />
      {data.docs.length === 0 ? (
        <p className="muted">No hay documentos.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Archivo</th>
              <th>Temporada</th>
              <th>Subido</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.docs.map((d) => {
              const t = data.types.find((x) => x.id === d.type_id)
              const stale = t?.per_season && d.season_id !== seasonId
              return (
                <tr key={d.id}>
                  <td>
                    {t?.name} {t?.reserved && <Badge tone="warn">Reservado</Badge>} {stale && <Badge>Temporada anterior</Badge>}
                  </td>
                  <td>{d.file_name}</td>
                  <td>{seasonName(d.season_id)}</td>
                  <td className="small">{fmtDateTime(d.uploaded_at)}</td>
                  <td className="right nowrap">
                    <button className="btn btn-s" onClick={() => void downloadDocument(d.path, d.file_name).catch((e) => setErr(errorMessage(e)))}>
                      Descargar
                    </button>{' '}
                    {canManage && (
                      <button
                        className="btn btn-s btn-ghost"
                        onClick={() => {
                          if (!confirm(`¿Eliminar ${d.file_name}? Se podrá recuperar desde la papelera.`)) return
                          void run(async () => must(await supabase.rpc('trash_document', { p_kind: 'player', p_id: d.id })), 'Documento enviado a la papelera.')
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="row gap-s wrap">
        {data.docs.length > 0 && (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const skipped = await downloadZip(
                  data.docs.map((d) => ({ path: d.path, file_name: d.file_name, folder: data.types.find((t) => t.id === d.type_id)?.name })),
                  `${playerName.replace(/\s+/g, '_')}_documentos.zip`,
                )
                if (skipped.length) throw new Error(`ZIP descargado. No se han podido incluir: ${skipped.join(', ')}`)
              }, 'ZIP descargado.')
            }
          >
            Descargar todo (ZIP)
          </button>
        )}
      </div>
      {canManage && (
        <div className="card pad">
          <h3>Añadir documento</h3>
          <div className="form-grid">
            <Field label="Tipo">
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">Selecciona…</option>
                {visibleTypes
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.required ? ' (obligatorio)' : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Archivo (PDF, JPG, PNG o Excel; máx. 2 MB)">
              <input type="file" accept={DOC_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          <button
            className="btn btn-primary"
            disabled={!typeId || !file || busy}
            onClick={() =>
              void run(async () => {
                const t = data.types.find((x) => x.id === typeId)!
                const path = await uploadDocument(`jugadores/${playerId}`, file!)
                must(
                  await supabase.from('player_documents').insert({
                    player_id: playerId,
                    type_id: typeId,
                    season_id: t.per_season ? seasonId : null,
                    path,
                    file_name: file!.name,
                    mime: file!.type || null,
                    size: file!.size,
                  }),
                )
                setFile(null)
              }, 'Documento guardado.')
            }
          >
            Subir
          </button>
        </div>
      )}
    </>
  )
}
