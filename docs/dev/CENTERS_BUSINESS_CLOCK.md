# C40 — Día de negocio después de bloqueos

Schema027 corrige operaciones que empezaron antes de medianoche y obtuvieron su lock después. No modifica registros históricos, condiciones económicas ni el reloj del sistema.

## Reproducción y corrección

PostgreSQL fija CURRENT_TIMESTAMP/now() al comenzar la transacción. Mientras espera un bloqueo puede cambiar el día civil del centro. La implementación anterior conservaba el socio activo y calculaba el período de la cuota del día anterior; un UPDATE que había esperado una fila también podía cancelar una baja que ya había entrado en vigor.

Dos regresiones SQL reales reprodujeron el fallo antes de cambiar código: 0/2. Después del lock se observaban active, fecha anterior y período del mes anterior en lugar de ended, fecha vigente y período nuevo. También se autorizaba la cancelación de una baja ya efectiva. Log: centers-business-clock-before.log.

- member_profiles usa statement_timestamp() para proyectar estado y día local de forma consistente durante su SELECT, ejecutado después del lock.
- Calendario de preview de cobro, deuda, jobs, avisos, alta manual y límite diario UTC del carrier usan el momento de su consulta posterior al lock.
- Triggers de cancelación de cambios y contratos usan clock_timestamp() después de adquirir la fila. Al insertar una suscripción se bloquea primero la versión de precio y después se comprueba el día vigente; una espera en el catálogo no conserva una fecha antigua.
- Se mantienen ACL, RLS, derechos de invocador y contratos de rutas. Las migraciones anteriores no se editan. now() en metadatos históricos/transaccionales no se sustituye indiscriminadamente.

La tercera regresión comprueba un contrato futuro que pasa a vigente mientras espera el UPDATE: tampoco puede cancelarse retroactivamente al liberarse la fila.

## Método de prueba

Una zona POSIX válida de PostgreSQL con precisión de segundos coloca una medianoche civil real a pocos segundos en un centro ficticio creado para el test. Las fechas de baja/contrato se siembran antes de ese punto; una segunda conexión retiene un lock real hasta cruzarlo. El código probado utiliza el reloj y las consultas normales. No se altera el reloj del sistema, no se sobrescriben timestamps previos y no se reemplazan funciones de producción por mocks.

La zona de la fixture es deliberadamente SQL, fuera de la validación IANA del formulario de producto; el test restaura la zona del centro al terminar. La aplicación sigue aceptando las zonas IANA validadas previamente. Los locks se liberan incluso si falla una aserción, antes de cerrar conexiones.

Consultar resultados finales de SQL y restore027 en CENTERS_PROGRESS.md. Esta corrección no cierra por sí sola las políticas de retención de backups y aceptación de producción pendientes de C40.
