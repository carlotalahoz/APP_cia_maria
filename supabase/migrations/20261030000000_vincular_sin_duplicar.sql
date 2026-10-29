-- Evita duplicar la inscripción al vincular un jugador que ya está en el equipo (p. ej. desde la importación Excel).
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
  if p_kind <> 'sube_puntual' and exists (
    select 1 from public.enrollments
    where player_id = p_player and team_id = p_team and kind <> 'sube_puntual'
      and (end_date is null or end_date >= current_date)
  ) then
    raise exception 'El jugador ya está en este equipo';
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
