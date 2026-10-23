# C70 · Sandbox local de ejercicios

Instalación ficticia independiente para preparar las pruebas de C69. No implementa todavía el catálogo compartido ni el sello FT Training.

## Uso en este equipo Windows

Con Docker Desktop iniciado, ejecutar desde openGym con PowerShell 7:

```powershell
./scripts/Start-ExerciseSandbox.ps1
```

Abrir http://localhost:5180. Entrar con **DNI/NIE**, no con el nombre:

| Cuenta ficticia | Documento sintético de prueba | Contraseña inicial |
| --- | --- | --- |
| Plataforma Centros · superadmin | 00000000T | Centros-Pruebas-2026! |
| Alba Pruebas · usuaria normal | 00000001R | Centros-Pruebas-2026! |
| Bruno Pruebas · usuario normal | 00000002W | Centros-Pruebas-2026! |

Son identificadores y credenciales ficticios, exclusivos del sandbox. No copiarlos a producción. El bootstrap existente también conserva las identidades internas Responsable Pruebas/Entrenador Pruebas; las tres cuentas de la tabla son las preparadas para entrenar.

Cada cuenta tiene una rutina, planificación lunes/miércoles/viernes, doce sesiones de las semanas anteriores al primer arranque y un ejercicio personalizado privado. Alba y Bruno están vinculados como socios a un centro ficticio, con cuota anual de importe cero para permitir probar la aplicación sin registrar pagos. Ninguno tiene permisos administrativos. El superadmin tiene «Prueba FT · Curl en polea», candidato para publicar cuando se implemente C69; ahora sigue siendo privado.

Las subidas de fotos y vídeos están habilitadas dentro de los límites habituales de la API. No se incluyen vídeos privados ni archivos procedentes del VPS.

Para comprobar el estado inicial:

```powershell
node scripts/Test-ExerciseSandbox.mjs
```

Este smoke inicia y cierra sesiones de las tres cuentas, comprueba rol/acceso, rutinas e historial y sube una imagen PNG sintética mínima para verificar el aislamiento multimedia. Deja ese archivo local sin referencia; no sobrescribe entrenamientos. Si cambias las credenciales o borras fixtures manualmente, sus expectativas iniciales pueden dejar de cumplirse.

Para parar conservando datos:

```powershell
./scripts/Start-ExerciseSandbox.ps1 -Stop
```

Para arrancar con las mismas imágenes, sin reconstruir:

```powershell
./scripts/Start-ExerciseSandbox.ps1 -NoBuild
```

Los datos existentes no se reinician al arrancar: el seed crea únicamente cuentas/afiliaciones/contratos/archivos ausentes y conserva contraseñas, rutinas e historiales existentes. No hay comando de borrado automático. Para reiniciar completamente datos se deberá preparar una operación separada y específica con backup; no reutilizar `down -v`, `git clean` ni limpiezas globales.

## Aislamiento y Git

- Proyecto Docker fijo `ft-gym-exercises-local`; único Compose `compose.exercises.local.yml`. No se carga el Compose productivo ni el `.env` del checkout.
- Lanzador exclusivo de Docker Desktop local: verifica el named pipe de `desktop-linux` y usa ese contexto explícitamente en todos los comandos. No permite seleccionar un VPS.
- Puerto web únicamente en loopback `127.0.0.1:5180`; no se crea túnel. API y PostgreSQL no publican puertos y usan red interna.
- Base exclusiva `ft_gym_exercises_centers_test`; volumen `ft-gym-exercises-local_exercises-local-db`, separado de preview, CI y producción.
- Archivos de cuentas, estados, secretos y uploads en `../informes/exercises-local-data/`, fuera del repositorio. El archivo de entorno del lanzador está en `../informes/exercises-local.env`.
- Bootstrap comprueba flag, origen, ruta y host/base/roles exactos; el inicializador comprueba el marcador SQL `test`. Las suites ordinarias rechazan este destino persistente.
- Jobs/mantenimiento, Coach y perfiles de correo/pagos están desactivados; notificaciones de centros configuradas para captura de prueba. La API no tiene salida externa por su red interna.
- El target productivo `default` no incluye los entrypoints de fixtures; estos solo se copian en `centers-preview`.
- Git transporta configuración, scripts y tests reproducibles. Las cuentas, entrenamientos, imágenes subidas, secretos y el volumen SQL no se transportan por un commit/push. No se ha modificado ni desplegado el VPS.
- Usar un perfil de navegador dedicado a pruebas locales. Los puertos separan el almacenamiento web, pero las cookies de localhost pueden compartirse entre puertos: evitar usar simultáneamente otras previews en ese mismo perfil.

La funcionalidad de ejercicios compartidos sigue pendiente: antes de C69, un ejercicio privado del superadmin NO debe aparecer en Alba o Bruno. Después de implementarlo se verificará publicación, filtro FT Training, uso en rutina/sesión/historial, archivo y sincronización con estas mismas cuentas.
