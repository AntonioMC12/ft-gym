# C58 · Socios con rutina y evolución

Petición del 20 de octubre de 2026: listado de socios con planes aceptados y ficha visual de actividad. El usuario amplía expresamente el alcance: superadmin consulta esta evolución aunque el socio no comparta progreso.

## Interfaz

`/training-admin?pane=tracking`, dentro de la pantalla ya exclusiva de plataforma. Selección de centro existente, búsqueda de nombre/número y cursor real. Solo se listan socios con alguna versión aceptada por su cuenta actualmente vinculada. Una oferta pendiente no es una asignación aceptada. La aceptación tampoco acredita que la rutina continúe presente en el plan personal; el texto usa «Planes aceptados».

La ficha muestra planes aceptados, rutinas asignadas, último registro y frecuencia semanal por rutina. Los ceros son semanas sin sesiones guardadas; los detalles semanales y las propuestas se despliegan aparte. Las propuestas se cargan al abrir su bloque. Navegación, campos, controles, iconos y colores reutilizan los componentes y tokens actuales.

## Acceso y datos

* `GET /api/centers/training/members`: `training.assign` vigente o superadmin verificado. Devuelve solo identidad operativa de socio, número de planes aceptados y fecha de última aceptación, con paginación vinculada a actor/centro/búsqueda. No consulta entrenamiento JSON.
* `GET /api/centers/training/assigned-progress`: `training.shared.read` o plataforma vigente. Superadmin puede consultar los últimos 366 días de registro sin consentimiento; únicamente IDs de rutinas entregadas en versiones aceptadas en este centro por la cuenta actualmente vinculada. Es una excepción específica de esta proyección, no un permiso general de lectura de perfiles.
* El resto de roles conserva consentimiento, fechas y selección de rutinas de `progress_shares`; se intersectan con las asignaciones. `/training/progress` no cambia sus reglas ni siquiera para plataforma.
* Lecturas bajo sesión vigente, locks de cuenta/centro y RLS existentes. El contexto de plataforma se decide en servidor con su allowlist; `user.admin` ni parámetros del cliente lo conceden. Accesos de plataforma auditados mediante `businessTransaction`. Un cambio de vínculo no transfiere asignaciones anteriores. Cuenta inexistente/deshabilitada no expone datos.
* Se reutiliza `sharedProgress` para los recuentos. Ampliación expresa del usuario: superadmin recibe también carga/repeticiones semanales por ejercicio autorizado mediante `assignedStrength`; otros roles conservan exclusivamente recuentos. No salen notas, series crudas, fotos, datos corporales ni entrenamiento activo. Son registros guardados, no una estimación de fuerza ni prueba de cumplimiento. Una sesión combinada puede contar en cada rutina correspondiente.

Sin migración SQL, sin escritura sobre entrenamiento ni modificación de cuentas, cuotas o propuestas. Los datos de centros no se guardan en `S` ni en exportaciones personales.

## Evidencia

111/111 pruebas de integración PostgreSQL real en la base CI tmpfs, incluidas dos nuevas para listado/paginación/roles/vínculos y excepción de plataforma/consentimiento/revocación/aislamiento de rutinas privadas. 18/18 pruebas de interfaz/dominio relacionadas y 5/5 de OpenAPI/proyección. Locales 18/2996 y textos fuente sincronizados. Logs y capturas de revisión visual fuera del repositorio, en `informes/training-roster-*`.

## Comparativa de carga y repeticiones (ampliación del20octubre)
performanceDefinition1: por cada ejercicio del bundle aceptado se agrupan los registros guardados por lunes ISO. La referencia es la serie principal completada con mayor carga y, entre empates, más repeticiones a esa carga; en máquinas asistidas se elige la menor asistencia. Peso/repeticiones siempre pertenecen a la misma serie. El total de series corresponde al trabajo completado de esa semana. No se incluyen calentamientos ni intensificadores, series no realizadas, sesiones activas, tombstones o duplicados.
Las entradas rid se atribuyen únicamente a su rutina entregada; fallback legacy solo si hay una rutina inequívoca y ninguna entrada con rid. Se exige además que el ejercicio figure en el bundle de esa rutina. Lados y significados each/total/as se separan; no se comparan entre sí ni se infieren conversiones. La unidad es la actual del perfil, cuyo cambio ya convierte el historial completo en la aplicación. No hay estimaciones de fuerza ni nuevos récords calculados.
La interfaz muestra dos curvas separadas y tabla semanal con cambios numéricos/flechas respecto a la anterior semana con registros. Huecos sin datos no se dibujan como ceros ni se conectan con líneas; no se presentan como bajadas de rendimiento. En asistencia los colores invierten la evaluación de carga; las flechas siguen indicando el sentido numérico. Seis semanas recientes por defecto, ampliables, y resto de ejercicios plegados para lectura progresiva.
