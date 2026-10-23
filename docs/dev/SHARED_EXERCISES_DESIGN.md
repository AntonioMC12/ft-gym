# C69 · Ejercicios compartidos del superadmin

Fecha: 23 de octubre de 2026. Estado: estudio y propuesta; implementación pendiente.

## Objetivo y comportamiento

Los ejercicios nuevos creados por el superadmin se publican para todas las cuentas de esta instalación, independientemente del centro. El resto de usuarios conserva la creación de ejercicios privados. Propuesta de etiqueta visible: **FT Training**. El usuario solicita una etiqueta especial, pero todavía no ha fijado su texto.

Mostrar el sello en las filas y tarjetas de biblioteca, selectores y ficha del ejercicio. Añadir un filtro de origen independiente: Todos / FT Training / Catálogo base / Mis ejercicios. Combina con búsqueda, músculo, equipamiento, favoritos y usados. Las sugerencias de ejercicios similares deben respetarlo también. Un filtro explícito FT Training sin resultados muestra un estado vacío; nunca se desactiva automáticamente para mostrar otros orígenes.

Para el superadmin, adaptar la acción a «Crear ejercicio FT Training» y explicar antes de guardar que estará disponible para todos. Los usuarios pueden añadirlos a rutinas, entrenar, registrar pesos y marcarlos como favoritos; solo superadmins vigentes pueden editar el contenido compartido o archivarlo. Pesos, favoritos y configuración personal continúan siendo personales.

## Evidencia del código actual

- `frontend/src/sheets.jsx`, CustomExForm: crea y modifica únicamente S.customEx. No distingue superadmin.
- `frontend/src/lib/exercises.js`: allExercises concatena S.customEx con CATALOGUE. registerCustom reconstruye EXIDX al cargar/cambiar el estado personal. isCustomEx se usa tanto para presentación multimedia como para acciones de edición: habrá que separar esas responsabilidades.
- `frontend/src/views/Library.jsx` y el selector en sheets.jsx: tienen filtros y filas paralelos. MuscleExplorer también usa allExercises.
- `api/server.js`: GET/PUT /api/data leen/escriben state-<uid>.json de la sesión. GET /api/media/{hash} solo sirve archivos del usuario actual.
- `api/media.js`: referencias y limpieza se calculan a partir del estado personal; un archivo compartido no puede depender de esa limpieza ni de la vida de la cuenta creadora.
- `api/centers/authz.js`: isPlatformUser comprueba CENTERS_SUPERADMIN_UIDS en servidor. user.admin y responsable/entrenador de centro no equivalen a superadmin.
- `api/coach/core/library.js`: libraryHas y la biblioteca del Coach son estáticos; server.js también inyecta libraryHas como hasTrainingExercise en centros.
- `frontend/src/lib/plan-share.js`: exporta definiciones utilizadas desde S.customEx. Fuera de la instalación, un ID compartido nuevo no será conocido sin definición portable.
- La migración 050_community_catalog corresponde a insignias de comunidad; no existe allí un catálogo de ejercicios reutilizable.

## Persistencia y API propuestas

Crear un módulo propio de catálogo compartido, separado de S y de useCenters. Para el despliegue actual con un escritor de archivos de entrenamiento, se propone `DATA/shared-exercises.json`, con escritura atómica y copia recuperable, y multimedia en `DATA/shared-exercise-media/`. Así el catálogo de entrenamiento no depende de que el módulo de centros o PostgreSQL estén disponibles. No añadir framework ni ORM. Si se implanta una API con varios escritores, este almacén deberá trasladarse a persistencia transaccional compartida antes de escalar; un lock en memoria no coordina procesos distintos.

Documento versionado con revisión global; entradas con id, metadatos compatibles con el catálogo existente, revisión de entrada, fechas de creación/cambio, autor interno, estado activo/archivado y referencias multimedia. DTO de lectura sin UID ni datos personales del creador. Campo de origen `platform` emitido por el servidor; texto FT Training resuelto mediante i18n, no utilizado como identificador ni como permiso.

Contratos propuestos, a documentar en OpenAPI:

| Operación | Acceso y comportamiento |
| --- | --- |
| GET /api/exercises/shared | Cuentas autenticadas con acceso de aplicación vigente; catálogo y revisión/ETag, soporte 304, capacidad de gestión autoritativa |
| POST /api/exercises/shared | Superadmin: crea y publica una definición validada |
| PATCH /api/exercises/shared/{id} | Superadmin: modifica con revisión esperada; conflicto 409 en edición concurrente |
| POST /api/exercises/shared/{id}/archive | Superadmin: retira de nuevas selecciones sin borrar referencias históricas |
| GET /api/exercises/shared/media/{hash} | Lectores autorizados: solo multimedia referenciada por el catálogo, incluidos registros archivados conservados |

Las mutaciones revalidan sesión y condición de superadmin; nunca confían en campos enviados por cliente ni en capacidades cacheadas. Usar validación de campos/tamaños, protección de origen existente, auditoría e idempotencia para reintentos de creación. Serializar el tramo leer-validar-escribir; comprobar revisión dentro del tramo. Un archivo ilegible produce error recuperable y conserva los datos, no un catálogo vacío seguido de sobrescritura.

La pertenencia a un centro no limita la lectura. El catálogo no debe permitir eludir las reglas generales de acceso a la aplicación. Capacidad propuesta `exercises.manage`, calculada desde isPlatformUser y expuesta por el módulo de catálogo; no depender de cargar el listado administrativo de centros para mostrarla.

## Multimedia

Reutilizar validadores de tipo real, hash, tamaño, miniatura y soporte de vídeo existente. Definir límites del almacén compartido y exposición de errores. Flujo: subir archivo temporal con permiso de superadmin, verificar disponibilidad, publicar referencia; ante fallo no afirmar publicación completa. Limpiar huérfanos temporales con margen, conservando archivos referenciados por cualquier entrada activa o archivada.

Para publicar un ejercicio existente, copiar su vídeo e imagen desde el almacén privado al compartido verificando hashes antes de activar la entrada. No abrir las carpetas privadas a otros usuarios. Borrar/restablecer la cuenta creadora no debe afectar al catálogo. Incluir JSON y multimedia compartidos en backup/restauración de DATA.

En el cliente, incorporar origen/instalación a las claves de caché y resolución de medios; un mismo hash no autoriza a tratar un archivo privado como compartido. Reutilizar la reproducción, miniaturas y estados de carga existentes, separando la fuente del archivo del permiso de editar el ejercicio.

## Integración con el entrenamiento

1. Añadir store reactivo del catálogo compartido fuera de S y un resolver común de ejercicios. allExercises y EXIDX deben integrar catálogo base, compartidos y privados sin duplicados. registerCustom no debe borrar entradas compartidas al cambiar de cuenta.
2. ID estable y separado para nuevas entradas, por ejemplo `ft_<id>`. La procedencia verificada la decide el catálogo recibido del servidor: un customEx importado con ese prefijo o con origin=platform no obtiene sello ni permisos. Resolver colisiones y snapshots de respaldo de forma explícita.
3. Revisar los consumidores de isCustomEx: distinguir origen, soporte multimedia y capacidad de gestionar. El usuario común no ve Editar/Eliminar sobre el original FT Training. El peso/configuración personal del ejercicio se conserva en las estructuras personales existentes.
4. Refrescar el catálogo al iniciar sesión, volver al primer plano y detectar nueva revisión. Cachear únicamente contenido de entrenamiento para uso sin conexión, asociado a instalación; invalidar sesiones/capacidades y respuestas pendientes al salir o cambiar de servidor. Mantener una copia válida ante fallo transitorio, con estado de desactualización. Capacidad de gestión nunca autoriza offline.
5. Antes de recibir el catálogo inicial, una referencia FT no se considera ejercicio inexistente ni se elimina. Tras una carga correcta, conservar metadatos mínimos de ejercicios usados para rutinas/historial/offline y copias portables; no duplicar todo el catálogo en S. Un snapshot personal no reemplaza la definición ni concede el sello verificado al importar en otra instalación.
6. Archivado: oculto en nuevas búsquedas y selecciones, resoluble en rutinas e historial existentes. No eliminar entrenamientos ni sustituir ejercicios automáticamente. Cambios de nombre/descripción conservan ID; un movimiento biomecánicamente distinto debe ser una nueva entrada.
7. Actualizar validadores, biblioteca y contexto del Coach, y hasTrainingExercise de propuestas de centros. Resolver catálogo desde servidor, sin aceptar definiciones arbitrarias del cliente. Separar validez de una referencia histórica de elegibilidad para una nueva prescripción. Mantener presupuestos del Coach y filtros de material.
8. Exportación/importación de planes: incluir definición portable de los compartidos usados y conservar referencias al exportar dentro de la instalación. En otra instalación se importa como ejercicio privado con remapeo, sin sello oficial. Vídeos siguen las reglas explícitas del formato de exportación; un hash aislado no garantiza portabilidad. Revisar también backup personal, impresión, músculos y cambios de ejercicio durante sesión.

## Ejercicios ya creados

Preparar herramienta de publicación selectiva con modo de simulación: listar candidatos customEx de las cuentas superadmin, colisiones de ID/nombre, duplicados y archivos ausentes. Mostrar el resumen antes de publicar; no publicar silenciosamente todo el historial privado del administrador.

Conservar el ID existente siempre que no haya colisión: las referencias personales siguen funcionando. Registrar vínculo entre definición privada original y entrada publicada, sin inferirlo por nombre. En el creador, priorizar la definición compartida y evitar duplicados visuales, conservando temporalmente la copia privada como respaldo. Una limpieza posterior exige comprobar referencias y clientes antiguos para que no reaparezca un duplicado por sincronización. Si hay colisión real, crear mapeo explícito y limitar los cambios a las referencias verificadas; no reescribir indiscriminadamente archivos de otras cuentas.

La publicación de datos existentes se ejecutará únicamente dentro del entorno autorizado, con backup y verificación. Este estudio no ejecuta ninguna migración ni publicación.

## Secuencia de implementación y criterios de aceptación

| Fase C69 | Entregable | Evidencia necesaria |
| --- | --- | --- |
| A | Almacén, contratos, permisos, revisiones y auditoría | Tests HTTP con dos cuentas, rechazo de no superadmin, escritura concurrente, reintento idempotente y recuperación de archivo corrupto |
| B | Multimedia compartida independiente | Usuario distinto reproduce vídeo/miniatura; acceso privado ajeno sigue denegado; limpieza/restablecimiento del creador no borra medios compartidos |
| C | Resolver/store, creación y edición global, offline | Nuevo ejercicio del superadmin aparece en otra cuenta sin copiar su estado; cambio de cuenta/servidor y fallo de carga no mezclan datos ni pierden rutinas |
| D | Sello y filtros en biblioteca/selectores | Origen combinado con músculo/equipo/búsqueda/favoritos; sugerencias respetan filtro; vacío correcto; revisión visual móvil/escritorio, claro/oscuro y teclado |
| E | Centros, Coach, planes portables y archivo | Propuesta aceptada y entrenamiento completo con ejercicio FT; exportar/importar en otra instalación; archivado conserva historial y bloquea nueva selección |
| F | Publicación selectiva y cierre | Simulación repetible sin escrituras, publicación idempotente preservando ID/medios; suites pertinentes, i18n, build y diff check |

En el estudio inicial no se ejecutaron tests funcionales nuevos porque todavía no hay implementación. La comprobación precedente del comportamiento privado se hizo con dos estados ficticios y helpers reales del catálogo; no acredita una solución compartida. La ampliación siguiente añade probes reproducibles sobre el comportamiento actual. No se han consultado ni modificado datos reales, desplegado cambios o añadido dependencias en este estudio.

## Ampliación: auditoría transversal de compatibilidad (23 de octubre)

Petición adicional: comprobar rutinas, historial y el resto de recorridos antes de implementar. Se revisaron consumidores de EXIDX, EXDB, CATALOGUE, allExercises, isCustomEx, registerCustom y customEx en frontend, API y MCP. Resultado: el enfoque es viable, pero **añadir ejercicios al listado por sí solo no mantiene todos los recorridos**. Las condiciones siguientes son parte obligatoria de C69, no mejoras opcionales.

### Matriz de impacto

«Probe» indica una comprobación ejecutada con helpers reales y datos ficticios. «Lectura» indica inspección de dependencias, no una prueba funcional superada de la futura solución.

| Recorrido | Dependencia y riesgo verificado | Condición para mantener el comportamiento | Evidencia actual |
| --- | --- | --- | --- |
| Crear/editar/duplicar rutinas y programar semana | Las prescripciones y agenda referencian IDs; cambiar ID separa historia, preferencias y progresión | ID estable; resolver disponible también al editar/duplicar y cargar enlaces directos; no cambiar IDs al renombrar | Lectura RoutineEdit, session-routines, plan-share; probe de creación de sesión |
| Arrancar sesión desde rutina | session-start/history/progression consultan tipo y equipamiento a través del índice | Resolver antes de construir series; resolver archivados ya prescritos; estado de carga explícito sin sustituir valores por defecto | Probe de 3×8 a 40 kg |
| Sesión libre, añadir/sustituir, combinar rutinas | sheets y Workout usan exOr/EXIDX; sustituciones reutilizan constructor de sesión | Misma fuente en todos los selectores; mantener superseries, notas, calentamientos, drop sets y prescripción al añadir/sustituir | Lectura Workout, session-start, active-exercise-swap |
| Sesión activa durante una edición global | Cambiar bp, eq o assisted puede cambiar reglas sin tocar las series existentes | Fijar revisión y semántica efectiva al arrancar/añadir; cambios del catálogo no reinterpretan una sesión en curso | Lectura de constructores y consumidores |
| Guardar sesión e historial de cargas | finish-workout mantiene ID, series, target y campos permitidos; no copia campos arbitrarios | Snapshot explícito compatible con whitelist; no depender de añadir propiedades que se pierdan al cerrar/editar | Probe de cierre, volumen 960 kg y mejor carga 40 kg |
| Repetir entrenamiento / guardar como rutina | session-repeat omite cualquier ID ausente en EXIDX | Resolver activo, archivado o respaldo verificado antes de repetir; nunca omitir por carga tardía del catálogo | Probes de repetición, copia a rutina y omisión real cuando falta índice |
| Editar sesiones pasadas / añadir sesión pasada | session-edit preserva muscleSnapshot; constructor/cierre comparte helpers con sesión normal | Preservar snapshot/revisión y semántica histórica al editar, sin aplicarle la última definición automáticamente | Lectura session-edit y sheets |
| Estadísticas y selector del historial | Stats.exHist excluye IDs sin nombre resoluble; medidas leen metadatos del catálogo | Resolver nombre desde snapshot cuando falta catálogo; datos históricos deben seguir visibles offline y tras archivo | Lectura Stats y unknown-exercise-ids.test.jsx |
| Progresión, PR, 1RM y comparación de cargas | isAssisted invierte qué peso es mejor; bp determina incremento; eq influye en progresión | Congelar semántica en target/snapshot con reglas compatibles con helpers; normalizar fallback de históricos y no reconstruir PR con definición incompatible | Probes: sin metadatos, asistencia pasa de récord 30 a 40 kg e incremento de 5 a 2,5 kg |
| Mancuernas, barras, discos y unidades | dumbbells/bar/plates/units consultan EXIDX y preferencias por ID | Conservar ID y configuración personal; cubrir each/total, peso base, pila única/por lado y kg/lb | Probe kg/lb preserva IDs y original; lectura de helpers de material |
| Cardio, tiempo, peso corporal e inclinación | modeOf/isBw tienen fallback al catálogo; inclineFits usa isCustomEx | Guardar modo explícito; separar soporte multimedia/origen de estas reglas; probar tiempo, velocidad, inclinación y laterales | Probe de pérdida de clasificación cardio/bodyweight sin índice; lectura incline |
| Volumen y mapas musculares, recuperación y fuerza | Varias rutas priorizan definición actual sobre snapshot; músculo histórico puede cambiar al editar catálogo | Política explícita por consumidor: historia usa snapshot/revisión del día; planificación usa vigente; legacy conserva fallback documentado | Probe reproduce cambio de carga muscular histórica pese a snapshot existente; lectura muscles, strength-exercises, recovery, structuralBalance |
| Favoritos, notas, pesos confirmados y configuración | Datos personales identificados por ID | Catálogo compartido nunca sobrescribe preferencias personales ni transmite las de otro usuario | Probe de favoritos entre dos estados; lectura de campos personales |
| Biblioteca, músculos y filtros | MuscleExplorer memoriza por S.customEx/equipo; mutar EXIDX no provoca render React | Suscripción a revisión del catálogo en cada consumidor; incluirla en memo/effect; origen también en similares y recuentos | Lectura Library, ExercisePicker y MuscleExplorer |
| Planes exportados/importados, impresión y backup | buildPlanBundle exporta definiciones solo de S.customEx; parsePlan elimina referencias desconocidas; backup multimedia enumera estado personal | Incluir solo definiciones compartidas utilizadas, snapshot portable y política multimedia; importar sin atribución oficial falsa; no omitir al cargar tarde | Probes reproducen pérdida sin definición y conservación al incluirla; lectura plan-share, backup-media/media-refs |
| Sincronización, cuentas, restauración y offline | registerCustom se ejecuta al cargar, actualizar, fusionar y cambiar propietario; catálogo no forma parte de S | Resolver recompuesto en todos esos puntos; no borrar compartidos en actualización personal; copia de seguridad del servidor incluye almacén global; aislar caché por instalación | Lectura useStore, sync-merge, media-sync; pendiente futura integración |
| Propuestas y seguimiento del entrenador | hasTrainingExercise estático rechaza nuevos IDs; assignedStrength descarta entradas sin LIB_BY_ID aunque estén autorizadas en propuesta | Resolver dinámico también en proyección de fuerza y validación; reconocer archivados históricos; respetar permisos de entrenador y campos válidos de propuesta | Probe assignedStrength devuelve lista vacía para ID solo registrado en frontend |
| Coach y estadísticas agregadas | payload/validate/library/cohort resuelven catálogo estático | Fuente compartida por petición/revisión; incluir nombres/equipo/modo válidos; no filtrar fuera ejercicios FT usados ni desbordar presupuestos | Lectura de library, payload, validate, cohort |
| MCP y consultas externas | MCP es otro proceso y lee S.customEx; no recibe el índice del navegador | Cargar catálogo de la instalación mediante canal autorizado y snapshots; aislar consultas concurrentes, no inyectar privados en índice global compartido | Lectura mcp/src/tools.js, state.js y tests existentes |
| Vídeo, miniaturas, precarga y modo sin conexión | Media/WorkoutThumb seleccionan por isCustomEx; prefetch ignora personalizados; media-sync observa S | Fuente compartida independiente y reactiva; precargar medios FT de rutinas sin intentar leer/subirlos como privados; cubrir limpieza y exportación | Lectura Media, CustomMedia, WorkoutThumb, media-prefetch, media-sync, media-refs |

### Ajustes obligatorios al diseño inicial

1. **Snapshots históricos no son suficientes sin cambiar su resolución.** `muscles.loadOf` y `strength-exercises.snapshotWeights` pueden priorizar EXIDX, y el snapshot actual no incluye toda la semántica de carga/equipo. Definir y probar un contexto efectivo consistente que preserve musculatura, modo, asistencia y significado del peso por entrada histórica. El helper actual de snapshot es un punto de partida, no la garantía completa. Evitar reinterpretar registros al editar, archivar o perder temporalmente el catálogo.
2. **Separar tres estados:** elegible para una selección nueva, resoluble para uso ya prescrito/histórico y temporalmente pendiente de carga. Un archivado debe continuar funcionando al iniciar su rutina existente y al repetir su sesión; un ID pendiente de carga no se elimina. Nunca confundir esas comprobaciones con permiso de edición.
3. **Reactividad explícita:** todos los consumidores que usan índice global necesitan una dependencia observable del catálogo. Añadir entradas a EXIDX no actualiza por sí solo las pantallas ni invalida useMemo. Es obligatorio cubrir refresco durante una pantalla abierta y durante una sesión sin mutar su prescripción ya construida.
4. **Seguimiento del entrenador completo:** actualizar assigned-strength además del validador de propuestas; de lo contrario se entrenaría correctamente pero no aparecería la progresión en gestión.
5. **Clientes antiguos y restauración:** ensayar ambos órdenes de llegada (estado primero/catálogo primero). Los formatos personales e importadores actuales pueden descartar IDs desconocidos: no declarar compatible un cliente antiguo solo porque conserva JSON. Preparar respaldo portable y establecer compatibilidad de versión del cliente antes del despliegue.
6. **Cobertura externa explícita:** MCP y Coach no comparten memoria con la web; incluirlos en la implementación o declararlos pendientes impide afirmar compatibilidad completa. La rama C69 no se cierra dejando estos consumidores con catálogo únicamente estático.

### Comprobaciones ejecutadas y límites

Script reproducible externo al repositorio: `../informes/shared-exercise-impact.test.mjs`; comando desde openGym: `node --test ../informes/shared-exercise-impact.test.mjs`.

Resultado: **14/14 probes correctos**. Un resultado correcto puede significar que se ha reproducido un riesgo esperado, no que ese riesgo esté corregido. Los ejercicios son ficticios, registrados temporalmente con registerCustom para ejercitar el mecanismo actual; el índice se limpia tras cada prueba. No se tocan archivos de entrenamiento, cuentas ni servidores. Se comprueban rutinas→sesión→cierre, volumen/pesos, repetición/copia, snapshots musculares, metadatos de tipo/carga, exportación/importación, unidades, diferencia frontend/backend, proyección del entrenador y favoritos personales.

No se ha implementado todavía el catálogo compartido, por lo que estas pruebas no acreditan publicación multiusuario, permisos, vídeos compartidos, reactividad de la interfaz, sincronización ni compatibilidad offline. No se ha ejecutado la suite Vitest ni revisión visual: no están instaladas sus dependencias en frontend. No se instalaron dependencias para este estudio.

Antes de cerrar implementación: añadir regresiones específicas de todos los riesgos reproducidos, ejecutar suites pertinentes de rutinas/sesiones/historial/progresión/material/músculos/estadísticas/sync/importación, API de catálogo/medios y entrenadores/Coach/MCP; probar flujo con dos cuentas reales de prueba aisladas, refresco/cambio de cuenta, desconexión y archivado. Suites y revisión visual se ejecutarán sobre la implementación; hasta entonces la conclusión es viabilidad con dependencias identificadas, no ausencia de afectación demostrada.
