import { Badge } from './ui'
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, EVENT_TYPE_LABEL, type EventRow, type MatchRow } from '../lib/types'

/** Etiqueta corta de una actividad del calendario. */
export function eventTitle(ev: EventRow, match?: Pick<MatchRow, 'opponent' | 'home'> | null) {
  if (ev.type === 'partido' && match) return `${match.home ? 'vs' : '@'} ${match.opponent}`
  return ev.title || EVENT_TYPE_LABEL[ev.type]
}

export function StatusBadge({ status }: { status: EventRow['status'] }) {
  return <Badge tone={EVENT_STATUS_TONE[status]}>{EVENT_STATUS_LABEL[status]}</Badge>
}

export function TypeDot({ type }: { type: EventRow['type'] }) {
  return <span className={`type-dot type-${type}`} aria-hidden="true" />
}

/** Convierte un valor ISO a lo que espera <input type="datetime-local">. */
export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => new Date(v).toISOString()
