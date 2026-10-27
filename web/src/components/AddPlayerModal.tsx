import { useState } from 'react'
import { fmtDate } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { KIND_LABEL, type EnrollmentKind, type EventRow } from '../lib/types'
import { PlayerForm, validatePlayer, type PlayerDraft } from './PlayerForm'
import { ErrorBox, Field, Modal } from './ui'

interface Duplicate {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  teams: string | null
}

/**
 * Alta de jugador en un equipo: primero busca posibles duplicados para reutilizar la ficha existente;
 * si no existe, crea una ficha nueva. Los ayudantes/delegados solo pueden incorporar jugadores que suben.
 */
export function AddPlayerModal({
  teamId,
  canCreate,
  events,
  onClose,
  onDone,
}: {
  teamId: string
  canCreate: boolean
  events: EventRow[]
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'search' | 'results' | 'create'>('search')
  const [draft, setDraft] = useState<PlayerDraft>({})
  const [dups, setDups] = useState<Duplicate[]>([])
  const [kind, setKind] = useState<EnrollmentKind>(canCreate ? 'plantilla' : 'sube_habitual')
  const [dorsal, setDorsal] = useState('')
  const [endDate, setEndDate] = useState('')
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const search = async () => {
    setError(null)
    if (!draft.first_name?.trim() || !draft.last_name?.trim()) return setError('Indica nombre y apellidos.')
    const { data, error } = await supabase.rpc('find_player_duplicates', {
      p_first: draft.first_name,
      p_last: draft.last_name,
      p_birth: draft.birth_date || null,
    })
    if (error) return setError(error.message)
    setDups((data ?? []) as Duplicate[])
    setStep('results')
  }

  const enrollmentOptions = () => (
    <div className="form-grid">
      <Field label="Tipo de vinculación">
        <select value={kind} onChange={(e) => setKind(e.target.value as EnrollmentKind)}>
          {canCreate && <option value="plantilla">{KIND_LABEL.plantilla}</option>}
          <option value="sube_habitual">{KIND_LABEL.sube_habitual}</option>
          <option value="sube_puntual">{KIND_LABEL.sube_puntual}</option>
        </select>
      </Field>
      <Field label="Dorsal">
        <input type="number" min={0} max={99} value={dorsal} onChange={(e) => setDorsal(e.target.value)} />
      </Field>
      {kind === 'sube_habitual' && (
        <Field label="Hasta (opcional)">
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      )}
      {kind === 'sube_puntual' && (
        <Field label="Evento">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {new Date(ev.starts_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )

  const link = async (playerId: string) => {
    if (kind === 'sube_puntual' && !eventId) return setError('Selecciona el evento.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('link_player_to_team', {
      p_team: teamId,
      p_player: playerId,
      p_kind: kind,
      p_dorsal: dorsal ? Number(dorsal) : null,
      p_event: kind === 'sube_puntual' ? eventId : null,
      p_end: kind === 'sube_habitual' && endDate ? endDate : null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  const create = async () => {
    const v = validatePlayer(draft)
    if (v) return setError(v)
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('create_player_in_team', {
        p_team: teamId,
        p_player: draft,
        p_dorsal: dorsal ? Number(dorsal) : null,
        p_kind: 'plantilla',
      })
      if (error) throw error
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Añadir jugador al equipo"
      onClose={onClose}
      wide={step === 'create'}
      footer={
        step === 'search' ? (
          <button className="btn btn-primary" onClick={search}>
            Buscar ficha existente
          </button>
        ) : step === 'results' ? (
          <>
            <button className="btn btn-ghost" onClick={() => setStep('search')}>
              Volver
            </button>
            {canCreate && (
              <button className="btn btn-primary" onClick={() => { setKind('plantilla'); setStep('create') }}>
                No es ninguno: crear ficha nueva
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setStep('results')}>
              Volver
            </button>
            <button className="btn btn-primary" onClick={create} disabled={busy}>
              Crear y añadir
            </button>
          </>
        )
      }
    >
      <ErrorBox error={error} />
      {step === 'search' && (
        <>
          <p className="muted">Busca primero al jugador para no crear fichas duplicadas.</p>
          <div className="form-grid">
            <Field label="Nombre">
              <input value={draft.first_name ?? ''} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} autoFocus />
            </Field>
            <Field label="Apellidos">
              <input value={draft.last_name ?? ''} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
            </Field>
            <Field label="Fecha de nacimiento">
              <input type="date" value={draft.birth_date ?? ''} onChange={(e) => setDraft({ ...draft, birth_date: e.target.value })} />
            </Field>
          </div>
        </>
      )}
      {step === 'results' && (
        <>
          {dups.length === 0 ? (
            <p>No se han encontrado fichas con esos datos.{!canCreate && ' Solo el entrenador principal o coordinación pueden crear fichas nuevas.'}</p>
          ) : (
            <>
              <p className="muted">Posibles coincidencias. Vincula la ficha existente en lugar de crear otra:</p>
              {enrollmentOptions()}
              <ul className="list">
                {dups.map((d) => (
                  <li key={d.id}>
                    <span className="list-main">
                      <strong>
                        {d.first_name} {d.last_name}
                      </strong>
                      <span className="muted">
                        {fmtDate(d.birth_date)} · {d.teams ?? 'Sin equipo'}
                      </span>
                    </span>
                    <button className="btn btn-s" onClick={() => link(d.id)} disabled={busy}>
                      Vincular
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {step === 'create' && (
        <>
          <Field label="Dorsal">
            <input type="number" min={0} max={99} value={dorsal} onChange={(e) => setDorsal(e.target.value)} />
          </Field>
          <PlayerForm value={draft} onChange={setDraft} />
          <p className="muted small">Coordinación recibirá un aviso del alta.</p>
        </>
      )}
    </Modal>
  )
}
