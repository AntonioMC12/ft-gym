# C31: acceso QR online

Estado: backend, HTTP e interfaz implementados y verificados automáticamente; revisión visual pendiente por denegación guardada del navegador. Migración021 aplicada solo en SQL ficticio; no modificar001–021. No hay integración con un torno o controlador físico.

## Autoridad y política

El QR contiene únicamente un valor opaco `gqr1_…`. No contiene socio, centro, permisos, saldo ni condiciones de entrada. PostgreSQL vincula su hash a centro, miembro y cuenta originales. Caduca a los45segundos del reloj SQL, solo puede consumirse una vez y emitir otro invalida el anterior. Se admiten6emisiones nuevas por minuto/cuenta/centro; un reintento vigente conserva el mismo token e instante de caducidad.

Cada centro necesita una política explícita, desactivada por defecto: exigir contrato vigente, denegar por deuda vencida y días de gracia. La afiliación y el centro deben estar activos siempre. Los horarios son los ya configurados en el centro, en su zona IANA; una configuración vacía o inválida cierra el acceso. Los intervalos incluyen su inicio y excluyen su fin. La repetición de una hora por cambio horario conserva la regla local, mientras que la caducidad del token usa tiempo absoluto.

Los bloqueos manuales son independientes de deuda/contrato. Se crean con motivo y versión actual del socio, y se levantan solo mediante una acción explícita sobre la versión del bloqueo. Registrar un pago, modificar la política económica o emitir otro QR no los borra. No se deshabilita la cuenta personal por estas reglas.

## Recepción y credenciales

El primer flujo conserva los roles actuales: responsable de centro o plataforma explícita, con `access.verify`, además de una credencial de dispositivo vigente para el mismo centro. Un entrenador y un admin técnico no reciben esa capacidad. La credencial por sí sola no sustituye la sesión. Delegar otro rol de recepción requiere ampliar expresamente el modelo de capacidades.

Los dispositivos se registran, rotan o revocan con `access.manage`; máximo50activos no caducados por centro. Claves de30días, revocación irreversible y versión optimista. El servidor deriva tokens/claves con HMAC del secreto de servidor, con separación de dominio por tipo/ID/versión. SQL, auditoría e idempotencia conservan solo hashes/identidades/versiones. Permite recuperar una respuesta perdida sin guardar claves en claro; una petición antigua no recupera una versión sustituida. Si cambia el secreto del servidor, una reproducción que no coincida con el hash falla de forma cerrada; se debe generar otro QR o rotar explícitamente el dispositivo.

Los QR incluyen además una generación aleatoria privada por arranque, que no se conserva en la copia. Al reiniciar o restaurar la API, todo QR anterior sin consumir requiere regeneración: el consumo contrasta el hash con la generación actual. Así una restauración no resucita una captura cuyo consumo pudiera faltar en la copia. Un reintento de escaneo ya registrado sigue devolviendo solo el acuse histórico sin readmisión. Esto respeta el único proceso escritor de la arquitectura actual; un despliegue con múltiples API simultáneas necesitaría coordinar esa generación antes de activarse.

La interfaz mantiene la credencial solo en memoria de la página; recargar exige activarla otra vez y rota la clave anterior del dispositivo. No se guarda en `S`, localStorage, exportaciones ni URL. El cliente envía la clave en `X-Center-Device-Key`, junto a su sesión normal y un cuerpo acotado. No se añade ninguna excepción CSRF.

## Consumo y visitas

La transacción toma el bloqueo de centro existente, revalida capacidad y dispositivo y busca el hash del QR solo en ese centro. Contrasta el vínculo actual de la cuenta y vuelve a calcular centro, afiliación, fechas efectivas, horario, contrato, deuda y bloqueo. La función SQL resuelve los cambios de afiliación en el instante de validación, incluso si una transacción en cola cruza la medianoche local.

Un trigger de visita comprueba las relaciones y elegibilidad y consume el token bajo bloqueo en la misma transacción que visita, escaneo y auditoría. La unicidad del token impide dos visitas por la misma captura. El dispositivo recibe únicamente el resultado y, para la primera admisión, nombre/número operativos para comprobar a la persona. No recibe saldo, motivo del bloqueo ni archivo de entrenamiento.

Repetir una petición con el mismo dispositivo/operador/requestId contrasta su hash y devuelve `admitted:false, replayed:true` y la referencia histórica, nunca una segunda autorización de entrada. Se revalida el dispositivo antes de devolver ese resultado. Un token distinto con la misma clave de petición produce conflicto. Límite120escaneos/minuto/dispositivo, persistente y serializado.

Una visita representa una admisión validada online por recepción. No se deriva de `/api/activity`, no prueba actividad deportiva y no proporciona salidas ni ocupación instantánea. C32 deberá definir sus métricas y denominadores por separado.

## Interfaz y privacidad

Se reutilizan QrCanvas/lean-qr, CameraScan, scanCode, los controles existentes, confirmSheet y useAutoMore. El socio solicita un QR expresamente; se oculta al caducar o al ocultar la página. El plazo de presentación se calcula conservadoramente con remainingMs SQL y un reloj monotónico del navegador, sin confiar en la hora de su dispositivo. No se convierte en una tarjeta estática ni se exporta.

Recepción se integra como pestaña de centros con historial cronológico existente. El escáner se abre solo por una acción del usuario. Cambiar centro/cuenta/capacidades cierra su sheet del navegador y descarta callbacks antiguos. Un reintento de escaneo no se presenta como una nueva entrada. Las visitas se paginan realmente en API; el área propia excluye dispositivo/operador y muestra tiempos en la zona del centro.

## Evidencia y tareas pendientes

- 5pruebas puras de política, horarios, DST, formatos y caducidad.
- 9recorridos SQL/HTTP: opt-in, dos escaneos concurrentes, reproducción sin readmisión, vínculo/roles, rotación/revocación, RLS, reemplazo de captura, límites concurrentes y paridad SQL/JS de horario. Incluye esperar46segundos y rechazar el QR realmente caducado, sin reescribir timestamps ni desactivar triggers. Ledger real con contrato/recibo/pago válidos: deuda evaluada después del vencimiento, pago liquidado y bloqueo manual independiente hasta su retirada expresa. Revocación de rol, cierre tras emisión y cambio efectivo de afiliación a medianoche comprobados. Un reinicio acotado conserva el secreto de sesión y rechaza la captura anterior todavía dentro de sus45segundos; un QR nuevo sí funciona con la misma credencial de dispositivo.
- OpenAPI documenta13rutas y8schemas. Verificación de rutas y empaquetado pasa. Primera compilación UI correcta;38textos nuevos en18locales,2543claves por idioma y1982cadenas fuente presentes.
- UI:42pruebas seleccionadas en6archivos, incluyendo las pantallas padre. QR sin petición automática, plazo monotónico, ocultación en segundo plano, reintento estable, pérdida de contexto/rol, cámara cerrada al cambiar centro, credencial solo en memoria, confirmación de reglas/bloqueos y Atrás cronológico desde recepción a la pestaña anterior.
- Suite SQL completa39/39 y restore021 no vacío1/1. Conserva JSON byte a byte, visita/dispositivo y bloqueo, rechaza capturas del arranque anterior y reintentos sin readmisión, y permite una admisión nueva. General API688:661pass/27fallos previos; frontend5209:5155pass/54fallos previos en los mismos15archivos que C29. Build, locales y rutas pasan. Corregida conexión explícita de traducciones pt-BR para acceso y propuestas; no se mantiene el texto europeo heredado por accidente.
- Pendiente la revisión visual, denegada por preferencia guardada del navegador; no eludirla. La verificación con hardware o infraestructura reales no forma parte de este ensayo local.
- La retención operativa y el uso con infraestructura real corresponden a C40/C41. Una recuperación productiva debe tratar también posibles revocaciones de dispositivos/cuentas posteriores al punto recuperado, antes de reactivar acceso. No se eliminan historiales ni se improvisa validación offline durante este desarrollo.
