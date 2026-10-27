import { useState } from 'react'
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { fmtDateTime } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'

interface Item {
  kind: 'players' | 'teams'
  id: string
  label: string
  deleted_at: string
}

export function TrashPage() {
  const [err, setErr] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    const [p, t] = await Promise.all([
      supabase.from('players').select('id,first_name,last_name,deleted_at').not('deleted_at', 'is', null),
      supabase.from('teams').select('id,name,deleted_at').not('deleted_at', 'is', null),
    ])
    const items: Item[] = [
      ...must(p).map((x) => ({ kind: 'players' as const, id: x.id, label: `Jugador: ${x.first_name} ${x.last_name}`, deleted_at: x.deleted_at! })),
      ...must(t).map((x) => ({ kind: 'teams' as const, id: x.id, label: `Equipo: ${x.name}`, deleted_at: x.deleted_at! })),
    ]
    return items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
  }, [])

  const run = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    setErr(null)
    try {
      must(await fn())
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

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
              <button className="btn btn-s" onClick={() => run(() => supabase.from(it.kind).update({ deleted_at: null }).eq('id', it.id))}>
                Restaurar
              </button>
              {it.kind === 'players' && (
                <button
                  className="btn btn-danger btn-s"
                  onClick={() => {
                    if (confirm('Se borrará la ficha y todo su historial de forma permanente. ¿Continuar?'))
                      void run(() => supabase.rpc('purge_player', { p_player: it.id }))
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
