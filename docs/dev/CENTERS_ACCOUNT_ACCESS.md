# C60 · DNI/NIE único para acceso y recuperación

Estado vigente desde la petición del20octubre2026. Sustituye el usuario privado propuesto en C59. En instalaciones con centros no se crea ni se solicita nombre de usuario: DNI/NIE y contraseña identifican la cuenta. Se conservan UID internos, nombres/apellidos obligatorios y repetibles, correo opcional de contacto, passkeys desactivadas y registro→pendiente→vinculación aprobada.

## Identidad y unicidad

Se valida DNI español o NIE con su letra de control. Trim, mayúsculas y eliminación de puntos/espacios/guiones hacen equivalentes las variantes del mismo documento. La unicidad es global para TODA la instalación, no por centro ni por estado de activación: otra alta con el mismo documento devuelve409 document-taken y orienta a recuperar la cuenta. Incluye cuentas deshabilitadas/rechazadas mientras existan. Una cuenta puede solicitar acceso en otro centro con su mismo DNI sin crear otra identidad. Si aporta DNI diferente al suyo, se rechaza la solicitud.

El UID aleatorio sigue siendo la relación estable con state-UID.json y las fichas SQL. Se guarda documentKey en credenciales como índice ciego HMAC-SHA256, con prefijo de dominio versionado y clave aleatoria independiente document-secret (0600). NO se guarda el DNI en claro, hash público fácilmente enumerable, nombre de usuario ni documento en S/exportaciones personales/SessionUser/directorios. Los datos de DNI de la ficha y solicitud siguen en SQL protegido. GET propio account/password devuelve solo documentSet/documentRequired y datos propios anteriores; no entrega DNI ni índice. La clave de documento no cambia al rotar la clave de sesión.

La API de cuentas JSON conserva su arquitectura de un solo escritor. Reservas por índice durante operaciones asíncronas impiden registros concurrentes; se revalidan claims al consumir códigos/asignar identidad. Cambios de correo respetan reservas y errores de correo no se atribuyen al DNI. No ejecutar varias réplicas escritoras sobre db.json: una futura migración de credenciales a SQL requeriría índice UNIQUE transaccional en esa nueva fuente. No se añade SQL schema ni nueva base en esta entrega.

## Acceso y recuperación

Config document_login:true, password_login:true y passkeys:false. Login por documento válido normalizado; ni nombre público, ni correo, ni antiguo usuario sirven para iniciar sesión en modo centros. Campo nationalDocument preferido en API; identifier/name aceptan el DNI como alias de compatibilidad del contrato HTTP, no nombres de personas.

Recuperar mi cuenta exige DNI/NIE + código del responsable + nueva contraseña repetida. El DNI solo NO autoriza recuperar ni activar. Código de uso único30min, hash en credenciales, emisión invalida código/contraseña/sesiones anteriores. Responsable verifica identidad desde ficha vinculada; autorización vigente, RLS, locks cuenta→centro, auditoría y límites5emisiones actor-cuenta/hora de C59 conservados. No se permite recuperar personal de otros centros por un responsable. Plataforma puede personal no administrador; administradores y superadmin requieren propietario de instalación.

Los códigos para cuentas ya identificadas solo se canjean con su documento exacto. Para cuentas antiguas sin identidad, el código demuestra posesión y permite reclamar un documento disponible que coincida con sus documentos SQL conocidos, si existen. Se revalida unicidad después del hash y no se permite que dos códigos simultáneos asignen el mismo documento. Con una sesión válida y contraseña actual también existe POST /api/account/document para completar DNI ausente; no permite modificar un DNI ya configurado ni reclamar el ajeno. Ajustes muestra Configurado/Sin configurar, sin documentos públicos. Estas acciones de seguridad siguen disponibles pendientes de activación/renovación, sin acceso adicional a entrenamiento.

## Adaptación de cuentas existentes

Inicialización perezosa antes de autenticación, alta o consulta de credenciales: consulta solo los documentos SQL propios de cada cuenta mediante su contexto RLS. Asigna índice si tiene un único DNI válido y ninguna otra cuenta lo reclama. Elimina el antiguo atributo username de credenciales. No cambia UID, hashes de contraseña, roles, vínculos ni archivos personales.

Documento ausente, varios documentos para una cuenta o documento compartido por varias cuentas: NO se inventan valores, fusionan historiales ni elige un propietario por nombre. Las identidades ambiguas no se asignan automáticamente y quedan reservadas contra nuevas altas. El responsable revisa el caso y emite recuperación para la cuenta correcta. Cuando se asigna el documento a una, la otra no puede reclamarlo ni entrar con él. Las reservas consideran las cuentas que aún existen. Una ficha importada sin cuenta no ocupa por sí sola una identidad de acceso: ese socio podrá registrarse y esperar aprobación.

Las sesiones existentes conservan sus UID. Quien tenga contraseña y sesión puede completar documento ausente en Ajustes. Quien haya perdido sesión o solo tenga passkey requiere recuperación asistida. Para cuentas protegidas se conserva scripts/recover-account.mjs: API detenida, backup previo, argumento --api-stopped y --uid; genera código temporal, conserva UID/historial y el socio introduce SU DNI y nueva contraseña en el formulario. La utilidad no asigna DNI ni genera usuarios.

Si SQL no está disponible, inicialización devuelve503 y no permite altas/login sin comprobar la identidad. No impide arrancar health. La inicialización se reintenta al recuperarse SQL. Cambios administrativos de documento en fichas SQL no reescriben automáticamente una identidad de acceso ya establecida; las rectificaciones requieren revisión explícita.

## Operación y verificación

Respaldar DATA completo junto a SQL, incluyendo document-secret. Con índices existentes, la API rechaza arrancar si falta la clave de documento en vez de regenerarla y dejar inaccesibles las cuentas. Restaurar esa clave con db.json; no es intercambiable con secret de sesiones. No imprimir claves, documentos completos, contraseñas ni códigos en informes o auditoría. SQL y JSON no forman transacción distribuida: emisión autorizada que no termine exige revisar/reemitir, sin reintentos automáticos ambiguos.

Sin envío automático de correo/SMS/WhatsApp. Compatibilidad clásica SIN centros conserva sus flujos anteriores. UI nueva con i18n español y fallback inglés para los otros17packs, controles existentes y estética de la app.

Pruebas y evidencia en CENTERS_PROGRESS.md. Vista visual local5183/__account-access actualizada; no realiza escrituras. No se ha publicado la preview externa ni cambiado sus datos/credenciales en esta tarea. La publicación exige preparar la adaptación real de cuentas sin DNI o con conflictos y respaldar la clave de identidad; ninguna prueba se ejecuta sobre esa base persistente.

## Publicación posterior autorizada (20octubre2026)
API y WEB actualizadas en el enlace externo de preview tras backup DATA+SQL. Sesiones abiertas conservadas; importación lazy comprobada desde Ajustes. El párrafo anterior describe el estado al cerrar la implementación local. Las cuentas sin DNI deben completarlo desde su sesión o mediante recuperación asistida; no se asignan documentos inventados. Respaldada también la nueva document-secret junto a credenciales.
