import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearOfflineData } from '../lib/offline'
import { clearActivity, isInactiveTooLong, touchActivity } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Profile, Season, TeamStaff } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  staff: TeamStaff[]
  seasons: Season[]
  seasonId: string | null
  setSeasonId: (id: string) => void
  loading: boolean
  isCoord: boolean
  isStaffOf: (teamId: string) => boolean
  isPrincipalOf: (teamId: string) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const SEASON_KEY = 'ad-cia-maria:season'

function pickCurrentSeason(seasons: Season[]): string | null {
  const today = new Date().toISOString().slice(0, 10)
  const saved = localStorage.getItem(SEASON_KEY)
  if (saved && seasons.some((s) => s.id === saved)) return saved
  const current = seasons.find((s) => s.start_date <= today && s.end_date >= today && s.status === 'activa')
  return (current ?? seasons.find((s) => s.status === 'activa') ?? seasons[0])?.id ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [staff, setStaff] = useState<TeamStaff[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    await clearOfflineData()
    clearActivity()
    await supabase.auth.signOut()
    setProfile(null)
    setStaff([])
  }, [])

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setStaff([])
      setSeasons([])
      setLoading(false)
      return
    }
    const [p, st, se] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,role,active').eq('id', s.user.id).maybeSingle(),
      supabase.from('team_staff').select('team_id,user_id,staff_role').eq('user_id', s.user.id),
      supabase.from('seasons').select('*').order('start_date', { ascending: false }),
    ])
    if (!p.data || !p.data.active) {
      await signOut()
      setLoading(false)
      return
    }
    setProfile(p.data as Profile)
    setStaff((st.data ?? []) as TeamStaff[])
    const list = (se.data ?? []) as Season[]
    setSeasons(list)
    setSeasonIdState((cur) => (cur && list.some((x) => x.id === cur) ? cur : pickCurrentSeason(list)))
    setLoading(false)
  }, [signOut])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && isInactiveTooLong()) {
        await signOut()
        setSession(null)
        setLoading(false)
        return
      }
      if (data.session) touchActivity()
      setSession(data.session)
      void load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN') touchActivity()
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load, signOut])

  // Registro de actividad para el cierre tras siete días de inactividad.
  useEffect(() => {
    if (!session) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last > 60_000) {
        last = now
        touchActivity()
      }
    }
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [session])

  const value = useMemo<AuthState>(() => {
    const isCoord = profile?.role === 'coordinadora'
    return {
      session,
      profile,
      staff,
      seasons,
      seasonId,
      setSeasonId: (id: string) => {
        localStorage.setItem(SEASON_KEY, id)
        setSeasonIdState(id)
      },
      loading,
      isCoord,
      isStaffOf: (teamId) => isCoord || staff.some((s) => s.team_id === teamId),
      isPrincipalOf: (teamId) => isCoord || staff.some((s) => s.team_id === teamId && s.staff_role === 'principal'),
      refresh: () => load(session),
      signOut,
    }
  }, [session, profile, staff, seasons, seasonId, loading, load, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
