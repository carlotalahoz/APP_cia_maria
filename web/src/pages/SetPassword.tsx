import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Shield } from '../components/Shield'
import { ErrorBox, Field, Loading } from '../components/ui'
import { supabase } from '../lib/supabase'

/** Destino de los enlaces de invitación y recuperación enviados por correo. */
export function SetPasswordPage() {
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (loading) return <Loading />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== repeat) return setError('Las contraseñas no coinciden.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setError(error.message)
    navigate('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <Shield size={56} />
          <h1>Establecer contraseña</h1>
        </div>
        {!session ? (
          <div className="alert alert-error">El enlace no es válido o ha caducado. Solicita uno nuevo.</div>
        ) : (
          <>
            <p className="muted">Cuenta: {session.user.email}</p>
            <ErrorBox error={error} />
            <Field label="Nueva contraseña">
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Repite la contraseña">
              <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </Field>
            <button className="btn btn-primary btn-block">Guardar y entrar</button>
          </>
        )}
      </form>
    </div>
  )
}
