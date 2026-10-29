import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { TeamForm } from '../components/TeamForm'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { hhmm, loadCategories, loadProfiles, loadSlots, loadStaff, loadTeams, loadVenues } from '../lib/data'
import { supabase } from '../lib/supabase'
import { BRANCH_LABEL, WEEKDAYS } from '../lib/types'
import { useAsync } from '../lib/useAsync'

interface Conflict {
  venue: string
  weekday: number
  team_a: string
  team_b: string
}

export function TeamsPage() {
  const { isCoord, seasonId, seasons } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const season = seasons.find((s) => s.id === seasonId)

  const { data, error, loading, reload } = useAsync(async () => {
    const teams = await loadTeams(seasonId)
    const ids = teams.map((t) => t.id)
    const [categories, venues, staff, slots, profiles] = await Promise.all([
      loadCategories(),
      loadVenues(),
      loadStaff(ids),
      loadSlots(ids),
      loadProfiles(),
    ])
    const conflicts: Conflict[] = isCoord && seasonId ? ((await supabase.rpc('slot_conflicts', { p_season: seasonId })).data ?? []) : []
    return { teams, categories, venues, staff, slots, profiles, conflicts }
  }, [seasonId, isCoord])

  return (
    <>
      <PageHeader
        title="Equipos"
        subtitle={season ? `Temporada ${season.name}` : undefined}
        actions={
          isCoord && season?.status === 'activa' && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Nuevo equipo
            </button>
          )
        }
      />
      <ErrorBox error={error} />
      {data?.conflicts.length ? (
        <div className="alert alert-warn">
          <strong>Coincidencias de pista:</strong>
          <ul>
            {data.conflicts.map((c, i) => (
              <li key={i}>
                {WEEKDAYS[c.weekday]} · {c.venue}: {c.team_a} y {c.team_b}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {loading || !data ? (
        <Loading />
      ) : data.teams.length === 0 ? (
        <Empty>No hay equipos {isCoord ? 'en esta temporada' : 'asignados'}.</Empty>
      ) : (
        <div className="cards">
          {data.teams.map((t) => {
            const cat = data.categories.find((c) => c.id === t.category_id)
            const st = data.staff.filter((s) => s.team_id === t.id)
            const principal = st.find((s) => s.staff_role === 'principal')
            return (
              <Link key={t.id} to={`/equipos/${t.id}`} className="card team-card">
                <div className="row between">
                  <span className="team-code">{t.code}</span>
                  <Badge>{BRANCH_LABEL[t.branch]}</Badge>
                </div>
                <h3>{t.name}</h3>
                <p className="muted">{cat?.name}</p>
                <p className="small">
                  Principal: {data.profiles.find((p) => p.id === principal?.user_id)?.full_name ?? '—'}
                </p>
                <p className="small muted">
                  {data.slots
                    .filter((s) => s.team_id === t.id)
                    .map((s) => `${WEEKDAYS[s.weekday].slice(0, 3)} ${hhmm(s.start_time)}`)
                    .join(' · ') || 'Sin horario'}
                </p>
              </Link>
            )
          })}
        </div>
      )}
      {creating && data && seasonId && (
        <TeamForm
          seasonId={seasonId}
          categories={data.categories}
          venues={data.venues}
          profiles={data.profiles}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            void reload()
            navigate(`/equipos/${id}`)
          }}
        />
      )}
    </>
  )
}
