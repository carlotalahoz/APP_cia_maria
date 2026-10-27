AD COMPAÑÍA DE MARÍA
Análisis funcional y especificación de requisitos
Documento de referencia para diseño, desarrollo, pruebas y aceptación
Versión 1.0  |  26 de octubre de 2026  |  Estado: especificación funcional con decisiones técnicas abiertas
Agrupación Deportiva · Colegio Compañía de María · Zaragoza
# 1. Propósito y control del documento
Definir el comportamiento esperado de una aplicación de gestión exclusiva de baloncesto para la Agrupación Deportiva del Colegio Compañía de María de Zaragoza. Se fundamenta en el cuestionario original de 240 preguntas y en las decisiones de seguimiento confirmadas hasta el 26/10/2026. El cuestionario original se conserva íntegro como anexo de trazabilidad. Las cuestiones sin resolver se identifican expresamente; no deben implementarse por suposición.
| Campo | Definición |
| Producto | AD Compañía de María |
| Ámbito | Una agrupación; únicamente baloncesto |
| Usuarios | Coordinadora, entrenador principal, ayudante, delegado |
| Plataformas | Web adaptable, web instalable desde navegador y aplicación iOS/Android |
| Idioma | Español |
| Prioridad de primera entrega | Fichas de jugadores y registro de asistencias |
| Entregables previstos | Análisis funcional y manual de usuario previsto |

# 2. Alcance, conceptos y principios
- La temporada es la unidad de organización de equipos, entrenamientos, partidos y estadísticas. Un jugador mantiene ficha única e historial de adscripciones por temporada.
- La coordinadora tiene alcance global; el cuerpo técnico accede solo a equipos actualmente asignados. El acceso se controla en servidor, no solo ocultando botones.
- Las notificaciones operativas son internas y push; no se envían por correo salvo los mensajes de creación de cuenta y recuperación de contraseña.
- El registro de asistencias funciona sin conexión y se sincroniza después; el resto de consultas requieren conexión.
- Los datos de menores y documentación personal exigen controles de seguridad, minimización, protección y revisión jurídica antes del despliegue.
# 3. Matriz de permisos
| Operación | Coord. | Principal | Ayudante | Delegado |
| Crear/desactivar usuarios | Sí | No | No | No |
| Crear equipos y asignar técnicos | Sí | No | No | No |
| Consultar jugadores del equipo autorizado | Todos | Sí | Sí | Sí |
| Editar datos personales de jugadores | Todos | Sí, propios | No | No |
| Exportar Excel con datos personales | Todos | Sí, propios | No | No |
| Registrar asistencias | Todos | Sí | Sí | Sí |
| Consultar auditoría completa | Sí | No | No | No |
| Recuperar papelera y restaurar backup | Sí | No | No | No |
| Solicitar cambios de pista/horario | Gestiona | Sí | Por concretar | Por concretar |
| Documentación jugadores | Gestiona | Sí, propios | Según reglas previas | Según reglas previas |

Nota: los permisos de entrenador principal y ayudantes pueden coincidir para operaciones deportivas, pero la modificación de datos personales y la exportación masiva quedan expresamente restringidas a principal y coordinadora. Cualquier divergencia del cuestionario inicial se resuelve a favor de la decisión posterior y más específica.
# 4. Identidad, usuarios y sesiones
- Solo la coordinadora crea cuentas; no existe autorregistro. Al crear la cuenta, el usuario recibe un correo para establecer contraseña. Cada cuenta tiene correo asociado y recuperación automática.
- La coordinadora asigna rol y uno o varios equipos; puede desactivar y desbloquear cuentas. Desactivar impide acceder sin borrar el historial.
- Se admiten sesiones simultáneas en varios dispositivos. Tras siete días de inactividad se cierra la sesión y se requiere nuevo inicio.
- Solo la coordinadora consulta historial de accesos y auditoría completa: usuario, acción, fecha, objeto y cambio relevante.
- Un entrenador deja de ver el historial de equipos de los que ya no es responsable. Un nuevo entrenador ve el historial del equipo de la temporada actual.
# 5. Temporadas y categorías
- Coordinadora crea y cierra temporadas con nombre abreviado (p. ej., 26/27) y fechas. Puede copiar equipos anteriores y elegir continuidad de jugadores y técnicos.
- Antes del cierre, validar asistencias sin registrar, partidos sin finalizar y solicitudes pendientes. Mostrar detalle; permitir cerrar con confirmación expresa pese a incidencias.
- Tras cierre, solo la coordinadora puede corregir datos históricos. La documentación de temporadas previas permanece consultable y los documentos renovables se vuelven a solicitar.
- La coordinadora administra categorías: alta, cambio de nombre, desactivación sin destruir históricos.
- Antes del cierre, informe global de equipos, jugadores, técnicos, asistencias y resultados.
# 6. Equipos, jugadores y técnicos
- Equipo: temporada, categoría, rama, código de hasta cuatro letras, cuerpo técnico, jugadores, días/horarios y pista; la coordinadora administra su creación y asignaciones.
- Categorías de partida: Escuela B, Escuela A, Prebenjamín B/A, Benjamín 1/2, Alevín 1/2, Preinfantil, Infantil, Cadete-Junior, Sénior y Over 30. Son configurables.
- Jugador: dorsal, nombre, apellidos, GIR, DNI, fecha nacimiento, dirección, localidad, CP, teléfono, email, alergias, talla, padre y teléfono, madre y teléfono, foto, licencia federativa, categoría, posición. Campos obligatorios originales: nombre, apellidos y nacimiento.
- Ficha con pestañas: datos personales, equipos/temporadas, documentos, asistencias, partidos/estadísticas y observaciones. El cuerpo técnico del equipo puede leer; únicamente principal y coordinadora editan datos personales. Cambios del principal notifican a coordinación.
- Altas desde equipo por entrenador autorizado notifican coordinadora, sin aprobación. Detectar posibles duplicados y reutilizar ficha existente; no crear registros paralelos.
- Inactivo: oculto en listados ordinarios, ficha e historial preservados, reactivable por coordinadora. Eliminación: pasa a papelera recuperable.
- Jugador que sube: habitual durante periodo o puntual para evento, diferenciado de plantilla fija. Se puede incorporar sin autorización previa; notificar a coordinadora y entrenador del equipo de origen. Asistencia registrada en el equipo receptor de forma independiente.
- Histórico de dorsales y cambios de equipo con fechas; observaciones visibles al cuerpo técnico autorizado y coordinadora.
# 7. Instalaciones y calendario
- Coordinadora administra sedes y pistas. Conflictos de pista/horario generan aviso sin bloquear operación.
- La coordinadora define horarios y pistas fijos por equipo; la aplicación genera automáticamente entrenamientos de temporada.
- Vista semanal por equipo; coordinadora dispone de vista semanal general filtrable por equipo, categoría y pista.
- Entrenador puede cancelar un entrenamiento con motivo obligatorio, queda visible en rojo como Cancelado y se avisa a coordinación.
- Cambio de hora/pista o entrenamiento extraordinario: solicitud del entrenador, estado pendiente, aprobación previa de coordinadora y notificación del resultado. Al aprobar o modificar coordinación, avisar al cuerpo técnico asignado.
# 8. Partidos, convocatorias, actas y resultados
- Partidos oficiales y amistosos. Entrenador propone partido; requiere aprobación de coordinación antes de mostrarse como confirmado.
- Estados: Pendiente de aprobación, Programado, Partido pendiente (aplazado sin fecha), Aplazado (con nueva fecha), Cancelado, Finalizado. Conservar fecha original de aplazamientos.
- Convocatoria parte de jugadores habituales preseleccionados; entrenador puede excluir e incorporar jugadores que suben. La lista de asistencia del partido se genera solo desde convocados.
- Entrenador introduce o corrige marcador final directamente y se notifica a coordinadora. Estadísticas por equipo: jugados, ganados, perdidos, empatados, puntos a favor/en contra y diferencia.
- Solo en competición escolar: adjuntar una o varias fotos/PDF del acta. Intentar extraer automáticamente cuartos, resultado y ganador, presentar valores al entrenador para revisión/corrección antes de guardar. Si falla, entrada manual.
- No incluir de momento estadísticas individuales de puntos, minutos ni faltas; tampoco clasificación externa de liga ni resultados de otros clubes.
# 9. Asistencia: reglas de negocio y cálculos
| Estado | Cuenta como asistencia | Justificada |
| Sin registrar | No; excluida del denominador | No aplica |
| Asistencia | Sí | No aplica |
| Asistido con retraso | Sí, al 100 % | No aplica |
| Lesión | No | Sí |
| Viaje | No | Sí |
| Estudios | No | Sí |
| Médico | No | Sí |
| Ausencia sin justificar | No | No |

- La asistencia se crea automáticamente para entrenamientos y desde convocados para partidos; todos comienzan Sin registrar.
- Vista semanal en cuadrícula: filas jugadores y columnas sesiones; principal, ayudantes y delegados registran estados, sin plazo límite de edición.
- Evento completo únicamente cuando todos sus jugadores aplicables tienen estado distinto de Sin registrar. Observación libre opcional por ausencia.
- Porcentaje de asistencia = (Asistencia + Asistido con retraso) / registros con estado distinto de Sin registrar × 100. Las ausencias justificadas disminuyen el porcentaje. Mostrar pendientes y porcentaje de pendientes respecto al total previsto.
- Separar entrenamientos de partidos; desglosar justificaciones por motivo, ausencias sin justificar, retrasos, porcentajes individuales y medios del equipo.
- Recordatorios al terminar entrenamiento, mañana siguiente y fin de semana si hay pendientes; resumen semanal para coordinadora. Horarios exactos de envío por definir.
# 10. Asistencia sin conexión y sincronización
- Sin Internet solo se permite introducir asistencia; guardar localmente de forma persistente hasta confirmación del servidor. Mostrar Pendiente de sincronizar / Sincronizado y confirmación visual de éxito.
- Si falla envío, mantener datos, mostrar aviso y reintentar cuando sea posible. Evitar pérdida al cerrar la aplicación o dispositivo.
- Ante conflicto de dos ediciones del mismo jugador/evento, detectar divergencia y presentar al entrenador ambos valores para elegir el que se conserva. Registrar resolución en auditoría.
- Guardar automáticamente cambios ordinarios, pero respetar confirmaciones explícitas y aprobaciones para acciones sensibles.
# 11. Gestión documental
- Coordinadora administra tipos documentales y marca obligatoriedad para jugadores y técnicos; puede exigir renovación por temporada.
- Ficha muestra documentos, faltantes y estado de renovación. Panel global de pendientes para coordinadora; avisar también a entrenador principal cuando falte documento de jugador.
- Documentos anteriores consultables aunque se exija nueva entrega. La coordinadora recibe aviso cuando un técnico sube documento antes ausente.
- Los entrenadores solicitan subir o modificar sus propios documentos; requiere autorización previa y notificación a coordinadora.
- Personal autorizado podrá descargar todos los documentos de una ficha en ZIP, aplicando restricciones de acceso a documentos reservados.
- El entrenador autorizado puede gestionar documentos de sus jugadores según permisos acordados; la eliminación avisa a coordinadora y el documento puede restaurarse en su ficha original.
- Tipos de archivo y límite indicados en cuestionario inicial (PDF, JPG, Excel; 2 MB) deben validarse técnicamente, sobre todo para actas y ZIP. No se requiere control de caducidades por fecha ni versionado general.
# 12. Notificaciones y solicitudes
- Centro de notificaciones con campana, leídas/no leídas e historial persistente; al volver a entrar mostrar todas las no leídas.
- Avisos obligatorios configurados por coordinadora; no pueden desactivarse desde preferencias de usuario. Push móvil sujeto a permisos del sistema.
- No usar correo para avisos operativos; excepción: alta y recuperación de contraseña.
- Notificar según evento: altas y modificaciones de jugadores, documentos faltantes o presentados, solicitudes de horario/pista y resoluciones, cancelaciones, partidos, resultados, errores técnicos, informes de resultados generados y descarga de Excel con datos personales.
- No notificar por descarga ordinaria de informes de asistencia. Avisar a coordinadora cuando un entrenador genere informe de resultados.
- Incluir apartado Comunicar incidencia para principal, ayudantes y delegados, con aviso a coordinadora.
# 13. Informes y estadísticas
- Informes por intervalo de fechas para entrenadores de sus equipos: asistencia individual, de equipo y resultados.
- Informe de jugador desde ficha: asistencias, ausencias por motivo, retrasos, equipos y temporadas; no ofrecer comparativa automática de porcentaje entre temporadas.
- Resultados de equipo: partidos, rivales, marcadores, ganados/perdidos y gráficos.
- Coordinadora: informe general de agrupación, con equipos, plantillas, técnicos, asistencia y resultados; informe final previo al cierre de temporada.
- Exportación PDF y Excel con filtros y estadísticas visibles; coordinadora y principales pueden exportar datos personales a Excel, pero ayudantes/delegados no. Notificar descarga de Excel personal a coordinadora.
- Gráficos de evolución de asistencia y resultados. Sin comparación entre equipos como función específica salvo informes generales aprobados.
# 14. Inicio, navegación y apariencia
- Inicio común por rol con resumen de próximos entrenamientos, partidos, notificaciones y tareas pendientes, filtrado por permisos.
- Accesos rápidos a equipos, calendario, asistencia, partidos, jugadores, documentación e informes. Buscador general de jugadores/equipos/partidos limitado por autorizaciones.
- Escudo y colores corporativos fijos durante desarrollo, no editables por coordinadora. Diseño moderno, elegante, limpio, responsive. Cada usuario puede elegir modo claro/oscuro.
- Interfaz únicamente en español. Web y apps instalables iOS/Android, además de opción de añadir web a pantalla de inicio.
# 15. Administración, auditoría, recuperación y soporte
- Importación Excel con vista previa, validación de obligatorios y detección de duplicados antes de confirmar. Exportación global a Excel por coordinadora.
- Confirmación para acciones importantes: cancelar entrenamientos, eliminar jugadores, desactivar usuarios.
- Papelera de jugadores/equipos y otros registros; conserva hasta decisión de coordinadora, que restaura relaciones e historial existente o elimina definitivamente con segunda confirmación. Debe respetar obligación legal de supresión.
- Backups automáticos: frecuencia y retención a recomendar por desarrollador. Coordinadora consulta último estado y puede restaurar desde app. Antes de restaurar, crear copia del estado actual y confirmar riesgos.
- Errores importantes de copias o sincronización generan aviso a coordinadora. Historial de auditoría y accesos consultable solo por coordinadora.
- Actualizaciones requieren autorización de coordinadora; definir procedimiento compatible con distribución de apps móviles y parches de seguridad.
# 16. Flujos principales y criterios de aceptación
## Alta de jugador
Flujo: Principal autorizado abre equipo → crea o busca jugador → sistema verifica duplicados → guarda adscripción → notifica coordinadora.
Criterio de aceptación: No duplicar ficha existente; nuevo jugador visible solo en equipos autorizados.
## Entrenamiento y asistencia
Flujo: Coordinadora define horario → genera sesiones → cuerpo técnico marca estados → sistema calcula completitud → recuerda pendientes.
Criterio de aceptación: Sin registrar no cuenta en denominador; retraso sí cuenta como asistencia.
## Cambio de pista
Flujo: Entrenador solicita con datos y motivo → coordinadora aprueba/rechaza → sistema actualiza calendario solo si aprobado → notifica.
Criterio de aceptación: No modificar sesión confirmada antes de aprobación.
## Partido escolar
Flujo: Entrenador propone → coordinadora aprueba → entrenador convoca → registra asistencia → adjunta acta → revisa extracción → guarda resultado.
Criterio de aceptación: Si extracción falla, permitir entrada manual; resultado notifica coordinadora.
## Documento técnico
Flujo: Entrenador adjunta documento → queda pendiente → coordinadora revisa y aprueba/rechaza → se refleja estado.
Criterio de aceptación: Un documento no aprobado no sustituye al vigente.
## Sincronización offline
Flujo: Entrenador registra sin red → cola local → recupera conexión → servidor valida → detecta conflictos → usuario decide → confirma.
Criterio de aceptación: No descartar cambios pendientes por fallos transitorios.
## Cierre de temporada
Flujo: Coordinadora solicita cierre → sistema enumera pendientes → confirma pese a pendientes → bloquea edición ordinaria → habilita corrección solo coordinación.
Criterio de aceptación: Histórico preservado y consultable conforme permisos.
# 17. Entidades y relaciones orientativas (modelo conceptual)
| Entidad | Datos y relaciones esenciales |
| Usuario | Rol, email, estado, sesiones, asignaciones a equipos |
| Temporada | Fechas, estado, equipos, cierre |
| Equipo | Temporada, categoría, rama, pista/horario, personal técnico |
| Jugador | Datos personales, estado, foto, observaciones |
| Inscripción | Jugador ↔ equipo ↔ temporada, dorsal y fechas |
| Jugador que sube | Jugador ↔ equipo receptor, tipo habitual/puntual, fechas/evento |
| Evento | Entrenamiento o partido, fecha, lugar, estado y aprobaciones |
| Convocatoria | Partido ↔ jugadores convocados |
| Asistencia | Evento ↔ jugador, estado, observación, autor, sincronización |
| Acta | Partido ↔ adjuntos y valores extraídos/validados |
| Documento | Titular, tipo, temporada, obligatoriedad, aprobación, acceso |
| Notificación | Destinatario, evento, leído, fecha |
| Auditoría | Autor, acción, objeto, valores/huella, fecha |
| Papelera | Entidad, fecha baja, restauración/eliminación |
| Backup | Fecha, estado, restauración y pre-copia |

# 18. Seguridad, privacidad y requisitos no funcionales
- Autenticación y autorización comprobadas en backend en cada consulta, exportación, ZIP y descarga. Principio de mínimo privilegio.
- Protección de datos de menores, contacto familiar, alergias, documentos de identidad y certificados: cifrado en tránsito y en reposo, segregación de acceso, logs de acceso y medidas para dispositivos extraviados.
- Especial atención al almacenamiento offline: persistencia cifrada y borrado de caché al revocar acceso o cerrar sesión; diseñar la experiencia offline sin exponer consultas de datos personales.
- Definir responsable/encargado del tratamiento, base jurídica, información a familias, derechos, política de conservación, incidentes de seguridad y evaluaciones necesarias antes de producción.
- Rendimiento, disponibilidad, compatibilidad iOS/Android/navegadores, accesibilidad, capacidad, monitoreo y pruebas de restauración requieren valores técnicos pactados.
# 19. Riesgos, dependencias y decisiones pendientes
| Prioridad | Asunto abierto / decisión requerida |
| Alta | Protección de datos: legitimación, política de conservación y supresión, roles de tratamiento, acceso a documentos sensibles. |
| Alta | Arquitectura de aplicación instalable y web; proveedor de alojamiento, autenticación, push y estrategia de publicación. |
| Alta | Mecanismo de autorización de actualizaciones frente a actualizaciones críticas de seguridad. |
| Alta | Definir políticas de backups: frecuencia, retención, RPO/RTO, restauración y prueba. |
| Alta | Diseñar conflicto offline y permisos para decidir en caso de múltiples técnicos; seguridad de datos locales. |
| Media | Confirmar formato/tamaño máximo de archivos y muestras de actas escolares para extracción automatizada. |
| Media | Fijar horas exactas de recordatorios, políticas de retención de notificaciones/auditoría y recuperación. |
| Media | Concretar permiso de ayudante/delegado en documentos y solicitudes de cambios de calendario. |
| Media | Definir si papelera y recuperación incluyen todos los tipos de registro o un subconjunto. |
| Media | Validar prototipos visuales, logos, colores y nombre final de categorías. |

Criterio de gestión de pendientes: son aspectos abiertos para diseño técnico o validación, no autorizaciones implícitas para implementar una solución concreta. Las decisiones funcionales expresas de la usuaria prevalecen frente a descripciones antiguas contradictorias.
# 20. Plan de implementación y pruebas propuesto
- Fase 1: identidad y roles, temporadas, equipos, fichas de jugadores, asistencia online/offline y auditoría mínima.
- Fase 2: calendario, aprobaciones, partidos, convocatorias, actas y estadísticas.
- Fase 3: documentación, informes/exportaciones, notificaciones, papelera, backup/restauración y mejoras.
- Pruebas obligatorias: permisos por rol y equipo, transición de temporada, porcentajes con Sin registrar, conflictos offline, recuperación de papelera, restauración backup, acceso histórico, PDF/Excel, avisos y flujo de aprobación.
# Anexo A. Cuestionario original: trazabilidad íntegra
Se reproduce a continuación el contenido textual del archivo RESPUESTAS_PREGUNTAS.docx facilitado durante el análisis. Es una fuente histórica: si difiere de una decisión posterior específica, prevalece la posterior. Se conserva para que el desarrollador pueda rastrear el origen de las necesidades.
## 1. GESTIÓN DE USUARIOS Y ROLES 🔐
¿Qué roles tendrá la aplicación? ¿Coordinadora, primer entrenador, segundo entrenador u otros?
## COORDINADOR / ENTRENADOR / AYUDANTE 1 / DELEGADO
¿La coordinadora tendrá acceso completo a todas las funcionalidades?
## SI A TODO
¿Los entrenadores podrán consultar todos los equipos o únicamente los suyos?
## SOLO LOS SUYOS
¿Los entrenadores podrán modificar información de otros equipos?
## NUNCA
¿Un entrenador podrá estar asignado a varios equipos?
## SI
¿Los primeros y segundos entrenadores tendrán los mismos permisos?
## SI
¿Quién podrá crear nuevos usuarios?
## COORDINADOR
¿Quién podrá modificar o eliminar usuarios?
## COORDINADOR
¿Cómo se registrarán los entrenadores en la aplicación?
## NOMBRE Y CONTRASEÑA
¿Cómo iniciarán sesión los usuarios?
## NOMBRE Y CONTRASEÑA
¿Se podrá desactivar temporalmente a un usuario?
## SI
¿Qué ocurrirá con el acceso de un entrenador cuando deje la agrupación?
## COORDINADOR DA DE BAJA
¿Los permisos dependerán únicamente del rol o también del equipo asignado?
## DEL ROL
¿Quieres registrar quién realiza cada modificación?
## SI
¿Los usuarios podrán modificar sus propios datos personales?
## SI, PERO COORDINADOR RECIBIRA UN MENSAJE DE QUE HA CAMBIADO DATOS
## 2. GESTIÓN DE TEMPORADAS 📆
¿Quién podrá crear una nueva temporada?
## COORDINADOR
¿Cómo se identificarán las temporadas? Por ejemplo, 2026/2027.
26/27
¿Podrá existir más de una temporada activa?
## SI, LA ANTERIOR Y LA SIGUIENTE
¿Se establecerán fechas de inicio y finalización?
## SI
¿Qué información deberá conservarse al finalizar una temporada?
## DATOS JUGADORES Y ENTRENADORES
¿Se podrán consultar temporadas anteriores?
## SI
¿Se podrán modificar los datos de temporadas finalizadas?
## NO
¿Los equipos se crearán de nuevo cada temporada?
## SI
¿Se podrán copiar equipos de una temporada a otra?
## SI CAMBIANDOLE EL NOMBRE
¿Los jugadores conservarán su ficha personal entre temporadas?
## SI
¿Se podrá consultar el historial de equipos de un jugador?
## SI
¿Se podrá consultar el historial de equipos de un entrenador?
## SI
¿Quién podrá cerrar una temporada?
## COORDINADOR
¿Qué ocurrirá con los partidos y entrenamientos pendientes cuando termine una temporada?
## SE MANDARA AVISO Y COORDINADOR RECIBIRA SI SE FINALIZAN
¿La aplicación mostrará automáticamente la temporada actual al iniciar sesión?
## SI
## 3. GESTIÓN DE EQUIPOS 🏀
¿Qué categorías deportivas existen en la agrupación?
ESCUELA B, ESCUELA A, PREBENJAMIN B, PREBENJAMIN A, BENJAMIN 1, BENJAMIN 2, ALEVIN 1, ALEVIN 2, PREINFANTIL, INFANTIL, CADETE JUNIOR, SENIOR, OVER 30, tanto en femenino como en masculino
¿Cómo se identifican los equipos?
## COMO MUCHO 4 LETRAS
¿Qué información tendrá la ficha de cada equipo?
NOMBRE, HORARIOS, HORARIOS PREPARADOR FISICO, ENTRENADOR, AYUDANTE, DELEGADO, NUMERO DE JUGADORES
¿Quién podrá crear equipos?
## COORDINADOR
¿Quién podrá modificar los datos de un equipo?
## COORDINADOR
¿Se podrán eliminar equipos?
## SI
¿Se podrán desactivar equipos sin eliminarlos?
## SI
¿Cada equipo pertenecerá obligatoriamente a una temporada?
## SI
¿Cada equipo tendrá asignado un primer entrenador?
## SI
¿Podrá tener varios entrenadores ayudantes?
## SI
¿Habrá un número máximo de jugadores por equipo?
## NO
¿Cómo se asignarán los jugadores a un equipo?
## UN EXCEL
¿Un jugador podrá pertenecer a varios equipos?
## SI
¿Se podrán cambiar jugadores de equipo durante la temporada?
## SI
¿Se conservará el historial de esos cambios?
## SI
¿Los equipos tendrán horarios fijos de entrenamiento?
## SI
¿Se podrán asignar pistas o pabellones?
## SI
¿Cada equipo tendrá su propio calendario?
## SI
¿Qué información quieres visualizar al entrar en la ficha de un equipo?
NOMBRE, HORARIOS, HORARIOS PREPARADOR FISICO, ENTRENADOR, AYUDANTE, DELEGADO, JUGADORES
¿Se podrán consultar los resultados y estadísticas del equipo?
## SI
## 4. GESTIÓN DE JUGADORES 👥
¿Qué datos personales quieres almacenar de cada jugador?
DORSAL, NOMBRE, APELLIDOS, GIR, DNI, FECHA DE NACIMIENTO, DIRECCION, CIUDAD CODIGO POSTAL, TEL, CORREO ELECTRONICO, ALERGIAS, TALLA, NOMBRE PADRE, TLF PADRE, NOMBRE MADRE TLF MADRE, FOTOGRAFIA
¿Será obligatorio registrar nombre, apellidos y fecha de nacimiento?
## SI
¿Quieres guardar una fotografía del jugador?
## SI
¿Se registrará el número de licencia federativa?
## SI
¿Quieres almacenar el número de camiseta?
## SI
¿Se registrará la categoría deportiva?
## SI
¿Quieres guardar la posición habitual del jugador?
## SI
¿Se registrarán los datos de contacto de padres o tutores?
## SI
¿Qué documentación necesitará cada jugador?
## FECHA DE NACIMIENTO, DNI, GIR
¿Se podrán adjuntar documentos a su ficha?
## SI
¿Se controlará la fecha de caducidad de los documentos?
## NO
¿Quién podrá consultar los datos personales?
## ENTRENADOR Y COORDINADOR
¿Quién podrá modificar la ficha de un jugador?
## ENTRENADOR Y COORDINADOR
¿Cómo se dará de alta a un jugador?
## CREANDO UN JUGADOR NUEVO EN EL EQUIPO
¿Qué ocurrirá cuando un jugador abandone la agrupación?
## SE ELIMINA, LO HARA EL COORDINADOR
¿Se conservará su historial deportivo?
## SI
¿Se podrán registrar observaciones sobre el jugador?
## SI
¿Se podrá consultar su asistencia a entrenamientos?
## SI
¿Se podrá consultar su participación en partidos?
## SI
¿Quieres que la aplicación permita buscar y filtrar jugadores por equipo, categoría o temporada?
## SI
## 5. GESTIÓN DE ENTRENADORES 📋
¿Qué información personal tendrá la ficha de un entrenador?
NOMBRE APELLIDOS, FECHA DE NACIMIENTO, DNI, TITULO DE ENTRENADOR, DIRECCION, FOTO, TALLA, CERTIFICADO DELITOS SEXUALES
¿Quieres guardar su fotografía?
## SI
¿Se registrarán sus titulaciones deportivas?
## SI
¿Se almacenará su licencia de entrenador?
## SI
¿Qué documentación será obligatoria?
## DNI
¿Se controlará la caducidad de los documentos?
## NO
¿Se registrará su disponibilidad horaria?
## SI
¿Se podrá asignar un entrenador a varios equipos?
## SI
¿Se distinguirá entre primer y segundo entrenador?
## SI
¿Quién podrá modificar las asignaciones?
## COORDINADOR Y ENTRENADOR
¿Se guardará el historial de equipos entrenados?
## SI
¿Qué ocurrirá cuando un entrenador deje la agrupación?
## SE DA DE BAJA POR EL COORDINADOR
¿Se podrán registrar observaciones sobre los entrenadores?
## SI
¿El entrenador podrá consultar y modificar su propia documentación?
## SI
¿Qué información quieres mostrar en su ficha?
## NOMBRE APELLIDOR FOTO Y TITULACION
## 6. CALENDARIO DEPORTIVO 📅
¿Quieres un calendario general de toda la agrupación?
## SI
¿Cada equipo tendrá su propio calendario?
## SI
¿Qué vistas quieres: diaria, semanal, mensual o todas?
## SEMANAL
¿Qué actividades aparecerán en el calendario?
## ENTRENAMIENTOS, PREPARACION FISICA, PARTIDOS, TECNIFICACIONES Y TORNEO
¿Los entrenamientos se generarán automáticamente a partir de un horario fijo?
## SI
¿Se podrán crear entrenamientos extraordinarios?
## SI
¿Se podrán cancelar entrenamientos?
## SI
¿Se podrán modificar fechas y horarios?
## SI
¿Se registrará el pabellón o pista?
## SI
¿Se podrán detectar coincidencias de horarios y pistas?
## SI
¿Los partidos aparecerán automáticamente en el calendario?
## SI
¿Se podrán diferenciar visualmente partidos y entrenamientos?
## SI
¿Quién podrá modificar el calendario?
ENTRENADOR Y COORDINADOR, PERO SI LO CAMBIA EL ENTRENADOR COORDINADOR DEBE RECIBIR AVISO
¿Los entrenadores podrán consultar calendarios de otros equipos?
## NO
¿Se podrán filtrar las actividades por equipo, categoría o fecha?
## SI
¿Quieres mostrar una agenda semanal con todos los partidos?
## SI
¿Se podrán exportar o imprimir los calendarios?
## SI
¿Quieres avisos cuando cambie un horario?
## SI
¿Se podrán añadir observaciones a una actividad?
## SI
¿Cómo quieres que se gestione una actividad suspendida o aplazada?
## AVISANDO
## 7. GESTIÓN DE PARTIDOS 🏆
¿Qué datos quieres registrar de cada partido?
## DIA, HORA, LUGAR Y RESULTADO
¿Se distinguirán partidos oficiales y amistosos?
## SI
¿Quieres registrar la competición?
## SI
¿Se registrará la jornada?
## SI
¿Se guardará el equipo rival?
## SI
¿Se indicará si el partido es como local o visitante?
## SI
¿Se registrará la instalación deportiva?
## SI
¿Se guardarán fecha y hora?
## SI
¿Quién podrá crear partidos?
## SI
¿Quién podrá modificar sus datos?
## ENTRENADOR Y COORDINADOR
¿Se podrán importar calendarios de competiciones?
## SI EN PDF
¿Se podrán aplazar partidos?
## SI
¿Se podrán cancelar encuentros?
## SI
¿Se registrará el motivo de los aplazamientos?
## SI
¿Se podrá marcar un partido como disputado?
## SI
¿Se podrán añadir observaciones?
## SI
¿Quieres gestionar convocatorias de jugadores?
## SI
¿Se registrarán los entrenadores asistentes?
## SI
¿Quieres consultar el historial de enfrentamientos contra un rival?
## SI
¿Qué información quieres ver al abrir un partido?
## RESULTADO, ANOTADORES, Y OBSERVACIONES
## 8. ACTAS Y RESULTADOS DE PARTIDOS 📄
¿Quién introducirá el resultado de un partido?
## ENTREBADOR
¿Qué formato tendrá el resultado?
## NUMERICO
¿Se registrarán los puntos de ambos equipos?
## SI
¿Quieres guardar resultados por periodos o cuartos?
## SI POR PERIODOS
¿Se registrará si el partido se ha ganado, perdido o empatado?
## SI
¿Se podrán adjuntar actas en PDF?
## SI
¿Se podrán adjuntar fotografías de las actas?
## SI
¿Quién podrá subir las actas
## ENTRENADOR Y COORDINADOR
¿Se podrá sustituir un acta ya guardada?
## SI
¿Quieres registrar cuándo se subió el documento?
## SI
¿Se podrán consultar todas las actas de una temporada?
## SI
¿Se podrán filtrar resultados por equipo y competición?
## SI
¿Quieres mostrar una clasificación de partidos ganados y perdidos?
## SI
¿Se calcularán automáticamente estadísticas de resultados?
## SI
¿Quieres registrar incidencias ocurridas durante un partido?
## SI
¿Se podrá consultar el resultado desde el calendario?
## SI
¿Se podrán descargar las actas?
## SI
¿Se podrán registrar resultados sin adjuntar un acta?
## SI
¿Qué ocurrirá cuando un partido se suspenda después de comenzar?
## SE REGISTRA
¿Quién podrá corregir un resultado registrado?
## ENTRENADOR Y COORDINADOR
## 9. CONTROL DE ASISTENCIA 📝
Este módulo lo estudiaremos especialmente porque has indicado que quieres un seguimiento tanto individual como grupal.
¿Quieres controlar la asistencia únicamente a entrenamientos o también a partidos?
## SI TODO
¿Quién podrá registrar las asistencias?
## SI
¿Cómo quieres que aparezca la lista de jugadores?
## TIPO TABLA
¿Qué estados de asistencia existirán?
## ASISTENCIA, LESION, VIAJE, ESTUDIOS, MEDICO, OTROS
¿Quieres distinguir entre ausencia justificada e injustificada?
## SI
¿Se podrán registrar retrasos?
## SI
¿Se podrá indicar el motivo de una ausencia?
## SI
¿Quién podrá modificar una asistencia ya registrada?
## ENTRENADOR COORDINADOR
¿Se podrá registrar la asistencia de todo el equipo desde una única pantalla?
## SI
¿Quieres poder marcar a todos como presentes y modificar únicamente las ausencias?
## SI
¿Se podrán registrar asistencias de entrenamientos extraordinarios?
## SI
¿Se podrá consultar la asistencia individual de un jugador?
## SI
¿Quieres mostrar el porcentaje de asistencia individual?
## SI
¿Se podrá consultar la asistencia general de un equipo?
## SI
¿Quieres estadísticas semanales, mensuales y por temporada?
## SEMANALES, MENSUALES Y TENMPORADA
¿Se podrán comparar asistencias entre diferentes periodos?
## SI
¿Quieres identificar a los jugadores con más ausencias?
## SI
¿Se podrán añadir observaciones a cada registro?
## SI
¿Se podrán descargar informes de asistencia?
## SI
¿Qué ocurrirá con la asistencia de un jugador que cambie de equipo durante la temporada?
## SE MANTENDRA
## 10. GESTIÓN DOCUMENTAL 📁
¿Qué tipos de documentos quieres almacenar?
## FICHA
¿Los documentos estarán vinculados a jugadores, entrenadores o equipos?
## JUGADORES
¿Quieres disponer también de una biblioteca documental general?
## SI
¿Quién podrá subir documentos?
## ENTRENADOR COORDINADOR
¿Quién podrá descargarlos?
## ENTRENADOR COORDINADOR
¿Quién podrá eliminarlos?
## ENTRENADOR COORDINADOR
¿Se podrán modificar o sustituir documentos?
## SI
¿Qué formatos de archivo estarán permitidos?
## PDF, JPG, EXCEL
¿Se establecerá un tamaño máximo por archivo?
## 2MB
¿Se podrán clasificar documentos por categorías?
## SI
¿Quieres controlar documentos obligatorios y pendientes?
## SI
¿Se registrarán fechas de caducidad?
## NO
¿Quieres recibir avisos de documentación caducada?
## SI
¿Se podrá consultar la documentación pendiente de un equipo completo?
## SI
¿Quieres almacenar diferentes versiones de un mismo documento?
## NO
¿Se conservarán documentos de temporadas anteriores?
## NO
¿Se podrán buscar documentos por nombre, persona o categoría?
## SI
¿Habrá documentos que únicamente pueda consultar la coordinadora?
## SI
¿Se podrá descargar toda la documentación de una persona?
## SI
¿Quieres generar informes de documentación pendiente?
## SI
## 11. PANTALLA DE INICIO Y NAVEGACIÓN 🖥️
¿Qué información quieres mostrar en la pantalla de inicio?
## MENU DE BOTONES, EQUIPO, CALENDARIO
¿La coordinadora y los entrenadores tendrán pantallas de inicio diferentes?
## NO
¿Quieres mostrar los próximos partidos?
## SI
¿Quieres mostrar los entrenamientos de la semana?
## SI
¿Quieres mostrar los últimos resultados?
## SI
¿Quieres mostrar avisos de documentación pendiente?
## SI
¿Quieres mostrar información de asistencia?
## SI
¿Quieres incluir accesos rápidos a los equipos?
## SI
¿Cómo quieres organizar el menú principal?
## BOTONES
¿Prefieres un menú lateral o superior?
## LATERAL
¿Quieres que el menú cambie dependiendo del rol?
## NO
¿Quieres incorporar el escudo de la agrupación?
## SI EL LOGO
¿La aplicación utilizará los colores corporativos del colegio?
## SI
¿Quieres que funcione correctamente en móviles y ordenadores?
## SI
¿Quieres que cada usuario pueda personalizar su pantalla de inicio?
## NO
## 12. INFORMES Y ESTADÍSTICAS 📊
Este módulo todavía no está confirmado. Lo incluimos en el cuestionario para valorar si te interesa.
¿Quieres generar informes de equipos?
## SI
¿Quieres informes individuales de jugadores?
## SI
¿Quieres informes de asistencia?
## SI
¿Quieres estadísticas de resultados?
## SI
¿Quieres comparar equipos?
## NO
¿Quieres consultar estadísticas de diferentes temporadas?
## SI
¿Quieres exportar información a Excel?
## SI
¿Quieres generar documentos PDF?
## SI
¿Quién podrá acceder a los informes?
## ENTRENADOR Y COORDINADOR
¿Quieres gráficos que permitan visualizar la evolución deportiva?
## SI
## 13. CONFIGURACIÓN Y ADMINISTRACIÓN ⚙️
¿Quién podrá acceder a la configuración general?
## COORDINADOR
¿Quieres gestionar las categorías desde la aplicación?
## SI
¿Quieres gestionar los pabellones y pistas disponibles?
## SI
¿Quieres mantener un listado de equipos rivales?
## SI
¿Quieres configurar los tipos de documentos?
## SI
¿Quieres configurar los estados de asistencia?
## SI
¿Quieres configurar las competiciones?
## SI
¿Quieres personalizar los permisos de cada rol?
## SI
¿Quieres disponer de un registro de modificaciones?
## NO
¿Quieres poder recuperar información eliminada por error?
## SI
¿Qué datos deberían ser obligatorios?
¿Quieres que la aplicación detecte registros duplicados?
## SI
¿Quieres una opción para importar datos desde Excel?
## SI
¿Quieres realizar copias de seguridad?
## SI
¿Quién podrá modificar la configuración de la agrupación?
## SI
## 14. TECNOLOGÍA Y FUNCIONAMIENTO 💻
Estas preguntas las responderemos cuando tengamos definidos los requisitos funcionales.
¿Quieres desarrollar una aplicación web, móvil o ambas?
## AMBAS
¿Qué dispositivos utilizarán habitualmente los entrenadores?
## PC Y MOVIL
¿Quieres utilizar Power Apps u otra tecnología?
## LO QUE ME DIGAS
¿Dónde quieres almacenar la información?
## NO LO HE PENSADO EN ICLOUD?
¿Dónde se guardarán los documentos?
## EN ICLOUD
¿Los usuarios necesitarán conexión a Internet?
## SI
¿Quieres permitir alguna funcionalidad sin conexión?
## OK
¿Cómo se realizará la autenticación?
## PROPONME
¿Quieres que la aplicación envíe notificaciones?
## SI
¿Será necesario integrar servicios externos?
## NO
¿Quieres automatizar determinadas tareas?
## OK
¿Quién se encargará del mantenimiento?
## CARLOTA
¿Tienes un presupuesto previsto?
## NO
¿Quieres desarrollar la aplicación por fases?
## SI
¿Qué funcionalidades consideras imprescindibles para la primera versión?
## DATOS JUAGADORES Y ASITENCIA
