import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './supabase'

/** Carga datos asíncronos con estados de carga/error y función de recarga. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await run())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

/** Lanza el error de una respuesta de Supabase y devuelve los datos. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
