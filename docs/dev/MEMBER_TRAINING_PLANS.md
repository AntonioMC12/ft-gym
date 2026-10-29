# Planes del socio (29 octubre 2026)

Implementación local, sin publicación ni migración sobre datos reales.

## Persistencia y migración

Se reutilizan trainingPlans por ID, routine.planId, routineOrder y el sincronizado existente por clave. archivedAt (milisegundos o null) es personal y no concede permisos. No requiere migración SQL. Se conserva week, dayPlan, rotation y las sesiones al archivar. Las consultas de pendientes excluyen las rutinas archivadas; reactivar devuelve su programación. Las sesiones nuevas conservan un snapshot del nombre e ID del plan al iniciarse y al finalizar.

Al entrar en Mis planes se recuperan únicamente vínculos ausentes acreditados por planDeliveries (mapas de IDs de entregas aceptadas). Se conserva el nombre ya disponible; cuando solo queda el mapa se usa Plan asignado y su aceptación. No se copian rutinas ni se interpretan nombres. Una desvinculación explícita guarda planId null para no deshacerla durante la recuperación. Las referencias desconocidas quedan en Rutinas sin plan.

## Asignaciones y permisos

Se conserva la aceptación explícita, copias personales independientes, IDs estables por entrega, reintento y semántica de nuevas revisiones. No se edita la plantilla del entrenador desde el socio. Se corrige la colisión por nombres iguales de dos entregas: el contenedor usa la identidad de entrega. El envío habitual mantiene deduplicación de contenido. La opción explícita newAssignment crea una asignación independiente incluso con el mismo contenido; mantiene autorización y deduplicación transaccional por requestId. Cada aceptación se distingue por fecha/hora. No se archiva el anterior automáticamente; el detalle ofrece Archivar un plan anterior.

Quitar rutina del plan solo cambia su vínculo. Archivar solo cambia visibilidad de pendientes. Eliminar conserva su alcance previo y su deshacer; no se incorporan nuevas capacidades administrativas. El archivo personal es independiente de la retirada de asignaciones por plataforma.

## Comprobaciones manuales pendientes

1. Asignar y aceptar dos planes: ver dos tarjetas y abrir exclusivamente sus rutinas. Repetir clic y reintentar entrega sin duplicados.
2. Reasignar intencionadamente el mismo plan con la nueva opción: comprobar segunda tarjeta con aceptación distinta.
3. Crear plan y rutina, añadir rutina sin plan, reordenar, quitar vínculo y recargar. Comprobar que no vuelve automáticamente al plan anterior.
4. Programar rutinas de dos planes el mismo día: identificar cada plan en Horario y Empezar; iniciar y finalizar, conservando contexto e historial.
5. Archivar y recargar: desaparece de pendientes y sigue consultable. Reactivar recupera programación. Repetir con rotación y sesión en curso.
6. Datos antiguos con/sin mapa de entrega, plan vacío, selección inexistente, teclado y tamaños móvil/escritorio. Verificar contraste, foco y contenido plegado.

## Validación

Build de Vite y node --check del servicio de propuestas correctos. git diff --check correcto. Avisos de Vite sobre tamaño de chunks e imports dinámicos. Sin pruebas automatizadas nuevas ni ejecución de suites, por instrucción expresa. Revisión funcional y visual pendiente; no se proporcionó captura adjunta en este turno.
