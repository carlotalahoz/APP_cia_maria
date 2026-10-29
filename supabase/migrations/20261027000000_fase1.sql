-- AD Compañía de María · Fase 1
-- Identidad y roles, temporadas, categorías, equipos, jugadores, asistencia y auditoría mínima.

create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('coordinadora', 'principal', 'ayudante', 'delegado');
create type public.staff_role as enum ('principal', 'ayudante', 'delegado');
create type public.season_status as enum ('activa', 'cerrada');
create type public.team_branch as enum ('femenino', 'masculino', 'mixto');
create type public.enrollment_kind as enum ('plantilla', 'sube_habitual', 'sube_puntual');
create type public.event_type as enum ('entrenamiento', 'partido');
create type public.event_status as enum ('programado', 'cancelado');
create type public.attendance_status as enum (
  'sin_registrar', 'asistencia', 'retraso', 'lesion', 'viaje', 'estudios', 'medico', 'injustificada'
);

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'delegado',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  status public.season_status not null default 'activa',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  branch public.team_branch not null,
  code varchar(4) not null check (char_length(code) between 1 and 4),
  name text not null,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season_id, code)
);

create table public.training_slots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lunes (ISO)
  start_time time not null,
  end_time time not null,
  venue_id uuid references public.venues (id),
  check (end_time > start_time)
);

create table public.team_staff (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  staff_role public.staff_role not null,
  primary key (team_id, user_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  birth_date date not null,
  gir text,
  dni text,
  address text,
  city text,
  postal_code text,
  phone text,
  email text,
  allergies text,
  size text,
  father_name text,
  father_phone text,
  mother_name text,
  mother_phone text,
  photo_url text,
  license_number text,
  position text,
  observations text,
  active boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_name_idx on public.players (lower(last_name), lower(first_name));

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  kind public.enrollment_kind not null default 'plantilla',
  dorsal smallint check (dorsal between 0 and 99),
  start_date date not null default current_date,
  end_date date,
  event_id uuid, -- solo para 'sube_puntual'
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index enrollments_team_idx on public.enrollments (team_id);
create index enrollments_player_idx on public.enrollments (player_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  type public.event_type not null default 'entrenamiento',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_id uuid references public.venues (id),
  status public.event_status not null default 'programado',
  cancel_reason text,
  extraordinary boolean not null default false,
  slot_id uuid references public.training_slots (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'cancelado' or coalesce(btrim(cancel_reason), '') <> '')
);
create index events_team_time_idx on public.events (team_id, starts_at);
create unique index events_slot_unique on public.events (slot_id, starts_at) where slot_id is not null;

alter table public.enrollments
  add constraint enrollments_event_fk foreign key (event_id) references public.events (id) on delete cascade,
  add constraint enrollments_puntual_event check ((kind = 'sube_puntual') = (event_id is not null));

create table public.attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.attendance_status not null default 'sin_registrar',
  notes text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de autorización (security definer para evitar recursión RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_coord()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'coordinadora')
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.my_team_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ts.team_id from public.team_staff ts
  join public.profiles p on p.id = ts.user_id and p.active
  where ts.user_id = auth.uid()
$$;

create or replace function public.is_team_staff(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or p_team in (select public.my_team_ids())
$$;

create or replace function public.is_team_principal(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.team_staff ts join public.profiles p on p.id = ts.user_id and p.active
    where ts.team_id = p_team and ts.user_id = auth.uid() and ts.staff_role = 'principal'
  )
$$;

create or replace function public.can_see_player(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.enrollments e
    join public.players pl on pl.id = e.player_id and pl.deleted_at is null and pl.active
    where e.player_id = p_player and e.team_id in (select public.my_team_ids())
  )
$$;

create or replace function public.can_edit_player(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.enrollments e
    join public.players pl on pl.id = e.player_id and pl.deleted_at is null and pl.active
    join public.team_staff ts on ts.team_id = e.team_id and ts.user_id = auth.uid() and ts.staff_role = 'principal'
    join public.profiles p on p.id = ts.user_id and p.active
    join public.teams t on t.id = e.team_id
    join public.seasons s on s.id = t.season_id and s.status = 'activa'
    where e.player_id = p_player
      and (e.end_date is null or e.end_date >= current_date)
  )
$$;

create or replace function public.team_season_open(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams t join public.seasons s on s.id = t.season_id
    where t.id = p_team and s.status = 'activa'
  )
$$;

-- ---------------------------------------------------------------------------
-- Notificaciones internas
-- ---------------------------------------------------------------------------
create or replace function public.notify_coordinators(p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select id, p_title, p_body, p_link from public.profiles
  where role = 'coordinadora' and active and id is distinct from auth.uid()
$$;
revoke execute on function public.notify_coordinators(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auditoría genérica
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_id := coalesce(to_jsonb(old) ->> 'id', (to_jsonb(old) ->> 'event_id') || ':' || (to_jsonb(old) ->> 'player_id'));
    insert into public.audit_log (user_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'DELETE', tg_table_name, v_id, to_jsonb(old));
    return old;
  end if;
  v_id := coalesce(to_jsonb(new) ->> 'id', (to_jsonb(new) ->> 'event_id') || ':' || (to_jsonb(new) ->> 'player_id'));
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

do $$
declare t text;
begin
  foreach t in array array['profiles','seasons','categories','venues','teams','training_slots','team_staff','players','enrollments','attendance']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger players_touch before update on public.players for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Perfiles: alta automática al crear el usuario en auth (solo vía administración)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_app_meta_data ->> 'app_role')::public.app_role, 'delegado')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo la coordinadora cambia rol/estado; el resto solo su nombre (y se avisa a coordinación).
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_coord() or auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role or new.active is distinct from old.active
     or new.email is distinct from old.email or new.id <> old.id then
    raise exception 'Solo la coordinadora puede cambiar rol, estado o correo';
  end if;
  if new.full_name is distinct from old.full_name then
    perform public.notify_coordinators('Datos de usuario modificados',
      format('%s ha modificado sus datos personales.', new.full_name), '/usuarios');
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Jugadores: reglas de edición y avisos
-- ---------------------------------------------------------------------------
create or replace function public.players_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_coord() or auth.uid() is null then
    return new;
  end if;
  if new.active is distinct from old.active or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Solo la coordinadora puede desactivar, eliminar o reactivar jugadores';
  end if;
  perform public.notify_coordinators('Ficha de jugador modificada',
    format('Se han modificado los datos de %s %s.', new.first_name, new.last_name), '/jugadores/' || new.id);
  return new;
end $$;
create trigger players_guard before update on public.players for each row execute function public.players_guard();

-- Temporadas cerradas: solo la coordinadora corrige históricos.
create or replace function public.closed_season_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
begin
  if public.is_coord() or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'attendance' then
    select team_id into v_team from public.events where id = coalesce(new.event_id, old.event_id);
  else
    v_team := coalesce(new.team_id, old.team_id);
  end if;
  if not public.team_season_open(v_team) then
    raise exception 'La temporada está cerrada; solo la coordinadora puede corregir datos históricos';
  end if;
  return coalesce(new, old);
end $$;
create trigger attendance_closed_guard before insert or update or delete on public.attendance
  for each row execute function public.closed_season_guard();
create trigger enrollments_closed_guard before insert or update or delete on public.enrollments
  for each row execute function public.closed_season_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.categories enable row level security;
alter table public.venues enable row level security;
alter table public.teams enable row level security;
alter table public.training_slots enable row level security;
alter table public.team_staff enable row level security;
alter table public.players enable row level security;
alter table public.enrollments enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_coord()) with check (id = auth.uid() or public.is_coord());

-- catálogos
create policy seasons_select on public.seasons for select to authenticated using (public.is_active_user());
create policy seasons_write on public.seasons for all to authenticated using (public.is_coord()) with check (public.is_coord());
create policy categories_select on public.categories for select to authenticated using (public.is_active_user());
create policy categories_write on public.categories for all to authenticated using (public.is_coord()) with check (public.is_coord());
create policy venues_select on public.venues for select to authenticated using (public.is_active_user());
create policy venues_write on public.venues for all to authenticated using (public.is_coord()) with check (public.is_coord());

-- equipos
create policy teams_select on public.teams for select to authenticated
  using (public.is_coord() or (deleted_at is null and id in (select public.my_team_ids())));
create policy teams_write on public.teams for all to authenticated using (public.is_coord()) with check (public.is_coord());
create policy slots_select on public.training_slots for select to authenticated using (public.is_team_staff(team_id));
create policy slots_write on public.training_slots for all to authenticated using (public.is_coord()) with check (public.is_coord());
create policy staff_select on public.team_staff for select to authenticated using (public.is_team_staff(team_id));
create policy staff_write on public.team_staff for all to authenticated using (public.is_coord()) with check (public.is_coord());

-- jugadores (alta vía RPC create_player_in_team)
create policy players_select on public.players for select to authenticated using (public.can_see_player(id));
create policy players_insert on public.players for insert to authenticated with check (public.is_coord());
create policy players_update on public.players for update to authenticated
  using (public.can_edit_player(id)) with check (public.is_coord() or (deleted_at is null and active));
create policy players_delete on public.players for delete to authenticated using (public.is_coord());

-- adscripciones
create policy enrollments_select on public.enrollments for select to authenticated using (public.is_team_staff(team_id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.is_team_principal(team_id)) with check (public.is_team_principal(team_id));

-- eventos
create policy events_select on public.events for select to authenticated using (public.is_team_staff(team_id));
create policy events_write on public.events for all to authenticated using (public.is_coord()) with check (public.is_coord());

-- asistencia: todo el cuerpo técnico del equipo (principal, ayudantes, delegados)
create policy attendance_select on public.attendance for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_team_staff(e.team_id)));
create policy attendance_write on public.attendance for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_team_staff(e.team_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and public.is_team_staff(e.team_id)));

-- notificaciones
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- auditoría: solo coordinadora
create policy audit_select on public.audit_log for select to authenticated using (public.is_coord());

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Posibles duplicados: devuelve datos mínimos para poder vincular la ficha existente.
create or replace function public.find_player_duplicates(p_first text, p_last text, p_birth date)
returns table (id uuid, first_name text, last_name text, birth_date date, teams text)
language sql stable security definer set search_path = public as $$
  select pl.id, pl.first_name, pl.last_name, pl.birth_date,
    (select string_agg(distinct t.name || ' (' || s.name || ')', ', ')
       from public.enrollments e join public.teams t on t.id = e.team_id join public.seasons s on s.id = t.season_id
      where e.player_id = pl.id)
  from public.players pl
  where public.is_active_user()
    and pl.deleted_at is null
    and (
      (lower(unaccent(pl.first_name)) = lower(unaccent(btrim(p_first)))
        and lower(unaccent(pl.last_name)) = lower(unaccent(btrim(p_last))))
      or (pl.birth_date = p_birth and lower(unaccent(pl.last_name)) = lower(unaccent(btrim(p_last))))
    )
  limit 10
$$;

create or replace function public.create_player_in_team(
  p_team uuid, p_player jsonb, p_dorsal smallint default null,
  p_kind public.enrollment_kind default 'plantilla'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_team_name text;
begin
  if not public.is_team_principal(p_team) then
    raise exception 'No autorizado para dar de alta jugadores en este equipo';
  end if;
  if not public.is_coord() and not public.team_season_open(p_team) then
    raise exception 'La temporada está cerrada';
  end if;
  insert into public.players (
    first_name, last_name, birth_date, gir, dni, address, city, postal_code, phone, email, allergies, size,
    father_name, father_phone, mother_name, mother_phone, license_number, position, observations, created_by
  ) values (
    btrim(p_player ->> 'first_name'), btrim(p_player ->> 'last_name'), (p_player ->> 'birth_date')::date,
    p_player ->> 'gir', p_player ->> 'dni', p_player ->> 'address', p_player ->> 'city', p_player ->> 'postal_code',
    p_player ->> 'phone', p_player ->> 'email', p_player ->> 'allergies', p_player ->> 'size',
    p_player ->> 'father_name', p_player ->> 'father_phone', p_player ->> 'mother_name', p_player ->> 'mother_phone',
    p_player ->> 'license_number', p_player ->> 'position', p_player ->> 'observations', auth.uid()
  ) returning id into v_id;
  insert into public.enrollments (player_id, team_id, kind, dorsal) values (v_id, p_team, p_kind, p_dorsal);
  select name into v_team_name from public.teams where id = p_team;
  perform public.notify_coordinators('Nuevo jugador',
    format('Alta de %s %s en %s.', p_player ->> 'first_name', p_player ->> 'last_name', v_team_name),
    '/jugadores/' || v_id);
  return v_id;
end $$;

-- Vincula una ficha existente (evita duplicados). Para jugadores que suben avisa también al equipo de origen.
create or replace function public.link_player_to_team(
  p_team uuid, p_player uuid, p_kind public.enrollment_kind default 'plantilla',
  p_dorsal smallint default null, p_event uuid default null, p_end date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text;
  v_team_name text;
begin
  if p_kind = 'plantilla' and not public.is_team_principal(p_team) then
    raise exception 'No autorizado';
  end if;
  if p_kind <> 'plantilla' and not public.is_team_staff(p_team) then
    raise exception 'No autorizado';
  end if;
  if not public.is_coord() and not public.team_season_open(p_team) then
    raise exception 'La temporada está cerrada';
  end if;
  if exists (select 1 from public.players where id = p_player and (deleted_at is not null or not active)) then
    raise exception 'El jugador está inactivo o en la papelera; contacta con coordinación';
  end if;
  insert into public.enrollments (player_id, team_id, kind, dorsal, event_id, end_date)
  values (p_player, p_team, p_kind, p_dorsal, p_event, p_end) returning id into v_id;

  select first_name || ' ' || last_name into v_name from public.players where id = p_player;
  select name into v_team_name from public.teams where id = p_team;
  perform public.notify_coordinators(
    case when p_kind = 'plantilla' then 'Jugador vinculado' else 'Jugador que sube' end,
    format('%s se ha incorporado a %s (%s).', v_name, v_team_name, replace(p_kind::text, '_', ' ')),
    '/jugadores/' || p_player);
  if p_kind <> 'plantilla' then
    insert into public.notifications (user_id, title, body, link)
    select distinct ts.user_id, 'Jugador que sube',
      format('%s se ha incorporado a %s (%s).', v_name, v_team_name, replace(p_kind::text, '_', ' ')),
      '/jugadores/' || p_player
    from public.enrollments e
    join public.team_staff ts on ts.team_id = e.team_id and ts.staff_role = 'principal'
    where e.player_id = p_player and e.kind = 'plantilla' and e.team_id <> p_team and e.end_date is null
      and ts.user_id is distinct from auth.uid();
  end if;
  return v_id;
end $$;

-- Genera los entrenamientos de la temporada a partir de los horarios fijos del equipo.
create or replace function public.generate_training_sessions(p_team uuid, p_from date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_start date;
  v_end date;
  v_count int;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora genera entrenamientos';
  end if;
  select greatest(s.start_date, coalesce(p_from, s.start_date)), s.end_date into v_start, v_end
  from public.teams t join public.seasons s on s.id = t.season_id where t.id = p_team;

  with ins as (
    insert into public.events (team_id, type, starts_at, ends_at, venue_id, slot_id)
    select p_team, 'entrenamiento',
      (d::date + sl.start_time) at time zone 'Europe/Madrid',
      (d::date + sl.end_time) at time zone 'Europe/Madrid',
      sl.venue_id, sl.id
    from public.training_slots sl
    cross join generate_series(v_start, v_end, interval '1 day') d
    where sl.team_id = p_team and extract(isodow from d) = sl.weekday
    on conflict (slot_id, starts_at) where slot_id is not null do nothing
    returning 1
  ) select count(*) into v_count from ins;
  return v_count;
end $$;

-- Conflictos de pista/horario (avisa, no bloquea).
create or replace function public.slot_conflicts(p_season uuid)
returns table (venue text, weekday smallint, team_a text, team_b text, a_start time, a_end time, b_start time, b_end time)
language sql stable security definer set search_path = public as $$
  select v.name, a.weekday, ta.name, tb.name, a.start_time, a.end_time, b.start_time, b.end_time
  from public.training_slots a
  join public.training_slots b on a.venue_id = b.venue_id and a.weekday = b.weekday and a.id < b.id
    and a.start_time < b.end_time and b.start_time < a.end_time
  join public.teams ta on ta.id = a.team_id and ta.season_id = p_season and ta.deleted_at is null
  join public.teams tb on tb.id = b.team_id and tb.season_id = p_season and tb.deleted_at is null
  join public.venues v on v.id = a.venue_id
  where public.is_coord()
$$;

-- Jugadores esperados en un evento (plantilla y suben habituales vigentes, puntuales del evento).
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
  order by e.player_id, (e.kind = 'plantilla') desc
$$;

-- Guardado de asistencia con detección de conflictos (para sincronización offline).
-- p_base_updated_at: valor que el cliente conocía; null si creía que no había registro.
create or replace function public.save_attendance(
  p_event uuid, p_player uuid, p_status public.attendance_status, p_notes text,
  p_base_updated_at timestamptz, p_force boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_cur public.attendance;
  v_new public.attendance;
begin
  select team_id into v_team from public.events where id = p_event;
  if v_team is null or not public.is_team_staff(v_team) then
    raise exception 'No autorizado';
  end if;
  if not public.is_coord() and not public.team_season_open(v_team) then
    raise exception 'La temporada está cerrada';
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

-- Resumen previo al cierre de temporada.
create or replace function public.season_close_check(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pending jsonb;
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
    where ev.status = 'programado' and ev.starts_at < now()
      and coalesce(a.status, 'sin_registrar') = 'sin_registrar'
    group by t.name
  ) q;
  return jsonb_build_object(
    'teams', (select count(*) from public.teams where season_id = p_season and deleted_at is null),
    'players', (select count(distinct e.player_id) from public.enrollments e join public.teams t on t.id = e.team_id
                where t.season_id = p_season and t.deleted_at is null),
    'staff', (select count(distinct ts.user_id) from public.team_staff ts join public.teams t on t.id = ts.team_id
              where t.season_id = p_season and t.deleted_at is null),
    'events_past', (select count(*) from public.events ev join public.teams t on t.id = ev.team_id
                    where t.season_id = p_season and ev.starts_at < now() and ev.status = 'programado'),
    'pending_attendance', v_pending
  );
end $$;

create or replace function public.close_season(p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  update public.seasons set status = 'cerrada', closed_at = now() where id = p_season;
end $$;

-- Copia equipos de una temporada a otra, con continuidad opcional de jugadores y técnicos.
create or replace function public.copy_teams(p_from uuid, p_to uuid, p_team_ids uuid[], p_players boolean, p_staff boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_new uuid;
  v_count int := 0;
  v_start date;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  select start_date into v_start from public.seasons where id = p_to;
  for r in select * from public.teams where season_id = p_from and deleted_at is null and id = any(p_team_ids) loop
    insert into public.teams (season_id, category_id, branch, code, name)
    values (p_to, r.category_id, r.branch, r.code, r.name) returning id into v_new;
    insert into public.training_slots (team_id, weekday, start_time, end_time, venue_id)
    select v_new, weekday, start_time, end_time, venue_id from public.training_slots where team_id = r.id;
    if p_staff then
      insert into public.team_staff (team_id, user_id, staff_role)
      select v_new, ts.user_id, ts.staff_role from public.team_staff ts
      join public.profiles p on p.id = ts.user_id and p.active where ts.team_id = r.id;
    end if;
    if p_players then
      insert into public.enrollments (player_id, team_id, kind, dorsal, start_date)
      select distinct on (e.player_id) e.player_id, v_new, 'plantilla', e.dorsal, v_start
      from public.enrollments e join public.players p on p.id = e.player_id and p.active and p.deleted_at is null
      where e.team_id = r.id and e.kind = 'plantilla';
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Papelera (coordinadora)
create or replace function public.purge_player(p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  delete from public.players where id = p_player and deleted_at is not null;
end $$;

grant usage on schema public to authenticated;
revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
