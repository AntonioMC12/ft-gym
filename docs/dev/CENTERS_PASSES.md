# C38 — bonos de visitas y promociones

Implementación local con PostgreSQL, API node:http y controles React existentes. No autoriza actividad comercial real. Una promoción significa aquí un bono gratuito de entradas, con condiciones explícitas; no añade cupones ni un motor de descuentos.

## Condiciones y adquisición

El responsable/plataforma crea un producto con nombre, tipo (`paid`/`promotion`), entradas (1–1000), validez (1–3650 días), precio y criterio fiscal explícitos. EUR, céntimos exactos y redondeo compartido `splitTax`. No hay valores comerciales preseleccionados. Los términos son inmutables: cambiar precio/entradas/validez requiere otro producto. Archivar impide nuevas adquisiciones sin alterar las anteriores.

Desde la ficha de un socio activo se elige producto y fecha inicial, se obtiene una vista previa y se confirma su digest. Incluye actor, centro, revisión del socio, producto, fechas, día de negocio y cantidades; se recalcula bajo el lock del centro. El día inicial no puede ser anterior al actual. La fecha final es exclusiva: inicio + días naturales del centro. No prorroga automáticamente por pausas ni modifica/reactiva el contrato o la membresía principal.

Un bono de pago crea una adquisición y su recibo `concept=pass`, sin `subscription_id`, en una transacción con auditoría, outbox e idempotencia. FK diferida y trigger diferido aseguran el emparejamiento; otro recibo del socio no sirve. El trigger del recibo comprueba las cantidades contra los términos inmutables. Una promoción gratuita no genera recibo cero. El recibo no es factura fiscal (C39).

Se reutilizan pagos, aplicaciones, devoluciones y pago propio existentes. No hay saldo mutable paralelo ni un cargo de red en la adquisición. La disponibilidad exige el recibo íntegramente saldado por aplicaciones menos devoluciones. Una devolución con saldo positivo suspende las entradas sin usar hasta saldar de nuevo el recibo. **Las visitas consumidas nunca se restituyen automáticamente.** La revocación es un hecho append-only con motivo: impide usos posteriores, pero no anula deuda ni realiza una devolución. Si hace falta devolución, se registra expresamente mediante el ledger y su capacidad vigente.

## Entrada y consumo

`allowPasses` está desactivado inicialmente. La política debe permitirlo y el socio debe elegir expresamente el bono al generar su QR. Omitirlo conserva el acceso anterior y sus hashes de idempotencia. El QR sigue siendo opaco, válido45segundos, de un solo uso y ligado al centro, socio y cuenta actuales. Crear/mostrar/reintentar el QR no consume entradas.

Un bono elegido sustituye únicamente el requisito de suscripción vigente. Siguen comprobándose centro/membresía activos, vínculo, horario, bloqueo manual y política de deuda. Un bono inválido no provoca una vuelta silenciosa a la cuota. La decisión vuelve a leerse al escanear: caducidad, revocación, financiación y saldo no quedan congelados al emitir QR.

La visita validada inserta su consumo mediante trigger en la misma transacción. El ledger de consumos es append-only, con visita única y FK del mismo centro/socio/bono. El trigger adquiere el lock del centro y calcula el día con `clock_timestamp()` después de esperas; cuenta consumos visibles actuales y valida visita/token. No hay un contador que el cliente pueda editar ni funciones SECURITY DEFINER nuevas. Dos escaneos concurrentes no consumen dos veces el último crédito; un fallo posterior de auditoría revierte visita, token, consumo y clave del escaneo.

## Permisos, interfaz y endpoints

Catálogo: `plans.manage`; adquisición/revocación: `billing.manage`; ficha: `billing.read`. Plataforma solo por allowlist explícita y centro seleccionado. Listado propio resuelve el socio desde sesión y rechaza selectores de cuenta/socio. RLS limita productos a administración o productos ya adquiridos por el propio socio; adquisiciones/revocaciones/consumos a responsables o titular. No UPDATE/DELETE de adquisiciones ni consumos.

Controles reutilizados: Section/Row/Button, campos, SelectRow/Switch, confirmSheet, NavigationGuard y useAutoMore. Catálogo junto a cuotas; bonos en ficha del socio y área propia de acceso. Paginas reales de30, sin límite total fijo, tanto en catálogo como en selector. La confirmación muestra total exacto y fechas; cambios de borrador/centro invalidan confirmaciones. Cambiar el bono durante una petición oculta su QR tardío. El desglose del recibo muestra importes e impuestos, sin inventar prorrateo mensual.

- GET `/api/centers/passes/products`, POST `.../products/create` y `.../products/archive`.
- POST `/api/centers/passes/preview`, `.../purchase`, `.../revoke`.
- GET `/api/centers/passes?centerId&memberId&cursor` y `/api/centers/own/passes?centerId&cursor`.
- POST `/api/centers/own/access/token`: `passId` opcional explícito.
- Configuración de acceso: `allowPasses` opcional; ausente/false conserva contrato anterior.

Migraciones040/041. No habilitar políticas automáticamente al migrar. Validación técnica y revisión visual/operativa se registran separadamente en CENTERS_PROGRESS.md. C27 mantiene su gate sandbox real y C41 el de activación; esta entrega no los sustituye.
