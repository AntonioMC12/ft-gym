# Registro de ejecución: módulo de centros

Última actualización: 14 de octubre de 2026.

## Punto de reanudación

- Trabajo actual autorizado (14 octubre): continuar roadmap hasta que reste el 20% del límite disponible; corregir Atrás de Centros y conservar esa pauta para navegación/breadcrumbs futuros. La orden de apagado del 13 octubre terminó en aquella ejecución; no se aplica a esta sesión.
- Rama: `codex/centers-module`, creada desde `53ef0baf`. F0-F3 verificadas en entorno ficticio. Commits: `75e1160d`, `433764a5`, `24cb5a42`.
- Guía: [CENTERS_ROADMAP.md](CENTERS_ROADMAP.md). Instrucciones: [AGENTS.md](../../AGENTS.md).
- Siguiente tarea: **C23 / F7**, navegación por rol/contexto de centro, conservando historial y navegación personal.
- Último hito cerrado: C22, área privada del socio con contratos, recibos y pagos propios; RLS y DTO separados de administración. Atrás de Centros sigue el historial; preferencia guardada en AGENTS.md.
- Pruebas C18: 47 unitarias API, 66 frontend/controles, 3 OpenAPI y 10 SQL+HTTP reales pasan. Comparativa general y comprobación visual registradas abajo.

Este registro contiene el estado de ejecución; el roadmap define requisitos y dependencias. La autorización vigente siempre procede del usuario, no de una casilla de este archivo.

## Contexto previo que debe preservarse

El repositorio de la aplicación es `openGym/`, dentro del workspace exterior ft-gym. HEAD al preparar la guía: `775e1c11`; API/frontend declaran 1.4.1. Registrar nuevamente el HEAD al iniciar C00.

Había modificaciones previas en `.dockerignore`, `.gitignore`, `docs/diagrams/render.sh`, `web/05-check-base-path.sh`, `web/Dockerfile` y `website/build-images.sh`. También archivos locales de demo: `.env.demo.example`, `.gitattributes`, `compose.demo.yml`, `demo-pages/`, `docs/DEMO_LOCAL_PAGES.md` y scripts PowerShell. No son cambios realizados para implementar centros; no limpiarlos, revertirlos ni atribuirlos a este módulo.

La configuración Docker del repositorio separa `web` y `api`. En la sesión de análisis el comando docker no estaba disponible en PATH; el estado de contenedores ejecutándose no se pudo comprobar. Esto es una observación del entorno, no una prueba de que Docker no esté instalado en el equipo ni un bloqueo permanente de las tareas futuras.

En la preparación no se había medido una suite baseline; C00-C02 la midieron después (historial abajo). `.github/workflows/test.yml` no existe en esta copia. Gitea solo selecciona frontend/MCP; no se ha activado CI remota del fork.

## Tablero de tareas

Estados permitidos: `todo`, `in_progress`, `done`, `blocked`. Una tarea done necesita evidencia en el historial; una tarea blocked necesita motivo concreto y requisito de desbloqueo. El valor inicial todo no equivale a autorización para empezar.

| ID | Fase | Entrega abreviada | Estado |
|---|---|---|---|
| C00 | F0 | Baseline y entorno | done |
| C01 | F0 | Capacidades y políticas | done |
| C02 | F0 | Verificación y CI | done |
| C03 | F1 | Compose y PostgreSQL | done |
| C04 | F1 | pg, migraciones y roles SQL | done |
| C05 | F1 | Esqueleto, contratos y harness | done |
| C06 | F2 | Esquema inicial | done |
| C07 | F2 | Authz, RLS y DTO | done |
| C08 | F2 | Referencias JSON-SQL y borrado | done |
| C09 | F2 | Admin técnico y superadmin | done |
| C10 | F3 | Bootstrap y centros | done |
| C11 | F3 | Roles y responsables | done |
| C12 | F3 | UI de plataforma | done |
| C13 | F4 | Alta y ficha de socio | done |
| C14 | F4 | Baja/pausa contractual | done |
| C15 | F4 | Invitaciones y vinculación | done |
| C16 | F5 | Cuotas versionadas | done |
| C17 | F5 | Suscripciones | done |
| C18 | F5 | Cálculo económico | done |
| C19 | F6 | Recibos idempotentes | done |
| C20 | F6 | Pagos y aplicaciones | done |
| C21 | F6 | Deuda y calendario | done |
| C22 | F6 | Área del socio | done |
| C23 | F7 | Navegación/contexto | in_progress |
| C24 | F7 | Piloto MVP y restauración | todo |
| C25 | F8 | Jobs y outbox | todo |
| C26 | F8 | Email y avisos | todo |
| C27 | F9 | Stripe | todo |
| C28 | F9 | SEPA | todo |
| C29 | F10 | Propuestas de rutinas | todo |
| C30 | F10 | Progreso compartido | todo |
| C31 | F11 | QR y visitas | todo |
| C32 | F11 | KPI | todo |
| C33 | F11 | Riesgo de baja | todo |
| C34 | F12 | Clases y reservas | todo |
| C35 | F12 | Alta pública | todo |
| C36 | F12 | CSV | todo |
| C37 | F12 | Solicitud de congelación | todo |
| C38 | F12 | Bonos/promociones | todo |
| C39 | F12 | Facturas y fiscalidad | todo |
| C40 | F13 | Operación y reversión | todo |
| C41 | F13 | Activación gradual | todo |
| C42 | F13 | Aceptación/documentación | todo |

## Gates de entrega

| Gate | Condiciones | Estado |
|---|---|---|
| Infraestructura | C03-C05 + módulo apagado/activo/SQL caído + empaquetado | verificado, target default |
| Aislamiento | C06-C09 + RLS real, revocación y protección de identidad | verificado |
| MVP de ensayo | C00-C24 + recorrido completo, suites/build y restore | pendiente |
| Cobros automáticos | C25-C28 según pasarela + sandbox y conciliación | pendiente |
| Entrenador | C29-C30 + convergencia y privacidad | pendiente |
| Acceso/retención | C31-C33 + validación física y métricas | pendiente |
| Crecimiento | C34-C39 según alcance + gates específicos | pendiente |
| Activación MVP real | C40-C41 + gate MVP + políticas/configuración + autorización | pendiente |
| Módulo completo | C00-C42 y CU-01..CU-16 con evidencia | pendiente |

## Decisiones en ejecución

Registrar únicamente decisiones tomadas y supuestos adoptados, con alcance y momento de revisión. Las propuestas iniciales están en la sección 4 del roadmap y aún no son condiciones comerciales aprobadas.

| ID | Decisión | Estado | Evidencia/impacto |
|---|---|---|---|
| D00 | Mantener web/api y añadir PostgreSQL en el mismo Compose | implementada F1 | Overlay local y stack test independientes |
| D01 | Mantener inicialmente identidad/entrenamiento JSON | implementada F1 | C08 protege los futuros vínculos |
| D02 | Capacidades y defaults ficticios versionados; impuestos/precio/conservación aún sin aprobar para producción | contrato de desarrollo C01 | policies.js; no emisión monetaria ni suspensión automática todavía |
| D03 | Proveedores, credenciales y hardware | pendiente según integración | No necesarios para preparar MVP ficticio |

## Bloqueos técnicos e información pendiente

No existe bloqueo de Docker/SQL: Docker Desktop se localizó fuera de PATH y está operativo. Las suites generales tienen fallos previos documentados; no se han convertido en un bloqueo del módulo. Las decisiones comerciales pendientes solo afectan a sus tareas dependientes.

Formato para nuevas entradas: tarea, motivo, evidencia, trabajo independiente posible y condición de desbloqueo.

## Historial de ejecución

### 2026-10-13 · Preparación de documentación

- Alcance: roadmap de implementación y guía para Codex, sin integrar funcionalidades.
- Documentos creados: roadmap, registro de progreso e instrucciones AGENTS del repositorio y del workspace exterior. Índice de docs actualizado.
- Resultado funcional: ninguno; todas las Cxx continúan todo.
- Evidencia de documentación: referencias locales, IDs/dependencias y diff revisados en la sesión de creación.
- Siguiente paso: autorización futura de implementación y C00.

### 2026-10-13 · C00-C05 / F0-F1

- Alcance: implementación en rama separada, ampliado por el usuario para continuar fases hasta reservar el 20% del uso. Base `53ef0baf`; cambios previos conservados.
- Entorno: Node 24.20.0/npm 12 en Windows; Docker Desktop 29.8.2 encontrado en AppData/Local/Programs/DockerDesktop/resources/bin, fuera de PATH. Pruebas de imagen usan Node 22 Linux.
- C01: capacidades manager/trainer/member y plataforma separadas; defaults ficticios versionados en policies.js. Impuesto/precio y condiciones productivas siguen pendientes, sin bloquear infraestructura.
- C03-C05: overlay Compose, pg 8.23.1, roles separados, migración 001 con checksum/advisory lock, conexión lazy y endpoint status. Credenciales privilegiadas solo en .env.centers/interpolación, no en env_file runtime. Documentación de operación en CENTERS_DEVELOPMENT.md.
- Baseline API: 596 tests, 568 pass y 28 fail. Baseline frontend: 402 archivos, 387 pass/15 fail; 5055 tests, 5001 pass/54 fail. Se repitieron fuera del sandbox por errores EPERM de rename de temporales. Logs locales ignorados: baseline-api-unrestricted.log y baseline-frontend-unrestricted.log.
- Después de F1: API completa 622 tests, 595 pass/27 fail; comparación de nombres: ningún fallo nuevo. Corregido el scanner OpenAPI frente a CRLF, que era uno de los fallos previos. No se corrigieron fallos de Coach, filesystem/Windows o frontend ajenos al módulo.
- Verificación específica: 27/27 unitarias/contratos/COPY; 10/10 HTTP y sincronización personal; 2/2 integración PostgreSQL+HTTP reales. Repetición tras restart de centers-test-db: 2/2; versiones persistidas e idempotentes.
- SQL real: compose.centers.test.yml, proyecto ft-gym-centers-tests, sin puertos ni datos de la demo; RLS de tabla probe, rollback, rechazo de migrador runtime y recuperación de disponibilidad sin reiniciar API.
- Compose base+overlay validado con configuración ficticia y sin env_file real: red SQL privada, sin credenciales bootstrap/migrador en API. Imagen default construida y arrancada. Target Coach opcional no activado ni construido.
- Frontend build pasa; 18 locales/2258 claves y 1762 cadenas de fuente cubiertas. API docs generadas y --check pasa. MCP no modificado; no se instaló su runtime de tests aún.
- Estado: C00-C05 done; gate infraestructura verificado para target default. Módulo sin centros reales y apagado en despliegue habitual. Demo existente intacta.
- Siguiente: C06-C09; ningún permiso de gestión se concede hasta completar aislamiento y protección de cuentas.

### 2026-10-13 · C06-C09 / F2

- Esquema 002: centros, asignaciones, socios, consentimientos, auditoría e idempotencia con claves por centro. Funciones SQL de permiso acotadas; metadatos de rol/referencia con RLS y acceso de propietario controlado para evitar recursión. FORCE RLS sobre negocio.
- C07: afiliaciones /centers/me, ficha por rol, contexto de transacción que restablece el flag plataforma, capacidades y revocación vigentes. Locks de centro/roles para operaciones sensibles.
- C08: registry mantenido por triggers, exclusión mutua entre enlazar/eliminar cuentas, marcador durable y borrado fail-closed aun con módulo oculto/SQL caído. Reconciliación read-only informa referencias huérfanas; no recrea usuarios ni concede acceso.
- C09: allowlist CENTERS_SUPERADMIN_UIDS separada del admin técnico y de los roles manager/trainer. Se conserva la autoridad técnica heredada explícita; los responsables no obtienen /api/admin. Los permisos locales solo proceden de SQL.
- Verificación: 26/26 unitarias del módulo + 5/5 contratos/COPY; 14/14 HTTP/config/sync/borrado legado; 3/3 integración real con RLS, FK cruzada rechazada, unicidad local, DTO trainer, revocación y protección al ocultar módulo. SQL probado en stack independiente, imagen Node 22 reconstruida.
- Suite API completa: 626/599 pass/27 fail, ningún fallo nuevo frente a baseline. Contrato generado de 73 endpoints y --check pasa. Frontend no cambiado en F2, no se repitió su suite fallida sin motivo nuevo.
- Limitaciones: restauración antigua sin marcador e imágenes previas sin protección necesitan el procedimiento de C40; no afirmar seguridad automática para esos casos. Políticas económicas reales y proveedores siguen pendientes de sus fases.
- Estado: C06-C09 done. Siguiente: F3. El stack de demo continúa intacto.

### 2026-10-13 · C10-C12 / F3

- Bootstrap por uid existente/allowlist; creación idempotente actor/requestId. Sin responsable permanece draft; cuenta existente habilitada activa el centro en la misma transacción. Configuración: contacto/fiscal, aforo, zona horaria, día de cobro y hasta cuatro franjas diarias. No genera importes.
- Migraciones 003/004 aplicadas en SQL de pruebas: restricción diferida de responsable vigente, gestión local de trainers y configuración. No editar migraciones aplicadas.
- Sustitución/revocación serializadas por centro, versión optimista y auditoría. Dos revocaciones concurrentes conservan un responsable. Deshabilitar una cuenta global también verifica responsables habilitados bajo los mismos locks; último superadmin protegido. No borra centros físicamente.
- UI Settings + HashRouter /centers, asistente de tres pasos, búsqueda limitada de cuentas de plataforma, panel de configuración/responsables/staff. Trainer recibe DTO operativo. Store separado en memoria, limpieza en logout/cambio/revocación, respuestas tardías descartadas; refrescos sin cambios conservan formularios.
- Contrato: 84 endpoints/34 schemas; generador --check pasa. stage centers/schemaVersion 004. 18 locales/2297 claves; nuevas traducciones pt-BR revisadas explícitamente.
- Tests: centers-f3-unit.log 25/25; frontend/centers-f3-ui-final.log 12/12; centers-f3-final-sql.log 4/4 Node 22/PostgreSQL real, incluyendo concurrencia y DTO de configuración. API general api/centers-f3-full-api.log: 628 tests/601 pass/27 fail, ningún nombre de fallo nuevo.
- Frontend final frontend/centers-f3-full-frontend-verified.log: 404 archivos/389 pass/15 fail; 5062 tests/5008 pass/54 fail. Mismos fallos previos del baseline. Build pasa con avisos heredados; locales pasan. Error de sintaxis del shell y snapshot pt-BR detectados y corregidos antes del cierre.
- Navegador: login ficticio, creación draft y edición persistida; escritorio y 390 px sin desbordamiento (contenido 375 px). Captura fuera del repo. API temporal loopback 3011/5178, PostgreSQL sin puertos; no usa datos reales. Docker Desktop se restableció y las pruebas SQL se repitieron.
- Límites: plataforma lista hasta 100 centros. Invitaciones de responsable se completan en C15; sin cuenta asignada permanece draft. UI de capacidades económicas extraordinarias y operación productiva dependen de fases posteriores. MCP no modificado. F4-F13 pendientes.
- Se cierra la sesión al alcanzar la reserva de uso solicitada; reanudar por C13, conservando cambios locales previos de demo.

### Preparación de C13 / siguiente recorrido

- Reutilizar members, memberDto y requireCenter; alta/edición requieren members.manage, listado/ficha usan members.read u operational.read con DTO por fila. Nunca promover una cuenta por contacto coincidente.
- Socio sin cuenta: account_uid null; vínculo e invitaciones se reservan a C15. Generar id y número de socio por centro en transacción, con reintento idempotente; no implementar MAX(number)+1 sin serialización.
- Listado con cursor estable y límite máximo; filtros parametrizados dentro del centro seleccionado. Validar contacto/documento y tratar unicidad local mediante 23505, manteniendo permitido el mismo dato en otro centro.
- Auditar altas/ediciones sin copiar documentos/contacto completos al detalle del evento. Edición con versión; no mezclar con baja/pausa de C14 ni modificar entrenamiento JSON.
- Añadir services/members.js y rutas junto a OpenAPI, una vista de listado/ficha sobre useCenters, traducciones y pruebas SQL reales de duplicados/cursor/roles/cruce de centros. C13 sigue todo hasta completar ese recorrido.

### 2026-10-13 · C13 / F4 y reutilización

- Usuario pidió conservar pautas de reutilización para sesiones futuras y continuar hasta agotar presupuesto disponible. Guardadas en AGENTS.md, sustituyendo la reserva anterior.
- Alta sin cuenta, preactive, número M-xxxxxx bajo lock de centro, fecha local e idempotencia actor/requestId. Duplicados normalizados de email/documento solo dentro del centro. Edición con versión, sin alterar estados/fechas/permisos/entrenamiento.
- Listado 1..100 con cursor created_at/id que conserva microsegundos y se vincula a cuenta/centro/filtros; búsqueda literal nombre/número. Manager recibe contacto/documento, trainer operación. Lecturas sensibles bloquean contexto/roles hasta proyectar DTO ante revocación concurrente.
- Sin migración nueva: reutiliza esquema 004. Auditoría sin campos privados. Contrato de 87 endpoints/35 schemas generado.
- UI Members.jsx separado, Section/Row, SearchField, paginación real + useAutoMore, formulario alta/ficha. Centros reutiliza Switch, búsqueda con limpieza, filas, confirmSheet, toast y Segmented datos/socios. Controles en formularios no envían pasos accidentalmente; contexto limpia al cambiar cuenta/centro/capacidades.
- Tests: centers-f4-unit.log 11/11, frontend/centers-f4-ui.log 17/17, centers-f4-sql.log 5/5 reales. API general api/centers-f4-full-api.log 630/603 pass/27 fail previos; frontend/centers-f4-full-frontend.log 405 archivos/390 pass/15 fail, 5066 tests/5012 pass/54 fail previos. Comparación por nombres sin fallo nuevo. Controles/pestañas finales verificados específicamente; build final pasa.
- 18 locales/2311 claves y 1813 cadenas de fuente cubiertas; pt-BR explícito. Navegador: responsable ficticio crea socio/abre ficha; escritorio y 390 px sin overflow. Captura fuera del repo. Reconstrucción de API temporal reinicia sesiones ficticias: volver a entrar.
- C13 done. C14/C15 pendientes; activación contractual con C17. No hay datos de administración en S ni despliegue productivo.

### 2026-10-13 · Inicio C14 / dominio

- membership-transitions.js planifica end/freeze/resume con fuente válida, fechas ISO reales, motivo, fecha de reanudación posterior y distinción inmediato/programado. Fecha actual debe proceder de la zona del centro. No muta cuenta/SQL/cobros ni activa socios preactive; activación pertenece a C17.
- centers-f4-transitions-unit.log: 6/6 (incluye 2 de validación C13), límites de calendario/bisiesto, transición inválida, ausencia de mutación, fechas futuras/retroactividad y campos de privilegio rechazados. Sin rutas ni cambios SQL para estas transiciones todavía.
- C14 in_progress: falta diseño/persistencia de historial y planificación, coordinación/versionado, aplicación efectiva, API/DTO/UI y pruebas SQL. Al continuar, comprobar conflictos entre eventos futuros bajo lock; no guardar frozen/ended inmediatamente si su fecha aún no ha llegado. Estados leídos y filtros deben concordar con fecha local. Efectos económicos se completan en C17 y jobs en C25.
- C13 guardada en 5d3c9bfc; mantener su resultado y los cambios previos de demo. Vista local deja disponible la pestaña Socios para Responsable Pruebas (password ficticio del preview); Plataforma Centros conserva gestión global de centros, sin acceso automático a fichas de socios.
- C14 dominio guardado en 4dbaab9a. Último ajuste C13 descarta fichas antiguas cuando dos respuestas llegan desordenadas; frontend/centers-f4-ui.log ahora 18/18 y build final pasa. Continúa pendiente integrar C14 en SQL/API/UI y después C15.

### 2026-10-13 · C14 completa y alcance superadmin

- Usuario aclaró que superadmin debe administrar centros, responsables, configuración y socios. Capacidades members.read/manage explícitas; transacciones globales solo tras validar allowlist, acotadas a centro y auditadas como platform.members.*. Admin técnico/local manager no recibe privilegio global; cuerpo/query no puede activarlo.
- Migraciones 005/006: historial de cambios con claves compuestas, RLS, restricciones y cancelación limitada por columnas; app no borra ni reescribe motivos/historia. Procedencia de reanudaciones sustituidas permite recuperarlas al cancelar un cambio futuro. Archivos ya aplicados a base test: no editar.
- member_profiles usa security_invoker/security_barrier: respeta RLS del invocador y calcula estado/fecha de baja según eventos efectivos y zona del centro, incluso sin jobs. Fuente verificada: [CREATE VIEW PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createview.html). No se materializa un estado futuro prematuramente.
- End para preactive/active/frozen, freeze para active, resume para frozen; motivo y fechas reales, control de versión, requestId idempotente y auditoría sin motivos privados. Cancelación solo de raíz futura; activaciones contractuales reservadas a C17. Reanudación automática sustituida por baja/reanudación temprana se restaura al cancelar el cambio pendiente. Efectos financieros pendientes de C17.
- UI reutiliza Section/Row, campos, SelectRow, confirmSheet y toast; historial y acciones por estado. Cambiar afiliación conserva contacto aún no guardado y actualiza versión. Controles de selección/navegación/búsqueda compartidos declaran type=button para evitar envíos accidentales dentro de formularios, con prueba conductual.
- Evidencia: centers-lifecycle-unit.log 34/34; frontend/centers-lifecycle-ui.log 42/42; centers-lifecycle-sql.log 6/6 reales. Incluye carreras, zonas Kiritimati/Pago Pago, reanudación efectiva sin job, recuperación de fecha original, rol trainer sin motivos, superadmin sin asignación local, RLS en vista y sesión personal intacta.
- API general api/centers-lifecycle-full-api.log 634/607 pass/27 fail previos; frontend/centers-lifecycle-full-frontend.log 406 archivos/391 pass/15 fail, 5074 tests/5020 pass/54 fail previos. Comparación por nombre: ningún fallo nuevo. Últimos ajustes de presentación/guardas se verifican con pruebas específicas.
- Contrato generado: 89 endpoints/37 schemas, versión SQL 006. Build/locales/source strings pasan: 18 locales/2328 claves, 1828 cadenas. Navegador: superadmin crea socio, programa baja futura y la cancela conservando historial; 390 px sin overflow. Captura ficticia en informes/centros-c14-local.jpg del workspace exterior. Preview reutiliza centro existente al reiniciar.
- C14 done; siguiente C15. Sin cambios en datos reales ni despliegue productivo; cambios previos de demo preservados.

### Plantilla de entrada futura

Copiar esta plantilla al ejecutar una tarea; no completar sus valores con resultados supuestos.

```text
Fecha y tarea(s):
Alcance autorizado:
Baseline (HEAD y cambios previos pertinentes):
Resultado y archivos modificados:
Decisiones/supuestos y motivo:
Comandos de verificación (cwd, comando, resultado, duración si útil):
SQL/Docker real o mocks utilizados:
Regresiones/fallos previos y evidencia:
Comprobaciones not_run y motivo:
Criterios de cierre cumplidos/pendientes:
Estado final de cada tarea:
Cambios incompatibles y reversión, si existen:
Siguiente tarea alcanzable y dependencias:
```

No guardar credenciales, bodies privados, volcados de socios, IBAN, tarjetas o resultados de docker compose config con secretos. Para reanudar, basta este registro y las secciones pertinentes del roadmap; las pruebas ejecutadas deben poder localizarse en el repositorio o repetirse en un entorno aislado.

### C15 / F4: invitación con destinatario y canje recuperable

- Migración 007: invitaciones por centro, destinatario account_uid, hash SHA-256 de secreto aleatorio de 256 bits, caducidad 1-168 horas (72 por defecto), estado/versionado y unicidad de invitación pendiente. RLS, grants limitados, relaciones de socio del mismo centro y protección de borrado de la cuenta mientras existe invitación vigente. Invitaciones caducadas/revocadas no bloquean una cuenta sin otros vínculos.
- Crear/listar/revocar exige capacidad actual; solo superadmin configurado invita responsables. Canje exige sesión de la cuenta destinataria y autoridad vigente del emisor. Transacción SQL vincula socio/asigna rol y consume código; ninguna escritura de cuenta/entrenamiento JSON. El uso repetido confirma el resultado anterior y nunca restaura un rol revocado. Bloqueos de cuentas coordinan con baja/borrado global.
- El secreto se devuelve una vez, no entra en auditoría, idempotencia, S ni almacenamiento local. Si se pierde por timeout, el reintento devuelve token null: revocar y crear otro. Recuperación explícita en UI. Enlace conserva subruta web o servidor móvil emparejado y pone el código en fragmento hash.
- Panel reutiliza Section/Row/SelectRow/campos/confirmSheet; receptor reutiliza Login y muestra consentimiento explícito. Una invitación de staff pendiente no impide invitar otra cuenta. Respuestas de centro/cuenta/token anterior se descartan. Superadmin puede asignar/revocar entrenadores globalmente y gestionar socios sin afiliación local.
- Límites: cuenta personal debe existir primero, con política de registro actual; no confundir email de contacto con identidad. Sin envío automático de correo (C26), alta pública nueva (C35), QR ni cobros. Listado de invitaciones acotado a últimas 50. Listado global existente acotado a 100 centros: en entorno con muchas fixtures antiguas se creó otro centro ficticio para la prueba visual.
- Verificación: centros-invitations-sql.log 7/7 (PostgreSQL real aislado, migración existente verificada), frontend/centers-invitations-ui.log 52/52 en 9 archivos, centers-invitations-openapi.log 3/3; build pasa. 18 locales/2344 claves y 1842 cadenas fuente en sincronía. OpenAPI y website/api.html actualizados.
- Suites completas: API 634/607 pasan/27 fallan, sin nuevos casos respecto al baseline; frontend 409 archivos, 394 pasan/15 fallan, 5084 tests, 5029 pasan/55 fallan. Un fallo adicional era timeout del test de límite de archivo multimedia con carga concurrente; al ejecutar ese archivo solo, 9 pasan/1 falla (texto de marca previo), sin timeout. No hay regresiones identificadas en centros. MCP no modificado.
- Prueba visual en localhost: superadmin creó Centro pruebas invitaciones y Socio prueba enlace; invitó a preview_trainer; la cuenta Entrenador Pruebas accedió desde enlace, inició sesión sin perderlo y aceptó. UI muestra Invitación aceptada y afiliación de socio; cuenta global sin administración. Evidencia externa al repo: informes/centros-c15-invitacion-aceptada.jpg del workspace.
- C15 done. Siguiente C16; conservar cambios anteriores de demo y continuar solo en rama local. La orden de apagado sigue pendiente del umbral del 5% restante en esta ejecución.

### C16 / F5: cuotas y precios versionados

- Migración 008: membership_plans y membership_plan_versions, FK diferida a versión vigente, FK/IDs del mismo centro, índices de paginación y FORCE RLS. Runtime tiene SELECT/INSERT de versiones, sin UPDATE/DELETE: todo precio/condición se conserva incluso antes de usarse. Archivo lógico del catálogo no elimina historial.
- Crear/revisar/duplicar tienen requestId idempotente; modificar precios añade versión nueva con control optimista. Duplicar exige priceVersionId explícito para que el origen no cambie bajo concurrencia; se puede copiar una versión de plan archivado a un plan nuevo. Revisar plan archivado se rechaza. C17 comprobará archivo antes de nuevas suscripciones.
- Importes son texto canónico de céntimos, EUR explícito, intervalos 1/3/6/12 meses. Precio incluido/excluido y porcentaje fiscal se configuran conjuntamente; prorrateo none/actual-days explícito. Catálogo puede prepararse con política pendiente, conditionsReady false; nunca se supone impuesto legal o se emiten cobros. Conversión de campos decimal/coma usa BigInt, sin aritmética float.
- Superadmin recibe plans.manage explícito; responsables de centro conservan esa capacidad. Entrenador/admin técnico/otro responsable no leen condiciones financieras ajenas. UI Cuotas integrada mediante Segmented, Section/Row, SearchField, Switch, SelectRow, confirmSheet y useAutoMore; memoria local, sin datos financieros en S. Se extrae cursor compartido con socios manteniendo formato anterior y precisión SQL de microsegundos.
- Verificación: api/centers-plans-unit.log 37/37, centers-plans-sql.log 8/8 SQL+HTTP reales, frontend/centers-plans-ui.log 58/58 (11 archivos), OpenAPI 3/3; build pasa. 18 locales/2364 claves y 1861 cadenas en sincronía. 100 rutas documentadas y referencia HTML generada.
- Suite completa API 637/610 pasan/27 fallan; sin casos nuevos frente al baseline. Frontend 411 archivos, 396 pasan/15 fallan, 5090 tests, 5035 pasan/55 fallan; mismo timeout multimedia bajo carga concurrente de C15, que pasó aislado, además de fallos previos de marca. No hay regresiones identificadas en centros. MCP no modificado.
- Prueba visual localhost como Responsable Pruebas: cuota ficticia de 29,99 EUR, impuestos incluidos al 21% como dato sintético y prorrateo por días; nueva versión 34,99 EUR. Historial muestra ambos precios. Evidencia externa al repo: informes/centros-c16-precios-versionados.jpg. Ningún importe cobrado, suscripción o dato real.
- C16 done. Siguiente C17 suscripciones; C18 calculará prorrateo/calendario/impuestos con estas condiciones explícitas. Orden de apagado pendiente al 5% de límite restante.

### C17 / F5: suscripciones y efectos contractuales

- Migración 009: contrato por socio/centro con precio/condiciones, calendario y descuento inmutables. FK compuestas del mismo centro, FORCE RLS y exclusión GiST del rango de fechas [inicio,fin) para impedir solapamiento aun escribiendo concurrentemente. btree_gist es extensión confiable instalada por migrador con CREATE en base; runtime conserva prohibición DDL/BYPASSRLS. Grants de UPDATE únicamente para cierre/cancelación/versionado.
- Crear contrato usa versión del socio, precio vigente no archivado y requestId. Socio preactive recibe evento activate fechado (aplicado hoy o programado) sin desactivar ni cambiar la cuenta global. Cambiar cuota/descuento crea otro contrato y cierra el anterior transaccionalmente; selección de versión antigua se rechaza. Descuento en puntos básicos requiere motivo y se conserva con el contrato.
- Cancelar contrato futuro conserva fila cancelada, restaura fecha final anterior o cancela activación futura. Reintento devuelve el resultado persistido. No hay borrado de contratos aplicados. Se admite cambio el mismo día con periodo histórico vacío; C18 cobra cero días por ese periodo. Segundo cambio futuro requiere cancelar el primero.
- Baja de C14 limita effectiveEndsOn, pausa/reanudación definen estado por lectura. Cancelar baja futura recupera la continuidad automáticamente, sin reescribir términos. C18 calculará los días cobrables a partir del historial sin jobs. No hay emisión de recibos ni cobros. Cuenta vinculada/personal/entrenamiento permanecen independientes.
- UI en ficha de socio usa Subscriptions, SelectRow, SearchField, Section/Row, confirmSheet y useAutoMore con planes paginados. Resultados autoritativos actualizan versión y estado sin perder borrador de contacto. Solo billing.manage; entrenador no accede. Historial acotado a 100 contratos prioriza no cancelados para no ocultar el vigente detrás de intentos cancelados.
- Verificación: centers-subscriptions-sql.log 9/9 SQL+HTTP; api/centers-subscriptions-unit.log 40/40 (incluye día 31/bisiesto/trimestral/anual); frontend/centers-subscriptions-ui.log 62/62 en 12 archivos; OpenAPI 3/3, build pasa. 18 locales/2369 claves y 1866 cadenas fuente sincronizadas. Contrato documentado en 104 rutas.
- Suites completas: API 640 tests, 613 pasan/27 fallan, sin nuevas identidades de fallo. Frontend 412 archivos, 397 pasan/15 fallan, 5094 tests, 5039 pasan/55 fallan; mismo timeout multimedia de C15/C16 por carga concurrente (pasó aislado), además de fallos previos. MCP no modificado.
- Visual localhost: Responsable Pruebas asignó cuota de 34,99 EUR y descuento ficticio 10% a Socio prueba enlace: estado activo con evento de activación. Programó descuento 20% para 1 noviembre y lo canceló: contrato anterior recuperado sin fecha final, cancelación conservada. Evidencia externa al repo: informes/centros-c17-contrato-recuperado.jpg.
- Fuentes técnicas consultadas: [btree_gist confiable](https://www.postgresql.org/docs/18/btree-gist.html) y [exclusión de rangos](https://www.postgresql.org/docs/18/rangetypes.html#RANGETYPES-CONSTRAINT), documentación primaria de PostgreSQL 18. No se ha cambiado privilegio del runtime ni migrado datos reales.
- C17 done. C18 siguiente; el 5% restante y apagado se comprobarán antes del cierre de esta ejecución.

### C18 / F5: calendario y previsualización exacta

- Dominio puro money.js, billing-calendar.js y charge-preview.js: céntimos BigInt/texto, redondeo half-up explícito y calculationVersion 1. Periodos mensual/trimestral/semestral/anual mantienen ancla original de día 31 o 29 tras meses cortos. Fechas civiles UTC para diferencia de días, sin deriva por DST; fase de periodicidad validada.
- Política actual: actual-days prorratea por días activos dentro del contrato; none cobra periodo completo si hay algún día activo, cero si todo está pausado/terminado. Se redondean prorrateo, descuento y luego impuestos. Precio incluido separa neto/impuesto del bruto descontado; excluido añade impuesto al neto descontado. Neto+impuesto=total exacto. Políticas son reglas de desarrollo explícitas/versionadas, sujetas a validación comercial antes de producción; no se presume tipo impositivo legal.
- API POST billing/preview recibe solo centro/socio/contrato/periodo, nunca precio ni condiciones del cliente. Lee versión fijada en SQL y estado efectivo por historial (último evento por día y último previo, <=367 eventos por periodo anual); omite cancelados. Requiere billing.read; entrenador/otro centro no acceden. Rechaza contrato cancelado o política sin configurar. No crea recibo/pago ni toca entrenamiento.
- UI en contrato con fecha de periodo, días cobrables, descuento, neto, impuesto y total. Cotización privada en memoria, limpia al cambiar socio/centro/versión. Cambio de cuota precarga plan y descuento actuales, incluyendo motivo; no elimina el descuento al guardar sin editarlo.
- Verificación: api/centers-billing-preview-unit.log 47/47, centers-billing-preview-sql.log 10/10 reales, frontend/centers-billing-preview-ui.log 66/66 en 13 archivos, OpenAPI 3/3. Build pasa; 18 locales/2378 claves y 1874 cadenas sincronizadas. 105 rutas documentadas.
- Suite completa API 647 tests, 620 pasan/27 fallan; sin nuevos casos respecto al baseline. Primer frontend completo 413 archivos, 398 pasan/15 fallan, 5097 tests, 5042 pasan/55 fallan (timeout multimedia ya aislado en C15). Tras el ajuste de precarga se repitió la suite con cuatro workers; registrar resultado final a continuación. MCP no modificado.
- Visual localhost, socio ficticio: cuota 34,99 EUR, inicio 13 octubre, periodo octubre 31 días, activo 19, descuento 10%; neto 15,95 + impuestos 3,35 = total 19,30 EUR. No se emitió recibo ni se cobró. Viewport 390px: contenido 375px sin desbordamiento, restaurado al terminar. Evidencia externa al repo: informes/centros-c18-previsualizacion-movil.jpg.
- C18 done; siguiente C19. La orden de apagado se cumplirá al alcanzar 5% de presupuesto restante, tras guardar el estado verificado.
- Resultado final C18 con cuatro workers: 413 archivos, 398 pasan/15 fallan; 5098 tests, 5044 pasan/54 fallan, exactamente los fallos previos del baseline. El timeout multimedia desaparece al limitar concurrencia; caso adicional de precarga pasa. Sin regresiones nuevas identificadas.

### C19 / F6 en progreso: recibos, base y API

- Migración 010: receipts con FK compuesta centro/socio/contrato, unicidad centro/contrato/periodo/concepto, suma neto+impuesto=total positivo, snapshot JSON, vencimiento explícito y FORCE RLS. Grants SELECT/INSERT, sin UPDATE/DELETE ni booleano paid. No factura electrónica o transmisión externa.
- POST receipts/generate usa quote SQL de C18 y requestId; nunca acepta importe del cliente. Periodo no futuro y vencimiento desde inicio. Un recibo por clave natural aun con dos actores/requestId; reintento devuelve snapshot original, sin recalcular después de baja/pausa/cambio de cuota. Vencimiento distinto produce conflicto. Importe cero devuelve skipped/no-charge sin recibo.
- Preview devuelve quoteHash. Generación admite expectedQuoteHash opcional, lo compara con cálculo nuevo del servidor y rechaza quote-changed si ya no coincide; no autoriza importes del cliente. La futura UI debe enviarlo al confirmar. Un recibo ya existente conserva su snapshot y devuelve alreadyExists, aunque ahora el preview sea distinto. Rectificaciones/ajustes de importes emitidos necesitan ledger posterior, no edición destructiva.
- GET receipts por socio/centro usa cursor compartido y límite 30-100; solo billing.read. Snapshot conserva cálculo/condiciones y nombre/número de socio en SQL, nunca DNI/IBAN ni S/exportación personal. Auditoría de creación usa solo IDs/periodo.
- Verificación: centers-receipts-sql.log 11/11 reales, con concurrencia, reintentos, cambio de vencimiento, snapshot inmutable, política de cero, digest obsoleto, RLS directa, unicidad SQL y FK socio/contrato; centers-receipts-unit.log 48/48 y OpenAPI 3/3. Suite API completa 648 tests, 621 pasan/27 fallan, pendiente comparación final a continuación. Frontend no cambia desde C18 y su suite final mantiene 54 fallos previos. 107 rutas documentadas; imagen de pruebas reconstruida. MCP no modificado.
- C19 NO está done: falta componente de generación/listado, traducciones, validación visual y pruebas UI. C20 pagos/aplicaciones/devoluciones y C21 deuda siguen pendientes. Recibos creados únicamente por tests en base marcada test; no generación sobre datos reales ni cobros.

#### Continuación concreta de C19

1. Añadir wrappers en lib/centers-api.js y componente Receipts en ficha de socio con billing.read/billing.manage; reutilizar Section/Row/SearchField/confirmSheet/useAutoMore. Lista con cursor real, reseteo por cuenta/centro/socio y sin persistir snapshot en S.
2. Antes de generar, leer preview del contrato/periodo y mostrar neto/impuesto/total y vencimiento al responsable. Confirmación comparte quoteHash del servidor. Mantener requestId/cuerpo idénticos si falla la red; quote-changed exige volver a mostrar el nuevo cálculo. No mostrar éxito inventado ante timeout.
3. Mostrar alreadyExists con snapshot emitido, skipped sin crear saldo, y nunca permitir editar total/paid. Separar recibos pendientes de futuras aplicaciones C20: todavía no afirmar que se cobró.
4. Verificar listado y generación con cuentas ficticias; probar duplicado/reintento, pérdida de capacidad y respuesta tardía de otro centro. Ejecutar suites/build/locales; frontend completo con cuatro workers evita timeout de archivo multimedia bajo carga.
5. Cerrar C19 solo cuando la UI y su recorrido visual estén verificados; después C20. Para volver a levantar, construir imagen test con SCHEMA_VERSION 010 y ejecutar preview.mjs contra compose.centers.test.yml, API loopback3011 y Vite5178. Migraciones 001-010 ya aplicadas en test: no editarlas, checksums fijados.
- Cierre de esta ejecución: umbral 95% usado/5% restante medido con get_usage_limits. No iniciar más funcionalidades. C19 queda in_progress. Comparativa final API: 648/621 pasan/27 fallan, sin nuevos casos respecto al baseline. La prueba FK final necesitó una fixture con periodo distinto para no disparar antes la unicidad; ningún cambio de permisos o restricciones, y suite SQL final 11/11.
- Commits completos de esta ejecución: C14 4e2f5ae7; C15 4f1db6c9; C16 d83bb995; C17 156c4158; C18 ff118da0. C19 parcial se guarda aparte con evidencia y continuación. Rama local conservada, sin push/merge/despliegue ni datos reales. Cambios previos de demo no se han incluido ni revertido.
- La orden explícita de apagar el ordenador pertenece solo a esta ejecución. Tras guardar se detendrán contenedores de prueba propios conservando volumen y se solicitará shutdown sin forzar cierre de otras aplicaciones. No repetir apagado automáticamente en otra sesión. El registro operativo del intento estará fuera del repo, en informes del workspace.

### 14 octubre: navegación y cierre de C19

- Atrás de Centros vuelve a la última ruta de la app, conservando consulta/estado. navBack centraliza la vuelta por índice de HashRouter; acceso directo usa padre con replace. Settings reutiliza el helper. Dos pruebas de router verifican vuelta a Account y fallback; pauta futura documentada en AGENTS.md.
- BillingPreview confirma total/periodo/vencimiento y envía IDs + quoteHash, sin importes. Reintentos conservan requestId/cuerpo; conflicto de cálculo exige nuevo preview. Confirmación de centro anterior no ejecuta nada. alreadyExists muestra snapshot emitido; cero no inventa recibo ni saldo; futuro no se emite.
- Receipts en ficha usa Section/Row/useAutoMore, cursor real y memoria privada. ChargeBreakdown extraído para el segundo uso concreto del snapshot. No campos paid ni edición de cantidades. Generación refresca recibos conservando el borrador de contacto.
- Verificación: frontend/centers-receipts-ui.log 86/86; centros-c19-sql.log 11/11 reales; build y locales pasan (18 locales/2391 claves, 1881 cadenas fuente). Frontend completo con cuatro workers: 415 archivos, 400 pasan/15 fallan; 5112 tests, 5058 pasan/54 fallan. Mismos fallos previos del baseline; backend C19 mantiene 648/621 pasan/27 fallan y sin cambios en esta continuación UI.
- Visual local: Account → Centros → Atrás vuelve a Account. Centro ensayo 14 octubre y Socio ensayo recibos son ficticios en SQL test: cuota 31 EUR, 18/31 días de octubre, recibo 18 EUR, vencimiento 14 octubre. Confirmación y snapshot verificados; ninguna transmisión de cobro. Evidencias fuera del repo en informes/centros-c19-atras-cuenta.jpg y centros-c19-recibo-creado.jpg.
- C19 done. Continúa C20. El umbral vigente es 80% usado/20% restante del límite más restrictivo medido con get_usage_limits. No se aplica apagado, push, merge ni despliegue en esta sesión.

### C20 / F6: pagos parciales, aplicaciones y devoluciones manuales

- Migración 011 añade payments/payment_allocations/refunds, claves compuestas de centro/socio/recibo, FORCE RLS y solo SELECT/INSERT. Triggers toman lock del centro y restricciones diferidas garantizan reparto íntegro del pago, no sobrepago y no sobrerreembolso, incluso mediante SQL directo. Ninguna edición paid/destructiva.
- Dominio exacto: céntimos positivos BigInt/texto, EUR, 1-50 aplicaciones distintas ordenadas canónicamente y suma exacta. API acepta varios recibos del mismo socio; UI registra uno cada vez. No crédito sin aplicar en este MVP. Pago + aplicaciones + auditoría + idempotencia atómicos; devolución contra aplicación original restaura saldo. Fechas no futuras y devolución desde fecha del pago; motivo privado obligatorio, omitido en auditoría.
- Manager tiene payments.record, no payments.refund por defecto. Plataforma explícita puede conceder/retirar ese extra en un manager vigente con versión/idempotencia/auditoría; trainer y admin técnico no obtienen acceso financiero. Reintentos también respetan revocación actual. Control de personal, formularios y listados reutilizan Switch/Section/Row/SelectRow/campos/confirmSheet/useAutoMore; estado solo en memoria y guardas de cuenta/centro/confirmación anterior.
- Recibos incluyen settlement calculado desde todo el ledger: paidMinor, refundedMinor, balanceMinor y unpaid/partial/paid. Payments muestra periodos aplicados y hasta 100 motivos recientes, refundsTruncated explícito; sus totales incluyen todas las devoluciones. No banco, pasarela, cobro real o cambios de cuenta/entrenamiento.
- Verificación: centers-c20-sql.log 12/12 SQL+HTTP reales, incluyendo carreras de pago/devolución, reintento, exceso, privilegios, RLS directa, snapshot, rollback por sesión revocada y restricciones SQL. api/centers-c20-unit.log 53/53 incluidos 3 OpenAPI. frontend/centers-c20-ui.log 99/99 en 19 archivos; build/locales pasan (18 locales/2418 claves, 1901 cadenas fuente). pt-BR tiene overrides revisados para vocabulario nuevo.
- Suites generales: API 650/623 pasan/27 fallan, frontend 418 archivos/403 pasan/15 fallan; 5125 tests/5071 pasan/54 fallan. Comparación de identidades contra baseline sin fallos nuevos; el fallo OpenAPI corregido en F1 permanece resuelto. MCP no modificado.
- Visual: recibo ficticio 18 EUR, pagos manuales 6 + 12 EUR, devolución 2 EUR con motivo: neto pagado 16, devuelto 2, saldo pendiente 2; recibo original conserva 18. Evidencia informes/centros-c20-saldo-devolucion.jpg fuera del repo. API de preview reconstruida con schema 011, solo loopback3011 y Vite5178. Reiniciar preview renueva sesiones ficticias; SQL test se conserva.
- C20 done. Sigue C21. Última medición primaria 41% usado, semanal 49%; límite vigente hasta 20% restante. Sin push/merge/despliegue/datos reales ni apagado en esta sesión.

### C21 / F6: deuda derivada, gracia, calendario y exportación

- GET billing/debts y calendar calculan saldos con todo el ledger SQL. Due date inclusiva; al día siguiente gracia hasta graceDays inclusive y después overdue. Política versionada almacenada en centro, default ficticio 15 días; ausente/no soportada falla cerrada. AutomaticSuspension false y ninguna cuenta personal suspendida por deuda.
- CTE agregadas por centro; filtros emparejados de vencimiento hasta 366 días; cursor ascendente due_on/id ligado a cuenta/centro/filtro/día/política. Totales del conjunto completo, independientes de página. Calendario por defecto mes civil local incluye pagados; solo recibos emitidos, sin fabricar cargos futuros o disparar jobs.
- Exportación requiere data.export explícito de manager o plataforma allowlist. Máximo 5000 recibos, 5001 rechaza todo con export-too-large. Snapshot auditable incluye números/nombres, fechas y saldos, sin DNI/IBAN/notas. JSON autenticado usa api.js y UI genera archivo después de validar contexto; no descarga respuesta antigua de otro centro.
- CSV UTF-8 BOM/CRLF/celdas entrecomilladas y comillas escapadas. Prefijos de fórmula, variantes full-width y controles peligrosos reciben marcador visible [text], destinado a revisión humana; no formato de importación sin pérdida. Referencia primaria revisada: https://github.com/OWASP/www-community/blob/master/pages/attacks/CSV_Injection.md. No se afirma seguridad universal tras transformaciones ajenas del archivo.
- RoleCapabilityGrant reutiliza el control anterior para dos usos concretos, devolución/exportación. Endpoint conserva operación/hash compatible para allowRefund y añade allowExport; exactamente un extra por comando. Preserve capacidades previas y no autoconcesión por manager/trainer.
- Verificación: centers-c21-sql.log 13/13 SQL+HTTP reales, incluye fronteras 5000/5001, gracia15/16, reembolso/saldo, cursor de otro centro, revocación y cuenta JSON intacta. api/centers-c21-unit.log 57/57 con 3 OpenAPI; frontend/centers-c21-ui.log 106/106 en 20 archivos; build/locales pasan (18 locales/2436 claves, 1914 cadenas fuente). OpenAPI 114 rutas/49 schemas.
- General API 654/627 pasan/27 fallan; frontend 419 archivos/404 pasan/15 fallan, 5132 tests/5078 pasan/54 fallan. Comparación de identidades sin nuevo fallo; solo OpenAPI del baseline ya corregido. MCP no modificado.
- Visual centro ficticio: resumen 2 EUR pendiente/0 mora, estado Vence hoy, calendario 1-31 octubre; CSV descargado contiene total18/pagado16/devuelto2/saldo2. Viewport390: root/body375px sin desbordamiento y pestañas legibles; override restaurado. Evidencias informes/centros-c21-deuda.jpg y centros-c21-calendario-movil.jpg. Validación descarga demoró devolución de control del navegador; archivo real y contenido comprobados después.
- C21 done. Sigue C22; lectura solo de afiliaciones vinculadas a la sesión propia, sin privilegios administrativos ni persistencia personal. Último límite medido primaria52% usado/semanal51%; continuar hasta 20% restante, sin apagado en esta ejecución.

### C22 / F6: área privada del socio

- Migración 012 añade lecturas RLS propias de contratos, recibos, pagos, aplicaciones, devoluciones y precios contratados, ligadas a selected_center + account_uid de sesión. No abre catálogo ni modifica políticas de escritura. GET own/membership, own/receipts y own/payments rechazan IDs de socio/cuenta en query; incluso un manager vinculado conserva alcance propio en esos endpoints.
- DTO propios usan allowlists: sin DNI/contacto, motivo de descuento/baja/devolución, referencia interna de pago, actor_uid, versión administrativa o controles de mutación. Contratos hasta100 con truncación explícita, recibos/pagos con cursor propio por cuenta/centro. Saldo resume todos los movimientos; historial sigue legible tras baja y centro inactive, sin tocar entrenamiento/autenticación.
- Mis centros accesible desde Cuenta para afiliaciones propias; staff/plataforma mantienen Gestionar centros como destino distinto. Invitación member aceptada conduce al portal de su centro. navBack respeta historial y fallback de la jerarquía. ContractSummary tiene segundo uso concreto; Receipts/Payments se reutilizan con transporte own y acciones administrativas forzosamente ocultas. Todo queda en memoria y API no-store.
- Pruebas: centers-c22-sql.log 14/14 reales, con dos centros, dos socios, manager también socio, RLS directa, cursor de otra cuenta, DTO sin motivos privados, estado ended/inactive y APIs administrativas prohibidas. api/centers-c22-unit.log 59/59 con3 OpenAPI; frontend/centers-c22-ui.log 114/114 en22 archivos. Build/locales pasan (18 locales/2441 claves,1919 cadenas fuente), OpenAPI117 rutas/51schemas.
- Suites completas: API656/629 pasan/27 fallan; frontend421 archivos/406 pasan/15 fallan,5140 tests/5086 pasan/54 fallan. Identidades contra baseline sin nuevo fallo; MCP intacto. Últimas leyendas ocultas en modo own son presentación reversible, verificadas visualmente.
- Recorrido real localhost en base ficticia: plataforma invitó preview_trainer al Socio ensayo recibos; destinatario aceptó y llegó a Mis centros del Centro ensayo14octubre. Consulta cuota31EUR y recibo18EUR/pagado16/devuelto2/saldo2; ningún control para crear/cobrar/devolver. Móvil390px, contenido375px sin overflow, viewport restaurado. Evidencia informes/centros-c22-portal-socio.jpg; solo identidades/datos ficticios.
- C22 done. C23 sigue con margen de presupuesto medido72% usado primario/54% semanal. No iniciar C24 sin cerrar y verificar navegación. La sesión de prueba queda en Entrenador Pruebas; contraseña ficticia habitual. Sin despliegue, cobro real, push/merge o apagado.

### C23 / F7 en progreso: selector e historial de contexto

- Selector de centro reutiliza SelectRow con centros autorizados. Contexto administrativo centerId/pane vive en URL, respaldado por la sesión y permisos del servidor; nunca autoridad a partir del cliente. Selección y cambio de pestaña generan entradas del router. Atrás cronológico vuelve al centro/pestaña anterior; entrada directa de detalle usa lista de centros y lista directa usa Home como fallback.
- CenterPanel tiene key de cuenta+centro para descartar formularios/estado privado del contexto anterior. Lecturas de detalle descartan respuesta tardía y no muestran detalle cuyo ID difiera de la ruta. Selección en useCenters solo en memoria; menús propios/administrativos se separaron en C22 y no alteran entrenamiento/tabs personales.
- Verificado: frontend/centers-c23-ui.log116/116 en22 archivos; casos nuevos historial de pestañas y respuesta tardía A→B. Build/locales pasan. Suite completa421 archivos/406 pasan/15 fallan;5142 tests/5088 pasan/54 fallan. Mismos fallos previos, sin nuevos. API no cambia en C23 y conserva resultado C22 (656/629 pasan/27 fallan); SQL14/14 reales. MCP intacto.
- Visual localhost: Cuenta→Centros→Centro ensayo14octubre→Socios→Deuda; flecha Atrás retorna a Socios, con centerId/pane=members en URL. Selector visible con el nombre del centro. Inicio personal, cambio de cuenta y tabs de Cuenta operativos. Evidencia informes/centros-c23-atras-pestana.jpg fuera del repo.
- C23 NO se marca done: antes de C24 revisar/guardar guardas de acciones pendientes al desmontar NewCenter y CenterPanel. Sus mutaciones ya se protegen por sesión/SQL, pero callback posterior de una acción de A puede refrescar/navegar cuando el usuario abandonó esa pantalla; impedirlo y añadir prueba de navegación durante una creación/guardado pendiente. Revisar también confirmaciones de configuración al cambiar contexto. No afirmar cierre del gate MVP hasta C24 y restauración conjunta.
- Próxima sesión: cerrar esas guardas con life/mounted refs antes/después de await y antes de confirmación; conservar idempotencia. Después verificar navegación/roles/descargas y cerrar C23; continuar C24 en entorno SQL/JSON aislado con marcador test. Migraciones001-012 ya aplicadas, no editar checksums históricos.
- Cierre por umbral del usuario: última medición81% usado primario/19% restante y55% semanal. Se detiene avance de funcionalidades y se guarda checkpoint local, sin C24 iniciado. Commits de esta sesión: C19 4e103bed, C20 f481f96a, C21 5500b992, C22 479cf986; C23 parcial guardado a continuación. No push, merge, producción, cobro real o apagado.
- Entorno local sigue levantado: Vite127.0.0.1:5178, APIpreview127.0.0.1:3011, PostgreSQL privado en compose.centers.test.yml, schema012. Sesión actual ficticia Plataforma Centros; contraseña Centros-Pruebas-2026!. Entrenador Pruebas está vinculado a Socio ensayo recibos en Centro ensayo14octubre para probar Mis centros. Cambios anteriores de demo preservados fuera de los commits de centros.
