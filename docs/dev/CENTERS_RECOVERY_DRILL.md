# Ensayo local de restauración C24

Este ensayo usa exclusivamente datos ficticios en dos PostgreSQL desechables y
directorios JSON temporales. No es un comando para restaurar una instalación real.
No utiliza `.env`, cuentas reales, volúmenes del módulo ni puertos publicados.

## Ejecutar

Desde la raíz de `openGym`, con Docker Desktop disponible:

```powershell
docker compose -f compose.centers.test.yml build centers-tests
docker compose -f compose.centers.recovery.yml build recovery-worker
docker compose -f compose.centers.recovery.yml run --rm recovery-worker
docker compose -f compose.centers.recovery.yml down
```

Los dos servidores de recuperación guardan PostgreSQL en `tmpfs`. Antes de repetir
el ensayo, ejecutar `down` **solo con `compose.centers.recovery.yml`** para obtener
un origen y un destino vacíos. No borrar el volumen de `compose.centers.test.yml`:
es independiente y puede contener la vista previa local.

## Qué comprueba

1. Aplica las migraciones del build a un origen marcado explícitamente como test.
2. Crea dos centros, responsables distintos y socios vinculados; registra cuotas,
   contratos, recibos, pagos manuales y una devolución ficticia. Guarda entrenamiento
   personal en JSON y comprueba el aislamiento de las cuentas.
3. Detiene la API de origen, único escritor de identidad/entrenamiento de este
   entorno. Copia su directorio JSON completo, incluida la identidad, el secreto y
   el marcador duradero `centers-attached`; después genera el archivo PostgreSQL.
   La parada coordinada evita mezclar versiones JSON y SQL de escritores activos.
4. Registra un manifiesto SHA-256 de todos los archivos y checksums de migraciones.
   Rechaza alteraciones del archivo SQL o un manifiesto de otro build.
5. Restaura transaccionalmente sobre el destino vacío y marcado como test, con el
   rol migrador. No usa `--clean` ni `CASCADE`; rechaza un destino ya poblado.
6. Compara todas las filas de todas las tablas de centros, sin convertir enteros
   monetarios a números JavaScript. Verifica migraciones, referencias JSON-SQL,
   identidades de responsables y el marcador de protección de cuentas.
7. Arranca la API con la copia restaurada: área propia y entrenamiento conservan
   sus respuestas; otro centro sigue inaccesible; repetir un pago no lo duplica;
   no se permite borrar una cuenta vinculada ni modificar recibos desde el runtime.
8. Conserva una reserva Stripe y notificación firmada pendientes, sin liquidarlas
   por restaurar. Conserva una propuesta de entrenamiento aceptada sin acuse y
   permite completar su importación personal después de sincronizar.
9. Incluye política de acceso, dispositivo, visita y QR pendiente, además de un
   bloqueo manual independiente. El nuevo arranque invalida los QR anteriores
   aunque aún estuvieran en plazo; repetir un escaneo registrado nunca readmite.
   Un QR nuevo funciona con la sesión/dispositivo restaurados y el bloqueo manual
   sigue presente. Estas pruebas no activan infraestructura física ni producción.

La copia usa `pg_dump --format=custom --exclude-schema=public` en una base dedicada
que solo contiene centros y el marcador de ensayo en `public`. Así incluye la
extensión `btree_gist`, necesaria para impedir contratos solapados. Seleccionar
únicamente `--schema=centers` omite la definición de la extensión y rompe esa
restricción al restaurar. El destino conserva su propio marcador independiente.

## Límites operativos

Las credenciales del Compose son ficticias y exclusivas de estos contenedores.
Los helpers rechazan otros hosts, bases o roles y exigen un marcador SQL externo
al archivo restaurado. El archivo y los secretos temporales se eliminan al acabar;
no se publican ni se añaden a Git. Un hash detecta alteraciones, pero no autentica
un archivo de procedencia desconocida: nunca restaurar un dump no confiable.

C24 demuestra el recorrido de recuperación inicial y el gate MVP de ensayo.
C40 debe concretar retención, cifrado, custodia de claves, ventanas de parada,
RPO/RTO, selección de una copia confiable, restauración desde cero de infraestructura
y comprobaciones operativas de una instalación real. C41 exige su propia
autorización de activación. Este procedimiento no realiza cobros ni envía mensajes.
