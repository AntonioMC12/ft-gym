# Estado de entrega y aceptación — 16 octubre 2026

Punto de entrada junto con [CENTERS_PROGRESS.md](CENTERS_PROGRESS.md). Rama `codex/centers-module`, esquema041. Alcance actualizado por las decisiones del usuario del16octubre: alta manual y cobro exclusivamente en efectivo; Stripe/tarjeta, SEPA, facturas, alta pública y ocupación/NFC aplazados. C41/C42 se validan al terminar. Esta matriz separa implementación técnica, validación pendiente y funciones futuras. No constituye aceptación del módulo completo ni autorización de producción. No iniciar de nuevo una función entregada por tener revisión visual pendiente.

Acceso compartido vigente: https://dining-salt-volumes-adaptive.trycloudflare.com/#/centers. API/web saludables, túnel activo y /api/health público200. Usar esta URL HTTPS tanto localmente como desde fuera, porque el origen de autenticación es el compartido. Stripe desactivado (0perfiles), jobs0, esquema041 y datos preservados. Las referencias a reanudaciones locales anteriores son históricas.

Última corrección de interfaz: avisos de cambios reales y barra de guardado por formulario, web b70980e2-dirty; API a1566365-dirty/schema041 sin cambios.70pruebas focalizadas y compilación; publicación web saludable, mismo túnel y datos conservados. La validación visual completa sigue pendiente.

## Trazabilidad de los casos de uso

| CU | Alcance | Implementación/evidencia | Pendiente para aceptación completa |
|---|---|---|---|
| 01 | Centros | C10/C12; creación idempotente, borrador/activación, configuración y plataforma explícita | Revisión visual/operación real |
| 02 | Responsables y staff | C11/C12/C15; roles por centro, vínculo e invitaciones, vigencia tras locks | Bootstrap/afiliaciones reales supervisados |
| 03 | Cuotas | C16–C18/C26; versiones inmutables, cálculo exacto, calendario y avisos configurables | Condiciones comerciales reales; entrega externa/visual |
| 04 | Recibos y cobros | C19–C21/C25; ledger, generación, jobs/outbox. C27 adaptador HTTP test implementado | C27 Stripe/tarjeta y C28 SEPA aplazados, fuera del alcance actual; registro de efectivo disponible |
| 05 | Pago y deuda | C20–C22/C25/C26; pagos parciales, aplicaciones, devoluciones, deuda, portal propio y avisos | Validación final del registro de efectivo; ninguna operación bancaria requerida en este alcance. Recibo no equivale a factura |
| 06 | Socios/afiliación | C13–C15/C17; administración, invitaciones, historial y cambios fechados | Alta pública C35 aplazada; alta manual y efectivo disponibles sin Stripe |
| 07 | KPI | C32 contractual/financiero y visitas agregadas,036/037. Ver [métricas](CENTERS_METRICS.md) | Ocupación física e integración con NFC/cerradura aplazadas; las admisiones actuales no incluyen eventos de ese hardware |
| 08 | QR | C31; token opaco45s, un uso, dispositivo/roles/vínculo actuales, historial y bloqueo manual. Ver [acceso](CENTERS_ACCESS.md) | Recepción/hardware y revisión visual reales |
| 09 | Entrenamiento/progreso | C29 entrega/aceptación convergente; C30 permiso propio revocable, rutinas/fechas y conteos explícitos,038. Ver [entrega](CENTERS_TRAINING_DELIVERY.md) y [progreso](CENTERS_SHARED_PROGRESS.md) | Revisión visual. No acceso implícito a cargas, notas, fotos o entrenamiento privado |
| 10 | Inactividad | C33 regla opt-in con días elegidos y gestiones sin duplicados,039. Ver [retención](CENTERS_RETENTION.md) | Política real y revisión visual; no se envían mensajes ni se predicen bajas |
| 11 | Clases/reservas | C34; última plaza, FIFO, elegibilidad, asistencia/rectificación y series. Ver [clases](CENTERS_CLASSES.md) | Revisión visual y aceptación operativa |
| 12 | Congelación | C14/C17/C37; solicitud y decisión, límites explícitos, intervalos/cobros y deuda preservada. Ver [solicitudes](CENTERS_FREEZE_REQUESTS.md) | Política comercial y revisión visual |
| 13 | Alta pública | Alta manual implementada en C13/C15/C17/C20; C35 público sin implementar | Alta pública excluida por ahora: no es necesaria para registrar un socio ni cobrar en mano |
| 14 | CSV | C36; revisión/errores, duplicados, jobs/idempotencia y plantilla socio.csv,028. Ver [importación](CENTERS_MEMBER_IMPORT.md) | Revisión visual; no se importó el archivo real del usuario |
| 15 | Bonos/promociones | C38; catálogo inmutable, compra confirmada, financiación en ledger, caducidad y consumo QR,040/041. Ver [bonos](CENTERS_PASSES.md) | Revisión visual y condiciones reales; promociones gratuitas de visitas, sin motor adicional de cupones |
| 16 | Auditoría/facturación | C06/C20 y auditoría transversal implementados; recibos exactos | C39 facturas PDF/fiscalidad aplazadas; el usuario no facturará por la aplicación por ahora |

En esta ejecución se cerraron técnicamente C30/C33/C38 y el agregado de visitas de C32; se acreditó el cierre técnico de implementaciones anteriores cuyas comprobaciones visuales estaban mezcladas con el trabajo de código. C27 conserva código/fixture previos, pero su ensayo externo está aplazado y fuera de esta entrega. C32 se cierra posteriormente por el alcance reducido acordado, sin declarar disponible ocupación física.

## Qué queda pendiente y qué se ha aplazado

| Tarea | Estado vigente | Siguiente paso |
|---|---|---|
| C27 | todo, Stripe/tarjeta aplazados fuera del alcance actual | Conservar código/fixture y [guía](CENTERS_STRIPE_TEST_GUIDE.md) como referencia futura; no configurar ni probar la pasarela ahora |
| C28 | todo, aplazado fuera del alcance actual | Retomar SEPA/domiciliaciones cuando se solicite; no confundirlo con emitir facturas |
| C32 | done técnico para contratos/finanzas/admisiones registradas | Ocupación e integración NFC/cerradura futuras; estudiar fabricante/controlador/API y disponibilidad de entradas/salidas entonces |
| C35 | todo, alta pública aplazada | Usar alta administrativa existente. No desarrollar ahora onboarding público ni exigir Stripe para altas manuales |
| C39 | todo, aplazado fuera del alcance actual | Retomar facturas/fiscalidad si cambia la decisión del usuario |
| C41 | todo, fase final | Validar configuración, políticas y activación al terminar el alcance; sin ejecutar despliegue productivo ahora |
| C42 | todo, fase final | Aceptar el alcance acordado y sus pruebas al final; las funciones futuras excluidas no se declaran hechas |

Las decisiones sustituyen la clasificación anterior de todos estos puntos como bloqueos. C27/C28/C35/C39 se aplazan y no se marcan done del alcance completo. Conservar el código existente; no activar Stripe. El único cobro operativo actual es en efectivo, registrado manualmente. C32 se cierra solo para las métricas ya acreditadas, sin ocupación física. No se exige resolver una API NFC o facturación para terminar la entrega actual. Antes de conectar el sistema NFC real, el historial y los avisos de inactividad únicamente reflejan las visitas QR registradas; no certifican toda la asistencia del gimnasio.

## Cómo dar de alta un socio que paga en mano

Recorrido existente, comprobado en el código de Members, Subscriptions, BillingPreview, Receipts y ManualMovement:

1. Entrar como responsable del centro o superadmin y abrir **Gestionar centros → centro activo → Socios → Nuevo socio**.
2. Introducir sus datos y guardar. Se crea el registro administrativo/número de socio; inicialmente queda pendiente de activación. No necesita cuenta personal ni pasar por un alta pública.
3. En su ficha, asignar una cuota existente en **Suscripciones**, elegir fecha efectiva y guardar. Si la membresía estaba pendiente, se activa en esa fecha; el código no espera un pago Stripe para hacerlo. La activación también dispone del historial administrativo de cambios cuando corresponda.
4. Pulsar **Previsualizar cargo**, revisar período/importe/vencimiento y **Crear recibo**. Crear el recibo solo registra la deuda: no indica que se haya recibido dinero ni genera factura fiscal.
5. En **Recibos → detalle → Registrar pago**, elegir **Efectivo**, importe y fecha de recepción. Añadir referencia si procede y confirmar una vez recibido el dinero.
6. Comprobar el pago en el historial y el saldo del recibo. Un pago parcial conserva pendiente la diferencia; un pago total deja saldo cero. No registrar un pago sobre un recibo reservado por Stripe hasta resolver esa reserva.
7. Vincular una cuenta mediante invitación únicamente si el socio necesita entrar en su área personal. Esa vinculación no le concede permisos de responsable.

Este recorrido cubre el caso solicitado y no depende de C27/C35. Actualmente activación administrativa y pago son operaciones distintas: asignar la cuota puede activar al socio antes de registrar efectivo; no se promete una regla automática de «activar solo al cobrar» que no está implementada para este flujo.

## Evidencia de la continuación y siguiente sesión

Pruebas esenciales con PostgreSQL real aislado para permisos, aislamiento, dinero, concurrencia e idempotencia; tests focalizados de dominio/UI, OpenAPI, locales y compilación. C38:5 escenarios SQL nuevos,1 de pagos existente,2 de acceso anterior,11 de dominio/acceso/OpenAPI y58 de UI/padres. Recuperación041 desde cero1/1 con bono financiado y parcialmente consumido: referencias, filas históricas, RLS y claves de reintento conservados. Detalle y límites en el progreso; logs fuera de Git en `../informes/`.

Reanudación local posterior del16octubre: http://localhost:5178/#/centers, API/web healthy, SQL041 y7archivos conservados. El Compose habitual carga preview.mjs, sin carrier Stripe,0perfiles y jobs0; túnel detenido. No se requieren nuevas imágenes por el cambio exclusivo de configuración/documentación.

Preview construida con `a1566365-dirty` en la rama de trabajo: API/web saludables, statusSQL041 y siete archivos JSON/secreto/entrenamiento idénticos antes/después por SHA256. El sufijo dirty conserva los cambios Docker/web previos del usuario; no indica cambios del módulo sin guardar. Mismo túnel mientras el contenedor siga vivo. Apagar el ordenador detiene la disponibilidad de la preview; reanudar con `scripts/Start-CentersPreview.ps1`. Un túnel recreado puede requerir otro hostname/origen.

Validación aplazada por instrucción del usuario: suites generales, regresión exhaustiva y revisión visual completa. No eludir la denegación guardada del navegador mediante otro origen o herramienta. La siguiente sesión debe respetar el alcance reducido y preparar la validación final cuando corresponda; no reimplementar C30/C33/C38 ni tratar los aplazamientos como bloqueos del alta manual. El ensayo real C27 queda aplazado; CENTERS_STRIPE_TEST_GUIDE.md es únicamente una referencia para cuando vuelva a autorizarse ese alcance.
