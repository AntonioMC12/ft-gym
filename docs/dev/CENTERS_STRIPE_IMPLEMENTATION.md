# C27: checkpoint de Stripe sandbox

**En progreso.** Se ha construido y probado la base privada del módulo; todavía no
se exponen un checkout, una ruta webhook, una excepción CSRF o controles de pago.
Ninguna cuenta externa se ha configurado y no se han creado sesiones en Stripe ni
realizado cargos reales. Las llamadas del cliente REST usan respuestas simuladas.

## Base guardada

- Configuración privada con claves exclusivamente `sk_test_`/`rk_test_`, secretos
  webhook rotables, centros explícitos, límite por intento y límite diario por
  centro. Perfil vacío/incorrecto desactiva la integración sin afectar entrenamiento.
  No hay modo live. Preparación/recepción exigen SQL marcado `test`.
- Versión REST fijada `2026-09-30.endive`, consultada en la
  [referencia de versiones](https://docs.stripe.com/api/versioning).
  Cliente nativo `fetch`, endpoint fijo, sin redirecciones, timeout5s y key
  idempotente estable por intento; recibe el importe SQL, no un precio del cliente.
  La URL hospedada se restringe a Checkout de Stripe y a la sesión test esperada.
- Firma SHA256 sobre timestamp + punto + **Buffer original**, comparación constante,
  tolerancia300s, rechazo de cabeceras ambiguas, cuerpos mayores de64KiB, eventos
  live y versiones desconocidas. El JSON se interpreta después de verificar.
  Referencia: [webhooks de Stripe](https://docs.stripe.com/webhooks).
- Migración017 aplicada solo en test y desde ese momento inmutable. Intento separado
  del pago, importe/beneficiario/perfil inmutables al runtime, reserva única por recibo,
  identificadores de sesión y PaymentIntent únicos por perfil. El inbox conserva
  proyección allowlist y hash, sin datos de tarjeta, dirección o email del pagador.
- `prepareStripeAttempt` usa capacidades actuales, bloqueo de centro, saldo exacto,
  idempotencia y presupuesto UTC. Una reserva impide un pago manual concurrente;
  también lo protege un trigger SQL, no solo la API.
- `receiveStripeWebhook` verifica perfil/firma/centro y persiste antes de responder.
  Duplicados semánticamente iguales se deduplican aunque cambie el formato/campos
  no financieros del JSON; una proyección diferente con el mismo ID se rechaza.
  Desajustes con el intento se conservan para revisión. **No aplica un pago.**

## Siguiente recorrido, antes de exponer C27

1. Implementar creación externa después de confirmar el intento SQL, fuera de la
   transacción. Reusar parámetros e idempotency key; no crear otra sesión ante un
   resultado desconocido. El vencimiento del intento es fijo, no se recalcula al
   reintentar. Respetar la ventana de expiración del
   [Checkout hospedado](https://docs.stripe.com/api/checkout/sessions/create).
   Verificar expresamente impuestos/adaptive pricing y no aceptar un cambio de
   moneda/importe por configuración ajena al recibo.
2. Añadir obtención y validación autoritativa de sesión para conciliación: perfil,
   cuenta, `livemode=false`, IDs, metadata, importe, EUR, estado e identidad del
   PaymentIntent. No usar `Checkout.created` como fecha del pago: es creación de
   sesión. Resolver fecha contable a partir de evidencia real de confirmación.
3. Extraer un append de ledger compartido de `services/payments.js`: mantener las
   comprobaciones de C20, permitir únicamente el `reserved_payment_id` del intento
   confirmado y guardar pago+aplicación+auditoría+estado/inbox en una transacción.
   Una vuelta del navegador jamás marca pagado ni decide el importe.
4. Procesador SQL con claim/lease y fencing. Reinicio y dos workers no duplican;
   paid es terminal frente a eventos antiguos. Dinero recibido con saldo cambiado
   o metadata incoherente queda visible para conciliación, sin sobrepago ni pérdida
   de evidencia. Probar especialmente expiración→nuevo intento→confirmación tardía:
   la unicidad activa de017 impide marcar dos review a la vez. Resolver este caso
   explícitamente mediante migración nueva si hace falta, sin editar017.
5. Contabilizar límites y reservas sin ignorar fondos recibidos pendientes de
   conciliación. El límite actual cubre intentos iniciados en cada día UTC; no se
   afirma que sea un límite universal de liquidaciones/payouts del proveedor.
6. Solo entonces registrar POST webhook con lector raw y límite propio. Eximir de
   CSRF únicamente esa clave exacta y sustituirlo por verificación de firma, perfil
   y modo. Revisar abortos del socket como los demás lectores del servidor; nunca
   loguear body/secret ni aceptar un `platform` del cliente.
7. Rutas de estado/creación/conciliación: superadmin explícito o capacidad financiera
   por centro. Flujo propio separado resuelve el socio desde la sesión, sin IDs de
   otra cuenta. Hará falta la política own de INSERT/idempotencia correspondiente;
  017 permite preparar solo a staff/plataforma.
8. UI reutiliza componentes de centros, `api.js`, confirmaciones y guardas de vida;
   muestra modo test y confirmación pendiente. Navega únicamente a URL validada y
   conserva historial/contexto al volver. Sin tarjeta ni permisos financieros en S.
9. Harness HTTP real en PostgreSQL test con transporte Stripe simulado. Si se usa
   preload del proceso hijo, restringirlo a un fixture explícito bajo temp y nunca
   heredar claves reales. Probar firma alterada, duplicados, orden inverso, pagos
   manuales paralelos, expiración, reintento tras timeout, límites por centro y
   preservación de cuentas/entrenamiento. No hacen falta llamadas externas reales.
10. Actualizar OpenAPI al registrar rutas; ejecutar suites generales, build, restore
    y recorrido visual. No marcar C27done hasta cerrar ese recorrido completo.

Antes de otro DDL, revisar los índices equivalentes `receipt_member_identity`
(011) y `receipt_notification_member` (014). Ambos soportan la misma unicidad;
si se elimina el redundante, comprobar dependencias FK en catálogo y hacerlo en
una migración nueva, sin `CASCADE` ni cambios de checksums históricos.

Claves, cuentas, destinos HTTPS públicos, pruebas con un proveedor configurado y
cargos reales son operación posterior y conservan los gates C40–C41. Esta guía no
autoriza activar endpoints públicos, publicar la app o usar fondos reales.
