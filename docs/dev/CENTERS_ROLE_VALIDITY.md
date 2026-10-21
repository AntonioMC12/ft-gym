# C40: vigencia de roles tras esperar un bloqueo

Corrección de seguridad en schema023, independiente de cambios de interfaz. No declara completado C40: monitorización, retención de importaciones y operación productiva siguen pendientes.

## Problema reproducido

Las operaciones toman el bloqueo de centro antes de decidir permisos. CURRENT_TIMESTAMP conserva el instante de inicio de la transacción: si una petición esperaba detrás de otra operación, podía considerar vigente un rol ya caducado o ignorar uno que acababa de empezar. Es la semántica documentada por [PostgreSQL: fecha y hora actuales](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

Los dos casos se reprodujeron en PostgreSQL real antes del cambio (`centers-role-time-before.log`,0/2). Los tests no duermen ni alteran el reloj: una conexión mantiene el bloqueo, empieza la transacción pendiente, cambia únicamente las fechas de su asignación ficticia y después libera el bloqueo.

## Decisión y alcance

La vigencia se evalúa con statement_timestamp(), en la sentencia de permisos posterior a adquirir el bloqueo. Mantiene el intervalo [valid_from, valid_until), el aislamiento habitual READ COMMITTED y los mecanismos de bloqueo/RLS existentes. No se cambia a un reloj del navegador ni se amplían capacidades o roles.

- Autorización requireCenter, afiliaciones /me, responsables elegibles y modificación de concesión de devoluciones usan la hora de su sentencia.
- Migración023 reemplaza has_role, lock_my_roles, require_active_manager, manager_centers_for_account y can_refund. Conserva firmas, SECURITY DEFINER/invocador, search_path, propietarios y grants de las funciones existentes. Las migraciones001–022 quedan intactas.
- El invariante diferido comprueba al responsable vigente al confirmar, no con una fecha antigua del BEGIN. Las funciones de protección de cuentas y la concesión explícita payments.refund mantienen el mismo criterio temporal.
- La allowlist de superadmin sigue dependiendo de configuración/sesión. user.admin y permisos editables por el cliente no son autoridad. Fechas históricas de cobros/contratos y marcas de creación no se reescriben.

Esta corrección actualiza el instante de decisión, no promete revocación retroactiva de un resultado observado con autorización válida ni elimina toda lectura concurrente a una caducidad. Cada sentencia obtiene su instantánea según PostgreSQL; las mutaciones siguen serializadas por centro.

## Evidencia y límites

Tres casos SQL específicos pasan: caducidad mientras espera, activación mientras espera y consulta directa RLS/concesión de devolución en una transacción anterior a la caducidad. El último comprueba que no ve fichas privadas y no conserva payments.refund. `centers-role-time-after.log`:3/3; suite SQL completa:50/50. Selección de autorización, pool, pagos, rutas y empaquetado:19/19.

Restauración coordinada023:1/1 (`centers-role-time-recovery.log`) conserva roles, datos personales byte a byte, ledger, Stripe pendiente, propuestas, QR/bloqueos e importaciones preparadas/completadas. Los ensayos solo usan bases test y bases tmpfs de recuperación; no se migran datos reales. Generales y operación de preview se registran en CENTERS_PROGRESS.md.
