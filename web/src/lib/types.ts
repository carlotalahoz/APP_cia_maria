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

export interface EventRow {
  id: string
  team_id: string
  type: 'entrenamiento' | 'partido'
  starts_at: string
  ends_at: string
  venue_id: string | null
  status: 'programado' | 'cancelado'
  cancel_reason: string | null
  extraordinary: boolean
}

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
