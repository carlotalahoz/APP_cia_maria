import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Badge, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui'
import { loadProfiles, loadStaff, loadTeams } from '../lib/data'
import { errorMessage, supabase } from '../lib/supabase'
import { ROLE_LABEL, STAFF_LABEL, type AppRole, type Profile, type StaffRole, type Team } from '../lib/types'
import { useAsync } from '../lib/useAsync'

async function admin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { ...body, redirect_to: `${location.origin}/nueva-contrasena` },
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? error.message)
  }
  return data
}

export function UsersPage() {
  const { seasonId, profile: me } = useAuth()
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(async () => {
    const [profiles, teams] = await Promise.all([loadProfiles(), loadTeams(seasonId)])
    const staff = await loadStaff(teams.map((t) => t.id))
    return { profiles, teams, staff }
  }, [seasonId])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null)
    setMsg(null)
    try {
      await fn()
      setMsg(ok)
      await reload()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Solo coordinación da de alta usuarios. Los desactivados conservan su historial."
        actions={
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            + Nuevo usuario
          </button>
        }
      />
      <ErrorBox error={error ?? err} />
      {msg && <div className="alert alert-ok">{msg}</div>}
      {loading || !data ? (
        <Loading />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Equipos (temporada actual)</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.full_name || '—'}</strong>
                  <div className="muted small">{p.email}</div>
                </td>
                <td>
                  <select
                    value={p.role}
                    disabled={p.id === me?.id}
                    onChange={(e) => run(() => admin({ action: 'set_role', user_id: p.id, role: e.target.value }), 'Rol actualizado.')}
                  >
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small">
                  {data.staff
                    .filter((s) => s.user_id === p.id)
                    .map((s) => `${data.teams.find((t) => t.id === s.team_id)?.code} (${STAFF_LABEL[s.staff_role]})`)
                    .join(', ') || '—'}
                </td>
                <td>{p.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="warn">Inactivo</Badge>}</td>
                <td className="right nowrap">
                  <button className="btn btn-ghost btn-s" onClick={() => run(() => admin({ action: 'resend_invite', user_id: p.id }), 'Correo enviado.')}>
                    Reenviar acceso
                  </button>
                  {p.id !== me?.id && (
                    <button
                      className="btn btn-ghost btn-s"
                      onClick={() =>
                        run(() => admin({ action: 'set_active', user_id: p.id, active: !p.active }), p.active ? 'Usuario desactivado.' : 'Usuario reactivado.')
                      }
                    >
                      {p.active ? 'Desactivar' : 'Reactivar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {inviting && data && (
        <InviteModal
          teams={data.teams}
          onClose={() => setInviting(false)}
          onInvite={async (body) => {
            await admin({ action: 'invite', ...body })
            setInviting(false)
            setMsg(`Invitación enviada a ${body.email}.`)
            await reload()
          }}
        />
      )}
    </>
  )
}

interface InviteBody {
  email: string
  full_name: string
  role: AppRole
  teams: { team_id: string; staff_role: StaffRole }[]
}

function InviteModal({ teams, onClose, onInvite }: { teams: Team[]; onClose: () => void; onInvite: (b: InviteBody) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<AppRole>('principal')
  const [assign, setAssign] = useState<Record<string, StaffRole | ''>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            if (!/^\S+@\S+\.\S+$/.test(email) || !name.trim()) return setErr('Indica nombre y un correo válido.')
            setBusy(true)
            setErr(null)
            try {
              await onInvite({
                email,
                full_name: name.trim(),
                role,
                teams: Object.entries(assign)
                  .filter(([, r]) => r)
                  .map(([team_id, r]) => ({ team_id, staff_role: r as StaffRole })),
              })
            } catch (e) {
              setErr(errorMessage(e))
              setBusy(false)
            }
          }}
        >
          Enviar invitación
        </button>
      }
    >
      <ErrorBox error={err} />
      <Field label="Nombre completo">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Correo electrónico">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Rol general">
        <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {role !== 'coordinadora' && (
        <>
          <h4>Equipos asignados</h4>
          {teams.map((t) => (
            <div key={t.id} className="row between">
              <span>{t.name}</span>
              <select value={assign[t.id] ?? ''} onChange={(e) => setAssign({ ...assign, [t.id]: e.target.value as StaffRole | '' })}>
                <option value="">—</option>
                {Object.entries(STAFF_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}
      <p className="muted small">Recibirá un correo para crear su contraseña (mínimo 8 caracteres).</p>
    </Modal>
  )
}

export type { Profile }
