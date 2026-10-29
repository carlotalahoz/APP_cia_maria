import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Badge, ErrorBox, Field, Modal, PageHeader } from '../components/ui'
import { loadTeams } from '../lib/data'
import { fmtDate } from '../lib/dates'
import { errorMessage, supabase } from '../lib/supabase'
import { EVENT_STATUS_LABEL, type EventStatus, type Season, type Team } from '../lib/types'
import { must } from '../lib/useAsync'

interface CloseCheck {
  teams: number
  players: number
  staff: number
  events_past: number
  pending_attendance: { team: string; events: number }[]
  unfinished_matches: { team: string; opponent: string; starts_at: string; status: EventStatus }[]
  pending_requests: number
}

export function SeasonsPage() {
  const { seasons, refresh, setSeasonId } = useAuth()
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState<{ season: Season; check: CloseCheck } | null>(null)
  const [copyTo, setCopyTo] = useState<Season | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const openClose = async (s: Season) => {
    setErr(null)
    try {
      const check = must(await supabase.rpc('season_close_check', { p_season: s.id })) as CloseCheck
      setClosing({ season: s, check })
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Temporadas"
        subtitle="Una temporada cerrada queda en solo lectura para entrenadores; coordinación puede corregir."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Nueva temporada
          </button>
        }
      />
      <ErrorBox error={err} />
      <ul className="list card">
        {seasons.map((s) => (
          <li key={s.id}>
            <span className="list-main">
              <strong>{s.name}</strong>
              <span className="muted small">
                {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
              </span>
            </span>
            <Badge tone={s.status === 'activa' ? 'ok' : 'neutral'}>{s.status === 'activa' ? 'Activa' : 'Cerrada'}</Badge>
            {s.status === 'activa' && (
              <>
                <button className="btn btn-s" onClick={() => setCopyTo(s)}>
                  Copiar equipos
                </button>
                <button className="btn btn-s" onClick={() => openClose(s)}>
                  Cerrar
                </button>
              </>
            )}
            {s.status === 'cerrada' && (
              <button
                className="btn btn-ghost btn-s"
                onClick={async () => {
                  if (!confirm('¿Reabrir la temporada? Los entrenadores podrán volver a editarla.')) return
                  try {
                    must(await supabase.from('seasons').update({ status: 'activa', closed_at: null }).eq('id', s.id))
                    await refresh()
                  } catch (e) {
                    setErr(errorMessage(e))
                  }
                }}
              >
                Reabrir
              </button>
            )}
          </li>
        ))}
      </ul>

      {creating && (
        <NewSeason
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            setCreating(false)
            await refresh()
            setSeasonId(id)
          }}
        />
      )}
      {closing && (
        <Modal
          title={`Cerrar temporada ${closing.season.name}`}
          onClose={() => setClosing(null)}
          footer={
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  must(await supabase.rpc('close_season', { p_season: closing.season.id }))
                  setClosing(null)
                  await refresh()
                } catch (e) {
                  setErr(errorMessage(e))
                }
              }}
            >
              Confirmar cierre
            </button>
          }
        >
          <p>Resumen: {closing.check.teams} equipos, {closing.check.players} jugadores, {closing.check.staff} técnicos, {closing.check.events_past} sesiones celebradas.</p>
          {closing.check.pending_attendance.length > 0 ? (
            <div className="alert alert-warn">
              Hay asistencias sin registrar:
              <ul>
                {closing.check.pending_attendance.map((p) => (
                  <li key={p.team}>
                    {p.team}: {p.events} sesiones incompletas
                  </li>
                ))}
              </ul>
              Puedes cerrar igualmente; quedarán como «Sin registrar».
            </div>
          ) : (
            <div className="alert alert-ok">Todas las asistencias están registradas.</div>
          )}
          {closing.check.unfinished_matches.length > 0 && (
            <div className="alert alert-warn">
              Hay {closing.check.unfinished_matches.length} partidos sin finalizar:
              <ul>
                {closing.check.unfinished_matches.map((m, i) => (
                  <li key={i}>
                    {m.team} vs {m.opponent} · {fmtDate(m.starts_at)} · {EVENT_STATUS_LABEL[m.status]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {closing.check.pending_requests > 0 && (
            <div className="alert alert-warn">Hay {closing.check.pending_requests} solicitudes o propuestas pendientes de aprobar.</div>
          )}
          <p className="muted small">Tras el cierre, los datos quedan en solo lectura salvo para coordinación.</p>
        </Modal>
      )}
      {copyTo && (
        <CopyTeams
          target={copyTo}
          sources={seasons.filter((s) => s.id !== copyTo.id)}
          onClose={() => setCopyTo(null)}
          onDone={async (n) => {
            setCopyTo(null)
            alert(`Se han copiado ${n} equipos.`)
            await refresh()
          }}
        />
      )}
    </>
  )
}

function NewSeason({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const y = new Date().getFullYear()
  const [name, setName] = useState(`${String(y % 100).padStart(2, '0')}/${String((y + 1) % 100).padStart(2, '0')}`)
  const [start, setStart] = useState(`${y}-09-01`)
  const [end, setEnd] = useState(`${y + 1}-06-30`)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Modal
      title="Nueva temporada"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              const row = must(await supabase.from('seasons').insert({ name, start_date: start, end_date: end }).select('id').single()) as unknown as { id: string }
              await onSaved(row.id)
            } catch (e) {
              setErr(errorMessage(e))
            }
          }}
        >
          Crear
        </button>
      }
    >
      <ErrorBox error={err} />
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Inicio">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Fin">
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
    </Modal>
  )
}

function CopyTeams({ target, sources, onClose, onDone }: { target: Season; sources: Season[]; onClose: () => void; onDone: (n: number) => Promise<void> }) {
  const [from, setFrom] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [players, setPlayers] = useState(true)
  const [staff, setStaff] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (id: string) => {
    setFrom(id)
    const t = id ? await loadTeams(id) : []
    setTeams(t)
    setSelected(t.map((x) => x.id))
  }

  return (
    <Modal
      title={`Copiar equipos a ${target.name}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!selected.length}
          onClick={async () => {
            try {
              const n = must(
                await supabase.rpc('copy_teams', { p_from: from, p_to: target.id, p_team_ids: selected, p_players: players, p_staff: staff }),
              ) as number
              await onDone(n)
            } catch (e) {
              setErr(errorMessage(e))
            }
          }}
        >
          Copiar {selected.length} equipos
        </button>
      }
    >
      <ErrorBox error={err} />
      <Field label="Temporada origen">
        <select value={from} onChange={(e) => void pick(e.target.value)}>
          <option value="">Elige…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {teams.map((t) => (
        <label key={t.id} className="check block">
          <input
            type="checkbox"
            checked={selected.includes(t.id)}
            onChange={(e) => setSelected(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))}
          />{' '}
          {t.name}
        </label>
      ))}
      <hr />
      <label className="check block">
        <input type="checkbox" checked={players} onChange={(e) => setPlayers(e.target.checked)} /> Mantener jugadores (continuidad)
      </label>
      <label className="check block">
        <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} /> Mantener cuerpo técnico
      </label>
      <p className="muted small">Los horarios fijos se copian; revisa después horarios, plantillas y técnicos.</p>
    </Modal>
  )
}
