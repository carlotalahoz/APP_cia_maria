import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Shield } from '../components/Shield'
import { ErrorBox, Field } from '../components/ui'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('banned')
          ? 'Tu cuenta está desactivada. Contacta con coordinación.'
          : 'Correo o contraseña incorrectos.',
      )
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <Shield size={110} />
          <h1>AD Compañía de María</h1>
          <p className="muted">Gestión de baloncesto</p>
        </div>
        <ErrorBox error={error} />
        <Field label="Correo electrónico">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <Link to="/recuperar" className="link center">
          ¿Has olvidado tu contraseña?
        </Link>
      </form>
    </div>
  )
}
