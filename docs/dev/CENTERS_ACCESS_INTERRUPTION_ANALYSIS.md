# Interrupción global por error temporal de centros

Fecha: 20 noviembre 2026. Alcance solicitado: análisis y propuesta; sin implementación ni despliegue.

Actualización tras autorización expresa de implementación: corrección local aplicada el mismo día. El análisis siguiente describe el comportamiento previo; la solución entregada conserva la interfaz tras errores transitorios y mantiene el bloqueo existente para denegaciones reales. No se ha implementado la propuesta adicional de capa de bloqueo para denegaciones reales, porque la corrección del fallo temporal no la necesita y requiere revisar interacciones/procesos de todas las vistas.

Cambios: useMembershipAccess separa decisión y connectionError, conserva decisiones válidas únicamente para cuenta/servidor actuales, valida blocked booleano, reintenta con espera progresiva y jitter, escucha online y descarta respuestas anteriores a una denegación. Aviso no modal con los controles/textos i18n existentes. useCenters conserva referencias y selección ante fallos transitorios y limpia error al recuperarse; conserva borrado por denegación. App reinicia ese contexto al cambiar servidor. Autorización backend intacta.

Verificación de implementación: 31/31 pruebas MembershipAccess/useCenters/CentersEntry y 54/54 Centers/MyCenters/HomeGymCard; build Vite correcto con avisos existentes de chunks/importaciones; git diff --check correcto. Pruebas nuevas verifican misma instancia de formulario y valor sin guardar durante fallos de red/timeout/503/429, recuperación automática y manual, fallos repetidos, denegaciones y sesión inválida, arranque sin decisión, cambio de cuenta/servidor, respuesta tardía tras denegación, solicitudes simultáneas y respuesta malformada. No se ha comprobado visualmente en móvil real ni simulado contra producción. No desplegado.

## Causa comprobada en el código

`frontend/src/components/MembershipAccess.jsx`, hook `useMembershipAccess`, consulta GET `/api/centers/app-access` al entrar, cada 30 segundos, al recuperar foco/visibilidad y ante eventos de denegación. Su catch sustituye la última decisión por `{uid,error}` ante cualquier fallo. `allowed` exige que no exista ese error.

`frontend/src/App.jsx:254` sustituye entonces el árbol de la aplicación por `MembershipAccessScreen`. También oculta navegación, SyncBanner y componentes de temporizador condicionados por allowed. Por eso sucede desde cualquier pantalla: no es un error propio del listado de centros. No ejecuta automáticamente signOut ni demuestra un cierre del proceso; desmonta las vistas. Al recuperarse, el estado local de componentes puede haberse perdido; la persistencia del entrenamiento es independiente y no se ha auditado aquí en todos los flujos.

El mensaje de la captura es exactamente la rama de error de esa pantalla, distinta de cuota vencida y activación pendiente. No permite distinguir red, timeout, servidor o sesión. `lib/api.js` limita GET a 20 segundos y rechaza tanto errores HTTP como respuestas no JSON. Cualquiera de ellos basta para provocar la interrupción. Sin logs del incidente no se puede atribuir el fallo original a 5G, PostgreSQL, proxy o expiración de sesión.

La recuperación automática ya se intenta con el siguiente sondeo/foco, pero llega después de haber desmontado la interfaz. Añadir únicamente reintentos no resuelve ese defecto.

## Corrección propuesta

1. Separar decisión de acceso, actualización en curso y error de conexión. Tras una autorización válida de la identidad actual, un error transitorio de red, timeout, 429 o 5xx mantiene la vista montada y muestra un aviso discreto de conexión y reintento. No presentar Cerrar sesión como salida de un problema de red.
2. Reintentar en segundo plano con espera progresiva y variación aleatoria; recuperar también con online/foco/visibilidad, sin duplicar solicitudes ni sobrescribir respuestas recientes con antiguas.
3. Mantener el tratamiento explícito de sesión inválida y decisiones reales blocked/activation-pending. Una denegación conocida no debe quedar anulada por un error posterior. Al cambiar cuenta o servidor, descartar la decisión anterior. Sin decisión inicial válida, conservar una pantalla de comprobación recuperable; no autorizar por defecto.
4. Conservar el árbol de pantallas también ante una denegación real mediante una capa de bloqueo accesible que suspenda interacción y respete la política vigente, para evitar descartar formularios o contexto. Revisar qué procesos deben pausarse y cuáles deben conservarse.
5. Mantener autorización efectiva en servidor para cada operación. La continuidad visual no habilita pagos ni gestión con permisos obsoletos. `api/server.js` ya consulta applicationAccess en rutas no exentas y devuelve 503 si la comprobación falla. Para entrenamiento personal, revisar por separado la cola y persistencia local existente antes de prometer uso offline completo.
6. Revisar `store/useCenters.js`: su catch también borra centros, capacidades y selección ante cualquier fallo. Separar indisponibilidad temporal de revocación, sin usar información antigua para conceder nuevas operaciones administrativas.

La consulta de acceso ejecuta afiliaciones y, para socios, consultas/transacciones por centro con advisory lock y cálculo de cuotas. Además existe otro sondeo de `/api/centers/me` cada 30 segundos. Medir duración, errores y esperas antes de cambiar frecuencia, consultas o política de validez; no está demostrado que la carga sea la causa del incidente.

## Evidencia y aceptación pendiente

Ejecutado: `npm test -- src/components/MembershipAccess.test.jsx`, 8/8 correctos. Las pruebas actuales cubren decisión inicial, renovación, denegación, cambio de cuenta, configuración y activación; no cubren autorización seguida de fallo transitorio. No se consultaron datos ni logs productivos.

Al implementar, probar autorización → fallo de red/timeout/503 → recuperación, conservando instancia de pantalla, formulario, ruta y entrenamiento; arranque sin red sin autorización previa; denegación real tras error; sesión inválida; cambio de cuenta/servidor con respuestas tardías; eventos simultáneos; reconexión y temporizadores. Revisar móvil real al cambiar de red y volver del segundo plano. Registrar endpoint, status/code, duración e identificador de petición sin credenciales ni datos personales para identificar el detonante de futuros incidentes.
