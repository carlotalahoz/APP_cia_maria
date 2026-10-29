import type { AttendanceStatus } from './types'

export const STATUS_INFO: Record<
  AttendanceStatus,
  { label: string; short: string; counts: boolean | null; justified: boolean | null }
> = {
  sin_registrar: { label: 'Sin registrar', short: '·', counts: null, justified: null },
  asistencia: { label: 'Asistencia', short: 'A', counts: true, justified: null },
  retraso: { label: 'Asistido con retraso', short: 'R', counts: true, justified: null },
  lesion: { label: 'Lesión', short: 'L', counts: false, justified: true },
  viaje: { label: 'Viaje', short: 'V', counts: false, justified: true },
  estudios: { label: 'Estudios', short: 'E', counts: false, justified: true },
  medico: { label: 'Médico', short: 'M', counts: false, justified: true },
  injustificada: { label: 'Ausencia sin justificar', short: 'X', counts: false, justified: false },
}

export const STATUS_ORDER: AttendanceStatus[] = [
  'sin_registrar',
  'asistencia',
  'retraso',
  'lesion',
  'viaje',
  'estudios',
  'medico',
  'injustificada',
]

export interface AttendanceStats {
  expected: number
  registered: number
  pending: number
  attended: number
  late: number
  justified: number
  unjustified: number
  byStatus: Record<AttendanceStatus, number>
  /** (asistencia + retraso) / registros distintos de "Sin registrar" × 100; null si no hay registros */
  percentage: number | null
  /** pendientes / total previsto × 100; null si no hay previstos */
  pendingPercentage: number | null
}

export function computeStats(statuses: AttendanceStatus[]): AttendanceStats {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<AttendanceStatus, number>
  for (const s of statuses) byStatus[s] += 1
  const expected = statuses.length
  const pending = byStatus.sin_registrar
  const registered = expected - pending
  const attended = byStatus.asistencia + byStatus.retraso
  const justified = byStatus.lesion + byStatus.viaje + byStatus.estudios + byStatus.medico
  return {
    expected,
    registered,
    pending,
    attended,
    late: byStatus.retraso,
    justified,
    unjustified: byStatus.injustificada,
    byStatus,
    percentage: registered === 0 ? null : (attended / registered) * 100,
    pendingPercentage: expected === 0 ? null : (pending / expected) * 100,
  }
}

export function formatPct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} %`
}

/** Un evento está completo cuando ningún jugador aplicable queda "Sin registrar". */
export function isEventComplete(statuses: AttendanceStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s !== 'sin_registrar')
}
