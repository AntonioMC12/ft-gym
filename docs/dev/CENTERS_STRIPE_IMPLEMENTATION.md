# C27: Stripe sandbox integrado

Estado: implementación y pruebas automáticas terminadas; **C27 sigue in_progress**
por la revisión visual pendiente. El navegador deniega localhost:5178 mediante una
preferencia guardada, también después de la autorización general del usuario.
No eludirla con otro navegador, HTTP de escritorio o un controlador alternativo.
Las pruebas HTTP aisladas y de componentes sí están verificadas.

No se ha configurado una cuenta externa ni creado una sesión real en Stripe.
El adaptador REST se prueba con respuestas simuladas. No existe modo live.

## Flujo e invariantes

1. La sesión y el rol vigente autorizan el centro. El flujo propio resuelve el
   socio desde account_uid; rechaza memberId/accountUid y recibos ajenos, incluso
   cuando el socio también tiene permisos de responsable.
2. Preparación bajo bloqueo de centro: saldo exacto EUR, afirmación de igualdad
   expectedBalanceMinor, límites e idempotencia. El cliente no selecciona el importe
   cobrado. Se fija perfil, cuenta, versión REST, origen de vuelta y caducidad.
   SQL reserva el recibo y confirma antes de cualquier petición externa.
3. El worker reclama con lease90s y token de fencing. Verifica GET/account,
   crea con clave estable o recupera la sesión conocida. Solicitudes y respuestas
   están acotadas; no hay transacción SQL abierta durante la red. Nunca recrear
   un resultado desconocido después de23h: la clave externa puede caducar después
   de24h. Las rotaciones de clave conservan cuenta/perfil/parámetros.
4. GET de sesión expande PaymentIntent, Charge y BalanceTransaction. Se comprueban
   modo test, cuenta, metadata, identidad, moneda, importe bruto, captura automática,
   ausencia de descuentos/impuestos/conversión, devolución o disputa. Adaptive
   Pricing se desactiva en la solicitud; su respuesta nula equivale a no configurado,
   pero enabled=true se rechaza. No se guarda respuesta raw ni datos de tarjeta.
5. Pago y aplicación comparten appendPayment con C20. Reserva, saldo, auditoría,
   estado del intento y recepción se confirman atómicamente. Fecha contable desde
   BalanceTransaction.created convertida al huso del centro; nunca Checkout.created
   o la fecha de visita del navegador. Sin evidencia suficiente, esperar/revisar.
6. El POST webhook lee Buffer original (64KiB), verifica HMAC y timestamp300s,
   versión fija y perfil. Inbox durable antes de200, con proyección allowlist.
   Un evento firmado despierta el worker; no sustituye la comprobación de captura.
7. El navegador recibe un DTO recién autorizado. Abrir Checkout exige otro clic
   explícito en un enlace HTTPS validado, sin opener/referrer. El enlace solo se
   devuelve al iniciador actual y mientras centro/permiso/sesión siguen vigentes.
   La vuelta conserva centro y ámbito; ningún parámetro return/cancel marca pagado.

## Persistencia y recuperación

Migraciones001–019 ya aplicadas en PostgreSQL ficticio: **no editarlas**.
017 define intento/inbox y reserva;018 añade claims, evidencia, escaneo persistente
 e identidades inmutables;019 permite preparación own y peticiones de revisión.

- Unicidad por cuenta/perfil de Session y PaymentIntent; dinero del intento inmutable.
- Solo creating/open son únicos activos. Pueden coexistir varios review para conservar
  fondos confirmados tarde. Cualquier review bloquea nuevas reservas/pagos manuales.
- Si un intento expirado se confirma y hay otro abierto o saldo ocupado, guardar
  evidencia e importe recibido en review, sin sobrepago. Al desaparecer la reserva
  competidora se puede solicitar otra comprobación autoritativa.
- Paid es terminal por trigger; un evento viejo no regresa el estado ni crea otro pago.
- Errores transitorios: hasta8 intentos, intervalo5min. Después, revisión. Un checkout
  complete/unpaid no se anuncia como abierto: necesita revisión.
- Staff puede insertar una petición de conciliación autorizada/auditada; no obtiene
  UPDATE sobre el intento. Un claim perdido se recupera con lease y fencing.
- El escaneo SQL visita hasta4 centros y4 intentos por centro, persistiendo el turno.
  Su worker es independiente de recibos/email: un error de correo no bloquea dinero.
- Presupuesto diario = intentos iniciados en el día UTC, con reservas/paid/review.
  No se presenta como límite universal de liquidaciones o payouts de Stripe.

## Contrato y UI

Rutas documentadas en api/openapi.yaml:

- GET /api/centers/stripe y GET /api/centers/own/stripe: cursor acotado y ligado a
  actor/ámbito/consulta. Historial disponible aunque el proveedor esté desactivado.
- POST /api/centers/stripe/checkout y POST /api/centers/own/stripe/checkout:
  expectedBalanceMinor es una afirmación de igualdad, no un precio del cliente;
  falla409 si el saldo cambió desde la confirmación. Máximo10 preparaciones por
  actor/centro cada15min, además de límites monetarios y reserva única.
- POST /api/centers/stripe/reconcile: payments.record o plataforma explícita,
  petición SQL durable/idempotente. No libera reservas ni ordena transferencias.
- POST /api/centers/stripe/webhook?profileId=...: única excepción CSRF nueva,
  exactamente esa clave; origen/cookie no sustituyen la firma. Abortos de socket
  no se convierten en una respuesta falsa de éxito.

StripePayments reutiliza Section/Row/Button, confirmSheet, useAutoMore, los tokens
CSS y18locales. Se usa en detalle de recibo y en el panel financiero del centro.
Own nunca envía selector de socio. La reserva oculta el pago manual; el backend
lo impide también. Cambio de cuenta/centro/permiso/saldo invalida callbacks antiguos.
El mismo requestId sobrevive a un error de red. Poll/focus solo leen estado; una
confirmación nueva refresca el ledger. No se modifica S ni una copia personal.

## Configuración y prueba local

CENTERS_STRIPE_PROFILES_JSON es privada y vacía por defecto. Cada perfil requiere
id, mode=test, accountId, apiKey sk_test_/rk_test_, uno/dos webhookSecrets whsec_,
centerIds explícitos, maxAmountMinor, dailyLimitMinor y returnOrigin HTTPS o loopback.
Se exige SQL marcado test, además de CENTERS_ENABLED. CENTERS_JOBS_ENABLED controla
la confirmación periódica; la UI avisa si está pausada. No añadir modo live por
cambiar solo una variable. Las condiciones reales siguen en C40–C41.

Harness: stripe-http-preload.mjs solo funciona con directorio temp marcado,
credencial ficticia exacta y SQL test comprobado; sustituye fetch únicamente para
api.stripe.com y jamás lo contacta. Los demás tests eliminan perfiles y NODE_OPTIONS
heredados. stripe-preview.mjs es una variante explícita de la preview, con ese
mismo carrier falso y trabajos automáticos apagados. No usarlo en producción.

## Evidencia y continuación

- Suite SQL+HTTP completa y restore coordinado con019 pasan. El restore conserva
  también una reserva y una notificación Stripe pendiente sin aplicar el pago;
  entrenamiento/identidades, hashes, RLS e idempotencia siguen preservados.
- API general677:650pass y27fallos previos, mismos que antes.
- Frontend5174:5120pass y54fallos previos, mismos archivos que baseline.
-35 pruebas focalizadas de UI/rutas de centro y enlace seguro; build correcto;
 1948 cadenas presentes,18locales/2490claves sincronizadas.
- Pendiente revisión visual permitida (escritorio/móvil) y un ensayo explícitamente
  autorizado con una cuenta sandbox real. No afirmar que ese ensayo ya ocurrió.

Antes de producción: manejo operativo de review, conciliación de devoluciones/
disputas externas, acuerdo de condiciones y límites reales, perfiles, observabilidad
y gates C40–C41. No interpretar este documento como autorización para cargos.
Los índices equivalentes receipt_member_identity(011) y receipt_notification_member
(014) se pueden estudiar después; cualquier limpieza necesita catálogo de dependencias
 y migración nueva sin CASCADE, no modificar históricos.

Referencias primarias: [sesión](https://docs.stripe.com/api/checkout/sessions/retrieve),
[creación](https://docs.stripe.com/api/checkout/sessions/create),
[PaymentIntent](https://docs.stripe.com/api/payment_intents/object),
[Charge](https://docs.stripe.com/api/charges/object),
[BalanceTransaction](https://docs.stripe.com/api/balance_transactions/object),
[webhooks](https://docs.stripe.com/webhooks),
[versiones](https://docs.stripe.com/api/versioning).
