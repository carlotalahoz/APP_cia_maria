-- Pruebas de humo de permisos (RLS). Ejecutar contra la BD local recién reseteada:
--   docker exec -i supabase_db_APP_cia_maria psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_smoke.sql
-- Todo se ejecuta en una transacción que se deshace al final.
begin;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

-- Coordinadora ve todo
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.teams) = 2, 'coordinadora ve los 2 equipos');
select pg_temp.check((select count(*) from public.players) = 18, 'coordinadora ve los 18 jugadores');

-- Principal 2 solo ve su equipo
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select pg_temp.check((select count(*) from public.teams) = 1, 'principal2 solo ve su equipo');
select pg_temp.check(
  not exists (select 1 from public.enrollments where team_id = '30000000-0000-0000-0000-000000000001'),
  'principal2 no ve la plantilla del otro equipo');
select pg_temp.check((select count(*) from public.audit_log) = 0, 'principal2 no ve la auditoría');

-- Ayudante: ve jugadores de su equipo pero no puede editar datos personales
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.players) > 0, 'ayudante ve jugadores de su equipo');
do $$
declare n int;
begin
  begin
    update public.players set phone = '600000000'
    where id in (select player_id from public.enrollments where team_id = '30000000-0000-0000-0000-000000000001');
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  perform pg_temp.check(n = 0, 'ayudante no puede editar datos personales');
end $$;
select pg_temp.check((select count(*) from public.profiles where id <> '00000000-0000-0000-0000-000000000003' and role = 'coordinadora') >= 0, 'ayudante consulta perfiles sin error');

-- Delegado puede registrar asistencia de su equipo
create temp table t_ctx as
  select e.id as ev, (select player_id from public.enrollments en where en.team_id = e.team_id and en.kind = 'plantilla' limit 1) as pl
  from public.events e
  where e.team_id = '30000000-0000-0000-0000-000000000001' and e.starts_at > now() order by e.starts_at limit 1;
grant select on t_ctx to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$
declare r jsonb;
begin
  r := public.save_attendance((select ev from t_ctx), (select pl from t_ctx), 'retraso', 'llega 10 min tarde', null, false);
  perform pg_temp.check(coalesce((r ->> 'conflict')::boolean = false, false), 'delegado registra asistencia');
end $$;

-- El principal sincroniza un cambio hecho sin conexión con una base antigua: conflicto
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$
declare r jsonb;
begin
  r := public.save_attendance((select ev from t_ctx), (select pl from t_ctx), 'injustificada', null, null, false);
  perform pg_temp.check(coalesce((r ->> 'conflict')::boolean, false), 'se detecta el conflicto offline');
  perform pg_temp.check(r -> 'server' ->> 'status' = 'retraso', 'el conflicto devuelve el valor del servidor');
  r := public.save_attendance((select ev from t_ctx), (select pl from t_ctx), 'injustificada', null, null, true);
  perform pg_temp.check(coalesce((r ->> 'conflict')::boolean = false, false), 'forzar resuelve el conflicto');
end $$;

-- Principal 2 no puede registrar asistencia en un equipo ajeno
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
do $$
declare ev uuid; ok boolean := false;
begin
  select e.id into ev from public.events e where e.team_id = '30000000-0000-0000-0000-000000000001' limit 1;
  begin
    perform public.save_attendance(ev, (select id from public.players limit 1), 'asistencia', null, null, false);
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'principal2 no puede registrar asistencia en equipo ajeno');
end $$;

-- Temporada cerrada: el principal deja de poder editar datos personales; la coordinadora sí puede
select set_config('role', 'postgres', true);
update public.seasons set status = 'cerrada';
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check(
  not public.can_edit_player((select player_id from public.enrollments where team_id = '30000000-0000-0000-0000-000000000001' limit 1)),
  'principal no puede editar jugadores con la temporada cerrada');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check(
  public.can_edit_player((select player_id from public.enrollments where team_id = '30000000-0000-0000-0000-000000000001' limit 1)),
  'coordinadora puede editar jugadores con la temporada cerrada');

rollback;
