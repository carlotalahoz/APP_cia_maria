import { useState } from 'react'
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { fmtDateTime } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'

type Kind = 'players' | 'teams' | 'player_documents' | 'library_documents' | 'staff_documents'
interface Item {
  kind: Kind
  id: string
  label: string
  deleted_at: string
  path?: string
}

/** Papelera de la coordinadora: jugadores, equipos y documentos. */
export function TrashPage() {
  const [err, setErr] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    const [p, t, pd, ld, sd] = await Promise.all([
      supabase.from('players').select('id,first_name,last_name,deleted_at').not('deleted_at', 'is', null),
      supabase.from('teams').select('id,name,deleted_at').not('deleted_at', 'is', null),
      supabase.from('player_documents').select('id,file_name,path,deleted_at, players(first_name,last_name)').not('deleted_at', 'is', null),
      supabase.from('library_documents').select('id,title,path,deleted_at').not('deleted_at', 'is', null),
      supabase.from('staff_documents').select('id,file_name,path,deleted_at').not('deleted_at', 'is', null),
    ])
    type PD = { id: string; file_name: string; path: string; deleted_at: string; players: { first_name: string; last_name: string } | null }
    const items: Item[] = [
      ...must(p).map((x) => ({ kind: 'players' as const, id: x.id, label: `Jugador: ${x.first_name} ${x.last_name}`, deleted_at: x.deleted_at! })),
      ...must(t).map((x) => ({ kind: 'teams' as const, id: x.id, label: `Equipo: ${x.name}`, deleted_at: x.deleted_at! })),
      ...(must(pd) as unknown as PD[]).map((x) => ({ kind: 'player_documents' as const, id: x.id, path: x.path, label: `Documento de ${x.players?.first_name ?? ''} ${x.players?.last_name ?? ''}: ${x.file_name}`, deleted_at: x.deleted_at })),
      ...must(ld).map((x) => ({ kind: 'library_documents' as const, id: x.id, path: x.path, label: `Biblioteca: ${x.title}`, deleted_at: x.deleted_at! })),
      ...must(sd).map((x) => ({ kind: 'staff_documents' as const, id: x.id, path: x.path, label: `Documento de técnico: ${x.file_name}`, deleted_at: x.deleted_at! })),
    ]
    return items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const purge = (it: Item) =>
    run(async () => {
      if (it.kind === 'players') must(await supabase.rpc('purge_player', { p_player: it.id }))
      else {
        must(await supabase.from(it.kind).delete().eq('id', it.id))
        if (it.path) await supabase.storage.from('documentos').remove([it.path])
      }
    })

  return (
    <>
      <PageHeader title="Papelera" subtitle="Elementos eliminados. Puedes restaurarlos o borrarlos definitivamente." />
      <ErrorBox error={error ?? err} />
      {loading || !data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>La papelera está vacía.</Empty>
      ) : (
        <ul className="list card">
          {data.map((it) => (
            <li key={it.kind + it.id}>
              <span className="list-main">
                <strong>{it.label}</strong>
                <span className="muted small">Eliminado el {fmtDateTime(it.deleted_at)}</span>
              </span>
              <button className="btn btn-s" onClick={() => void run(async () => must(await supabase.from(it.kind).update({ deleted_at: null }).eq('id', it.id)))}>
                Restaurar
              </button>
              {it.kind !== 'teams' && (
                <button
                  className="btn btn-danger btn-s"
                  onClick={() => {
                    if (confirm('Se borrará de forma permanente. ¿Continuar?') && confirm('Segunda confirmación: esta acción no se puede deshacer.')) void purge(it)
                  }}
                >
                  Borrar definitivamente
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
