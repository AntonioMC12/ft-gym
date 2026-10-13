# Desarrollo del módulo de centros

Primera entrega: infraestructura y disponibilidad de API, sin CRUD de centros, socios ni cobros. Rama: `codex/centers-module`. Apagado por defecto; cuentas y entrenamiento siguen en JSON. Consultar CENTERS_PROGRESS para el estado posterior.

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
- `centers_app`: sin CREATE, superuser, BYPASSRLS, CREATEDB o CREATEROLE; lectura de metadatos en esta fase.

Las migraciones posteriores conceden permisos/RLS por entidad, sin grants generales por defecto. La API comprueba el rol real al adquirir conexiones; usar el migrador como runtime devuelve 503.

La migración 001 añade metadatos y marcador development/test/production. Ejecución explícita, advisory lock, checksum estable y transacción por versión. Una migración aplicada no se modifica ni retira. Se rechaza cambiar el entorno de una base existente antes de DDL.

Fuera de Compose se usan CENTERS_DATABASE_URL para runtime y CENTERS_MIGRATION_DATABASE_URL para migrar. No existe fallback del runtime al migrador. Compose suministra HOST/PORT/NAME/USER/PASSWORD separados, codificados una sola vez para soportar caracteres especiales.

`GET /api/config` omite centers al estar apagado; activo anuncia `{ enabled: true, stage: "foundation" }`, sin consultar SQL. `GET /api/centers/status` devuelve 404 apagado, 401 sin sesión vigente, 200 si rol/esquema son compatibles y 503 genérico si SQL/configuración/migración no están disponibles. No expone DSN, permisos ficticios o datos de negocio. `/api/data` sigue independiente.

No se ha creado aún /api/centers/me: requiere afiliaciones reales de F2. Capacidad global y rol local no se deducen de user.admin.

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

RLS sobre una tabla probe acredita contexto transaccional, no tablas de negocio todavía inexistentes. F2 añade las entidades y su verificación específica.

## Dominio y baseline

api/centers/domain/policies.js define capacidades iniciales y defaults ficticios: EUR, Europe/Madrid, gracia 15 días, suspensión automática apagada. priceIncludesTax sigue sin decidir: todavía no se puede emitir dinero. Exportación/reembolso y soporte global serán concesiones explícitas. Contacto de socio no demuestra propiedad de cuenta.

Baseline: Windows, Node 24.20.0 frente a Node 22 de las imágenes. Las suites generales fallan también antes de integrar centros; consultar progreso. Repetir tests relevantes fuera del sandbox evita errores de rename de temporales, sin cambiar runtime de producción.

La CI heredada no acredita ejecución en GitHub: workflows está vacío. La configuración Gitea solo selecciona frontend/MCP. Mantener verificación local reproducible y no reactivar workflows deshabilitados por el usuario como efecto lateral.

Fuentes: [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres), [transacciones pg](https://node-postgres.com/features/transactions), [pool pg](https://node-postgres.com/apis/pool). Versiones fijadas: pg 8.23.1 y PostgreSQL 18.6-alpine3.24; verificadas el 13 de octubre de 2026.
