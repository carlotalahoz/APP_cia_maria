import { describe, expect, it } from 'vitest'
import { computeStats, isEventComplete } from './attendance'

describe('computeStats', () => {
  it('excluye "Sin registrar" del denominador', () => {
    const s = computeStats(['asistencia', 'sin_registrar', 'sin_registrar', 'injustificada'])
    expect(s.registered).toBe(2)
    expect(s.pending).toBe(2)
    expect(s.percentage).toBe(50)
    expect(s.pendingPercentage).toBe(50)
  })

  it('cuenta el retraso como asistencia completa', () => {
    const s = computeStats(['retraso', 'asistencia'])
    expect(s.percentage).toBe(100)
    expect(s.late).toBe(1)
  })

  it('las ausencias justificadas reducen el porcentaje', () => {
    const s = computeStats(['asistencia', 'lesion', 'viaje', 'medico', 'estudios'])
    expect(s.percentage).toBe(20)
    expect(s.justified).toBe(4)
    expect(s.unjustified).toBe(0)
  })

  it('sin registros devuelve porcentaje nulo', () => {
    expect(computeStats(['sin_registrar']).percentage).toBeNull()
    expect(computeStats([]).pendingPercentage).toBeNull()
  })
})

describe('isEventComplete', () => {
  it('solo completo si nadie queda sin registrar', () => {
    expect(isEventComplete(['asistencia', 'lesion'])).toBe(true)
    expect(isEventComplete(['asistencia', 'sin_registrar'])).toBe(false)
    expect(isEventComplete([])).toBe(false)
  })
})
