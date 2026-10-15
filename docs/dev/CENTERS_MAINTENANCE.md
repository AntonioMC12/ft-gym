# C40 — Mantenimiento de revisiones CSV

Schema025, ampliación independiente de los cobros. No da por cerrado C40 ni autoriza operación sobre datos reales.

## Retención técnica

La revisión CSV preparada ya tenía TTL de 24 horas. Ahora una revisión vencida deja de devolver filas privadas inmediatamente, incluso si el proceso de limpieza está desactivado. Su estado lógico se presenta como `expired`, sin resumen personal ni filas.

El mantenimiento transforma únicamente `prepared` vencido en `expired` y pone `records` a NULL. Conserva centro, actor, requestId, hashes y tiempos originales como marca de idempotencia; repetir esa clave no recrea la carga ni permite importar otra vez. No modifica socios creados ni resultados completados. Los resultados completados ya contienen solo IDs, líneas y estados, sin la copia de contactos del archivo.

Las revisiones vigentes, recibos, contratos, pagos, solicitudes de congelación y entrenamiento quedan fuera del trabajo. Tampoco se purgan automáticamente el historial económico, la auditoría o las visitas: sus plazos requieren decisiones propias. Un backup previo al borrado conserva la copia que contenía; la retención/rotación de backups sigue siendo un criterio operativo pendiente, no se promete eliminación retroactiva de copias antiguas.

## Proceso

- `CENTERS_MAINTENANCE_ENABLED=1` activa un worker independiente; desactivado por defecto y sin resolver conexiones si el módulo está apagado. La preview ficticia lo activa explícitamente. No depende de `CENTERS_JOBS_ENABLED` y no habilita cobros ni correo.
- Intervalo de 60 segundos, sin solapamiento dentro del proceso; detener el servidor espera el trabajo en curso antes de cerrar el pool. Reutiliza `startCentersWorker`.
- Descubre como máximo cuatro centros por tick y elimina el contenido de hasta cien jobs por centro/transacción. Descubrimiento acotado e indexado; cada centro adquiere su lock antes de las filas. Múltiples procesos pueden trabajar a la vez sin duplicar transiciones ni borrar cargas vigentes.
- Funciones SQL estrechas con `SECURITY DEFINER`, `search_path=pg_catalog`, sin EXECUTE público y contexto de plataforma validado. La operación concreta exige coincidencia con el centro seleccionado y rechaza límites nulos o fuera de rango. No se concede BYPASSRLS al runtime ni permiso general de DELETE.
- La auditoría por centro guarda solo el conteo. Si falla, el borrado del contenido revierte en la misma transacción. El log anuncia el número de revisiones limpiadas; errores usan un mensaje fijo, sin filas, emails, SQL, DSN ni secretos.

La ventana de 24 horas es de validez de revisión. El borrado físico ocurre en el siguiente lote disponible, por lo que no se presenta como un SLA exacto de eliminación a las 24 horas; una cola grande necesita varios ticks. Un fallo no se oculta y la siguiente ejecución reintenta. El worker apagado impide limpieza física, pero la API sigue ocultando el contenido vencido.

## Evidencia

Prueba SQL/HTTP contra la fixture Compose explícita: inserta205 registros ficticios ya vencidos, sin reescribir fechas de registros existentes; valida aislamiento del runtime, centro seleccionado, límites nulos, bloqueo de caducidad anticipada, rollback si falla auditoría, concurrencia y tamaño de lotes. Comprueba revisiones vigentes/resultados preservados y clave vencida no reutilizable. El bootstrap de fixture solo se permite contra `centers-test-db/ft_gym_centers_test`, tras comprobar el marcador `test`.

El simulacro de recuperación incluye una revisión limpiada antes del backup y comprueba que el restore conserva `expired` y no resucita los contactos. Las copias anteriores al borrado deben cubrirse mediante la política de backups del despliegue, todavía pendiente.
