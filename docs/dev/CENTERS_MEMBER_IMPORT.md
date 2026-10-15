# C36: importación revisada de socios por CSV

Implementación inicial en schema022; compatibilidad socio.csv en schema028. C36 permanece en progreso hasta completar su revisión visual. Funciona con el sistema de socios y permisos actual, sin crear otra API, almacén de cuentas o procesador externo.

## Uso y alcance

En Gestionar centros → Socios → Importar socios (CSV), descargar la plantilla, completar el archivo, seleccionarlo y pulsar Revisar importación. La revisión muestra línea física, nombre, contacto/documento y estado. Confirmar importación es una acción expresa diferente. Una fila inválida bloquea el lote completo: corregir el archivo y preparar otra revisión. Hasta confirmar no se crean socios.

Solo responsables con members.manage vigente y la allowlist explícita de plataforma. La revisión pertenece a su actor y centro; otro responsable o superadmin no hereda el archivo de un tercero. Preparar y aplicar exigen centro activo; un resultado ya completado sigue siendo recuperable/reintentable en centro inactivo con autorización vigente. Entrenador/admin técnico no adquieren el permiso.

Los socios nuevos quedan preactive, sin account_uid, contratos, saldos, recibos, cobros ni invitaciones automáticas. La fecha de alta es el día local del centro al insertar. No se importan perfiles de entrenamiento, roles, credenciales, documentos de pago ni sustitución de números internos por números externos. No hay correspondencia automática de emails de contacto con cuentas de acceso.

## Archivo y validación

- UTF-8 estricto, BOM opcional, máximo256KiB y200registros sin contar cabecera/líneas vacías.
- Coma o punto y coma según la cabecera. CRLF/LF, comillas dobles escapadas y registros entrecomillados. Se rechazan comillas mal cerradas, texto después de cerrarlas, NUL y CR aislado. Los controles dentro de un campo producen un error de fila según memberFields.
- Cabecera name (o su alias Nombre Completo) obligatoria; email, phone y nationalDocument opcionales. Se aceptan orden diferente y alias españoles nombre/nombre socio, correo/correo electrónico, teléfono y documento/documento de identidad/DNI/NIF, normalizando mayúsculas/acentos/espacios de la cabecera. Cabeceras desconocidas o repetidas tras normalizar se rechazan; no se ignora silenciosamente una columna role/centerId/balance.
- Se reutiliza memberFields: nombre120, email254 con formato, teléfono/documento40, campos opcionales vacíos a null. Los teléfonos/documentos son texto; no se pierden ceros ni se convierten a números. El parser no evalúa fórmulas. La exportación humana de deuda mantiene su neutralización existente; no es una plantilla de importación sin pérdida.
- Columnas desajustadas y datos inválidos se identifican por registro y línea física, incluso después de saltos entrecomillados. Una celda name entrecomillada vacía es un error, no una línea descartable.

## Duplicados y confirmación

La política única de esta entrega es skip y se explica antes de confirmar. Coincidencias por email_key o document_key se calculan en PostgreSQL con las mismas expresiones de las restricciones existentes: lower/btrim para email y upper/retirada de espacios-guiones para documento. También se detectan repeticiones dentro del archivo; la primera fila válida no duplicada es la candidata. No se modifican socios existentes.

Nombres y teléfonos por sí solos no prueban identidad. Las filas sin email/documento se admiten como personas diferentes, incluso con el mismo nombre. Repetir un job completado no las duplica; preparar otro job con filas sin esas claves puede crear otras fichas, tal como advierte la política. No afirmar deduplicación general de nombres.

La revisión se recalcula al cargar y devuelve reviewHash. Confirmar revalida el conjunto de duplicados bajo el bloqueo de centro compartido: si cambió respecto a lo mostrado devuelve import-review-changed y exige recargar/reconfirmar, sin crear nada. Todas las altas, números M- consecutivos con aritmética exacta, auditoría y resultado se guardan en una transacción. Dos confirmaciones simultáneas del mismo job devuelven los mismos IDs/resultados.

## Persistencia, privacidad y recuperación

member_import_jobs aplica FORCE RLS por actor/centro/rol actual. Preparación idempotente por actor+centro+requestId, con hash de contenido; aplicar usa id+reviewHash y transición preparada→completada única. Columnas de identidad/contenido son inmutables; el runtime no puede prolongar la caducidad ni borrar jobs. Al completar se elimina records y solo quedan resultado, líneas/IDs/estados y hashes. La auditoría registra objetivos y conteos, sin copiar filas privadas.

Un job preparado caduca a las24horas según reloj SQL; expirado no se aplica y se selecciona de nuevo el archivo para otra revisión. Desde schema025 la API no devuelve filas vencidas y el mantenimiento opcional elimina records por lotes, conservando estado expired y claves de idempotencia. Ver CENTERS_MAINTENANCE.md para activación, límites, fallos y política de backups pendiente. Cada job de hasta200filas sigue confirmándose de forma síncrona y atómica; el mantenimiento no importa socios ni altera resultados completados.

El importId queda en la URL de la ficha/pestaña y permite recuperar revisión/resultado tras recargar; nunca autoriza por sí solo. CSV, directorios, permisos e importaciones no se guardan en S, exportaciones personales ni backups nativos. El estado personal antes/después permanece idéntico. Respuestas, lecturas de archivo y confirmaciones de otro contexto se descartan; una carga fallida de otro job retira el resultado anterior y su botón de confirmar.

Rutas: POST /api/centers/members/imports/prepare, GET /api/centers/members/imports/detail y POST /api/centers/members/imports/commit; contrato en OpenAPI. Mantienen CSRF normal para cookies. Aún no hay actualización masiva de socios existentes, importación de contratos/deuda ni mapeo arbitrario de columnas.

## Evidencia

Parser/expiry4/4, SQL específico4/4 y suite completa47/47. SQL cubre normalización de documentos, duplicados, numeración/concurrencia, resultado inmutable, errores atómicos, roles/RLS/actor/centro/CSRF, revocación y centro inactivo. Expiry se verifica con reloj inyectado en cliente SQL de prueba; la integración no espera24horas ni modifica timestamps/grants del runtime.

Restore0221/1 con job completado y preparado no vacíos: se conservan hash, resultados e identidades, el completado no se reaplica y el preparado se termina después de restaurar. Incluye además los escenarios anteriores de ledger, Stripe, propuestas, QR y entrenamiento byte a byte.

Selección UI38/38 en4archivos, con archivo inválido/grande, reintento estable, confirmación expresa, recuperación por URL, sustitución de archivo, cambio de contexto y respuesta de un job anterior. Suites generales, build/locales y estado de preview quedan registrados en CENTERS_PROGRESS.md al cerrar el checkpoint. No hay capturas nuevas ni revisión visual por la restricción guardada del navegador.

## Plantilla socio.csv (schema028)

La plantilla proporcionada el 15 de octubre se acepta directamente como UTF-8 con coma o punto y coma. Se conserva el formato anterior. Cabeceras entrecomilladas con varios párrafos y líneas vacías entre cabecera/datos no requieren edición manual. El archivo del usuario solo se ha leído/validado: no se ha importado en ninguna base. No se incorpora al repositorio ni a fixtures.

| Columna original | Destino |
| --- | --- |
| Nombre Completo | name, obligatorio |
| DNI | nationalDocument, deduplicación existente |
| Teléfono | phone, texto conservando ceros/prefijo |
| Nº ABONADO | sourceRegistration.subscriberNumber, texto histórico |
| Dirección | sourceRegistration.address |
| Fecha Nacimiento | sourceRegistration.birthDate, DD/MM/AAAA o AAAA-MM-DD, fecha real normalizada ISO sin conversión de zona |
| Marca temporal | sourceRegistration.submittedAt, texto de origen sin atribuir una zona no suministrada |
| Condiciones de Inscripción y protección de datos | sourceRegistration.conditionsResponse; cabecera completa en conditionsText |

También puede añadirse email/correo; no se inventa a partir de otros campos. El primer renglón de la cabecera de condiciones se reconoce por su título, normalizando acentos/caso/espacios; su contenido posterior se trata como texto, nunca como instrucciones, tarifas, política de edad o configuración de la app. No se crean filas en consents ni se acredita consentimiento verificado por una respuesta del CSV.

La revisión muestra todos los datos de origen, con condiciones desplegables renderizadas como texto inerte. Tras confirmar se guarda una instantánea histórica source_registration en la ficha SQL del socio, bajo su RLS habitual. La ficha administrativa la muestra en una sección propia de solo lectura; una edición ordinaria del nombre/contacto no la borra. Solo members.manage recibe la instantánea en el detalle; no se incluye en listados, proyecciones operativas, respuestas de confirmación ni estado personal. El job completado sigue eliminando records. La caducidad del job no borra información ya incorporada a una ficha; sigue el ciclo de conservación de socios, distinto del mantenimiento de revisiones.

El número interno M- sigue asignándose transaccionalmente. Nº ABONADO se conserva como referencia, no es clave de deduplicación ni se sustituye por él el identificador interno. Se mantiene la detección por email/documento; números externos repetidos no autorizan fusiones ni cambios en socios existentes.

Límites nuevos: hasta10columnas conocidas; cabecera individual16000caracteres; número externo40, dirección500, nacimiento10, marca temporal80 y respuesta2000. Valores opcionales vacíos quedan null. Las cabeceras desconocidas/duplicadas siguen rechazándose, incluidas columnas de permisos/saldos, aunque se mezclen con la plantilla ampliada. Fechas imposibles y longitudes inválidas bloquean el lote con error por fila. Las condiciones se conservan con su cabecera, sin copiar al repositorio el documento real.

La descarga ahora proporciona las ocho cabeceras de socio.csv (título corto de condiciones, sin inventar un texto de aceptación). La ampliación es aditiva: no modifica migraciones anteriores ni cambia las claves de revisión/idempotencia o jobs ya preparados.
