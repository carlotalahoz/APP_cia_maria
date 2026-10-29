import type { MatchRow } from './types'

export type Outcome = 'G' | 'P' | 'E'

export function outcome(m: Pick<MatchRow, 'score_for' | 'score_against'>): Outcome | null {
  if (m.score_for == null || m.score_against == null) return null
  return m.score_for > m.score_against ? 'G' : m.score_for < m.score_against ? 'P' : 'E'
}

export interface TeamRecord {
  played: number
  won: number
  lost: number
  drawn: number
  pointsFor: number
  pointsAgainst: number
  diff: number
}

/** Estadísticas de resultados de un conjunto de partidos (solo cuentan los que tienen marcador). */
export function teamRecord(matches: Pick<MatchRow, 'score_for' | 'score_against'>[]): TeamRecord {
  const r: TeamRecord = { played: 0, won: 0, lost: 0, drawn: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 }
  for (const m of matches) {
    const o = outcome(m)
    if (!o) continue
    r.played++
    if (o === 'G') r.won++
    else if (o === 'P') r.lost++
    else r.drawn++
    r.pointsFor += m.score_for!
    r.pointsAgainst += m.score_against!
  }
  r.diff = r.pointsFor - r.pointsAgainst
  return r
}

export const OUTCOME_LABEL: Record<Outcome, string> = { G: 'Ganado', P: 'Perdido', E: 'Empatado' }

export const normalizeRival = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
