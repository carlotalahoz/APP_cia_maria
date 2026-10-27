import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string
// Admite una ruta relativa (p. ej. "/supabase") servida por el proxy de Vite en el mismo origen.
const url = rawUrl?.startsWith('/') ? `${window.location.origin}${rawUrl}` : rawUrl
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver web/.env.example)')
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function errorMessage(e: unknown): string {
  if (!e) return 'Error desconocido'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
