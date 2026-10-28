export type AppRole = 'coordinadora' | 'principal' | 'ayudante' | 'delegado'
export type StaffRole = 'principal' | 'ayudante' | 'delegado'
export type EnrollmentKind = 'plantilla' | 'sube_habitual' | 'sube_puntual'
export type AttendanceStatus =
  | 'sin_registrar'
  | 'asistencia'
  | 'retraso'
  | 'lesion'
  | 'viaje'
  | 'estudios'
  | 'medico'
  | 'injustificada'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: AppRole
  active: boolean
}

export interface Season {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'activa' | 'cerrada'
  closed_at: string | null
}

export interface Category {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export interface Venue {
  id: string
  name: string
  active: boolean
}

export interface Team {
  id: string
  season_id: string
  category_id: string
  branch: 'femenino' | 'masculino' | 'mixto'
  code: string
  name: string
  active: boolean
  deleted_at: string | null
}

export interface TrainingSlot {
  id: string
  team_id: string
  weekday: number
  start_time: string
  end_time: string
  venue_id: string | null
}

export interface TeamStaff {
  team_id: string
  user_id: string
  staff_role: StaffRole
}

export interface Player {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  gir: string | null
  dni: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  allergies: string | null
  size: string | null
  father_name: string | null
  father_phone: string | null
  mother_name: string | null
  mother_phone: string | null
  photo_url: string | null
  license_number: string | null
  position: string | null
  observations: string | null
  active: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Enrollment {
  id: string
  player_id: string
  team_id: string
  kind: EnrollmentKind
  dorsal: number | null
  start_date: string
  end_date: string | null
  event_id: string | null
}

export type EventType = 'entrenamiento' | 'preparacion_fisica' | 'partido' | 'tecnificacion' | 'torneo'
export type EventStatus = 'pendiente_aprobacion' | 'programado' | 'pendiente' | 'aplazado' | 'cancelado' | 'finalizado'

export interface EventRow {
  id: string
  team_id: string
  type: EventType
  starts_at: string
  ends_at: string
  venue_id: string | null
  status: EventStatus
  cancel_reason: string | null
  extraordinary: boolean
  title?: string | null
  notes?: string | null
  postpone_reason?: string | null
  original_starts_at?: string | null
  created_by?: string | null
  resolution_note?: string | null
  updated_at?: string
}

export interface MatchPeriod {
  for: number
  against: number
}

export interface MatchRow {
  event_id: string
  kind: 'oficial' | 'amistoso'
  school: boolean
  competition: string | null
  matchday: string | null
  opponent: string
  home: boolean
  away_location: string | null
  score_for: number | null
  score_against: number | null
  periods: MatchPeriod[]
  incidents: string | null
  suspended: boolean
  staff_present: string[]
  callup_saved_at: string | null
  result_at: string | null
}

export interface MatchReport {
  id: string
  event_id: string
  path: string
  file_name: string
  mime: string | null
  uploaded_by: string | null
  uploaded_at: string
  replaced_at: string | null
}

export interface EventRequest {
  id: string
  event_id: string
  requested_by: string | null
  new_starts_at: string
  new_ends_at: string
  new_venue_id: string | null
  reason: string
  status: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  entrenamiento: 'Entrenamiento',
  preparacion_fisica: 'Preparación física',
  partido: 'Partido',
  tecnificacion: 'Tecnificación',
  torneo: 'Torneo',
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  programado: 'Programado',
  pendiente: 'Partido pendiente',
  aplazado: 'Aplazado',
  cancelado: 'Cancelado',
  finalizado: 'Finalizado',
}

export const EVENT_STATUS_TONE: Record<EventStatus, 'neutral' | 'ok' | 'warn' | 'danger' | 'info'> = {
  pendiente_aprobacion: 'warn',
  programado: 'info',
  pendiente: 'warn',
  aplazado: 'warn',
  cancelado: 'danger',
  finalizado: 'ok',
}

/** Actividades en las que se puede pasar asistencia. */
export const ATTENDABLE: EventStatus[] = ['programado', 'aplazado', 'finalizado', 'cancelado']

export interface AttendanceRow {
  event_id: string
  player_id: string
  status: AttendanceStatus
  notes: string | null
  updated_by: string | null
  updated_at: string
}

export interface NotificationRow {
  id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export const ROLE_LABEL: Record<AppRole, string> = {
  coordinadora: 'Coordinadora',
  principal: 'Entrenador principal',
  ayudante: 'Ayudante',
  delegado: 'Delegado',
}

export const STAFF_LABEL: Record<StaffRole, string> = {
  principal: 'Principal',
  ayudante: 'Ayudante',
  delegado: 'Delegado',
}

export const KIND_LABEL: Record<EnrollmentKind, string> = {
  plantilla: 'Plantilla',
  sube_habitual: 'Sube (habitual)',
  sube_puntual: 'Sube (puntual)',
}

export const BRANCH_LABEL: Record<Team['branch'], string> = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  mixto: 'Mixto',
}

export const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
