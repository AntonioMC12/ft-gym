# C29: propuestas de entrenamiento y aceptación personal

Estado: recorrido SQL/HTTP/UI implementado y probado automáticamente; revisión visual pendiente por la denegación guardada del navegador local. C29 depende de C24, no de Stripe ni de SEPA. No habilita la lectura del progreso del socio: eso corresponde a C30 y exige autorización específica.

## Frontera de datos

El centro conserva la propuesta, sus versiones inmutables, el destinatario vinculado y el seguimiento de aceptación en PostgreSQL (migración020). El entrenamiento continúa en `state-<uid>.json`. El entrenador no escribe ese archivo. La aplicación del socio importa una versión aceptada mediante `store.update` y sincroniza por el mecanismo personal existente.

Solo se incorpora al estado personal una marca `planDeliveries`: identificador opaco de entrega, instante de aceptación y lista de identificadores de las rutinas personales. No contiene centro, socio, entrenador, permisos, información económica ni el bundle administrativo. Es procedencia de entrenamiento y nunca prueba de autorización por sí sola.

## Protocolo implementado

1. Staff con `training.assign`, centro activo y socio vinculado propone un bundle compatible con `buildPlanBundle`. El servidor valida y limita su contenido. Primera versión: catálogo existente, sin multimedia ni ejercicios personalizados; una ampliación requerirá su propio contrato.
2. Cada versión recibe una clave opaca `td_<128 bits>` y un mapa estable de rutina de origen a `cr_<128 bits>`. Ambos los crea el servidor una sola vez y se conservan en SQL; nunca los vuelve a generar el cliente en un reintento.
3. El socio consulta y revisa la propuesta desde su área. La API deriva el destinatario de la sesión y del vínculo actual. Aceptar una versión abre una intención persistente y devuelve siempre el mismo contenido, mapa e instante de aceptación a sus dispositivos.
4. El cliente ejecuta `applyPlanDelivery` dentro de `store.update`. Se importan rutinas nuevas sin sobrescribir las actuales ni el entrenamiento en curso. Las unidades se convierten mediante `parsePlan`/`mergePlan`. Cambiar la semana requiere una opción explícita; el calendario por fechas se conserva.
5. El cliente sincroniza el entrenamiento. Un acuse separado comprueba la marca realmente guardada en el estado personal del usuario y su correspondencia con la intención SQL. No basta con que el navegador declare «aplicado». Si falla la red entre ambas operaciones, se puede repetir sin duplicar.
6. Retirar o sustituir una propuesta sin aceptar impide nuevas aceptaciones. Una intención aceptada permite recuperar el proceso interrumpido. Una nueva versión representa otra decisión explícita; nunca fuerza cambios sobre rutinas personales ya modificadas.

## Convergencia implementada

`mergePlan` conserva su comportamiento habitual de importación con IDs nuevos. La opción interna `routineIds` permite a una entrega usar su mapa estable: un destino ya existente no se duplica ni se sobrescribe. `applyPlanDelivery` valida el mapa, rechaza ejercicios desconocidos/personalizados y registra la marca solo tras una aplicación válida.

Las marcas se unen por ID de forma determinista, sanitizadas y limitadas a las 2.000 claves finales en orden lexicográfico. Los duplicados contradictorios se normalizan de manera estable; las versiones SQL tienen una clave de entrega única y su contenido/mapa no admite UPDATE del runtime. No se deben interpretar esas marcas como autoridad para conceder acceso.

Una aceptación tardía de otro dispositivo puede llevar un timestamp posterior al borrado de una rutina. Para las rutinas identificadas por las marcas, un tombstone positivo prevalece incluso frente a ese timestamp posterior. Un Undo/restauración explícitos llevan la marca negativa existente y permiten recuperarla. La misma regla se aplica en la mezcla del frontend y antes del stamping de la API; un cliente antiguo no elimina la procedencia por omitir el campo. El reset explícito elimina las marcas y registra sus IDs para evitar que otro dispositivo las reintroduzca. La retención de marcas y tombstones tiene los límites existentes del perfil, no constituye un historial ilimitado.

## Persistencia, permisos e interfaz

Migración020 aplicada solo a SQL ficticio, inmutable tras aplicarse. Propuestas ligadas al destinatario original; versiones con contenido y mapa inmutables; intenciones y acuses append-only. RLS exige centro seleccionado y rol vigente o destinatario propio. El servicio vuelve a comprobar el vínculo actual incluso con doble rol. Revincular la ficha no entrega propuestas antiguas a la nueva cuenta. La plataforma recibe `training.assign` desde su allowlist explícita, nunca desde `user.admin`.

La validación reutiliza el catálogo generado mediante una función inyectada desde el servidor: centros no importa el runtime del Coach ni replica el catálogo. Falla de forma cerrada si no recibe esa dependencia. Límites:64KiB UTF-8,20rutinas,40ejercicios por rutina,200totales, notas de1.000caracteres; vocabulario completo de prescripciones compatible con `buildPlanBundle`. Los límites numéricos se validan en `domain/training-plan.js`, sin coerción de strings ni descarte silencioso de campos desconocidos.

HTTP documentado en `api/openapi.yaml`: listado/detalle staff y own, propose/revise/withdraw y accept/ack propios. Paginación por versión con cursor ligado a cuenta/centro/filtro. El listado propio incluye versiones antiguas aceptadas cuyo acuse esté pendiente, para recuperar una interrupción aunque haya una versión posterior. Los acuses registran que el perfil contenía la entrega o sus borrados al comprobarlo; no son vigilancia continua ni certificación del entrenamiento realizado.

La lectura para el acuse usa el lector estricto de estado del servidor únicamente para el usuario autenticado, con orden de bloqueo cuenta → centro. Archivo ilegible503; marca incorrecta o destino sin rutina/tombstone409; nunca se inventa una confirmación por fallo de lectura. Una aceptación existente puede terminar tras desactivar centro/afiliación, mientras conserve el vínculo original. Una nueva aceptación exige centro y afiliación activos. Ningún centro puede deshacer una rutina personal ya aceptada.

`TrainingProposals.jsx` se integra en la ficha de socio (incluida la vista operativa del entrenador) y en Mis centros. Reutiliza `MultiSelectRow`, `Section`, `Row`, `TextField`, `Switch`, `Button`, `confirmSheet` y `useAutoMore`. Staff selecciona rutinas propias y ofrece un bundle acotado; el socio revisa versión, ejercicios y prescripciones antes de confirmar. Guardas de vida/cuenta/centro/capacidades descartan acciones antiguas. La opción de semana nace apagada; un reintento no vuelve a imponerla ni sobrescribe ediciones personales. Textos nuevos en18locales. La navegación exterior conserva `navBack`; el detalle interno ofrece vuelta a su listado.

## Verificación y pendiente

Base de convergencia:158 pruebas frontend en9archivos. UI:18pruebas en3archivos, incluidas aceptación explícita, semana opcional, fallo de sync/reintento sin duplicar, cambio de cuenta/centro, respuesta tras desmontaje, recuperación inactiva y revocación de capacidad. SQL/HTTP:5recorridos nuevos, más la suite completa de30. Restauración020 con propuesta aceptada pendiente:1/1 pasa; conserva JSON byte a byte y mapa/instante SQL y permite importar/confirmar después del restore. Sin cuenta externa, cargos ni datos reales.

La comprobación visual sigue pendiente mientras continúe la denegación guardada del navegador al entorno local; no eludirla por otra superficie. Las suites generales y cualquier otra limitación se registran en `CENTERS_PROGRESS.md`. C30 permanece separado: aceptar rutinas no concede acceso a fotos, medidas, historial completo ni progreso personal.
