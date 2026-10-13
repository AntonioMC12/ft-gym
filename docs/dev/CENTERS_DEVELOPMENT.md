# Desarrollo del módulo de centros

Entrega actual: infraestructura, aislamiento SQL, centros, responsables, staff, socios sin cuenta y baja/pausa/reanudación por fecha. Superadmin gestiona también socios globalmente. Rama: `codex/centers-module`. Apagado por defecto; cuentas y entrenamiento siguen en JSON. Invitaciones y cobros pendientes. Consultar CENTERS_PROGRESS para evidencia y siguiente tarea.

Con `CENTERS_ENABLED=1`, las cuentas enumeradas en `CENTERS_SUPERADMIN_UIDS` pueden crear centros desde Ajustes → Gestionar centros. Deben existir y estar habilitadas; `user.admin` no concede este permiso. El asistente permite draft sin responsable; asignar una cuenta existente habilitada lo activa. Responsables gestionan configuración y trainers de sus centros, sin administración técnica global. El estado y permisos administrativos nunca se exportan con entrenamiento.

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
