export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (r.getDay() + 6) % 7 // lunes = 0
  r.setDate(r.getDate() - day)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export const fmtDate = (s: string | Date) => dateFmt.format(typeof s === 'string' ? new Date(s.length === 10 ? s + 'T00:00:00' : s) : s)
export const fmtShort = (s: string | Date) => shortFmt.format(typeof s === 'string' ? new Date(s) : s)
export const fmtTime = (s: string | Date) => timeFmt.format(typeof s === 'string' ? new Date(s) : s)
export const fmtDateTime = (s: string | Date) => dateTimeFmt.format(typeof s === 'string' ? new Date(s) : s)

export function age(birth: string): number {
  const b = new Date(birth + 'T00:00:00')
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}
