import { useState } from 'react'
import { ErrorBox, Loading, PageHeader, Badge } from '../components/ui'
import { loadCategories, loadVenues } from '../lib/data'
import { errorMessage, supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'

type Kind = 'categories' | 'venues'

export function ConfigPage() {
  const { data, error, loading, reload } = useAsync(async () => ({ categories: await loadCategories(), venues: await loadVenues() }), [])
  const [err, setErr] = useState<string | null>(null)

  const act = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    setErr(null)
    try {
      must(await fn())
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  if (loading || !data) return <Loading />
  const list = (kind: Kind, title: string, items: { id: string; name: string; active: boolean; sort_order?: number }[]) => (
    <section className="card">
      <h2>{title}</h2>
      <AddRow
        placeholder={kind === 'categories' ? 'Nueva categoría' : 'Nueva pista'}
        onAdd={(name) =>
          act(() =>
            kind === 'categories'
              ? supabase.from('categories').insert({ name, sort_order: items.length + 1 })
              : supabase.from('venues').insert({ name }),
          )
        }
      />
      <ul className="list">
        {items.map((it) => (
          <li key={it.id}>
            <span className="list-main">
              <strong>{it.name}</strong> {!it.active && <Badge tone="warn">Inactiva</Badge>}
            </span>
            <button
              className="btn btn-ghost btn-s"
              onClick={() => {
                const name = prompt('Nuevo nombre', it.name)?.trim()
                if (name) void act(() => supabase.from(kind).update({ name }).eq('id', it.id))
              }}
            >
              Renombrar
            </button>
            <button className="btn btn-ghost btn-s" onClick={() => act(() => supabase.from(kind).update({ active: !it.active }).eq('id', it.id))}>
              {it.active ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <>
      <PageHeader title="Categorías y pistas" subtitle="Las inactivas no aparecen al crear equipos ni horarios, pero se conservan en el historial." />
      <ErrorBox error={error ?? err} />
      <div className="grid-2">
        {list('categories', 'Categorías', data.categories)}
        {list('venues', 'Pistas', data.venues)}
      </div>
    </>
  )
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<void> }) {
  const [v, setV] = useState('')
  return (
    <form
      className="row gap-s"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.trim()) return
        await onAdd(v.trim())
        setV('')
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
      <button className="btn btn-primary btn-s">Añadir</button>
    </form>
  )
}
