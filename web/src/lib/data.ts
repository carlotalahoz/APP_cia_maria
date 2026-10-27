import { must } from './useAsync'
import { supabase } from './supabase'
import type { Category, Profile, Team, TeamStaff, TrainingSlot, Venue } from './types'

export async function loadTeams(seasonId: string | null): Promise<Team[]> {
  if (!seasonId) return []
  return must(
    await supabase.from('teams').select('*').eq('season_id', seasonId).is('deleted_at', null).order('name'),
  ) as Team[]
}

export async function loadCategories(): Promise<Category[]> {
  return must(await supabase.from('categories').select('*').order('sort_order')) as Category[]
}

export async function loadVenues(): Promise<Venue[]> {
  return must(await supabase.from('venues').select('*').order('name')) as Venue[]
}

export async function loadProfiles(): Promise<Profile[]> {
  return must(await supabase.from('profiles').select('id,email,full_name,role,active').order('full_name')) as Profile[]
}

export async function loadStaff(teamIds: string[]): Promise<TeamStaff[]> {
  if (!teamIds.length) return []
  return must(await supabase.from('team_staff').select('*').in('team_id', teamIds)) as TeamStaff[]
}

export async function loadSlots(teamIds: string[]): Promise<TrainingSlot[]> {
  if (!teamIds.length) return []
  return must(
    await supabase.from('training_slots').select('*').in('team_id', teamIds).order('weekday').order('start_time'),
  ) as TrainingSlot[]
}

export const hhmm = (t: string) => t.slice(0, 5)
