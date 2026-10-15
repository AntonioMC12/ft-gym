# C34 — Clases y reservas

Desarrollo inicial en schema026, con salas en schema030/031 y profesores en schema032/033, rama `codex/centers-module`. C34 permanece en progreso hasta completar su evidencia y revisión visual permitida. No hay activación comercial ni operaciones sobre datos reales.

## Alcance de esta entrega

Clases individuales programadas, aforo, lista de espera FIFO, reserva/cancelación propia, cancelación administrativa de una clase futura y registro explícito de asistencia/ausencia. Se reutilizan PostgreSQL/RLS, permisos por centro, transacciones/idempotencia y React/UI actuales. No hay servicio, framework, almacén de identidad ni contabilidad nuevos.

No se incorporan series recurrentes, catálogo de salas, avisos externos de clase, corrección posterior de hechos terminales ni penalizaciones económicas. La lista administrativa de reservas requiere gestión: un entrenador puede leer horarios y contadores, sin obtener el listado de socios de la clase. Estas limitaciones deben permanecer visibles al aceptar el alcance; no se anuncia el CU completo por haber implementado su núcleo de reservas.

## Condiciones explícitas

- Crear exige un centro activo, nombre, fecha, horas, aforo1..1000, lista de espera0..1000, preaviso de cancelación0..10080minutos y1..50cuotas admitidas del catálogo de ese centro. Ninguna cifra comercial se precarga. Cero significa sin lista de espera o cancelación hasta el comienzo, según el campo correspondiente.
- La fecha y las horas pertenecen a la zona IANA del centro. Se almacenan instantes y zona de la clase para no depender de la zona del dispositivo ni de cambios posteriores del centro. Horas inexistentes por cambio horario se rechazan. Para horas repetidas, el usuario elige explícitamente primera/segunda aparición, por separado para inicio y fin; no se adivina la intención.
- Clase dentro del mismo día civil, con cierre24:00 permitido. Máximo12horas civiles/13horas absolutas. Cambiar horario, capacidad o cuotas de una clase ya creada requiere cancelar y crear otra; no se reduce aforo por debajo de reservas existentes ni se altera una reserva silenciosamente.
- Una reserva exige cuenta vinculada y afiliación/contrato válidos para la fecha civil de la clase, no solo para el momento de pulsar el botón. Se proyectan congelaciones y bajas programadas y se comprueba que una suscripción no cancelada cubra ese día y pertenezca a una cuota admitida. El archivo personal de entrenamiento nunca interviene.
- Una cuenta solo puede tener una reserva activa por socio/clase. Solicitar con otra clave no concede otra plaza. Repetir la clave original devuelve el estado actual, incluso cancelado: no resucita la reserva original.
- El centro debe estar activo para nuevas reservas y cancelaciones propias. Los reintentos de una cancelación ya guardada pueden recuperar su estado en centro inactivo. La plataforma/responsable puede cancelar clases futuras en centro inactivo para liberar compromisos.

## Aforo, espera y autoridad

`classes` contiene contadores protegidos y límites; `class_plans` vincula únicamente cuotas del mismo centro; `class_reservations` conserva el orden y los estados. FKs compuestas, índice de reserva activa y checks de capacidad complementan la autorización de servidor. El runtime no puede editar contadores ni borrar historia.

El trigger toma el lock de centro y la fila de clase antes de reservar; asigna plaza si queda aforo, lista de espera si queda cupo, o rechaza. Contadores y reserva se guardan juntos y revierten si falla unicidad, auditoría o cualquier otra operación. El orden FIFO se genera en SQL y no procede del navegador.

La cancelación propia usa una función SQL estrecha: comprueba centro seleccionado, actor, vínculo actual, versión, estado y plazo, cancela y examina la espera por orden. Revalida afiliación/cuota a fecha de clase y vínculo de cada candidato: los que ya no cumplen pasan a `ineligible` y se promueve el primer elegible. Todo ocurre en la misma transacción. El usuario que libera una plaza no recibe nombres, contactos o resultados de otros candidatos.

Las funciones internas tienen `search_path=pg_catalog`, EXECUTE público revocado y políticas de propietario limitadas al centro seleccionado; no se concede BYPASSRLS ni lectura de contratos ajenos al runtime de socios. SQL `class_eligible` conserva derechos de invocador: el miembro normal solo evalúa lo visible por sus políticas. Los roles actuales se comprueban de nuevo dentro del orden de locks existente.

Cancelar una clase futura termina todas sus reservas activas sin promover la espera y deja aforo/espera en cero. Se conserva motivo e historia. No genera devoluciones, cargos, invitaciones ni avisos externos automáticos.

## Asistencia

Solo una reserva `booked` puede pasar a `attended` después del comienzo o a `no-show` después del final, según reloj SQL. Son hechos terminales auditados e idempotentes. El registro histórico puede realizarse en centro inactivo con autoridad vigente.

Asistir a una clase no se deduce de un QR de entrada al centro. Registrar asistencia tampoco concede acceso a la puerta ni anula bloqueos de C31. Una ausencia no produce recargos, sanciones, suspensión ni cambios de deuda.

## Interfaz e integración

Pestaña Clases en la ficha del centro para `classes.read`; crear, ver reservas y registrar asistencia requieren `classes.manage`. En Mi centro solo se muestran horarios/contadores, elegibilidad y la reserva de la cuenta actual. La API no acepta un memberId para reservar o consultar por otra persona, incluso cuando el solicitante además tiene un rol administrativo.

Se reutilizan Section/Row, Button, NumberField, Check, SelectRow, TextArea, TextField, TimeField, confirmSheet, guard de navegación y useAutoMore. El selector de cuotas usa datos paginados reales. Campos de aforo/espera/preaviso empiezan vacíos; se explican acciones bloqueadas por plan, aforo o plazo. El calendario se presenta en zona del centro, no del dispositivo.

Listas de clases:30filas, filtros civiles acotados a93días y cursor ascendente por instante/id. Reservas administrativas:50filas por orden FIFO, nombres/números y hechos de reserva, sin email, teléfono ni documento. Los cursores se ligan a actor, centro y vista/clase; una paginación no limita el tamaño total de la lista. Las fechas efectivas devueltas por el servidor se conservan al pedir otra página.

Solicitudes, confirmaciones y cargas de otro centro/cuenta/capacidad se descartan. Cambiar entre horario/listado de reservas/editor retira los datos de la vista anterior antes de renderizar la siguiente. Las cuotas y los intervalos utilizan controles de la aplicación; no se introduce el picker horario nativo rechazado por el usuario.

## Rutas y pruebas

OpenAPI documenta GET `/api/centers/classes`, `/own/classes`, `/classes/roster`; POST `/classes/create`, `/classes/cancel`, `/classes/attendance`, `/own/classes/reserve` y `/own/classes/cancel`, bajo el prefijo `/api/centers`. Se mantienen cookies/CSRF, sesión vigente y allowlist de plataforma; `user.admin` no concede gestión.

Pruebas cubren última plaza concurrente, cola FIFO, baja futura de un candidato, replay que no recrea reservas canceladas, privacidad/roles/centro/CSRF, contadores protegidos, registro de ausencia/asistencia, listas de32clases y51reservas, calendario/DST y cambios de contexto UI. Para probar hechos después de la clase sin sleeps ni reescribir fechas existentes se insertan filas ficticias pasadas en la base Compose explícita y marcada `test`; el bypass de triggers se limita a esa transacción de siembra y no afecta las operaciones que se verifican.

El simulacro de restauración conserva clase, contador y reserva propia no vacíos y comprueba replay después de recuperar JSON+SQL. Consultar resultados finales y bloqueos visuales en `CENTERS_PROGRESS.md`; build/tests no acreditan por sí solos el resultado visual.

## Salas opcionales (schema030/031)

Crear una clase permite indicar sala (texto1..120, opcional, sin controles). Las clases existentes o sin sala conservan el comportamiento anterior y sus hashes de idempotencia; no se les asigna una sala ficticia ni se infiere una capacidad física. Se mantiene la etiqueta original y una clave SQL normaliza mayúsculas y espacios para comparar dentro del centro. No es un catálogo de instalaciones ni asignación de profesor.

Una misma sala del mismo centro no admite dos clases programadas con intervalos que se solapen. Se comparan instantes, por lo que se conserva el tratamiento de zonas/DST. El intervalo es [inicio,fin): se admite una clase que empieza justo al terminar la anterior. Otras salas y otros centros son independientes. Cancelar una clase libera su intervalo; cambiar sala exige cancelar/recrear, igual que cambiar horas y condiciones.

El servidor serializa creaciones con el lock de centro existente. Un trigger SQL adicional comprueba el solapamiento y devuelve una restricción nombrada, traducida por HTTP a409 class-room-conflict y por i18n a un mensaje específico. Se conserva RLS, sin extensión ni privilegio de escritura general: el permiso nuevo permite exclusivamente INSERT(room), no UPDATE(room). La prueba concurrente exige un éxito y un conflicto, no dos altas ni un error genérico.

La sala aparece en horarios propios, gestión y cabecera de reservas. El editor reutiliza TextField y protección de formulario; un conflicto conserva los datos para corregir/reintentar. Se prueba texto HTML inerte, envío del campo, fechas adyacentes, solapamiento parcial, cancelación/liberación y separación entre centros. Restore conserva una sala no vacía. C34 permanece in_progress por revisión visual y el resto del alcance documentado.

## Profesor opcional (schema032/033)

La clase puede referenciar una asignación vigente de responsable o entrenador del mismo centro. El selector usa GET /api/centers/classes/instructors, paginación real de50roles por página y cursores ligados a actor/centro. Solo classes.manage/plataforma; los socios y entrenadores sin gestión no obtienen el directorio. La respuesta contiene id de asignación, nombre y rol, sin IDs de cuenta/contactos/credenciales ni acceso al directorio global de plataforma. Se omiten cuentas deshabilitadas; una página filtrada puede estar vacía y conservar nextCursor.

Crear acepta instructorAssignmentId, nunca un nombre o uid declarado por el cliente. Bajo locks JSON de actor/profesor y luego lock SQL del centro se revalida cuenta existente/habilitada y asignación. La vigencia debe empezar ya y cubrir el final de la clase. La FK compuesta impide asignaciones de otro centro; el trigger bloquea la fila de rol antes de decidir con clock_timestamp. Se guarda nombre histórico y uid interno para comparar horarios; las proyecciones públicas de clase solo exponen instructorName.

No puede haber dos clases programadas que se solapen para la misma cuenta dentro del centro, aunque se usen dos roles diferentes de esa cuenta. Se admiten horas contiguas; la cancelación libera el horario. No se afirma exclusión global entre distintos centros: sus horarios y permisos siguen separados. Profesor y nombre histórico son inmutables, como horario y sala. Una edición del nombre de cuenta o revocación posterior no reescribe la historia ni cancela silenciosamente clases: el responsable debe revisar las futuras afectadas y cancelarlas/recrearlas cuando corresponda. No se dan permisos de gestión o acceso a datos de socios por ser profesor.

La comprobación inicial de la032 detectó que SELECT FOR SHARE sobre una asignación de responsable aplica políticas de escritura del invocador y la oculta al gestor. La033 encierra ese lock en el trigger SECURITY DEFINER con centro seleccionado/capacidad de gestión explícitos, search_path fijo y EXECUTE público revocado. No se ampliaron los permisos del runtime para editar responsables ni se modificó una migración ya aplicada en CI.

El editor reutiliza SelectRow con búsqueda de opciones cargadas, carga de más páginas, estados vacíos/error/reintento y ausencia explícita de profesor. Un fallo del directorio no impide crear una clase sin profesor. Cambio de centro/cuenta desmonta el editor y descarta respuestas antiguas; no muestra personal del contexto anterior. Campos opcionales ausentes/vacíos preservan hashes anteriores. Repetir una creación ya confirmada conserva la clase y su nombre histórico aunque después cambie la vigencia o se deshabilite la cuenta.
