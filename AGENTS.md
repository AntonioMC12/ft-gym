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
- Una propuesta de entrenador se acepta mediante el flujo personal; no sobrescribir archivos de estado desde gestión. Preservar entrenamiento en curso, unidades y convergencia entre dispositivos.

## Verificación y operación

Los comandos actuales y los futuros se distinguen en el roadmap. Ejecutar tests pertinentes por tarea; suites completas y builds al cerrar cada hito. Usar PostgreSQL real aislado para probar RLS, restricciones y concurrencia. No sustituir esas pruebas por mocks ni omitirlas silenciosamente.

Textos nuevos usan i18n y locales existentes. La lógica de entrenamiento debe vivir en helpers de `frontend/src/lib/` con tests cercanos. No alterar recursos generados o multimedia del catálogo al implementar gestión.

## Preferencia de reutilización del usuario

En las siguientes iteraciones y sesiones, revisar los componentes existentes antes de crear controles o layouts de centros. Reutilizar ui.jsx (Button, campos, SearchField, Switch, Section/Row, SelectRow, Segmented y Check), confirmSheet y useUI.toast. Para listas extensas, adaptar el patrón de auditoría de Admin y useAutoMore con paginación real en API. Conservar tokens CSS e i18n. Extraer componentes internos solo cuando tengan un segundo uso concreto; no copiar acciones globales de Admin al ámbito de centros.

Mantener useCenters en memoria y separado de S. Los helpers de presentación de fechas son reutilizables; dinero, vencimientos, permisos y acceso QR necesitan dominio propio. Esta preferencia fue indicada expresamente por el usuario el 13 de octubre de 2026; no autoriza despliegues ni operaciones productivas.

No ejecutar tests contra datos reales ni copiar secretos a informes. No usar `compose.demo.yml` como producción. Antes de cobros reales, despliegues o migraciones sobre datos reales, comprobar que están autorizados y que se cumplen los criterios operativos del roadmap. La guía no añade confirmaciones para desarrollo local reversible ya autorizado.

## Referencias

Consultar `CONTRIBUTING.md` para estilo y contribución; `CLAUDE.md` como contexto contrastado con código. Guía oficial del mecanismo AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md.
