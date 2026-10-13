# Registro de ejecución: módulo de centros

Última actualización: 13 de octubre de 2026.

## Punto de reanudación

- Trabajo actual autorizado: crear el roadmap y las instrucciones de trabajo. Completado como documentación.
- Implementación: no iniciada. No se ha instalado pg, creado PostgreSQL, modificado código de aplicación ni ejecutado migraciones.
- Guía: [CENTERS_ROADMAP.md](CENTERS_ROADMAP.md). Instrucciones: [AGENTS.md](../../AGENTS.md).
- Siguiente tarea cuando se autorice implementar: **C00**, registrar baseline y entorno; después C01-C02 y las tareas alcanzables de F1.
- Último hito de implementación cerrado: ninguno.
- Pruebas funcionales de la integración: `not_run`; todavía no existe funcionalidad que validar.

Este registro contiene el estado de ejecución; el roadmap define requisitos y dependencias. La autorización vigente siempre procede del usuario, no de una casilla de este archivo.

## Contexto previo que debe preservarse

El repositorio de la aplicación es `openGym/`, dentro del workspace exterior ft-gym. HEAD al preparar la guía: `775e1c11`; API/frontend declaran 1.4.1. Registrar nuevamente el HEAD al iniciar C00.

Había modificaciones previas en `.dockerignore`, `.gitignore`, `docs/diagrams/render.sh`, `web/05-check-base-path.sh`, `web/Dockerfile` y `website/build-images.sh`. También archivos locales de demo: `.env.demo.example`, `.gitattributes`, `compose.demo.yml`, `demo-pages/`, `docs/DEMO_LOCAL_PAGES.md` y scripts PowerShell. No son cambios realizados para implementar centros; no limpiarlos, revertirlos ni atribuirlos a este módulo.

La configuración Docker del repositorio separa `web` y `api`. En la sesión de análisis el comando docker no estaba disponible en PATH; el estado de contenedores ejecutándose no se pudo comprobar. Esto es una observación del entorno, no una prueba de que Docker no esté instalado en el equipo ni un bloqueo permanente de las tareas futuras.

No se ha medido una suite baseline. `.github/workflows/test.yml` no existe en esta copia; hay configuración en `.gitea/` y `.gitlab-ci.yml`. La CI efectiva y sus permisos deben verificarse en C02.

## Tablero de tareas

Estados permitidos: `todo`, `in_progress`, `done`, `blocked`. Una tarea done necesita evidencia en el historial; una tarea blocked necesita motivo concreto y requisito de desbloqueo. El valor inicial todo no equivale a autorización para empezar.

| ID | Fase | Entrega abreviada | Estado |
|---|---|---|---|
| C00 | F0 | Baseline y entorno | todo |
| C01 | F0 | Capacidades y políticas | todo |
| C02 | F0 | Verificación y CI | todo |
| C03 | F1 | Compose y PostgreSQL | todo |
| C04 | F1 | pg, migraciones y roles SQL | todo |
| C05 | F1 | Esqueleto, contratos y harness | todo |
| C06 | F2 | Esquema inicial | todo |
| C07 | F2 | Authz, RLS y DTO | todo |
| C08 | F2 | Referencias JSON-SQL y borrado | todo |
| C09 | F2 | Admin técnico y superadmin | todo |
| C10 | F3 | Bootstrap y centros | todo |
| C11 | F3 | Roles y responsables | todo |
| C12 | F3 | UI de plataforma | todo |
| C13 | F4 | Alta y ficha de socio | todo |
| C14 | F4 | Baja/pausa contractual | todo |
| C15 | F4 | Invitaciones y vinculación | todo |
| C16 | F5 | Cuotas versionadas | todo |
| C17 | F5 | Suscripciones | todo |
| C18 | F5 | Cálculo económico | todo |
| C19 | F6 | Recibos idempotentes | todo |
| C20 | F6 | Pagos y aplicaciones | todo |
| C21 | F6 | Deuda y calendario | todo |
| C22 | F6 | Área del socio | todo |
| C23 | F7 | Navegación/contexto | todo |
| C24 | F7 | Piloto MVP y restauración | todo |
| C25 | F8 | Jobs y outbox | todo |
| C26 | F8 | Email y avisos | todo |
| C27 | F9 | Stripe | todo |
| C28 | F9 | SEPA | todo |
| C29 | F10 | Propuestas de rutinas | todo |
| C30 | F10 | Progreso compartido | todo |
| C31 | F11 | QR y visitas | todo |
| C32 | F11 | KPI | todo |
| C33 | F11 | Riesgo de baja | todo |
| C34 | F12 | Clases y reservas | todo |
| C35 | F12 | Alta pública | todo |
| C36 | F12 | CSV | todo |
| C37 | F12 | Solicitud de congelación | todo |
| C38 | F12 | Bonos/promociones | todo |
| C39 | F12 | Facturas y fiscalidad | todo |
| C40 | F13 | Operación y reversión | todo |
| C41 | F13 | Activación gradual | todo |
| C42 | F13 | Aceptación/documentación | todo |

## Gates de entrega

| Gate | Condiciones | Estado |
|---|---|---|
| Infraestructura | C03-C05 + módulo apagado/activo/SQL caído + empaquetado | pendiente |
| Aislamiento | C06-C09 + RLS real, revocación y protección de identidad | pendiente |
| MVP de ensayo | C00-C24 + recorrido completo, suites/build y restore | pendiente |
| Cobros automáticos | C25-C28 según pasarela + sandbox y conciliación | pendiente |
| Entrenador | C29-C30 + convergencia y privacidad | pendiente |
| Acceso/retención | C31-C33 + validación física y métricas | pendiente |
| Crecimiento | C34-C39 según alcance + gates específicos | pendiente |
| Activación MVP real | C40-C41 + gate MVP + políticas/configuración + autorización | pendiente |
| Módulo completo | C00-C42 y CU-01..CU-16 con evidencia | pendiente |

## Decisiones en ejecución

Registrar únicamente decisiones tomadas y supuestos adoptados, con alcance y momento de revisión. Las propuestas iniciales están en la sección 4 del roadmap y aún no son condiciones comerciales aprobadas.

| ID | Decisión | Estado | Evidencia/impacto |
|---|---|---|---|
| D00 | Mantener web/api y añadir PostgreSQL en el mismo Compose | propuesta técnica del roadmap | Sin implementación |
| D01 | Mantener inicialmente identidad/entrenamiento JSON | propuesta técnica del roadmap | Requiere C08 y backup conjunto |
| D02 | Políticas económicas, acceso y conservación | pendiente de concretar durante C01 | Bloquean solo las tareas que las necesiten |
| D03 | Proveedores, credenciales y hardware | pendiente según integración | No necesarios para preparar MVP ficticio |

## Bloqueos técnicos e información pendiente

No se ha intentado implementar ninguna tarea. No existe todavía un bloqueo de ejecución comprobado. Consultar la tabla de decisiones del roadmap cuando una tarea lo necesite; no tratar toda la implementación como bloqueada por proveedores de fases futuras.

Formato para nuevas entradas: tarea, motivo, evidencia, trabajo independiente posible y condición de desbloqueo.

## Historial de ejecución

### 2026-10-13 · Preparación de documentación

- Alcance: roadmap de implementación y guía para Codex, sin integrar funcionalidades.
- Documentos creados: roadmap, registro de progreso e instrucciones AGENTS del repositorio y del workspace exterior. Índice de docs actualizado.
- Resultado funcional: ninguno; todas las Cxx continúan todo.
- Evidencia de documentación: referencias locales, IDs/dependencias y diff revisados en la sesión de creación.
- Siguiente paso: autorización futura de implementación y C00.

### Plantilla de entrada futura

Copiar esta plantilla al ejecutar una tarea; no completar sus valores con resultados supuestos.

```text
Fecha y tarea(s):
Alcance autorizado:
Baseline (HEAD y cambios previos pertinentes):
Resultado y archivos modificados:
Decisiones/supuestos y motivo:
Comandos de verificación (cwd, comando, resultado, duración si útil):
SQL/Docker real o mocks utilizados:
Regresiones/fallos previos y evidencia:
Comprobaciones not_run y motivo:
Criterios de cierre cumplidos/pendientes:
Estado final de cada tarea:
Cambios incompatibles y reversión, si existen:
Siguiente tarea alcanzable y dependencias:
```

No guardar credenciales, bodies privados, volcados de socios, IBAN, tarjetas o resultados de docker compose config con secretos. Para reanudar, basta este registro y las secciones pertinentes del roadmap; las pruebas ejecutadas deben poder localizarse en el repositorio o repetirse en un entorno aislado.
