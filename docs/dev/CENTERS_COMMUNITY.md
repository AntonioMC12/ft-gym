# Comunidad — C57

Implementación local del punto6 del documento del usuario,19octubre2026. Las tres fases están incluidas. No autoriza operación sobre bases reales ni publicación del túnel persistente.

## Entrada y navegación

`/community?centerId=...` usa la sesión y el contexto de centro existentes. La card Comunidad de Inicio muestra un resumen de conversaciones/avisos no leídos y un destino autorizado. Gestionar centros, activaciones y Rutinas mantienen su prioridad administrativa; no existe sexta pestaña inferior. Selección automática con una sola afiliación, selector de centros paginado para plataforma y elección entre afiliaciones para otros usuarios. `config:null` espera conservando la URL; módulo conocido desactivado vuelve a Inicio.

Socio: Mis consultas, Mis logros, Avisos del centro, Logros del centro. Personal delegado: Consultas de socios; gestión explícita añade avisos y asignaciones. Plataforma explícita puede delegar. Un responsable/trainer sin delegación no ve conversaciones. El admin técnico no adquiere permisos por `user.admin`. El bloqueo vigente de activación/acceso económico permanece en middleware, sin excepciones nuevas.

Listas: cinco resultados iniciales, Ver todas consulta20 y Mostrar más usa cursor real; máximo50 por petición. Búsqueda en título de consultas, nombre/número del selector de fichas, sin desmontar inputs. Las novedades se actualizan con foco/visibilidad y cada60segundos visibles, sin emails, WhatsApp, push ni WebSockets. Cada recurso descarta respuestas tardías por cuenta/centro/selector; los drafts permanecen en memoria del componente y tienen protección de navegación. No se persiste comunidad en S/localStorage/exportaciones/copias nativas.

## Permisos y datos

Migraciones048–052; schema052. Tablas `community_*` en PostgreSQL: delegaciones, asignaciones, hilos, mensajes, historia de edición/borrado, lecturas, avisos/lecturas, catálogo, adjudicaciones, preferencias, publicaciones, reacciones, ocultaciones, felicitaciones, comandos y auditoría. FK compuestas impiden relaciones entre centros y publicación de un logro de otra persona.

RLS por centro y actor; proyecciones de servicio con campos mínimos. Funciones SECURITY DEFINER estrechas resuelven permisos sin recursión, resumen global y proyección del logro de la publicación exacta. Tablas de metadatos de permisos/asignaciones/hilos y catálogo permiten lectura de su propietario migrador dentro de esas funciones; el runtime nunca es propietario. Catálogo de solo lectura para runtime; no se omite RLS de tablas de mensajes/datos personales.

- Plataforma es únicamente la allowlist configurada en servidor.
- `community.respond` requiere delegación expresa y rol manager/trainer vigente del mismo centro; `community.manage` es otra casilla de esa delegación e implica responder. Caducidad opcional UTC, revocación versionada y auditoría. El servidor suministra las cuentas deshabilitadas al contexto SQL desde su directorio confiable.
- Solo plataforma concede/revoca delegaciones; un delegado no puede delegar a terceros.
- Un vínculo vigente no terminado da consultas propias. El control económico de aplicación sigue siendo adicional.
- Asignación opcional socio-entrenador por centro. Se conserva hasta cambio explícito; es utilizable solo mientras el entrenador mantiene rol/delegación/cuenta válidos. Reasignar corta el acceso del anterior. Sin asignación utilizable responde el equipo autorizado. Gestión/plataforma pueden supervisar el conjunto.
- El antiguo titular de una ficha pierde acceso al cambiar el vínculo; el nuevo titular no hereda automáticamente las conversaciones del anterior. El personal autorizado conserva custodia de los hilos del centro. Identidad de destinatario inmutable en cada hilo.

Cada comando adquiere lock del centro, revalida permisos/sesión, controla versión y escribe resultado idempotente y auditoría en una transacción. Cuarenta comandos nuevos exitosos por actor/centro/minuto; retries exactos no gastan el presupuesto ni repiten acciones. Mismo requestId con contenido distinto:409. Body y campos estrictos, longitudes, catálogo de reacciones, cursor ligado a actor/centro/tipo/filtros y CSRF existente. Textos React escapados, sin HTML de usuario ni adjuntos.

## Consultas y avisos

Pregunta: título1–120 y mensaje1–1000caracteres. Respuesta del socio: pending; del equipo: answered. Estado de atención separado de lectura individual por secuencia. Cerrada bloquea compositor y API; solo reapertura expresa a pending permite responder. Concurrencia de respuestas usa versión: una gana y la otra409, sin sobreescritura silenciosa.

Lecturas explícitas hasta lastSeq visto; nunca al cargar listas, detalle ni contador. Nuevas respuestas crean secuencia; editar no genera una nueva respuesta/notificación. Edición propia versionada y etiqueta de versión visible; borrado propio o moderador conserva tombstone y copia anterior privada con actor/motivo/versión. No hay borrado físico rutinario. La historia es accesible solo al ámbito privado autorizado, no al muro.

Aviso: título120,cuerpo3000,autor,creación,fechas locales del centro, estado draft/published/archived y fijado opcional. Fechas inicial/final inclusivas. Socios ven solo publicados dentro del periodo; gestión también borradores/archivados. Fijado cambia el orden antes de la fecha de creación; no elude vigencia. Cada edición incrementa versión y vuelve a requerir lectura de esa versión; una lectura antigua no confirma una edición posterior. El cursor incluye el estado fijado además de fecha/id.

## Contexto voluntario del entrenamiento

Comentar este entrenamiento aparece en FinishSummary de una sesión guardada para afiliaciones propias. No cambia el guardado, el entrenamiento activo, las propuestas ni el calendario. Se muestran título/fecha y, si se seleccionan, ejercicios/cargas/repeticiones; consentimiento explícito antes de enviar. Se comprueba sincronización y propiedad de cuenta después del await.

La API recibe workoutId, nunca uid libre; toma la sesión guardada del JSON del propio actor en servidor. Guarda snapshot SQL inmutable: id/fecha/título y opcionalmente unidad/exerciseId/series completadas con reps/carga. Máximos30ejercicios×30series y30kB. Excluye notas, fotos, salud, peso corporal, medidas y datos administrativos. Editar/borrar después el entreno no altera esa conversación. El permiso antiguo progress_shares es independiente y no autoriza ni este contexto ni publicaciones.

## Catálogo versión1 y reprocesado

Los datos se describen como registros declarados. No certifican rendimiento físico ni generan recompensas económicas. Fuente: JSON de entrenamientos sincronizados del propio usuario. La fecha de cada sesión es su `d` declarado y validado (no se vuelve a convertir un histórico a partir de timestamps); el día límite es hoy en la zona del centro. Se excluyen fechas futuras/inválidas, registros sin start/end finitos o end<start, tombstones, IDs duplicados y sesiones sin repeticiones, duración o distancia completadas positivas (una carga preconfigurada sin trabajo no basta). Incluye los campos heredados de repeticiones/segundos/minutos del modelo de entrenamiento. Una sesión sin id se deduplica por fecha/start. Calentamientos respetan la precedencia phase sobre warmup del modelo existente. Una extremidad completada cuenta aunque la otra esté pendiente; nunca se comparten los valores de la pendiente.

| Insignia | Umbral/fuente | Fecha obtenida |
|---|---|---|
| Primer entrenamiento | Una sesión válida | Primera sesión |
| Diez entrenamientos | Diez sesiones distintas | Décima sesión |
| Cuatro semanas de constancia | Al menos una sesión en cada una de cuatro semanas consecutivas lunes-domingo; no racha móvil de28días | Primera sesión que completa el bloque |
| Primer récord personal | Primera sesión válida con anotación `prs` del motor de historial existente y ejercicio coincidente con carga positiva completada | Fecha de esa sesión |

No se inventa un algoritmo de1RM ni se compara kg con lb. Las conversiones siguen el estado personal existente; el snapshot usa su unidad. Importados/manuales/sincronizados con datos compatibles cuentan como declarados; una importación sin metadatos PR no crea un récord nuevo por inferencia. Catálogo SQL inmutable versión1, umbrales explícitos y tests de semántica. La recalculación conserva adjudicación única por centro/cuenta/insignia. Cambiar/borrar fuente actualiza o invalida, sin duplicar premios; la proyección pública comprueba fuente actual incluso antes de refrescar logros. Recalcular no publica ni emite notificaciones de logros.

## Publicación y conservación

Logros privados por defecto. Opt-in versionado y separado por centro; activarlo nunca publica retrospectivamente. Cada publicación exige seleccionar logro, vista previa de insignia/fecha/nombre visible y confirmación individual. Solo nombre visible<=40, fecha, insignia y descripción del criterio: sin cargas ni datos administrativos. Republicar voluntariamente actualiza el nombre visible. Revocar opt-in desactiva todas las publicaciones; volver a activarlo no las recupera automáticamente. Retirar propia mantiene el logro y el entrenamiento. Retirada de moderador bloquea su republicación. Ocultar para mí solo afecta a ese actor; no es retirada del muro. No hay una opción de restaurar ocultaciones en esta primera UI; la API admite hidden:false.

Reacciones: catálogo fijo de5tipos, varios tipos por persona permitidos, unicidad actor/publicación/tipo y estado deseado activo/inactivo idempotente. Contadores consistentes; hasta20nombres por tipo en detalle. Felicitar abre un editor280caracteres y requiere enviar; sin texto automático. Hasta10felicitaciones recientes por publicación en esta primera proyección. Borrado de felicitaciones propio/moderador es lógico y versionado.

Conservación deliberada: no se elimina físicamente contenido al cerrar consulta, retirar publicación, desvincular o deshabilitar cuenta. La referencia SQL del hilo protege al titular frente a borrado físico genérico que rompería la trazabilidad. Cambiar nombre/cuenta no transfiere conversaciones. Edición/borrado conserva historia privada del centro. Auditoría contiene acción/actor/target, no cuerpo ni contexto. No hay limpieza automática nueva; cualquier purga/anonimización requiere política operativa, alcance y revisión adicionales. Los datos de Comunidad no entran en las exportaciones personales de entrenamiento. Una cuenta pendiente sigue bloqueada aunque conozca una URL.

## API y revisión local

OpenAPI documenta `GET /api/community`, `GET /api/community/summary`, `POST /api/community/command`. Cliente reutiliza lib/api.js y cookies; no nuevo store persistente ni proveedor externo.

Preview separada: `compose.centers.test.yml` + `compose.community.preview.yml`, únicamente CI tmpfs `ft_gym_ci_centers_test`, ficheros ficticios separados en informes/community-preview-data y puerto localhost5179. La primera entrega dejó el túnel5178/base047 intactos. Tras petición expresa posterior del usuario, esa preview compartida se actualizó a052 con backup; conserva cuentas, entrenamiento y URL. El seed comunitario rechaza hostname/DB/origin distintos de este entorno, conserva idempotencia y usa cuentas/entrenos/contratos ficticios de precio0. No habilitarlo en producción. La contraseña de las cuentas ficticias ya definidas en preview.mjs es solo para esta instalación local de QA.

Comandos desde openGym/ (Docker en PATH):

```
docker compose -f compose.centers.test.yml build centers-tests
docker compose -f compose.centers.test.yml run --rm --no-deps centers-tests
docker compose -f compose.centers.test.yml -f compose.community.preview.yml build community-preview-api community-preview-web
docker compose -f compose.centers.test.yml -f compose.community.preview.yml up -d community-preview-api community-preview-web
```

Aplicar migraciones únicamente mediante el runner aislado anterior antes de arrancar la preview. El seed se copia/ejecuta exclusivamente en community-preview-api; reiniciar ese contenedor tras añadir el actor ficticio al archivo de cuentas para que recargue el directorio. No usar --remove-orphans: existe otra preview que se debe conservar.

Evidencias de pruebas y revisión visual en CENTERS_PROGRESS.md. La petición posterior «Quiero usarlo en el enlace externo» autorizó actualizar esa preview compartida. Migración047→052 y API/WEB publicadas con backup; ver registro. Esto no autoriza otros despliegues de producción, envíos externos ni operaciones financieras.
