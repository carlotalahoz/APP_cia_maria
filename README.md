# APP Compañía de María · Baloncesto

Aplicación de gestión deportiva (solo baloncesto) para la Agrupación Deportiva del Colegio Compañía de María (Zaragoza).

## Documentación

- [Análisis funcional](docs/analisis_funcional.md) · [original .docx](docs/AD_Compania_de_Maria_Analisis_Funcional.docx)
- [Manual de usuario](docs/manual_usuario.md) · [original .docx](docs/AD_Compania_de_Maria_Manual_de_Usuario.docx)

## Estado: Fases 1, 2 y 3 del análisis

- **Fase 1:** usuarios y roles, temporadas, categorías y pistas, equipos con horario y cuerpo técnico, fichas de
  jugadores (historial, duplicados y «jugador que sube»), asistencia semanal sin conexión con conflictos,
  notificaciones internas, papelera y auditoría.
- **Fase 2:** calendario semanal, cancelaciones y solicitudes con aprobación, partidos, convocatorias, resultados
  por periodos, actas y estadísticas.
- **Fase 3:** documentación de jugadores y técnicos, biblioteca, informes con exportación a Excel/PDF, importación
  de jugadores desde Excel, incidencias, notificaciones en tiempo real y copias de seguridad con restauración.

Pendiente fuera de las fases: publicación (Supabase en la nube, alojamiento y correo real), avisos push con la app
cerrada, apps nativas iOS/Android y lectura automática del marcador de las actas.

## Tecnología

- `web/`: React + TypeScript + Vite, instalable como PWA. Asistencia offline con IndexedDB (Dexie).
- `supabase/`: PostgreSQL con permisos por rol y equipo en la propia base de datos (RLS), Auth y Edge Function
  `admin-users` para que la coordinadora dé de alta usuarios.

## Desarrollo local

Requisitos: Node 22 y Docker.

```bash
npm install                      # instala la CLI de Supabase
npx supabase start               # levanta Supabase en Docker
npx supabase db reset            # aplica migraciones y datos de ejemplo
npx supabase functions serve     # (otra terminal) función de alta de usuarios

cd web
cp .env.example .env.local       # rellena la anon key que muestra `npx supabase status`
npm install
npm run dev                      # http://localhost:5173
```

Usuarios de ejemplo (contraseña en `supabase/seed.sql`): `coordinadora@`, `principal@`, `ayudante@`, `delegado@`
y `principal2@ciamaria.test`. Los correos (invitaciones, recuperación) se ven en http://127.0.0.1:54324.

## Pruebas

```bash
cd web && npm run lint && npm test && npm run build
docker exec -i supabase_db_APP_cia_maria psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_smoke.sql
```
