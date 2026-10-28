-- Datos de ejemplo para desarrollo local. Contraseña de todos los usuarios: Cia2026!
do $$
declare
  v_users jsonb := '[
    {"id":"00000000-0000-0000-0000-000000000001","email":"coordinadora@ciamaria.test","name":"María Coordinadora","role":"coordinadora"},
    {"id":"00000000-0000-0000-0000-000000000002","email":"principal@ciamaria.test","name":"Laura Gómez","role":"principal"},
    {"id":"00000000-0000-0000-0000-000000000003","email":"ayudante@ciamaria.test","name":"Pablo Ruiz","role":"ayudante"},
    {"id":"00000000-0000-0000-0000-000000000004","email":"delegado@ciamaria.test","name":"Ana Martín","role":"delegado"},
    {"id":"00000000-0000-0000-0000-000000000005","email":"principal2@ciamaria.test","name":"Jorge Lasheras","role":"principal"}
  ]';
  u jsonb;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated', u->>'email',
      extensions.crypt('Cia2026!', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'app_role',u->>'role'),
      jsonb_build_object('full_name',u->>'name'), now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u->>'id', (u->>'id')::uuid,
      jsonb_build_object('sub',u->>'id','email',u->>'email','email_verified',true), 'email', now(), now(), now());
  end loop;
end $$;

insert into public.categories (name, sort_order) values
  ('Escuela B', 1), ('Escuela A', 2), ('Prebenjamín B', 3), ('Prebenjamín A', 4), ('Benjamín 1', 5), ('Benjamín 2', 6),
  ('Alevín 1', 7), ('Alevín 2', 8), ('Preinfantil', 9), ('Infantil', 10), ('Cadete-Junior', 11), ('Sénior', 12), ('Over 30', 13);

insert into public.venues (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Pabellón colegio · Pista 1'),
  ('10000000-0000-0000-0000-000000000002', 'Pabellón colegio · Pista 2'),
  ('10000000-0000-0000-0000-000000000003', 'Patio exterior');

insert into public.seasons (id, name, start_date, end_date) values
  ('20000000-0000-0000-0000-000000002627', '26/27', '2026-09-01', '2027-06-30');

insert into public.teams (id, season_id, category_id, branch, code, name)
select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002627', id, 'femenino', 'ALF1', 'Alevín 1 Femenino'
from public.categories where name = 'Alevín 1';
insert into public.teams (id, season_id, category_id, branch, code, name)
select '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000002627', id, 'masculino', 'INFM', 'Infantil Masculino'
from public.categories where name = 'Infantil';

insert into public.team_staff (team_id, user_id, staff_role) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'principal'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'ayudante'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'delegado'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'principal');

insert into public.training_slots (team_id, weekday, start_time, end_time, venue_id) values
  ('30000000-0000-0000-0000-000000000001', 1, '17:30', '19:00', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 3, '17:30', '19:00', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 2, '18:00', '19:30', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 4, '18:00', '19:30', '10000000-0000-0000-0000-000000000002');

-- Jugadores
with names as (
  select * from (values
    (1, 'Lucía', 'García Pérez', '2015-03-12', 'femenino'), (2, 'Sofía', 'López Martín', '2015-07-02', 'femenino'),
    (3, 'Martina', 'Sánchez Gil', '2015-01-25', 'femenino'), (4, 'Paula', 'Romero Navarro', '2015-11-08', 'femenino'),
    (5, 'Valeria', 'Torres Lahoz', '2015-05-19', 'femenino'), (6, 'Daniela', 'Ruiz Blasco', '2015-09-30', 'femenino'),
    (7, 'Carla', 'Moreno Aznar', '2015-02-14', 'femenino'), (8, 'Alba', 'Jiménez Serrano', '2015-06-21', 'femenino'),
    (9, 'Noa', 'Hernández Lázaro', '2015-12-03', 'femenino'), (10, 'Irene', 'Díaz Royo', '2015-04-17', 'femenino'),
    (11, 'Hugo', 'Martínez Casas', '2012-03-09', 'masculino'), (12, 'Mateo', 'Gómez Pardo', '2012-08-15', 'masculino'),
    (13, 'Leo', 'Fernández Sanz', '2012-01-28', 'masculino'), (14, 'Pablo', 'Alonso Vicente', '2012-10-11', 'masculino'),
    (15, 'Álvaro', 'Gutiérrez Franco', '2012-06-05', 'masculino'), (16, 'Diego', 'Muñoz Les', '2012-02-22', 'masculino'),
    (17, 'Javier', 'Ortega Bueno', '2012-09-18', 'masculino'), (18, 'Marcos', 'Castillo Ibáñez', '2012-12-01', 'masculino')
  ) as t(n, first_name, last_name, birth, branch)
)
insert into public.players (id, first_name, last_name, birth_date, city, postal_code, phone, size, position,
  mother_name, mother_phone, father_name, father_phone, allergies, license_number)
select ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, first_name, last_name, birth::date, 'Zaragoza', '50009',
  '6000000' || lpad(n::text, 2, '0'), case when branch = 'femenino' then 'S' else 'M' end,
  (array['Base','Escolta','Alero','Ala-pívot','Pívot'])[1 + n % 5],
  'Madre de ' || first_name, '6100000' || lpad(n::text, 2, '0'), 'Padre de ' || first_name, '6200000' || lpad(n::text, 2, '0'),
  case when n % 7 = 0 then 'Frutos secos' end, 'FAB-' || (26000 + n)
from names;

insert into public.enrollments (player_id, team_id, kind, dorsal, start_date)
select id, case when birth_date > '2014-01-01' then '30000000-0000-0000-0000-000000000001'::uuid
                else '30000000-0000-0000-0000-000000000002'::uuid end,
  'plantilla', (right(id::text, 2))::int + 3, '2026-09-01'
from public.players;

-- Entrenamientos de la temporada (equivalente a generate_training_sessions)
insert into public.events (team_id, type, starts_at, ends_at, venue_id, slot_id)
select sl.team_id, 'entrenamiento',
  (d::date + sl.start_time) at time zone 'Europe/Madrid', (d::date + sl.end_time) at time zone 'Europe/Madrid',
  sl.venue_id, sl.id
from public.training_slots sl
cross join generate_series(date '2026-09-01', date '2027-06-30', interval '1 day') d
where extract(isodow from d) = sl.weekday;

-- Asistencias de ejemplo en entrenamientos pasados (se dejan sin registrar los de los últimos 7 días)
insert into public.attendance (event_id, player_id, status, updated_by, updated_at)
select ev.id, e.player_id,
  (case
     when abs(hashtext(ev.id::text || e.player_id::text)) % 20 = 0 then 'injustificada'
     when abs(hashtext(ev.id::text || e.player_id::text)) % 20 = 1 then 'lesion'
     when abs(hashtext(ev.id::text || e.player_id::text)) % 20 = 2 then 'estudios'
     when abs(hashtext(ev.id::text || e.player_id::text)) % 20 = 3 then 'retraso'
     when abs(hashtext(ev.id::text || e.player_id::text)) % 20 = 4 then 'medico'
     else 'asistencia' end)::public.attendance_status,
  (select user_id from public.team_staff where team_id = ev.team_id and staff_role = 'principal' limit 1),
  ev.ends_at
from public.events ev
join public.enrollments e on e.team_id = ev.team_id
where ev.starts_at < now() - interval '7 days';

-- ---------------------------------------------------------------------------
-- Fase 2: partidos, convocatorias, otras actividades y solicitudes de ejemplo
-- ---------------------------------------------------------------------------
with m(id, team, days, hour, venue, kind, school, competition, matchday, opponent, home, away_location) as (
  values
    ('50000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, -24, '10:00', '10000000-0000-0000-0000-000000000001'::uuid, 'oficial', true,  'Juegos Escolares de Aragón', '1', 'CB Santa Ana', true, null),
    ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', -10, '11:30', null, 'oficial', true,  'Juegos Escolares de Aragón', '2', 'Colegio El Pilar', false, 'Pabellón El Pilar (Zaragoza)'),
    ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 4, '10:00', '10000000-0000-0000-0000-000000000001', 'oficial', true,  'Juegos Escolares de Aragón', '3', 'CB Santa Ana', false, 'Pabellón Santa Ana'),
    ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', -17, '12:00', '10000000-0000-0000-0000-000000000002', 'oficial', false, 'Liga FAB Infantil', '1', 'Basket Mequinenza', true, null),
    ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', -3, '17:00', null, 'amistoso', false, null, null, 'CN Helios', false, 'CN Helios'),
    ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', 11, '12:00', '10000000-0000-0000-0000-000000000002', 'oficial', false, 'Liga FAB Infantil', '3', 'Stadium Casablanca', true, null)
)
, ev as (
  insert into public.events (id, team_id, type, starts_at, ends_at, venue_id, status, created_by, resolved_by, resolved_at)
  select id, team, 'partido',
    ((current_date + days) + hour::time) at time zone 'Europe/Madrid',
    ((current_date + days) + hour::time + interval '90 minutes') at time zone 'Europe/Madrid',
    venue, case when days < 0 then 'finalizado' else 'programado' end::public.event_status,
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now()
  from m returning id
)
insert into public.matches (event_id, kind, school, competition, matchday, opponent, home, away_location)
select id, kind::public.match_kind, school, competition, matchday, opponent, home, away_location from m;

-- Convocatorias: toda la plantilla
insert into public.match_callups (event_id, player_id, created_by)
select ev.id, e.player_id, (select user_id from public.team_staff where team_id = ev.team_id and staff_role = 'principal' limit 1)
from public.events ev join public.enrollments e on e.team_id = ev.team_id and e.kind = 'plantilla'
where ev.type = 'partido';

-- Resultados de los partidos ya jugados
update public.matches set score_for = r.f, score_against = r.a, periods = r.p::jsonb,
  result_by = (select user_id from public.team_staff ts join public.events e on e.team_id = ts.team_id
               where e.id = matches.event_id and ts.staff_role = 'principal' limit 1),
  result_at = now(), incidents = r.i
from (values
  ('50000000-0000-0000-0000-000000000001'::uuid, 34, 28, '[{"for":10,"against":6},{"for":8,"against":8},{"for":6,"against":7},{"for":10,"against":7}]', null),
  ('50000000-0000-0000-0000-000000000002', 22, 30, '[{"for":4,"against":8},{"for":6,"against":6},{"for":6,"against":10},{"for":6,"against":6}]', 'Una jugadora se torció el tobillo en el tercer cuarto.'),
  ('50000000-0000-0000-0000-000000000004', 58, 58, '[{"for":14,"against":12},{"for":16,"against":15},{"for":12,"against":18},{"for":16,"against":13}]', null),
  ('50000000-0000-0000-0000-000000000005', 61, 47, '[{"for":15,"against":10},{"for":14,"against":12},{"for":18,"against":13},{"for":14,"against":12}]', null)
) as r(id, f, a, p, i)
where matches.event_id = r.id;

-- Asistencia de los partidos jugados
insert into public.attendance (event_id, player_id, status, updated_by, updated_at)
select c.event_id, c.player_id,
  (case when abs(hashtext(c.event_id::text || c.player_id::text)) % 10 = 0 then 'lesion' else 'asistencia' end)::public.attendance_status,
  c.created_by, ev.ends_at
from public.match_callups c join public.events ev on ev.id = c.event_id
where ev.status = 'finalizado';

-- Otras actividades
insert into public.events (team_id, type, title, starts_at, ends_at, venue_id, status, extraordinary, created_by, notes)
values
  ('30000000-0000-0000-0000-000000000001', 'tecnificacion', 'Tecnificación de tiro',
   ((current_date + 2) + time '16:30') at time zone 'Europe/Madrid', ((current_date + 2) + time '17:30') at time zone 'Europe/Madrid',
   '10000000-0000-0000-0000-000000000002', 'programado', true, '00000000-0000-0000-0000-000000000001', 'Traer balón propio.'),
  ('30000000-0000-0000-0000-000000000002', 'preparacion_fisica', 'Preparación física',
   ((current_date + 1) + time '17:00') at time zone 'Europe/Madrid', ((current_date + 1) + time '18:00') at time zone 'Europe/Madrid',
   '10000000-0000-0000-0000-000000000003', 'programado', true, '00000000-0000-0000-0000-000000000001', null);

-- Propuesta pendiente de aprobación (amistoso propuesto por la entrenadora principal)
insert into public.events (id, team_id, type, starts_at, ends_at, venue_id, status, created_by)
values ('50000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', 'partido',
  ((current_date + 9) + time '11:00') at time zone 'Europe/Madrid', ((current_date + 9) + time '12:30') at time zone 'Europe/Madrid',
  '10000000-0000-0000-0000-000000000001', 'pendiente_aprobacion', '00000000-0000-0000-0000-000000000002');
insert into public.matches (event_id, kind, opponent, home) values ('50000000-0000-0000-0000-000000000007', 'amistoso', 'CB Utebo', true);

-- Solicitud de cambio de pista pendiente para el próximo entrenamiento del Alevín
insert into public.event_requests (event_id, requested_by, new_starts_at, new_ends_at, new_venue_id, reason)
select id, '00000000-0000-0000-0000-000000000002', starts_at, ends_at, '10000000-0000-0000-0000-000000000002',
  'La pista 1 está ocupada por la fiesta del colegio.'
from public.events
where team_id = '30000000-0000-0000-0000-000000000001' and type = 'entrenamiento' and starts_at > now() + interval '1 day'
order by starts_at limit 1;
