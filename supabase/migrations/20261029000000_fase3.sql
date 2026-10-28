-- AD Compañía de María · Fase 3
-- Documentación, incidencias, exportaciones, notificaciones en tiempo real y copias de seguridad.

create type public.doc_owner as enum ('jugador', 'tecnico');
create type public.doc_status as enum ('pendiente', 'aprobado', 'rechazado');

-- Restauración en curso: desactiva auditoría y avisos automáticos.
create or replace function public.is_restoring()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.restoring', true), '') = 'on'
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner public.doc_owner not null default 'jugador',
  required boolean not null default false,
  per_season boolean not null default false,
  reserved boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  unique (owner, name)
);

create table public.player_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  type_id uuid not null references public.document_types (id),
  season_id uuid references public.seasons (id),
  path text not null unique,
  file_name text not null,
  mime text,
  size int,
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index player_documents_player_idx on public.player_documents (player_id);

create table public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type_id uuid not null references public.document_types (id),
  season_id uuid references public.seasons (id),
  path text not null unique,
  file_name text not null,
  mime text,
  size int,
  status public.doc_status not null default 'pendiente',
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text,
  deleted_at timestamptz
);
create index staff_documents_user_idx on public.staff_documents (user_id);

create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  category text not null default 'General',
  path text not null unique,
  file_name text not null,
  mime text,
  size int,
  reserved boolean not null default false,
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) default auth.uid(),
  title text not null check (btrim(title) <> ''),
  description text,
  status text not null default 'abierta' check (status in ('abierta', 'resuelta')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text
);

create table public.backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  kind text not null check (kind in ('automatica', 'manual', 'previa_restauracion')),
  status text not null check (status in ('ok', 'error')),
  counts jsonb,
  data jsonb,
  error text,
  restored_at timestamptz
);
create index backups_created_idx on public.backups (created_at desc);

-- ---------------------------------------------------------------------------
-- Autorización
-- ---------------------------------------------------------------------------
-- Gestionan documentos de un jugador: coordinadora, o principal/ayudante de un equipo actual del jugador con temporada abierta.
create or replace function public.can_manage_player_docs(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.enrollments e
    join public.teams t on t.id = e.team_id and t.deleted_at is null
    join public.seasons s on s.id = t.season_id and s.status = 'activa'
    where e.player_id = p_player and (e.end_date is null or e.end_date >= current_date)
      and public.is_team_coach(e.team_id)
  )
$$;

create or replace function public.is_any_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.team_staff ts join public.profiles p on p.id = ts.user_id and p.active
    where ts.user_id = auth.uid() and ts.staff_role in ('principal', 'ayudante'))
$$;

create or replace function public.type_reserved(p_type uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select reserved from public.document_types where id = p_type), false)
$$;

-- ---------------------------------------------------------------------------
-- Auditoría (omitida durante restauraciones) y tablas nuevas
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_row jsonb;
begin
  if public.is_restoring() then
    return coalesce(new, old);
  end if;
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

do $$
declare t text;
begin
  foreach t in array array['document_types','player_documents','staff_documents','library_documents','incidents']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

create or replace function public.match_reports_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v public.events;
begin
  if public.is_restoring() then
    return new;
  end if;
  select * into v from public.events where id = new.event_id;
  perform public.notify_other_side(v.team_id, 'Acta adjuntada', public.event_label(v) || ' · ' || new.file_name, public.event_link(v));
  return new;
end $$;

-- Documentos de jugador: el cuerpo técnico solo puede enviar a la papelera; restaurar y editar es de coordinación.
create or replace function public.player_documents_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if public.is_restoring() then
    return coalesce(new, old);
  end if;
  select first_name || ' ' || last_name into v_name from public.players where id = coalesce(new.player_id, old.player_id);
  if tg_op = 'INSERT' then
    if not public.is_coord() then
      perform public.notify_coordinators('Documento de jugador presentado',
        format('%s · %s', v_name, (select name from public.document_types where id = new.type_id)), '/jugadores/' || new.player_id);
    end if;
    return new;
  end if;
  if not public.is_coord() then
    if (to_jsonb(new) - 'deleted_at' - 'deleted_by') <> (to_jsonb(old) - 'deleted_at' - 'deleted_by') or new.deleted_at is null then
      raise exception 'Solo la coordinadora puede modificar o restaurar documentos';
    end if;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := auth.uid();
    if not public.is_coord() then
      perform public.notify_coordinators('Documento eliminado',
        format('%s · %s (recuperable desde la papelera)', v_name, new.file_name), '/papelera');
    end if;
  end if;
  return new;
end $$;
create trigger player_documents_guard before insert or update on public.player_documents
  for each row execute function public.player_documents_guard();

-- Documentos de técnicos: los que suben los propios técnicos quedan pendientes de aprobación.
create or replace function public.staff_documents_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_restoring() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if public.is_coord() then
      new.status := 'aprobado';
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    else
      new.status := 'pendiente';
      perform public.notify_coordinators('Documento de técnico pendiente de aprobación',
        format('%s · %s', (select full_name from public.profiles where id = new.user_id),
               (select name from public.document_types where id = new.type_id)), '/documentacion');
    end if;
    return new;
  end if;
  if not public.is_coord() then
    raise exception 'Solo la coordinadora puede modificar documentos de técnicos';
  end if;
  return new;
end $$;
create trigger staff_documents_guard before insert or update on public.staff_documents
  for each row execute function public.staff_documents_guard();

create or replace function public.incidents_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_restoring() then
    return new;
  end if;
  perform public.notify_coordinators('Incidencia comunicada',
    format('%s: %s', (select full_name from public.profiles where id = new.user_id), new.title), '/incidencias');
  return new;
end $$;
create trigger incidents_notify after insert on public.incidents for each row execute function public.incidents_notify();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.document_types enable row level security;
alter table public.player_documents enable row level security;
alter table public.staff_documents enable row level security;
alter table public.library_documents enable row level security;
alter table public.incidents enable row level security;
alter table public.backups enable row level security;

create policy doctypes_select on public.document_types for select to authenticated using (public.is_active_user());
create policy doctypes_write on public.document_types for all to authenticated using (public.is_coord()) with check (public.is_coord());

create policy pdocs_select on public.player_documents for select to authenticated
  using (public.can_see_player(player_id) and (public.is_coord() or (deleted_at is null and not public.type_reserved(type_id))));
create policy pdocs_insert on public.player_documents for insert to authenticated
  with check (public.can_manage_player_docs(player_id) and (public.is_coord() or not public.type_reserved(type_id))
              and uploaded_by = auth.uid() and deleted_at is null);
create policy pdocs_update on public.player_documents for update to authenticated
  using (public.can_manage_player_docs(player_id) and (public.is_coord() or not public.type_reserved(type_id)))
  with check (public.can_manage_player_docs(player_id));
create policy pdocs_delete on public.player_documents for delete to authenticated using (public.is_coord());

create policy sdocs_select on public.staff_documents for select to authenticated
  using (public.is_coord() or (user_id = auth.uid() and deleted_at is null));
create policy sdocs_insert on public.staff_documents for insert to authenticated
  with check ((public.is_coord() or (user_id = auth.uid() and public.is_active_user())) and uploaded_by = auth.uid());
create policy sdocs_update on public.staff_documents for update to authenticated using (public.is_coord()) with check (public.is_coord());
create policy sdocs_delete on public.staff_documents for delete to authenticated using (public.is_coord());

create policy lib_select on public.library_documents for select to authenticated
  using (public.is_coord() or (public.is_active_user() and deleted_at is null and not reserved));
create policy lib_insert on public.library_documents for insert to authenticated
  with check (public.is_any_coach() and uploaded_by = auth.uid() and (public.is_coord() or not reserved));
create policy lib_update on public.library_documents for update to authenticated
  using (public.is_coord() or (uploaded_by = auth.uid() and deleted_at is null))
  with check (public.is_coord() or (uploaded_by = auth.uid() and not reserved));
create policy lib_delete on public.library_documents for delete to authenticated using (public.is_coord());

create policy incidents_select on public.incidents for select to authenticated using (public.is_coord() or user_id = auth.uid());
create policy incidents_insert on public.incidents for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user() and status = 'abierta');
create policy incidents_update on public.incidents for update to authenticated using (public.is_coord()) with check (public.is_coord());

create policy backups_select on public.backups for select to authenticated using (public.is_coord());

-- Almacenamiento privado de documentos: jugadores/<player>/…, tecnicos/<user>/…, biblioteca/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 2097152, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function public.can_upload_document_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_name, '/', 1)
    when 'jugadores' then exists (select 1 from public.players where id::text = split_part(p_name, '/', 2) and public.can_manage_player_docs(id))
    when 'tecnicos' then public.is_coord() or split_part(p_name, '/', 2) = auth.uid()::text
    when 'biblioteca' then public.is_any_coach()
    else false end
$$;

create or replace function public.can_read_document_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.player_documents d where d.path = p_name and public.can_see_player(d.player_id)
                   and (public.is_coord() or (d.deleted_at is null and not public.type_reserved(d.type_id))))
      or exists (select 1 from public.staff_documents d where d.path = p_name and (public.is_coord() or (d.user_id = auth.uid() and d.deleted_at is null)))
      or exists (select 1 from public.library_documents d where d.path = p_name and (public.is_coord() or (d.deleted_at is null and not d.reserved)))
$$;

create policy documentos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.can_read_document_path(name));
create policy documentos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.can_upload_document_path(name));
create policy documentos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.is_coord());
create policy actas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'actas' and public.is_coord());

-- ---------------------------------------------------------------------------
-- RPC de documentación
-- ---------------------------------------------------------------------------
-- Documentos obligatorios de jugador que faltan en la temporada (según los equipos visibles para quien consulta).
create or replace function public.missing_player_documents(p_season uuid)
returns table (player_id uuid, player_name text, team_id uuid, team_name text, type_id uuid, type_name text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.last_name || ', ' || p.first_name, t.id, t.name, dt.id, dt.name
  from public.teams t
  join public.enrollments e on e.team_id = t.id and e.kind = 'plantilla' and (e.end_date is null or e.end_date >= current_date)
  join public.players p on p.id = e.player_id and p.active and p.deleted_at is null
  cross join public.document_types dt
  where t.season_id = p_season and t.deleted_at is null and public.is_team_staff(t.id)
    and dt.owner = 'jugador' and dt.required and dt.active and (public.is_coord() or not dt.reserved)
    and not exists (
      select 1 from public.player_documents d
      where d.player_id = p.id and d.type_id = dt.id and d.deleted_at is null
        and (not dt.per_season or d.season_id = p_season))
  order by 4, 2, 6
$$;

-- Documentos obligatorios de técnicos que faltan (aprobados) en la temporada. Coordinadora: todos; técnico: los suyos.
create or replace function public.missing_staff_documents(p_season uuid)
returns table (user_id uuid, user_name text, type_id uuid, type_name text, pending boolean)
language sql stable security definer set search_path = public as $$
  select distinct pr.id, pr.full_name, dt.id, dt.name,
    exists (select 1 from public.staff_documents d where d.user_id = pr.id and d.type_id = dt.id and d.status = 'pendiente' and d.deleted_at is null)
  from public.team_staff ts
  join public.teams t on t.id = ts.team_id and t.season_id = p_season and t.deleted_at is null
  join public.profiles pr on pr.id = ts.user_id and pr.active
  cross join public.document_types dt
  where dt.owner = 'tecnico' and dt.required and dt.active
    and (public.is_coord() or pr.id = auth.uid())
    and not exists (
      select 1 from public.staff_documents d
      where d.user_id = pr.id and d.type_id = dt.id and d.status = 'aprobado' and d.deleted_at is null
        and (not dt.per_season or d.season_id = p_season))
  order by 2, 4
$$;

-- Aviso de documentación pendiente a coordinación y a los principales de cada equipo.
create or replace function public.notify_missing_documents(p_season uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int := 0;
begin
  if not (public.is_coord() or auth.uid() is null) then
    raise exception 'Solo la coordinadora';
  end if;
  for r in
    select m.team_id, m.team_name, count(*) as n from public.missing_player_documents(p_season) m group by 1, 2
  loop
    v_total := v_total + r.n;
    insert into public.notifications (user_id, title, body, link)
    select ts.user_id, 'Documentación pendiente', format('%s: faltan %s documentos obligatorios.', r.team_name, r.n), '/documentacion'
    from public.team_staff ts join public.profiles p on p.id = ts.user_id and p.active
    where ts.team_id = r.team_id and ts.staff_role = 'principal';
  end loop;
  if v_total > 0 then
    insert into public.notifications (user_id, title, body, link)
    select id, 'Documentación pendiente', format('Faltan %s documentos obligatorios de jugadores.', v_total), '/documentacion'
    from public.profiles where role = 'coordinadora' and active;
  end if;
  return v_total;
end $$;

create or replace function public.resolve_staff_document(p_doc uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.staff_documents;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  update public.staff_documents set status = case when p_approve then 'aprobado' else 'rechazado' end::public.doc_status,
    resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_doc and status = 'pendiente' returning * into d;
  if d.id is null then
    raise exception 'El documento ya no está pendiente';
  end if;
  insert into public.notifications (user_id, title, body, link)
  values (d.user_id, case when p_approve then 'Documento aprobado' else 'Documento rechazado' end,
          (select name from public.document_types where id = d.type_id) || coalesce(' · ' || nullif(btrim(p_note), ''), ''), '/documentacion');
end $$;

create or replace function public.resolve_incident(p_incident uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.incidents;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  update public.incidents set status = 'resuelta', resolved_by = auth.uid(), resolved_at = now(),
    resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_incident and status = 'abierta' returning * into i;
  if i.id is null then
    raise exception 'La incidencia ya está resuelta';
  end if;
  insert into public.notifications (user_id, title, body, link)
  values (i.user_id, 'Incidencia resuelta', i.title || coalesce(' · ' || i.resolution_note, ''), '/incidencias');
end $$;


-- Enviar documentos a la papelera (las políticas de lectura ocultan los eliminados al cuerpo técnico,
-- así que el borrado lógico se hace mediante esta función).
create or replace function public.trash_document(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'player' then
    update public.player_documents set deleted_at = now()
    where id = p_id and deleted_at is null and public.can_manage_player_docs(player_id)
      and (public.is_coord() or not public.type_reserved(type_id));
  elsif p_kind = 'library' then
    update public.library_documents set deleted_at = now()
    where id = p_id and deleted_at is null and (public.is_coord() or uploaded_by = auth.uid());
  else
    raise exception 'Tipo no válido';
  end if;
  if not found then
    raise exception 'No autorizado o documento inexistente';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Exportaciones: control de Excel con datos personales y avisos
-- ---------------------------------------------------------------------------
create or replace function public.log_export(p_kind text, p_team uuid default null, p_personal boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team text;
  v_who text;
begin
  if not public.is_active_user() then
    raise exception 'No autorizado';
  end if;
  if p_team is not null and not public.is_team_staff(p_team) then
    raise exception 'No autorizado';
  end if;
  if p_personal and not (public.is_coord() or (p_team is not null and public.is_team_principal(p_team))) then
    raise exception 'Solo la coordinadora y el entrenador principal pueden exportar datos personales';
  end if;
  select name into v_team from public.teams where id = p_team;
  select full_name into v_who from public.profiles where id = auth.uid();
  insert into public.audit_log (user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'EXPORT', 'informes', p_team::text, jsonb_build_object('kind', p_kind, 'personal', p_personal));
  if not public.is_coord() and (p_personal or p_kind = 'resultados') then
    perform public.notify_coordinators(
      case when p_personal then 'Descarga de Excel con datos personales' else 'Informe de resultados generado' end,
      format('%s · %s', v_who, coalesce(v_team, 'Todos los equipos')), '/auditoria');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Copias de seguridad dentro de la aplicación
-- ---------------------------------------------------------------------------
create or replace function public.backup_tables()
returns text[] language sql immutable as $$
  select array['categories','venues','seasons','teams','training_slots','team_staff','players','events','enrollments',
    'attendance','matches','match_callups','match_reports','event_requests','document_types','player_documents',
    'staff_documents','library_documents','incidents']
$$;

create or replace function public.create_backup(p_kind text default 'manual')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t text;
  v_rows jsonb;
  v_data jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if not (public.is_coord() or (auth.uid() is null and p_kind = 'automatica')) then
    raise exception 'Solo la coordinadora';
  end if;
  begin
    foreach t in array public.backup_tables() loop
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
      v_data := v_data || jsonb_build_object(t, v_rows);
      v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
    end loop;
    insert into public.backups (created_by, kind, status, counts, data)
    values (auth.uid(), p_kind, 'ok', v_counts, v_data) returning id into v_id;
  exception when others then
    insert into public.backups (created_by, kind, status, error) values (auth.uid(), p_kind, 'error', sqlerrm) returning id into v_id;
    insert into public.notifications (user_id, title, body, link)
    select id, 'Error en la copia de seguridad', sqlerrm, '/copias' from public.profiles where role = 'coordinadora' and active;
    return v_id;
  end;
  -- Retención: 30 automáticas y 20 manuales/previas.
  delete from public.backups where kind = 'automatica' and id not in
    (select id from public.backups where kind = 'automatica' order by created_at desc limit 30);
  delete from public.backups where kind <> 'automatica' and id not in
    (select id from public.backups where kind <> 'automatica' order by created_at desc limit 20);
  return v_id;
end $$;

-- Restaura una copia. Antes guarda una copia del estado actual (devuelve su id).
create or replace function public.restore_backup(p_backup uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b public.backups;
  t text;
  v_pre uuid;
  v_tables text[] := public.backup_tables();
  i int;
begin
  if not public.is_coord() then
    raise exception 'Solo la coordinadora';
  end if;
  select * into b from public.backups where id = p_backup;
  if b.id is null or b.status <> 'ok' or b.data is null then
    raise exception 'La copia no existe o no es válida';
  end if;
  v_pre := public.create_backup('previa_restauracion');
  if (select status from public.backups where id = v_pre) <> 'ok' then
    raise exception 'No se ha podido crear la copia previa; restauración cancelada';
  end if;
  perform set_config('app.restoring', 'on', true);
  for i in reverse array_length(v_tables, 1) .. 1 loop
    -- "where true": PostgREST (pg-safeupdate) rechaza DELETE sin WHERE.
    execute format('delete from public.%I where true', v_tables[i]);
  end loop;
  foreach t in array v_tables loop
    if t = 'team_staff' then
      insert into public.team_staff
      select * from jsonb_populate_recordset(null::public.team_staff, coalesce(b.data -> t, '[]'::jsonb)) x
      where exists (select 1 from public.profiles p where p.id = x.user_id);
    else
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t)
      using coalesce(b.data -> t, '[]'::jsonb);
    end if;
  end loop;
  perform set_config('app.restoring', 'off', true);
  update public.backups set restored_at = now() where id = p_backup;
  insert into public.audit_log (user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'RESTORE', 'backups', p_backup::text, jsonb_build_object('copia_previa', v_pre, 'fecha_copia', b.created_at));
  perform public.notify_coordinators('Copia de seguridad restaurada',
    format('Se ha restaurado la copia del %s.', to_char(b.created_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI')), '/copias');
  return v_pre;
end $$;

-- Copia diaria (03:00 UTC) y aviso semanal de documentación pendiente si pg_cron está disponible.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ad-copia-diaria', '0 3 * * *', $c$select public.create_backup('automatica')$c$);
  perform cron.schedule('ad-documentacion-semanal', '0 7 * * 1',
    $c$select public.notify_missing_documents(id) from public.seasons where status = 'activa'$c$);
exception when others then
  raise notice 'pg_cron no disponible: %', sqlerrm;
end $$;

-- Notificaciones en tiempo real
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  raise notice 'Realtime: %', sqlerrm;
end $$;

revoke execute on function public.create_backup(text) from public, anon;
revoke execute on function public.restore_backup(uuid) from public, anon;
revoke execute on function public.notify_missing_documents(uuid) from public, anon;
