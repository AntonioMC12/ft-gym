# C34 — Clases y reservas

Desarrollo inicial en schema026, con salas en schema030/031 y profesores en schema032/033, rectificaciones en034 y series finitas en035, rama `codex/centers-module`. C34 permanece en progreso hasta completar su evidencia y revisión visual permitida. No hay activación comercial ni operaciones sobre datos reales.

## Alcance de esta entrega

Clases individuales programadas, aforo, lista de espera FIFO, reserva/cancelación propia, cancelación administrativa de clases futuras individuales o de una serie revisada y registro/rectificación auditada de asistencia/ausencia. Se reutilizan PostgreSQL/RLS, permisos por centro, transacciones/idempotencia y React/UI actuales. No hay servicio, framework, almacén de identidad ni contabilidad nuevos.

No se incorporan recurrencias infinitas, catálogo de salas, avisos externos de clase ni penalizaciones económicas. La lista administrativa de reservas requiere gestión: un entrenador puede leer horarios y contadores, sin obtener el listado de socios de la clase. Estas limitaciones deben permanecer visibles al aceptar el alcance; no se anuncia el CU completo por haber implementado su núcleo de reservas.

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

## Rectificación de asistencia (schema034)

El registro inicial de attended/no-show sigue siendo terminal e inmutable en class_reservations. La rectificación exige clase terminada, classes.manage vigente o allowlist de plataforma, versión base, revisión efectiva actual, estado opuesto y motivo no vacío de una línea (máximo250, sin controles). También puede corregirse historia de un centro inactivo. No se permite rectificar booked/waiting/canceled/ineligible, ni una asistencia inicial registrada durante una clase aún en curso.

Cada corrección se añade a class_attendance_corrections con revisión consecutiva, transición anterior/nueva, motivo, actor y fecha del servidor. No hay UPDATE/DELETE/TRUNCATE concedidos al runtime. Trigger SECURITY DEFINER con centro/actor explícitos y roles bloqueados antes de decidir con reloj actual; su EXECUTE público está revocado. La transición, contador protegido de plazas efectivas, auditoría e idempotencia forman una única transacción. Si falla la auditoría, también revierten el registro y el contador. No se modifica la reserva original, no se promueve espera después del final y no se crean sanciones, recibos o cobros.

El contador booked sigue incluyendo booked y asistencia efectiva attended, con ajuste±1 al rectificar attended/no-show. La clase ya está cerrada a nuevas reservas; la corrección no habilita otra plaza ni cambia aforo, contratos o acceso QR. Dos revisiones de la misma revisión base se serializan: una gana y la otra debe recargar (version-conflict). Replay del mismo comando no añade historia y devuelve el estado efectivo actual; no sobrescribe una rectificación posterior. Cambiar contenido con la misma clave mantiene idempotency-conflict.

class_reservation_profiles es una vista security_invoker/security_barrier que conserva state base y añade effective_state/attendance_revision mediante una función estrecha autorizada. El socio propio ve estado efectivo/originalState/attendanceRevision, sin motivo ni actor interno. Las tablas de corrección solo son legibles por gestión incluso bajo SQL/RLS de socio; class_attendance_state devuelve únicamente estado/revisión para el dueño actualmente vinculado o gestión en su centro seleccionado. No da acceso a reservas ajenas ni a otra afiliación.

GET classes/attendance/history devuelve a gestión hasta50entradas por página, más recientes primero y cursor ligado a actor/centro/reserva. POST classes/attendance/correct exige confirmación separada en UI. Las rutas mantienen cookies/CSRF y contexto actual. La vista de revisión utiliza Row/SelectRow/TextField/confirmSheet/guard de navegación existentes; muestra hecho original y actual, motivo requerido e historial. Un fallo conserva el formulario y la clave de reintento. Paginar historia no adopta silenciosamente una revisión nueva para guardar; un cambio de motivo/estado invalida confirmaciones abiertas. Respuestas y confirmaciones de otro centro/cuenta se descartan.

Pruebas específicas incluyen53rectificaciones paginadas, bloqueo de campos de autoridad declarados por el cliente, carreras, replay, estado base intacto, RLS propio sin motivos, permisos de edición/borrado rechazados, clase en curso y rollback real de auditoría/contador. El simulacro de restore siembra únicamente un hecho pasado ficticio nuevo en su tmpfs marcado test y guarda una corrección real por API; restaurar mantiene la base original y el historial, y repetir la clave no duplica.

## Revisión de profesor tras cambios de personal

Las proyecciones de gestión y la cabecera de reservas incorporan instructorNeedsReview para clases programadas todavía no terminadas cuando el rol original está revocado/fuera de vigencia, ya no cubre el final, cambia su cuenta o la identidad JSON no existe/está deshabilitada. Se usa una única consulta SQL acotada a la página y el directorio de identidad existente; no hay consultas por cada fila ni un almacén nuevo. Se conserva el nombre histórico y se orienta a revisar/cancelar/recrear la clase, sin cancelar reservas ni asignar sustitutos implícitos. Clases canceladas/terminadas no se marcan. El flag se omite para socios propios y entrenadores sin gestión; la UI también comprueba el modo de gestión.

La revisión de asistencia muestra un estado vacío explícito si aún no hay rectificaciones. Ambas mejoras reutilizan Row, SelectRow y los tokens existentes; no se añade un componente duplicado.

## Series semanales finitas (schema035, C34)

La gestión puede preparar una serie semanal con fecha inicial/final inclusiva, días explícitos y exclusiones de fechas concretas. El horizonte máximo es93días de diferencia y se confirman1..25clases. La revisión devuelve todas las fechas candidatas, incluidas las excluidas o inválidas. No omite conflictos ni desplaza horas inexistentes/ambiguas; reutiliza las reglas de clase y la elección independiente de ocurrencia de inicio/fin. Sala, profesor y tarifas se comprueban por cada fecha mediante consultas acotadas. La zona esperada se envía expresamente y un cambio exige recargar.

preview es una revisión sin escrituras y su hash liga actor/centro/definición/hechos. create exige ese hash más una clave de comando; bajo locks actuales vuelve a revisar y rechaza íntegramente cambios, errores, cero fechas válidas o exceso del límite. No se encadenan peticiones HTTP ni transacciones anidadas: grupo, clases, tarifas, auditoría y clave se confirman juntos. Un fallo en cualquier ocurrencia revierte todo. La pertenencia/posición son inmutables y una restricción diferida exige el total completo; no quedan grupos parciales. Las migraciones previas se conservan.

El grupo conserva definición versionada y zona original; cada clase mantiene sus términos independientes y los flujos existentes de reserva, asistencia y cancelación individual. No hay recurrencia infinita, worker, cuota nueva, sanción ni aviso externo. Repetir una clave completada devuelve el mismo grupo con los estados actuales, incluso en centro inactivo. Modificar horarios/términos en bloque queda fuera de esta entrega. La cancelación revisada de ocurrencias futuras se describe abajo.

Listado de grupos de30con cursor real ligado a actor/centro y detalle completo (máximo25por contrato/SQL). Solo gestión vigente/plataforma acceden a definiciones; el calendario propio mantiene su proyección sin datos administrativos. La UI reutiliza Check, campos, Row/Section y confirmSheet; prepara antes de crear, exige nueva revisión tras cambios y conserva identidad al reintentar una respuesta perdida. Los conflictos DST ofrecen las elecciones existentes. Se descartan revisiones y confirmaciones de contexto obsoleto. Atrás desde reservas vuelve al grupo y desde el grupo al origen real (calendario o listado). La revisión visual permanece pendiente.

## Cancelación conjunta revisada (sin migración adicional)

Desde el grupo se abre una revisión de todas sus ocurrencias: las futuras programadas se cancelarán y las iniciadas/canceladas se conservan. Se muestran cantidades de clases, plazas y espera, sin identificar socios en la revisión. Exige motivo no vacío de una línea (máximo250), confirmación separada y hash de revisión actual. Un cambio de reserva invalida el hash incluso si se conserva el mismo número de plazas/esperas; también queda ligado a actor, centro y grupo. Cambiar el motivo invalida confirmaciones abiertas. Un fallo de red conserva formulario y clave de reintento; un conflicto exige revisar de nuevo conservando el motivo.

Dentro del lock de centro se repite la revisión y se reutiliza cancelScheduledClass, común con la cancelación individual. Todo el lote comparte transacción: clases/reservas activas/contadores/auditorías/clave. Un fallo al final revierte también lo anterior; un nuevo inicio durante la espera o el recorrido no deja un lote parcial. No se promueve espera ni se generan cargos, reembolsos o avisos. Centro inactivo admite liberar compromisos; gestión vigente sigue siendo obligatoria. Cero futuras no ejecuta un comando nuevo, pero el replay completado sigue recuperando el estado actual. Definición de la serie y asistencia pasada intactas.

Las pruebas incluyen cambios de ocupantes con conteos iguales, autoridad por actor, concurrencia/replay, histórico sembrado como hechos ficticios nuevos (sin cambiar fechas existentes), rollback de auditoría y espera real de lock que cruza el inicio. El restore conserva cancelaciones y claves de creación/cancelación, sin recrear clases ni añadir auditorías.

## Reintento de creación individual tras cambios de centro

Una clave de creación completada se valida con la zona original almacenada por la clase y recupera su estado/contadores actuales. Cambiar después la zona del centro o desactivarlo no impide recuperar ese resultado ni crea otra clase. Los hashes anteriores permanecen compatibles; reutilizar la clave con otros términos sigue rechazándose. La gestión actual se reevalúa siempre. Las altas nuevas requieren centro activo y usan su zona actual. El test de restore exige el contador vigente después de reservar, sin confundirlo con la foto de creación.
