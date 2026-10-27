# Avisos de carga a partir de la sesión anterior

Implementación del 27 de octubre de 2026. Subida a main autorizada expresamente por el usuario tras disponer del entorno local de pruebas. Sin despliegue productivo.

## Regla acordada

El usuario confirmó que **basta una serie** por encima del máximo. El aviso se calcula por ejercicio al volver a entrenar la misma rutina, leyendo su última sesión que cuenta para progresión:

- A: una serie de trabajo prevista, marcada como realizada, supera estrictamente el máximo. Ejemplo 12–15: 16, 14, 13 → «En la sesión anterior superaste el rango de repeticiones establecido. Para esta sesión, sube la carga».
- B: una serie realizada queda por debajo del mínimo. Ejemplo 12–15: 15, 11, 13 → «En la sesión anterior no alcanzaste el rango de repeticiones establecido. Reduce la carga hasta poder completarlo».
- Si coinciden una serie por encima y otra por debajo, tiene prioridad reducir. Ejemplo: 16, 11, 13.
- Los límites son inclusivos: 12, 14, 15 no genera aviso. Se usa el rango configurado, no un umbral fijo de 15. Un objetivo fijo se interpreta como mínimo y máximo iguales.
- No hay un temporizador de 24 horas: se muestra al iniciar la siguiente sesión de esa rutina, aunque se pruebe el mismo día. Una nueva sesión guardada dentro del rango retira el aviso en la siguiente apertura.

El componente es informativo: no aplica cargas, no modifica rutinas y no reescribe historial. El motor de progresión automático existente sigue funcionando igual. Si hay este aviso se evita duplicar su texto con la explicación genérica de progresión; los ajustes siguen disponibles en el menú del ejercicio.

## Lectura del historial y límites

La búsqueda exige el mismo ejercicio y la misma rutina, incluidos días combinados y sesiones antiguas con routineIds/routineId. No toma como referencia otra rutina para suplir una primera sesión sin historial. Usa sessionHistory para no leer el futuro al registrar sesiones pasadas; no muestra el aviso al editar un entrenamiento guardado.

No cuenta calentamientos, series extra posteriores a las previstas, valores inválidos o repeticiones no registradas. Una serie sin completar no equivale a cero. Un cero realmente registrado y marcado sí está por debajo del mínimo. No se retrocede a un éxito antiguo si la última sesión coincidente no contiene resultados válidos.

En unilateral se compara cada lado con su rango; para recomendar subir basta una pareja completa con ambos lados por encima. Un lado realizado por debajo del mínimo puede indicar reducir. Se preserva la lectura de totales de formatos antiguos.

Se respetan exclusiones de progresión. Se omiten recomendaciones genéricas en cardio, duración, pirámides, asistencia, rest-pause y peso corporal sin carga añadida. Los totales de bloques rest-pause no se confunden con repeticiones de una serie convencional.

Si el snapshot del plan anterior muestra otro rango, el aviso se omite hasta tener una sesión del rango nuevo. En registros antiguos sin ese snapshot se compara con el rango disponible de la rutina actual. No se crea un campo persistente nuevo ni se necesita migración/API.

## Archivos principales

- `frontend/src/lib/rep-range-advice.js`: cálculo puro y lectura contextual del historial.
- `frontend/src/components/RepRangeNotice.jsx`: presentación compartida y accesible con role=note.
- `frontend/src/views/Workout.jsx` y `FocusView.jsx`: tarjetas, lista, compacto y foco.
- `frontend/src/index.css`: aviso con tokens existentes y contraste en claro/oscuro.
- Tres textos nuevos en los 18 idiomas existentes, con overrides explícitos de pt-BR.
- Tests puros y de UI en `rep-range-advice.test.js` y `Workout.rep-range-advice.test.jsx`.

## Pruebas manuales disponibles

Aplicación completa aislada: **http://localhost:5180/**. Usa solo cuentas y datos ficticios del sandbox documentado en EXERCISE_SANDBOX.md. Se ha reconstruido exclusivamente su frontend y conservado los datos del sandbox. No se usa el túnel público ni un backend productivo.

Prueba directa sin cuenta: **http://127.0.0.1:5182/__load-guidance**. Renderiza el componente Workout real y su diálogo de finalización. Los casos y el historial se mantienen únicamente en memoria. Botones: A, B, dentro del rango, mixto, sin historial y otra rutina. También permite alternar tema, anchura y modo de entrenamiento.

1. Seleccionar A: aparece el aviso de subir con 16, 14, 13.
2. Seleccionar B: aparece reducir con 15, 11, 13.
3. Seleccionar dentro del rango, sin historial u otra rutina: no hay aviso.
4. Introducir tus propias repeticiones y marcar las tres series. Finalizar desde el diálogo real, cerrar el resumen y pulsar «Preparar siguiente sesión». El aviso se recalcula con esa sesión recién guardada en memoria.
5. Comprobar tarjetas/lista/compacto/foco, tema claro/oscuro y móvil/escritorio. Recargar restablece la prueba ficticia.

Servidor y fixture manuales se encuentran fuera de Git, en `../informes/load-guidance-preview-server.mjs` y `load-guidance-preview.jsx`. Para relanzarlos: `node ../informes/load-guidance-preview-server.mjs`. No hay dependencia nueva en el producto.

## Verificación obtenida

- 37/37 pruebas nuevas: helper y cuatro modos de UI, incluidos mensajes en español y ausencia de mutaciones de cargas/historial.
- Revisión ampliada: 302/304 pruebas en 15 archivos. Los dos fallos de Workout.noprog.test.jsx se reprodujeron con Workout/FocusView originales de HEAD, mediante un plugin de prueba externo que no restaura ni modifica archivos de trabajo: expectativas 105 frente a 102,5 y 80 frente a 75. No se han corregido como parte de esta petición.
- pt-br-locale.test.js: dos fallos previos también reproducidos cargando pt.js/pt-BR.js de HEAD; fingerprint heredado y términos europeos anteriores. Las tres nuevas traducciones brasileñas son overrides y no cambian el fingerprint heredado. No se declara verde la suite global.
- `node scripts/check-locales.mjs`: 18 idiomas, 3097 claves sincronizadas.
- Build productivo Vite en la imagen web del sandbox correcto; se conservan avisos de imports dinámicos/tamaño de bundle.
- API, web y PostgreSQL ficticios saludables; health de 5180 y preview de 5182 responden 200.
- Navegador real: A/B a 390×844, claro/oscuro, foco y escritorio 1440×900. Flujo real de introducir 16/14/13, marcar series, finalizar, cerrar resumen e iniciar la siguiente sesión: aviso de subir verificado. Solo memoria ficticia, sin escrituras en cuentas reales.

Capturas, logs y JSON de resultados están fuera de Git en `../informes/load-guidance-*`. El usuario autoriza la subida a main; no se incluyen datos del sandbox, capturas ni fixtures manuales en el commit.
