import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader } from '../components/ui'
import { loadProfiles } from '../lib/data'
import { fmtDateTime } from '../lib/dates'
import { downloadExcel } from '../lib/excel'
import { DOC_ACCEPT, downloadDocument, uploadDocument } from '../lib/files'
import { errorMessage, supabase } from '../lib/supabase'
import type { DocumentType, LibraryDocument, StaffDocument } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type Tab = 'pendientes' | 'tecnicos' | 'biblioteca' | 'tipos'
interface MissingPlayer {
  player_id: string
  player_name: string
  team_id: string
  team_name: string
  type_id: string
  type_name: string
}
interface MissingStaff {
  user_id: string
  user_name: string
  type_id: string
  type_name: string
  pending: boolean
}

export function DocumentationPage() {
  const { isCoord, staff } = useAuth()
  const isCoach = isCoord || staff.some((s) => s.staff_role !== 'delegado')
  const [tab, setTab] = useState<Tab>('pendientes')
  const tabs: [Tab, string][] = [
    ['pendientes', 'Pendientes'],
    ['tecnicos', isCoord ? 'Documentos de técnicos' : 'Mis documentos'],
    ['biblioteca', 'Biblioteca'],
    ...(isCoord ? ([['tipos', 'Tipos de documento']] as [Tab, string][]) : []),
  ]
  return (
    <>
      <PageHeader title="Documentación" subtitle="Documentos obligatorios, documentación de técnicos y biblioteca general" />
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <section className="card">
        {tab === 'pendientes' && <PendingTab />}
        {tab === 'tecnicos' && <StaffDocsTab />}
        {tab === 'biblioteca' && <LibraryTab canUpload={isCoach} />}
        {tab === 'tipos' && isCoord && <TypesTab />}
      </section>
    </>
  )
}

function PendingTab() {
  const { isCoord, seasonId, seasons } = useAuth()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [team, setTeam] = useState('')
  const { data, error, loading } = useAsync(async () => {
    if (!seasonId) return { players: [] as MissingPlayer[], staff: [] as MissingStaff[] }
    const [p, s] = await Promise.all([
      supabase.rpc('missing_player_documents', { p_season: seasonId }),
      supabase.rpc('missing_staff_documents', { p_season: seasonId }),
    ])
    return { players: must(p) as MissingPlayer[], staff: must(s) as MissingStaff[] }
  }, [seasonId])
  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const teams = [...new Map(data.players.map((m) => [m.team_id, m.team_name])).entries()]
  const rows = data.players.filter((m) => !team || m.team_id === team)
  const season = seasons.find((s) => s.id === seasonId)?.name ?? ''
  return (
    <>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={err} />
      <div className="filters">
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Equipo">
          <option value="">Todos los equipos</option>
          {teams.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <button
          className="btn btn-s"
          disabled={!rows.length}
          onClick={() =>
            void downloadExcel(`documentacion_pendiente_${season.replace('/', '-')}.xlsx`, [
              {
                name: 'Pendientes',
                columns: [
                  { header: 'Equipo', key: 'team_name', width: 24 },
                  { header: 'Jugador', key: 'player_name', width: 30 },
                  { header: 'Documento', key: 'type_name', width: 28 },
                ],
                rows,
              },
            ]).catch((e) => setErr(errorMessage(e)))
          }
        >
          Exportar a Excel
        </button>
        {isCoord && (
          <button
            className="btn btn-s"
            onClick={async () => {
              try {
                const n = must(await supabase.rpc('notify_missing_documents', { p_season: seasonId })) as number
                setMsg(n ? `Aviso enviado a coordinación y a los entrenadores principales (${n} documentos).` : 'No falta documentación.')
              } catch (e) {
                setErr(errorMessage(e))
              }
            }}
          >
            Avisar a los entrenadores
          </button>
        )}
      </div>
      <h3>Jugadores ({rows.length} documentos pendientes)</h3>
      {rows.length === 0 ? (
        <Empty>No falta documentación obligatoria de jugadores.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Equipo</th>
              <th>Jugador</th>
              <th>Falta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.player_id + m.type_id + m.team_id}>
                <td>{m.team_name}</td>
                <td>
                  <Link to={`/jugadores/${m.player_id}`}>{m.player_name}</Link>
                </td>
                <td>{m.type_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>{isCoord ? 'Técnicos' : 'Mis documentos obligatorios'}</h3>
      {data.staff.length === 0 ? (
        <Empty>No falta documentación obligatoria de técnicos.</Empty>
      ) : (
        <ul className="list">
          {data.staff.map((m) => (
            <li key={m.user_id + m.type_id}>
              <span className="list-main">
                <strong>{m.user_name}</strong>
                <span className="muted small">{m.type_name}</span>
              </span>
              {m.pending ? <Badge tone="info">Entregado, pendiente de aprobar</Badge> : <Badge tone="warn">Falta</Badge>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function StaffDocsTab() {
  const { isCoord, profile, seasonId, seasons } = useAuth()
  const [typeId, setTypeId] = useState('')
  const [userId, setUserId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    const [types, docs, profiles] = await Promise.all([
      supabase.from('document_types').select('*').eq('owner', 'tecnico').order('sort_order'),
      supabase.from('staff_documents').select('*').is('deleted_at', null).order('uploaded_at', { ascending: false }),
      loadProfiles(),
    ])
    return { types: must(types) as DocumentType[], docs: must(docs) as StaffDocument[], profiles }
  }, [])
  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const who = (id: string | null) => data.profiles.find((p) => p.id === id)?.full_name ?? '—'
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name ?? ''
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
  const target = isCoord ? userId : profile?.id
  const tone = { pendiente: 'warn', aprobado: 'ok', rechazado: 'danger' } as const
  return (
    <>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <ErrorBox error={err} />
      {!isCoord && <p className="muted small">Los documentos que subas quedan pendientes hasta que coordinación los apruebe. Mientras tanto sigue vigente el anterior.</p>}
      {data.docs.length === 0 ? (
        <Empty>No hay documentos.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {isCoord && <th>Técnico</th>}
              <th>Tipo</th>
              <th>Archivo</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.docs.map((d) => (
              <tr key={d.id}>
                {isCoord && <td>{who(d.user_id)}</td>}
                <td>
                  {typeName(d.type_id)}
                  {d.season_id && <span className="muted small"> · {seasons.find((s) => s.id === d.season_id)?.name}</span>}
                </td>
                <td>
                  {d.file_name}
                  <div className="muted small">{fmtDateTime(d.uploaded_at)}</div>
                </td>
                <td>
                  <Badge tone={tone[d.status]}>{d.status === 'pendiente' ? 'Pendiente' : d.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}</Badge>
                  {d.resolution_note && <div className="muted small">{d.resolution_note}</div>}
                </td>
                <td className="right nowrap">
                  <button className="btn btn-s" onClick={() => void downloadDocument(d.path, d.file_name).catch((e) => setErr(errorMessage(e)))}>
                    Descargar
                  </button>{' '}
                  {isCoord && d.status === 'pendiente' && (
                    <>
                      <button className="btn btn-s btn-primary" onClick={() => void run(async () => must(await supabase.rpc('resolve_staff_document', { p_doc: d.id, p_approve: true })), 'Documento aprobado.')}>
                        Aprobar
                      </button>{' '}
                      <button
                        className="btn btn-s btn-danger"
                        onClick={() => {
                          const note = prompt('Motivo del rechazo (opcional):')
                          if (note !== null) void run(async () => must(await supabase.rpc('resolve_staff_document', { p_doc: d.id, p_approve: false, p_note: note })), 'Documento rechazado.')
                        }}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card pad">
        <h3>{isCoord ? 'Añadir documento de técnico' : 'Enviar documento para aprobación'}</h3>
        <div className="form-grid">
          {isCoord && (
            <Field label="Técnico">
              <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Selecciona…</option>
                {data.profiles
                  .filter((p) => p.active && p.role !== 'coordinadora')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Tipo">
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Selecciona…</option>
              {data.types
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
          disabled={!typeId || !file || !target}
          onClick={() =>
            void run(async () => {
              const t = data.types.find((x) => x.id === typeId)!
              const path = await uploadDocument(`tecnicos/${target}`, file!)
              must(
                await supabase.from('staff_documents').insert({
                  user_id: target,
                  type_id: typeId,
                  season_id: t.per_season ? seasonId : null,
                  path,
                  file_name: file!.name,
                  mime: file!.type || null,
                  size: file!.size,
                }),
              )
              setFile(null)
            }, isCoord ? 'Documento guardado.' : 'Documento enviado. Coordinación lo revisará.')
          }
        >
          {isCoord ? 'Subir' : 'Enviar'}
        </button>
      </div>
    </>
  )
}

function LibraryTab({ canUpload }: { canUpload: boolean }) {
  const { isCoord, profile } = useAuth()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [reserved, setReserved] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    return must(await supabase.from('library_documents').select('*').is('deleted_at', null).order('category').order('title')) as LibraryDocument[]
  }, [])
  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const cats = [...new Set(data.map((d) => d.category))]
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const rows = data.filter((d) => (!cat || d.category === cat) && (!q || norm(`${d.title} ${d.file_name} ${d.category}`).includes(norm(q))))
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  return (
    <>
      <ErrorBox error={err} />
      <div className="filters">
        <input placeholder="Buscar por nombre o categoría" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>No hay documentos en la biblioteca.</Empty>
      ) : (
        <ul className="list">
          {rows.map((d) => (
            <li key={d.id}>
              <span className="list-main">
                <strong>
                  {d.title} {d.reserved && <Badge tone="warn">Solo coordinación</Badge>}
                </strong>
                <span className="muted small">
                  {d.category} · {d.file_name} · {fmtDateTime(d.uploaded_at)}
                </span>
              </span>
              <button className="btn btn-s" onClick={() => void downloadDocument(d.path, d.file_name).catch((e) => setErr(errorMessage(e)))}>
                Descargar
              </button>
              {(isCoord || d.uploaded_by === profile?.id) && (
                <button
                  className="btn btn-s btn-ghost"
                  onClick={() => {
                    if (confirm(`¿Eliminar «${d.title}»? Se podrá recuperar desde la papelera.`))
                      void run(async () => must(await supabase.rpc('trash_document', { p_kind: 'library', p_id: d.id })))
                  }}
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="card pad">
          <h3>Añadir a la biblioteca</h3>
          <div className="form-grid">
            <Field label="Título">
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Categoría">
              <input list="lib-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="lib-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Archivo (máx. 2 MB)">
              <input type="file" accept={DOC_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          {isCoord && (
            <label className="check block">
              <input type="checkbox" checked={reserved} onChange={(e) => setReserved(e.target.checked)} /> Solo visible para coordinación
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim() || !file}
            onClick={() =>
              void run(async () => {
                const path = await uploadDocument('biblioteca', file!)
                must(
                  await supabase
                    .from('library_documents')
                    .insert({ title: title.trim(), category: category.trim() || 'General', reserved, path, file_name: file!.name, mime: file!.type || null, size: file!.size }),
                )
                setTitle('')
                setFile(null)
              })
            }
          >
            Subir
          </button>
        </div>
      )}
    </>
  )
}

function TypesTab() {
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [owner, setOwner] = useState<'jugador' | 'tecnico'>('jugador')
  const { data, error, loading, reload } = useAsync(async () => must(await supabase.from('document_types').select('*').order('owner').order('sort_order')) as DocumentType[], [])
  if (loading || !data) return error ? <ErrorBox error={error} /> : <Loading />
  const update = async (id: string, patch: Partial<DocumentType>) => {
    setErr(null)
    try {
      must(await supabase.from('document_types').update(patch).eq('id', id))
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  return (
    <>
      <ErrorBox error={err} />
      <table className="table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>De</th>
            <th>Obligatorio</th>
            <th>Renovar cada temporada</th>
            <th>Reservado (solo coordinación)</th>
            <th>Activo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.owner === 'jugador' ? 'Jugador' : 'Técnico'}</td>
              {(['required', 'per_season', 'reserved', 'active'] as const).map((k) => (
                <td key={k}>
                  <input
                    type="checkbox"
                    aria-label={`${k} ${t.name}`}
                    checked={t[k]}
                    disabled={k === 'reserved' && t.owner === 'tecnico'}
                    onChange={(e) => void update(t.id, { [k]: e.target.checked })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap-s wrap">
        <input placeholder="Nuevo tipo de documento" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={owner} onChange={(e) => setOwner(e.target.value as 'jugador' | 'tecnico')} aria-label="Titular">
          <option value="jugador">Jugador</option>
          <option value="tecnico">Técnico</option>
        </select>
        <button
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={async () => {
            setErr(null)
            try {
              must(await supabase.from('document_types').insert({ name: name.trim(), owner, sort_order: data.length + 1 }))
              setName('')
              await reload()
            } catch (e) {
              setErr(errorMessage(e))
            }
          }}
        >
          Añadir
        </button>
      </div>
    </>
  )
}
