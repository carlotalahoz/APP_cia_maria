import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { loadCategories, loadTeams } from '../lib/data'
import { age, isoDate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Enrollment, Player, Team } from '../lib/types'
import { must, useAsync } from '../lib/useAsync'

type Row = Pick<Player, 'id' | 'first_name' | 'last_name' | 'birth_date' | 'position' | 'active' | 'deleted_at'> & {
  enrollments: Pick<Enrollment, 'team_id' | 'kind' | 'end_date' | 'dorsal'>[]
}

export function PlayersPage() {
  const { isCoord, seasonId, seasons } = useAuth()
  const [q, setQ] = useState('')
  const [teamId, setTeamId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const { data, error, loading } = useAsync(async () => {
    const [teams, categories, players] = await Promise.all([
      loadTeams(seasonId),
      loadCategories(),
      supabase
        .from('players')
        .select('id,first_name,last_name,birth_date,position,active,deleted_at,enrollments(team_id,kind,end_date,dorsal)')
        .is('deleted_at', null)
        .order('last_name'),
    ])
    return { teams, categories, players: must(players) as Row[] }
  }, [seasonId])

  const filtered = useMemo(() => {
    if (!data) return []
    const today = isoDate(new Date())
    const seasonTeams = new Set(data.teams.map((t) => t.id))
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    return data.players.filter((p) => {
      if (!showInactive && !p.active) return false
      const current = p.enrollments.filter((e) => seasonTeams.has(e.team_id) && (!e.end_date || e.end_date >= today))
      if (!isCoord && current.length === 0) return false
      if (teamId && !current.some((e) => e.team_id === teamId)) return false
      if (categoryId && !current.some((e) => data.teams.find((t) => t.id === e.team_id)?.category_id === categoryId)) return false
      if (q && !norm(`${p.first_name} ${p.last_name}`).includes(norm(q))) return false
      return true
    })
  }, [data, q, teamId, categoryId, showInactive, isCoord])

  const teamsOf = (p: Row, teams: Team[]) =>
    p.enrollments
      .map((e) => teams.find((t) => t.id === e.team_id))
      .filter(Boolean)
      .map((t) => t!.code)

  return (
    <>
      <PageHeader
        title="Jugadores"
        subtitle={`Temporada ${seasons.find((s) => s.id === seasonId)?.name ?? ''}`}
      />
      <div className="filters">
        <input placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Todos los equipos</option>
          {data?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isCoord && (
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver inactivos
          </label>
        )}
      </div>
      <p className="muted small">Para dar de alta un jugador, entra en su equipo y pulsa «Añadir jugador».</p>
      <ErrorBox error={error} />
      {loading || !data ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty>No hay jugadores con estos filtros.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Edad</th>
              <th>Posición</th>
              <th>Equipos</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/jugadores/${p.id}`}>
                    {p.last_name}, {p.first_name}
                  </Link>{' '}
                  {!p.active && <Badge tone="warn">Inactivo</Badge>}
                </td>
                <td>{age(p.birth_date)}</td>
                <td>{p.position ?? '—'}</td>
                <td>{teamsOf(p, data.teams).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
