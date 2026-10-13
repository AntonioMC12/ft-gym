# Automatizaciones heredadas desactivadas

El 13 de octubre de 2026 se archivaron las automatizaciones del proyecto original a petición del propietario de ft-gym.

Los archivos de esta carpeta no son workflows activos de GitHub Actions. No ejecutan pruebas, publican imágenes Docker, despliegan Pages, replican a GitLab ni solicitan firmas del CLA. La configuración de Dependabot también está archivada y Renovate está deshabilitado.

Antes de recuperar una automatización, revisar sus destinos, permisos y secretos para Fernando Tienda Training. Para activarla, mover solo el archivo elegido a `.github/workflows/` y configurar sus disparadores. No restaurar el mirror al repositorio original.

Este cambio no elimina ejecuciones históricas ni desactiva las alertas de seguridad propias de GitHub.
