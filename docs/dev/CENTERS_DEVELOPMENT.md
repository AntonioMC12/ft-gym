# Desarrollo del módulo de centros

Entrega actual: infraestructura, aislamiento SQL, centros, responsables, staff, socios, invitaciones, contratos, recibos/pagos manuales, deuda, portal propio, automatización/avisos opt-in, Stripe exclusivamente test, propuestas de entrenamiento aceptadas por el socio, acceso QR online, métricas contractuales/financieras e importación revisada de socios por CSV. Rama: `codex/centers-module`. Módulo apagado por defecto; cuentas y entrenamiento siguen en JSON. Schema actual023. Hay criterios visuales y operativos pendientes: consultar [CENTERS_PROGRESS.md](CENTERS_PROGRESS.md) antes de continuar, sin declarar completas todas estas fases.

Con `CENTERS_ENABLED=1`, las cuentas enumeradas en `CENTERS_SUPERADMIN_UIDS` pueden crear centros desde Ajustes → Gestionar centros. Deben existir y estar habilitadas; `user.admin` no concede este permiso. El asistente permite draft sin responsable; asignar una cuenta existente habilitada lo activa. Responsables gestionan configuración y trainers de sus centros, sin administración técnica global. El estado y permisos administrativos nunca se exportan con entrenamiento.

## Arranque recomendado de la preview actual

Con PowerShell7, Docker Desktop y Git, desde openGym:

```powershell
pwsh -File scripts/Start-CentersPreview.ps1
pwsh -File scripts/Start-CentersPreview.ps1 -Share
pwsh -File scripts/Start-CentersPreview.ps1 -Local
```

Sin flags conserva el túnel si ya está activo; -Share lo crea si hace falta y ajusta el origen HTTPS, -Local lo detiene y vuelve a localhost5178. Construye las imágenes del checkout actual por defecto; -NoBuild reanuda imágenes existentes y muestra su revisión real. No confundir esa revisión con la rama seleccionada si se omite construir.

El script solo inicializa/migra el PostgreSQL marcado test con sus credenciales ficticias, crea las identidades de preview si faltan y conserva datos existentes. No ejecuta la suite ni carga .env productivo. Inicialización opt-in en el targetcenters-preview, ausente del targetdefault. El volumen SQL compartido no se borra; conserva db.json/entrenamiento/carrier bajo ../informes. No recrea un centro de ejemplo por haber sido renombrado/desactivado. Rechaza contenedores legacy sin el bind persistente: primero preservar su directorio temporal según la guía. No ejecuta push, cobros ni envíos de mensajes.

Configuración de sesión fuera de Git en ../informes/centers-preview-share.env; URL del túnel leída de logs desde el arranque actual y no de un hostname anterior. No se relaja CSRF para aceptar cualquier origen. Para producción usar los overlays normales y el procedimiento correspondiente, sin estas cuentas/carrier.

## Configuración de desarrollo

Conservar `.env` de la instalación habitual. Copiar `.env.centers.example` a `.env.centers` y generar **tres contraseñas diferentes**. Nunca fusionar los archivos: el Compose base inyecta `.env` completo a la API; las credenciales de bootstrap/migrador deben permanecer separadas.

Desde openGym, en un entorno de desarrollo autorizado:

```powershell
docker compose --env-file .env --env-file .env.centers -f docker-compose.yml -f compose.centers.yml up -d centers-db
docker compose --env-file .env --env-file .env.centers -f docker-compose.yml -f compose.centers.yml run --build --rm centers-migrate
docker compose --env-file .env --env-file .env.centers -f docker-compose.yml -f compose.centers.yml up -d --build api web
```

El overlay construye imágenes locales del fork, suma PostgreSQL y no publica su puerto. La red SQL es interna y solo conecta API, migrador y base. La API no depende del arranque de SQL: entrenamiento puede seguir disponible durante una caída.

El volumen se monta en `/var/lib/postgresql`, adecuado para PostgreSQL 18. No reutilizar instrucciones de volumen de versiones anteriores. Inicialización solo ocurre en volumen vacío: cambiar contraseñas en variables no actualiza roles existentes. Un fallo durante init requiere revisar el volumen, no borrarlo automáticamente. No ensayar este overlay sobre la demo ni producción.

## Roles, migraciones y contratos

- `centers_bootstrap`: inicializa PostgreSQL; nunca es una conexión runtime.
- `centers_migrator`: propietario del esquema y sus objetos; sin superuser ni BYPASSRLS.
- `centers_app`: sin CREATE, superuser, BYPASSRLS, CREATEDB o CREATEROLE; acceso de negocio por RLS y grants limitados.

Las migraciones posteriores conceden permisos/RLS por entidad, sin grants generales por defecto. La API comprueba el rol real al adquirir conexiones; usar el migrador como runtime devuelve 503.

La migración 001 añade metadatos y marcador development/test/production. Ejecución explícita, advisory lock, checksum estable y transacción por versión. Una migración aplicada no se modifica ni retira. Se rechaza cambiar el entorno de una base existente antes de DDL.

Fuera de Compose se usan CENTERS_DATABASE_URL para runtime y CENTERS_MIGRATION_DATABASE_URL para migrar. No existe fallback del runtime al migrador. Compose suministra HOST/PORT/NAME/USER/PASSWORD separados, codificados una sola vez para soportar caracteres especiales.

`GET /api/config` omite centers al estar apagado; activo anuncia `{ enabled: true, stage: "centers" }`, sin consultar SQL. `GET /api/centers/status` devuelve 404 apagado, 401 sin sesión vigente, 200 si rol/esquema son compatibles y 503 genérico si SQL/configuración/migración no están disponibles. No expone DSN, permisos ficticios o datos de negocio. `/api/data` sigue independiente.

F2 añade /api/centers/me, la ficha operativa /api/centers/member y reconciliación de referencias. Las capacidades globales requieren CENTERS_SUPERADMIN_UIDS explícito y no se deducen de user.admin. El admin técnico heredado sigue siendo una autoridad global de confianza, distinta del responsable; ningún rol local lo activa.

La migración 002 crea centros, roles, socios, consentimientos, auditoría, idempotencia y referencias de cuenta. Las entidades de negocio aplican FORCE RLS. Dos tablas de metadatos (role_assignments y account_references) aplican RLS al runtime pero permiten bypass exclusivamente a su propietario para funciones SECURITY DEFINER acotadas, no recursivas, con search_path fijo y sin EXECUTE público. No usar el migrador como conexión API.

El marcador durable data/centers-attached mantiene la comprobación de referencias aunque se oculte el módulo. SQL caído o configuración ausente bloquean el borrado global de cuentas mientras entrenamiento sigue disponible. El enlace SQL y el borrado JSON se coordinan mediante locks en el único proceso API. Las restauraciones deben conservar el marcador y ambos almacenes; restaurar una copia antigua sin él o volver a una imagen anterior requiere el procedimiento de C40, no es una reversión automática segura.

## Pruebas aisladas

Unitarias/HTTP: `npm test` desde api; los casos nuevos están en centers-*.test.js y server-centers.test.js. HTTP usa datos temporales y cuentas ficticias.

SQL real:

```powershell
docker compose -f compose.centers.test.yml run --build --rm centers-tests
docker compose -f compose.centers.test.yml stop centers-test-db
```

Proyecto ft-gym-centers-tests, base ft_gym_centers_test y volumen propio, sin .env, datos de aplicación o puertos públicos. Los tests migran con el migrador y ejecutan transacciones/RLS con la cuenta limitada. Solo crean/borran tablas probe aleatorias; nunca truncan negocio.

No usar down -v en un stack compartido o productivo. Detener el stack no elimina datos ni afecta a la demo. Ejecutar dos veces debe comprobar migraciones existentes sin repetirlas.

Alternativa local: `npm run test:centers` con CENTERS_TEST_DATABASE_URL y CENTERS_TEST_MIGRATION_DATABASE_URL. Se exigen patrón *_centers_test, host/base iguales, roles separados y marcador SQL test. Nunca se toman URLs runtime ni se omiten tests cuando faltan parámetros.

La suite incluye RLS de entidades reales, referencias entre centros, unicidad local, DTO de entrenador, revocación, reconciliación y protección del borrado. Las fixtures de negocio usan IDs aleatorios en la base test, conservando historial; no se borran tablas inmutables para dejar una prueba verde.

## Dominio y baseline

api/centers/domain/policies.js define capacidades iniciales y defaults ficticios: EUR, Europe/Madrid, gracia 15 días, suspensión automática apagada. priceIncludesTax sigue sin decidir: todavía no se puede emitir dinero. Exportación/reembolso y soporte global serán concesiones explícitas. Contacto de socio no demuestra propiedad de cuenta.

Baseline: Windows, Node 24.20.0 frente a Node 22 de las imágenes. Las suites generales fallan también antes de integrar centros; consultar progreso. Repetir tests relevantes fuera del sandbox evita errores de rename de temporales, sin cambiar runtime de producción.

La CI heredada no acredita ejecución en GitHub: workflows está vacío. La configuración Gitea solo selecciona frontend/MCP. Mantener verificación local reproducible y no reactivar workflows deshabilitados por el usuario como efecto lateral.

Fuentes: [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres), [transacciones pg](https://node-postgres.com/features/transactions), [pool pg](https://node-postgres.com/apis/pool). Versiones fijadas: pg 8.23.1 y PostgreSQL 18.6-alpine3.24; verificadas el 13 de octubre de 2026.

## Invitaciones de centro (C15)

Schema 007 incorpora invitaciones para socios, responsables y entrenadores. La cuenta destinataria debe existir y estar habilitada; el email de contacto no identifica a una cuenta. El primer canal es un enlace entregado de forma controlada, sin envío automático.

El secreto de 256 bits se entrega una vez y solo se guarda su SHA-256. Expira a las 72 horas por defecto, hasta 168. Un reintento idempotente devuelve metadatos y token null: revocar y crear otra invitación si se perdió el enlace. El canje usa la sesión del destinatario, revalida permisos del emisor y consume la invitación en la misma transacción que el vínculo o rol. Repetir un código aceptado no reasigna permisos revocados.

No se modifican JSON personal, estado de entrenamiento o admin técnico. Invitaciones vigentes protegen al destinatario frente al borrado global; caducadas/revocadas sin otros vínculos dejan de bloquearlo. Toda prueba de canje debe usar cuentas ficticias de la base aislada.

## Cuotas y contratos (C16-C17)

Las migraciones 008/009 añaden catálogo de cuotas, versiones de precio inmutables y contratos. Los importes son texto canónico en céntimos de EUR; condiciones fiscales y prorrateo deben definirse expresamente para calcular cobros. La versión contratada no cambia al editar el catálogo. Un plan archivado conserva históricos e impide nuevos contratos.

C17 instala btree_gist en el esquema centers para exclusión concurrente de periodos. Es una extensión confiable instalable con CREATE en la base ([documentación oficial](https://www.postgresql.org/docs/18/btree-gist.html)); el runtime no recibe CREATE ni bypass. Una instalación previa en otro esquema requiere adaptar el entorno explícitamente; no aplicar migraciones manualmente sin el registro/checksum.

Crear/cambiar/cancelar contrato requiere billing.manage y versión actual del socio. Activación, baja y pausa se resuelven en fechas locales; cancelaciones futuras mantienen filas y recuperan el contrato anterior. Ninguna acción emite un recibo, realiza un cobro o modifica la cuenta personal. Pruebas actuales solo sobre PostgreSQL marcado test y cuentas ficticias.

## Registro manual de pagos (C19-C20)

Schema 010/011 incorpora recibos inmutables y un ledger de pagos, aplicaciones y devoluciones. Runtime solo SELECT/INSERT en el ledger; RLS, claves compuestas y restricciones diferidas rechazan pagos sin aplicación completa, sobrepagos y devoluciones superiores a la aplicación. API comparte lock de centro, idempotencia y auditoría atómica. Importes son céntimos exactos, nunca floats ni booleano paid editable.

El MVP no mantiene crédito sin aplicar: cada pago se reparte íntegramente entre 1-50 recibos del mismo socio. Un recibo admite pagos parciales y una devolución vuelve a aumentar su saldo. UI registra un recibo cada vez; API admite varios. Fechas civiles no futuras, métodos cash/bank-transfer/card/other y referencia opcional. Son registros de movimientos ya realizados; no ejecutan transferencias ni pasarelas.

Responsable puede registrar pagos; payments.refund requiere concesión expresa de la plataforma. Endpoint role-capabilities y control de personal permiten conceder/retirar únicamente ese extra en una asignación manager vigente, con versión, requestId y auditoría. Trainer y admin técnico no adquieren permisos económicos.

Lecturas paginadas privadas permanecen en memoria. Detalle de pago muestra aplicaciones con periodo y totales de todas las devoluciones; a lo sumo 100 motivos recientes, con refundsTruncated explícito. Datos de contacto y motivos no pasan a auditoría personal ni S. La política productiva y conciliación externa se validarán en sus fases.

## Deuda y vencimientos (C21)

Política SQL del centro version1, graceDays0-365 y automaticSuspensionfalse. Fecha local de lectura: due inclusive, grace desde día siguiente hasta graceDays inclusive, overdue después. Saldo procede del ledger actual, no de un paid flag o estado editable. Una devolución restaura deuda sin afectar cuenta personal. Calendario muestra recibos emitidos en rango civil; no es previsión ni emisión automática (C25).

CSV de deuda requiere data.export concedido explícitamente, tiene máximo5000 filas y rechaza excesos completos. Puede acotarse por vencimientos. Exportación de revisión humana con marcador visible [text] para fórmulas/controles sospechosos, siguiendo riesgos descritos por [OWASP](https://github.com/OWASP/www-community/blob/master/pages/attacks/CSV_Injection.md); no reutilizar como importación literal. Conteo/filtros se auditan, sin nombres/documentos/contactos en auditoría.

## Portal propio del socio (C22)

Schema012 permite lectura únicamente de filas propias por sesión + centro; precios solo si están contratados. own/* no acepta memberId/accountUid ni override de plataforma. Cuenta con roles staff también obtiene un DTO propio restringido, sin motivos/referencias internas. No conceder capacidad de emitir/pagar/devolver por el hecho de estar afiliado.

Mis centros y Gestionar centros son destinos distintos en Cuenta. Recibos/pagos usan componentes existentes con transporte own y controles de mutación ocultos. Historias ended/inactive permanecen legibles y toda consulta administrativa/financiera es efímera en memoria, con Cache-Control no-store, ajena a S y exportaciones personales.

## Preview de centros completamente en Docker (15 de octubre)

La preview instalada se sirve ahora con imágenes `ft-gym-centers-preview-api:local` y `ft-gym-centers-preview-web:local`, más el PostgreSQL ficticio existente. No necesita Vite. Desde `openGym/`, con Docker Desktop arrancado:

```powershell
$env:CENTERS_PREVIEW_REVISION = (git rev-parse HEAD).Trim()
$env:CENTERS_PREVIEW_BRANCH = (git branch --show-current).Trim()
docker compose -f compose.centers.test.yml -f compose.centers.preview.yml up -d --build --wait centers-preview-api centers-preview-web
```

Abrir `http://localhost:5178/#/centers`. Usuario `Plataforma Centros`, contraseña ficticia `Centros-Pruebas-2026!`. Login, permisos globales, proxy y schema021 comprobados desde la red de contenedores; no se afirma una revisión visual. La demo8088 y su volumen son independientes. El frontend tiene una red adicional para publicar el puerto solo en loopback; API y SQL siguen en la red interna de pruebas, sin puerto público.

El target `centers-preview` contiene los entrypoints ficticios y el carrier, sin montar código de tests desde Windows; el target `default` no los hereda. Las imágenes llevan etiquetas `org.opencontainers.image.revision` y `com.ftgym.branch`. El código de aplicación construido en esta entrega parte de72034ae8, con la configuración Docker de preview añadida localmente. Cambiar de rama sin reconstruir no cambia el código que ejecutan las imágenes.

Este comando presupone la base test ya preparada y las asignaciones preview_manager existentes: el arranque falla cerrado ante una base nueva/sin esquema o que no sea test. No sustituir URLs por las de una instalación real. Carrier simulado persistido en `../informes/centers-stripe-preview`, jobs/email externos desactivados. Para detener conservando datos: `docker compose -f compose.centers.test.yml -f compose.centers.preview.yml stop centers-preview-web centers-preview-api centers-test-db`. No usar `down -v`.

Antes de recrear API, preservar su directorio temporal y restaurar los archivos personales ficticios que existan, siguiendo las instrucciones siguientes. Snapshot previo a esta conversión: `../informes/centers-docker-preview-before-20261015`; no contenía state-preview_*.json. El arranque recrea las cuentas conocidas de la fixture; no usarla para cuentas o datos reales.

## Referencia anterior: preview con API Docker y Vite

Los comandos de esta sección documentan el montaje anterior. Con el frontend Docker actual, no arrancar Vite también en5178.

La preview de esta sesión usa el contenedor existente `ft-gym-centers-preview`, PostgreSQL del proyecto `ft-gym-centers-tests` y Vite. No es el overlay de una instalación real ni la demo del usuario. Los comandos siguientes reanudan estos recursos ya preparados; no crean una cuenta de producción, no migran una instalación real y no permiten saltarse las restricciones guardadas del navegador de herramientas.

Desde `openGym/`, con Docker Desktop arrancado:

```powershell
# Solo si docker no está en PATH en esta instalación Windows:
$env:Path = 'C:/Users/Usuario/AppData/Local/Programs/DockerDesktop/resources/bin;' + $env:Path

docker compose -f compose.centers.test.yml up -d --wait centers-test-db
docker start ft-gym-centers-preview
docker logs --tail 5 ft-gym-centers-preview
```

`docker start` conserva el directorio temporal del contenedor y sus archivos personales. El entrypoint comprueba la base marcada test, reutiliza los centros ficticios y prepara sus tres identidades conocidas. No elimina el volumen. Si el contenedor ya no existe, no sustituirlo por uno que monte `api/data` o use `.env`: preparar de nuevo la fixture aislada leyendo `api/test/centers-integration/stripe-preview.mjs` y `preview.mjs`.

Para Vite, en otra terminal desde `openGym/frontend/`:

```powershell
$env:API_TARGET = 'http://127.0.0.1:3011'
$env:API_ORIGIN = 'http://localhost:5178'
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
```

Abrir manualmente `http://localhost:5178/#/centers` en el navegador autorizado del usuario. `--strictPort` evita que Vite elija silenciosamente otro puerto incompatible con el origen de sesión. Si5178 está ocupado, comprobar su proceso y reutilizarlo si corresponde; no matar otros procesos automáticamente ni probar distintos orígenes para eludir una restricción.

Identidades exclusivamente ficticias de la fixture:

| Nombre de acceso | Alcance |
|---|---|
| Plataforma Centros | Allowlist de superadmin, gestión global y métricas globales. |
| Responsable Pruebas | Centros asignados, socios, contratos, gestión financiera y recepción según sus capacidades vigentes. |
| Entrenador Pruebas | Ámbito operativo/propuestas según asignación vigente; no obtiene gestión financiera ni recepción por ser entrenador. |

Contraseña ficticia de estas cuentas: `Centros-Pruebas-2026!`. La fixture conserva las asignaciones SQL existentes: el nombre de una cuenta no le concede roles por sí mismo. Socio propio requiere vínculo mediante invitación; no existe una cuenta de socio genérica con acceso a todas las afiliaciones.

Stripe utiliza el carrier local simulado, perfiles fake y datos fuera del repositorio en `../informes/centers-stripe-preview`. No hay claves reales, red de pagos ni jobs/email externos activados. No introducir credenciales reales en esta fixture ni abrir sus enlaces fake para intentar pagar. Reiniciar API renueva sesiones y descarta QR pendientes; volver a entrar y emitir un QR nuevo cuando proceda.

Antes de recrear o eliminar el contenedor, copiar íntegramente su directorio `/tmp/ft-gym-centers-preview-*` a un snapshot fuera de Git y conservar el carrier. Si contiene `state-preview_*.json`, restaurar esos archivos en el directorio temporal del contenedor nuevo antes de usar la preview. No publicar snapshots, bases de cuentas o secretos de sesión. Los últimos snapshots y su ruta están en `../informes/centers-c32-preview-*` y `centers-c32-preview-snapshot-path.txt`.

La imagen actual incluye C32 (`e967704c`), esquema021. `docker start` no recompila cambios posteriores: ante un nuevo commit de API, construir la imagen test y actualizar conscientemente la fixture preservando su estado. Para detener sin borrar: parar Vite con Ctrl+C, `docker stop ft-gym-centers-preview` y `docker compose -f compose.centers.test.yml stop centers-test-db`. Nunca usar `down -v` sobre esta base compartida.

Contratos de las entregas recientes: [Stripe](CENTERS_STRIPE_IMPLEMENTATION.md), [propuestas/aceptación](CENTERS_TRAINING_DELIVERY.md), [QR y recepción](CENTERS_ACCESS.md) y [métricas](CENTERS_METRICS.md). Las comprobaciones automáticas no sustituyen la revisión visual pendiente ni habilitan pagos productivos.

## Comprobación manual pendiente de las entregas recientes

Esta lista organiza el trabajo que aún no puede declararse verificado visualmente. Ejecutarla únicamente con la fixture local y una superficie de navegador permitida; la autorización general de la sesión no elimina una denegación guardada de herramientas. No generar capturas ficticias ni avanzar C30/C33 dando por cerradas sus dependencias.

1. **Navegación y carga inicial.** Abrir una ficha con `centerId`, `pane` y `q` directamente, esperar configuración, alternar socios/acceso/métricas y aplicar dos períodos distintos. Atrás debe recuperar cada estado previo hasta la lista filtrada y después la pantalla anterior. Una entrada directa sin historial usa el padre. Repetir en ancho móvil y escritorio, sin desbordamiento ni controles solapados.
2. **Plataforma y responsable.** Comprobar que el superadmin ve métricas globales y el responsable únicamente sus centros. La selección de un centro no filtra el informe titulado global. Entrenador y admin técnico no deben recibir controles financieros/globales por sus nombres o por `user.admin`. Cambiar de cuenta mientras carga una respuesta no debe mostrar el resultado anterior.
3. **C27, solo presentación del carrier.** Abrir un recibo propio vinculado, comprobar importe/saldo, reserva y estados de conciliación de la fixture. La vuelta del navegador no acredita un pago; solo el ledger confirmado lo hace. No navegar a enlaces fake de Stripe. Una prueba con cuenta sandbox real continúa siendo una comprobación operativa distinta, todavía pendiente y sin claves configuradas.
4. **C29, entrega personal.** Como entrenador asignado, proponer un plan de catálogo; como socio destinatario, revisar versión y aceptar sin reemplazar semana por defecto. Comprobar que conserva sesión/calendario, convierte unidades y sincroniza antes del acuse. Reintentar en otro dispositivo no duplica IDs/rutinas; una revisión posterior aceptada se distingue de la anterior. No compartir progreso como efecto de aceptar una propuesta.
5. **C31, recepción.** Configurar una política explícita y un dispositivo ficticio con responsable autorizado. El socio emite QR, recepción admite una vez y una repetición no vuelve a admitir. Caducidad, segundo plano, rotación/revocación de dispositivo, pérdida de sesión y bloqueo manual deben retirar el permiso visible adecuado. Un pago no elimina un bloqueo manual. Abrir cámara requiere la interacción prevista por el componente; no hay comprobación física de torno ni funcionamiento offline.
6. **C32, cifras y fechas.** Contrastarlas con recibos/pagos de la fixture. Un período pasado filtra movimientos, conserva el saldo actual y muestra esa separación. Un neto negativo no se redondea ni cambia a positivo. Comprobar límite del período, mora no configurada y mensaje de error/recarga. El informe global no promete ocupación física, ingresos netos bancarios ni retención.
7. **Evidencia.** Guardar fecha, cuentas ficticias utilizadas, resultados y capturas fuera de Git; registrar limitaciones en CENTERS_PROGRESS. No marcar `done` únicamente por haber abierto la pantalla. C27 necesita además su verificación externa de test y C32 las definiciones/denominadores pendientes de visitas/ocupación.

Después de estas verificaciones y de cerrar sus criterios: C30 puede abordar una proyección de progreso con consentimiento específico y revocable, ajena a la aceptación de propuestas; C33 debe usar visitas físicas verificadas y umbrales explícitos. C28 sigue necesitando el formato y proceso bancario acordados, sin inventarlos desde una exportación CSV.

## Compartir la preview de centros con un externo

Overlay `compose.centers.preview.yml`, servicio opt-in `centers-preview-tunnel` (perfil share), Quick Tunnel de Cloudflare hacia Nginx. No comparte la demo8088 ni publica PostgreSQL. Referencia oficial: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ . El hostname cambia al crear otro túnel y el enlace deja de servir al detenerlo.

La API usa un único origen CSRF/WebAuthn. Con el túnel activo, usar su enlace HTTPS también para las pruebas locales, no localhost5178 para iniciar sesión. `CENTERS_PREVIEW_ORIGIN` admite únicamente localhost5178 o HTTPS de un hostname trycloudflare.com sin credenciales/path/query; no se amplía la política del servidor normal. RP_ID y retorno del carrier simulado siguen ese origen. Cookies Secure activas en HTTPS. No hay pagos reales.

La configuración de esta sesión está fuera de Git, en `../informes/centers-preview-share.env`. Para reanudar sin perder el hostname mientras el túnel existente siga vivo:

```powershell
docker compose --env-file ../informes/centers-preview-share.env -f compose.centers.test.yml -f compose.centers.preview.yml --profile share up -d --wait centers-preview-api centers-preview-web centers-preview-tunnel
```

Si se crea un túnel nuevo, obtener su URL de los logs, actualizar CENTERS_PREVIEW_ORIGIN en ese archivo y recrear API con el mismo --env-file. No mantener el origen de un túnel anterior. Para dejar de compartir: `docker compose -f compose.centers.test.yml -f compose.centers.preview.yml stop centers-preview-tunnel`. Para volver al login local, levantar/recrear API sin --env-file y sin CENTERS_PREVIEW_ORIGIN definido.

Desde esta entrega los datos JSON ficticios de API se conservan en `../informes/centers-preview-data`, montados en un directorio exclusivo de la fixture. Se copiaron del contenedor previo antes de recrearlo. El entrypoint conserva db.json existente si contiene las identidades de prueba, en lugar de regenerar contraseñas/passkeys al cambiar de origen. SQL continúa en su volumen test. No usar datos reales ni publicar estos archivos.
