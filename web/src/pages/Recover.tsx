import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Shield } from '../components/Shield'
import { ErrorBox, Field } from '../components/ui'
import { supabase } from '../lib/supabase'

export function RecoverPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <Shield size={90} />
          <h1>Recuperar contraseña</h1>
        </div>
        {sent ? (
          <div className="alert alert-ok">
            Si el correo está registrado, recibirás un enlace para establecer una nueva contraseña.
          </div>
        ) : (
          <>
            <ErrorBox error={error} />
            <Field label="Correo electrónico">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn btn-primary btn-block">Enviar enlace</button>
          </>
        )}
        <Link to="/login" className="link center">
          Volver al inicio de sesión
        </Link>
      </form>
    </div>
  )
}
