-- AD Compañía de María · Fase 2 (2/2)
-- Calendario, aprobaciones, partidos, convocatorias, actas y estadísticas.

-- ---------------------------------------------------------------------------
-- Tipos y tablas
-- ---------------------------------------------------------------------------
create type public.match_kind as enum ('oficial', 'amistoso');
create type public.request_status as enum ('pendiente', 'aprobada', 'rechazada', 'anulada');

alter table public.events
  add column title text,
  add column notes text,
  add column postpone_reason text,
  add column original_starts_at timestamptz,
  add column created_by uuid references public.profiles (id),
  add column resolved_by uuid references public.profiles (id),
  add column resolved_at timestamptz,
  add column resolution_note text,
  add column updated_at timestamptz not null default now();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create table public.matches (
  event_id uuid primary key references public.events (id) on delete cascade,
  kind public.match_kind not null default 'oficial',
  school boolean not null default false,
  competition text,
  matchday text,
  opponent text not null check (btrim(opponent) <> ''),
  home boolean not null default true,
  away_location text,
  score_for smallint check (score_for >= 0),
  score_against smallint check (score_against >= 0),
  periods jsonb not null default '[]'::jsonb,
  incidents text,
  suspended boolean not null default false,
  staff_present uuid[] not null default '{}',
  result_by uuid references public.profiles (id),
  result_at timestamptz,
  check ((score_for is null) = (score_against is null))
);

create table public.match_callups (
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

create table public.match_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  path text not null unique,
  file_name text not null,
  mime text,
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  replaced_at timestamptz
);
create index match_reports_event_idx on public.match_reports (event_id);

create table public.event_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requested_by uuid references public.profiles (id),
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  new_venue_id uuid references public.venues (id),
  reason text not null check (btrim(reason) <> ''),
  status public.request_status not null default 'pendiente',
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  check (new_ends_at > new_starts_at)
);
create index event_requests_event_idx on public.event_requests (event_id);

-- ---------------------------------------------------------------------------
-- Autorización: "entrenador" = principal o ayudante (los delegados consultan y pasan asistencia)
-- ---------------------------------------------------------------------------
create or replace function public.is_team_coach(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.team_staff ts join public.profiles p on p.id = ts.user_id and p.active
    where ts.team_id = p_team and ts.user_id = auth.uid() and ts.staff_role in ('principal', 'ayudante')
  )
$$;

create or replace function public.event_team(p_event uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.events where id = p_event
$$;

-- Comprueba que el usuario puede gestionar el evento como entrenador y que la temporada está abierta.
create or replace function public.assert_event_coach(p_event uuid)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  select * into v from public.events where id = p_event;
  if v.id is null or not public.is_team_coach(v.team_id) then
    raise exception 'No autorizado';
  end if;
  if not public.is_coord() and not public.team_season_open(v.team_id) then
    raise exception 'La temporada está cerrada';
  end if;
  return v;
end $$;

create or replace function public.notify_team_staff(p_team uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct ts.user_id, p_title, p_body, p_link
  from public.team_staff ts join public.profiles p on p.id = ts.user_id and p.active
  where ts.team_id = p_team and ts.user_id is distinct from auth.uid()
$$;
revoke execute on function public.notify_team_staff(uuid, text, text, text) from public, anon, authenticated;

-- Avisa a la otra parte: si actúa la coordinadora, al cuerpo técnico; si actúa el cuerpo técnico, a coordinación.
create or replace function public.notify_other_side(p_team uuid, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_coord() then
    perform public.notify_team_staff(p_team, p_title, p_body, p_link);
  else
    perform public.notify_coordinators(p_title, p_body, p_link);
  end if;
end $$;
revoke execute on function public.notify_other_side(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.event_label(v public.events)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
      case when v.type = 'partido' then 'Partido vs ' || (select opponent from public.matches where event_id = v.id) end,
      nullif(btrim(v.title), ''),
      initcap(replace(v.type::text, '_', ' ')))
    || ' · ' || (select name from public.teams where id = v.team_id)
    || ' · ' || to_char(v.starts_at at time zone 'Europe/Madrid', 'DD/MM HH24:MI')
$$;

create or replace function public.event_link(v public.events)
returns text language sql immutable as $$
  select case when v.type = 'partido' then '/partidos/' || v.id else '/calendario?evento=' || v.id end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría: incluye tablas nuevas (los entrenamientos generados en bloque no se auditan al insertarse)
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_row jsonb;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_id := coalesce(v_row ->> 'id', (v_row ->> 'event_id') || ':' || (v_row ->> 'player_id'), v_row ->> 'event_id');
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'DELETE', tg_table_name, v_id, to_jsonb(old));
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then
      return new;
    end if;
    insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'UPDATE', tg_table_name, v_id, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (user_id, action, table_name, record_id, new_data)
    values (auth.uid(), 'INSERT', tg_table_name, v_id, to_jsonb(new));
  end if;
  return new;
end $$;

create trigger events_audit after update or delete on public.events for each row execute function public.audit_trigger();
do $$
declare t text;
begin
  foreach t in array array['matches','match_callups','match_reports','event_requests']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;
alter table public.match_callups enable row level security;
alter table public.match_reports enable row level security;
alter table public.event_requests enable row level security;

create policy matches_select on public.matches for select to authenticated
  using (public.is_team_staff(public.event_team(event_id)));
create policy matches_write on public.matches for all to authenticated using (public.is_coord()) with check (public.is_coord());

create policy callups_select on public.match_callups for select to authenticated
  using (public.is_team_staff(public.event_team(event_id)));
create policy callups_write on public.match_callups for all to authenticated using (public.is_coord()) with check (public.is_coord());

create policy reports_select on public.match_reports for select to authenticated
  using (public.is_team_staff(public.event_team(event_id)));
create policy reports_insert on public.match_reports for insert to authenticated
  with check (public.is_team_coach(public.event_team(event_id))
              and (public.is_coord() or public.team_season_open(public.event_team(event_id)))
              and uploaded_by = auth.uid() and replaced_at is null);
create policy reports_update on public.match_reports for update to authenticated
  using (public.is_team_coach(public.event_team(event_id))
         and (public.is_coord() or public.team_season_open(public.event_team(event_id))))
  with check (public.is_team_coach(public.event_team(event_id)));

create policy requests_select on public.event_requests for select to authenticated
  using (public.is_team_staff(public.event_team(event_id)));

-- Almacenamiento privado de actas: <event_id>/<fichero>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actas', 'actas', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create or replace function public.can_coach_event_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id::text = split_part(p_name, '/', 1)
      and public.is_team_coach(e.team_id)
      and (public.is_coord() or public.team_season_open(e.team_id))
  )
$$;

create or replace function public.can_see_event_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.id::text = split_part(p_name, '/', 1) and public.is_team_staff(e.team_id))
$$;

create policy actas_select on storage.objects for select to authenticated
  using (bucket_id = 'actas' and public.can_see_event_path(name));
create policy actas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'actas' and public.can_coach_event_path(name));

-- ---------------------------------------------------------------------------
-- Jugadores esperados: en partidos, solo los convocados
-- ---------------------------------------------------------------------------
create or replace function public.event_roster(p_event uuid)
returns table (player_id uuid, kind public.enrollment_kind, dorsal smallint)
language sql stable security definer set search_path = public as $$
  select distinct on (e.player_id) e.player_id, e.kind, e.dorsal
  from public.events ev
  join public.enrollments e on e.team_id = ev.team_id
  join public.players p on p.id = e.player_id and p.active and p.deleted_at is null
  where ev.id = p_event and public.is_team_staff(ev.team_id)
    and (
      (e.kind = 'sube_puntual' and e.event_id = ev.id)
      or (e.kind <> 'sube_puntual'
          and e.start_date <= (ev.starts_at at time zone 'Europe/Madrid')::date
          and (e.end_date is null or e.end_date >= (ev.starts_at at time zone 'Europe/Madrid')::date))
    )
    and (ev.type <> 'partido' or exists (select 1 from public.match_callups c where c.event_id = ev.id and c.player_id = e.player_id))
  order by e.player_id, (e.kind = 'plantilla') desc
$$;

-- La asistencia solo se registra en actividades confirmadas.
create or replace function public.save_attendance(
  p_event uuid, p_player uuid, p_status public.attendance_status, p_notes text,
  p_base_updated_at timestamptz, p_force boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ev public.events;
  v_cur public.attendance;
  v_new public.attendance;
begin
  select * into v_ev from public.events where id = p_event;
  if v_ev.id is null or not public.is_team_staff(v_ev.team_id) then
    raise exception 'No autorizado';
  end if;
  if not public.is_coord() and not public.team_season_open(v_ev.team_id) then
    raise exception 'La temporada está cerrada';
  end if;
  if v_ev.status in ('pendiente_aprobacion', 'pendiente', 'cancelado') then
    raise exception 'La actividad no está confirmada o está cancelada';
  end if;
  if v_ev.type = 'partido' and not exists (select 1 from public.match_callups where event_id = p_event and player_id = p_player) then
    raise exception 'El jugador no está convocado';
  end if;

  select * into v_cur from public.attendance where event_id = p_event and player_id = p_player for update;

  if not p_force and found
     and v_cur.updated_by is distinct from auth.uid()
     and (p_base_updated_at is null or v_cur.updated_at > p_base_updated_at + interval '1 millisecond')
     and (v_cur.status is distinct from p_status or coalesce(v_cur.notes, '') is distinct from coalesce(p_notes, '')) then
    return jsonb_build_object(
      'conflict', true,
      'server', jsonb_build_object('status', v_cur.status, 'notes', v_cur.notes, 'updated_at', v_cur.updated_at,
        'updated_by', (select full_name from public.profiles where id = v_cur.updated_by)));
  end if;

  insert into public.attendance (event_id, player_id, status, notes, updated_by, updated_at)
  values (p_event, p_player, p_status, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), clock_timestamp())
  on conflict (event_id, player_id) do update
    set status = excluded.status, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_new;

  if p_force then
    insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'CONFLICTO_RESUELTO', 'attendance', p_event || ':' || p_player, to_jsonb(v_cur), to_jsonb(v_new));
  end if;

  return jsonb_build_object('conflict', false, 'updated_at', v_new.updated_at);
end $$;

-- ---------------------------------------------------------------------------
-- RPC de calendario
-- ---------------------------------------------------------------------------

-- Coincidencias de pista (avisa, no bloquea). Para el cuerpo técnico no revela el nombre de otros equipos.
create or replace function public.venue_conflicts(p_venue uuid, p_starts timestamptz, p_ends timestamptz, p_exclude uuid default null)
returns table (event_id uuid, team text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, case when public.is_team_staff(e.team_id) then t.name else 'Otro equipo' end, e.starts_at, e.ends_at
  from public.events e
  join public.teams t on t.id = e.team_id and t.deleted_at is null
  where public.is_active_user() and p_venue is not null
    and e.venue_id = p_venue and e.id is distinct from p_exclude
    and e.status not in ('cancelado', 'pendiente')
    and e.starts_at < p_ends and p_starts < e.ends_at
  order by e.starts_at
$$;

-- Crear actividad. Coordinadora: queda confirmada. Entrenador: queda pendiente de aprobación.
create or replace function public.propose_event(
  p_team uuid, p_type public.event_type, p_starts timestamptz, p_ends timestamptz,
  p_venue uuid default null, p_title text default null, p_notes text default null, p_match jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  if not public.is_team_coach(p_team) then
    raise exception 'No autorizado';
  end if;
  if not public.is_coord() and not public.team_season_open(p_team) then
    raise exception 'La temporada está cerrada';
  end if;
  if p_type = 'partido' and coalesce(btrim(p_match ->> 'opponent'), '') = '' then
    raise exception 'Indica el equipo rival';
  end if;
  insert into public.events (team_id, type, starts_at, ends_at, venue_id, title, notes, extraordinary, status, created_by,
                             resolved_by, resolved_at)
  values (p_team, p_type, p_starts, p_ends, p_venue, nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
          p_type <> 'partido',
          case when public.is_coord() then 'programado' else 'pendiente_aprobacion' end::public.event_status,
          auth.uid(),
          case when public.is_coord() then auth.uid() end, case when public.is_coord() then now() end)
  returning * into v;
  if p_type = 'partido' then
    insert into public.matches (event_id, kind, school, competition, matchday, opponent, home, away_location)
    values (v.id, coalesce((p_match ->> 'kind')::public.match_kind, 'oficial'), coalesce((p_match ->> 'school')::boolean, false),
            nullif(btrim(p_match ->> 'competition'), ''), nullif(btrim(p_match ->> 'matchday'), ''), btrim(p_match ->> 'opponent'),
            coalesce((p_match ->> 'home')::boolean, true), nullif(btrim(p_match ->> 'away_location'), ''));
  end if;
  if public.is_coord() then
    perform public.notify_team_staff(p_team, 'Nueva actividad en el calendario', public.event_label(v), public.event_link(v));
  else
    perform public.notify_coordinators('Propuesta pendiente de aprobación', public.event_label(v), '/solicitudes');
  end if;
  return v.id;
end $$;

create or replace function public.resolve_event_proposal(p_event uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  select * into v from public.events where id = p_event for update;
  if v.status <> 'pendiente_aprobacion' then
    raise exception 'La propuesta ya no está pendiente';
  end if;
  update public.events set
    status = case when p_approve then 'programado' else 'cancelado' end::public.event_status,
    cancel_reason = case when p_approve then null else 'Propuesta rechazada' || coalesce(': ' || nullif(btrim(p_note), ''), '') end,
    resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_event returning * into v;
  perform public.notify_team_staff(v.team_id,
    case when p_approve then 'Propuesta aprobada' else 'Propuesta rechazada' end,
    public.event_label(v) || coalesce(' · ' || nullif(btrim(p_note), ''), ''), public.event_link(v));
end $$;

-- Cancelar una actividad (motivo obligatorio).
create or replace function public.cancel_event(p_event uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  v := public.assert_event_coach(p_event);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'El motivo es obligatorio';
  end if;
  if v.status in ('cancelado', 'finalizado') then
    raise exception 'La actividad ya está cancelada o finalizada';
  end if;
  update public.events set status = 'cancelado', cancel_reason = btrim(p_reason) where id = p_event returning * into v;
  perform public.notify_other_side(v.team_id, 'Actividad cancelada', public.event_label(v) || ' · Motivo: ' || btrim(p_reason), public.event_link(v));
end $$;

-- Observaciones de una actividad.
create or replace function public.set_event_notes(p_event uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_event_coach(p_event);
  update public.events set notes = nullif(btrim(coalesce(p_notes, '')), '') where id = p_event;
end $$;

-- Cambio directo de fecha/hora/pista: coordinadora en cualquier actividad; entrenador solo en partidos.
-- En entrenamientos y demás actividades el entrenador debe enviar una solicitud (request_event_change).
create or replace function public.update_event(p_event uuid, p_starts timestamptz, p_ends timestamptz, p_venue uuid, p_title text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  v := public.assert_event_coach(p_event);
  if not public.is_coord() and v.type <> 'partido' then
    raise exception 'Los cambios de horario o pista requieren solicitud a coordinación';
  end if;
  if v.status in ('cancelado', 'finalizado') then
    raise exception 'La actividad está cancelada o finalizada';
  end if;
  update public.events set starts_at = p_starts, ends_at = p_ends, venue_id = p_venue,
    title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    status = case when status = 'pendiente' then 'aplazado' else status end
  where id = p_event returning * into v;
  perform public.notify_other_side(v.team_id, 'Cambio de horario', public.event_label(v), public.event_link(v));
end $$;

create or replace function public.request_event_change(p_event uuid, p_starts timestamptz, p_ends timestamptz, p_venue uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.events;
  v_id uuid;
begin
  v := public.assert_event_coach(p_event);
  if v.status not in ('programado', 'aplazado') then
    raise exception 'Solo se pueden solicitar cambios de actividades programadas';
  end if;
  if exists (select 1 from public.event_requests where event_id = p_event and status = 'pendiente') then
    raise exception 'Ya hay una solicitud pendiente para esta actividad';
  end if;
  insert into public.event_requests (event_id, requested_by, new_starts_at, new_ends_at, new_venue_id, reason)
  values (p_event, auth.uid(), p_starts, p_ends, p_venue, btrim(p_reason)) returning id into v_id;
  perform public.notify_coordinators('Solicitud de cambio de horario/pista', public.event_label(v) || ' · ' || btrim(p_reason), '/solicitudes');
  return v_id;
end $$;

create or replace function public.resolve_event_request(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.event_requests;
  v public.events;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  select * into r from public.event_requests where id = p_request for update;
  if r.status <> 'pendiente' then
    raise exception 'La solicitud ya no está pendiente';
  end if;
  update public.event_requests set status = case when p_approve then 'aprobada' else 'rechazada' end::public.request_status,
    resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_request;
  if p_approve then
    update public.events set starts_at = r.new_starts_at, ends_at = r.new_ends_at, venue_id = r.new_venue_id
    where id = r.event_id returning * into v;
  else
    select * into v from public.events where id = r.event_id;
  end if;
  perform public.notify_team_staff(v.team_id,
    case when p_approve then 'Cambio aprobado' else 'Cambio rechazado' end,
    public.event_label(v) || coalesce(' · ' || nullif(btrim(p_note), ''), ''), public.event_link(v));
end $$;

create or replace function public.cancel_event_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.event_requests set status = 'anulada', resolved_by = auth.uid(), resolved_at = now()
  where id = p_request and status = 'pendiente' and (requested_by = auth.uid() or public.is_coord());
  if not found then
    raise exception 'No se puede anular esta solicitud';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC de partidos
-- ---------------------------------------------------------------------------
create or replace function public.assert_match_coach(p_event uuid)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  v := public.assert_event_coach(p_event);
  if v.type <> 'partido' then
    raise exception 'La actividad no es un partido';
  end if;
  return v;
end $$;

create or replace function public.update_match(p_event uuid, p_match jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  v := public.assert_match_coach(p_event);
  if coalesce(btrim(p_match ->> 'opponent'), '') = '' then
    raise exception 'Indica el equipo rival';
  end if;
  update public.matches set
    kind = coalesce((p_match ->> 'kind')::public.match_kind, kind),
    school = coalesce((p_match ->> 'school')::boolean, school),
    competition = nullif(btrim(p_match ->> 'competition'), ''),
    matchday = nullif(btrim(p_match ->> 'matchday'), ''),
    opponent = btrim(p_match ->> 'opponent'),
    home = coalesce((p_match ->> 'home')::boolean, home),
    away_location = nullif(btrim(p_match ->> 'away_location'), '')
  where event_id = p_event;
  perform public.notify_other_side(v.team_id, 'Datos de partido modificados', public.event_label(v), public.event_link(v));
end $$;

-- Aplazar: con nueva fecha → «Aplazado»; sin fecha → «Partido pendiente». Se conserva la fecha original.
create or replace function public.postpone_match(p_event uuid, p_reason text, p_starts timestamptz default null, p_ends timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  v := public.assert_match_coach(p_event);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'El motivo del aplazamiento es obligatorio';
  end if;
  if v.status not in ('programado', 'aplazado', 'pendiente') then
    raise exception 'Solo se pueden aplazar partidos programados';
  end if;
  update public.events set
    original_starts_at = coalesce(original_starts_at, starts_at),
    postpone_reason = btrim(p_reason),
    status = case when p_starts is null then 'pendiente' else 'aplazado' end::public.event_status,
    starts_at = coalesce(p_starts, starts_at),
    ends_at = coalesce(p_ends, case when p_starts is not null then p_starts + (ends_at - starts_at) end, ends_at)
  where id = p_event returning * into v;
  perform public.notify_other_side(v.team_id,
    case when p_starts is null then 'Partido aplazado sin fecha' else 'Partido aplazado' end,
    public.event_label(v) || ' · Motivo: ' || btrim(p_reason), public.event_link(v));
end $$;

-- Convocatoria: jugadores del equipo vigentes en la fecha del partido (plantilla, suben habituales y puntuales del partido).
create or replace function public.set_callup(p_event uuid, p_players uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v public.events;
  v_day date;
  v_bad int;
  v_n int;
begin
  v := public.assert_match_coach(p_event);
  if v.status in ('pendiente_aprobacion', 'cancelado') then
    raise exception 'El partido no está aprobado o está cancelado';
  end if;
  v_day := (v.starts_at at time zone 'Europe/Madrid')::date;
  select count(*) into v_bad from unnest(coalesce(p_players, '{}')) pid
  where not exists (
    select 1 from public.enrollments e join public.players pl on pl.id = e.player_id and pl.active and pl.deleted_at is null
    where e.player_id = pid and e.team_id = v.team_id
      and ((e.kind = 'sube_puntual' and e.event_id = p_event)
           or (e.kind <> 'sube_puntual' and e.start_date <= v_day and (e.end_date is null or e.end_date >= v_day))));
  if v_bad > 0 then
    raise exception 'Hay jugadores que no pertenecen al equipo en la fecha del partido';
  end if;
  delete from public.match_callups where event_id = p_event and player_id <> all (coalesce(p_players, '{}'));
  insert into public.match_callups (event_id, player_id, created_by)
  select p_event, pid, auth.uid() from unnest(coalesce(p_players, '{}')) pid
  on conflict do nothing;
  select count(*) into v_n from public.match_callups where event_id = p_event;
  return v_n;
end $$;

-- Resultado (introducir o corregir): marca el partido como finalizado y avisa a coordinación.
create or replace function public.save_match_result(
  p_event uuid, p_for int, p_against int, p_periods jsonb default '[]'::jsonb,
  p_incidents text default null, p_suspended boolean default false, p_staff uuid[] default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v public.events;
  m public.matches;
begin
  v := public.assert_match_coach(p_event);
  if v.status in ('pendiente_aprobacion', 'cancelado', 'pendiente') then
    raise exception 'El partido no está programado';
  end if;
  if p_for is null or p_against is null or p_for < 0 or p_against < 0 then
    raise exception 'Indica el marcador de ambos equipos';
  end if;
  if jsonb_typeof(coalesce(p_periods, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato de periodos no válido';
  end if;
  select * into m from public.matches where event_id = p_event;
  update public.matches set score_for = p_for, score_against = p_against, periods = coalesce(p_periods, '[]'::jsonb),
    incidents = nullif(btrim(coalesce(p_incidents, '')), ''), suspended = coalesce(p_suspended, false),
    staff_present = coalesce(p_staff, '{}'), result_by = auth.uid(), result_at = now()
  where event_id = p_event;
  update public.events set status = 'finalizado' where id = p_event;
  perform public.notify_coordinators(
    case when m.score_for is null then 'Resultado registrado' else 'Resultado corregido' end,
    public.event_label(v) || format(' · %s-%s%s', p_for, p_against, case when p_suspended then ' (suspendido)' else '' end),
    public.event_link(v));
end $$;

-- Aviso al subir o sustituir un acta.
create or replace function public.match_reports_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  select * into v from public.events where id = new.event_id;
  perform public.notify_other_side(v.team_id, 'Acta adjuntada', public.event_label(v) || ' · ' || new.file_name, public.event_link(v));
  return new;
end $$;
create trigger match_reports_notify after insert on public.match_reports for each row execute function public.match_reports_notify();

-- ---------------------------------------------------------------------------
-- Cierre de temporada: incluye partidos sin finalizar y solicitudes pendientes
-- ---------------------------------------------------------------------------
create or replace function public.season_close_check(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pending jsonb;
  v_matches jsonb;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'team'), '[]'::jsonb) into v_pending from (
    select jsonb_build_object('team', t.name, 'events', count(distinct ev.id)) as x
    from public.events ev
    join public.teams t on t.id = ev.team_id and t.season_id = p_season and t.deleted_at is null
    cross join lateral public.event_roster(ev.id) r
    left join public.attendance a on a.event_id = ev.id and a.player_id = r.player_id
    where ev.status in ('programado', 'aplazado', 'finalizado') and ev.starts_at < now()
      and coalesce(a.status, 'sin_registrar') = 'sin_registrar'
    group by t.name
  ) q;
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb) into v_matches from (
    select jsonb_build_object('team', t.name, 'opponent', m.opponent, 'starts_at', ev.starts_at, 'status', ev.status) as x
    from public.events ev
    join public.matches m on m.event_id = ev.id
    join public.teams t on t.id = ev.team_id and t.season_id = p_season and t.deleted_at is null
    where ev.status in ('pendiente_aprobacion', 'programado', 'aplazado', 'pendiente')
  ) q;
  return jsonb_build_object(
    'teams', (select count(*) from public.teams where season_id = p_season and deleted_at is null),
    'players', (select count(distinct e.player_id) from public.enrollments e join public.teams t on t.id = e.team_id
                where t.season_id = p_season and t.deleted_at is null),
    'staff', (select count(distinct ts.user_id) from public.team_staff ts join public.teams t on t.id = ts.team_id
              where t.season_id = p_season and t.deleted_at is null),
    'events_past', (select count(*) from public.events ev join public.teams t on t.id = ev.team_id
                    where t.season_id = p_season and ev.starts_at < now() and ev.status in ('programado', 'aplazado', 'finalizado')),
    'pending_attendance', v_pending,
    'unfinished_matches', v_matches,
    'pending_requests', (
      (select count(*) from public.event_requests r join public.events ev on ev.id = r.event_id
         join public.teams t on t.id = ev.team_id and t.season_id = p_season where r.status = 'pendiente')
      + (select count(*) from public.events ev join public.teams t on t.id = ev.team_id and t.season_id = p_season
         where ev.status = 'pendiente_aprobacion'))
  );
end $$;

revoke execute on function public.event_label(public.events) from public, anon;
revoke execute on function public.assert_event_coach(uuid) from public, anon, authenticated;
revoke execute on function public.assert_match_coach(uuid) from public, anon, authenticated;
revoke execute on function public.match_reports_notify() from public, anon, authenticated;
