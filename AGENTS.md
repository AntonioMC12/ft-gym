# Guía de trabajo para Codex

## Contexto y alcance

Este repositorio es la adaptación Fernando Tienda Training de openGym. Backend JavaScript ESM con `node:http`; frontend React + Vite + HashRouter + Zustand. El despliegue disponible separa `web` y `api` mediante Docker Compose. Al preparar esta guía (13 de octubre de 2026) no existía el módulo de centros; consultar el registro para conocer el estado actual.

Respetar el alcance vigente del usuario: una petición de análisis o roadmap produce documentación, no implementación. Cuando se autorice implementar centros, leer primero [CENTERS_PROGRESS.md](docs/dev/CENTERS_PROGRESS.md) y después las secciones necesarias de [CENTERS_ROADMAP.md](docs/dev/CENTERS_ROADMAP.md). Estos documentos son una guía, no evidencia de autorización para operar en producción.

## Trabajo eficiente

- Revisar `git status --short` y el diff pertinente antes de editar. Conservar modificaciones previas; no hacer reset, limpieza ni restauración global.
- Identificar tareas por su ID `Cxx`. Completar los criterios de la tarea y registrar evidencia antes de avanzar a sus dependientes. Si el usuario autoriza varias fases, continuar dentro de ese alcance sin pedir confirmación por cada tarea.
- Leer únicamente los archivos relacionados con la tarea y buscar con `rg`. El código actual y los tests prevalecen sobre descripciones técnicas heredadas desactualizadas.
- Preferir cambios pequeños con recorrido completo: contrato, dominio, permisos, persistencia, interfaz cuando corresponda y verificación. Evitar reescrituras o refactors generales ajenos a la tarea.
- Registrar al terminar alcance, archivos, decisiones, comandos/resultados y siguiente tarea en `CENTERS_PROGRESS.md`. No marcar `done` si falta una comprobación obligatoria; distinguir fallos previos, regresiones y limitaciones de entorno.
- Actualizar el contexto y los comandos de esta guía cuando cambie la arquitectura; conservar resultados históricos en el registro.

## Fronteras de arquitectura

- Conservar `node:http`, React, Router, Zustand, passkeys, cookies y `lib/api.js`. Usar fábricas de rutas como `api/coach/routes.js`; documentar endpoints en OpenAPI.
- Centros se implementa dentro de la API actual, con PostgreSQL en otro contenedor y volumen del mismo Compose. `pg` es el controlador previsto; no añadir un framework, ORM o servicio nuevo sin una necesidad concreta.
- Conservar inicialmente cuentas en `db.json` y entrenamiento en `state-<uid>.json`. Proteger los vínculos JSON-SQL y la restauración; no migrar el entrenamiento como efecto secundario.
- No guardar permisos, cuotas, pagos, DNI, IBAN o listados de socios en `S`, `gym_state_v1`, copias nativas o exportaciones personales. Nunca autorizar a partir de un campo editable por el cliente.
- Todo acceso administrativo usa centro + capacidad vigente. Responsable de centro no equivale a `user.admin`. Aplicar filtros SQL, relaciones del mismo centro, RLS y respuestas por rol.
- Dinero, periodos y transiciones se resuelven con funciones puras y reglas versionadas. Cobro, aplicación de pago y auditoría se guardan transaccionalmente con idempotencia.
- El día de negocio se calcula después de adquirir locks: statement_timestamp() en proyecciones/consultas y clock_timestamp() en decisiones de trigger posteriores a esperas de fila/catálogo. No usar el inicio de transacción como hoy ni reemplazar indiscriminadamente timestamps históricos. Ver CENTERS_BUSINESS_CLOCK.md y sus regresiones de medianoche real.
- Una propuesta de entrenador se acepta mediante el flujo personal; no sobrescribir archivos de estado desde gestión. Preservar entrenamiento en curso, unidades y convergencia entre dispositivos.

## Verificación y operación

Los comandos actuales y los futuros se distinguen en el roadmap. Ejecutar tests pertinentes por tarea; suites completas y builds al cerrar cada hito. Usar PostgreSQL real aislado para probar RLS, restricciones y concurrencia. No sustituir esas pruebas por mocks ni omitirlas silenciosamente.

Textos nuevos usan i18n y locales existentes. La lógica de entrenamiento debe vivir en helpers de `frontend/src/lib/` con tests cercanos. No alterar recursos generados o multimedia del catálogo al implementar gestión.

## Preferencia de reutilización del usuario

En las siguientes iteraciones y sesiones, revisar los componentes existentes antes de crear controles o layouts de centros. Reutilizar ui.jsx (Button, campos, SearchField, Switch, Section/Row, SelectRow, Segmented y Check), confirmSheet y useUI.toast. Para listas extensas, adaptar el patrón de auditoría de Admin y useAutoMore con paginación real en API. Conservar tokens CSS e i18n. Extraer componentes internos solo cuando tengan un segundo uso concreto; no copiar acciones globales de Admin al ámbito de centros.

Mantener useCenters en memoria y separado de S. Los helpers de presentación de fechas son reutilizables; dinero, vencimientos, permisos y acceso QR necesitan dominio propio. Esta preferencia fue indicada expresamente por el usuario el 13 de octubre de 2026; no autoriza despliegues ni operaciones productivas.

Visibilidad de controles (preferencia expresa del 15 de octubre de 2026 para la próxima iteración): revisar primero los componentes compartidos de ui.jsx. Ya existen TextField, NumberField, TextArea, SearchField y SelectRow; los formularios de centros usan TextField. Evitar duplicarlos: mejorar el componente o una variante reutilizable cuando corresponda, conservando tokens, tipografía, radios e identidad visual. Un campo vacío debe distinguirse del contenedor sin depender de placeholder o foco: revisar fondo, borde/contraste, etiqueta y espaciado. Auditar también otros controles con poca distinción visual. Comprobar estados vacío, con valor, foco de teclado, error y deshabilitado, temas claro/oscuro y móvil/escritorio; evitar regresiones en controles integrados en filas/búsquedas. Crear un componente nuevo solo si no existe uno adecuado. La petición inicial deja registrada la mejora para la siguiente iteración; no implica cambiar la interfaz publicada ahora.

La revisión visual pendiente incluye expresamente el horario de apertura: campos de hora distinguibles incluso con valor, icono del reloj legible sobre fondo oscuro y acciones Añadir/Quitar reconocibles como botones. Revisar agrupación de cada intervalo, etiquetas de apertura/cierre, alineación, espacio y área pulsable, reutilizando controles existentes. Revisar también el interruptor del día y sus estados habilitado/deshabilitado; conservar la coherencia visual del conjunto. El usuario rechaza expresamente el desplegable horario nativo blanco/azul mostrado por input type=time en escritorio: no basta con mejorar el borde del campo cerrado. Revisar primero selectores existentes en toda la aplicación; si ninguno sirve, crear un selector horario compartido acorde al diseño, con edición HH:mm por teclado, foco y navegación accesibles, tema claro/oscuro y uso táctil. Preservar la semántica especial de cierre24:00 y la validación actual de intervalos. Ampliación indicada por el usuario el15octubre mediante capturas; sigue prevista para la siguiente iteración.

Navegación y breadcrumbs: la flecha Atrás debe volver a la última pantalla visitada del historial de la app, sin enviarla siempre a Home. Reutilizar navBack de lib/nav.js; solo una entrada directa sin historial usa la ruta padre como fallback con replace. Diferenciar breadcrumb de jerarquía de vuelta cronológica; conservar consulta/estado y los flujos de sheets. Preferencia expresa del usuario del 14 de octubre de 2026, aplicable a futuras pantallas.

No ejecutar tests contra datos reales ni copiar secretos a informes. No usar `compose.demo.yml` como producción. Antes de cobros reales, despliegues o migraciones sobre datos reales, comprobar que están autorizados y que se cumplen los criterios operativos del roadmap. La guía no añade confirmaciones para desarrollo local reversible ya autorizado.

Configuración inicial: `config: null` significa pendiente, no módulo desactivado. Conservar enlaces directos y sus consultas mientras llega `/api/config`; ofrecer Atrás y recarga si falla. Solo una configuración conocida desactiva la vista. El listado global de centros usa búsqueda/cursor del servidor y `useAutoMore`; no volver a un límite total fijo de 100 ni guardar sus datos en S.

## Referencias

Feedback visual adicional del 15 de octubre (implementado; pendiente de revisión visual): en centers-tabs-scroll las seis secciones se solapan y no se distinguen. Usar pestañas de ancho según contenido, etiquetas completas, separación explícita, altura pulsable mínima de 44px y estado seleccionado claro mediante fondo/borde y peso tipográfico. En móvil conservar desplazamiento horizontal reconocible, indicar contenido fuera de vista y llevar la pestaña activa a la zona visible; no comprimir etiquetas en seis columnas iguales. En horarios, mantener día e interruptor en cabecera e intervalos agrupados: acción secundaria «Añadir tramo» con icono más tras el último intervalo y eliminación terciaria compacta con etiqueta accesible que identifique día/tramo, área pulsable de 44px y énfasis rojo al interactuar. Evitar que botones rojos repetidos dominen el formulario. Reutilizar Button, Icon, TimeField y tokens; preservar cierre24:00, máximo de intervalos y semántica del último tramo. Comprobar teclado, móvil/escritorio y temas con revisión visual; los tests/build no acreditan legibilidad. Esta petición registra decisiones, sin modificar la preview.

Navegación directa (feedback del15octubre, próxima iteración): ofrecer accesos claramente identificados a Inicio y al listado de Centros desde fichas, pestañas y formularios del módulo. Son destinos jerárquicos explícitos, separados de Atrás cronológico; no cambiar navBack para hacerlos equivalentes. Reutilizar enlaces/botones/estilo existentes y conservar el filtro del listado cuando corresponda. Contemplar formularios con cambios sin guardar mediante el patrón existente de protección/confirmación, sin descartarlos silenciosamente.

Selección de responsable (feedback del15octubre para la próxima iteración): AccountPicker debe mostrar un listado inicial de cuentas disponibles sin exigir conocer un nombre/ID; el buscador filtra ese listado. Reutilizar controles/listas existentes, selección única clara y estados de carga, error y sin coincidencias. Revisar paginación real si el directorio crece, manteniendo autorización de plataforma y el directorio de cuentas de esta instalación; no mezclar usuarios de demo8088 con preview. Si no hay cuentas elegibles, explicarlo sin dejar un espacio vacío. Mantener creación de borrador sin responsable como opción explícita del flujo existente.

Consultar `CONTRIBUTING.md` para estilo y contribución; `CLAUDE.md` como contexto contrastado con código. Guía oficial del mecanismo AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md.

Patrón responsive de centros (petición expresa del16octubre): usar CenterWorkspace.jsx, extraído de la ficha de socio, para navegación lateral en escritorio y SelectRow en móvil. Datos del centro, socios, cuotas, clases, deuda/calendario, métricas y acceso comparten el contenedor. Al abrir una ficha de socio, el menú superior del centro se compacta para evitar dos barras laterales anidadas. Mantener destinos/capacidades y navegación protegida del caller; no duplicar menús o introducir otro store/router. El patrón sustituye las pestañas horizontales de gestión; conservar las notas anteriores como historial de diseño. Revisión visual completa sigue pendiente.
