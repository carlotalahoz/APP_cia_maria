import { useState } from 'react'
import { hhmm } from '../lib/data'
import { errorMessage, supabase } from '../lib/supabase'
import {
  BRANCH_LABEL,
  STAFF_LABEL,
  WEEKDAYS,
  type Category,
  type Profile,
  type StaffRole,
  type Team,
  type TeamStaff,
  type TrainingSlot,
  type Venue,
} from '../lib/types'
import { ErrorBox, Field, Modal } from './ui'

interface SlotDraft {
  id?: string
  weekday: number
  start_time: string
  end_time: string
  venue_id: string | null
}

/** Alta/edición de equipo por la coordinadora: datos, horario fijo y cuerpo técnico. */
export function TeamForm({
  seasonId,
  team,
  slots,
  staff,
  categories,
  venues,
  profiles,
  onClose,
  onSaved,
}: {
  seasonId: string
  team?: Team
  slots?: TrainingSlot[]
  staff?: TeamStaff[]
  categories: Category[]
  venues: Venue[]
  profiles: Profile[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [code, setCode] = useState(team?.code ?? '')
  const [categoryId, setCategoryId] = useState(team?.category_id ?? categories.find((c) => c.active)?.id ?? '')
  const [branch, setBranch] = useState<Team['branch']>(team?.branch ?? 'femenino')
  const [slotDrafts, setSlotDrafts] = useState<SlotDraft[]>(
    (slots ?? []).map((s) => ({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })),
  )
  const [staffDrafts, setStaffDrafts] = useState<{ user_id: string; staff_role: StaffRole }[]>(
    (staff ?? []).map((s) => ({ user_id: s.user_id, staff_role: s.staff_role })),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim() || !code.trim() || !categoryId) return setError('Nombre, código y categoría son obligatorios.')
    if (code.trim().length > 4) return setError('El código tiene como máximo 4 letras.')
    if (staffDrafts.filter((s) => s.staff_role === 'principal').length === 0)
      return setError('Asigna al menos un entrenador principal.')
    setBusy(true)
    setError(null)
    try {
      const row = { season_id: seasonId, name: name.trim(), code: code.trim().toUpperCase(), category_id: categoryId, branch }
      let id = team?.id
      if (id) {
        const { error } = await supabase.from('teams').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('teams').insert(row).select('id').single()
        if (error) throw error
        id = data.id as string
      }
      // horarios
      const keep = slotDrafts.filter((s) => s.id).map((s) => s.id!)
      const removed = (slots ?? []).filter((s) => !keep.includes(s.id)).map((s) => s.id)
      if (removed.length) {
        const { error } = await supabase.from('training_slots').delete().in('id', removed)
        if (error) throw error
      }
      for (const s of slotDrafts) {
        const payload = { team_id: id, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time, venue_id: s.venue_id || null }
        const { error } = s.id
          ? await supabase.from('training_slots').update(payload).eq('id', s.id)
          : await supabase.from('training_slots').insert(payload)
        if (error) throw error
      }
      // cuerpo técnico
      const { error: delErr } = await supabase.from('team_staff').delete().eq('team_id', id)
      if (delErr) throw delErr
      const uniq = staffDrafts.filter((s, i, arr) => s.user_id && arr.findIndex((x) => x.user_id === s.user_id) === i)
      if (uniq.length) {
        const { error } = await supabase.from('team_staff').insert(uniq.map((s) => ({ ...s, team_id: id })))
        if (error) throw error
      }
      onSaved(id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const activeProfiles = profiles.filter((p) => p.active)

  return (
    <Modal
      title={team ? 'Editar equipo' : 'Nuevo equipo'}
      onClose={onClose}
      wide
      footer={
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          Guardar
        </button>
      }
    >
      <ErrorBox error={error} />
      <div className="form-grid">
        <Field label="Nombre *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alevín 1 Femenino" />
        </Field>
        <Field label="Código (máx. 4) *">
          <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ALF1" />
        </Field>
        <Field label="Categoría *">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories
              .filter((c) => c.active || c.id === team?.category_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Rama *">
          <select value={branch} onChange={(e) => setBranch(e.target.value as Team['branch'])}>
            {Object.entries(BRANCH_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <h3>Horario fijo de entrenamientos</h3>
      {slotDrafts.map((s, i) => (
        <div className="row gap-s wrap slot-row" key={i}>
          <select value={s.weekday} onChange={(e) => setSlotDrafts(slotDrafts.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}>
            {WEEKDAYS.slice(1).map((d, k) => (
              <option key={d} value={k + 1}>
                {d}
              </option>
            ))}
          </select>
          <input type="time" value={s.start_time} onChange={(e) => setSlotDrafts(slotDrafts.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} />
          <input type="time" value={s.end_time} onChange={(e) => setSlotDrafts(slotDrafts.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} />
          <select value={s.venue_id ?? ''} onChange={(e) => setSlotDrafts(slotDrafts.map((x, j) => (j === i ? { ...x, venue_id: e.target.value || null } : x)))}>
            <option value="">Sin pista</option>
            {venues.filter((v) => v.active || v.id === s.venue_id).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-s" onClick={() => setSlotDrafts(slotDrafts.filter((_, j) => j !== i))}>
            Quitar
          </button>
        </div>
      ))}
      <button
        className="btn btn-s"
        onClick={() => setSlotDrafts([...slotDrafts, { weekday: 1, start_time: '17:30', end_time: '19:00', venue_id: venues[0]?.id ?? null }])}
      >
        + Añadir día
      </button>

      <h3>Cuerpo técnico</h3>
      {staffDrafts.map((s, i) => (
        <div className="row gap-s wrap slot-row" key={i}>
          <select value={s.user_id} onChange={(e) => setStaffDrafts(staffDrafts.map((x, j) => (j === i ? { ...x, user_id: e.target.value } : x)))}>
            <option value="">Selecciona…</option>
            {activeProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.email})
              </option>
            ))}
          </select>
          <select value={s.staff_role} onChange={(e) => setStaffDrafts(staffDrafts.map((x, j) => (j === i ? { ...x, staff_role: e.target.value as StaffRole } : x)))}>
            {Object.entries(STAFF_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-s" onClick={() => setStaffDrafts(staffDrafts.filter((_, j) => j !== i))}>
            Quitar
          </button>
        </div>
      ))}
      <button className="btn btn-s" onClick={() => setStaffDrafts([...staffDrafts, { user_id: '', staff_role: staffDrafts.length ? 'ayudante' : 'principal' }])}>
        + Añadir técnico
      </button>
    </Modal>
  )
}
