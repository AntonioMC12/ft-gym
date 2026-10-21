# Estudio: planes y carpetas como un único sistema de rutinas

Fecha: 17 de octubre de 2026. Documento histórico del análisis previo. La implementación autorizada posteriormente se registra como C53 en CENTERS_PROGRESS.md.

Decisión final: trainingPlans es un mapa `{ id: { name } }` integrado en PER_KEY cliente/servidor, en lugar del array sugerido abajo, para reutilizar las marcas por clave y los borrados existentes. El grupo sin plan se presenta como «Sin carpeta». No se añade migración SQL. El resto de esta nota conserva la propuesta previa, no el estado operativo actual.

## Alcance y conclusión

La petición vigente es estudiar cómo incorporar carpetas reutilizando los planes existentes. El texto adjunto describe una implementación más amplia (Empezar, administración/asignaciones, rangos y placeholders); aquí se analiza su encaje, sin ejecutar esa implementación.

Decisión recomendada: **un plan es la carpeta contenedora de rutinas**. Mostrar «Planes» y «Nuevo plan», con icono de carpeta y contador de rutinas. No crear colecciones paralelas «carpetas» y «planes», ni mantener dos editores o dos sistemas de asignación. «Sin plan» agrupa las rutinas no clasificadas y no se almacena como plan ficticio. Un único nivel, sin subcarpetas. El plan organiza; no concede acceso ni cambia automáticamente el calendario.

Existe ya un formato reutilizable de plan, pero no una biblioteca persistente de varios planes con nombre. Se añade organización sobre los datos actuales, sin convertir de golpe la programación personal en otro modelo ni migrar entrenamientos a PostgreSQL.

## Evidencia en el código

- frontend/src/views/Plan.jsx: dos vistas, programación y rutinas; no CRUD de planes/carpetas. La rotación usa una definición y una cola actuales, no un catálogo de planes.
- frontend/src/store/useStore.js: S.routines, S.week, S.dayPlan, S.rotation y S.queue. No existe una colección de carpetas de entrenamiento.
- frontend/src/lib/plan-share.js: buildPlanBundle, parsePlan y mergePlan; formato opengym_plan:1 con name, routines, week, unit y customEx. Exporta un conjunto y, al importar, incorpora rutinas con IDs nuevos.
- frontend/src/lib/plan-delivery.js: aceptación con deliveryKey y mapa de IDs estable, protección de borrados y aplicación idempotente. No debe sustituirse por escritura directa del estado ajeno.
- api/centers/domain/training-plan.js: contrato estricto del mismo bundle, límites de tamaño/rutinas/ejercicios y campos permitidos; ya incluye repsMin/repsMax, pero no valida por sí solo todo el comportamiento de rangos solicitado.
- api/centers/services/training-proposals.js: propuesta/versionado/retirada/aceptación de entrenamiento por centro; autorización training.assign, destinatario vinculado y activo. Sus versiones son instantáneas, no referencias vivas a las rutinas del entrenador.
- frontend/src/views/centers/TrainingProposals.jsx: selecciona rutinas del estado del autor, construye el bundle y filtra el calendario para las seleccionadas.
- frontend/src/lib/sync-merge.js y routines.js: marcas por entidad, borrados, orden, reset, restauración y Undo; cualquier metadato nuevo debe participar en estos mecanismos.
- frontend/src/views/Home.jsx: effectiveRoutines/effectiveRoutineIds resuelven la recomendación del día; startFlow recibe IDs. Agrupar rutinas no debe sustituir esa resolución.

## Modelo propuesto, sin duplicar rutinas

Extensión aditiva del estado de entrenamiento del propietario:

```js
S.trainingPlans = [{ id: 'tp_…', name: 'Fuerza', _ts: /* marca de edición */ }]
S.routines = [{ id: 'r_…', name: 'Torso', planId: 'tp_…', ex: [/* existentes */] }]
```

- La rutina sigue siendo una única entidad en S.routines, con su ID, editor, ejercicios e historial actuales. No incrustarla ni copiarla dentro del plan al organizar.
- Una rutina pertenece a un plan o a ninguno. No guardar también routineIds en el plan: la relación tendría dos fuentes y podría divergir. Mantener el orden actual de rutinas, filtrado por plan; no añadir otro sistema de ordenación sin necesidad.
- No usar el nombre como clave: renombrar no rompe referencias.
- Mover una rutina cambia planId y su marca de edición; no cambia IDs, historial, programación, cola ni asignaciones aceptadas.
- Eliminar un plan conserva las rutinas, que pasan a Sin plan. La confirmación explica ese efecto. Nunca ejecutar deleteRoutine como efecto de eliminar el contenedor.
- Eliminar una rutina sigue usando el helper existente. Restaurar/duplicar debe preservar o normalizar planId de forma explícita; si el plan ya no existe, la rutina vuelve a Sin plan.
- El calendario efectivo sigue siendo S.week/dayPlan/rotation/queue. No copiarlo a cada carpeta ni activar otro calendario al consultar/mover un plan. Programar un conjunto reutilizará las acciones existentes de programación; no debe ocurrir por pulsar su card.

## Persistencia, sincronización y compatibilidad

El nombre de un plan y la clasificación de rutinas son datos personales de entrenamiento, no permisos; permanecen en state-<uid>.json mediante el flujo actual de S. Las autorizaciones y asignaciones de centros permanecen en PostgreSQL. Esto conserva la frontera de AGENTS.md.

Compatibilidad: ausencia de trainingPlans equivale a lista vacía; ausencia/ID desconocido de planId equivale a Sin plan. No crear automáticamente «Mi plan» ni cambiar el calendario de usuarios existentes.

La implementación debe cubrir normalización de estado, guardado API, copias/importaciones completas, merge entre dispositivos, marcas de borrado y reset. Añadir planes a los conjuntos de entidades sincronizadas y resolver sus tombstones antes de normalizar referencias. Un dispositivo atrasado no debe resucitar un plan borrado ni mover de nuevo sus rutinas. Probar renombrar/mover frente a borrado, Undo y restauración. No basta añadir un array a Zustand.

El formato compartido opengym_plan:1 puede conservarse para exportar/proponer un plan individual: filtrar las rutinas del contenedor, usar su nombre y filtrar week a esos IDs, reutilizando buildPlanBundle. planId no debe viajar como permiso ni aceptar referencias a planes del destinatario. Exportar todo el perfil sigue siendo distinto de exportar un plan.

Al recibir un plan aceptado, se puede crear el contenedor usando la identidad estable de la entrega y su nombre; asociar solo los IDs remapeados por el servidor. La reentrega no duplica carpeta ni rutinas y no resucita lo borrado. Conservar el mecanismo planDeliveries/ack; ampliar su representación solo si las pruebas muestran que hace falta, no usarlo como nuevo catálogo.

## Asignaciones y permisos: lo disponible y lo que falta

Reutilizar el flujo de propuestas y sus snapshots. «Asignar plan» selecciona las rutinas del plan y ofrece un único conjunto; seleccionar rutinas sueltas sigue siendo válido. Eliminar/renombrar/mover el plan del autor no cambia una propuesta ya enviada o aceptada. Editar la fuente tampoco actualiza silenciosamente al socio: se necesita una nueva versión y el proceso actual de aceptación.

La carpeta es organización, no una segunda asignación. La deduplicación debe apoyarse en destinatario, identidad de origen/versión y petición idempotente; no en nombres. Hoy la idempotencia de la petición y la entrega existe, pero no hay una identidad persistente de catálogo origen que impida ofrecer lo mismo mediante peticiones distintas. Hará falta registrar esa referencia en la asignación si se exige ese criterio; no anunciarlo como resuelto con el mapa actual de IDs.

El sistema actual exige centro, socio activo, cuenta vinculada y aceptación. **No cubre asignar directamente a cualquier usuario no socio ni imponer modificaciones en su estado personal.** Para ese requisito habrá que ampliar explícitamente el ámbito de destinatarios y la autorización del servidor, sin forzar un memberId ficticio, usar user.admin como superadmin ni escribir el JSON de otro usuario desde gestión. Esa ampliación puede reutilizar el bundle y la entrega, aunque necesite relaciones/endpoints de destinatarios nuevos.

La card de superadmin debe usar la identidad de plataforma actual y abrir esta misma biblioteca del propietario, con el editor existente. No debe hacerse pública la biblioteca privada del administrador para que los socios obtengan acceso por URL. Las operaciones sobre estado personal conservan su dueño; las ofertas/asignaciones se autorizan en backend por sus capacidades reales.

Si «solo rutinas asignadas» significa prohibir incluso crear/ejecutar rutinas personales que hoy son válidas, eso es un cambio de política adicional: un filtro en Home no lo garantiza porque el usuario puede editar su propio estado. Requeriría un catálogo y permisos autoritativos en servidor, validación de inicio/guardado y compatibilidad explícita con entrenamiento personal. Para el requisito de evitar leer rutinas de otras cuentas, conservar el aislamiento existente por sesión/UID y comprobarlo con peticiones manipuladas.

## Recorrido visual

1. Superadmin: Inicio → Rutinas. Misma biblioteca de Plan, sin duplicar pantallas de mantenimiento.
2. Cabecera con búsqueda, Nuevo plan y Nueva rutina; cards de planes con nombre/contador y grupo Sin plan.
3. Abrir plan muestra breadcrumb, nombre, rutinas y acciones de renombrar/eliminar/asignar. Eliminar explica que conserva rutinas.
4. Crear/editar rutina abre el editor actual; Organizar/Mover selecciona un plan o Sin plan. En móvil, selector/sheet existente; no depender de drag-and-drop.
5. La vista de programación conserva su nombre y controles para distinguir «organizar rutinas» de «elegir qué entrenar hoy». Empezar reutiliza la recomendación actual, destaca la de hoy y permite elegir otra elegible sin cambiar la programación.

Usar componentes existentes, tokens, objetivos táctiles y estados vacíos. Crear plan vacío es válido; asignarlo sin rutinas no lo es y debe explicarse.

## Relación con el resto del texto adjunto

- Empezar: seleccionar IDs reales con startFlow, conservar la sesión en curso y registrar la rutina elegida. No modificar week/dayPlan para una elección de una sola sesión.
- Rangos: ya hay repsMin/repsMax en bundle/exportación y progreso. Revisar configuración y validación coherente antes de introducir otro tipo o campos paralelos; comprobar interacción con progresiones/pirámides.
- Placeholders: session-start.js puede abrir con datos del plan o del historial como valores reales. La nueva petición exige separar objetivo/referencia de valores realizados; no se obtiene cambiando solo el atributo placeholder. Debe abordarse como cambio propio, con pruebas de guardado vacío, edición de histórico y prioridad del último registro válido.

Estas piezas reutilizan los planes/rutinas, pero no son requisitos para guardar un contenedor vacío. Implementarlas por recorridos completos y no mezclar la fase de organización con cambios económicos/centros ajenos.

## Secuencia de implementación propuesta

1. Modelo único de planes, helpers y compatibilidad/sync/Undo; CRUD de organización sobre las rutinas existentes.
2. Biblioteca y acceso de superadmin, editor actual y exportación de un plan usando el bundle existente.
3. Ofrecer plan/rutinas y consultar asignaciones reutilizando las entregas actuales; añadir identidad de origen para deduplicar. Resolver el ámbito de usuarios no socios antes de ampliar esos endpoints.
4. Empezar y registro independiente de la programación; después completar rangos/referencias del entrenamiento con sus pruebas específicas.

Validación enfocada: guardado/reinicio/dos dispositivos; eliminar contenedor sin perder rutinas, historial o entregas; mover/renombrar sin cambiar IDs; bundle de plan sin rutinas ajenas; recepción idempotente; permisos de autor/destinatario/centro y URLs manipuladas; no alterar sesión/cola/calendario al organizar. La revisión visual real debe quedar separada de las pruebas DOM.

## Resultado de este estudio

No se han editado frontend/backend, levantado servicios, aplicado migraciones ni registrado asignaciones. La biblioteca de planes/carpetas sigue pendiente de implementar. Este documento propone la misma entidad organizadora, reaprovechando el formato y los flujos existentes, y distingue las ampliaciones reales de lo ya disponible.
