# C27 — cómo probar Stripe con esta aplicación

Actualizado: 16 octubre 2026. Guía contrastada con el código de la rama `codex/centers-module`, esquema041, y documentación oficial de Stripe. **Esta guía no implica que se haya ejecutado ya una prueba contra una cuenta externa.**

> **Aplazado por decisión posterior del usuario (16octubre2026): todo se cobra en efectivo.** No ejecutar esta guía, configurar claves ni activar Stripe en la entrega actual. Se conserva como referencia para cuando se retome expresamente el pago con tarjeta. No es un bloqueo del alta o cobro manual.

## 1. Qué vas a probar

La preview actual usa un proveedor ficticio (`stripe-preview.mjs` / `stripe-http-preload.mjs`). Sirve para ensayar pantallas, pero no contacta con Stripe. Cambiar solamente una clave en esa preview no acredita una integración real.

El ensayo de C27 consiste en crear desde la aplicación un Checkout de un recibo ficticio, pagarlo con una tarjeta de prueba en Stripe y comprobar que la confirmación genera exactamente un pago aplicado al recibo. Cancelar, recargar o reenviar una notificación no debe duplicar pagos ni marcar cobrado un recibo sin evidencia.

Se utiliza exclusivamente un **sandbox de Stripe**, con claves test y datos ficticios. Los pagos de sandbox no mueven dinero real. Puedes acceder o crear uno desde el selector de cuentas del Dashboard. [Documentación oficial de sandboxes](https://docs.stripe.com/sandboxes).

No necesitas activar facturación fiscal ni domiciliaciones SEPA. El «recibo» de la aplicación es el registro de lo que se debe/paga, no una factura fiscal. El pago en efectivo es otro flujo y no depende de Stripe.

## 2. Preparación en Stripe

1. Abre tu sandbox, no el entorno live.
2. Obtén su identificador de cuenta `acct_...` y una clave secreta `sk_test_...` del mismo sandbox. Para el ensayo inicial, una clave secreta test evita confundir permisos incompletos de una clave restringida con un fallo del módulo. No hace falta una clave publicable `pk_...` en este flujo de Checkout alojado.
3. Reanuda la preview si está apagada:

   ```powershell
   Set-Location 'C:/Users/Usuario/Documents/ChatGPT/ft-gym/openGym'
   ./scripts/Start-CentersPreview.ps1 -Share
   ```

   Apunta la URL HTTPS que muestre. Usa la actual, porque al recrear un túnel puede cambiar. Guarda ese mismo origen, sin `/#/centers`, para la configuración posterior.
4. Entra como **Plataforma Centros** o responsable, abre el centro ficticio que vas a usar y copia el `centerId` de su URL. Autoriza solamente ese centro en el perfil Stripe.
5. En el **Workbench/Webhooks del sandbox**, crea un destino para tu propia cuenta:
   - Tipo de payload: **Snapshot**, que es el formato que verifica este backend.
   - Versión de eventos: **`2026-09-30.endive`**, exactamente la de `api/centers/stripe-config.js`.
   - URL: `https://TU-HOST-ACTUAL.trycloudflare.com/api/centers/stripe/webhook?profileId=centro_pruebas`.
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
6. Copia el secreto de firma `whsec_...` de **ese destino**. No es la clave API ni el secreto de otro webhook.

La elección de Snapshot, versión y secreto del destino se hace al configurar el webhook. [Configuración oficial de webhooks](https://docs.stripe.com/webhooks). Si la versión exigida no está disponible en tu sandbox, detener el ensayo y revisar compatibilidad; no desactivar la comprobación del backend para forzarlo.

## 3. Preparar la API para contactar con el sandbox

Este apartado es configuración técnica local. **No se aplica automáticamente al leer la guía.** Conserva la base ficticia y los datos de la preview; cambia temporalmente su único proceso API al arranque normal, sin el simulador. No arranques una segunda API simultánea sobre los mismos JSON.

Guarda los siguientes archivos **fuera del repositorio**, en `C:/Users/Usuario/Documents/ChatGPT/ft-gym/informes/`. No pegues las claves en el chat ni las incluyas en Git.

### Archivo privado: `centers-stripe-real-test.env`

Sustituye los marcadores. `ORIGIN`, `returnOrigin` y el origen actual de la preview deben coincidir. `RP_ID` es solo el hostname, sin `https://` ni rutas. Los límites de ejemplo son 10EUR por intento y 50EUR/día de preparaciones; el recibo del ensayo será de 1EUR.

```dotenv
ORIGIN=https://TU-HOST-ACTUAL.trycloudflare.com
RP_ID=TU-HOST-ACTUAL.trycloudflare.com
CENTERS_STRIPE_PROFILES_JSON='[{"id":"centro_pruebas","mode":"test","accountId":"acct_SUSTITUIR_CUENTA_SANDBOX","apiKey":"sk_test_SUSTITUIR_CLAVE_SANDBOX","webhookSecrets":["whsec_SUSTITUIR_SECRETO_DEL_DESTINO"],"centerIds":["SUSTITUIR_CENTER_ID"],"maxAmountMinor":"1000","dailyLimitMinor":"5000","returnOrigin":"https://TU-HOST-ACTUAL.trycloudflare.com"}]'
```

### Override temporal: `centers-stripe-real-test.compose.yml`

Este overlay usa los Compose existentes. Las rutas relativas de servicios se resuelven respecto al primer Compose, situado en `openGym/`. La red adicional permite la salida HTTPS a Stripe: la red aislada de pruebas por sí sola no basta.

```yaml
services:
  centers-preview-api:
    command: ["node", "server.js"]
    env_file:
      - ../informes/centers-stripe-real-test.env
    environment:
      NODE_OPTIONS: ""
      CENTERS_STRIPE_TEST_FIXTURE: ""
      DATA_DIR: /tmp/ft-gym-centers-preview-data
      CENTERS_ENABLED: "1"
      CENTERS_DATABASE_URL: postgresql://centers_app:fictional-runtime-test-only@centers-test-db/ft_gym_centers_test
      CENTERS_SUPERADMIN_UIDS: preview_platform
      CENTERS_JOBS_ENABLED: "0"
      CENTERS_MAINTENANCE_ENABLED: "0"
      CENTERS_MAIL_PROFILES_JSON: ""
      CENTERS_NOTIFICATIONS_TEST_CAPTURE: "0"
      PASSWORD_LOGIN: "1"
      FIRST_USER_ADMIN: "0"
      INVITE_ONLY: "1"
      ALLOW_GUEST: "0"
      COACH_DISABLED: "1"
      MEDIA_UPLOADS: "0"
      DEFAULT_LANG: es
      PORT: "3000"
    networks:
      - test-internal
      - stripe-sandbox-egress
networks:
  stripe-sandbox-egress:
    internal: false
```

No emplees `CENTERS_JOBS_ENABLED=1` para este ensayo: esa opción también habilita otros trabajos de centros. En los siguientes pasos se ejecuta **solo el worker Stripe**, manualmente. El aviso de confirmación automática pausada será esperado.

### Aplicar el override

En PowerShell, desde `openGym/`:

```powershell
$docker = 'C:/Users/Usuario/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
$stripeCompose = @(
  'compose',
  '--env-file', '../informes/centers-preview-share.env',
  '-f', 'compose.centers.test.yml',
  '-f', 'compose.centers.preview.yml',
  '-f', '../informes/centers-stripe-real-test.compose.yml'
)
& $docker @stripeCompose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Revisar la configuración antes de continuar.' }
& $docker @stripeCompose up -d --no-deps --force-recreate centers-preview-api
```

Se recrea solamente la API; los montajes existentes conservan sus datos, web y túnel. No usar `down -v`. No ejecutar `config` sin `--quiet` con los secretos cargados, porque su salida puede mostrarlos.

Comprueba arranque, esquema y perfil sin imprimir claves:

```powershell
& $docker exec ft-gym-centers-preview node --input-type=module -e 'import {centersConfig} from "./centers/config.js"; import {createCentersDatabase} from "./centers/db.js"; const c=centersConfig(); const db=createCentersDatabase(c); try { console.log(JSON.stringify({database:await db.status(),profiles:c.stripeProfiles.map(p=>({id:p.id,mode:p.mode,centerIds:p.centerIds})),automaticJobs:c.jobsEnabled})); } finally { await db.close(); }'
```

Esperado: base disponible, schema041, un perfil `centro_pruebas`, mode test, el centro elegido y automaticJobs false. Si `profiles` está vacío, la configuración no se ha aceptado; revisar marcadores, tipos, prefijos y JSON antes de probar pagos. Conservar `stripeCompose` en esta terminal para el cierre.

## 4. Preparar un recibo ficticio de 1EUR

1. Abre la URL HTTPS actual y entra con el mismo responsable/plataforma que hará todo el ensayo.
2. En **Centros → centro elegido → Cuotas**, crea una cuota de prueba de **1EUR**, con impuestos y prorrateo definidos expresamente para el caso ficticio.
3. En **Socios → Nuevo socio**, crea uno de prueba. No hace falta vincularlo a una cuenta personal para cobrar desde gestión.
4. Abre su ficha, asigna la cuota con fecha de hoy y guarda. Asignar una suscripción a un socio pendiente activa su membresía según la fecha efectiva; esto es el flujo administrativo, no un alta pública condicionada a Stripe.
5. En la suscripción, previsualiza el cargo y genera su recibo. Comprueba que su **saldo pendiente es exactamente 1EUR**. Si el calendario produce otro importe, usa un caso configurado expresamente para 1EUR antes de continuar.
6. No registres un pago manual sobre este recibo: se usará para el ensayo online. Usa un recibo nuevo, sin intentos anteriores del proveedor ficticio ni reservas `review`.

## 5. Ejecutar el pago de prueba

1. Abre **Recibos → detalle del recibo** y su apartado **Pagos de prueba**.
2. Pulsa **Preparar pago de prueba** y confirma el importe. El intento quedará creando y el recibo reservado.
3. Ejecuta una pasada del worker en PowerShell:

   ```powershell
   & $docker exec ft-gym-centers-preview node --input-type=module -e 'import {centersConfig} from "./centers/config.js"; import {createCentersDatabase} from "./centers/db.js"; import {stripeTick} from "./centers/services/stripe-worker.js"; const c=centersConfig(); const db=createCentersDatabase(c); try { console.log(JSON.stringify(await stripeTick(db,c))); } finally { await db.close(); }'
   ```

   Este comando **sí contacta con el sandbox configurado**. No ejecuta el job de cuotas ni el de correo. El resultado indica centros e intentos procesados; un número positivo no demuestra por sí solo que se haya cobrado.
4. Pulsa **Recargar estado del pago**. Debe aparecer abierto y el enlace **Abrir pago de prueba**. El enlace solo se entrega al iniciador vigente; no cambies de usuario entre preparar y abrir.
5. En la página alojada por Stripe utiliza:
   - Tarjeta: **4242 4242 4242 4242**.
   - Caducidad: una fecha futura.
   - CVC: tres dígitos cualesquiera.
   - Resto: datos ficticios.

   Son valores oficiales para la prueba interactiva; no introduzcas una tarjeta real. [Tarjetas de prueba de Stripe](https://docs.stripe.com/testing).
6. Finaliza el pago. Volver al navegador de la aplicación **todavía no acredita** el registro económico.
7. En Workbench comprueba la entrega de `checkout.session.completed` al destino configurado. Debe devolver HTTP200. Un200 acredita recepción, no necesariamente conciliación final.
8. En gestión, pulsa **Comprobar pago** para solicitar conciliación, y vuelve a ejecutar la pasada del worker del paso3. Después pulsa **Recargar estado del pago**.
9. Comprueba los tres resultados: intento **pagado**, **un solo pago** aplicado de1EUR y **saldo pendiente0EUR** en el recibo.

Si falta temporalmente la evidencia de la transacción de balance, puede seguir pendiente o requerir revisión. Espera, solicita otra comprobación y ejecuta otra pasada; no registres en efectivo el mismo importe para hacer que el caso parezca correcto.

## 6. Casos mínimos adicionales

| Caso | Acción | Resultado esperado |
|---|---|---|
| Reintento | Recargar varias veces y repetir «Comprobar pago»/worker sobre el caso pagado | Mismo pago, sin segundo movimiento |
| Webhook repetido | Reenviar el mismo evento al mismo destino desde Workbench y ejecutar el worker | No duplica pago ni aplicación |
| Cancelación | En otro recibo, abrir Checkout y regresar mediante cancelar | No pagado; el saldo continúa. Cancelar el navegador no libera necesariamente la reserva: la sesión debe expirar/conciliarse |
| Tarjeta rechazada | En otro Checkout, usar la tarjeta de rechazo de la tabla oficial de Stripe | No crea pago local y conserva la deuda |
| Aislamiento | Con otra cuenta o centro sin permiso, intentar consultar/preparar ese recibo | Rechazado; no muestra enlace ni datos económicos ajenos |
| Vuelta por URL | Visitar directamente una URL con `checkout=return` | No marca el recibo pagado |

Para el caso rechazado consulta la tabla oficial vigente, en vez de usar una tarjeta real. No emplees `stripe trigger checkout.session.completed` como sustituto del recorrido completo: un evento genérico no tiene necesariamente las referencias y metadata creadas por esta aplicación.

El pago online no sustituye el bloqueo manual de acceso. Las devoluciones/disputas externas tienen limitaciones operativas registradas en CENTERS_STRIPE_IMPLEMENTATION.md; este ensayo no certifica sincronización automática de todo su ciclo.

## 7. Si algo falla

| Síntoma | Revisar |
|---|---|
| No aparece el bloque Stripe | Perfil JSON aceptado, `centerIds`, SQL marcado test y proceso normal sin carrier simulado |
| Sigue «creando» | Worker manual ejecutado; salida a Internet de la API; clave y cuenta del mismo sandbox |
| `stripe-account-mismatch` | `accountId` no corresponde a la clave usada |
| HTTP400 / `stripe-signature-invalid` | `whsec` del destino correcto, eventos Snapshot, versión exacta y reloj del equipo |
| El destino no recibe eventos | URL del túnel actual, ruta/query `profileId`, eventos y sandbox elegidos |
| Pagado en Stripe pero pendiente local | Solicitar conciliación y ejecutar worker; revisar evidencia/importe/moneda/metadata y estado `review` |
| Pago manual bloqueado | Hay reserva Stripe vigente o en revisión. Resolverla por conciliación, sin borrar filas ni forzar un pago duplicado |
| «Límite alcanzado» | Límites por intento/día y frecuencia; usar importes dentro del perfil, sin ampliar límites para ocultar el problema |

Un fallo en este ensayo es precisamente evidencia útil de C27. Registrar código de error y paso, sin secretos, tokens ni payloads completos. No deshabilitar firma/RLS ni añadir modo live para continuar.

## 8. Cerrar el ensayo y guardar evidencia

1. Anota fecha, commit/esquema, centro/recibo/intento de prueba, casos ejecutados y resultado. Identificadores y capturas de ejemplo pueden guardarse en `../informes/`; nunca claves ni datos de tarjeta reales.
2. Deja conciliados los intentos del ensayo. Los pendientes o `review` no desaparecen al retirar el perfil y pueden seguir reservando su recibo. Si expiras una sesión en Stripe, concíliala con este perfil antes de quitarlo.
3. Deshabilita el destino de webhook de este ensayo en el sandbox cuando ya no deba recibir eventos.
4. Restaura **solo el arranque de la API** ficticia, sin el overlay privado y manteniendo web/túnel/datos:

   ```powershell
   & $docker compose --env-file ../informes/centers-preview-share.env -f compose.centers.test.yml -f compose.centers.preview.yml up -d --no-deps --force-recreate centers-preview-api
   ```

5. Comprueba que las identidades, recibos y pagos ficticios siguen presentes. No borres el volumen para «limpiar» el resultado.
6. Actualiza CENTERS_PROGRESS.md con la evidencia: C27 solo supera su validación sandbox cuando el recorrido externo termina correctamente. La revisión visual y C41/C42 se reservan para el cierre acordado.

### Alternativa al webhook público: Stripe CLI

Si se prefiere CLI, hay que instalarla e iniciar sesión en el mismo sandbox. `stripe listen --forward-to "https://TU-HOST-ACTUAL.trycloudflare.com/api/centers/stripe/webhook?profileId=centro_pruebas" --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired` reenvía eventos y proporciona **su propio secreto** `whsec`, que debe usarse en el perfil en lugar del secreto del Dashboard. No usar ambos intercambiados. Esta alternativa no exige publicar otro puerto local. [Referencia oficial de listen](https://docs.stripe.com/cli/listen).

La CLI utiliza por defecto la versión de eventos de la cuenta. Como este backend exige una versión exacta, solo usar esa alternativa cuando se haya comprobado que entrega `2026-09-30.endive`; no asumir que `--latest` siempre coincide. El destino Snapshot con versión explícita del apartado2 es la opción más clara para este ensayo.
