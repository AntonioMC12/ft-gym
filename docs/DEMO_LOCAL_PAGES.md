# Demo local con Docker y entrada desde GitHub Pages

La portada de GitHub Pages enlaza a la aplicación completa, ejecutada en Docker en tu equipo y accesible por un túnel HTTPS temporal. Pages no aloja la API y no recibe cuentas ni entrenamientos. No se incrusta la aplicación en un iframe: el botón abre la aplicación en su propio origen, manteniendo su autenticación y protección CSRF.

## 1. Preparar Docker

Instala [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) y arráncalo con contenedores Linux. Desde la carpeta `openGym`:

```powershell
.\scripts\Start-LocalDemo.ps1
```

Construye tu código, sin descargar imágenes oficiales de openGym. La interfaz queda en `http://localhost:8088`, publicada solo en el equipo local. El puerto no interfiere con el desarrollo en `5173`. La API no publica un puerto al host.

Abre la interfaz, elige **Crear perfil nuevo** y selecciona **Contraseña**. El primer perfil será administrador. Usa una contraseña nueva: el volumen de la demo empieza vacío y no comparte la cuenta de la instalación habitual.

Los datos se guardan en el volumen `ft-gym-demo_demo-data`, separado de `./data`. El entrenador de IA está deshabilitado. Utiliza datos ficticios.

## 2. Compartir la demo por HTTPS

```powershell
.\scripts\Share-LocalDemo.ps1
```

El script comprueba que existe un administrador, cierra el registro mediante invitaciones, inicia el túnel, obtiene su URL y configura `ORIGIN` y `RP_ID`. También prepara la portada en `.demo-pages/`. No publica nada en GitHub.

Cualquiera con la URL puede abrir la pantalla de acceso y probar en modo invitado, cuyos datos se guardan en su navegador. Las cuentas del servidor requieren autenticación; las nuevas cuentas requieren una invitación del administrador. No compartas tu cuenta administradora.

Si quieres una cuenta de prueba, inicia sesión en la URL pública, crea un código de invitación en el panel de administración y registra un perfil de prueba con contraseña desde otro navegador.

El túnel gratuito no necesita cuenta de Cloudflare ni dominio. Su URL cambia al recrearlo y deja de funcionar cuando lo detienes. Usa contraseñas en las cuentas de prueba: las passkeys dependen del hostname y no migran a la siguiente URL temporal. Es una solución de demostración, sin garantía de disponibilidad.

## 3. Publicar solo la portada en GitHub Pages

La primera vez, después de compartir la demo:

```powershell
Push-Location .demo-pages
git init -b gh-pages
git remote add origin https://github.com/AntonioMC12/ft-gym.git
git add index.html icon.png config.json .nojekyll
git commit -m "Publish demo entry page"
git push -u origin gh-pages
Pop-Location
```

Estos comandos están pensados para la primera publicación, cuando `gh-pages` aún no existe. Si esa rama ya tiene contenido remoto, integrarlo antes de publicar; no utilizar `--force`.

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → gh-pages → /(root) → Save**.

La portada quedará en `https://antoniomc12.github.io/ft-gym/`. Su botón llevará a la URL del túnel. GitHub Pages ejecuta su propio proceso de publicación incluso usando una rama; esto no restaura ninguno de los workflows heredados archivados.

Cada vez que recrees el túnel, vuelve a ejecutar `Share-LocalDemo.ps1` y publica la nueva dirección:

```powershell
Push-Location .demo-pages
git add index.html icon.png config.json .nojekyll
git commit -m "Update demo address"
git push origin gh-pages
Pop-Location
```

Si usas un túnel con dominio estable, puedes preparar la misma portada con:

```powershell
.\scripts\Prepare-DemoPages.ps1 -DemoUrl https://demo.tudominio.es
```

## 4. Comprobar y detener

```powershell
docker compose --env-file .env.demo -f compose.demo.yml ps
docker compose --env-file .env.demo -f compose.demo.yml logs --tail 50 api web
Invoke-RestMethod http://localhost:8088/api/health
# Cierra solo el acceso público:
docker compose --env-file .env.demo -f compose.demo.yml stop tunnel
# Detiene toda la demo, conservando los datos:
docker compose --env-file .env.demo -f compose.demo.yml down
```

No usar `down -v` para una parada normal: eliminaría el volumen con las cuentas y datos de prueba. La portada seguirá publicada si el equipo se apaga, pero la aplicación enlazada no estará disponible.

Los cambios de código requieren reconstruir con `Start-LocalDemo.ps1`; ese script cierra el túnel anterior para volver al modo local. Después, comparte de nuevo y actualiza la portada. Las automatizaciones de `main` siguen desactivadas.

La licencia de las imágenes de ejercicios sigue siendo independiente de la AGPL: revisar `NOTICE.md` antes de mostrar públicamente una adaptación comercial con esos recursos.

Referencias: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [fuente de publicación de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
