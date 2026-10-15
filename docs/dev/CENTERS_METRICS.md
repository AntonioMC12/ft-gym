# C32: métricas contractuales y financieras, definición1

Esta entrega cubre agregados por centro y globales, según la parte independiente permitida por F11. C32 queda bloqueada por la definición/datos de ocupación física: incorpora ahora agregados de visitas validadas; no incluye ocupación instantánea, salidas, tasas de retención ni métricas derivadas de `/api/activity`. No necesita una nueva migración; consulta las tablas existentes con schema021.

## Acceso y consistencia

`GET /api/centers/metrics` exige `billing.read` vigente en el centro seleccionado; la plataforma usa su allowlist explícita. Los centros inactivos conservan su historial. `GET /api/platform/centers/metrics` vuelve a comprobar la identidad de plataforma dentro del servicio: ni responsable de un centro ni `user.admin` obtienen acceso global.

Cada consulta usa una sola sentencia SQL y una captura de tiempo de esa sentencia. Todos los saldos, estados y movimientos se leen desde la misma instantánea MVCC, sin unir series de peticiones que puedan observar pagos a medias. La consulta global agrega todos los centros sin el límite de una página de listado y audita, en la misma sentencia, el acceso a cada centro incluido. No devuelve listados de socios, identidades, entrenamiento, QR ni credenciales.

Las cuentas y cantidades monetarias se devuelven como cadenas de enteros exactos, con `definitionVersion:1`, monedaEUR, `capturedAt` y base de fechas `center-local-calendar`. El frontend utiliza el formateador de céntimos existente, incluyendo el signo para el neto negativo; no convierte importes a Number.

## Fechas y alcance del período

`from` y `to` son fechas de negocio ISO, ambas juntas, con hasta366días inclusivos y sin período futuro. Por defecto: primer día del mes hasta el día local actual del centro. Globalmente se usa el día local actual más avanzado entre los centros; las filas de un centro nunca incluyen una fecha posterior a su propio día local actual.

Los estados y saldos bajo `current` siempre corresponden a la instantánea actual, aunque se elija un período pasado. No se presenta una deuda histórica ficticia aplicando el filtro de cobros al saldo actual. Una consulta histórica de saldo requeriría otro contrato de cálculo.

| Campo | Definición |
|---|---|
| current.members | Fichas de socio existentes; no sesiones de usuario ni accesos físicos. |
| current.active/frozen/ended/preactive | Estado contractual efectivo al capturar la consulta; respeta cambios no cancelados, alta futura y fecha de finalización. No implica autorización de entrada. |
| current.subscriptions | Contratos no cancelados y vigentes por fechas, cuya afiliación no haya finalizado. Incluye contratos de afiliaciones en pausa; no equivale al número de personas que pueden entrar. |
| current.outstandingMinor | Saldo positivo de recibos: total menos aplicaciones de pagos más devoluciones. No desaparece por baja/pausa. |
| current.overdueMinor | Parte de ese saldo cuyo vencimiento sea anterior a hoy menos la gracia de su centro. Usa la política de deuda versión1 soportada, con automaticSuspension:false. |
| period.registeredMembers | Fichas cuya fecha de alta está en el período; no significa activación ni cobro. |
| period.activations | Socios distintos con cambio de afiliación activate no cancelado, efectivo en el período. Un estado activo importado sin evento no inventa una activación histórica. |
| period.terminations | Socios distintos con end no cancelado y efectivo en el período; una baja futura o cancelada no cuenta como baja realizada. |
| period.receiptsIssued | Recibos creados durante el período según created_at en la zona del centro, aunque correspondan a otro período contractual. |
| period.receiptTotalMinor | Total de esos recibos, incluyendo su snapshot de impuestos. No es una factura fiscal ni dinero recibido. |
| period.collectionsMinor | Importes de pagos registrados cuya fecha de negocio paid_on está en el período. Incluye el importe recibido, no solo su distribución entre recibos. |
| period.refundsMinor | Devoluciones registradas por refunded_on en el período. |
| period.netCollectionsMinor | Cobros registrados menos devoluciones del período; puede ser negativo al devolver un cobro anterior. No es beneficio, liquidación bancaria ni neto de comisiones/gastos. |

Si un saldo positivo pertenece a un centro cuya política de deuda no sea soportada, `overdueMinor` es null y `overduePolicyComplete:false`. El saldo total conocido sigue mostrándose; no se inventa una gracia ni se cambia lo desconocido por cero. Un centro sin saldo positivo no necesita una regla de mora para saber que su contribución a esa suma es cero.

Las aplicaciones y devoluciones se agregan por recibo antes de calcular el saldo. Así dos pagos y dos devoluciones no multiplican cantidades por un JOIN. Ejemplo verificado: dos recibos de1.000, pagos de300+200 y devoluciones de100+50 producen deuda1.650 y neto registrado350.

## Interfaz y continuidad

La ficha del centro ofrece una pestaña de métricas para responsables; la plataforma dispone también de un informe global. Reutiliza Section/Row, campos de fecha y botones. No genera informes en segundo plano ni almacena métricas en S. El formulario aplica un período explícitamente y conserva las fechas en la URL; Atrás recupera el período/pestaña/lista filtrada anterior. La consulta global conserva la búsqueda de la lista para volver a ella, pero calcula todos los centros, como indica su título.

Los campos actuales y los movimientos del período tienen secciones diferentes; la instantánea muestra fecha/hora y zona. Una mora desconocida se muestra como no configurada. Los textos nuevos siguen los18idiomas del proyecto, con conexión específica del portugués de Brasil. Respuestas tardías de otro período/centro/cuenta se descartan.

## Verificación y pendiente

- Unitarias de fechas reales/bounds y DTO:2/2. Conserva enteros mayores de2^53 y un neto negativo sin redondeo.
- Cuatro recorridos SQL/HTTP reales: ledger con varios pagos/devoluciones, estados y contratos en pausa, saldos independientes del período, aislamiento de centro/rol/admin técnico, agregado global sin límite100 y auditoría, bajas canceladas/efectivas y política de mora desconocida. Honolulu y Kiritimati verifican días locales distintos, creación de recibos convertida a la zona y rechazo del futuro local.
- Selección UI/rutas/locales:28/28 en3archivos. Formato exacto y neto negativo, flags globales explícitos, período en historial, respuestas tardías y ausencia de persistencia personal.
- Build y locales pasan:18idiomas/2565claves,1991cadenas fuente presentes. Suite SQL completa43/43 y restore0211/1, con métricas recomputadas e iguales tras restaurar. API general690:663pasan/27fallos previos; frontend5215:5161pasan/54fallos previos en los mismos15archivos. Evidencia y comandos en CENTERS_PROGRESS.md.
- Pendiente la parte de visitas/ocupación y sus denominadores, más la revisión visual bloqueada por preferencia guardada del navegador. No inferir ocupación instantánea de entradas sin salidas ni declarar completo C32 con esta entrega parcial.

## Agregados de admisiones (schema036/037)

attendance añade conteos enteros exactos del período: admissions (visitas validadas), visitingMemberships (pares centro/socio distintos), memberDays (centro/socio/día civil distinto) y centerDaysWithVisits (centro/día con alguna entrada). No se usa el número de socios actuales como denominador histórico ni se calcula una tasa sobre días de apertura desconocidos. Un mismo socio que entra dos veces suma dos entradas y una afiliación visitante; una cuenta en dos centros cuenta dos afiliaciones.

Days devuelve hasta366fechas locales con entradas y afiliaciones distintas por día. Hours contiene24bins civiles, agregados de todos los días del período; en el cambio de hora se suman ambas apariciones de una hora repetida. Las fechas/horas usan la zona actual del centro al consultar (no existe snapshot de zona para cada visita). Global agrupa cada centro según su calendario y corta su futuro local; no aplica la zona del dispositivo. No hay IDs de socios, cuentas, visitas, dispositivos ni QR en el informe.

036 añade índice centro/instante.037 permite agregados globales mediante una función STABLE SECURITY DEFINER de retorno exclusivamente agregado; comprueba plataforma para global o centro seleccionado+gestión vigente para local, período acotado, search_path fijo y sin EXECUTE público. Se conserva la RLS que impide al runtime leer visitas crudas en contexto global. La función usa la misma instantánea MVCC/captura de la consulta financiera. Las migraciones aplicadas permanecen inmutables.

La UI reutiliza Section/Row y desplegables nativos existentes; muestra conteos, detalle diario/horario y límite de ocupación. liveOccupancy.available=false con reason=exits-not-recorded es un estado explícito, nunca cero personas. Las entradas no prueban permanencia ni entrenamiento. Para cerrar ocupación física hace falta un contrato de salidas/presencia verificable o aceptar expresamente excluir ese KPI del alcance; no se inventa ni se abre esa ampliación durante el cierre. C32 pasa a blocked con esta dependencia concreta, mientras C30 puede avanzar de forma independiente.
