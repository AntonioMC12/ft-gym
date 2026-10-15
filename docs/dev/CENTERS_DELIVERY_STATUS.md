# Estado de entrega y aceptación — 16 octubre 2026

Punto de entrada junto con [CENTERS_PROGRESS.md](CENTERS_PROGRESS.md). Rama `codex/centers-module`, esquema041. Esta matriz separa implementación técnica, validación pendiente y condiciones externas. No constituye aceptación del módulo completo ni autorización de producción. No iniciar de nuevo una función entregada por tener revisión visual pendiente.

## Trazabilidad de los casos de uso

| CU | Alcance | Implementación/evidencia | Pendiente para aceptación completa |
|---|---|---|---|
| 01 | Centros | C10/C12; creación idempotente, borrador/activación, configuración y plataforma explícita | Revisión visual/operación real |
| 02 | Responsables y staff | C11/C12/C15; roles por centro, vínculo e invitaciones, vigencia tras locks | Bootstrap/afiliaciones reales supervisados |
| 03 | Cuotas | C16–C18/C26; versiones inmutables, cálculo exacto, calendario y avisos configurables | Condiciones comerciales reales; entrega externa/visual |
| 04 | Recibos y cobros | C19–C21/C25; ledger, generación, jobs/outbox. C27 adaptador HTTP test implementado | C27 ensayo sandbox real; C28 SEPA sin implementar por contrato bancario pendiente |
| 05 | Pago y deuda | C20–C22/C25/C26; pagos parciales, aplicaciones, devoluciones, deuda, portal propio y avisos | Operación bancaria/condiciones y validación visual. Recibo no equivale a factura |
| 06 | Socios/afiliación | C13–C15/C17; administración, invitaciones, historial y cambios fechados | C35 alta pública es otro recorrido, todavía pendiente |
| 07 | KPI | C32 contractual/financiero y visitas agregadas,036/037. Ver [métricas](CENTERS_METRICS.md) | Ocupación física no disponible; falta contrato de salidas/presencia o aceptación de exclusión |
| 08 | QR | C31; token opaco45s, un uso, dispositivo/roles/vínculo actuales, historial y bloqueo manual. Ver [acceso](CENTERS_ACCESS.md) | Recepción/hardware y revisión visual reales |
| 09 | Entrenamiento/progreso | C29 entrega/aceptación convergente; C30 permiso propio revocable, rutinas/fechas y conteos explícitos,038. Ver [entrega](CENTERS_TRAINING_DELIVERY.md) y [progreso](CENTERS_SHARED_PROGRESS.md) | Revisión visual. No acceso implícito a cargas, notas, fotos o entrenamiento privado |
| 10 | Inactividad | C33 regla opt-in con días elegidos y gestiones sin duplicados,039. Ver [retención](CENTERS_RETENTION.md) | Política real y revisión visual; no se envían mensajes ni se predicen bajas |
| 11 | Clases/reservas | C34; última plaza, FIFO, elegibilidad, asistencia/rectificación y series. Ver [clases](CENTERS_CLASSES.md) | Revisión visual y aceptación operativa |
| 12 | Congelación | C14/C17/C37; solicitud y decisión, límites explícitos, intervalos/cobros y deuda preservada. Ver [solicitudes](CENTERS_FREEZE_REQUESTS.md) | Política comercial y revisión visual |
| 13 | Alta pública | C35 sin implementar; C15/C26 disponibles y C27 test fixture disponible | Gate C27 pendiente; catálogo publicado, identidad, antiabuso y activación por webhook siguen por implementar |
| 14 | CSV | C36; revisión/errores, duplicados, jobs/idempotencia y plantilla socio.csv,028. Ver [importación](CENTERS_MEMBER_IMPORT.md) | Revisión visual; no se importó el archivo real del usuario |
| 15 | Bonos/promociones | C38; catálogo inmutable, compra confirmada, financiación en ledger, caducidad y consumo QR,040/041. Ver [bonos](CENTERS_PASSES.md) | Revisión visual y condiciones reales; promociones gratuitas de visitas, sin motor adicional de cupones |
| 16 | Auditoría/facturación | C06/C20 y auditoría transversal implementados; recibos exactos | C39 factura PDF/fiscalidad sin implementar hasta especificación validada |

En esta ejecución se cerraron técnicamente C30/C33/C38 y el agregado de visitas de C32; se acreditó el cierre técnico de implementaciones anteriores cuyas comprobaciones visuales estaban mezcladas con el trabajo de código. No se cerraron C27/C32 por declarar disponible algo no probado o no medido.

## Bloqueos que requieren una decisión o evidencia externa

| Tarea | Motivo preciso | Requisito para reanudar |
|---|---|---|
| C27 | Ensayo real de sandbox pendiente; los tests HTTP ficticios no lo sustituyen | Entorno/cuenta y credenciales sandbox adecuados, y autorización específica para ese ensayo. Sin cargos reales |
| C28 | Formato y proceso bancarios no acordados | Especificación del banco: formato/versión, identificadores/mandatos, revisión y envío, confirmación y devolución/conciliación. No inventar un fichero bancario a partir del CSV de deuda |
| C32 | No hay salidas registradas ni contrato de presencia física | Definir cómo se validan presencia/salidas, duplicados y eventos faltantes; o aceptar expresamente excluir ese KPI. Las admisiones ya están terminadas |
| C35 | Su gate de integración C27 permanece pendiente | Cerrar el gate aplicable y definir/publicar expresamente catálogo/condiciones e identidad del alta. No abrir automáticamente el directorio privado ni activar por redirect |
| C39 | Falta especificación fiscal aprobada | Jurisdicción/alcance, datos del emisor, series/numeración, impuestos, rectificaciones y validación exigida. No presentar recibos como facturas ni afirmar cumplimiento fiscal |
| C41 | Activación real fuera del alcance autorizado en esta sesión | Autorización de despliegue/activación, políticas/datos reales revisados y gates de las funciones a activar |
| C42 | Aceptación completa depende de C41 y de los casos pendientes | Cerrar el alcance aprobado y sus gates. Esta matriz está preparada; no equivale a aceptación |

Estas tareas pasan a `blocked`, con causa documentada, en lugar de quedar indefinidamente en progreso o aparentar que el siguiente paso es repetir código existente. La autorización de desarrollo local no aprueba por sí sola los contratos bancarios/fiscales ni las operaciones reales excluidas por el usuario.

## Evidencia de la continuación y siguiente sesión

Pruebas esenciales con PostgreSQL real aislado para permisos, aislamiento, dinero, concurrencia e idempotencia; tests focalizados de dominio/UI, OpenAPI, locales y compilación. C38:5 escenarios SQL nuevos,1 de pagos existente,2 de acceso anterior,11 de dominio/acceso/OpenAPI y58 de UI/padres. Recuperación041 desde cero1/1 con bono financiado y parcialmente consumido: referencias, filas históricas, RLS y claves de reintento conservados. Detalle y límites en el progreso; logs fuera de Git en `../informes/`.

Preview construida con `a1566365-dirty` en la rama de trabajo: API/web saludables, statusSQL041 y siete archivos JSON/secreto/entrenamiento idénticos antes/después por SHA256. El sufijo dirty conserva los cambios Docker/web previos del usuario; no indica cambios del módulo sin guardar. Mismo túnel mientras el contenedor siga vivo. Apagar el ordenador detiene la disponibilidad de la preview; reanudar con `scripts/Start-CentersPreview.ps1`. Un túnel recreado puede requerir otro hostname/origen.

Validación aplazada por instrucción del usuario: suites generales, regresión exhaustiva y revisión visual completa. No eludir la denegación guardada del navegador mediante otro origen o herramienta. La primera acción útil de la siguiente sesión es resolver uno de los bloqueos anteriores o autorizar/programar expresamente la validación pendiente; no reimplementar C30/C33/C38.
