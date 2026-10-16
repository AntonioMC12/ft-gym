# Renovación en efectivo y uso de bonos (C43–C45)

Implementado en la rama de centros. Es un registro administrativo de dinero recibido en mano; no conecta pasarelas, no solicita pagos al banco y no envía mensajes por esta nueva funcionalidad.

## Renovar desde Socios

1. Entra como superadmin o responsable con `billing.manage` y `payments.record`. Abre un centro activo y su listado de Socios; el buscador mantiene las mismas acciones.
2. La tarjeta muestra la cuota, el estado financiero y su caducidad. Pulsa **Renovar**. Si nunca ha contratado una cuota, pulsa **Seleccionar cuota** y elige una vigente con impuestos y prorrateo configurados.
3. Revisa nombre, periodo y cantidad. **Confirma únicamente después de recibir ese dinero en efectivo.** La cantidad es el saldo pendiente del recibo del periodo; un pago parcial anterior se descuenta.
4. **Renovar y registrar efectivo** realiza una sola transacción: crea el contrato si falta o terminó, activa una afiliación pendiente si corresponde, emite o reutiliza el recibo y aplica el pago en metálico. Actualiza el listado y muestra la confirmación. Un importe cero no inventa un movimiento de caja.
5. Si el periodo está pagado o ya renovado, informa que está cubierto. No vuelve a cobrar por doble clic, reintento, otra cuenta de responsable o una petición concurrente. Los identificadores de petición también se conservan para respuestas repetidas sin efecto.

El calendario es el contratado: día de cobro, intervalo de1/3/6/12meses, zona horaria, impuestos, descuento y prorrateo versionados. Se renueva el periodo que contiene el día actual, sin introducir fechas ni sumar30días. Con día de cobro1, octubre es `[1octubre,1noviembre)`; el último día cubierto es31octubre. Con otro día de cobro se conserva su ciclo, aunque empiece en el mes anterior. La confirmación muestra los límites del periodo; el final es exclusivo, como en los recibos existentes.

Un contrato vigente conserva su precio inmutable; renovarlo no lo sustituye silenciosamente por otro precio. Si el contrato terminó, se usa la versión vigente de su misma cuota y se conserva su descuento. Si la cuota está archivada o dejó de estar disponible, hay que seleccionar otra mediante el flujo existente. Si existen cambios futuros, se revisan antes de renovar. Socios de baja/congelados requieren resolver su afiliación; no se reactivan de forma implícita por cobrar.

**Cambiar cuota** abre directamente Cuotas y cobros de la ficha. Conserva contratos anteriores y aplica la política existente de fecha efectiva, conflictos y preaviso. No altera retroactivamente periodos registrados ni convierte el cambio por sí solo en pago. Una devolución posterior requiere revisar el recibo y sus movimientos; Renovar no oculta ni vuelve a cobrar automáticamente un recibo de una renovación devuelta.

## Caducidad y acceso a la aplicación

La caducidad es el último día cubierto. Se mantienen los10días civiles siguientes inclusive y se bloquea a partir del día11 en la zona del centro. Ejemplo: caduca31octubre, plazo hasta10noviembre inclusive, bloqueo11noviembre.

La vigencia se calcula con el primer ciclo del contrato existente y sus posteriores periodos efectivamente pagados o renovaciones gratuitas. Esta regla mantiene el alta/asignación inicial existente sin inventar pagos históricos para contratos abiertos que antes no tenían una caducidad mensual explícita. El final del contrato o de la afiliación limita la cobertura. No se convierten recibos pendientes en pagos ni se reescribe su historial.

Solo afecta a cuentas vinculadas con historial de cuotas. Una cuenta sin cuota y un socio exclusivamente de bonos no se bloquean por no tener mensualidad. Administradores técnicos, superadmins y cuentas con capacidad vigente para gestionar cuotas están exentos. Para varias afiliaciones mensuales, una vigente o en gracia mantiene el acceso; se bloquea cuando todas han superado su plazo. El vínculo cuenta/socio se resuelve en servidor, nunca por nombre/correo editable.

El backend comprueba cada ruta privada autenticada, incluidos datos personales y entrenamiento/QR/clases propios. Devuelve403`membership-renewal-required` si corresponde. Autenticación, estado de acceso, afiliaciones mínimas y cierre de sesión siguen disponibles; no hay renovación autónoma del socio ni pago online. La interfaz oculta vistas privadas mientras comprueba el estado, muestra el plazo de gracia o la pantalla **RENUEVA TU CUOTA PARA CONTINUAR USANDO LA APLICACIÓN**. Recomprueba al volver a la ventana, recuperar visibilidad, recibir ese403 y cada30segundos; tras renovar se recupera el acceso. Ante fallo de comprobación no se muestran funciones privadas hasta poder validar; se conserva el entrenamiento local y el cierre de sesión guarda cambios pendientes con el mecanismo existente.

## Registrar un día de bono

1. Para un socio con bonos adquiridos, tenga o no una mensualidad, la tarjeta de Socios muestra **Registrar día de uso** y el saldo utilizable.
2. El servidor verifica afiliación activa y bono vigente, no revocado, con créditos y, si es de pago, recibo totalmente liquidado. No depende de tener configurados QR, dispositivo o cerradura.
3. Elige primero el bono que termina antes; a igualdad de caducidad, el adquirido antes. Registra socio, bono, fecha local y operador y descuenta una sesión dentro de la misma transacción.
4. Otra pulsación/petición/operador ese día informa que ya está registrado. También detecta un consumo QR anterior de ese día. Un bono agotado, caducado, futuro, revocado o impagado no se consume y los saldos no bajan de cero.

La política de admisiones QR se conserva: no convierte todas las visitas físicas en una única visita diaria. La nueva acción manual usa un registro por socio/día y comparte el saldo con el ledger QR. No hay conexión nueva con NFC/cerradura.

Para dar de alta a alguien exclusivamente con bonos, crea su ficha y asigna un bono desde Cuotas y cobros. La primera asignación puede activar al socio pendiente sin crear una mensualidad; un bono de pago conserva su recibo y requiere registrar el efectivo antes de poder gastarlo.

## Historial

En **Cuotas → Historial de bonos**, aparecen compras actuales y anteriores, fecha de alta, titular, nombre, inicio/fin de validez, total, consumidas/restantes y estado explícito. Filtros Todos/Activos/Agotados/Caducados y búsqueda por nombre/apellidos se aplican en servidor. Orden inicial: alta descendente, páginas de30 con cursor. **Ver consumos** muestra fecha local, operador y origen manual/QR, también paginados. Caducidad exclusiva y estados se conservan en las fichas de socio y portal propio; no se borran bonos agotados.

## Persistencia y despliegue

Migración aditiva `042_renewals_daily_passes.sql`, ejecutada con `centers_migrator`: crea el ledger de renovaciones y su unicidad socio/mes, relaciona recibos/pagos, añade día/operador a consumos y permite registros manuales sin visita QR. Completa los registros antiguos desde sus visitas sin modificar identificador, instante ni saldo. FORCE RLS queda restaurado antes del commit; runtime no obtiene DDL, UPDATE ni DELETE sobre los ledgers. Reutiliza permisos, bloqueo de centro, idempotencia, auditoría y APIs existentes. No guarda datos financieros ni permisos en S/localStorage/exportaciones personales.

Aplicar042 y043 con copia de seguridad, después arrancar API/WEB de esta versión. No ejecutar suites en la base persistente ni aplicar automáticamente esta entrega en producción. En preview ficticia puede usarse el inicializador protegido `node test/centers-integration/preview-init.mjs` dentro de su imagen nueva; conserva JSON de identidades/secretos/entrenamientos y datos SQL. Los backups SQL completos incluyen las nuevas tablas; no restaurar solo las tablas históricas de una exportación parcial.

## Evidencia y límites

Pruebas con PostgreSQL real aislado: concurrencia entre operadores, un solo pago/consumo, primera cuota con activación, rollback completo ante fallo de auditoría, recibo parcialmente pagado, último contrato y descuento, gracia10/11días, bloqueo y recuperación de una sesión existente, permisos/centros, bonos sin cuota, impago, caducidad, FEFO y cursor/historial. Upgrade041→042 con un consumo QR no vacío conserva saldo, instante, ID, operador y FORCE RLS. Pruebas de dominio cubren febrero bisiesto, fin de año, periodos1/3meses, estados y rutas privadas sin excepción accidental.

Pruebas UI enfocadas cubren confirmación antes de registrar efectivo, periodo ya cubierto, selección sin fechas, saldo agotado, cambio de cuenta/respuesta tardía, bloqueo/revalidación de sesión e historial/consumos/filtros; se mantienen los tests pertinentes previos de centros. Compilación e i18n se comprueban antes de actualizar preview. Aceptación visual real móvil/escritorio/temas y validación operativa final continúan pendientes en C41/C42; no se presentan como realizadas por pasar tests. Sin cobros ni comunicaciones a personas reales, sin despliegue productivo.


## Agrupación por socio y bonos con mensualidad (schema043)

La lista de Socios mantiene una tarjeta por ID de socio: cuota actual/última renovable, bloque independiente de bonos y botón Historial. El historial se consulta bajo demanda con los endpoints de contratos y bonos del mismo centro/socio, sin formularios de adquisición, revocación ni pago. El historial global de bonos agrupa las compras cargadas por memberId; ampliar páginas añade compras a la misma tarjeta. No agrupar por nombre ni eliminar compras reales.

043_mixed_members_daily_passes.sql modifica únicamente la comprobación del consumo manual para permitir socios con mensualidad y bono. No cambia ledgers ni precios/fechas/recibos. Renueva exclusivamente la acción Renovar; Registrar día de uso consume exclusivamente un crédito elegible, FEFO, una vez por día local y con las mismas comprobaciones de afiliación, pago, caducidad, locks y auditoría. Los bonos no renuevan la mensualidad ni eliminan su deuda o el bloqueo de la app.
