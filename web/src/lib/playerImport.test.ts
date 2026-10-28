import { describe, expect, it } from 'vitest'
import { mapImportRows, parseDate } from './playerImport'
import { validateDocument } from './docRules'

describe('importación de jugadores', () => {
  it('interpreta fechas en distintos formatos', () => {
    expect(parseDate('05/03/2015')).toBe('2015-03-05')
    expect(parseDate('2015-3-5')).toBe('2015-03-05')
    expect(parseDate(new Date(Date.UTC(2015, 2, 5)))).toBe('2015-03-05')
    expect(parseDate(42068)).toBe('2015-03-05')
    expect(parseDate('31/02/2015')).toBeNull()
    expect(parseDate('mañana')).toBeNull()
  })

  it('mapea cabeceras sin tildes y valida obligatorios', () => {
    const rows = mapImportRows([
      { nombre: 'Lucía', APELLIDOS: 'García', 'Fecha nacimiento': '12/03/2015', Dorsal: 7, telefono: '600000000' },
      { Nombre: 'Sin', 'Fecha de nacimiento': 'x', Dorsal: 120 },
    ])
    expect(rows[0]).toMatchObject({ line: 2, dorsal: 7, errors: [], data: { first_name: 'Lucía', last_name: 'García', birth_date: '2015-03-12', phone: '600000000' } })
    expect(rows[1].errors).toEqual(['Fecha de nacimiento no válida', 'Dorsal no válido', 'Faltan los apellidos'])
  })
})

describe('validación de documentos', () => {
  it('acepta PDF/JPG/Excel hasta 2 MB', () => {
    expect(validateDocument({ name: 'ficha.pdf', size: 1000, type: 'application/pdf' })).toBeNull()
    expect(validateDocument({ name: 'foto.JPG', size: 1000, type: '' })).toBeNull()
    expect(validateDocument({ name: 'a.docx', size: 1000, type: 'application/msword' })).toMatch(/formato/)
    expect(validateDocument({ name: 'b.pdf', size: 3 * 1024 * 1024, type: 'application/pdf' })).toMatch(/2 MB/)
  })
})
