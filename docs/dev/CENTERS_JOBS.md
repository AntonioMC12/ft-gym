# Trabajos recuperables de centros (C25)

La API conserva su arquitectura `node:http`. Un ejecutor acotado en el mismo
proceso despierta al arrancar y cada minuto; PostgreSQL determina el trabajo
pendiente. No se añade Redis ni otro servicio. El entrenamiento personal no
espera al ejecutor y sigue disponible si SQL falla.

## Activación explícita

1. Aplicar las migraciones con el rol migrador separado. El runtime no ejecuta DDL.
2. `CENTERS_JOBS_ENABLED=1` habilita el ejecutor en una instancia con centros activos.
   El valor por defecto es `0`; el Compose de centros transmite esta variable.
3. Una cuenta de plataforma incluida en la allowlist abre **Deuda y calendario →
   Recibos automáticos** y confirma una fecha inicial y la activación por centro.
   Los responsables consultan resultados, sin activar ni reintentar trabajos.

La fecha es el límite inferior **del inicio del periodo**, no la fecha de cobro.
Por ejemplo, con ancla día1, activar desde14octubre genera desde1noviembre; activar
desde1octubre incluye el periodo1octubre y el dominio aplica el alta/prorrateo
contratado. La fecha inicial puede estar hasta366días antes del día civil del
centro, queda fijada al guardar y se conserva al desactivar/reactivar. No se
inventan periodos anteriores ni se avanza la fecha para ocultar una cola pendiente.
Desactivar pausa la ejecución; no elimina trabajos, recibos ni historial.

Solo se crean **registros de recibos**. No hay transferencia de fondos, pasarela,
envíos de email ni suspensión global de cuentas. Las condiciones fiscales y de
prorrateo proceden de la versión contratada, nunca del temporizador o del navegador.

## Persistencia y límites

- `billing_automation`: opt-in por centro, fecha inicial, versión, autor y cursor
  de exploración. El orden por última exploración evita depender de memoria tras
  reiniciar el proceso.
- `job_runs`: clave natural centro/contrato/periodo, resultado, intentos y próximo
  intento. El escáner considera contratos no cancelados y periodos iniciados;
  recupera hasta3periodos por contrato y visita10contratos por centro cada vez.
- Cada despertar visita hasta4centros y procesa hasta10trabajos por centro. Las
  operaciones ceden el event loop entre trabajos; las conexiones están limitadas
  por el pool existente. No se mantiene una transacción para todo el lote.
- Cada emisión toma el bloqueo transaccional del centro y la fila pendiente con
  `SKIP LOCKED`. Recibo, auditoría, evento y finalización se confirman juntos.
  Una interrupción antes del commit deja el trabajo pendiente y no deja emisión
  parcial. Otro proceso puede retomarlo sin vencimientos de lease en memoria.
- El generador manual y el automático comparten cálculo e ID natural del recibo.
  Un recibo existente mantiene importe, snapshot y vencimiento aunque el trabajo
  llegue después. No se duplica ni se sustituye por condiciones nuevas.

## Fallos y revisión

El estado contractual efectivo se consulta al ejecutar. Un periodo sin días
facturables se registra como `skipped`; una cancelación detectada también omite
la emisión. El resultado es histórico: no se reescribe al cambiar después la
afiliación. Un caso excepcional que requiera emitir tras una omisión debe revisarse
con el flujo manual y su preview; los recibos emitidos siguen inmutables.

Un fallo SQL de emisión revierte su savepoint y deja el intento pendiente con
espera de5minutos. Tras8fallos pasa a `blocked`; un error de dominio bloquea
directamente hasta corregir su causa. Los fallos que impiden la transacción entera
no confirman nada y se recuperan en un despertar posterior. Los logs solo indican
indisponibilidad del ejecutor, sin DSN, SQL ni datos de socios.

Plataforma puede reencolar un trabajo bloqueado mediante un comando idempotente y
auditado. No cambia un trabajo completado/omitido ni activa una automatización
desactivada. La vista muestra contadores completos, hasta30trabajos recientes y
el número de eventos pendientes. No es un buscador completo de auditoría histórica.

## Outbox

Cada recibo nuevo, manual o automático, inserta un evento `receipt.created` en la
misma transacción. Es único por centro/tipo/recibo y contiene solo `receiptId`.
Los reintentos no duplican el evento. No se rellenan eventos de recibos históricos
al migrar, para evitar notificaciones masivas retrospectivas.

C26 implementará el consumidor, selección de destinatario, consentimiento,
credenciales y deduplicación de entrega. Ninguna cola pendiente significa que se
haya enviado un email. Las pruebas usan SQL real aislado, fallos antes del commit,
otro proceso al reiniciar, concurrencia, pausas, reintentos y paginación de lotes.
