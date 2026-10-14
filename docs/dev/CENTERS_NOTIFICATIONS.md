# Avisos de centros (C26)

Los avisos viven en PostgreSQL, fuera de `S`, entrenamiento, copias personales y
credenciales JSON. La API mantiene `node:http`; el ejecutor acotado de C25 atiende
la cola después del lote de recibos. La emisión o entrega fallida de un aviso no
revierte un recibo, pago o devolución que ya se hubiera confirmado.

## Direcciones y privacidad

El contacto introducido por el personal en la ficha no prueba propiedad de una
cuenta ni sirve automáticamente como destino financiero. Desde **Mis centros**,
el socio solicita un código para una dirección propia. El código aleatorio de
256bits caduca a los15minutos; su hash y consumo quedan en SQL. Nunca se devuelve
el código en una respuesta HTTP, resultado idempotente ni auditoría. El cuerpo de
la entrega de verificación, privado al ejecutor, conserva el código hasta enviarlo.
La captura ficticia permite comprobar el mensaje en pruebas, fuera de cualquier
exportación personal. Hay un límite de3solicitudes por15minutos.

La confirmación habilita avisos de esa cuenta/afiliación. Cambiar la dirección o
desactivar avisos invalida la versión de contacto de las entregas pendientes. Se
comprueban centro activo, vínculo actual, versión y verificación antes del envío.
El socio puede darse de baja también con el centro inactivo o el transporte
desconfigurado. Esta preferencia no cambia su email de acceso ni su entrenamiento.
El personal no recibe direcciones privadas, códigos o cuerpos de mensajes en los
DTO de estado. RLS limita esos datos y las relaciones SQL incluyen centro y socio.

## Política explícita

Plataforma confirma política/versiones con sesión vigente, idempotencia, auditoría
y bloqueo del centro. Un responsable consulta resultados. Se configuran avisos de
recibos, antelación de vencimiento0–30días, repetición de deuda1–90días y antelación
de cambios de cuota1–90días. Los ejemplos de interfaz permanecen desactivados y no
se presentan como condiciones comerciales o exigencias legales aprobadas.

- Un recibo nuevo genera su aviso una vez, después del opt-in y de la activación
  de política; no se envía una ráfaga retrospectiva de recibos al activar email.
- Vencimientos se agrupan por socio/fecha, incluso si hay varios recibos. Deuda se
  agrupa por socio/ventana de repetición y respeta la gracia definida en el centro.
  Se recalcula el ledger exacto; una liquidación anterior al despacho cancela el
  recordatorio innecesario. No se envía un correo por cada recibo de la misma deuda.
- Un cambio de contrato con avisos habilitados respeta el plazo de antelación del
  centro. El plazo se fija en la nueva suscripción y no cambia por ediciones
  posteriores de política. Una entrega fuera de plazo queda bloqueada para revisar
  y, si procede, reprogramar el cambio antes de su efecto. No garantiza cumplimiento
  fiscal/contractual por sí sola: C39 y la activación operativa conservan su alcance.

Las plantillas transaccionales actuales están en español e incluyen solo el nombre
del centro y una indicación para consultar el portal, sin importes, motivos privados,
DNI, credenciales o datos bancarios. HTML escapa cualquier texto del centro. La
interfaz conserva los18idiomas del producto. No se implementa marketing o campañas.

## Transportes

Sin configuración, el transporte es `off`, no abre conexiones para enviar y no
permite activar avisos ni prometer una verificación por email.

`CENTERS_NOTIFICATIONS_TEST_CAPTURE=1` es exclusivo de pruebas dedicadas: exige
`centers.environment.kind=test`, solo admite destinatarios `.invalid` y escribe
una captura SQL única por ID de entrega. El trigger también rechaza capturas en
otras bases. No existe una conexión SMTP ni una llamada de red de este transporte.
Los helpers limpian perfiles reales heredados y desactivan el ejecutor automático.

El adaptador REST opcional de Cloudflare usa `fetch` del backend, sin SDK adicional
ni traslado de la aplicación a Workers. Sus campos de envío y resultados se
contrastaron con la [referencia REST oficial](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).
El endpoint es fijo, no sigue redirecciones y tiene timeout5s. No se asume que un
ID de mensaje o un header propio equivalga a deduplicación garantizada del proveedor.

`CENTERS_MAIL_PROFILES_JSON` es una lista privada del servidor. Cada perfil contiene
`provider: "cloudflare"`, `accountId`, `token`, `from`, `name` y `centerIds`. Un centro
solo puede aparecer una vez; una configuración inválida desactiva todos los perfiles
sin impedir el arranque del entrenamiento. El perfil no se guarda en SQL, frontend,
OpenAPI público o logs. El Compose de centros transmite la variable vacía por defecto.
No añadir tokens al ejemplo, repositorio, informes ni comandos de diagnóstico.

El transporte externo exige además SQL marcado `production`, perfil con el centro
exacto, política habilitada, contacto verificado y `CENTERS_JOBS_ENABLED=1`. No
utiliza una base test/development para enviar. Antes de activación real, C40–C41
deben verificar dominio remitente, permisos del proveedor, destinatarios controlados,
custodia de secretos, bajas, monitorización y autorización operativa. No se han
configurado cuentas/domínios, utilizado credenciales reales ni enviado correos
externos durante el desarrollo: el adaptador se prueba con HTTP simulado.

## Entrega y recuperación

Las tareas tienen clave natural centro/tipo/evento y una versión de destinatario.
El escaneo prepara hasta25avisos de cada clase por centro; cada despertar visita
hasta4centros y despacha hasta10tareas por centro. La llamada de transporte queda
fuera de la transacción SQL de claim. Un lease de90s evita dos despachos simultáneos.

Una captura idempotente puede repetirse con la misma clave después de perder el ack:
solo queda un mensaje. Un proveedor sin garantía de idempotencia no se reenvía al
caducar un lease en estado `sending`: pasa a `uncertain`. También quedan así un
timeout, una respuesta ilegible o un error cuyo resultado de aceptación sea ambiguo.
El operador debe conciliar antes de decidir otra acción; el botón de reintentos no
incluye esos casos. Se evita afirmar una entrega exactamente una vez universal.

Un rechazo explícito de rate limit se reintenta con backoff30s…32min, hasta8intentos.
Un rechazo definitivo se bloquea. Plataforma puede reencolar hasta25bloqueados por
comando idempotente y auditado; la autorización y necesidad se vuelven a comprobar.
Un resultado `sent` significa aceptación/encolado por el proveedor, no prueba de
lectura o llegada a bandeja de entrada. No se registra el payload privado de errores.

Persisten límites para C40: limpieza/retención de desafíos expirados y registros,
conciliación operativa de estados inciertos, métricas y alertas. Un envío ya aceptado
por un proveedor no puede retirarse al cambiar una preferencia después del despacho.
