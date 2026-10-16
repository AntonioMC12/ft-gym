# Roadmap ejecutable: integración de gestión de centros

Fecha: 13 de octubre de 2026. Proyecto: Fernando Tienda Training / ft-gym. Versión del plan: 1.0.

Estado: ejecución iniciada; consultar [CENTERS_PROGRESS.md](CENTERS_PROGRESS.md) para distinguir tareas implementadas y pendientes. Este documento define el alcance objetivo; no inicia trabajos, servicios ni cobros por sí mismo.

## 1. Objetivo y resultado final

Integrar los CU-01 a CU-16 del documento funcional de centros respetando la aplicación personal de entrenamiento. Un usuario mantiene una identidad global y puede pertenecer a varios centros. Cada centro administra sus socios, staff, planes de cuota, suscripciones, recibos, cobros y operaciones con aislamiento efectivo en el backend.

## Alcance vigente acordado el16octubre2026

- Cobro actual exclusivamente en mano/efectivo. El responsable registra manualmente importes recibidos; no implementar ni activar tarjeta, Stripe u otros cobros online por ahora.
- C27: aplazado expresamente, todo/fuera del alcance actual. Código y CENTERS_STRIPE_TEST_GUIDE.md conservados como referencia futura. No configurar claves ni ejecutar ensayo externo; su validación no bloquea esta entrega.
- C28 SEPA y C39 facturas/fiscalidad: aplazados expresamente, fuera de la entrega actual. SEPA es domiciliación bancaria, distinta de la factura fiscal; ambos quedan para más adelante por decisión del usuario. Conservar recibos y registro de pagos/deuda existentes.
- C32: cerrar el alcance técnico actual de métricas contractuales, financieras y admisiones registradas. Ocupación física e integración con tarjeta NFC/cerradura electrónica aplazadas. Investigar fabricante/controlador/API/eventos cuando se retome; no inventar entradas/salidas ni dar por conectada la cerradura. Las entradas reales por NFC no aparecen todavía en el historial QR ni alimentan retención.
- C35: alta pública online fuera del alcance actual. El responsable da de alta socios manualmente (C13/C15/C17) y registra efectivo (C20), ya implementado. No exigir Stripe, una cuenta personal del socio ni pago online para ese recorrido. Asignar una suscripción a un socio pendiente puede activarlo en su fecha efectiva antes de registrar el pago; no afirmar activación automática solo después de cobrar.
- C41/C42: pendientes para la validación/cierre final al terminar, sin bloquear desarrollo local por adelantado. La activación productiva no se ejecuta en esta petición.
- Aplazado no significa implementado: C27/C28/C35/C39 conservan estado todo con alcance futuro explícito. C32 pasa a done solo para el alcance actual; la parte de ocupación queda documentada como futura.

Arquitectura objetivo:

```text
Un proyecto Docker Compose en un servidor
  web: frontend React compilado + nginx
    /api -> api
  api: Node.js, autenticación actual y módulo centers
    entrenamiento -> JSON actual
    centros y cobros -> PostgreSQL
  postgres: volumen persistente, acceso interno de la API
```

Conservar `web` y `api` actuales. Añadir PostgreSQL al mismo despliegue; no requiere alojamiento externo. Si una instalación personalizada combina frontend y API en una imagen, se puede mantener esa imagen y sumar PostgreSQL, pero no cambiar la topología del repositorio sin comprobar esa instalación. No agrupar PostgreSQL con Node/nginx en el mismo contenedor.

El primer hito funcional será un MVP con centros, roles, socios, cuotas versionadas, suscripciones, recibos, pagos manuales y área del socio. Los cobros externos y el resto se añaden tras validar este núcleo.

## 2. Uso por Codex y continuidad entre sesiones

1. Leer `AGENTS.md` y [CENTERS_PROGRESS.md](CENTERS_PROGRESS.md). Determinar qué tareas autoriza el mensaje actual.
2. Trabajar desde la raíz Git `openGym/`. Revisar estado y diff; registrar el punto de partida si aún no existe.
3. Elegir una tarea pendiente del alcance autorizado cuyas dependencias estén completas. El orden de la tabla es orientativo; las dependencias son el requisito efectivo.
4. Leer su fase, las reglas transversales y los archivos relacionados. No volver a recorrer todo el proyecto ni el PDF en cada sesión.
5. Implementar y comprobar el criterio de cierre. Mantener el módulo apagado por defecto hasta la activación explícita.
6. Actualizar progreso con decisiones y evidencia concreta. Continuar con la siguiente tarea autorizada; detener únicamente el trabajo dependiente de información realmente necesaria o de una autorización que falte.

Si el usuario pide una fase, terminar todas sus tareas alcanzables. Si pide todo el roadmap, avanzar por dependencias y criterios dentro de la autorización disponible; no exigir una aprobación adicional por cada fase. Una tarea bloqueada por proveedor o política permite continuar ramas independientes. No usar el paso de una fase como sustituto de una prueba ni confundir documentación con implementación.

Estados del registro: `todo`, `in_progress`, `done`, `blocked`. Usar `blocked` para una tarea técnica concreta con motivo y requisito de desbloqueo. Registrar `not_run` para comprobaciones no ejecutadas. Estos estados son del documento y no del sistema de objetivos de Codex.

Al retomar, verificar que la evidencia sigue correspondiendo al código actual. No reiniciar tareas cerradas sin cambio, fallo o evidencia contradictoria. No inventar hashes de commits, resultados de pruebas o aprobación de producto.

## 3. Base técnica y puntos de integración comprobados

Base inicial de análisis: HEAD `775e1c11`; API y frontend declaran 1.4.1. Existen modificaciones locales previas. C00 debe registrar el estado real al empezar; esta referencia no autoriza a restaurar el checkout.

| Área | Archivo existente | Uso y precaución |
|---|---|---|
| Navegación | `frontend/src/App.jsx` | HashRouter; sumar rutas sin cambiar los enlaces personales |
| Transporte | `frontend/src/lib/api.js` | Reutilizar subrutas, Bearer móvil, errores y tiempos máximos |
| Estado personal | `frontend/src/store/useStore.js` | Conservar S, sincronización y salida; gestión va en store separado |
| UI efímera | `frontend/src/store/useUI.js`, `components/ui.jsx` | Reutilizar hojas, avisos y confirmaciones |
| API | `api/server.js` | Diccionario METHOD/path, sesiones, CSRF y helper global de admin |
| Modularización | `api/coach/routes.js` | Fábrica con helpers inyectados; patrón para centers |
| Persistencia actual | `api/durable.js`, `api/server.js` | JSON durable por archivo; no transacciones JSON-SQL |
| Rutinas | `frontend/src/lib/plan-share.js` | parsePlan/mergePlan; adaptar entrega estable sin romper importación |
| Convergencia | `frontend/src/lib/sync-merge.js`, `api/sync-stamps.js` | Pruebas de paridad al añadir metadatos de entrega |
| Acceso actual | `frontend/src/views/CheckIn.jsx` | Tarjetas personales, no verificación de entrada física |
| Contratos | `api/openapi.yaml`, `scripts/build-api-docs.mjs` | Spec, etiquetas y documentación generada deben coincidir |
| Empaquetado | `api/Dockerfile`, `web/Dockerfile`, `docker-compose.yml` | Copias explícitas; construir imágenes del fork |
| Pruebas | `api/test/`, tests junto a frontend | Reusar node:test y Vitest, añadir integración SQL real |

El scanner `api/test/openapi-routes.test.js` solo inspecciona server.js y coach/routes.js: ampliarlo para las rutas nuevas. El test `dockerfile-copy.test.js` verifica principalmente imports de la raíz: añadir cobertura de la carpeta centers, no confiar en que la compruebe ya.

Los scripts de locales están en `frontend/scripts/`, no en la raíz. `.github/workflows/` no contiene test.yml en esta copia. Hay configuración en `.gitea/` y `.gitlab-ci.yml`, cuya ejecución en el fork no está confirmada. C02 debe identificar la CI efectiva antes de depender de ella.

## 4. Decisiones de arquitectura y políticas pendientes

### Decisiones técnicas de esta propuesta

- Monolito modular: `api/centers/` dentro del backend actual; frontend integrado con vistas y store de gestión propios.
- PostgreSQL para administración; un único proceso API mientras identidad y otros datos sigan en JSON. No asumir que SQL habilita réplicas de la API completa.
- SQL parametrizado con controlador `pg`, sin ORM ni framework nuevo. Verificar y fijar versiones compatibles al implementar; actualizar lockfile.
- Sesión actual identifica la cuenta. Centro y capacidades se resuelven del servidor en cada petición; no reemitir credenciales solo por cambiar de centro.
- RLS y filtros explícitos por centro, claves foráneas compuestas y DTO con campos permitidos por rol.
- Pagos mediante comandos idempotentes y transacciones. Sin cola offline de cobros ni fusión por última edición.
- Ruta de crecimiento separada para integraciones externas. Conservar passkeys, contraseña opcional, invitado, PWA y modo móvil local.

Son decisiones de planificación, no cambios ya aplicados. Si aparece evidencia nueva, documentar la modificación y su impacto antes de cambiar una frontera de arquitectura.

### Valores propuestos para desarrollo y datos ficticios

Permiten avanzar sin inventar políticas productivas: EUR, zona Europe/Madrid configurable por centro, día inexistente ajustado al último del mes manteniendo el ancla, una suscripción principal activa por socio, importes enteros en céntimos, matriculación como concepto único, gracia de 15 días y suspensión automática desactivada. Prorrateo de ejemplo: días naturales restantes incluyendo el día de alta / días reales del mes, redondeo al céntimo al final del concepto. Definir si el precio incluye impuestos antes de fijar sus ejemplos de cálculo.

Guardar estos valores como políticas versionadas, no como constantes dispersas. Se pueden implementar y probar en entorno ficticio. No presentarlos como condiciones comerciales aprobadas para centros reales.

### Decisiones que bloquean solo su uso dependiente

| Decisión | Propuesta | Debe concretarse antes de |
|---|---|---|
| Superadmin de centros | Allowlist explícita de uid; no elevar a responsables ni a todos los admins automáticamente | Bootstrap C10 y activación real |
| Precio, impuestos y prorrateo | Política de centro versionada con ejemplos | C18 y generación de importes definitivos |
| Baja, pausa, deuda y acceso | Dimensiones separadas; no cerrar la cuenta personal por deuda | Automatización de suspensión C25 y QR C31 |
| Cuenta y email | Contacto de socio no demuestra propiedad de cuenta | Vinculación real C15 |
| Proveedor de email/pagos | Adaptadores configurados por centro o plataforma con separación explícita | C26-C28 y alta pública C35 |
| Compartición de progreso | Afiliación + asignación + autorización específica | C30 |
| Conservación y fiscalidad | Políticas y validación profesional externas | Anonimización real y facturación fiscal C39 |
| Hardware de acceso | Identidad por dispositivo, validación online inicial | Piloto de acceso C31 |

C01 registra qué está decidido y qué es un supuesto. Solicitar información solo cuando una decisión sea necesaria para la tarea actual; continuar el resto. El PDF es referencia funcional: sus URL, fórmulas ilustrativas, tabla de usuarios y plazos no obligan a cambiar la autenticación ni la arquitectura.

## 5. Invariantes y modelo mínimo

### Aislamiento y permisos

Toda entidad administrativa tiene center_id; cada lectura, escritura, relación, búsqueda, exportación y job usa centro autorizado. No aceptar un center_id del body como autoridad. Acceso cruzado a recurso devuelve 404 genérico; acción prohibida sobre recurso accesible, 403; sin identidad, 401. No filtrar existencia ajena mediante errores SQL.

Aplicar autorización del actor y selección de campos además de RLS. Entrenador no recibe datos económicos aunque la vista no los renderice. Socio solo obtiene sus afiliaciones y recibos. El superadmin gestiona centros, responsables y agregados; capacidad de soporte identificable explícita y auditada. Los permisos del admin técnico heredado se revisan en C09; no ampliar requireAdmin() para incluir responsables.

RLS usa rol de aplicación sin BYPASSRLS/superuser y distinto del propietario, FORCE RLS donde corresponda y contexto local a la transacción, siempre sobre la misma conexión. Migraciones y backups usan privilegios separados. Centros globales y agregados necesitan un contrato acotado; no añadir un bypass seleccionable por el cliente.

Centro active requiere responsable vigente. Creación, sustitución y revocación concurrente bloquean el centro para preservar esa regla. Revocar un rol afecta la siguiente autorización; acciones sensibles vuelven a comprobarlo dentro de la transacción. Revalidar identidad/sv después de awaits cuando corresponda, siguiendo las defensas actuales.

### Entidades SQL

```text
Center -> RoleAssignment (account_uid global)
Center -> Member (account_uid opcional) -> Consent
Center -> MembershipPlan -> PlanVersion
Member + PlanVersion -> MembershipSubscription
Subscription -> Invoice -> PaymentAllocation <- Payment
Payment -> PaymentAttempt / Refund / Adjustment
Center -> BusinessAudit / IdempotencyRecord / OutboxEvent / JobRun
Member -> TrainingAssignment / AccessEvent / Reservation (fases posteriores)
```

Claves compuestas garantizan que socio, plan, suscripción y recibo relacionados pertenecen al mismo centro. Unicidad local de número de socio, DNI/NIE y email normalizados cuando estén informados. Socio puede existir sin cuenta; varias afiliaciones pueden compartir account_uid. `db.subs` sigue siendo suscripciones push.

Precios, impuestos y condiciones tienen versiones. Recibo conserva su desglose y periodo; no se recalcula retroactivamente. Pagos parciales y devoluciones preservan su historial. Unicidad por suscripción/periodo/concepto evita duplicar recibos; requestId + operación + actor + centro + hash evita duplicar comandos.

Estado contractual, estado financiero y acceso son dimensiones separadas. Deuda se deriva del saldo exigible vencido. Baja o pausa no eliminan deuda. Registrar auditoría en la transacción; audit.log existente no reemplaza BusinessAudit.

### Frontera con JSON

account_uid es referencia lógica, no una foreign key a db.json. Coordinar creación y desvinculación de cuentas mediante operaciones recuperables, comprobaciones en el único proceso API y reconciliación. Proteger el borrado global antes de crear vínculos. Si SQL falla, una cuenta potencialmente vinculada no puede borrarse sin comprobar referencias.

La protección de referencias debe sobrevivir a apagar las pantallas de centros. Después de activarlo, volver a una imagen antigua sin esa protección requiere un procedimiento de reversión específico. Backup consistente incluye SQL, db.json, estado y uploads; no hacer dual writes sin recuperación definida.

Ningún dato administrativo privado entra en S. Solo metadatos técnicos de entregas de entrenamiento pueden formar parte del estado personal para converger; nunca conceden permisos. No exponer archivos de entrenamiento completos al staff. Exportación personal y MCP permanecen limitados a su dominio.

## 6. Fases y backlog por dependencias

Tamaño orientativo: S = tarea acotada; M = varias piezas; L = dividir en subtareas durante la ejecución. El tamaño expresa complejidad, no días ni promesa de entrega. Cada fila tiene su propio criterio obligatorio, además de los gates de fase.

### F0. Preparación y contrato de dominio

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C00 | Registrar baseline, cambios previos, runtimes y disponibilidad Docker/SQL | - | Estado verificable y comandos disponibles registrados; sin modificar datos reales | S |
| C01 | Fijar matriz de capacidades, políticas iniciales, estados y ejemplos económicos | C00 | Decisiones y supuestos separados; ejemplos esperados versionados; dudas asignadas a su fase | M |
| C02 | Definir verificación y CI efectiva, fixtures de dos centros y alcance del MVP | C00 | Comandos actuales comprobados y nueva integración SQL diseñada; fallos previos registrados | M |

Archivos: CONTRIBUTING, package.json de API/frontend/MCP, configuración CI existente, tests representativos. Diseñar fixtures con responsable A, responsable B, entrenador A, socio multicentro, socio sin cuenta y cuenta personal sin afiliación. Para C00-C02 puede bastar documentación y baseline; no se ha hecho todavía en la creación de este roadmap.

### F1. Infraestructura local y módulo desactivado

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C03 | Compose de centros y PostgreSQL, volumen, red y comprobación de disponibilidad | C01,C02 | SQL solo accesible por API en despliegue; reinicio conserva datos; Compose base sigue disponible | M |
| C04 | Controlador pg, migraciones explícitas, transacciones y roles SQL | C03 | Migración repetible y versionada; aplicación separada de migrador; conexiones se cierran correctamente | M |
| C05 | Esqueleto centersRoutes, capabilities/config, errores, OpenAPI y harness SQL real | C04 | Apagado no conecta SQL; caída SQL responde 503 en gestión sin impedir /api/data; tests nuevos ejecutables | M |

Propuesta de archivos nuevos: `compose.centers.yml`, `api/centers/{config,db,routes,errors}.js`, `api/centers/migrations/`, `api/test/centers-integration/`. Variables propuestas: CENTERS_ENABLED, CENTERS_DATABASE_URL y credenciales separadas de migración. Mostrar solo capacidades generales en config, nunca DSN ni secretos.

Añadir scripts de migración y test de integración en api/package.json; todavía no existen. `npm run test:centers` debe fallar claramente si no puede acceder a la base de pruebas y nunca usar silenciosamente la de producción. Proteger identificador de base, fixtures y eliminación de datos. Tests puros del módulo pueden usar `api/test/centers-*.test.js`, incluidos por el npm test actual.

Actualizar COPY del Dockerfile y pruebas de empaquetado. Ampliar scanner de OpenAPI y mapa de etiquetas del generador. El origen visible del usuario sigue siendo el mismo. No introducir PATCH/headers nuevos sin actualizar CORS y transporte móvil; requestId puede ir en JSON.

Gate F1: módulo apagado, encendido, SQL caído y recuperación comprobados; build y arranque de imágenes aplicables. No conectar datos reales.

### F2. Esquema, aislamiento y compatibilidad de identidad

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C06 | Esquema inicial de centros, roles, socios, consentimientos y audit/idempotency | C05 | Migraciones y claves compuestas impiden relaciones entre centros; auditoría no borrable por app | M |
| C07 | Authz por centro/capacidad, RLS, repositorios acotados y DTO por actor | C06,C01 | Pruebas con rol SQL real rechazan cruces de centro y campos económicos de entrenador | L |
| C08 | Protección del borrado de cuentas y puente/reconciliación JSON-SQL | C07 | Cuenta vinculada no se borra por ruta global; caída SQL y apagado de UI no eliminan protección | M |
| C09 | Política admin técnico/superadmin y revisión de endpoints globales | C07,C08 | No se eleva un responsable a admin global; acceso técnico excepcional está definido y auditado | M |

Módulos: `api/centers/authz.js`, repositories y services. En operaciones sensibles, ordenar revocación y escritura mediante bloqueos transaccionales. Error de integridad se traduce sin revelar existencia ajena. Probar exportaciones y estadísticas desde esta fase, aunque sus pantallas lleguen después.

Gate F2: no implementar una pantalla financiera dependiente antes de aprobar aislamiento, revocación y protección de identidad.

### F3. Centros y responsables: CU-01 y CU-02

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C10 | Bootstrap explícito de superadmin; CRUD lógico de centros y estado draft | C09 | Setup repetible con uid existente; crear centro no activa permisos a visitantes ni convierte cuentas | M |
| C11 | Asignar, sustituir y revocar responsables/staff por centro | C10 | Dos revocaciones concurrentes no dejan un centro activo sin responsable; revocación efectiva | M |
| C12 | Asistente y panel de plataforma integrados | C11 | Flujo completo de creación; centro con invitación pendiente queda draft; DTO y UI respetan capacidades | M |

No usar FIRST_USER_ADMIN como bootstrap nuevo en una instancia con cuentas. Búsqueda de usuarios por uid o contacto fiable; no asumir que todas las passkeys tienen email verificado. UI usa rutas HashRouter y patrones actuales; no copiar literalmente subdominios del PDF.

### F4. Socios, consentimientos y vinculación: CU-06

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C13 | Alta/ficha/listado de socios sin cuenta, validación y unicidad local | C11 | Mismo documento/contacto permitido en otro centro; duplicado local controlado; listado paginado | M |
| C14 | Baja efectiva, pausa administrativa y estado contractual | C13,C01 | Transiciones válidas y auditadas; ningún cambio desactiva la cuenta personal global | M |
| C15 | Invitaciones locales y canje con vínculo recuperable | C13,C08 | Hash, expiración, uso único y destinatario comprobado; fallo entre JSON/SQL se puede reintentar | L |

Consentimientos con finalidad, texto/versionado y fecha. No aceptar contacto coincidente como prueba de identidad. Primer canal de invitación: enlace entregado de forma controlada; correo automático depende de C26. Baja/pausa tienen fecha efectiva y efecto de suscripción que se completa en C17. No generar ni mostrar un QR autorizado aún.

### F5. Cuotas y suscripciones: CU-03

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C16 | Planes de cuota y versiones de precio/condiciones; crear, duplicar y archivar | C13,C06 | Versiones usadas inmutables; archivo bloquea altas nuevas sin borrar contratos históricos | M |
| C17 | Suscripciones, cambio de plan, descuento y fechas de baja/pausa | C16,C14 | Plan/socio del mismo centro; no solapar suscripción principal; efectos futuros conservan historial | M |
| C18 | Helpers de dinero, calendario, impuestos y previsualización de cobro | C17,C01 | Casos exactos de prorrateo, día 31, bisiesto, periodicidades, descuento y redondeo | M |

Nombre MembershipPlan para cuotas; no confundir con Plan de entrenamiento. No guardar IBAN completo en cliente ni usar valores float sin política. Condiciones e importe incluyen moneda explícita. Falta de definición sobre precio/impuesto bloquea importes definitivos, no el esquema ni el listado.

### F6. Recibos y pagos manuales: CU-04 y CU-05

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C19 | Recibos y generación manual por periodo con idempotencia | C18 | Un recibo por suscripción/periodo/concepto aun con dos ejecuciones simultáneas; snapshot de importe | M |
| C20 | Pagos parciales, aplicaciones, devoluciones manuales y auditoría | C19 | Pago+aplicación+auditoría atómicos; repetir requestId no duplica; contenido distinto produce 409 | L |
| C21 | Saldo, gracia/morosidad, calendario y listados de deuda/exportación | C20 | Estado derivado, límites de plazo probados; devoluciones restauran saldo; exportación por centro | M |
| C22 | Área del socio: afiliaciones, cuota, recibos y pago visible | C21,C15 | Propiedad resuelta desde cuenta; no acceder con memberId ajeno; sin caché privada persistente | M |

No poner un botón que simplemente cambie paid=true sin Payment y trazabilidad. Devolver deuda no elimina el intento previo. Exportación neutraliza fórmulas CSV y filtra campos por rol. Gestión requiere conexión; mostrar error o estado pendiente de confirmación ante timeout sin inventar éxito.

Gate F6: funcionalidades del núcleo operativas en datos ficticios. Debe existir pago manual robusto antes de pasarelas.

### F7. Navegación global y piloto del MVP

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C23 | Selector de centro, limpieza de contexto, menús y coherencia visual del MVP | C12,C22 | Respuesta tardía de A no aparece en B; logout/revocación limpia; entrenamiento y tabs siguen operativos | M |
| C24 | Piloto ficticio de dos centros y backup/restauración inicial | C23,C08 | Recorrido end-to-end, aislamiento y restauración conjunta verificables; anomalías bloqueadas y reconciliables | L |

Las pantallas de cada caso se crean junto a su backend; C23 consolida navegación, roles y comportamiento global, no pospone toda la UI hasta el final. Store `useCenters.js` en memoria, claves por cuenta/centro y descarte de peticiones previas. Mantener CSS, accesibilidad y traducciones del producto.

Gate MVP: C00-C24 terminadas con evidencia, suites completas y builds pertinentes. Base SQL caída no impide entrenamiento personal; dato administrativo no aparece en backup personal o MCP. El hito termina en un entorno local/de ensayo. Activación real pertenece a C41.

### F8. Trabajos recuperables y avisos

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C25 | JobRun, recuperación al iniciar, generación automática y outbox | C24 | Reinicio recupera periodos pendientes; worker concurrente no duplica; lotes no bloquean API | L |
| C26 | Email transaccional, recordatorios y política de avisos de precio/deuda | C25 | Reintentos y deduplicación; fallo de envío no revierte pago; credenciales y destinatarios acotados | M |

No añadir Redis o un servicio worker separado por defecto; usar trabajos SQL persistentes y un ejecutor acotado en el proceso actual. setInterval despierta, SQL decide trabajo pendiente. Congelación/baja se comprueban antes de emitir. Suspensión automática solo con política definida, independiente de disabled global.

### F9. Cobros externos y conciliación

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C27 | Stripe: adaptador, intento de pago, webhook y conciliación | C25,C20 | Firma sobre raw body, deduplicación, eventos fuera de orden y límites por centro probados en modo test | L |
| C28 | SEPA: mandato, lote revisable, exportación y devolución/conciliación | C25,C20 | Formato bancario y proceso acordados; referencias únicas, remesa estable y trazabilidad | L |

Elegir SDK o REST al implementar, con dependencia justificada. No cobrar por confiar en el redirect del navegador. Webhook tiene ruta y límite propios; su excepción CSRF se limita a esa ruta y se sustituye por autenticación del proveedor. Persistir recepción antes de confirmar y evitar log de payloads sensibles. Nunca introducir datos de tarjeta en S.

Cada pasarela puede completarse independientemente de la otra. Credenciales, condiciones bancarias o datos externos bloquean esa integración, no la rama de rutinas/QR. Ningún cargo real está autorizado por completar un test.

### F10. Entrenador y rutinas: CU-09

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C29 | Propuesta versionada y aceptación convergente de rutinas | C24 | Dos dispositivos producen IDs de destino estables y un conjunto; no sobrescribe sesión ni calendario sin decisión | L |
| C30 | Proyección autorizada de progreso para staff | C29,C07 | Solo partes compartidas; centro B no ve entrenamiento de A; excluye fotos/medidas privadas por defecto | M |

Esta rama no depende de Stripe/SEPA. Reusar parsePlan/mergePlan con adaptación que mantenga mapa de IDs del servidor por entrega/versión. Marca de entrega se fusiona entre dispositivos y respeta borrados; confirmar a SQL tras sync con ack reintentable. Reaplicar una rutina borrada requiere acción explícita. Mantener conversiones kg/lb, customEx, progression y tests de paridad. MVP de entrega usa catálogo; multimedia personalizada necesita contrato propio.

### F11. Acceso, métricas y retención: CU-07, CU-08, CU-10

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C31 | QR dinámico, dispositivo de recepción y visitas verificadas | C24,C07 | Token caducable de un uso; consumo atómico; centro/horario/acceso actuales; captura reutilizada rechazada | L |
| C32 | KPI de centro/globales: altas, bajas, ingresos y admisiones registradas; ocupación/NFC futuros | C24,C21 | Definiciones y denominadores documentados; visitas solo después de C31; sin cruces de centro | M |
| C33 | Alertas de riesgo de baja y acciones de retención | C32 (contrato de admisiones),C31 | Inactividad basada en visitas físicas, umbrales configurables y ausencia de duplicados | M |

C32 está cerrado para el alcance actual de métricas contractuales/financieras y admisiones QR registradas. El KPI de ocupación y la integración NFC/cerradura quedan aplazados por decisión del16octubre; no se declaran disponibles. La presencia de /api/activity no es asistencia. Recepción valida online inicialmente; acceso offline no se improvisa. Reactivación por pago no anula suspensión manual de otra causa. Dispositivo no recibe información económica innecesaria.

### F12. Ampliaciones de negocio: CU-11 a CU-16

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C34 | Clases, reservas, aforo, lista de espera y no-show | C24,C17 | Última plaza concurrente no sobrevende; plan/centro validados; avance de espera atómico | L |
| C35 | Alta online pública, plan vigente y activación después de pago | C27,C15,C26 | Centro seleccionado seguro; no autoasignación de staff; webhook confirma activación; antiabuso | L |
| C36 | Importación CSV de socios con preview y errores | C24,C13 | Validación previa, job acotado por centro, reintento idempotente y política de duplicados explícita | M |
| C37 | Solicitud de congelación por socio y aprobación | C17,C22 | Límites/configuración, fechas y efecto sobre cobros; auditoría y deuda previa conservada | M |
| C38 | Bonos, pases, promociones y consumos | C31,C20 | Vencimientos y consumos atómicos; no doble uso; separado de suscripción principal | L |
| C39 | Facturas PDF y adaptación fiscal con requisitos validados | C20,C26 | Recibo/factura diferenciados; numeración y rectificación según especificación aprobada; sin afirmar cumplimiento sin validar | L |

Congelación administrativa básica se implementa en C14/C17; C37 añade autoservicio y aprobación. Bonos no se modelan como descuentos arbitrarios de la cuota principal. Auditoría se implementa desde F2/F6; C39 no pospone su implementación. La preparación para Verifactu es un subproyecto con requisitos vigentes y validación externa, no un booleano de configuración.

C35 debe añadir rutas públicas explícitas antes del guard de autenticación global de App.jsx, sin abrir las rutas personales o de gestión. La página pública solo recibe catálogo publicado y datos de contacto autorizados del centro; el alta requiere validación, límites de frecuencia y una sesión o proceso de identidad definido. La elección de centro o los parámetros del enlace público nunca permiten conceder roles.

### F13. Operación y entrega

| ID | Tarea y entrega | Depende de | Criterio de cierre | Tamaño |
|---|---|---|---|---|
| C40 | Endurecer backup/restore, métricas, mantenimiento y reversión compatible | C24 | Ensayo desde cero, referencias comprobadas, fallos observables y procedimiento probado | L |
| C41 | Activación gradual por centros y políticas/datos reales revisados | C40 + gate de las funciones que se activen | Bootstrap y afiliaciones supervisadas; no conversión masiva implícita; despliegue autorizado | M |
| C42 | Aceptación de alcance completo y documentación operativa | C41 + tareas funcionales del alcance | Matriz CU/pruebas y limitaciones actualizada; todas las funciones reclamadas tienen evidencia | M |

C40 y la activación del MVP pueden ejecutarse antes de las ampliaciones. C42 no significa que las funciones futuras estén hechas: registrar el alcance aceptado. Para cerrar el alcance original completo CU-01..CU-16, todas las C00..C42 deben estar cerradas con las decisiones y validaciones correspondientes. La entrega actual aplica las exclusiones acordadas el16octubre; las funciones aplazadas no se presentan como hechas ni bloquean su aceptación por sí solas.

## Estado de ejecución de las tareas avanzadas

Actualizado16octubre2026. Detalle/evidencia y bloqueos en CENTERS_PROGRESS.md; el historial anterior no sustituye el estado vigente.

| Tareas | Estado técnico | Lo que falta |
|---|---|---|
| C29,C30,C31,C33,C34,C36,C37,C40 | done | Validación visual/hardware/operación diferida; gates de activación siguen pendientes |
| C27 | todo | Stripe/tarjeta aplazados por el usuario; solo efectivo, sin ensayo sandbox requerido para esta entrega |
| C32 | done | Alcance actual: contratos/finanzas y admisiones,037; ocupación física e integración NFC/cerradura aplazadas |
| C33 | done | Regla opt-in de admisiones y revisión humana,039; validación general/visual diferida |
| C38 | done | Catálogo inmutable, financiación en ledger y consumo QR explícito,041; recuperación1/1 y validación visual/general diferida |
| C35 | todo | Alta pública aplazada; alta manual y efectivo ya disponibles en C13/C17/C20, sin dependencia de Stripe |
| C28 | todo | SEPA aplazado por el usuario, fuera de la entrega actual |
| C39 | todo | Facturas/fiscalidad aplazadas por el usuario, fuera de la entrega actual |
| C41 | todo | Validación/activación al cierre; no ejecutar producción en esta petición |
| C42 | todo | Validar al terminar, sobre el alcance reducido acordado; matriz actualizada |

Instrucción vigente del usuario: comprobaciones enfocadas esenciales y compilación; aplazar suites generales/revisión visual completa. done acredita criterios técnicos probados, no aceptación visual o activación real. No abrir ampliaciones opcionales de una tarea ya cerrada sin una necesidad del alcance.

## 7. Contratos, layout y evolución del esquema

Layout propuesto (crear al llegar a la tarea, no generar carpetas vacías en masa):

```text
api/centers/
  routes.js, config.js, db.js, authz.js, errors.js
  domain/        dinero, fechas, saldo, estados
  services/      casos de uso y transacciones
  repositories/  SQL parametrizado con contexto autorizado
  migrations/    esquema, constraints, índices y RLS versionados
  jobs.js, outbox.js, providers/
frontend/src/
  views/centers/     pantallas integradas
  store/useCenters.js
  lib/centers-api.js
  lib/training-assignment.js
```

Endpoint inicial de capacidades: GET /api/centers/me. Consultas: GET /api/centers/members?centerId=...&cursor=... y GET /api/member/receipts con propiedad resuelta en servidor. Comandos: POST /api/centers/members/create, /plans/version, /billing/preview, /billing/generate y /payments/record. Plataforma: /api/platform/centers y /assign-manager. Todos son contratos propuestos; documentar los nombres finales durante la tarea.

Preferir rutas de acción coherentes con el dispatcher existente; no incorporar router genérico por esta función. Cada nuevo endpoint tiene capacidad, DTO, límites de payload, errores y test. Conservar GET/POST/PUT/DELETE admitidos por transporte y scanner o ampliar ambos conscientemente. Exportaciones permiten filtros y orden definidos, no fragmentos SQL del cliente.

Migraciones numeradas y explícitas con checksum/registro; probar esquema vacío y actualización desde la última versión publicada. No editar una migración aplicada. No borrar datos mediante down automático al arrancar. Frontera JSON-SQL no es transaccional: cambios de vínculo y restore requieren recuperación y reconciliación explícitas.

## 8. Pruebas, comandos y criterio general de terminado

Comandos actuales, desde la raíz openGym, en terminales o invocaciones separadas:

```text
API (cwd api): npm test
Frontend (cwd frontend): npm test
Frontend (cwd frontend): npm run build
Frontend (cwd frontend): node scripts/check-locales.mjs
Frontend (cwd frontend): node scripts/check-source-strings.mjs
MCP (cwd mcp): npm test
Raíz: node scripts/build-api-docs.mjs --check
```

check-source-strings sin --strict informa y puede devolver éxito aunque haya claves ausentes; revisar el informe. Si existen ausencias previas, no arreglar toda la aplicación como efecto lateral: demostrar que las cadenas nuevas están cubiertas y anotar la deuda. Frontend no tiene un npm run lint acreditado; no inventarlo.

Comandos previstos tras C03-C05 (no ejecutables todavía):

```text
Raíz: docker compose -f docker-compose.yml -f compose.centers.yml config
Raíz: docker compose -f docker-compose.yml -f compose.centers.yml up -d --build
API: npm run centers:migrate
API: npm run test:centers
```

Definir configuración segura de desarrollo para el Compose adicional; no depender de que exista un .env con secretos reales. `compose ... config` puede mostrar valores sensibles: no copiar su salida completa a chats/logs. Pin de imagen PostgreSQL y directorio de volumen se verifican juntos para la versión elegida. Datos de tests van en otra base/volumen con marcador de entorno; no usar down -v contra stacks compartidos.

Por tarea: ejecutar los tests de los módulos afectados y sus regresiones directas. Al cerrar F1, F2, MVP y un hito con cambios de sincronización/pagos/despliegue: API, frontend, MCP cuando corresponda, locales, contratos y build; además SQL real y smoke Docker si el hito lo requiere. No repetir suites completas sin cambios nuevos o dudas pendientes. No escribir tests que solo copien el texto de las instrucciones.

La tarea está done cuando cumple su criterio, contrato actualizado, autorización probada, evidencias registradas y sin regresión nueva conocida. Si Docker/SQL o un proveedor no está disponible, se puede entregar código revisable con limitación explícita, pero la prueba obligatoria y el gate siguen pendientes. No instalar servicios o sustituir producción para hacer aparecer verde una tarea.

### Escenarios de aceptación obligatorios

- A consulta, modifica, exporta o relaciona recurso de B: no accede. Repetir bajo RLS con rol SQL de la aplicación.
- Entrenador no recibe importes, pagos, DNI/IBAN innecesarios; socio solo ve sus recursos.
- Dos responsables revocan al último simultáneamente: uno permanece. Revocación y pago tienen orden transaccional.
- Cuenta vinculada no se elimina con SQL caído ni después de ocultar gestión. Restore detecta referencias huérfanas.
- Duplicado local de documento/email se controla; mismo valor en otro centro no filtra existencia.
- Precio nuevo no cambia recibos emitidos; baja futura y pausa impiden conceptos futuros según política.
- Generación repetida/concurrente/reiniciada crea un recibo por concepto. Pago repetido se aplica una vez.
- Pago parcial no liquida el saldo; devolución restituye deuda y mantiene historial.
- Límites de gracia, día 31, bisiesto, prorrateo, trimestral/semestral/anual y moneda tienen valores exactos.
- Cambio rápido de centro, logout y revocación no dejan datos privados en pantalla/store.
- Invitado, cuenta sin afiliación, móvil local y PWA offline conservan entrenamiento; no confirman cobros offline.
- Dos dispositivos aceptan una entrega: IDs y marca convergen; borrado no resucita; sesión activa intacta.
- Webhook duplicado/fuera de orden/firma inválida; aviso falla: no duplica cobro ni revierte pago confirmado.
- QR caducado/reutilizado/centro ajeno falla; recepción no recibe saldo; visitas no se derivan de presence.
- Última plaza/último pase concurrente no se vende o consume dos veces.
- Copia/restauración conjunta y reversión compatible se ensayan antes de activación real.

## 9. Trazabilidad con el documento funcional

| CU | Funcionalidad | Tareas principales |
|---|---|---|
| 01 | Alta/gestión de centros | C10,C12 |
| 02 | Responsables y staff | C11,C12,C15 |
| 03 | Cuotas y condiciones | C16-C18,C26 |
| 04 | Recibos, calendario y cobros | C19-C21,C25,C27,C28 |
| 05 | Pago, deuda y morosidad | C20-C22,C25,C26 |
| 06 | Alta, baja y afiliación | C13-C15,C17 |
| 07 | KPI | C32 |
| 08 | Acceso QR | C31 |
| 09 | Rutinas y progreso | C29,C30 |
| 10 | Riesgo de baja | C33 |
| 11 | Clases/reservas | C34 |
| 12 | Congelación | C14,C17,C37 |
| 13 | Alta pública | C35 |
| 14 | CSV | C36 |
| 15 | Bonos/promociones | C38 |
| 16 | Auditoría y facturación | C06,C20,C39 |

Requisito transversal multi-centro: C06-C09 y pruebas en todas las tareas. Despliegue y datos: C03-C05,C08,C24,C40-C42. La cobertura de una fila no implica que todo el CU esté terminado si faltan dependencias o validaciones externas.

## 10. Riesgos y control de alcance

La convivencia JSON-SQL simplifica la integración inicial pero exige impedir borrados y restauraciones incoherentes. El control de ese riesgo llega antes de vincular socios. Guardar permisos en el token sin reevaluación puede prolongar acceso revocado; la propuesta usa asignaciones vigentes.

Un módulo financiero necesita transacciones y recibos desde el MVP. Posponerlos y mantener un estado manual pagado/moroso genera una segunda fuente de verdad. Los trabajos persistentes no pueden descansar solo en timers en memoria. La fiscalidad y los cobros reales requieren requisitos y autorizaciones específicos.

No convertir la implementación en una migración total a SQL, un cambio de framework, un rediseño completo, una migración de dominio para passkeys, una sustitución del catálogo o un despliegue de microservicios. No usar imágenes oficiales como si contuvieran código del fork. No activar varias réplicas mientras db.json y otros componentes actuales no estén preparados.

No comprometer fechas en función del número de fases. Medir duración de las primeras tareas y recalcular. Los gates funcionales y de seguridad son más fiables para organizar el avance que una estimación rígida de semanas.

## 11. Prompt de inicio y prompt de continuación

Inicio de implementación, cuando el usuario lo decida:

```text
Implementa F0 y F1 del módulo de centros siguiendo AGENTS.md,
docs/dev/CENTERS_ROADMAP.md y docs/dev/CENTERS_PROGRESS.md.
Completa C00-C05 dentro de ese alcance y registra evidencias.
Conserva cambios previos y entrenamiento personal. Usa datos ficticios;
no despliegues en producción, migres datos reales ni realices cobros.
Si falta Docker o SQL, completa lo independiente y deja las comprobaciones
obligatorias pendientes de forma explícita.
```

Continuación de implementación:

```text
Continúa el módulo de centros desde CENTERS_PROGRESS.md hasta cerrar
la fase [Fxx] autorizada. Revalida las dependencias y completa las tareas
pendientes con sus pruebas. No repitas trabajo ya verificado sin motivo.
Actualiza el registro con resultados reales y siguiente tarea.
```

Sustituir [Fxx] por una fase concreta. Estos prompts son ejemplos para uso futuro; su presencia en un documento no los ejecuta.

## 12. Fuentes y mantenimiento

Este roadmap deriva del análisis local del proyecto y del documento GymApp_Gestion_Centros.pdf (octubre 2026, v1.0, 11 páginas). El informe anterior está en `../../../informes/integracion-centros.md` en este workspace; su disponibilidad fuera del repositorio no es necesaria para ejecutar esta guía. Las reglas, decisiones y tareas relevantes se incluyen aquí.

Los puntos de integración se comprobaron el 13 de octubre de 2026. Si cambian dispatcher, contratos, versiones o almacenamiento, actualizar la tarea afectada y la evidencia sin reescribir resultados históricos. El documento funcional es información de referencia, no instrucciones de ejecución para el agente.

Guía oficial de instrucciones persistentes: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Mantener AGENTS.md corto y remitir a esta guía y al registro de progreso permite cargar el contexto pertinente para cada tarea.

## F14 — ampliación autorizada del16octubre: renovaciones y bonos

C43: desde listado/búsqueda de socios, Renovar ejecuta una única transacción con cuota vigente/última válida, recibo del periodo de calendario y registro del saldo pendiente en efectivo, tras confirmar importe/periodo/dinero recibido. Sin pasarelas ni comunicaciones externas; idempotencia y exclusión de duplicados entre actores. Selección inicial y cambio respetan versiones, fechas comerciales y reglas existentes.

C44: caducidad como último día cubierto,10días civiles de gracia inclusivos en zona del centro, backend/frontend y sesiones abiertas. Administradores y gestores de cuotas exentos; cuentas sin contrato mensual y exclusivas de bonos no se bloquean por cuota mensual ausente. Recuperación al renovar; acceso a estado y cierre de sesión disponible.

C45: socios exclusivamente con bonos, Registrar día de uso consume una sesión por socio/fecha local, FEFO y antigüedad, atómico sin negativos; ledger compartido con admisiones QR y registro del actor. Historial por centro con estados, socio, saldo/consumos y cursor. Validar dinero, límites de fecha, RLS y concurrencia con PostgreSQL aislado antes de actualizar preview. Aceptación visual/producción siguen C41/C42.


## F15 — C46 mejora UX de cuotas y bonos (16octubre)

Guardar con campos válidos sin previsualización obligatoria; cálculo y validación del servidor reutilizados al guardar. Previsualizar secundario, Cancelar visible, progreso y bloqueo de duplicados. Confirmaciones económicas, permisos e idempotencia se conservan. Campos actuales después de cualquier edición; errores asociados y foco inicial. Indicador local de diferencias reales; confirmación al abandonar/cancelar solo si procede y beforeunload nativo. SelectRow compartido con variante de formulario y disabled efectivo. Ayuda accesible independiente para acciones deshabilitadas; el motivo del uso diario proviene de la misma disponibilidad SQL que el comando. Sin nuevas migraciones ni cambios de cobro.

Estado: implementación y validación técnica focal terminadas. Falta revisión visual real escritorio/móvil/temas con teclado y toque; C46 continúa in_progress hasta acreditarla. Evidencia y estado operativo en CENTERS_PROGRESS.md. No amplía el alcance productivo de C41/C42.
