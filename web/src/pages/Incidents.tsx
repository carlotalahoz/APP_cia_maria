import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader } from '../components/ui'
import { loadProfiles } from '../lib/data'
import { fmtDateTime } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import type { Incident } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

/** Comunicar incidencia (cuerpo técnico) y gestión por coordinación. */
export function IncidentsPage() {
  const { isCoord } = useAuth()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, profiles] = await Promise.all([supabase.from('incidents').select('*').order('created_at', { ascending: false }), loadProfiles()])
    return { rows: must(rows) as Incident[], profiles }
  }, [])
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null)
    setMsg(null)
    try {
      await fn()
      setMsg(done)
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  return (
    <>
      <PageHeader title={isCoord ? 'Incidencias' : 'Comunicar incidencia'} subtitle="Fallos o problemas de la aplicación; coordinación recibe un aviso" />
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={error ?? err} />
      {!isCoord && (
        <section className="card">
          <h2>Nueva incidencia</h2>
          <Field label="Asunto">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Descripción">
            <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() =>
              void run(async () => {
                const { data: u } = await supabase.auth.getUser()
                must(await supabase.from('incidents').insert({ user_id: u.user!.id, title: title.trim(), description: desc.trim() || null }))
                setTitle('')
                setDesc('')
              }, 'Incidencia enviada a coordinación.')
            }
          >
            Enviar
          </button>
        </section>
      )}
      {loading || !data ? (
        <Loading />
      ) : data.rows.length === 0 ? (
        <Empty>No hay incidencias.</Empty>
      ) : (
        <ul className="list card">
          {data.rows.map((i) => (
            <li key={i.id}>
              <span className="list-main">
                <strong>{i.title}</strong>
                {i.description && <span>{i.description}</span>}
                <span className="muted small">
                  {data.profiles.find((p) => p.id === i.user_id)?.full_name} · {fmtDateTime(i.created_at)}
                  {i.resolution_note && ` · Respuesta: ${i.resolution_note}`}
                </span>
              </span>
              <Badge tone={i.status === 'abierta' ? 'warn' : 'ok'}>{i.status === 'abierta' ? 'Abierta' : 'Resuelta'}</Badge>
              {isCoord && i.status === 'abierta' && (
                <button
                  className="btn btn-s btn-primary"
                  onClick={() => {
                    const note = prompt('Respuesta o solución (opcional):')
                    if (note !== null) void run(async () => must(await supabase.rpc('resolve_incident', { p_incident: i.id, p_note: note })), 'Incidencia resuelta. Se ha avisado al usuario.')
                  }}
                >
                  Marcar resuelta
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
