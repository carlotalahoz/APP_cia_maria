import type { Player } from '../lib/types'
import { Field } from './ui'

export type PlayerDraft = Partial<Omit<Player, 'id' | 'active' | 'deleted_at' | 'created_at' | 'updated_at'>>

const SECTIONS: { title: string; fields: [keyof PlayerDraft, string, string?][] }[] = [
  {
    title: 'Identificación',
    fields: [
      ['first_name', 'Nombre *'],
      ['last_name', 'Apellidos *'],
      ['birth_date', 'Fecha de nacimiento *', 'date'],
      ['dni', 'DNI'],
      ['gir', 'GIR'],
      ['license_number', 'Licencia federativa'],
      ['position', 'Posición'],
      ['size', 'Talla'],
    ],
  },
  {
    title: 'Contacto',
    fields: [
      ['phone', 'Teléfono', 'tel'],
      ['email', 'Correo electrónico', 'email'],
      ['address', 'Dirección'],
      ['city', 'Localidad'],
      ['postal_code', 'Código postal'],
    ],
  },
  {
    title: 'Familia',
    fields: [
      ['father_name', 'Nombre del padre'],
      ['father_phone', 'Teléfono del padre', 'tel'],
      ['mother_name', 'Nombre de la madre'],
      ['mother_phone', 'Teléfono de la madre', 'tel'],
    ],
  },
]

export function PlayerForm({
  value,
  onChange,
  readOnly,
}: {
  value: PlayerDraft
  onChange: (v: PlayerDraft) => void
  readOnly?: boolean
}) {
  const set = (k: keyof PlayerDraft, v: string) => onChange({ ...value, [k]: v === '' ? null : v })
  return (
    <div className="player-form">
      {SECTIONS.map((s) => (
        <fieldset key={s.title}>
          <legend>{s.title}</legend>
          <div className="form-grid">
            {s.fields.map(([k, label, type]) => (
              <Field key={k} label={label}>
                <input
                  type={type ?? 'text'}
                  value={(value[k] as string | null | undefined) ?? ''}
                  onChange={(e) => set(k, e.target.value)}
                  readOnly={readOnly}
                  required={label.endsWith('*')}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend>Salud</legend>
        <Field label="Alergias">
          <textarea rows={2} value={value.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} readOnly={readOnly} />
        </Field>
      </fieldset>
    </div>
  )
}

export function validatePlayer(p: PlayerDraft): string | null {
  if (!p.first_name?.trim() || !p.last_name?.trim() || !p.birth_date) {
    return 'Nombre, apellidos y fecha de nacimiento son obligatorios.'
  }
  return null
}
