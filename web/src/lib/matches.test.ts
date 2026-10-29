import { describe, expect, it } from 'vitest'
import { normalizeRival, outcome, teamRecord } from './matches'

describe('resultados de partidos', () => {
  it('clasifica ganado, perdido y empatado', () => {
    expect(outcome({ score_for: 40, score_against: 30 })).toBe('G')
    expect(outcome({ score_for: 20, score_against: 30 })).toBe('P')
    expect(outcome({ score_for: 30, score_against: 30 })).toBe('E')
    expect(outcome({ score_for: null, score_against: null })).toBeNull()
  })

  it('calcula estadísticas ignorando partidos sin marcador', () => {
    const r = teamRecord([
      { score_for: 34, score_against: 28 },
      { score_for: 22, score_against: 30 },
      { score_for: 58, score_against: 58 },
      { score_for: null, score_against: null },
    ])
    expect(r).toEqual({ played: 3, won: 1, lost: 1, drawn: 1, pointsFor: 114, pointsAgainst: 116, diff: -2 })
  })

  it('normaliza el nombre del rival para el historial', () => {
    expect(normalizeRival('  CB  Santa Ána ')).toBe(normalizeRival('cb santa ana'))
  })
})
