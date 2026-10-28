import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { EVENT_TYPE_LABEL, type EventType, type Team, type Venue } from '../lib/types'
import { must } from '../lib/useAsync'
import { fmtDateTime } from '../lib/dates'
import { fromLocalInput } from './EventBits'
import { ErrorBox, Field, Modal } from './ui'

interface Conflict {
  event_id: string
  team: string
  starts_at: string
  ends_at: string
}

/** Aviso (no bloqueante) de coincidencias de pista. */
export function useVenueConflicts(venue: string, start: string, end: string, exclude?: string) {
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  useEffect(() => {
    if (!venue || !start || !end || end <= start) {
      setConflicts([])
      return
    }
    let alive = true
    void supabase
      .rpc('venue_conflicts', { p_venue: venue, p_starts: fromLocalInput(start), p_ends: fromLocalInput(end), p_exclude: exclude ?? null })
      .then(({ data }) => alive && setConflicts((data ?? []) as Conflict[]))
    return () => {
      alive = false
    }
  }, [venue, start, end, exclude])
  return conflicts
}

export function ConflictWarning({ conflicts }: { conflicts: Conflict[] }) {
  if (!conflicts.length) return null
  return (
    <div className="alert alert-warn">
      La pista ya está ocupada en ese horario:
      <ul>
        {conflicts.map((c) => (
          <li key={c.event_id}>
            {c.team} · {fmtDateTime(c.starts_at)}
          </li>
        ))}
      </ul>
      Puedes guardar igualmente.
    </div>
  )
}

/** Nueva actividad o partido. La coordinadora la confirma directamente; el entrenador la propone. */
export function ActivityForm({
  teams,
  venues,
  initialType = 'entrenamiento',
  initialTeam,
  onClose,
  onSaved,
}: {
  teams: Team[]
  venues: Venue[]
  initialType?: EventType
  initialTeam?: string
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { isCoord } = useAuth()
  const [team, setTeam] = useState(initialTeam ?? teams[0]?.id ?? '')
  const [type, setType] = useState<EventType>(initialType)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [venue, setVenue] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<'oficial' | 'amistoso'>('oficial')
  const [school, setSchool] = useState(false)
  const [competition, setCompetition] = useState('')
  const [matchday, setMatchday] = useState('')
  const [opponent, setOpponent] = useState('')
  const [home, setHome] = useState(true)
  const [awayLocation, setAwayLocation] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const conflicts = useVenueConflicts(venue, start, end)

  const onStart = (v: string) => {
    setStart(v)
    if (v && (!end || end <= v)) {
      const d = new Date(new Date(v).getTime() + 90 * 60000)
      const pad = (n: number) => String(n).padStart(2, '0')
      setEnd(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
    }
  }

  const save = async () => {
    setErr(null)
    if (!team || !start || !end) return setErr('Indica equipo, inicio y fin.')
    if (end <= start) return setErr('La hora de fin debe ser posterior al inicio.')
    if (type === 'partido' && !opponent.trim()) return setErr('Indica el equipo rival.')
    setBusy(true)
    try {
      const id = must(
        await supabase.rpc('propose_event', {
          p_team: team,
          p_type: type,
          p_starts: fromLocalInput(start),
          p_ends: fromLocalInput(end),
          p_venue: venue || null,
          p_title: title || null,
          p_notes: notes || null,
          p_match:
            type === 'partido'
              ? { kind, school, competition, matchday, opponent, home, away_location: home ? null : awayLocation }
              : null,
        }),
      ) as string
      onSaved(id)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={type === 'partido' ? (isCoord ? 'Nuevo partido' : 'Proponer partido') : isCoord ? 'Nueva actividad' : 'Proponer actividad'}
      onClose={onClose}
      wide
      footer={
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {isCoord ? 'Guardar' : 'Enviar a coordinación'}
        </button>
      }
    >
      {!isCoord && <p className="muted small">Quedará pendiente hasta que coordinación la apruebe.</p>}
      <div className="form-grid">
        <Field label="Equipo">
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
              <option key={t} value={t}>
                {t === 'entrenamiento' ? 'Entrenamiento extraordinario' : EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {type !== 'partido' && (
          <Field label="Título (opcional)">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p. ej. Torneo de Navidad" />
          </Field>
        )}
        <Field label="Inicio">
          <input type="datetime-local" value={start} onChange={(e) => onStart(e.target.value)} />
        </Field>
        <Field label="Fin">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Pista">
          <select value={venue} onChange={(e) => setVenue(e.target.value)}>
            <option value="">{type === 'partido' ? 'Fuera / otra instalación' : 'Sin pista'}</option>
            {venues
              .filter((v) => v.active)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {type === 'partido' && (
        <div className="form-grid">
          <Field label="Rival">
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} />
          </Field>
          <Field label="Tipo de partido">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'oficial' | 'amistoso')}>
              <option value="oficial">Oficial</option>
              <option value="amistoso">Amistoso</option>
            </select>
          </Field>
          <Field label="Competición">
            <input value={competition} onChange={(e) => setCompetition(e.target.value)} />
          </Field>
          <Field label="Jornada">
            <input value={matchday} onChange={(e) => setMatchday(e.target.value)} />
          </Field>
          <Field label="Campo">
            <select value={home ? 'local' : 'visitante'} onChange={(e) => setHome(e.target.value === 'local')}>
              <option value="local">Local</option>
              <option value="visitante">Visitante</option>
            </select>
          </Field>
          {!home && (
            <Field label="Instalación del rival">
              <input value={awayLocation} onChange={(e) => setAwayLocation(e.target.value)} />
            </Field>
          )}
          <label className="check">
            <input type="checkbox" checked={school} onChange={(e) => setSchool(e.target.checked)} /> Competición escolar (con acta)
          </label>
        </div>
      )}
      <Field label="Observaciones">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ConflictWarning conflicts={conflicts} />
      <ErrorBox error={err} />
    </Modal>
  )
}
