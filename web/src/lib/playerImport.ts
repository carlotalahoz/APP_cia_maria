/** Columnas reconocidas al importar jugadores desde Excel (cabecera → campo). */
export const IMPORT_COLUMNS: [string, string][] = [
  ['Nombre', 'first_name'],
  ['Apellidos', 'last_name'],
  ['Fecha de nacimiento', 'birth_date'],
  ['Dorsal', 'dorsal'],
  ['DNI', 'dni'],
  ['GIR', 'gir'],
  ['Teléfono', 'phone'],
  ['Email', 'email'],
  ['Dirección', 'address'],
  ['Localidad', 'city'],
  ['CP', 'postal_code'],
  ['Talla', 'size'],
  ['Posición', 'position'],
  ['Alergias', 'allergies'],
  ['Padre', 'father_name'],
  ['Teléfono padre', 'father_phone'],
  ['Madre', 'mother_name'],
  ['Teléfono madre', 'mother_phone'],
  ['Licencia', 'license_number'],
]

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const BY_HEADER = new Map(IMPORT_COLUMNS.map(([h, k]) => [norm(h), k]))
BY_HEADER.set(norm('Fecha nacimiento'), 'birth_date')
BY_HEADER.set(norm('Nacimiento'), 'birth_date')

/** Convierte Date, "dd/mm/aaaa", "aaaa-mm-dd" o número de serie de Excel a ISO (aaaa-mm-dd). */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return parseDate(new Date(Math.round((v - 25569) * 86400000)))
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    return valid(y, +m[2], +m[1])
  }
  return null
}

function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface ImportRow {
  line: number
  data: Record<string, string>
  dorsal: number | null
  errors: string[]
}

/** Normaliza filas leídas del Excel y valida los campos obligatorios (nombre, apellidos, nacimiento). */
export function mapImportRows(raw: Record<string, unknown>[]): ImportRow[] {
  return raw.map((r, i) => {
    const data: Record<string, string> = {}
    let dorsal: number | null = null
    const errors: string[] = []
    for (const [h, v] of Object.entries(r)) {
      const key = BY_HEADER.get(norm(h))
      if (!key || v === null || v === undefined) continue
      if (key === 'birth_date') {
        const d = parseDate(v)
        if (d) data.birth_date = d
        else errors.push('Fecha de nacimiento no válida')
      } else if (key === 'dorsal') {
        const n = Number(v)
        if (Number.isInteger(n) && n >= 0 && n <= 99) dorsal = n
        else errors.push('Dorsal no válido')
      } else {
        data[key] = String(v).trim()
      }
    }
    if (!data.first_name) errors.push('Falta el nombre')
    if (!data.last_name) errors.push('Faltan los apellidos')
    if (!data.birth_date && !errors.includes('Fecha de nacimiento no válida')) errors.push('Falta la fecha de nacimiento')
    return { line: i + 2, data, dorsal, errors }
  })
}
