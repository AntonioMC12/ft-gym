# C56 — Registro y activación de cuentas

## Uso

1. En el centro, importar el CSV de socios: hasta **1000 registros más la cabecera**, UTF-8 y 2 MiB. Revisar y confirmar la importación como antes. Las fichas siguen sin crear cuentas, contratos ni pagos automáticamente.
2. Abrir **Pendientes de activación** y copiar el enlace de registro del centro. El enlace es compartible; identifica el centro, no una cuenta ni una ficha. No contiene un token de acceso.
3. La persona abre ese enlace y pulsa **Crear cuenta y solicitar acceso**. El registro comienza con contraseña cuando está disponible y permite elegir passkey; no pide código de invitación. El DNI o NIE es obligatorio y se valida también en el servidor, incluida su letra de control. La pantalla explica que solicita acceso y autoriza la vinculación de su ficha. Su sesión queda en «Pendiente de activación por el responsable del centro».
4. El responsable del mismo centro o un superadmin busca la cuenta pendiente, selecciona una ficha existente sin cuenta y pulsa **Vincular y activar**. Si el DNI/NIE coincide de forma única con una ficha del centro, se muestra solo esa ficha para seleccionarla y confirmar. Si no hay coincidencia o es una solicitud antigua sin documento, se muestran cinco fichas y un buscador sobre todas las elegibles. Si hay coincidencias duplicadas o el socio ya tiene cuenta vinculada, se avisa y se impide aprobar hasta revisar/corregir las fichas. La confirmación identifica cuenta y socio por separado. También puede rechazar la solicitud.
5. La sesión existente obtiene acceso al comprobar la activación, volver al navegador o durante la comprobación periódica (30 segundos). No necesita otra invitación ni iniciar sesión de nuevo.

Las cuentas sin vínculo anteriores a este flujo también quedan pendientes. Si no tienen solicitud, pueden abrir el enlace del centro y pulsar **Solicitar activación**. El registro público con centros habilitados exige el enlace del centro; no muestra un directorio público de gimnasios. Una solicitud rechazada no se reabre por reintentar desde el cliente; requiere revisión del responsable.

La ficha de socio y el apartado de cuentas de Gestión de rutinas conducen al mismo sistema de activación. La interfaz deja de crear invitaciones de socios por el flujo antiguo. Se mantienen la aceptación de enlaces ya emitidos y las invitaciones de personal para compatibilidad.

## Fronteras y reglas

- La activación de cuenta y el estado de afiliación son conceptos distintos. Vincular **no activa la afiliación**, no cambia cuotas ni vencimientos, no genera recibos y no registra cobros. Las reglas de acceso por cuota existentes se siguen aplicando.
- Las cuentas ya vinculadas conservan el acceso que les corresponde. El personal vigente, administradores técnicos y superadmin explícitos conservan sus excepciones de acceso a la aplicación; esto no concede nuevas capacidades de gestión de centros.
- La API bloquea los datos privados de una cuenta normal sin vínculo con `403 account-activation-required`, además de ocultar las pantallas. Permanecen accesibles autenticación, cierre de sesión, consulta/solicitud de activación, consulta pública exacta del centro y aceptación de invitaciones existentes.
- Credenciales y `registrationCenterId` permanecen en el almacén de cuentas existente. Solicitudes, permisos y vínculos viven en PostgreSQL, no en el estado personal sincronizado.
- La aprobación usa autorización vigente `members.manage` del centro o plataforma explícita, RLS, locks de centro/cuentas, versiones de solicitud y ficha, comando idempotente y auditoría en una transacción SQL. No puede sustituir una cuenta ya vinculada ni elegir una ficha de otro centro.
- Una solicitud pendiente protege su cuenta frente al borrado mediante `account_references`. Rechazar retira esa referencia; aprobar la sustituye por la referencia de socio. No se afirma atomicidad entre JSON y SQL. En nuevas altas la solicitud y el DNI/NIE se guardan primero en SQL; si esto falla no se publica la cuenta ni se devuelve una sesión exitosa. Un fallo posterior al persistir credenciales puede dejar una solicitud sin cuenta, que aparece no aprobable hasta revisión. El documento no se guarda en db.json, S, exportaciones personales ni respuestas públicas de autenticación.
- El listado de cuentas pendientes tiene búsqueda por nombre/correo y páginas reales de 20. El selector manual de socios usa `unlinked=true`, búsqueda por nombre/número sobre el servidor y máximo cinco resultados, con protección frente a respuestas antiguas y navegación con cambios sin guardar.

## Operación

Schema **047**, migraciones `046_account_activation.sql` y `047_activation_document.sql`. La nueva columna SQL acepta NULL solo para conservar solicitudes antiguas; no modifica documentos importados ni los datos de cuentas existentes. Requiere aplicarla mediante `centers_migrator` antes de arrancar esta versión de API. No reinicializar cuentas, SQL o entrenamiento. El entorno de producción no se ha migrado como parte de C56; únicamente se ha actualizado la preview dedicada marcada `test`, con copia SQL previa y comparación de recuentos.

Endpoints nuevos: `GET /api/centers/join`, `GET /api/centers/activation/status`, `POST /api/centers/activation/request`, `GET /api/centers/activations`, `POST /api/centers/activations/decide`. Registro por contraseña y opciones de passkey requieren `centerId` y `nationalDocument` con centros habilitados; la verificación de passkey conserva el centro en el desafío del servidor. Contrato en `api/openapi.yaml`.

Validación y limitaciones actualizadas en `CENTERS_PROGRESS.md`. La aprobación visual en móvil/escritorio y ambos temas sigue pendiente; las pruebas de componentes y el build no la sustituyen.

Con centros habilitados, `/api/config.invite_only` anuncia la política efectiva `false`, aunque `INVITE_ONLY` siga habilitado para compatibilidad clásica. Las cuentas existentes pueden iniciar sesión sin enlace del centro; una cuenta pendiente entra a su pantalla de espera, sin confundir el bloqueo con un fallo de contraseña. Si una pestaña conserva el formulario antiguo, recargarla para cargar los componentes actuales.
