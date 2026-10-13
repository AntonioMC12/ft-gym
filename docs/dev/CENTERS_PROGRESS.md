# Registro de ejecución: módulo de centros

Última actualización: 13 de octubre de 2026.

## Punto de reanudación

- Trabajo actual autorizado: continuar implementación hasta que reste el 5% del presupuesto consumible; después guardar el punto de continuación y apagar el ordenador, por orden explícita del usuario en esta sesión. Esta orden de apagado se aplica al cierre de esta ejecución, no a sesiones futuras.
- Rama: `codex/centers-module`, creada desde `53ef0baf`. F0-F3 verificadas en entorno ficticio. Commits: `75e1160d`, `433764a5`, `24cb5a42`.
- Guía: [CENTERS_ROADMAP.md](CENTERS_ROADMAP.md). Instrucciones: [AGENTS.md](../../AGENTS.md).
- Siguiente tarea: **C15 / F4**, invitaciones con destinatario comprobado y vínculo de cuentas recuperable.
- Último hito cerrado: C14, baja/pausa/reanudación por fecha y cancelación recuperable; superadmin puede gestionar socios globalmente. No hay cobros ni enlace de cuentas de socios todavía.
- Pruebas C14: 34 unitarias, 42 frontend/controles y 6 SQL+HTTP reales pasan; suites completas conservan los mismos fallos previos.

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
| C15 | F4 | Invitaciones y vinculación | todo |
| C16 | F5 | Cuotas versionadas | todo |
| C17 | F5 | Suscripciones | todo |
| C18 | F5 | Cálculo económico | todo |
| C19 | F6 | Recibos idempotentes | todo |
| C20 | F6 | Pagos y aplicaciones | todo |
| C21 | F6 | Deuda y calendario | todo |
| C22 | F6 | Área del socio | todo |
| C23 | F7 | Navegación/contexto | todo |
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
