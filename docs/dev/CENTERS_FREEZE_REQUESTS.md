# C37 — Solicitudes de congelación

Implementación de desarrollo en `codex/centers-module`, schema024. No activa condiciones comerciales ni opera sobre datos reales. Estado: en progreso hasta terminar la evidencia de integración, restauración y revisión visual permitida.

## Decisiones

- El autoservicio empieza desactivado. Un responsable vigente o superadmin debe configurar explícitamente mínimo/máximo de días, preaviso y límite por año natural. No se precargan cantidades comerciales. Límites técnicos: 1..366 días, preaviso 0..366 y mínimo ≤ máximo ≤ anual.
- Se conserva el cálculo existente del contrato (`billingEffect: contract-proration`). `actual-days` cobra sus días activos; `none` conserva el período entero si tiene algún día activo. No se promete un descuento proporcional en contratos que no lo contemplen. Un período sin días activos no genera importe. No se rectifican recibos emitidos, pagos, devoluciones ni deuda previa.
- Fechas civiles en la zona del centro, inicio incluido y reanudación excluida. El límite anual reparte intervalos que cruzan el año e incluye días congelados administrativamente, cambios futuros y reanudaciones anticipadas del historial vigente.
- Solicitar no cambia la afiliación. Solo la aprobación administrativa crea la congelación y reanudación automática mediante el mismo servicio de C14/C17, dentro de la transacción de la decisión. No se duplican reglas de cuotas ni se inicia un worker financiero.
- Una petición pendiente por socio. El solicitante puede retirarla; un responsable vigente/superadmin puede rechazarla con motivo o aprobarla. Aprobar requiere centro/socio activos, vínculo con el solicitante conservado, versión de socio y política vigentes, fechas/preaviso/cupo todavía válidos y ausencia de cambios programados incompatibles. Una política revisada exige retirar y presentar otra solicitud; no se aprueba silenciosamente bajo condiciones nuevas.
- Rechazo y retirada pendientes siguen disponibles en centro inactivo. Decisiones terminales son inmutables. Reintentos idénticos conservan resultado e identidad; una misma clave con distinto contenido falla. Locks siguen el orden centro → roles → filas del proyecto.

## Arquitectura y rutas

`domain/freeze-requests.js` valida política y fechas sin efectos. `services/freeze-requests.js` autoriza, proyecta historial, controla concurrencia e idempotencia. `transitionMemberInTransaction` extrae el recorrido existente de transición para reutilizarlo sin transacciones anidadas. Las migraciones anteriores permanecen intactas.

Tablas nuevas: `freeze_policies`, `freeze_requests`, con RLS forzada y privilegios por columna; solo un socio vinculado puede insertar su solicitud. El trigger impide aprobar por privilegios de propietario, decidir dos veces o alterar el contenido original. Auditoría propia limitada a solicitar/retirar una petición que siga perteneciendo al actor.

| Ruta | Uso |
| --- | --- |
| GET `/api/centers/freezes?centerId&memberId&cursor` | Gestión, política e historial del socio |
| GET `/api/centers/own/freezes?centerId&cursor` | Historial propio; no acepta identificadores de socio/cuenta |
| POST `/api/centers/freezes/policy` | Política explícita y versionada |
| POST `/api/centers/own/freezes/request` | Solicitud propia sin aprobar |
| POST `/api/centers/own/freezes/withdraw` | Retirar la pendiente propia |
| POST `/api/centers/freezes/decide` | Aprobar/rechazar con autoridad actual |

Listas de 30 filas, cursor de servidor ligado a actor, centro, socio y audiencia. Un responsable que además sea socio mantiene el filtro de actor en su portal personal. Ningún registro de esta funcionalidad se guarda en `S`, `gym_state_v1`, entrenamiento o copias personales.

## Interfaz

`FreezeRequests.jsx` reutiliza Section/Row, Button, Switch, NumberField, TextField, TextArea, confirmSheet y navegación protegida. Disponible en ficha administrativa del socio y en Mi centro. Editor de política sin cifras predeterminadas; resumen de límites y efecto financiero visible para el socio. Los errores conservan datos y la identidad de reintento. Rechazo exige motivo; aprobación/retirada requieren confirmar la petición concreta. Respuestas y confirmaciones antiguas se invalidan al cambiar centro, cuenta, versión o contexto. Las traducciones se incorporan a los 18 locales existentes.

## Verificación

Se amplían pruebas de dominio, HTTP/SQL real y UI. El simulacro de restauración incorpora una solicitud pendiente y otra aprobada, y comprueba replay después de recuperar JSON y SQL. Consultar resultados finales y limitaciones en `CENTERS_PROGRESS.md`; no inferir validación visual del resultado de tests/build.
