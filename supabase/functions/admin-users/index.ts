// Administración de usuarios (solo coordinadora): alta por invitación, cambio de rol, activar/desactivar.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['coordinadora', 'principal', 'ayudante', 'delegado']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: isCoord, error: coordErr } = await asCaller.rpc('is_coord')
  if (coordErr || !isCoord) return json({ error: 'Solo la coordinadora puede administrar usuarios' }, 403)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  try {
    switch (body.action) {
      case 'invite': {
        const email = String(body.email ?? '').trim().toLowerCase()
        const fullName = String(body.full_name ?? '').trim()
        const role = String(body.role ?? '')
        if (!email || !fullName || !ROLES.includes(role)) return json({ error: 'Datos incompletos' }, 400)
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
          redirectTo: body.redirect_to,
        })
        if (error) return json({ error: error.message }, 400)
        const id = data.user.id
        await admin.auth.admin.updateUserById(id, { app_metadata: { app_role: role } })
        await admin.from('profiles').update({ role, full_name: fullName }).eq('id', id)
        const teams: { team_id: string; staff_role: string }[] = body.teams ?? []
        if (teams.length) {
          const { error: tErr } = await admin
            .from('team_staff')
            .insert(teams.map((t) => ({ team_id: t.team_id, user_id: id, staff_role: t.staff_role })))
          if (tErr) return json({ error: tErr.message }, 400)
        }
        return json({ id })
      }
      case 'set_active': {
        const id = String(body.user_id ?? '')
        const active = Boolean(body.active)
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' })
        if (error) return json({ error: error.message }, 400)
        await admin.from('profiles').update({ active }).eq('id', id)
        return json({ ok: true })
      }
      case 'set_role': {
        const id = String(body.user_id ?? '')
        const role = String(body.role ?? '')
        if (!ROLES.includes(role)) return json({ error: 'Rol no válido' }, 400)
        await admin.auth.admin.updateUserById(id, { app_metadata: { app_role: role } })
        const { error } = await admin.from('profiles').update({ role }).eq('id', id)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      case 'resend_invite': {
        const { data: prof } = await admin.from('profiles').select('email').eq('id', body.user_id).single()
        if (!prof) return json({ error: 'Usuario no encontrado' }, 404)
        const { error } = await admin.auth.resetPasswordForEmail(prof.email, { redirectTo: body.redirect_to })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      default:
        return json({ error: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
