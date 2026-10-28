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

-- ---------------------------------------------------------------------------
-- Fase 2: calendario, aprobaciones, partidos y convocatorias
-- ---------------------------------------------------------------------------
-- Principal 2 no ve partidos ni solicitudes del otro equipo
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select pg_temp.check(not exists (select 1 from public.matches m join public.events e on e.id = m.event_id
  where e.team_id = '30000000-0000-0000-0000-000000000001'), 'principal2 no ve partidos del otro equipo');
select pg_temp.check((select count(*) from public.event_requests) = 0, 'principal2 no ve solicitudes del otro equipo');

-- Entrenador propone partido → queda pendiente de aprobación y avisa a coordinación
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
create temp table t_f2 (k text primary key, v uuid);
grant all on t_f2 to authenticated;
insert into t_f2 values ('prop', public.propose_event('30000000-0000-0000-0000-000000000001', 'partido',
  now() + interval '20 days', now() + interval '20 days 90 minutes', null, null, null,
  '{"opponent":"CB Prueba","kind":"amistoso","home":false,"away_location":"Pabellón X"}'));
select pg_temp.check((select status from public.events where id = (select v from t_f2 where k = 'prop')) = 'pendiente_aprobacion',
  'propuesta del entrenador queda pendiente de aprobación');

-- Delegado no puede proponer, cancelar ni convocar
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$
declare ok boolean := false;
begin
  begin
    perform public.propose_event('30000000-0000-0000-0000-000000000001', 'tecnificacion', now() + interval '3 days', now() + interval '3 days 1 hour');
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'delegado no puede proponer actividades');
  ok := false;
  begin
    perform public.cancel_event((select id from public.events where team_id = '30000000-0000-0000-0000-000000000001'
      and type = 'entrenamiento' and starts_at > now() order by starts_at limit 1), 'prueba');
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'delegado no puede cancelar entrenamientos');
end $$;

-- Asistencia en propuesta sin aprobar: rechazada
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$
declare ok boolean := false;
begin
  begin
    perform public.save_attendance((select v from t_f2 where k = 'prop'), (select player_id from public.enrollments
      where team_id = '30000000-0000-0000-0000-000000000001' limit 1), 'asistencia', null, null, false);
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'no se registra asistencia en un partido sin aprobar');
end $$;

-- Entrenador no puede cambiar directamente un entrenamiento: debe solicitarlo
do $$
declare ok boolean := false; ev uuid;
begin
  select id into ev from public.events where team_id = '30000000-0000-0000-0000-000000000001' and type = 'entrenamiento'
    and starts_at > now() + interval '3 days'
    and not exists (select 1 from public.event_requests r where r.event_id = events.id and r.status = 'pendiente')
  order by starts_at limit 1;
  begin
    perform public.update_event(ev, now() + interval '30 days', now() + interval '30 days 1 hour', null);
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'entrenador no modifica entrenamientos sin aprobación');
  insert into t_f2 values ('req', public.request_event_change(ev, now() + interval '30 days', now() + interval '30 days 1 hour',
    '10000000-0000-0000-0000-000000000003', 'Prueba'));
  insert into t_f2 values ('reqev', ev);
  perform pg_temp.check((select starts_at from public.events where id = ev) < now() + interval '29 days',
    'la sesión no cambia antes de la aprobación');
end $$;

-- Coordinadora aprueba propuesta y solicitud
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check(exists (select 1 from public.notifications where title = 'Propuesta pendiente de aprobación'),
  'coordinación recibe aviso de la propuesta');
select public.resolve_event_proposal((select v from t_f2 where k = 'prop'), true, null);
select public.resolve_event_request((select v from t_f2 where k = 'req'), true, 'OK');
select pg_temp.check((select venue_id from public.events where id = (select v from t_f2 where k = 'reqev')) = '10000000-0000-0000-0000-000000000003',
  'el cambio aprobado se aplica al calendario');

-- Convocatoria y asistencia del partido solo para convocados
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select public.set_callup((select v from t_f2 where k = 'prop'),
  array(select player_id from public.enrollments where team_id = '30000000-0000-0000-0000-000000000001' and kind = 'plantilla' order by player_id limit 3));
select pg_temp.check((select count(*) from public.event_roster((select v from t_f2 where k = 'prop'))) = 3,
  'la lista de asistencia del partido sale de los convocados');
do $$
declare ok boolean := false;
begin
  begin
    -- jugador del Infantil (no visible para el ayudante del Alevín)
    perform public.set_callup((select v from t_f2 where k = 'prop'), array['40000000-0000-0000-0000-000000000011'::uuid]);
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'no se convoca a jugadores de otro equipo');
  ok := false;
  begin
    perform public.save_attendance((select v from t_f2 where k = 'prop'), (select player_id from public.enrollments
      where team_id = '30000000-0000-0000-0000-000000000001' and kind = 'plantilla' order by player_id desc limit 1), 'asistencia', null, null, false);
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'no se registra asistencia de un no convocado');
end $$;

-- Aplazamiento conserva la fecha original; resultado finaliza y avisa
select public.postpone_match((select v from t_f2 where k = 'prop'), 'Lluvia');
select pg_temp.check((select status = 'pendiente' and original_starts_at is not null from public.events where id = (select v from t_f2 where k = 'prop')),
  'aplazado sin fecha queda como partido pendiente con fecha original');
select public.postpone_match((select v from t_f2 where k = 'prop'), 'Nueva fecha', now() + interval '25 days');
select public.save_match_result((select v from t_f2 where k = 'prop'), 40, 35, '[{"for":20,"against":15},{"for":20,"against":20}]'::jsonb);
select pg_temp.check((select status from public.events where id = (select v from t_f2 where k = 'prop')) = 'finalizado',
  'registrar el resultado finaliza el partido');

-- Actas: el delegado no puede subir
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$
declare ok boolean := false;
begin
  begin
    insert into public.match_reports (event_id, path, file_name) values ((select v from t_f2 where k = 'prop'), 'x/y.pdf', 'y.pdf');
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'delegado no puede adjuntar actas');
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into public.match_reports (event_id, path, file_name) values ((select v from t_f2 where k = 'prop'), (select v from t_f2 where k = 'prop') || '/acta.pdf', 'acta.pdf');
select pg_temp.check((select count(*) from public.match_reports where event_id = (select v from t_f2 where k = 'prop')) = 1,
  'el entrenador adjunta el acta');

-- Cambiar un horario fijo y regenerar no duplica las sesiones futuras
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.training_slots set start_time = '17:45', end_time = '19:15'
where team_id = '30000000-0000-0000-0000-000000000001' and weekday = 1;
select public.generate_training_sessions('30000000-0000-0000-0000-000000000001', current_date);
select pg_temp.check((
  select bool_and(n = 1) from (
    select count(*) n from public.events
    where team_id = '30000000-0000-0000-0000-000000000001' and type = 'entrenamiento' and status = 'programado'
      and extract(isodow from starts_at at time zone 'Europe/Madrid') = 1 and starts_at > now() + interval '8 days'
    group by (starts_at at time zone 'Europe/Madrid')::date) q),
  'regenerar tras cambiar el horario no duplica entrenamientos');
select pg_temp.check(exists (
  select 1 from public.events where team_id = '30000000-0000-0000-0000-000000000001' and starts_at > now() + interval '8 days'
    and extract(isodow from starts_at at time zone 'Europe/Madrid') = 1 and (starts_at at time zone 'Europe/Madrid')::time = '17:45'),
  'las sesiones futuras toman el nuevo horario');

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
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$
declare ok boolean := false;
begin
  begin
    perform public.propose_event('30000000-0000-0000-0000-000000000001', 'tecnificacion', now() + interval '3 days', now() + interval '3 days 1 hour');
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'con la temporada cerrada el entrenador no propone actividades');
  ok := false;
  begin
    perform public.cancel_event_request((select id from public.event_requests where status = 'pendiente' limit 1));
  exception when others then ok := true;
  end;
  perform pg_temp.check(ok, 'con la temporada cerrada el entrenador no anula solicitudes');
end $$;

rollback;
