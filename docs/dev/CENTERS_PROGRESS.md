# Registro de ejecución: módulo de centros

Última actualización: 13 de octubre de 2026.

## Punto de reanudación

- Trabajo actual autorizado: implementación en rama separada, avanzando por el roadmap hasta el límite solicitado del 20% restante de uso.
- Rama: `codex/centers-module`, creada desde `53ef0baf`. F0 y F1 implementadas y verificadas en entorno ficticio; pg instalado y PostgreSQL real de pruebas disponible.
- Guía: [CENTERS_ROADMAP.md](CENTERS_ROADMAP.md). Instrucciones: [AGENTS.md](../../AGENTS.md).
- Siguiente tarea: **C06**, esquema de negocio; después autorización/RLS y protección de referencias C07-C09.
- Último hito cerrado: infraestructura F1. La fase no incluye todavía CRUD de centros o cobros.
- Pruebas: 27 unitarias/contratos/empaquetado y 10 HTTP/regresión pertinentes pasan; 2 integraciones SQL+HTTP reales pasan también tras reiniciar PostgreSQL.

Este registro contiene el estado de ejecución; el roadmap define requisitos y dependencias. La autorización vigente siempre procede del usuario, no de una casilla de este archivo.

## Contexto previo que debe preservarse

El repositorio de la aplicación es `openGym/`, dentro del workspace exterior ft-gym. HEAD al preparar la guía: `775e1c11`; API/frontend declaran 1.4.1. Registrar nuevamente el HEAD al iniciar C00.

Había modificaciones previas en `.dockerignore`, `.gitignore`, `docs/diagrams/render.sh`, `web/05-check-base-path.sh`, `web/Dockerfile` y `website/build-images.sh`. También archivos locales de demo: `.env.demo.example`, `.gitattributes`, `compose.demo.yml`, `demo-pages/`, `docs/DEMO_LOCAL_PAGES.md` y scripts PowerShell. No son cambios realizados para implementar centros; no limpiarlos, revertirlos ni atribuirlos a este módulo.

La configuración Docker del repositorio separa `web` y `api`. En la sesión de análisis el comando docker no estaba disponible en PATH; el estado de contenedores ejecutándose no se pudo comprobar. Esto es una observación del entorno, no una prueba de que Docker no esté instalado en el equipo ni un bloqueo permanente de las tareas futuras.

En la preparación no se había medido una suite baseline; C00-C02 la midieron después (historial abajo). `.github/workflows/test.yml` no existe en esta copia. Gitea solo selecciona frontend/MCP; no se ha activado CI remota del fork.

## Tablero de tareas

Estados permitidos: `todo`, `in_progress`, `done`, `blocked`. Una tarea done necesita evidencia en el historial; una tarea blocked necesita motivo concreto y requisito de desbloqueo. El valor inicial todo no equivale a autorización para empezar.

| ID | Fase | Entrega abreviada | Estado |
|---|---|---|---|
| C00 | F0 | Baseline y entorno | done |
| C01 | F0 | Capacidades y políticas | done |
| C02 | F0 | Verificación y CI | done |
| C03 | F1 | Compose y PostgreSQL | done |
| C04 | F1 | pg, migraciones y roles SQL | done |
| C05 | F1 | Esqueleto, contratos y harness | done |
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
| Infraestructura | C03-C05 + módulo apagado/activo/SQL caído + empaquetado | verificado, target default |
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
| D00 | Mantener web/api y añadir PostgreSQL en el mismo Compose | implementada F1 | Overlay local y stack test independientes |
| D01 | Mantener inicialmente identidad/entrenamiento JSON | implementada F1 | C08 protege los futuros vínculos |
| D02 | Capacidades y defaults ficticios versionados; impuestos/precio/conservación aún sin aprobar para producción | contrato de desarrollo C01 | policies.js; no emisión monetaria ni suspensión automática todavía |
| D03 | Proveedores, credenciales y hardware | pendiente según integración | No necesarios para preparar MVP ficticio |

## Bloqueos técnicos e información pendiente

No existe bloqueo de Docker/SQL: Docker Desktop se localizó fuera de PATH y está operativo. Las suites generales tienen fallos previos documentados; no se han convertido en un bloqueo del módulo. Las decisiones comerciales pendientes solo afectan a sus tareas dependientes.

Formato para nuevas entradas: tarea, motivo, evidencia, trabajo independiente posible y condición de desbloqueo.

## Historial de ejecución

### 2026-10-13 · Preparación de documentación

- Alcance: roadmap de implementación y guía para Codex, sin integrar funcionalidades.
- Documentos creados: roadmap, registro de progreso e instrucciones AGENTS del repositorio y del workspace exterior. Índice de docs actualizado.
- Resultado funcional: ninguno; todas las Cxx continúan todo.
- Evidencia de documentación: referencias locales, IDs/dependencias y diff revisados en la sesión de creación.
- Siguiente paso: autorización futura de implementación y C00.

### 2026-10-13 · C00-C05 / F0-F1

- Alcance: implementación en rama separada, ampliado por el usuario para continuar fases hasta reservar el 20% del uso. Base `53ef0baf`; cambios previos conservados.
- Entorno: Node 24.20.0/npm 12 en Windows; Docker Desktop 29.8.2 encontrado en AppData/Local/Programs/DockerDesktop/resources/bin, fuera de PATH. Pruebas de imagen usan Node 22 Linux.
- C01: capacidades manager/trainer/member y plataforma separadas; defaults ficticios versionados en policies.js. Impuesto/precio y condiciones productivas siguen pendientes, sin bloquear infraestructura.
- C03-C05: overlay Compose, pg 8.23.1, roles separados, migración 001 con checksum/advisory lock, conexión lazy y endpoint status. Credenciales privilegiadas solo en .env.centers/interpolación, no en env_file runtime. Documentación de operación en CENTERS_DEVELOPMENT.md.
- Baseline API: 596 tests, 568 pass y 28 fail. Baseline frontend: 402 archivos, 387 pass/15 fail; 5055 tests, 5001 pass/54 fail. Se repitieron fuera del sandbox por errores EPERM de rename de temporales. Logs locales ignorados: baseline-api-unrestricted.log y baseline-frontend-unrestricted.log.
- Después de F1: API completa 622 tests, 595 pass/27 fail; comparación de nombres: ningún fallo nuevo. Corregido el scanner OpenAPI frente a CRLF, que era uno de los fallos previos. No se corrigieron fallos de Coach, filesystem/Windows o frontend ajenos al módulo.
- Verificación específica: 27/27 unitarias/contratos/COPY; 10/10 HTTP y sincronización personal; 2/2 integración PostgreSQL+HTTP reales. Repetición tras restart de centers-test-db: 2/2; versiones persistidas e idempotentes.
- SQL real: compose.centers.test.yml, proyecto ft-gym-centers-tests, sin puertos ni datos de la demo; RLS de tabla probe, rollback, rechazo de migrador runtime y recuperación de disponibilidad sin reiniciar API.
- Compose base+overlay validado con configuración ficticia y sin env_file real: red SQL privada, sin credenciales bootstrap/migrador en API. Imagen default construida y arrancada. Target Coach opcional no activado ni construido.
- Frontend build pasa; 18 locales/2258 claves y 1762 cadenas de fuente cubiertas. API docs generadas y --check pasa. MCP no modificado; no se instaló su runtime de tests aún.
- Estado: C00-C05 done; gate infraestructura verificado para target default. Módulo sin centros reales y apagado en despliegue habitual. Demo existente intacta.
- Siguiente: C06-C09; ningún permiso de gestión se concede hasta completar aislamiento y protección de cuentas.

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
