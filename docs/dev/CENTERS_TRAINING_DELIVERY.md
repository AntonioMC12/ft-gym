# C29: propuestas de entrenamiento y aceptación personal

Estado: base de convergencia implementada; todavía no hay un flujo de asignación disponible. C29 depende de C24, no de la pasarela Stripe ni de SEPA. No habilita la lectura del progreso del socio: eso corresponde a C30 y exige autorización específica.

## Frontera de datos

El centro conservará la propuesta, sus versiones inmutables, el destinatario vinculado y el seguimiento de aceptación en PostgreSQL. El entrenamiento continúa en `state-<uid>.json`. El entrenador no escribe ese archivo. La aplicación del socio importa una versión aceptada mediante `store.update` y sincroniza por el mecanismo personal existente.

Solo se incorpora al estado personal una marca `planDeliveries`: identificador opaco de entrega, instante de aceptación y lista de identificadores de las rutinas personales. No contiene centro, socio, entrenador, permisos, información económica ni el bundle administrativo. Es procedencia de entrenamiento y nunca prueba de autorización por sí sola.

## Protocolo previsto

1. Staff con `training.assign`, centro activo y socio vinculado propone un bundle compatible con `buildPlanBundle`. El servidor valida y limita su contenido. Primera versión: catálogo existente, sin multimedia ni ejercicios personalizados; una ampliación requerirá su propio contrato.
2. Cada versión recibe una clave opaca `td_<128 bits>` y un mapa estable de rutina de origen a `cr_<128 bits>`. Ambos los crea el servidor una sola vez y se conservan en SQL; nunca los vuelve a generar el cliente en un reintento.
3. El socio consulta y revisa la propuesta desde su área. La API deriva el destinatario de la sesión y del vínculo actual. Aceptar una versión abre una intención persistente y devuelve siempre el mismo contenido, mapa e instante de aceptación a sus dispositivos.
4. El cliente ejecuta `applyPlanDelivery` dentro de `store.update`. Se importan rutinas nuevas sin sobrescribir las actuales ni el entrenamiento en curso. Las unidades se convierten mediante `parsePlan`/`mergePlan`. Cambiar la semana requiere una opción explícita; el calendario por fechas se conserva.
5. El cliente sincroniza el entrenamiento. Un acuse separado comprueba la marca realmente guardada en el estado personal del usuario y su correspondencia con la intención SQL. No basta con que el navegador declare «aplicado». Si falla la red entre ambas operaciones, se puede repetir sin duplicar.
6. Retirar o sustituir una propuesta sin aceptar impide nuevas aceptaciones. Una intención aceptada permite recuperar el proceso interrumpido. Una nueva versión representa otra decisión explícita; nunca fuerza cambios sobre rutinas personales ya modificadas.

## Convergencia implementada

`mergePlan` conserva su comportamiento habitual de importación con IDs nuevos. La opción interna `routineIds` permite a una entrega usar su mapa estable: un destino ya existente no se duplica ni se sobrescribe. `applyPlanDelivery` valida el mapa, rechaza ejercicios desconocidos/personalizados y registra la marca solo tras una aplicación válida.

Las marcas se unen por ID de forma determinista, sanitizadas y limitadas a las 2.000 claves finales en orden lexicográfico. Los duplicados contradictorios se normalizan de manera estable; el contrato SQL pendiente debe impedir que existan versiones legítimas contradictorias. No se deben interpretar esas marcas como autoridad para conceder acceso.

Una aceptación tardía de otro dispositivo puede llevar un timestamp posterior al borrado de una rutina. Para las rutinas identificadas por las marcas, un tombstone positivo prevalece incluso frente a ese timestamp posterior. Un Undo/restauración explícitos llevan la marca negativa existente y permiten recuperarla. La misma regla se aplica en la mezcla del frontend y antes del stamping de la API; un cliente antiguo no elimina la procedencia por omitir el campo. El reset explícito elimina las marcas y registra sus IDs para evitar que otro dispositivo las reintroduzca. La retención de marcas y tombstones tiene los límites existentes del perfil, no constituye un historial ilimitado.

## Trabajo pendiente y verificación

- Validación de bundle en servidor con límites de rutinas, ejercicios, notas y bytes, conservando prescripciones compatibles con la importación actual.
- Nueva migración (sin alterar 001–019): propuestas/versiones, mapa fijo, intenciones y acuses; RLS por centro, rol, socio y destinatario original. Revalidar vínculos/roles, bajas y carreras bajo el bloqueo de centro. Añadir la capacidad necesaria a la allowlist de plataforma sin usar `user.admin`.
- Servicios/rutas/OpenAPI y lectura propia del estado durable para el acuse. Orden de bloqueo cuenta → centro, igual que los vínculos existentes; ningún acceso arbitrario al entrenamiento desde staff.
- Interfaz reutilizando el selector de rutinas, `Section`, `Row`, `Check`, `Button`, `confirmSheet`, guardas de contexto e i18n. Atrás cronológico con `navBack`.
- Pruebas SQL/HTTP reales: aislamiento entre centros, doble rol, revocación, cuenta revinculada, versiones/aceptaciones concurrentes, acuse antes/después de persistencia y reintento tras respuesta perdida. Ensayo de restauración con una propuesta e intención no vacías.
- Comprobación visual pendiente mientras continúe la denegación guardada del navegador al entorno local. No eludirla por otra superficie.

Base verificada: 158 pruebas frontend en nueve archivos (importación, contrato, sincronización y convergencia), más 29 pruebas API de validación/stamping/reset/empaquetado, incluidas tres con servidor real y disco temporal. Las suites generales se registran en `CENTERS_PROGRESS.md` al cerrar el checkpoint.
